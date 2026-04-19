# Adaptive Side-Trigger Calibration Design

作成日: 2026-04-19

## 位置づけ

この文書は、`BalloonShoot_v2` のサイドカメラ・トリガー判定に**ランタイム適応キャリブレーション**を導入するための設計書である。

対象は `src/features/side-trigger/` を中心とした calibration 供給経路であり、既存の発射 FSM (`sideTriggerStateMachine`) およびその外部契約 (`SideHandDetection -> TriggerInputFrame`) は維持する。

この設計は `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` の static `defaultSideTriggerCalibration` 前提を、本番ゲーム経路に限り **動的キャリブレーションに置き換える** 形で更新する。診断ワークベンチ (`src/diagnostic-main.ts`) は引き続き static calibration + slider のままとする。

## 背景

PoC の現地テストで、ある成人プレイヤーがサイドトリガーを 22 秒間に約 20 回引いたが、**1 発も発射されなかった**。原因はキャリブレーション値が当該ユーザの可動域に合っていなかったこと。

`iterations/telemetry-2026-04-19T01-18-36-449Z.json` の解析結果：

- `pullEvidenceScalar` の最大値は 0.737（閾値 0.72 をギリギリ超えるが、2 フレーム連続にならず未発火）
- 22 個の独立した「ジェスチャ波形」を検出（1 サイクル = pullScalar の上昇〜下降）
- ユーザの実際の正規化親指距離の最小値は ≈ 0.263

`defaultSideTriggerCalibration.pulledPose.normalizedThumbDistance = 0` は「親指を indexMcp に完全に重ねられる」前提だが、当該ユーザは 0.263 までしか縮められない。

放課後デイサービスという deployment context では、子どもが入れ替わり立ち替わりプレイし、指導員一人が複数の子どもを回す。**プレイ前のキャリブレーション儀式は現実的ではない**。

## ゴール

- **明示的キャリブレーションなしで多くのプレイヤー** が発射できる状態にする
- 子どもが入れ替わっても**数秒で順応**する
- 既存 FSM (`sideTriggerStateMachine`) と外部契約は不変更
- 既存テストを壊さない（adaptive は既存 mapper をラップする層として追加）
- 適応の挙動を**観測可能**にする（診断画面で可視化、telemetry で記録）

## 対象範囲

この設計書の対象：

- `src/features/side-trigger/` 配下に adaptive calibration reducer と wrapper mapper を追加
- `src/features/side-trigger/sideTriggerEvidence.ts` から raw metric 抽出 helper を分離
- `src/features/side-trigger/sideTriggerConstants.ts` に provisional 初期値定数を追加
- `src/app/balloonGameRuntime.ts` を adaptive wrapper 経由に切り替え
- `src/features/diagnostic-workbench/` に adaptive 状態の **読み取り専用** 観測パネルを追加
- `iterations/telemetry-*.json` 録画フォーマットへの adaptive snapshot 追加

対象外：

- 既存 FSM (`sideTriggerStateMachine`) の変更
- 既存 `createSideTriggerMapper` の変更（追加 only）
- `open` 側 (`openPose.normalizedThumbDistance`) の動的適応 — 構造的余地は残すが今回は固定
- 診断画面のスライダー UX 変更
- 自動オートキャリブレーション以外の手段（明示キャリブ画面、プリセット選択 UI など）

## 優先順位

設計判断の優先順位は以下とする。

1. プレイヤーが**明示的キャリブなしに発射できる**こと
2. プレイヤー交代時に**数秒で追従**すること
3. 既存テスト・既存 FSM・既存外部契約に**影響しない**こと
4. 適応の挙動が**観測可能・テスト可能**であること
5. 将来 `open` 側の適応や別アルゴリズムに**差し替え可能**な構造であること

## 設計方針

### アーキテクチャ：Pure Reducer + Wrapper Mapper

既存 `createSideTriggerMapper` には**一切手を入れない**。代わりに：

