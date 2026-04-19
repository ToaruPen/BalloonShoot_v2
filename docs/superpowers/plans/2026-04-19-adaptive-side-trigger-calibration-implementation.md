# Adaptive Side-Trigger Calibration 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Side-camera trigger を子どもや成人を含む幅広いユーザの可動域に自動追従させる runtime adaptive calibration を導入し、現地テストで未発火だった問題を解消する（Phase 1 r8: replay gate `≥ 19` commits）。

**Architecture:** 既存 `createSideTriggerMapper` は無変更のまま、純粋 reducer + wrapper mapper を新設して calibration を side-channel observer から供給する。`pulled` と `open` の両方を sliding-window configured percentile（default p20/p80）で適応し、thumb closure metric は default `thumbTip-middleMcp`、`middleMcp` 欠損時 `thumbTip-indexMcp` fallback とする。

**Tech Stack:** TypeScript 6 + Vite + Vitest + MediaPipe HandLandmarker。pure functional FSM、ESLint boundaries、knip。

**Source of truth:** `docs/superpowers/specs/2026-04-19-adaptive-side-trigger-calibration-design.md`（改訂 r8）を最終仕様とする。本プランと spec が衝突した場合は spec を優先し、本プランを後追い更新する。

---

## 1. Pre-flight checks

実装開始前に main の状態と既存契約を確認する。

- `git rev-parse --short HEAD` が spec commit `a06e52e` を含む main にいること
- `package.json` の `check` script が `lint`, `typecheck`, `test`, `test:replay`, `knip` を並列実行する（`package.json:19`）
- `tests/replay/**/*.test.ts` が `vitest.replay.config.ts` で include されている
- 既存ファイル状態：
  - `src/shared/types/hand.ts:16` — `HandLandmarkSet` は wrist, thumbIp, thumbTip, indexMcp, indexTip, middleTip, ringTip, pinkyTip の 8 点。`middleMcp`/`pinkyMcp` 不在
  - `src/features/hand-tracking/createMediaPipeHandTracker.ts:43` — `HAND_LANDMARK_INDEX` も同 8 点を抽出
  - `src/features/side-trigger/sideTriggerConstants.ts` — `DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0`, `DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE = 1.2` 既存（無変更で残す）
  - `src/features/side-trigger/sideTriggerEvidence.ts` — `extractSideTriggerEvidence` (公開) と private `computeScalars`。`normalizedThumbDistance` 計算は内部関数
  - `src/features/side-trigger/createSideTriggerMapper.ts:103-162` — sourceKey 変化で FSM reset、calibration を update ごとに受領
  - `src/features/diagnostic-workbench/liveLandmarkInspection.ts:443-475, :748-770` — side branch の per-frame 更新と `resetTrackingState`
  - `src/app/balloonGameRuntime.ts:438` — 現状 `defaultSideTriggerCalibration` を直接渡す
  - `src/app/balloonGameRuntime.ts:719-723` — `retry()` で `sideTriggerMapper.reset()` を呼ぶ
  - `src/features/diagnostic-workbench/recording/telemetryFrame.ts:26-55` — `TelemetryFrameSchemaVersion = 1`
  - `src/features/diagnostic-workbench/workbenchInspectionState.ts:35-37` — 既存 `sideTriggerTelemetry`, `sideTriggerCalibration` フィールド
- 既存 telemetry capture：`iterations/telemetry-2026-04-19T05-00-33-702Z.json` がローカルに存在する（gitignored）。Task 10 では fixture を git に置かず、この gitignored capture を直接読み、不在時は test を skip する
- ブランチ命名：`codex/adaptive-thumb-closure-middlemcp` を作成して作業

---

## 2. Numbered implementation steps

各タスクは TDD（red → green → refactor → commit）で実装する。テストを先に書き、失敗を確認してから実装する。タスク内のファイルは互いに小さい責務単位で分割する。コミットはタスク末で 1 回が原則。Task 10 の replay test を最後に動かして全体を統合検証する。

### Task 1: 必須 landmarks (`middleMcp` / `pinkyMcp`) を optional 追加

**Scope:** `~≤1h`

**Files**

- Modify: `src/shared/types/hand.ts`
- Modify: `src/features/hand-tracking/createMediaPipeHandTracker.ts`
- Modify: tests for `createMediaPipeHandTracker` (もしあれば)
- Modify: 既存 fixtures が `HandLandmarkSet` を構築している場合、optional フィールドのため変更不要（そのまま）

**Implementation**

