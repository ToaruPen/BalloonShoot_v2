# Side-Trigger Cycle-Driven Calibration Design (r9)

作成日: 2026-04-23

## 位置づけ

`BalloonShoot_v2` のサイドカメラ・トリガー判定を、**明示的な pull cycle 検出**に基づく calibration と発射判定に再設計する。本文書は r8 (`2026-04-19-adaptive-side-trigger-calibration-design.md`) を supersede する。

対象は `src/features/side-trigger/` を中心とした calibration 供給と発射判定の経路全体。診断ワークベンチ側の static cal + slider UX は維持する。

## 背景

r8 (sliding-window p20/p80) は基本的な追従性は得たが、現地検証で specificity 問題が判明:

- **検証 1 (sensitivity)**: 20 回のゆっくり pull を録画 → 19/20 commit、~50ms latency。許容範囲。
- **検証 2 (specificity)**: 30s 間「親指完全静止、手は AIM 操作で動かす」capture → **9 FP / 30s**。aiming 中の手の動きで scalar が threshold を超え、頻繁に誤発火。
- **検証 3 (warmed idle)**: 最初の 10s で 10 pull、その後 20s 静止 capture → 同様に FP 多発。warmup では解決しない。

原因は **「pull していない時間帯の raw 観測値で window 内 percentile が narrow に学習され、通常の手の動きで scalar が threshold を超える」** こと。pull-only sample に基づく学習が必要。

ユーザの直感「明示的に pull されたことを検出する」が技術的にも筋がよい。codex 検証でも、cycle-driven calibration を採用した Variant A が 4 capture で全 target を達成 (sens 19, cold FP 8 [人工 stress test、target 対象外], warmed-0-5s FP 0, warmed-total FP 0, past sens 18, latency ~49ms)。

## ゴール

- **明示的キャリブレーションなしで多くのプレイヤー** が発射できる
- 子どもが入れ替わっても**数秒で順応**する (初 cycle 完了後 armed)
- **手だけ動かす状況での誤発火を抑制** (warmed idle FP=0)
- **release ではなく pull で commit** する (UX 直感を維持、M3-light 50ms time-based hold)
- 適応の挙動を**観測可能**にする
- 既存テスト・既存外部契約 (`SideHandDetection -> TriggerInputFrame`) は維持

## 対象範囲

対象:

- `src/features/side-trigger/` 配下に CycleSegmenter / Calibration Reducer (再設計) / Controller を新設
- `sideTriggerStateMachine.ts` を frame-count dwell から time-based hold + armed gate へ調整
- `src/app/balloonGameRuntime.ts` を新 Controller 経由に切り替え
- `src/features/diagnostic-workbench/` に r9 telemetry 表示を追加
- 既存 r8 の sliding-window adaptive 系 (`sideTriggerAdaptiveCalibration.ts`, `createAdaptiveSideTriggerMapper.ts`) を r9 controller に置き換え
- replay test を 3 段階 (unit / controller integration / replay opt-in) に再整理

対象外:

- 既存 FSM enum (`SideTriggerPhase`, `TriggerEdge`, `TriggerAvailability`) の変更 — 既存型を維持
- 診断画面のスライダー UX 変更
- M2 (Timestamped Diagnostic Capture) の実装 — capture 形式は r9 で定義するが、実装は M2 milestone
- 自動オートキャリブ以外の手段 (明示キャリブ画面、プリセット選択 UI)

## 優先順位

1. プレイヤーが**明示的キャリブなしに発射できる**こと
2. プレイヤー交代時に**数秒で追従**すること
3. **手だけ動かす状況で誤発火しない**こと (specificity)
4. 既存外部契約・既存型に**影響しない**こと
5. 適応の挙動が**観測可能・テスト可能**であること

## Section 1: アーキテクチャ概要

### 4 層 + Controller 分離