1. **純粋 reducer** `updateSideTriggerAdaptiveCalibration(state, metric, config) -> state` を新設
2. raw metric 抽出 helper `extractSideTriggerRawMetric(detection)` を `sideTriggerEvidence.ts` から分離
3. **wrapper mapper** `createAdaptiveSideTriggerMapper(config?)` が、raw metric → reducer 更新 → 内部 mapper への calibration 注入、という pipeline を構成する

ゲーム本体経路 (`balloonGameRuntime.ts`) は wrapper を使う。診断画面は引き続き bare mapper + static calibration。

診断画面の adaptive 観測パネル用データは、**`liveLandmarkInspection` 内に独立した observe-only reducer インスタンスを 1 つ保持**して供給する。bare mapper の calibration には影響を与えず、reducer の state だけを `WorkbenchInspectionState.sideTriggerAdaptiveCalibration` として露出する。これにより：

- 診断画面の static cal + slider 動作は無変更
- 観測パネルは「もしゲーム経路だったら adaptive がどう動くか」を並列に可視化する
- 同じ reducer ロジックを 2 系統で再利用するので、実装の二重化を防ぐ

### 命名分離（Codex 指摘事項）

既存の `DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0` は `sideTriggerEvidence.ts` の数式における**標準アンカー**として温存する（変更すると診断スライダの意味が変わる）。

新しい provisional 初期値は別名で導入：

```ts
export const INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0.20;
```

`createAdaptiveSideTriggerMapper` の初期 calibration はこの定数を使う。`defaultSideTriggerCalibration` 自体は変更しない（診断画面の static cal として温存）。

### Time-based loss 判定（Codex 指摘事項）

既存 FSM の hand-loss 判定は**フレーム数ベース** (`sideTriggerStateMachine.ts:72`)。adaptive reducer の `hand-loss > 1.5s` 判定は**timestamp ベース**で実装する。

理由：

- フレームレートに依存しない閾値が必要（PoC は ≈ 30fps を想定するが、保証されていない）
- adaptive のテストを decoupled deterministic にできる（timestamp を引数で渡す）

reducer は `metric.timestampMs` を受け取り、`state.lastObservedHandTimestampMs` と比較して reset を判定する。

### 適応アルゴリズム：Sliding-window p10

短い観測窓（既定 5 秒、または 90 サンプル）に raw `normalizedThumbDistance` を ring buffer で保持し、**p10**（下位 10 パーセンタイル）を `cal.pulled` として採用する。

設計判断：

- `min` ではなく `p10`：単発 tracking glitch（外れ値）に強い
- 5 秒：プレイヤーが 1 回はジェスチャを完走する想定。短すぎると baseline が動きすぎ、長すぎると交代に追従しない
- ring buffer：実装が単純、メモリ固定、O(1) push、p10 取得は O(N log N) ソート（N=90 なら無視できる）

`open` 側は今回**固定**（`DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE = 1.2`）。reducer の state には `open: { enabled: false, value: 1.2 }` として将来拡張余地を持たせるだけ。

### Adaptive 状態のライフサイクル

```
provisional → warmingUp → adaptive
              ↑                ↓
              └── (reset trigger) ──┘
```

| 状態 | 条件 | 出力 calibration |
|---|---|---|
| `provisional` | `sampleCount = 0`（直後 / reset 直後） | `{ pulled: INITIAL_PULLED, open: 1.2 }` |
| `warmingUp` | `0 < sampleCount < warmupSamples` | `INITIAL_PULLED` から観測 p10 へ線形補間 |
| `adaptive` | `sampleCount >= warmupSamples` | `{ pulled: clamp(p10, lower, open - minSpan), open: 1.2 }` |

`warmupSamples = 30`（≈ 1 秒）。

線形補間理由：いきなり observed p10 に切り替えると、開始直後の不安定な観測値で発火閾値が大きく動くため。