- `HandLandmarkSet` に optional フィールドを追加：

  ```ts
  export interface HandLandmarkSet {
    wrist: Point3D;
    indexTip: Point3D;
    indexMcp: Point3D;
    thumbTip: Point3D;
    thumbIp: Point3D;
    middleTip: Point3D;
    middleMcp?: Point3D; // 新規 (optional, 旧 telemetry 互換)
    ringTip: Point3D;
    pinkyTip: Point3D;
    pinkyMcp?: Point3D; // 新規 (optional, 旧 telemetry 互換)
  }
  ```

- `HAND_LANDMARK_INDEX` に追加（新規 detection は常に値を持つ）：

  ```ts
  const HAND_LANDMARK_INDEX = {
    wrist: 0,
    thumbIp: 3,
    thumbTip: 4,
    indexMcp: 5,
    indexTip: 8,
    middleMcp: 9, // 新規
    middleTip: 12,
    ringTip: 16,
    pinkyMcp: 17, // 新規
    pinkyTip: 20
  } as const;
  ```

- `TrackedLandmarkName` / `TRACKED_LANDMARK_NAMES` / filter wiring は既存パターンを踏襲（`HAND_LANDMARK_INDEX` から自動派生している場合は変更不要）

**Test plan**

- 既存 `createMediaPipeHandTracker` テストが pass する（パターン無変更）
- 追加：landmark 抽出テストに `middleMcp`, `pinkyMcp` の値が含まれることを assert（既存 fixture に該当 index データがあれば）
- 追加：`HandLandmarkSet` の type test — optional フィールド不在の object も合法であることを TypeScript で確認（コンパイル通過）

**Dependencies**

- なし（最初のタスク）

**Commit**

- `feat(types): add optional middleMcp/pinkyMcp to HandLandmarkSet`

---

### Task 2: 適応 calibration 用初期値定数を追加

**Scope:** `~≤30min`

**Files**

- Modify: `src/features/side-trigger/sideTriggerConstants.ts`

**Implementation**

既存 `DEFAULT_*` 定数は数式 anchor として温存し、別名で初期値を追加：

```ts
/**
 * Adaptive calibration が起動直後に使う暫定 pulled 距離。
 * DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE (= 0) は computeScalars の anchor として温存し、
 * これは createAdaptiveSideTriggerMapper の initial calibration で使う独立の値。
 */
export const INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0.2;

/**
 * Adaptive calibration が起動直後に使う暫定 open 距離。
 * DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE (= 1.2) と同値だが、用途が異なるため別名で公開する。
 */
export const INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE = 1.2;
```

**Test plan**

- 既存テスト pass
- 既存 `defaultSideTriggerCalibration` が `DEFAULT_*` を参照し続けることを確認（`sideTriggerCalibration.test.ts` 既存）

**Dependencies**

- なし

**Commit**

- `feat(side-trigger): add INITIAL_* constants for adaptive calibration`

---

### Task 3: Raw metric helper (`extractSideTriggerRawMetric`)

**Scope:** `~≤2h`

**Files**

- Create: `src/features/side-trigger/sideTriggerRawMetric.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerRawMetric.test.ts`
- Modify: `src/features/side-trigger/sideTriggerEvidence.ts` — private 計算ロジックの一部を extractor から再利用するため、必要なら helper を非 export 関数として分離（公開 API 不変）
- Modify: `src/features/side-trigger/index.ts` — 新規型と関数を export

**Implementation**

型と関数は spec の主要型シグネチャ節（`extractSideTriggerRawMetric` の Case A-D）に厳密に従う。具体形：

```ts
import type {
  Point3D,
  SideHandDetection,
  SideViewQuality
} from "../../shared/types/hand";

export interface SideTriggerHandGeometrySignature {
  readonly wristToIndexMcp: number;
  readonly wristToMiddleMcp: number;
  readonly indexMcpToPinkyMcp: number;
}

export interface SideTriggerRawMetric {
  readonly sourceKey: string | undefined;
  readonly timestampMs: number | undefined;
  readonly handDetected: boolean;
  readonly sideViewQuality: SideViewQuality;
  readonly normalizedThumbDistance: number | undefined;
  readonly geometrySignature: SideTriggerHandGeometrySignature | undefined;
}

export interface SideTriggerRawMetricFallback {
  readonly timestampMs?: number;
}

export const extractSideTriggerRawMetric = (
  detection: SideHandDetection | undefined,
  fallback?: SideTriggerRawMetricFallback
): SideTriggerRawMetric => {
  /* ... */
};
```