```text
Layer 1: Raw Metric Reducer
   - thumb metric (既存 sideTriggerThumbDistance + sideTriggerRawMetric)
   - 出力: SideHandDetection → RawMetric (usable | unusable)

Layer 2: Cycle Segmenter (新規)
   - State machine: Open → Drop → Hold → Recovery → PendingPostOpen → Confirmed → Open
   - 出力: CycleResult { cyclePhase, confirmedCycleEvent?, stableOpenObservation?, resetSignal? }

Layer 3: Calibration Reducer (再設計)
   - State: defaultWide → cycleReady → adaptive (+ manualOverride mode)
   - cycle event のみで pulled/open を学習、stableOpen で open を gentle assist
   - 出力: CalibrationResult { status, pulled, open, acceptedCycleEvent?, rejectedCycleEvent? }

Layer 4: Evidence + FSM (調整)
   - Scalar = (open - raw) / (open - pulled)
   - Time-based hold (50ms) で commit、armed=false の frame では edge 禁止
   - 既存 SideTriggerPhase / TriggerEdge / TriggerAvailability を維持

Controller (orchestration):
   - 1 frame 処理パスを束ねる
   - armed flag (commit 可能状態) を保持
   - reset reason を検出して全 reducer を同期 reset
```

### キー概念

- **Cycle event**: 「明確に引かれて戻った」と判定される観測単位。calibration 学習の唯一の源。
- **Armed state**: 「commit 可能な状態」。初 accepted cycle 後 armed=true、reset で false。**armed=false の frame では FSM は shot edge を絶対に emit しない**。
- **stableOpen assist**: 安定 open 観測から `open` 値を gentle EMA (α=0.02) で更新する補助系。cycle 取りこぼし対策。
- **justArmed**: 初 accepted cycle frame の sentinel。同 frame では FSM commit を禁止 (calibration 確立 only)。

### r8 との差分

| 観点 | r8 | r9 |
|---|---|---|
| cal 学習源 | 全 good frame の p20/p80 (window) | 確認済み cycle event のみ + 安定 open EMA assist |
| 起動直後 | 即 commit 可 | unarmed、初 cycle まで commit 抑制 |
| reset 後 | wide cal 再起動、即 commit | wide cal + unarmed、再確立まで commit 抑制 |
| FSM dwell | frame-count (2 frames) | time-based hold (50ms) |
| 責務 | reducer 1 つに集中 | 4 層分離 + controller |
| specificity | 9 FP/30s (warmed idle) | 0 FP/30s (warmed idle) |

## Section 2: Component 詳細仕様

### 2.1 Raw Metric Reducer

既存 `extractSideTriggerRawMetric` の結果を `RawMetric` union にマップする層。

```ts
type RawMetricUnusableReason =
  | "noHand"                      // detection === undefined || !handDetected
  | "sideViewQualityRejected"     // sideViewQuality が "frontLike" / "tooOccluded" / "lost"
  | "noWorldLandmarks"            // worldLandmarks === undefined
  | "geometryUnavailable";        // geometrySignature 計算不能

type RawMetric =
  | {
      kind: "usable";
      timestampMs: number;
      sourceKey: string;
      value: number;                                // normalizedThumbDistance
      quality: SideViewQuality;
      geometrySignature: SideTriggerHandGeometrySignature;
    }
  | {
      kind: "unusable";
      timestampMs?: number;
      sourceKey?: string;
      reason: RawMetricUnusableReason;
    };
```

### 2.2 Cycle Segmenter (新規 reducer)

#### State machine

```text
[Open]            ── raw drops ≥ DROP_THRESHOLD from baselineAtStart ──→ [Drop]
[Drop]            ── raw stays ≤ baselineAtStart - DROP_THRESHOLD for ≥ HOLD_DURATION_MS ──→ [Hold]
[Hold]            ── raw starts rising ──→ [Recovery]
[Recovery]        ── raw reaches recovery_threshold (amplitude-based) ──→ [PendingPostOpen]
[PendingPostOpen] ── collect post POST_OPEN_WINDOW_MS samples ──→ [Confirmed]
[Confirmed]       ── emit cycle event with openPostMedian ──→ [Open]
```

#### baseline 管理

- `baselineBuffer` は **Open phase 中のみ更新** (直近 BASELINE_WINDOW_MS の usable samples)
- Drop/Hold/Recovery/PendingPostOpen 中は `cycleStart.baselineAtStart` を凍結使用 (cycle 中に baseline が下振れするのを防ぐ)
- `baselineWindowReady = (sampleCount >= 10) && (duration >= 300ms)` まで cycle 検出を行わない (cold start 安全策)

#### holdSamples の収集範囲

`holdSamples` は Drop 開始後、`raw <= baselineAtStart - DROP_THRESHOLD` を満たす usable samples を蓄積する。Hold 中も継続蓄積し、Recovery 遷移時点で固定。`pulledMedianFrozen = median(holdSamples)`。

#### Recovery 判定 (amplitude-based)