### プレイヤー交代検知（複合シグナル）

reset trigger は以下のいずれか：

1. **`sourceKey` 変化**（カメラ切替）
2. **hand-loss > 1.5s**（timestamp ベース、最後の `handDetected = true` から）
3. **手の幾何学的シグネチャ jump**

シグネチャは MediaPipe world-landmarks から計算した 3 つの正規化距離比のベクトル：

```ts
geometrySignature = {
  wristToIndexMcp: dist(wrist, indexMcp),
  indexMcpToPinkyMcp: dist(indexMcp, pinkyMcp),
  wristToMiddleMcp: dist(wrist, middleMcp)
};
```

シグネチャの EMA を保持し、現在フレームのシグネチャがいずれかの成分で **|現在 - EMA| / EMA > 0.25** ならジャンプ判定 → reset。

EMA 係数 `α = 0.1`（≈ 10 フレームで半減）。jump 判定後は EMA を新値で初期化。

### 失敗モード対策

| 失敗モード | 対策 |
|---|---|
| frozen low（最初から握っている） | `pulled` の更新は「単独の最小値」ではなく `p10`。さらに `cal.pulled <= cal.open - minSpan (= 0.4)` を保証 |
| drift up（ジェスチャが甘くなる） | sliding-window 自体が古いサンプルを排出するため、窓サイズ（5 秒）の時定数で自然に追従する。追加処理は不要 |
| プレイヤー交代未検知 | 上記 3 シグナルの OR で最低限カバー。検知漏れの場合も窓が 5 秒で完全入れ替わるので、最悪 5 秒で順応 |
| tracking glitch | quality gate：`sideViewQuality !== "good"` または `handDetected === false` のフレームは raw metric 取得しない（reducer に流れない） |
| tug-of-war (`pulled`/`open` 同時動的) | 今回は `open` を固定にするので発生しない。将来 `open` 適応を入れる時の検討事項として明記 |

### Adaptive 状態の telemetry 露出

新型 `SideTriggerAdaptiveCalibrationTelemetry`：

```ts
{
  status: "provisional" | "warmingUp" | "adaptive",
  sampleCount: number,
  windowSize: number,
  pulledP10: number | undefined,
  pulledCalibrated: number,
  openCalibrated: number,  // = 1.2 always
  lastResetReason?: "sourceChanged" | "handLoss" | "geometryJump",
  lastResetTimestampMs?: number,
  geometrySignatureEma?: SideTriggerHandGeometrySignature
}
```

`WorkbenchInspectionState` に `sideTriggerAdaptiveCalibration` フィールドを追加。観測パネルはこれを参照して描画。

`iterations/telemetry-*.json` のフレーム単位 snapshot にも adaptive state を追加し、後解析で適応の挙動を再現可能にする。

## アーキテクチャ概要

### モジュール境界

```
src/features/side-trigger/
  sideTriggerConstants.ts             # INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE 追加
  sideTriggerCalibration.ts           # 既存（無変更）
  sideTriggerEvidence.ts              # extractSideTriggerRawMetric を export 追加
  sideTriggerStateMachine.ts          # 既存（無変更）
  createSideTriggerMapper.ts          # 既存（無変更）
  sideTriggerRawMetric.ts             # 新規: 型と raw metric 抽出
  sideTriggerHandGeometrySignature.ts # 新規: signature 計算と jump 判定
  sideTriggerAdaptiveCalibration.ts   # 新規: 純粋 reducer
  createAdaptiveSideTriggerMapper.ts  # 新規: wrapper mapper
  index.ts                            # 新規 export 追加
```

### データフロー（ゲーム経路）