ロジックの詳細は spec の Case A-D に従う。thumb closure metric は shared helper（例: `sideTriggerThumbDistance.ts`）へ切り出し、`extractSideTriggerRawMetric` と `extractSideTriggerEvidence` の両方から同じ関数を呼ぶ。`dist` 関数（Euclidean 3D）は `src/shared/math/` から既存があれば使用、なければ helper 側 private に置く。`normalizedThumbDistance = dist(thumbTip, middleMcp ?? indexMcp) / max(0.0001, dist(wrist, indexMcp))`。正規化軸は従来どおり `wrist-indexMcp` とし、`middleMcp` 欠損時は legacy `thumbTip-indexMcp` metric に fallback する。

**Test plan** (`sideTriggerRawMetric.test.ts`)

- Case A: `detection === undefined`、`fallback.timestampMs` あり → metric.timestampMs = fallback、handDetected=false、sideViewQuality="lost"、他 undefined
- Case A 変種：`fallback` 未指定 → timestampMs = undefined
- Case B: detection あり、worldLandmarks 不在 → normalizedThumbDistance/geometrySignature undefined、sourceKey/timestampMs/handDetected/sideViewQuality 設定済
- Case C: detection あり、worldLandmarks あり、`middleMcp`/`pinkyMcp` 欠損 → legacy fallback で normalizedThumbDistance 計算成功、geometrySignature undefined
- Case D: 全 landmarks 揃っている → `thumbTip-middleMcp` normalizedThumbDistance + geometrySignature 全成分計算
- 数値テスト：thumbTip / middleMcp の既知座標で `normalizedThumbDistance` が手計算値と一致
- fallback テスト：`middleMcp` 欠損時は thumbTip / indexMcp の既知座標で `normalizedThumbDistance` が手計算値と一致
- 差分テスト：middleMcp と indexMcp が大きく異なる座標では middle metric と fallback metric が異なる
- 数値テスト：geometry signature 各成分が手計算 Euclidean 距離と一致
- ゼロ除算防御：wrist == indexMcp の縮退時に分母が `0.0001` で clamp される

**Dependencies**

- Task 1 (`HandLandmarkSet` に optional MCPs)

**Commit**

- `feat(side-trigger): add extractSideTriggerRawMetric helper`

---

### Task 4: Hand geometry signature (jump 判定 + EMA 更新)

**Scope:** `~≤1.5h`

**Files**

- Create: `src/features/side-trigger/sideTriggerHandGeometrySignature.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerHandGeometrySignature.test.ts`
- Modify: `src/features/side-trigger/index.ts`

**Implementation**

```ts
import type { SideTriggerHandGeometrySignature } from "./sideTriggerRawMetric";

export interface GeometryJumpDetectionResult {
  readonly isJump: boolean;
  readonly nextEma: SideTriggerHandGeometrySignature;
}

/**
 * 現在 signature と直前 EMA を比較して jump 判定し、新 EMA を返す。
 * 新規初期化（直前 ema が undefined）の場合：jump=false、nextEma=current。
 * jump=true の場合：nextEma = current（次サイクルの起点）。
 */
export const detectGeometryJumpAndUpdateEma = (
  current: SideTriggerHandGeometrySignature,
  previousEma: SideTriggerHandGeometrySignature | undefined,
  config: { readonly jumpRatio: number; readonly emaAlpha: number }
): GeometryJumpDetectionResult => {
  /* ... */
};
```

ロジックの詳細：

- jump 判定：3 成分各々で `|current - ema| / max(ema, 0.001) > jumpRatio` のいずれか true なら isJump=true
- EMA 更新：jump 時は新値で初期化、それ以外は `ema' = (1 - alpha) * ema + alpha * current`

**Test plan**

- 初期 EMA 未設定 → jump=false、nextEma=current
- 各成分が +20% 変化（< 25%）→ jump=false、nextEma が EMA 更新式どおり
- 1 成分が +30% 変化 → jump=true、nextEma=current
- 別成分が -50% 変化（負方向）→ jump=true（絶対値で判定）
- EMA 連続更新の収束テスト：固定 input を 100 回流し、ema が input に収束（誤差 < 1e-3）
- 0 値 EMA の防御：ema=0 で current=0.1 → 分母 0.001 で計算成功

**Dependencies**

- Task 3 (`SideTriggerHandGeometrySignature` 型)

**Commit**

- `feat(side-trigger): add geometry signature jump detection`

---

### Task 5: 適応 calibration 純粋 reducer (本実装の中核)

**Scope:** `~≤4h`

**Files**

- Create: `src/features/side-trigger/sideTriggerAdaptiveCalibration.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerAdaptiveCalibration.test.ts`
- Modify: `src/features/side-trigger/index.ts`

**Implementation**