```text
recovery_threshold = pulledMedianFrozen + (baselineAtStart - pulledMedianFrozen) * RECOVERY_RATIO
```

固定比率 (`RECOVERY_RATIO = 0.80`) を baseline と pulled の振幅に対して適用。slow pull / fast pull のどちらでも比例して妥当な閾値となる。

#### state

```ts
type CyclePhase = "open" | "drop" | "hold" | "recovery" | "pendingPostOpen";

type CycleSegmenterState = {
  phase: CyclePhase;
  baselineBuffer: ReadonlyArray<{ timestampMs: number; value: number }>;  // Open 中のみ更新
  baselineWindowReady: boolean;
  cycleStart?: { timestampMs: number; baselineAtStart: number };
  cycleSamples: ReadonlyArray<{ timestampMs: number; value: number }>;
  holdSamples: ReadonlyArray<{ timestampMs: number; value: number }>;
  pulledMedianFrozen?: number;        // Hold→Recovery 遷移時に median(holdSamples) を確定保持
  recoveryThreshold?: number;          // 同タイミングで amplitude-based threshold を確定
  postOpenSamples: ReadonlyArray<{ timestampMs: number; value: number }>;
  postOpenStartMs?: number;
  lastStableOpenEmittedMs: number;
  lastConfirmedCycleAtMs?: number;     // intervalTooShort 評価用 (calReducer も使うが segmenter 側で持つ)
};
```

#### stableOpenObservation 発行条件

`phase === "open" && baselineWindowReady && (now - lastStableOpenEmittedMs) >= STABLE_OPEN_INTERVAL_MS` のとき `value = median(baselineBuffer)` を emit。`lastStableOpenEmittedMs` を更新。

#### 出力

```ts
type ConfirmedCycleEvent = {
  timestampMs: number;
  pulledMedian: number;       // = median(holdSamples)
  openPreMedian: number;      // = median(baselineBuffer at cycleStart)
  openPostMedian: number;     // = median(postOpenSamples)
  durationMs: number;
};

type CycleResult = {
  cyclePhase: CyclePhase;
  confirmedCycleEvent?: ConfirmedCycleEvent;
  stableOpenObservation?: { timestampMs: number; value: number };
  resetSignal?: ResetReason;
};
```

#### Constants

```ts
BASELINE_WINDOW_MS = 300
DROP_THRESHOLD = 0.05
HOLD_DURATION_MS = 50
RECOVERY_RATIO = 0.80
POST_OPEN_WINDOW_MS = 200
STABLE_OPEN_INTERVAL_MS = 500
```

### 2.3 Calibration Reducer

#### State machine

```text
defaultWide → cycleReady → adaptive
              ↑                ↓
              └── (reset signal) ──┘
              (manualOverride mode は orthogonal)
```

| 状態 | 条件 | 出力 |
|---|---|---|
| `defaultWide` | reset 直後または直前 cycle なし | pulled=0.2, open=1.2 |
| `cycleReady` | 初 accepted cycle 受領 | pulled=cycle.pulledMedian, open=avg(openPre, openPost) |
| `adaptive` | 2 つ目以降の accepted cycle で EMA | α_pull=0.1, α_open_cycle=0.1 |
| `manualOverride` | slider が default を外れた | cal/cycle 更新を停止、observe-only |

任意 state で stableOpenObservation を受けたら open を gentle EMA (α_open_assist=0.02) で更新 (manualOverride を除く)。

#### Sanity check (false cycle reject)

cycle event を受け取った時、以下の条件を全て満たせば accept、いずれか不成立なら reject:

- `cycle.pulledMedian < cal.open - MIN_SPAN(0.05)`  → 失敗時 `spanTooSmall`
- `|openPre - openPost| / max(openPre, openPost) < 0.30` → 失敗時 `openMedianMismatch`
- `cycle.durationMs < 1000ms` → 失敗時 `durationTooLong`
- 直前 accepted cycle との pulledMedian/openMedian 乖離 < 50% (rejected cycles はスキップして比較) → 失敗時 `medianDeviationFromLastAccepted`
- 直前 cycle event との間隔 ≥ 200ms → 失敗時 `intervalTooShort`

#### 合成優先順位

```text
ある frame で:
  - confirmedCycleEvent あり (accepted)        → cycle EMA 適用、stableOpen 無視
  - confirmedCycleEvent なし、stableOpen あり  → assist EMA 適用 (α_open_assist=0.02)
  - manualOverride mode 中                      → cal/cycle 更新を停止、observe-only
```