```
SideHandDetection
    ↓
extractSideTriggerRawMetric(detection)
    ↓ SideTriggerRawMetric
updateSideTriggerAdaptiveCalibration(state, metric, config)
    ↓ AdaptiveSideTriggerCalibrationState (含む calibration)
createSideTriggerMapper.update({ detection, calibration: adaptive.calibration, tuning })
    ↓ SideTriggerMapperResult
（外側で wrapper が adaptive snapshot を telemetry にマージ）
    ↓
GameInputFrame / TelemetryFrame
```

### データフロー（診断画面、観測のみ）

```
SideHandDetection
    ↓
                    ┌── extractSideTriggerRawMetric ── observe-only adaptive reducer ──→ WorkbenchInspectionState.sideTriggerAdaptiveCalibration
                    │                                                                                ↓
                    │                                                                       read-only panel
                    │
                    └── extractSideTriggerEvidence(detection, sliderCal) ── createSideTriggerMapper.update ──→ 既存 telemetry / overlay
```

### 主要型シグネチャ

```ts
// sideTriggerRawMetric.ts
export interface SideTriggerHandGeometrySignature {
  readonly wristToIndexMcp: number;
  readonly indexMcpToPinkyMcp: number;
  readonly wristToMiddleMcp: number;
}

export interface SideTriggerRawMetric {
  readonly sourceKey: string | undefined;
  readonly timestampMs: number | undefined;
  readonly handDetected: boolean;
  readonly sideViewQuality: SideViewQuality;
  readonly normalizedThumbDistance: number | undefined;
  readonly geometrySignature: SideTriggerHandGeometrySignature | undefined;
}

export const extractSideTriggerRawMetric: (
  detection: SideHandDetection | undefined,
  fallbackTimestampMs?: number
) => SideTriggerRawMetric;

// sideTriggerAdaptiveCalibration.ts
export interface AdaptiveSideTriggerCalibrationConfig {
  readonly windowSamples: number;          // default 90
  readonly warmupSamples: number;          // default 30
  readonly handLossResetMs: number;        // default 1500
  readonly geometryJumpRatio: number;      // default 0.25
  readonly geometryEmaAlpha: number;       // default 0.1
  readonly pulledLowerBound: number;       // default 0
  readonly pulledOpenMinSpan: number;      // default 0.4
  readonly initialPulled: number;          // default INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE
  readonly fixedOpen: number;              // default DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE
}

export type AdaptiveCalibrationStatus = "provisional" | "warmingUp" | "adaptive";

export interface AdaptiveSideTriggerCalibrationState {
  readonly calibration: SideTriggerCalibration;
  readonly status: AdaptiveCalibrationStatus;
  readonly sampleCount: number;
  readonly windowSamples: number;
  readonly pulledP10: number | undefined;
  readonly lastObservedHandTimestampMs: number | undefined;
  readonly geometrySignatureEma: SideTriggerHandGeometrySignature | undefined;
  readonly lastResetReason: "sourceChanged" | "handLoss" | "geometryJump" | undefined;
  readonly lastResetTimestampMs: number | undefined;
  readonly currentSourceKey: string | undefined;
  // ring buffer は state 内に隠蔽（テストでは必要に応じ exposable accessor を提供）
}

export const createInitialAdaptiveSideTriggerCalibrationState: (
  config: AdaptiveSideTriggerCalibrationConfig
) => AdaptiveSideTriggerCalibrationState;

export const updateSideTriggerAdaptiveCalibration: (
  state: AdaptiveSideTriggerCalibrationState,
  metric: SideTriggerRawMetric,
  config: AdaptiveSideTriggerCalibrationConfig
) => AdaptiveSideTriggerCalibrationState;

// createAdaptiveSideTriggerMapper.ts
export interface AdaptiveSideTriggerMapper extends SideTriggerMapper {
  getAdaptiveState(): AdaptiveSideTriggerCalibrationState;
}

export const createAdaptiveSideTriggerMapper: (
  config?: Partial<AdaptiveSideTriggerCalibrationConfig>
) => AdaptiveSideTriggerMapper;
```

## テスト戦略

### 純粋 reducer の単体テスト