spec の主要型シグネチャ節を strict に実装する。`AdaptiveSideTriggerCalibrationConfig`, `AdaptiveSideTriggerCalibrationState`, `AdaptiveCalibrationStatus`, `AdaptiveResetReason`, `AdaptiveSampleEntry` を export。

主要な関数：

```ts
export const DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG: AdaptiveSideTriggerCalibrationConfig =
  {
    windowSamples: 90,
    warmupSamples: 30,
    handLossResetMs: 1500,
    geometryJumpRatio: 0.25,
    geometryEmaAlpha: 0.1,
    pulledLowerBound: 0,
    openUpperBound: 1.2,
    pulledPercentile: 0.2,
    openPercentile: 0.8,
    pulledOpenMinSpan: 0.05,
    initialPulled: INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
    initialOpen: INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE
  };

export const assertAdaptiveCalibrationConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  // spec の Config invariants 節 すべてを検査
};

export const createInitialAdaptiveSideTriggerCalibrationState = (
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveSideTriggerCalibrationState => {
  /* ... */
};

export const updateSideTriggerAdaptiveCalibration = (
  state: AdaptiveSideTriggerCalibrationState,
  metric: SideTriggerRawMetric,
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveSideTriggerCalibrationState => {
  /* ... */
};
```

ロジックは以下の順で実行：

1. **reset 判定** (この順で評価、いずれかが true なら reset)：
   - sourceKey: `metric.sourceKey !== undefined && state.currentSourceKey !== undefined && metric.sourceKey !== state.currentSourceKey` → reset reason="sourceChanged"
   - hand-loss: `state.lastObservedHandTimestampMs !== undefined && metric.timestampMs !== undefined && (metric.timestampMs - state.lastObservedHandTimestampMs) > config.handLossResetMs` → reset reason="handLoss"
   - geometry-jump: signature あり、`previousEma` あり、`detectGeometryJumpAndUpdateEma` で `isJump` → reset reason="geometryJump"
2. reset 時：state を `createInitial...(config)` で再生成、`lastResetReason` と `lastResetTimestampMs` を設定、`currentSourceKey` を `metric.sourceKey ?? undefined` で更新（defined ならば）
3. **timestamp 更新**：`metric.handDetected === true` なら `lastObservedHandTimestampMs = metric.timestampMs ?? state.lastObservedHandTimestampMs`
4. **sourceKey 更新**：`metric.sourceKey !== undefined` なら `currentSourceKey = metric.sourceKey`
5. **quality gate**：spec の表 (8a-8e) に従い ring buffer push の可否を判定
6. **EMA 更新**：8a 相当（signature あり）のみ
7. **percentile 計算**（push があった場合のみ）：nearest-rank で pulled = `sorted[ceil(config.pulledPercentile*n)-1]`, open = `sorted[ceil(config.openPercentile*n)-1]`
8. **clamp**：spec の clamp 規則 4-step
9. **線形補間**：`weight = clamp(sampleCount / warmupSamples, 0, 1)`、`output.pulled = INITIAL_PULLED + weight * (clampedPulled - INITIAL_PULLED)`、`output.open = INITIAL_OPEN + weight * (clampedOpen - INITIAL_OPEN)`
10. **status 決定**：sampleCount=0→provisional、`< warmupSamples` → warmingUp、`>= warmupSamples` → adaptive

ring buffer は `ReadonlyArray<AdaptiveSampleEntry>`、push 時は `[...state.samples.slice(-(windowSamples-1)), newEntry]` で copy-on-write。

**Test plan** (`sideTriggerAdaptiveCalibration.test.ts`)

spec のテスト戦略節を strict に網羅。各テストは決定論的に書く：

1. **状態遷移**：30 frames で warmingUp 終了、それ以降 adaptive
2. **線形補間 (pulled)**：n=0 で INITIAL_PULLED 出力、n=15 で blend 50%、n=30+ で configured pulled percentile
3. **線形補間 (open)**：同上の構造で INITIAL_OPEN → configured open percentile
4. **configured percentile nearest-rank**：
   - default n=10、`[0.1, 0.2, ..., 1.0]` → p20=0.2 (sorted[1])、p80=0.8 (sorted[7])
   - default n=90、ceil(0.20*90)-1=17 → 18 番目の sorted 値、ceil(0.80*90)-1=71 → 72 番目
   - override `pulledPercentile=0.30`, `openPercentile=0.70` で同じ reducer が p30/p70 を使う