#### Output

```ts
type RejectedCycleReason =
  | "spanTooSmall"
  | "openMedianMismatch"
  | "durationTooLong"
  | "intervalTooShort"
  | "medianDeviationFromLastAccepted";

type CalibrationResult = {
  status: "defaultWide" | "cycleReady" | "adaptive" | "manualOverride";
  pulled: number;
  open: number;
  acceptedCycleEvent?: ConfirmedCycleEvent;
  rejectedCycleEvent?: {
    reason: RejectedCycleReason;
    cycleDigest: {
      pulledMedian: number;
      openPreMedian: number;
      openPostMedian: number;
      durationMs: number;
    };
  };
};
```

#### Constants

```ts
DEFAULT_PULLED = 0.2
DEFAULT_OPEN = 1.2
ALPHA_PULL = 0.1
ALPHA_OPEN_CYCLE = 0.1
ALPHA_OPEN_ASSIST = 0.02
MIN_SPAN = 0.05
```

### 2.4 Controller (orchestration)

```ts
type ResetReason =
  | "handLoss"
  | "geometryJump"
  | "sourceChanged"
  | "manualOverrideEntered";

type ControllerState = {
  armed: boolean;
  rawState; cycleState; calibrationState; evidenceState; fsmState;
};

function update(detection, timestampMs): ControllerOutput {
  const raw = rawReducer(detection, timestampMs);
  const resetReason = detectResetReason(raw, controllerState);

  if (resetReason) {
    controllerState = resetAll(controllerState, resetReason);
    if (resetReason === "manualOverrideEntered") {
      const calResult = calibrationReducer.update({
        confirmedCycleEvent: undefined,
        stableOpenObservation: undefined,
        resetSignal: resetReason,
      });
      controllerState.calibrationState = calResult;
    }
    return {
      fsmResult: { phase: postResetPhase(controllerState), fired: false },
      telemetry: buildResetTelemetry(controllerState, raw, resetReason, timestampMs),
    };
  }

  const cycleResult = cycleSegmenter.update(raw);
  const calResult = calibrationReducer.update({
    confirmedCycleEvent: cycleResult.confirmedCycleEvent,
    stableOpenObservation: cycleResult.stableOpenObservation,
    resetSignal: cycleResult.resetSignal,
  });

  let justArmed = false;
  if (calResult.acceptedCycleEvent && !controllerState.armed) {
    controllerState.armed = true;
    justArmed = true;
  }

  const evidence = evidenceFor(raw, calResult);  // 既存 extractSideTriggerEvidence を cal 注入でラップした pure helper
  const fsmResult = fsmReducer.update({
    rawMetric: raw,
    evidence,
    armed: controllerState.armed && !justArmed,
    cyclePhase: cycleResult.cyclePhase,
    timestampMs,
  });

  return {
    fsmResult,
    telemetry: buildTelemetry(controllerState, raw, cycleResult, calResult, fsmResult),
    cycleEvent: toCycleEventTelemetry(calResult),
  };
}
```

#### detectResetReason 仕様

- `handLoss`: timestamp ベースで前 frame の `raw.usable` から `HAND_LOSS_THRESHOLD_MS = 1500ms` 連続不在
- `geometryJump`: r8 と同じ EMA-based ratio (`geometryJumpRatio = 0.25`)
- `sourceChanged`: `raw.sourceKey` が前 frame と異なる
- `manualOverrideEntered`: **edge-triggered**。直前 frame で全 slider が inDefaultRange、今 frame で少なくとも 1 つが外れたときのみ 1 frame emit

優先度 (1 frame 複数 trigger): `sourceChanged > geometryJump > handLoss > manualOverrideEntered`

#### reset frame contract

- `controllerArmed = false`、`justArmed = false`
- `triggerEdge = "none"`、`triggerAvailability = "unavailable"`
- `cycleEvent = undefined`
- `resetReason` セット
- `calibrationStatus = "manualOverride"` (manualOverrideEntered) または `"defaultWide"` (他)
- `rawMetricKind` / `rawValue` / `rawUnusableReason` は raw reducer 結果をそのまま露出

### 2.5 FSM (time-based hold + armed gate)