`sideTriggerAdaptiveCalibration.test.ts` で全ケース deterministic に検証：

1. **provisional → adaptive 遷移**：30 frames で warmingUp、それ以降 adaptive
2. **線形補間**：warmingUp 中に出力が `INITIAL_PULLED` から `p10` へ単調変化
3. **p10 計算**：90 サンプル投入、外れ値 5 個、p10 が p10 順位の値を返す
4. **clamp 動作**：p10 が `open - minSpan` を超えたら頭打ち
5. **`sourceKey` reset**：sourceKey 変化で provisional に戻り sampleCount = 0
6. **hand-loss reset (timestamp ベース)**：最後の handDetected=true から 1500ms 経過 → reset
7. **geometry jump reset**：シグネチャ 1 成分で 25% jump → reset、EMA は新値で再初期化
8. **quality gate**：`sideViewQuality = "lost"` のフレームは ring buffer に入らない
9. **`fixedOpen` 不変**：state.calibration.openPose は常に 1.2

### Wrapper mapper の単体テスト

`createAdaptiveSideTriggerMapper.test.ts`：

1. **委譲確認**：内部の `createSideTriggerMapper` に正しい calibration が渡される
2. **`reset()` 委譲**：両者がリセットされる
3. **`getAdaptiveState()` 公開**：reducer state が読み取れる

既存 `createSideTriggerMapper.test.ts` は **無変更**。

### Replay-driven 検証

`iterations/telemetry-2026-04-19T01-18-36-449Z.json` を入力に、`scripts/simulateAdaptiveCalibration.mjs` を新規追加：

- 各フレームの raw metric を reducer に流し込み、commit 数を出力
- 期待値：≥ 18 commits（22 ジェスチャの 80% 以上）

これは regression bench として `tests/integration/` 配下に置く（CI 必須化は別判断）。

### 観測パネル / telemetry 統合テスト

軽量な smoke test：

- `WorkbenchInspectionState.sideTriggerAdaptiveCalibration` が更新される
- `TelemetryFrame` snapshot に adaptive state が含まれる

## 観測性設計

### 診断画面パネル

新パネル `renderSideTriggerAdaptiveCalibrationPanel.ts`：

- 現在の status（バッジ表示：provisional/warmingUp/adaptive）
- sampleCount / windowSize（progress bar）
- pulled の現在値（数値 + INITIAL からの差分）
- 観測 p10（数値、未確定なら `--`）
- 直近の reset 理由とタイムスタンプ
- geometry signature EMA の 3 成分

### Telemetry 録画フォーマット

`TelemetryFrame.calibration` を拡張するか、新フィールド `sideTriggerAdaptiveCalibration` を追加。後解析で適応の挙動を再現可能にする。具体形式は M2 (Timestamped Diagnostic Capture) と整合させる。

## ロールアウト方針

1. **Phase 1（本設計の対象）**：
   - reducer + wrapper + 観測パネル + telemetry 拡張を実装
   - `balloonGameRuntime.ts` を adaptive 経路に切り替え
   - 診断画面の static cal は温存
2. **Phase 2（別 PR）**：
   - replay bench を CI ゲートに昇格するか判断
   - 複数ユーザのテレメトリを集めて `INITIAL_PULLED` / `windowSamples` の調整
3. **Phase 3（将来）**：
   - `open` 側の適応化検討
   - 自動キャリブの収束を加速する仕組み（事前学習プリセットなど）

## オープン論点

- `windowSamples = 90` (5s @ 30fps) は仮置き。テレメトリ取得後に調整する可能性
- `pulledOpenMinSpan = 0.4` は仮置き。閾値 (`PULL_ENTER = 0.72`) との整合は実測で確認
- `geometryJumpRatio = 0.25` は仮置き。子どもと大人の手で実測した値が望ましい
- 観測パネルの UI レイアウトは別 PR で詳細詰め可