5. **clamp 規則 4-step**：
   - 5a. pulled percentile < 0 → clamp to 0
   - 5b. open percentile > 1.2 → clamp to 1.2
   - 5c. `observedOpenP90 - observedPulledP10 < 0.05` → `calibration` 本体のみ前フレーム値を hold
   - 5d. hold 中も `observedPulledP10` / `observedOpenP90` / `sampleCount` / `status` は通常更新
   - 5e. hold 後に `observedOpenP90 - observedPulledP10 >= 0.05` へ戻ると次フレームで通常経路に復帰
   - 5f. bound clamp 後に `clampedOpen - clampedPulled < 0.05` → 中点保持で押し広げ、境界超過時は反対端へシフト
   - 5g. 退化 config (`openUpperBound - pulledLowerBound < pulledOpenMinSpan`) → assertConfig で early throw
   - invariant: 全ケースで `pulledLowerBound <= clampedPulled <= clampedOpen <= openUpperBound`
6. **sourceKey reset**：sourceKey 変化フレームで provisional に戻り、samples=[]、lastResetReason="sourceChanged"
7. **hand-loss reset (timestamp ベース)**：handDetected=true frame ts=1000 → undetected ts=2600 (1600ms 経過) で reset、reason="handLoss"
8. **geometry jump reset**：signature 1 成分で 30% 変化 → reset、reason="geometryJump"、新 EMA は新値で再初期化
9. **quality gate 5 ケース** (spec 8a-8e に厳密対応、各 7 副作用すべて assert)：
   - 8a: good + thumb + signature あり：push, ema更新, sample+1, configured percentile 更新, ema更新, ts更新, timer評価
   - 8b: good + thumb + signature 欠損：push, ema更新なし, sample+1, configured percentile 更新, ema不変, ts更新, timer評価。連続 100 フレームで hand-loss reset しないことを assert
   - 8c: 非 good (`tooOccluded`) + thumb あり：push なし, sample 不変, configured percentile 不変, ema不変, ts更新, timer評価
   - 8d: thumb 取得不能 (worldLandmarks 欠損)：push なし, ts更新, timer評価
   - 8e: hand 未検出：push なし, ts更新せず, timer評価（`handLossResetMs` 経過で reset）
10. **invariant tests (table-driven)**：
    - `output.pulled <= output.open - pulledOpenMinSpan + ε` (config の minSpan 保証、ただし退化 config は除外)
    - `output.pulled >= pulledLowerBound`、`output.open <= openUpperBound`
    - 同じ metric 列を 2 回流すと state 一致（決定論性）
11. **`assertAdaptiveCalibrationConfig` テスト**：spec の各 invariant violation を 1 件ずつ throw 検証。`pulledPercentile <= 0`、`openPercentile >= 1`、`pulledPercentile >= openPercentile` を含める
12. **fixedOpen 不変 (=1.2 cap)**：8a-8e 全ケースで `output.open <= 1.2`

**Dependencies**

- Task 2 (INITIAL\_\* constants)
- Task 3 (`SideTriggerRawMetric`)
- Task 4 (geometry jump detection)

**Commit**

- 1 コミットでも複数コミット（assertConfig、reducer 本体、quality gate、replay 確認）でも可。テスト先行で red→green を細かく刻むこと

---

### Task 6: Wrapper mapper (`createAdaptiveSideTriggerMapper`)

**Scope:** `~≤2h`

**Files**

- Create: `src/features/side-trigger/createAdaptiveSideTriggerMapper.ts`
- Create: `tests/unit/features/side-trigger/createAdaptiveSideTriggerMapper.test.ts`
- Modify: `src/features/side-trigger/index.ts`

**Implementation**

```ts
import {
  createSideTriggerMapper,
  type SideTriggerMapper,
  type SideTriggerMapperUpdate,
  type SideTriggerMapperResult
} from "./createSideTriggerMapper";
import {
  AdaptiveSideTriggerCalibrationConfig,
  AdaptiveSideTriggerCalibrationState,
  DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
  assertAdaptiveCalibrationConfig,
  createInitialAdaptiveSideTriggerCalibrationState,
  updateSideTriggerAdaptiveCalibration
} from "./sideTriggerAdaptiveCalibration";
import { extractSideTriggerRawMetric } from "./sideTriggerRawMetric";

export interface AdaptiveSideTriggerMapper extends SideTriggerMapper {
  getAdaptiveState(): AdaptiveSideTriggerCalibrationState;
}

export const createAdaptiveSideTriggerMapper = (
  override?: Partial<AdaptiveSideTriggerCalibrationConfig>
): AdaptiveSideTriggerMapper => {
  const config: AdaptiveSideTriggerCalibrationConfig = {
    ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
    ...override
  };
  assertAdaptiveCalibrationConfig(config);

  let adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(config);
  const inner = createSideTriggerMapper();

  return {
    update(update) {
      const metric = extractSideTriggerRawMetric(update.detection, {
        timestampMs: update.timestamp?.frameTimestampMs
      });
      adaptiveState = updateSideTriggerAdaptiveCalibration(
        adaptiveState,
        metric,
        config
      );
      return inner.update({
        detection: update.detection,
        calibration: adaptiveState.calibration, // override 注入
        tuning: update.tuning,
        timestamp: update.timestamp
      });
    },
    reset() {
      adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(config);
      inner.reset();
    },
    getAdaptiveState() {
      return adaptiveState;
    }
  };
};
```