- Scalar: `(open - raw) / (open - pulled)`、clamp [0, 1]
- `pullEnterFirstSeenMs` を state に追加
- threshold cross + `(timestampMs - pullEnterFirstSeenMs) >= PULL_HOLD_DURATION_MS(50ms)` && armed → commit

#### armed=false の frame contract

- `triggerEdge` を `"none"` に強制 (commit edge emit しない)
- `triggerPulled = false` 維持 (latched flag も false)
- 以下の phase 遷移を禁止: `SideTriggerPulledLatched`, `SideTriggerCooldown`
- 許可される phase: `SideTriggerNoHand`, `SideTriggerPoseSearching`, `SideTriggerOpenReady`, `SideTriggerPullCandidate`, `SideTriggerReleaseCandidate` (eviction path), `SideTriggerRecoveringAfterLoss`
- dwell counter / `pullEnterFirstSeenMs` は計測継続 (armed=true 復帰後の同 pull hold が即 commit 評価対象)

#### pullEnterFirstSeenMs の reset trigger

- scalar が `PULL_ENTER_THRESHOLD (0.72)` を下回る
- rawMetric が unusable に変わる
- armed が false になる
- cyclePhase が drop/hold/recovery から open に戻る

(累積時間ではなく、中断したらカウンタやり直し)

### 2.6 Manual Slider (mutex mode)

```text
slider value を inDefaultRange と判定する epsilon = SLIDER_STEP / 2

mode 切替条件:
  - adaptive → manualOverride: いずれかの slider 値が inDefaultRange を外れた瞬間
                                  (manualOverrideEntered を 1 frame 発火)
  - manualOverride → adaptive:  両 slider が inDefaultRange に戻り、3 秒安定した時点
                                  (途中で再度外れたらタイマーリセット)

mode 切替時の adaptive state:
  - manualOverride → adaptive 復帰時、cycle/cal state は defaultWide にリセット
```

### 2.7 オープン論点 (r9 残件)

#### A. Cycle 未検出 fallback

- armed=false のまま継続
- 60 秒経過しても confirmedCycleEvent 未観測 → diagnostic UI に「キャリブレーション失敗」inline indicator
- 復旧手段: manualOverride への切替を促す UX

#### C. Reset 直後 UX

- 状態別 inline indicator:
  - baseline 未準備: 「準備中」
  - baseline ready / armed=false: 「1 回ゆっくり開閉してください」
  - armed=true: 非表示

## Section 3: Data Flow / Telemetry / Observability

### 3.1 1 frame data flow

```text
HandLandmarker frame
  → DetectionInput (sideTrigger)
  → Controller.update(detection, timestampMs):
      ├─ rawReducer → RawMetric
      ├─ detectResetReason → ResetReason?
      ├─ if resetReason:
      │     resetAll()
      │     if "manualOverrideEntered": calibrationReducer.update({resetSignal})
      │     return ControllerOutput { fsmResult: {phase: postReset, fired: false},
      │                               telemetry: buildResetTelemetry(),
      │                               cycleEvent: undefined }
      ├─ cycleSegmenter.update(raw) → CycleResult
      ├─ calibrationReducer.update(...) → CalibrationResult
      ├─ if acceptedCycleEvent && !armed: armed=true, justArmed=true
      ├─ evidenceFor(raw, calResult) → EvidenceState
      └─ fsmReducer.update({raw, evidence, armed: armed && !justArmed, cyclePhase, timestampMs})
            → FsmResult { phase: SideTriggerPhase, fired }
  → ControllerOutput { fsmResult, telemetry, cycleEvent? }
```

### 3.2 Telemetry schema

```ts
import type {
  SideTriggerPhase,
  TriggerEdge,
  TriggerAvailability,
  SideTriggerDwellFrameCounts,
} from "@/shared/types/trigger";

type ControllerTelemetry = {
  timestampMs: number;
  // raw
  rawMetricKind: "usable" | "unusable";
  rawValue?: number;
  rawUnusableReason?: RawMetricUnusableReason;
  // controller state
  controllerArmed: boolean;
  justArmed: boolean;
  baselineWindowReady: boolean;
  cyclePhase: CyclePhase;
  calibrationStatus: "defaultWide" | "cycleReady" | "adaptive" | "manualOverride";
  calibrationSnapshot: { pulled: number; open: number };
  // cycle 直近 (UI 用 1 件、event log は CycleEventTelemetry 全件で別途保持)
  lastAcceptedCycleAtMs?: number;
  lastRejectedCycleReason?: RejectedCycleReason;
  // evidence
  pullEvidenceScalar: number;
  // FSM (既存型)
  fsmPhase: SideTriggerPhase;
  triggerEdge: TriggerEdge;
  triggerAvailability: TriggerAvailability;
  dwellFrameCounts: SideTriggerDwellFrameCounts;  // cooldownRemainingFrames はここ参照
  // reset (該当 frame のみ)
  resetReason?: ResetReason;
};

type CycleEventTelemetry =
  | {
      kind: "accepted";
      timestampMs: number;
      pulledMedian: number;
      openPreMedian: number;
      openPostMedian: number;
      durationMs: number;
    }
  | {
      kind: "rejected";
      timestampMs: number;
      reason: RejectedCycleReason;
      cycleDigest: {
        pulledMedian: number;
        openPreMedian: number;
        openPostMedian: number;
        durationMs: number;
      };
    };
```

#### Event ordering 保証

1 frame 内で reset と cycleEvent が同時発生することはない (reset 時は cycle/cal skip)。reset frame では `cycleEvent = undefined`。

### 3.3 buildResetTelemetry / postResetPhase

```ts
function postResetPhase(state: ControllerState): SideTriggerPhase {
  return state.fsmState.phase;  // resetAll() 後は通常 "SideTriggerNoHand"
}

function buildResetTelemetry(
  state: ControllerState,
  raw: RawMetric,
  resetReason: ResetReason,
  timestampMs: number,
): ControllerTelemetry {
  const rawFields = raw.kind === "usable"
    ? { rawMetricKind: "usable" as const, rawValue: raw.value, rawUnusableReason: undefined }
    : { rawMetricKind: "unusable" as const, rawValue: undefined, rawUnusableReason: raw.reason };

  return {
    timestampMs,
    ...rawFields,
    controllerArmed: false,
    justArmed: false,
    baselineWindowReady: false,
    cyclePhase: "open",
    calibrationStatus:
      resetReason === "manualOverrideEntered" ? "manualOverride" : "defaultWide",
    calibrationSnapshot: {
      pulled: state.calibrationState.pulled,
      open: state.calibrationState.open,
    },
    lastAcceptedCycleAtMs: undefined,
    lastRejectedCycleReason: undefined,
    pullEvidenceScalar: 0,
    fsmPhase: postResetPhase(state),
    triggerEdge: "none",
    triggerAvailability: "unavailable",
    dwellFrameCounts: state.fsmState.dwellFrameCounts,
    resetReason,
  };
}
```

### 3.4 Observability surface

| Surface | 内容 | 用途 |
|---|---|---|
| Diagnostic workbench panel | cyclePhase badge, baselineWindowReady, calibrationStatus chip, lastAcceptedCycle 時刻, lastRejectedCycleReason 直近 1 件, pullEvidenceScalar gauge | dev / 動作確認 |
| Game runtime UI | 状態別 inline indicator (baseline 未準備 / cycle 待ち / armed 後非表示) | end-user UX |
| Console / structured log | event 発火時のみ、`debugSideTrigger` flag (URL `?debug=sideTrigger` / localStorage / dev build) で有効化 | live debug |
| Replay capture | per-frame ControllerTelemetry + 全 CycleEventTelemetry (M2 milestone、M1 では型予約のみ) | 後追い解析 / regression |

#### Sampling policy

- UI: 毎 frame
- Console: event only (accepted / rejected / reset)
- Capture: per-frame telemetry + 全 cycle event

### 3.5 Capture format (M2 で実装)

```ts
type ReplayDetectionInput = {
  hand?: {
    landmarks: ReadonlyArray<{ x: number; y: number; z: number }>;
    worldLandmarks: ReadonlyArray<{ x: number; y: number; z: number }>;
    handedness: "Left" | "Right";
    confidence: number;
  };
  sideViewQuality: SideViewQuality;
  sourceKeyHash: string;          // 生 deviceId は含めない
  geometrySignatureHash: string;
};

type ReplayCaptureFrame = {
  timestampMs: number;
  input: { detection: ReplayDetectionInput };
  observed?: {
    telemetry: ControllerTelemetry;
    cycleEvent?: CycleEventTelemetry;
  };
};

type ReplayCaptureFile = {
  schemaVersion: "r9";
  capturedAt: string;
  source: "live" | "synthetic";
  notes?: string;
  privacy: {
    containsLandmarks: true;
    containsImages: false;
    containsRawDeviceId: false;
  };
  frames: ReadonlyArray<ReplayCaptureFrame>;
};
```