**Test plan**

- **black-box 委譲確認**：
  - 検出シーケンス（pulled-end 0.263 / open-end 1.0 を交互に 90 frames）を adaptive wrapper で update → `pullStarted+shotCommitted` edge を観測
  - 同じシーケンスを bare `createSideTriggerMapper` + static cal で update → 0 commit
  - これにより wrapper の calibration 注入が機能していることを示す
- **`reset()` 委譲**：
  - 数フレーム update 後 adaptive state.sampleCount > 0、reset → state.sampleCount=0、status="provisional"
  - bare mapper も内部で reset されている（`getAdaptiveState()` の前後 + 次フレームの telemetry で確認）
- **`getAdaptiveState()` 公開**：
  - update 後 `getAdaptiveState()` が現在の reducer state を返す（reference / value 一貫性）
- **config override**：
  - `createAdaptiveSideTriggerMapper({ windowSamples: 30 })` で reducer state.windowSamples = 30
  - 不正 config (例: `windowSamples: 0`) で early throw

**Dependencies**

- Task 5 (reducer)
- 既存 `createSideTriggerMapper` (無変更)

**Commit**

- `feat(side-trigger): add adaptive wrapper mapper`

---

### Task 7: Telemetry 型と TelemetryFrame schema 拡張

**Scope:** `~≤1.5h`

**Files**

- Create: `src/shared/types/sideTriggerAdaptive.ts` または `src/features/side-trigger/sideTriggerAdaptiveCalibration.ts` 内の export として `SideTriggerAdaptiveCalibrationTelemetry`
- Modify: `src/features/diagnostic-workbench/recording/telemetryFrame.ts`
- Modify: `src/features/side-trigger/sideTriggerAdaptiveCalibration.ts` — `toTelemetrySnapshot(state)` helper を export
- Modify: 関連テスト

**Implementation**

`SideTriggerAdaptiveCalibrationTelemetry` (spec 節「Adaptive 状態の telemetry 露出」):

```ts
export interface SideTriggerAdaptiveCalibrationTelemetry {
  readonly status: AdaptiveCalibrationStatus;
  readonly sampleCount: number;
  readonly windowSize: number;
  readonly observedPulledP10: number | undefined;
  readonly observedOpenP90: number | undefined;
  readonly pulledCalibrated: number;
  readonly openCalibrated: number;
  readonly lastResetReason: AdaptiveResetReason | undefined;
  readonly lastResetTimestampMs: number | undefined;
  readonly geometrySignatureEma: SideTriggerHandGeometrySignature | undefined;
}

export const toAdaptiveCalibrationTelemetry = (
  state: AdaptiveSideTriggerCalibrationState
): SideTriggerAdaptiveCalibrationTelemetry => {
  /* ... */
};
```

`TelemetryFrame` 拡張 (`telemetryFrame.ts`)：

- schema version は `1` のまま維持（後方互換性）
- 新フィールド `sideTriggerAdaptiveCalibration?: SideTriggerAdaptiveCalibrationTelemetry` を **optional** で追加
- `serializeTelemetryFrame` / `parseTelemetryFrame` 双方で optional として扱う（不在 → undefined）

**Test plan**

- `toAdaptiveCalibrationTelemetry`：state の各フィールドが telemetry に正しく投影される
- TelemetryFrame round-trip：新 snapshot 込み frame を JSON → parse して一致
- 後方互換性：旧フォーマット JSON（`sideTriggerAdaptiveCalibration` 不在）が parse でき、フィールドが undefined となる
- 既存 telemetry テスト pass

**Dependencies**

- Task 5 (reducer)

**Commit**

- `feat(telemetry): add optional adaptive calibration snapshot to TelemetryFrame`

---

### Task 8: 診断画面 — 観測パネル + 配線

**Scope:** `~≤2.5h`

**Files**