#### Replay test mode

- **regression**: input 再投入 → 新 telemetry 計算 → `observed.telemetry` と比較。numeric field は float tolerance (±1e-6) 適用
- **behavior-only**: input 再投入 → KPI (sens / FP / latency) のみ計測、observed 無視

#### Privacy / size

- landmarks/worldLandmarks のみ、画像なし
- 生 deviceId は含めない (`sourceKeyHash` で代替)
- `iterations/*.json` は git ignore (既存通り)
- 上限目安: 30s @ 60fps ≒ 1800 frame、~3-5MB

#### Timestamp source

HandLandmarker `frameTimestampMs` 採用、欠落時 `performance.now()` fallback。

### 3.6 既存 telemetry / capture migration (breaking changes 明示)

- 既存 `SideTriggerTelemetry` → `ControllerTelemetry` に統合。**breaking changes**:
  - `calibrationStatus` の値域が `"default" | "liveTuning"` (既存) から `"defaultWide" | "cycleReady" | "adaptive" | "manualOverride"` に変わる
  - `releaseEvidenceScalar` field は削除 (r9 では FSM 内部状態のみ、telemetry 露出なし)
  - `triggerPostureConfidence` / `shotCandidateConfidence` の扱いは r9 では controller 出力に残すか FSM 内部か実装時確定
- 既存 `SideTriggerCalibrationSnapshot` → `calibrationSnapshot` field として埋め込み。構造 (pulled/open の 2 値) は維持、field 名は r9 で `{ pulled; open }` に簡略化
- 既存 `SideTriggerCalibrationStatus` 型 (`"default" | "liveTuning"`) は r9 では使わない。削除または別用途 (slider UI 用) に残す判断は実装時
- `renderSideTriggerPanel.ts`: 既存の `phase` / `edge` / `calibration` / `pullEvidenceScalar` / `releaseEvidenceScalar` 参照を新 telemetry の `fsmPhase` / `triggerEdge` / `calibrationSnapshot` / `pullEvidenceScalar` に migrate
  - 新規 render 追加: `cyclePhase` badge, `calibrationStatus` chip, `baselineWindowReady` indicator, `lastRejectedCycleReason`, `controllerArmed` indicator
  - `releaseEvidenceScalar` 依存 render は削除または `pullEvidenceScalar` に寄せる
- 既存 r8 capture (`iterations/*.json`) は r9 `ReplayCaptureFile` schema とは別物。別 r8 adapter で `input.detection` のみ抽出、`observed` は不在扱い。behavior-only mode で KPI 比較は可能。
- r8 telemetry の optional `sideTriggerAdaptiveCalibration` field は r9 では読み捨て。controller 側の `ControllerTelemetry` を新しい optional field (`sideTriggerControllerTelemetry` 等) として追加するか既存 field を再利用するかは実装時判断。

## Section 4: テスト戦略

### 4.1 Unit テスト (各 reducer 単体)

- `extractSideTriggerRawMetric` → `RawMetric` map ロジック (5 ケース: noHand / quality reject / no worldLandmarks / geometry unavailable / usable)
- `cycleSegmenter`:
  - state machine 遷移 (Open→Drop→Hold→Recovery→PendingPostOpen→Confirmed)
  - baseline 凍結 (cycle 中 baselineBuffer 非更新)
  - baselineWindowReady gate (cold start で cycle 検出抑制)
  - holdSamples 収集範囲 (Drop 開始後継続)
  - amplitude-based recovery threshold
  - stableOpenObservation 発行間隔
- `calibrationReducer`:
  - state 遷移 (defaultWide → cycleReady → adaptive)
  - sanity check 5 種で reject 判定
  - rejectedCycleEvent の構築
  - manualOverride mode 切替
  - stableOpen と cycle の合成優先順位
- `fsmReducer`:
  - time-based hold (50ms) で commit
  - armed=false で edge 禁止 (state 含めて)
  - pullEnterFirstSeenMs reset trigger 4 種

### 4.2 Controller integration テスト

- 1 frame orchestration (raw → cycle → cal → evidence → fsm 順)
- armed gate (acceptedCycleEvent 受領後 armed=true、justArmed で同 frame commit 抑制)
- reset orchestration (各 ResetReason で resetAll → reset telemetry 返す、manualOverrideEntered だけ cal も呼ぶ)
- manual override mode 切替 (slider 操作 → manualOverride、3s 復帰 → adaptive + cal reset)