- Create: `src/features/diagnostic-workbench/renderSideTriggerAdaptiveCalibrationPanel.ts`
- Modify: `src/features/diagnostic-workbench/workbenchInspectionState.ts` — `sideTriggerAdaptiveCalibration?: SideTriggerAdaptiveCalibrationTelemetry` フィールド追加
- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts` — observe-only adaptive reducer instance を保持し、frame loop で update。bare mapper には影響を与えない。`resetTrackingState` で adaptive state も再初期化
- Modify: `src/features/diagnostic-workbench/renderWorkbench.ts` — 新パネルを既存レイアウトに追加
- Modify: `diagnostic.html` — 新パネル用 DOM (id を含む)
- Add tests as needed in `tests/unit/features/diagnostic-workbench/`

**Implementation**

- 新パネル：spec の「観測性設計」節 (status badge, sampleCount progress, pulled/open 数値、観測 configured percentile、reset 情報、ema 3 成分) を render
- `liveLandmarkInspection.ts:443-475` の side branch で：

  ```ts
  const adaptiveMetric = extractSideTriggerRawMetric(sideDetection, { timestampMs: ... });
  adaptiveState = updateSideTriggerAdaptiveCalibration(adaptiveState, adaptiveMetric, adaptiveConfig);
  inspectionState.sideTriggerAdaptiveCalibration = toAdaptiveCalibrationTelemetry(adaptiveState);
  ```

  bare `createSideTriggerMapper` は引き続き static slider calibration を使う（**adaptive state は影響しない**）

- `resetTrackingState` (`liveLandmarkInspection.ts:748-770`) に `adaptiveState = createInitial...(adaptiveConfig)` を追加
- `renderWorkbench.ts` は新パネルを既存 SideTrigger panel の下あたりに配置（具体的な DOM 配置は実装者判断、ただし spec の項目すべてを表示）

**Test plan**

- Smoke test：`liveLandmarkInspection` を数フレーム回し、`inspectionState.sideTriggerAdaptiveCalibration` が更新される
- `resetTrackingState` 後に adaptive state が provisional に戻る
- 既存 workbench テスト pass

**Dependencies**

- Task 5, 6, 7

**Commit**

- `feat(workbench): add adaptive calibration observe-only panel`

---

### Task 9: ゲームランタイム経路を adaptive wrapper に切り替え

**Scope:** `~≤1h`

**Files**

- Modify: `src/app/balloonGameRuntime.ts:438` 周辺

**Implementation**

```ts
// 既存:
import { createSideTriggerMapper, defaultSideTriggerCalibration } from "../features/side-trigger";
const sideTriggerMapper = createSideTriggerMapper();
// ...
calibration: defaultSideTriggerCalibration,

// 変更後:
import { createAdaptiveSideTriggerMapper } from "../features/side-trigger";
const sideTriggerMapper = createAdaptiveSideTriggerMapper();
// ...
// calibration を渡さない（wrapper が内部で adaptive 値を注入）
// または: AdaptiveSideTriggerMapper.update のシグネチャが SideTriggerMapper と互換であれば、既存呼び出しはそのまま
```

`SideTriggerMapperUpdate.calibration` は型レベルでは required だが、wrapper 実装は受け取った値を無視する。型互換性を保つため、wrapper の update は `update.calibration` を「無視して」内部 adaptive 値で上書きするロジックにする（Task 6 の実装に既に含まれている）。

`balloonGameRuntime.ts:719-723` の `retry()` で `sideTriggerMapper.reset()` を呼ぶ箇所は既存のまま。wrapper の reset() が adaptive と inner の両方を reset する（Task 6 でテスト済）。

**Test plan**

- 既存 `balloonGameRuntime` テスト pass
- 既存 `retry()` テストがあれば、reset 後に adaptive state が provisional に戻ることを smoke test
- e2e（必要なら）：実際のゲーム loop で 1 ジェスチャ commit を確認

**Dependencies**

- Task 6, 7, 8

**Commit**

- `feat(runtime): switch game runtime to adaptive side-trigger mapper`

---

### Task 10: Replay test (opt-in ローカルゲート)

**Scope:** `~≤2.5h`

**Files**

- Create: `tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts`
- Modify: `tests/replay/AGENTS.md` — opt-in ローカル fixture の旨を追記

**Implementation**

- replay test は `iterations/telemetry-2026-04-19T05-00-33-702Z.json`（gitignored）を直接読む
- ファイル不在時は `it.skipIf(fixture === undefined)` で **graceful skip**。CI ではこれが skip される（capture を持たないため）
- fixture を読み込んだ場合、各 frame の `side` detection を `extractSideTriggerRawMetric` → `updateSideTriggerAdaptiveCalibration` → `extractSideTriggerEvidence` → 既存 `updateSideTriggerState` (FSM) の pipeline に流す
- 比較対象として **同じ fixture を static calibration (`defaultSideTriggerCalibration`) で流した baseline** も同テスト内で計算
- 期待値を `expect(adaptiveCommits).toBeGreaterThanOrEqual(19)` でゲート
- warning target (`>= 22`) は `console.warn` で報告（fail させない）。長期目標は spec 末尾の Phase 2 軸を参照
- baseline static は `expect(staticCommits).toBeLessThan(adaptiveCommits)` で「adaptive のほうが必ず多い」性質を assert（回帰保護）
- **fixture は git にコミットしない**：200k 行超の landmark JSON を git に載せると repo が肥大するため

`tests/replay/AGENTS.md` に以下のような節を追加：

```markdown
## Notes on opt-in local fixtures

`tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts` reads an optional
local capture from `iterations/telemetry-...json` (gitignored). The capture is
deliberately not committed because of its size; the test uses `it.skipIf` so
CI passes without it while local runs that have the capture exercise the
regression gate.
```

**Test plan**

- ローカル（fixture あり）：replay test 自体が pass する（adaptive >= 19）、baseline static < adaptive
- CI（fixture 不在）：skip され green
- `npm run test:replay` でローカル成功
- `npm run check` 全体成功（lint, typecheck, test, test:replay, knip すべて）

**Dependencies**

- Task 1-9 すべて

**Commit**

- 1 コミットで OK（test + AGENTS.md）。`test(replay): add opt-in adaptive calibration regression gate` 程度

---

## 3. 完了基準

以下すべて満たしたら Phase 1 完了：

- [ ] Task 1-10 のすべてのコミットが main にマージ可能
- [ ] `npm run check` がローカルで pass（lint / typecheck / test / test:replay / knip）
- [ ] `npm run test:replay` の adaptive baseline が `>= 19 commits` を満たす
- [ ] `npm run test:replay` の adaptive baseline が static baseline より strictly more commits
- [ ] 診断画面 (`diagnostic.html`) を起動し、observe-only パネルが live update する
- [ ] ゲーム画面 (`index.html`) を起動し、現地テストの telemetry 取得時と同じ動作（再現可能）で 1 発以上発射される
- [ ] PR 説明に：thumb-axis 診断結果（palmar 5 / opposition 4 / both 11）、C-middle simulation 結果（新 20g 19/19、旧 25g 23/22、最古約 22g 20/20、false positive 0）、新 capture 据え置き / 旧 capture 改善の honest 評価、FSM 閾値・percentile・hold guard を温存した理由、重複 metric 実装の統合、replay fixture の出所説明

---

## 4. PR 提出時の留意

- 1 PR で全 Task まとめても、Task 1-2 / 3-4 / 5 / 6-7 / 8-10 のように分割しても可。Codex 委譲時は 1 PR 一括が単純
- PR 説明には設計書 (`docs/superpowers/specs/2026-04-19-adaptive-side-trigger-calibration-design.md` r8) と本プランへのリンクを含める
- replay capture (`iterations/telemetry-*.json`) はローカル gitignored 運用とし、リポジトリにはコミットしない（サイズ肥大防止、`tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts` は capture 不在時 `it.skipIf` で skip）
- Phase 2 の tuning 軸（spec 節「Phase 2 で検討するチューニング軸」）は別 spec / 別 PR
- 本プラン外で発見された問題（design に齟齬がある等）は spec 側を更新してから実装する

---

## 5. 想定リスクと回避

- **risk:** `HandLandmarkSet` を optional にしたことで既存コードが undefined を見落とす
  - **mitigation:** TypeScript strict + `--noImplicitAny` で型チェック。Task 1 完了直後に `npm run typecheck` を必ず通す
- **risk:** observe-only adaptive reducer (診断画面側) と本番 wrapper で**異なる reducer instance** を持つため、計算が二重化する
  - **mitigation:** 仕様通り（spec 節「アーキテクチャ：Pure Reducer + Wrapper Mapper」）。CPU コストは ring buffer push + sort O(N log N) で N=90 なので無視できる
- **risk:** replay test の fixture (数 MB JSON) が CI の test 実行を遅くする
  - **mitigation:** vitest.replay.config.ts の testTimeout は既定 5s。実測で超えるなら timeout 延長を検討（spec の `tests/replay/AGENTS.md` 言及どおり）
- **risk:** Phase 1 ゲート ≥16 を実装が下回る（今回の simulation は Codex 環境で行ったため、TypeScript 実装で再現性が完全保証されているわけではない）
  - **mitigation:** Task 5 完了直後（Task 6 以降に進む前）に、replay test を一度回して数値を確認。下回る場合は実装の percentile config 経路を先に疑い、FSM 閾値・dwell・cooldown は今回の PR では変更しない