### 4.3 Replay opt-in テスト

- 4 capture (sens / cold idle / warmed idle / past sens) で behavior-only mode KPI 計測
- target:
  - sens: ≥ 19 / 20
  - warmed-idle 0-5s FP: 0
  - warmed-idle total FP: 0
  - past sens: ≥ 18
  - latency: ≤ 60ms (M3-light)
- regression mode は M2 capture format 実装後に活用

### 4.4 既存テスト互換

- `tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts` は r8 想定のため、r9 では新 controller を入力して書き換え
- `renderSideTriggerPanel.test.ts` は新 telemetry に migrate

## Section 5: ロールアウト方針

### Phase 0 — preparation (本実装範囲)

- 4 層 + Controller の新規実装
- 既存 r8 reducer (`sideTriggerAdaptiveCalibration.ts`) を controller に置き換え
- balloonGameRuntime.ts の wiring 切替
- diagnostic workbench の telemetry 表示 migration

### Phase 1 — implementation

- TDD で各 reducer を unit test 駆動実装
- controller integration test で orchestration 確認
- balloonGameRuntime.ts 切替後、ゲーム内動作確認 (live test)
- replay opt-in test で 4 capture KPI 検証

### Phase 2 — observation (PoC 後)

- 複数ユーザの telemetry を集めて constants 調整 (DROP_THRESHOLD, HOLD_DURATION_MS, RECOVERY_RATIO 等)
- diagnostic UI 改善
- M2 (Timestamped Diagnostic Capture) 実装 → regression mode 活用

### Phase 3 — future

- cycle 検出の robustness 強化 (multi-finger 等)
- 自動キャリブの収束を加速する仕組み (事前学習プリセット等)

## Section 6: オープン論点

- `DROP_THRESHOLD = 0.05` / `HOLD_DURATION_MS = 50` / `RECOVERY_RATIO = 0.80` / `BASELINE_WINDOW_MS = 300` / `STABLE_OPEN_INTERVAL_MS = 500` / `POST_OPEN_WINDOW_MS = 200` は capture 由来。Phase 2 で複数ユーザ実測値ベースに調整余地あり
- `MIN_SPAN = 0.05` は既存 `MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN` に揃える
- α_pull / α_open_cycle / α_open_assist の数値は短期 capture 由来。Phase 2 で調整可
- Cycle 60 秒未検出時の UX (manualOverride 誘導) の文言・UI は別 PR で詳細詰め
- M2 capture format の実装 (本 spec では schema のみ予約)
- M1 で console structured log の `debugSideTrigger` flag 経路 (URL / localStorage / dev build) のうちどれを最初に実装するかは実装時判断
- r8 で `releaseEvidenceScalar` を telemetry に露出していた箇所の retrofit 影響範囲は実装時調査

## 改訂履歴

時系列順 (古い → 新しい)。各版は直前版を supersede する。

- 2026-04-19 r1〜r8: r8 spec (`2026-04-19-adaptive-side-trigger-calibration-design.md`) に集約。sliding-window p20/p80 による adaptive calibration 設計。実装は PR #25 / #26 でマージ済み
- 2026-04-23 改訂 r9: 現地 specificity 検証で 9 FP/30s が判明、cycle-driven calibration へ全面再設計
  - 4 層 + Controller アーキテクチャに分離 (Raw / CycleSegmenter / CalibrationReducer / FSM + Controller)
  - sliding-window 廃止、確認済み cycle event のみで cal 学習
  - 起動直後 `armed=false`、初 cycle 完了で `armed=true` (M3-light、UX として「1 回練習で発射可」)
  - reset 時 `armed=false` リセット (handLoss / geometryJump / sourceChanged / manualOverrideEntered)
  - frame-count dwell → time-based hold (50ms) へ移行
  - false cycle reject (5 種 sanity check)
  - manualOverride mode を mutex で導入、slider 操作で adaptive を一時停止
  - 既存 SideTriggerPhase / TriggerEdge / TriggerAvailability 型を維持、互換性確保
  - capture format を r9 専用 schema (`ReplayCaptureFile`) として定義 (実装は M2)
  - replay test を 3 段階 (unit / controller integration / replay opt-in) に再整理
  - r8 spec を supersede
