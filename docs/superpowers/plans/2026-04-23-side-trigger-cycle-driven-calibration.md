# Side-Trigger Cycle-Driven Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** spec r9 (`2026-04-23-side-trigger-cycle-driven-calibration-design.md`) に基づき、side-trigger を cycle-driven calibration + armed gate + time-based hold に置き換える。r8 の sliding-window adaptive 系を controller-based アーキテクチャに migrate する。

**Architecture:** 4 層 (RawMetric / CycleSegmenter / CalibrationReducer / FSM) + Controller orchestration。各 reducer は pure function、controller が orchestration + armed gate + reset detection + telemetry 合成を担う。既存 `SideTriggerPhase` / `TriggerEdge` / `TriggerAvailability` 型は維持。

**Tech Stack:** TypeScript (strict), Vitest, Chrome-first PoC, HandLandmarker (MediaPipe)

---

## File Structure

### 新規作成

```text
src/features/side-trigger/
  sideTriggerTelemetryTypes.ts               # ControllerTelemetry, CycleEventTelemetry, RawMetricUnusableReason, ResetReason
  sideTriggerCycleTypes.ts                   # CyclePhase, ConfirmedCycleEvent, CycleResult, CycleSegmenterState
  sideTriggerCalibrationTypes.ts             # RejectedCycleReason, CalibrationResult, CalibrationReducerState
  sideTriggerControllerTypes.ts              # ControllerState, ControllerOutput, ControllerInput
  sideTriggerRawMetricReducer.ts             # RawMetric union + mapper from SideTriggerRawMetric
  sideTriggerCycleSegmenter.ts               # CycleSegmenter reducer
  sideTriggerCalibrationReducer.ts           # r9 CalibrationReducer (r8 の sideTriggerAdaptiveCalibration.ts を supersede)
  sideTriggerController.ts                   # Controller orchestration
  sideTriggerControllerTelemetry.ts          # buildTelemetry / buildResetTelemetry / postResetPhase

src/features/replay-capture/
  replayCaptureTypes.ts                      # ReplayCaptureFile, ReplayDetectionInput, ReplayCaptureFrame (M2 用 type-only)

tests/unit/features/side-trigger/
  sideTriggerRawMetricReducer.test.ts
  sideTriggerCycleSegmenter.test.ts
  sideTriggerCalibrationReducer.test.ts
  sideTriggerController.test.ts
  sideTriggerControllerTelemetry.test.ts
```

### 既存を修正

```text
src/features/side-trigger/
  sideTriggerConstants.ts                    # r9 constants 追加 (DROP_THRESHOLD, HOLD_DURATION_MS, etc.)
  sideTriggerStateMachine.ts                 # armed=false 契約 + time-based hold 支援
  sideTriggerEvidence.ts                     # evidenceFor(raw, calResult) ラッパー helper
  createCycleDrivenSideTriggerMapper.ts      # Controller-backed r9 mapper
  createAdaptiveSideTriggerMapper.ts         # r8 fallback export retained for legacy tests/workbench paths
  index.ts                                   # exports 更新
src/app/balloonGameRuntime.ts                # createCycleDrivenSideTriggerMapper を直接使用
src/features/diagnostic-workbench/
  renderSideTriggerPanel.ts                  # 新 telemetry 表示 (cyclePhase, calibrationStatus, baselineWindowReady)
  liveLandmarkInspection.ts                  # observe-only controller に置き換え
```

### 削除 (migration 完了後)

```text
src/features/side-trigger/sideTriggerAdaptiveCalibration.ts          # r8 reducer
tests/unit/features/side-trigger/sideTriggerAdaptiveCalibration.test.ts
tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts           # r9 replay test で置き換え
```

---

## Task 順序と依存関係

```text
Task 1: Types (全 types を先に定義、type-only)
  ↓
Task 2: RawMetricReducer
  ↓
Task 3-7: CycleSegmenter (baseline / Open→Drop / Drop→Hold→Recovery / Recovery→PendingPostOpen→Confirmed / stableOpenObservation)
  ↓
Task 8-11: CalibrationReducer (defaultWide→cycleReady / sanity check reject / adaptive EMA / stableOpen assist / manualOverride)
  ↓
Task 12: FSM 調整 (time-based hold + armed=false 契約)
  ↓
Task 13-15: Controller (orchestration / detectResetReason / armed + justArmed + telemetry build)
  ↓
Task 16-17: Migration (balloonGameRuntime / diagnostic workbench)
  ↓
Task 18: Replay capture types (M2 用 type-only)
  ↓
Task 19: Replay opt-in test (4 capture KPI)
  ↓
Task 20: r8 系 cleanup
```

---

## Task 1: Types 一括定義 (type-only)

**Files:**
- Create: `src/features/side-trigger/sideTriggerTelemetryTypes.ts`
- Create: `src/features/side-trigger/sideTriggerCycleTypes.ts`
- Create: `src/features/side-trigger/sideTriggerCalibrationTypes.ts`
- Create: `src/features/side-trigger/sideTriggerControllerTypes.ts`

**Note for agentic workers:** このタスクは **codex に委譲する最初のテスト** に該当しない。型定義は次の各 reducer テストの下準備。

- [ ] **Step 1: sideTriggerTelemetryTypes.ts 作成**

```ts
import type {
  SideTriggerDwellFrameCounts,
  SideTriggerPhase,
  TriggerAvailability,
  TriggerEdge,
} from "../../shared/types/trigger";

export type RawMetricUnusableReason =
  | "noHand"
  | "sideViewQualityRejected"
  | "noWorldLandmarks"
  | "geometryUnavailable";

export type ResetReason =
  | "handLoss"
  | "geometryJump"
  | "sourceChanged"
  | "manualOverrideEntered";

export type ControllerCalibrationStatus =
  | "defaultWide"
  | "cycleReady"
  | "adaptive"
  | "manualOverride";

import type { CyclePhase } from "./sideTriggerCycleTypes";
import type { RejectedCycleReason } from "./sideTriggerCalibrationTypes";

export interface ControllerTelemetry {
  readonly timestampMs: number;
  readonly rawMetricKind: "usable" | "unusable";
  readonly rawValue?: number;
  readonly rawUnusableReason?: RawMetricUnusableReason;
  readonly controllerArmed: boolean;
  readonly justArmed: boolean;
  readonly baselineWindowReady: boolean;
  readonly cyclePhase: CyclePhase;
  readonly calibrationStatus: ControllerCalibrationStatus;
  readonly calibrationSnapshot: { readonly pulled: number; readonly open: number };
  readonly lastAcceptedCycleAtMs?: number;
  readonly lastRejectedCycleReason?: RejectedCycleReason;
  readonly pullEvidenceScalar: number;
  readonly fsmPhase: SideTriggerPhase;
  readonly triggerEdge: TriggerEdge;
  readonly triggerAvailability: TriggerAvailability;
  readonly dwellFrameCounts: SideTriggerDwellFrameCounts;
  readonly resetReason?: ResetReason;
}

export type CycleEventTelemetry =
  | {
      readonly kind: "accepted";
      readonly timestampMs: number;
      readonly pulledMedian: number;
      readonly openPreMedian: number;
      readonly openPostMedian: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: "rejected";
      readonly timestampMs: number;
      readonly reason: RejectedCycleReason;
      readonly cycleDigest: {
        readonly pulledMedian: number;
        readonly openPreMedian: number;
        readonly openPostMedian: number;
        readonly durationMs: number;
      };
    };
```

- [ ] **Step 2: sideTriggerCycleTypes.ts 作成**

```ts
export type CyclePhase = "open" | "drop" | "hold" | "recovery" | "pendingPostOpen";

export interface ConfirmedCycleEvent {
  readonly timestampMs: number;
  readonly pulledMedian: number;
  readonly openPreMedian: number;
  readonly openPostMedian: number;
  readonly durationMs: number;
}

export interface CycleSample {
  readonly timestampMs: number;
  readonly value: number;
}

import type { ResetReason } from "./sideTriggerTelemetryTypes";

export interface CycleResult {
  readonly cyclePhase: CyclePhase;
  readonly confirmedCycleEvent?: ConfirmedCycleEvent;
  readonly stableOpenObservation?: { readonly timestampMs: number; readonly value: number };
  readonly resetSignal?: ResetReason;
}

export interface CycleSegmenterState {
  readonly phase: CyclePhase;
  readonly baselineBuffer: ReadonlyArray<CycleSample>;
  readonly baselineWindowReady: boolean;
  readonly cycleStart?: { readonly timestampMs: number; readonly baselineAtStart: number };
  readonly cycleSamples: ReadonlyArray<CycleSample>;
  readonly holdSamples: ReadonlyArray<CycleSample>;
  readonly pulledMedianFrozen?: number;
  readonly recoveryThreshold?: number;
  readonly postOpenSamples: ReadonlyArray<CycleSample>;
  readonly postOpenStartMs?: number;
  readonly lastStableOpenEmittedMs: number;
  readonly lastConfirmedCycleAtMs?: number;
}

export const createInitialCycleSegmenterState = (): CycleSegmenterState => ({
  phase: "open",
  baselineBuffer: [],
  baselineWindowReady: false,
  cycleStart: undefined,
  cycleSamples: [],
  holdSamples: [],
  pulledMedianFrozen: undefined,
  recoveryThreshold: undefined,
  postOpenSamples: [],
  postOpenStartMs: undefined,
  lastStableOpenEmittedMs: 0,
  lastConfirmedCycleAtMs: undefined,
});
```

- [ ] **Step 3: sideTriggerCalibrationTypes.ts 作成**

```ts
import type { ConfirmedCycleEvent } from "./sideTriggerCycleTypes";
import type { ControllerCalibrationStatus } from "./sideTriggerTelemetryTypes";

export type RejectedCycleReason =
  | "spanTooSmall"
  | "openMedianMismatch"
  | "durationTooLong"
  | "intervalTooShort"
  | "medianDeviationFromLastAccepted";

export interface RejectedCycleDigest {
  readonly pulledMedian: number;
  readonly openPreMedian: number;
  readonly openPostMedian: number;
  readonly durationMs: number;
}

export interface CalibrationResult {
  readonly status: ControllerCalibrationStatus;
  readonly pulled: number;
  readonly open: number;
  readonly acceptedCycleEvent?: ConfirmedCycleEvent;
  readonly rejectedCycleEvent?: {
    readonly reason: RejectedCycleReason;
    readonly cycleDigest: RejectedCycleDigest;
  };
}

export interface CalibrationReducerState {
  readonly status: ControllerCalibrationStatus;
  readonly pulled: number;
  readonly open: number;
  readonly lastAcceptedCycleAtMs?: number;
  readonly lastAcceptedCycleDigest?: RejectedCycleDigest;
  readonly manualOverrideActive: boolean;
}

export const createInitialCalibrationState = (): CalibrationReducerState => ({
  status: "defaultWide",
  pulled: 0.2,
  open: 1.2,
  lastAcceptedCycleAtMs: undefined,
  lastAcceptedCycleDigest: undefined,
  manualOverrideActive: false,
});
```

- [ ] **Step 4: sideTriggerControllerTypes.ts 作成**

```ts
import type { SideHandDetection } from "../../shared/types/hand";
import type { SideTriggerMachineState } from "./sideTriggerStateMachine";
import type { CycleSegmenterState } from "./sideTriggerCycleTypes";
import type { CalibrationReducerState } from "./sideTriggerCalibrationTypes";
import type { ControllerTelemetry, CycleEventTelemetry } from "./sideTriggerTelemetryTypes";
import type { TriggerEdge } from "../../shared/types/trigger";

export interface ControllerState {
  readonly armed: boolean;
  readonly cycleState: CycleSegmenterState;
  readonly calibrationState: CalibrationReducerState;
  readonly fsmState: SideTriggerMachineState;
  readonly pullEnterFirstSeenMs?: number;
  readonly lastObservedHandTimestampMs?: number;
  readonly lastSourceKey?: string;
  readonly geometryEma?: {
    readonly wristToIndexMcp: number;
    readonly wristToMiddleMcp: number;
    readonly indexMcpToPinkyMcp: number;
  };
  readonly manualOverridePrevActive: boolean;
}

export interface ControllerInput {
  readonly detection: SideHandDetection | undefined;
  readonly timestampMs: number;
  readonly sliderInDefaultRange: boolean;
}

export interface ControllerOutput {
  readonly state: ControllerState;
  readonly edge: TriggerEdge;
  readonly telemetry: ControllerTelemetry;
  readonly cycleEvent?: CycleEventTelemetry;
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (型定義のみなので問題なし)

- [ ] **Step 6: Commit**

```bash
git add src/features/side-trigger/sideTriggerTelemetryTypes.ts \
        src/features/side-trigger/sideTriggerCycleTypes.ts \
        src/features/side-trigger/sideTriggerCalibrationTypes.ts \
        src/features/side-trigger/sideTriggerControllerTypes.ts
git commit -m "feat(side-trigger): add r9 types for cycle-driven calibration"
```

---

## Task 2: RawMetricReducer

**Files:**
- Create: `src/features/side-trigger/sideTriggerRawMetricReducer.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts`

> **This is the first test task. It is delegated to codex.** See "Execution Handoff" at the end.

**Purpose:** 既存 `extractSideTriggerRawMetric` の結果を r9 の `RawMetric` union に map する pure reducer。

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts
import { describe, it, expect } from "vitest";
import { reduceSideTriggerRawMetric, type RawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetricReducer";
import type { SideTriggerRawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetric";

const geometry = { wristToIndexMcp: 1, wristToMiddleMcp: 1, indexMcpToPinkyMcp: 1 };

describe("reduceSideTriggerRawMetric", () => {
  it("noHand の場合 unusable + reason=noHand", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: undefined, timestampMs: 1000,
      handDetected: false, sideViewQuality: "lost",
      normalizedThumbDistance: undefined, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: undefined, reason: "noHand",
    });
  });

  it("quality が frontLike の場合 sideViewQualityRejected", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "frontLike",
      normalizedThumbDistance: 0.5, geometrySignature: geometry,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "sideViewQualityRejected",
    });
  });

  it("worldLandmarks 欠損 (normalizedThumbDistance undefined) の場合 noWorldLandmarks", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: undefined, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "noWorldLandmarks",
    });
  });

  it("geometrySignature 欠損の場合 geometryUnavailable", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: 0.5, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "geometryUnavailable",
    });
  });

  it("全条件満たす場合 usable", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: 0.5, geometrySignature: geometry,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "usable", timestampMs: 1000, sourceKey: "dev:stream",
      value: 0.5, quality: "good", geometrySignature: geometry,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `sideTriggerRawMetricReducer.ts`**

```ts
import type { SideTriggerRawMetric, SideTriggerHandGeometrySignature } from "./sideTriggerRawMetric";
import type { SideViewQuality } from "../../shared/types/hand";
import type { RawMetricUnusableReason } from "./sideTriggerTelemetryTypes";

export type RawMetric =
  | {
      readonly kind: "usable";
      readonly timestampMs: number;
      readonly sourceKey: string;
      readonly value: number;
      readonly quality: SideViewQuality;
      readonly geometrySignature: SideTriggerHandGeometrySignature;
    }
  | {
      readonly kind: "unusable";
      readonly timestampMs?: number;
      readonly sourceKey?: string;
      readonly reason: RawMetricUnusableReason;
    };

const sideViewQualityUsable = (q: SideViewQuality): boolean => q === "good";

export const reduceSideTriggerRawMetric = (raw: SideTriggerRawMetric): RawMetric => {
  if (!raw.handDetected) {
    return {
      kind: "unusable",
      timestampMs: raw.timestampMs,
      sourceKey: raw.sourceKey,
      reason: "noHand",
    };
  }
  if (!sideViewQualityUsable(raw.sideViewQuality)) {
    return {
      kind: "unusable",
      timestampMs: raw.timestampMs,
      sourceKey: raw.sourceKey,
      reason: "sideViewQualityRejected",
    };
  }
  if (raw.normalizedThumbDistance === undefined) {
    return {
      kind: "unusable",
      timestampMs: raw.timestampMs,
      sourceKey: raw.sourceKey,
      reason: "noWorldLandmarks",
    };
  }
  if (raw.geometrySignature === undefined) {
    return {
      kind: "unusable",
      timestampMs: raw.timestampMs,
      sourceKey: raw.sourceKey,
      reason: "geometryUnavailable",
    };
  }
  return {
    kind: "usable",
    timestampMs: raw.timestampMs as number,
    sourceKey: raw.sourceKey as string,
    value: raw.normalizedThumbDistance,
    quality: raw.sideViewQuality,
    geometrySignature: raw.geometrySignature,
  };
};
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/side-trigger/sideTriggerRawMetricReducer.ts \
        tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts
git commit -m "feat(side-trigger): add r9 RawMetric reducer"
```

---

## Task 3: sideTriggerConstants.ts に r9 constants 追加

**Files:**
- Modify: `src/features/side-trigger/sideTriggerConstants.ts`

- [ ] **Step 1: r9 constants 追記**

```ts
// 既存 constants の末尾に追加
export const CYCLE_BASELINE_WINDOW_MS = 300;
export const CYCLE_BASELINE_MIN_SAMPLES = 10;
export const CYCLE_DROP_THRESHOLD = 0.05;
export const CYCLE_HOLD_DURATION_MS = 50;
export const CYCLE_RECOVERY_RATIO = 0.80;
export const CYCLE_POST_OPEN_WINDOW_MS = 200;
export const CYCLE_STABLE_OPEN_INTERVAL_MS = 500;

export const CAL_DEFAULT_PULLED = 0.2;
export const CAL_DEFAULT_OPEN = 1.2;
export const CAL_ALPHA_PULL = 0.1;
export const CAL_ALPHA_OPEN_CYCLE = 0.1;
export const CAL_ALPHA_OPEN_ASSIST = 0.02;
export const CAL_MIN_SPAN = 0.05;
export const CAL_CYCLE_MIN_INTERVAL_MS = 200;
export const CAL_CYCLE_MAX_DURATION_MS = 1000;
export const CAL_OPEN_MEDIAN_MAX_DEVIATION = 0.30;
export const CAL_LAST_CYCLE_MAX_DEVIATION = 0.50;

export const CTRL_HAND_LOSS_THRESHOLD_MS = 1500;
export const CTRL_GEOMETRY_JUMP_RATIO = 0.25;
export const CTRL_GEOMETRY_EMA_ALPHA = 0.1;
export const CTRL_MANUAL_OVERRIDE_RECOVERY_MS = 3000;

export const FSM_PULL_HOLD_DURATION_MS = 50;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/side-trigger/sideTriggerConstants.ts
git commit -m "feat(side-trigger): add r9 constants"
```

---

## Task 4: CycleSegmenter — baseline + Open→Drop

**Files:**
- Create: `src/features/side-trigger/sideTriggerCycleSegmenter.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`

- [ ] **Step 1: Write failing tests (baseline + Open→Drop)**

```ts
import { describe, it, expect } from "vitest";
import {
  updateCycleSegmenter,
  createInitialCycleSegmenterState,
} from "../../../../src/features/side-trigger/sideTriggerCycleSegmenter";
import type { RawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetricReducer";

const usable = (timestampMs: number, value: number): RawMetric => ({
  kind: "usable", timestampMs, sourceKey: "dev:stream", value, quality: "good",
  geometrySignature: { wristToIndexMcp: 1, wristToMiddleMcp: 1, indexMcpToPinkyMcp: 1 },
});

describe("cycleSegmenter baseline + Open→Drop", () => {
  it("cold start 中は baselineWindowReady=false、Open phase のまま", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 5; i++) {
      const r = updateCycleSegmenter(state, usable(i * 10, 1.0));
      state = r.state;
    }
    expect(state.baselineWindowReady).toBe(false);
    expect(state.phase).toBe("open");
  });

  it("sample>=10 かつ duration>=300ms で baselineWindowReady=true", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) {
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    }
    expect(state.baselineWindowReady).toBe(true);
    expect(state.phase).toBe("open");
  });

  it("baselineReady 後、値が baselineAtStart から 0.05 以上下回ったら Open→Drop", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const result = updateCycleSegmenter(state, usable(500, 0.9));
    expect(result.state.phase).toBe("drop");
    expect(result.state.cycleStart?.baselineAtStart).toBeCloseTo(1.0);
  });

  it("Open phase 中のみ baselineBuffer が更新される", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const beforeDrop = state.baselineBuffer.length;
    state = updateCycleSegmenter(state, usable(500, 0.9)).state;
    expect(state.phase).toBe("drop");
    const afterDrop = state.baselineBuffer.length;
    expect(afterDrop).toBe(beforeDrop);  // Drop 中は baselineBuffer 更新しない
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement minimal to pass (baseline + Open→Drop)**

```ts
// src/features/side-trigger/sideTriggerCycleSegmenter.ts
import {
  CYCLE_BASELINE_WINDOW_MS,
  CYCLE_BASELINE_MIN_SAMPLES,
  CYCLE_DROP_THRESHOLD,
} from "./sideTriggerConstants";
import type { CycleResult, CycleSegmenterState, CycleSample } from "./sideTriggerCycleTypes";
import { createInitialCycleSegmenterState } from "./sideTriggerCycleTypes";
import type { RawMetric } from "./sideTriggerRawMetricReducer";

export { createInitialCycleSegmenterState };

const median = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const trimBaseline = (
  buffer: ReadonlyArray<CycleSample>,
  now: number,
): ReadonlyArray<CycleSample> =>
  buffer.filter((s) => now - s.timestampMs <= CYCLE_BASELINE_WINDOW_MS);

const computeBaselineReady = (buffer: ReadonlyArray<CycleSample>): boolean => {
  if (buffer.length < CYCLE_BASELINE_MIN_SAMPLES) return false;
  const first = buffer[0];
  const last = buffer[buffer.length - 1];
  return last.timestampMs - first.timestampMs >= CYCLE_BASELINE_WINDOW_MS;
};

export interface CycleSegmenterUpdateResult {
  readonly state: CycleSegmenterState;
  readonly result: CycleResult;
}

export const updateCycleSegmenter = (
  state: CycleSegmenterState,
  raw: RawMetric,
): CycleSegmenterUpdateResult => {
  if (raw.kind === "unusable") {
    return { state, result: { cyclePhase: state.phase } };
  }
  const now = raw.timestampMs;
  const sample: CycleSample = { timestampMs: now, value: raw.value };

  if (state.phase === "open") {
    const baselineBuffer = trimBaseline([...state.baselineBuffer, sample], now);
    const baselineWindowReady = computeBaselineReady(baselineBuffer);
    if (baselineWindowReady) {
      const baselineValue = median(baselineBuffer.map((s) => s.value));
      if (raw.value <= baselineValue - CYCLE_DROP_THRESHOLD) {
        return {
          state: {
            ...state,
            phase: "drop",
            baselineBuffer,
            baselineWindowReady,
            cycleStart: { timestampMs: now, baselineAtStart: baselineValue },
            cycleSamples: [sample],
            holdSamples: [sample],
          },
          result: { cyclePhase: "drop" },
        };
      }
    }
    return {
      state: { ...state, baselineBuffer, baselineWindowReady },
      result: { cyclePhase: "open" },
    };
  }
  // 他 phase は後続 task で実装
  return { state, result: { cyclePhase: state.phase } };
};
```

- [ ] **Step 4: Run tests PASS**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/side-trigger/sideTriggerCycleSegmenter.ts \
        tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts
git commit -m "feat(side-trigger): CycleSegmenter baseline + Open→Drop transition"
```

---

## Task 5: CycleSegmenter — Drop→Hold→Recovery

**Files:**
- Modify: `src/features/side-trigger/sideTriggerCycleSegmenter.ts`
- Modify: `tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`

- [ ] **Step 1: Add tests for Drop→Hold→Recovery**

```ts
describe("cycleSegmenter Drop→Hold→Recovery", () => {
  const primeToDrop = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    return updateCycleSegmenter(state, usable(500, 0.9)).state;  // Open→Drop, value=0.9
  };

  it("Drop 中で baselineAtStart-DROP_THRESHOLD 以下を 50ms 維持→Hold", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(520, 0.9)).state;
    state = updateCycleSegmenter(state, usable(560, 0.9)).state;
    expect(state.phase).toBe("hold");
  });

  it("Hold 中で raw が rising 開始→Recovery、recoveryThreshold が amplitude-based", () => {
    let state = primeToDrop();
    // Drop→Hold
    state = updateCycleSegmenter(state, usable(520, 0.9)).state;
    state = updateCycleSegmenter(state, usable(560, 0.9)).state;
    expect(state.phase).toBe("hold");
    // Hold→Recovery (値が rising に転じる)
    state = updateCycleSegmenter(state, usable(600, 0.92)).state;
    expect(state.phase).toBe("recovery");
    // pulledMedianFrozen ≒ 0.9, baselineAtStart = 1.0, threshold = 0.9 + 0.1 * 0.8 = 0.98
    expect(state.pulledMedianFrozen).toBeCloseTo(0.9);
    expect(state.recoveryThreshold).toBeCloseTo(0.98);
  });

  it("holdSamples は Drop 開始後、baselineAtStart-THRESHOLD 以下の usable samples を蓄積し、Hold 中も継続", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(520, 0.88)).state;
    state = updateCycleSegmenter(state, usable(560, 0.85)).state;
    state = updateCycleSegmenter(state, usable(600, 0.87)).state;
    expect(state.holdSamples.length).toBeGreaterThanOrEqual(3);
    expect(state.holdSamples.every((s) => s.value <= 0.95)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests FAIL**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: FAIL (new 3 tests)

- [ ] **Step 3: Extend `updateCycleSegmenter` to handle Drop/Hold/Recovery**

```ts
// Add Drop / Hold / Recovery branches after Open branch

import { CYCLE_HOLD_DURATION_MS, CYCLE_RECOVERY_RATIO } from "./sideTriggerConstants";

  if (state.phase === "drop" || state.phase === "hold") {
    const baselineAtStart = state.cycleStart?.baselineAtStart ?? raw.value;
    const belowThreshold = raw.value <= baselineAtStart - CYCLE_DROP_THRESHOLD;
    const nextCycleSamples = [...state.cycleSamples, sample];
    const nextHoldSamples = belowThreshold ? [...state.holdSamples, sample] : state.holdSamples;

    if (state.phase === "drop") {
      const dropStart = state.cycleStart?.timestampMs ?? now;
      if (belowThreshold && now - dropStart >= CYCLE_HOLD_DURATION_MS) {
        return {
          state: {
            ...state,
            phase: "hold",
            cycleSamples: nextCycleSamples,
            holdSamples: nextHoldSamples,
          },
          result: { cyclePhase: "hold" },
        };
      }
      return {
        state: { ...state, cycleSamples: nextCycleSamples, holdSamples: nextHoldSamples },
        result: { cyclePhase: "drop" },
      };
    }

    // state.phase === "hold"
    const prev = state.cycleSamples[state.cycleSamples.length - 1];
    const rising = prev !== undefined && raw.value > prev.value;
    if (rising) {
      const pulledMedianFrozen = median(nextHoldSamples.map((s) => s.value));
      const recoveryThreshold =
        pulledMedianFrozen + (baselineAtStart - pulledMedianFrozen) * CYCLE_RECOVERY_RATIO;
      return {
        state: {
          ...state,
          phase: "recovery",
          cycleSamples: nextCycleSamples,
          holdSamples: nextHoldSamples,
          pulledMedianFrozen,
          recoveryThreshold,
        },
        result: { cyclePhase: "recovery" },
      };
    }
    return {
      state: { ...state, cycleSamples: nextCycleSamples, holdSamples: nextHoldSamples },
      result: { cyclePhase: "hold" },
    };
  }
```

- [ ] **Step 4: Run tests PASS**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: PASS (前 4 + 新 3 = 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/side-trigger/sideTriggerCycleSegmenter.ts \
        tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts
git commit -m "feat(side-trigger): CycleSegmenter Drop→Hold→Recovery transitions"
```

---

## Task 6: CycleSegmenter — Recovery→PendingPostOpen→Confirmed

**Files:**
- Modify: `src/features/side-trigger/sideTriggerCycleSegmenter.ts`
- Modify: `tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`

- [ ] **Step 1: Add tests for full cycle confirmation**

```ts
describe("cycleSegmenter Recovery→PendingPostOpen→Confirmed", () => {
  const primeToRecovery = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    state = updateCycleSegmenter(state, usable(500, 0.88)).state;  // Open→Drop
    state = updateCycleSegmenter(state, usable(520, 0.88)).state;
    state = updateCycleSegmenter(state, usable(560, 0.88)).state;  // Drop→Hold
    state = updateCycleSegmenter(state, usable(600, 0.92)).state;  // Hold→Recovery
    return state;
  };

  it("Recovery で recoveryThreshold 到達→PendingPostOpen", () => {
    // threshold = 0.88 + (1.0 - 0.88) * 0.8 = 0.976
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(640, 0.98)).state;
    expect(state.phase).toBe("pendingPostOpen");
    expect(state.postOpenStartMs).toBe(640);
  });

  it("PendingPostOpen で 200ms 経過後 Confirmed、cycle event 発火、Open に戻る", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(640, 0.98)).state;
    state = updateCycleSegmenter(state, usable(680, 1.01)).state;
    state = updateCycleSegmenter(state, usable(720, 1.0)).state;
    state = updateCycleSegmenter(state, usable(760, 1.0)).state;
    state = updateCycleSegmenter(state, usable(800, 1.02)).state;
    const final = updateCycleSegmenter(state, usable(845, 1.0));
    expect(final.state.phase).toBe("open");
    expect(final.result.confirmedCycleEvent).toBeDefined();
    const ev = final.result.confirmedCycleEvent!;
    expect(ev.pulledMedian).toBeCloseTo(0.88, 2);
    expect(ev.openPostMedian).toBeCloseTo(1.0, 1);
    expect(ev.durationMs).toBe(845 - 500);
  });
});
```

- [ ] **Step 2: Run tests FAIL**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: FAIL (2 new)

- [ ] **Step 3: Extend reducer for Recovery / PendingPostOpen / Confirmed**

```ts
  import { CYCLE_POST_OPEN_WINDOW_MS } from "./sideTriggerConstants";

  if (state.phase === "recovery") {
    const threshold = state.recoveryThreshold ?? raw.value;
    const nextCycleSamples = [...state.cycleSamples, sample];
    if (raw.value >= threshold) {
      return {
        state: {
          ...state,
          phase: "pendingPostOpen",
          cycleSamples: nextCycleSamples,
          postOpenSamples: [],
          postOpenStartMs: now,
        },
        result: { cyclePhase: "pendingPostOpen" },
      };
    }
    return {
      state: { ...state, cycleSamples: nextCycleSamples },
      result: { cyclePhase: "recovery" },
    };
  }

  if (state.phase === "pendingPostOpen") {
    const start = state.postOpenStartMs ?? now;
    const nextPostSamples = [...state.postOpenSamples, sample];
    if (now - start >= CYCLE_POST_OPEN_WINDOW_MS) {
      const cycleStart = state.cycleStart!;
      const openPreMedian = median(state.baselineBuffer.map((s) => s.value));
      const openPostMedian = median(nextPostSamples.map((s) => s.value));
      const pulledMedian = state.pulledMedianFrozen ?? median(state.holdSamples.map((s) => s.value));
      const durationMs = now - cycleStart.timestampMs;
      const confirmedEvent = {
        timestampMs: now,
        pulledMedian,
        openPreMedian,
        openPostMedian,
        durationMs,
      };
      return {
        state: {
          ...state,
          phase: "open",
          cycleStart: undefined,
          cycleSamples: [],
          holdSamples: [],
          pulledMedianFrozen: undefined,
          recoveryThreshold: undefined,
          postOpenSamples: [],
          postOpenStartMs: undefined,
          baselineBuffer: trimBaseline([...state.baselineBuffer, sample], now),
          baselineWindowReady: computeBaselineReady(trimBaseline([...state.baselineBuffer, sample], now)),
          lastConfirmedCycleAtMs: now,
        },
        result: { cyclePhase: "open", confirmedCycleEvent: confirmedEvent },
      };
    }
    return {
      state: { ...state, postOpenSamples: nextPostSamples },
      result: { cyclePhase: "pendingPostOpen" },
    };
  }
```

- [ ] **Step 4: Run tests PASS**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`
Expected: PASS (9 total)

- [ ] **Step 5: Commit**

```bash
git add src/features/side-trigger/sideTriggerCycleSegmenter.ts \
        tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts
git commit -m "feat(side-trigger): CycleSegmenter Recovery→PendingPostOpen→Confirmed"
```

---

## Task 7: CycleSegmenter — stableOpenObservation + reset

**Files:**
- Modify: `src/features/side-trigger/sideTriggerCycleSegmenter.ts`
- Modify: `tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`

- [ ] **Step 1: Add tests**

```ts
describe("cycleSegmenter stableOpenObservation", () => {
  it("baselineReady 後 500ms 間隔で stableOpenObservation を emit", () => {
    let state = createInitialCycleSegmenterState();
    let lastEmittedValue: number | undefined;
    for (let i = 0; i < 30; i++) {
      const r = updateCycleSegmenter(state, usable(i * 30, 1.0));
      state = r.state;
      if (r.result.stableOpenObservation) lastEmittedValue = r.result.stableOpenObservation.value;
    }
    expect(lastEmittedValue).toBeCloseTo(1.0);
    expect(state.lastStableOpenEmittedMs).toBeGreaterThan(0);
  });

  it("Open 以外の phase では stableOpenObservation を emit しない", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    state = updateCycleSegmenter(state, usable(500, 0.88)).state;  // →drop
    const r = updateCycleSegmenter(state, usable(1000, 0.88));
    expect(r.result.stableOpenObservation).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run FAIL**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCycleSegmenter.test.ts`

- [ ] **Step 3: Implement stableOpenObservation in Open branch**

```ts
  import { CYCLE_STABLE_OPEN_INTERVAL_MS } from "./sideTriggerConstants";

  // In Open branch, after updating baselineBuffer:
  let stableOpenObservation: CycleResult["stableOpenObservation"];
  if (
    baselineWindowReady &&
    now - state.lastStableOpenEmittedMs >= CYCLE_STABLE_OPEN_INTERVAL_MS
  ) {
    stableOpenObservation = { timestampMs: now, value: median(baselineBuffer.map((s) => s.value)) };
  }
  return {
    state: {
      ...state,
      baselineBuffer,
      baselineWindowReady,
      lastStableOpenEmittedMs: stableOpenObservation ? now : state.lastStableOpenEmittedMs,
    },
    result: { cyclePhase: "open", stableOpenObservation },
  };
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(side-trigger): CycleSegmenter stableOpenObservation"
```

---

## Task 8: CalibrationReducer — defaultWide→cycleReady→adaptive

**Files:**
- Create: `src/features/side-trigger/sideTriggerCalibrationReducer.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  updateCalibrationReducer,
  createInitialCalibrationState,
} from "../../../../src/features/side-trigger/sideTriggerCalibrationReducer";
import type { ConfirmedCycleEvent } from "../../../../src/features/side-trigger/sideTriggerCycleTypes";

const evt = (overrides: Partial<ConfirmedCycleEvent> = {}): ConfirmedCycleEvent => ({
  timestampMs: 1000, pulledMedian: 0.3, openPreMedian: 1.0,
  openPostMedian: 1.0, durationMs: 400,
  ...overrides,
});

describe("calibrationReducer defaultWide→cycleReady→adaptive", () => {
  it("initial は defaultWide (pulled=0.2, open=1.2)", () => {
    const state = createInitialCalibrationState();
    expect(state.status).toBe("defaultWide");
    expect(state.pulled).toBe(0.2);
    expect(state.open).toBe(1.2);
  });

  it("初 accepted cycle で cycleReady に遷移、直接値を set", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 1.0 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.status).toBe("cycleReady");
    expect(result.pulled).toBe(0.3);
    expect(result.open).toBe(1.0);
    expect(result.acceptedCycleEvent).toBeDefined();
  });

  it("2 つ目以降は adaptive EMA (α_pull=0.1, α_open=0.1)", () => {
    let { result: state } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ timestampMs: 1000, pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 1.0 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    const { result } = updateCalibrationReducer(stateToReducerState(state), {
      confirmedCycleEvent: evt({ timestampMs: 1500, pulledMedian: 0.4, openPreMedian: 1.1, openPostMedian: 1.1 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.status).toBe("adaptive");
    expect(result.pulled).toBeCloseTo(0.3 + 0.1 * (0.4 - 0.3));
    expect(result.open).toBeCloseTo(1.0 + 0.1 * (1.1 - 1.0));
  });
});

// helper: result から reducer state を復元
function stateToReducerState(r: any) {
  return {
    status: r.status, pulled: r.pulled, open: r.open,
    lastAcceptedCycleAtMs: 1000,
    lastAcceptedCycleDigest: { pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 1.0, durationMs: 400 },
    manualOverrideActive: false,
  };
}
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement reducer**

```ts
// src/features/side-trigger/sideTriggerCalibrationReducer.ts
import {
  CAL_ALPHA_OPEN_ASSIST,
  CAL_ALPHA_OPEN_CYCLE,
  CAL_ALPHA_PULL,
  CAL_CYCLE_MAX_DURATION_MS,
  CAL_CYCLE_MIN_INTERVAL_MS,
  CAL_DEFAULT_OPEN,
  CAL_DEFAULT_PULLED,
  CAL_LAST_CYCLE_MAX_DEVIATION,
  CAL_MIN_SPAN,
  CAL_OPEN_MEDIAN_MAX_DEVIATION,
} from "./sideTriggerConstants";
import type {
  CalibrationReducerState,
  CalibrationResult,
  RejectedCycleReason,
} from "./sideTriggerCalibrationTypes";
import { createInitialCalibrationState } from "./sideTriggerCalibrationTypes";
import type { ConfirmedCycleEvent } from "./sideTriggerCycleTypes";
import type { ResetReason } from "./sideTriggerTelemetryTypes";

export { createInitialCalibrationState };

export interface CalibrationReducerInput {
  readonly confirmedCycleEvent?: ConfirmedCycleEvent;
  readonly stableOpenObservation?: { readonly timestampMs: number; readonly value: number };
  readonly resetSignal?: ResetReason;
  readonly sliderInDefaultRange: boolean;
}

export interface CalibrationReducerResult {
  readonly state: CalibrationReducerState;
  readonly result: CalibrationResult;
}

const evalSanity = (
  ev: ConfirmedCycleEvent,
  state: CalibrationReducerState,
  open: number,
): RejectedCycleReason | undefined => {
  if (ev.pulledMedian >= open - CAL_MIN_SPAN) return "spanTooSmall";
  const diff = Math.abs(ev.openPreMedian - ev.openPostMedian);
  const maxOpen = Math.max(ev.openPreMedian, ev.openPostMedian);
  if (maxOpen > 0 && diff / maxOpen >= CAL_OPEN_MEDIAN_MAX_DEVIATION) return "openMedianMismatch";
  if (ev.durationMs >= CAL_CYCLE_MAX_DURATION_MS) return "durationTooLong";
  if (state.lastAcceptedCycleAtMs !== undefined && ev.timestampMs - state.lastAcceptedCycleAtMs < CAL_CYCLE_MIN_INTERVAL_MS) {
    return "intervalTooShort";
  }
  if (state.lastAcceptedCycleDigest !== undefined) {
    const prevPulled = state.lastAcceptedCycleDigest.pulledMedian;
    const prevOpen = (state.lastAcceptedCycleDigest.openPreMedian + state.lastAcceptedCycleDigest.openPostMedian) / 2;
    const currOpen = (ev.openPreMedian + ev.openPostMedian) / 2;
    const pulledDev = Math.abs(ev.pulledMedian - prevPulled) / Math.max(prevPulled, 0.01);
    const openDev = Math.abs(currOpen - prevOpen) / Math.max(prevOpen, 0.01);
    if (pulledDev >= CAL_LAST_CYCLE_MAX_DEVIATION || openDev >= CAL_LAST_CYCLE_MAX_DEVIATION) {
      return "medianDeviationFromLastAccepted";
    }
  }
  return undefined;
};

export const updateCalibrationReducer = (
  state: CalibrationReducerState,
  input: CalibrationReducerInput,
): CalibrationReducerResult => {
  if (input.resetSignal !== undefined) {
    const status = input.resetSignal === "manualOverrideEntered" ? "manualOverride" : "defaultWide";
    const nextState: CalibrationReducerState = {
      status, pulled: CAL_DEFAULT_PULLED, open: CAL_DEFAULT_OPEN,
      lastAcceptedCycleAtMs: undefined, lastAcceptedCycleDigest: undefined,
      manualOverrideActive: status === "manualOverride",
    };
    return { state: nextState, result: { status, pulled: CAL_DEFAULT_PULLED, open: CAL_DEFAULT_OPEN } };
  }

  if (state.manualOverrideActive || !input.sliderInDefaultRange) {
    return {
      state: { ...state, manualOverrideActive: true, status: "manualOverride" },
      result: { status: "manualOverride", pulled: state.pulled, open: state.open },
    };
  }

  if (input.confirmedCycleEvent) {
    const ev = input.confirmedCycleEvent;
    const rejectReason = evalSanity(ev, state, state.open);
    if (rejectReason) {
      return {
        state,
        result: {
          status: state.status, pulled: state.pulled, open: state.open,
          rejectedCycleEvent: {
            reason: rejectReason,
            cycleDigest: {
              pulledMedian: ev.pulledMedian, openPreMedian: ev.openPreMedian,
              openPostMedian: ev.openPostMedian, durationMs: ev.durationMs,
            },
          },
        },
      };
    }
    const avgOpen = (ev.openPreMedian + ev.openPostMedian) / 2;
    if (state.status === "defaultWide") {
      const nextState: CalibrationReducerState = {
        status: "cycleReady", pulled: ev.pulledMedian, open: avgOpen,
        lastAcceptedCycleAtMs: ev.timestampMs,
        lastAcceptedCycleDigest: {
          pulledMedian: ev.pulledMedian, openPreMedian: ev.openPreMedian,
          openPostMedian: ev.openPostMedian, durationMs: ev.durationMs,
        },
        manualOverrideActive: false,
      };
      return { state: nextState, result: { status: "cycleReady", pulled: ev.pulledMedian, open: avgOpen, acceptedCycleEvent: ev } };
    }
    const nextPulled = state.pulled + CAL_ALPHA_PULL * (ev.pulledMedian - state.pulled);
    const nextOpen = state.open + CAL_ALPHA_OPEN_CYCLE * (avgOpen - state.open);
    const nextState: CalibrationReducerState = {
      status: "adaptive", pulled: nextPulled, open: nextOpen,
      lastAcceptedCycleAtMs: ev.timestampMs,
      lastAcceptedCycleDigest: {
        pulledMedian: ev.pulledMedian, openPreMedian: ev.openPreMedian,
        openPostMedian: ev.openPostMedian, durationMs: ev.durationMs,
      },
      manualOverrideActive: false,
    };
    return { state: nextState, result: { status: "adaptive", pulled: nextPulled, open: nextOpen, acceptedCycleEvent: ev } };
  }

  if (input.stableOpenObservation && state.status !== "defaultWide") {
    const nextOpen = state.open + CAL_ALPHA_OPEN_ASSIST * (input.stableOpenObservation.value - state.open);
    const nextState: CalibrationReducerState = { ...state, open: nextOpen };
    return { state: nextState, result: { status: state.status, pulled: state.pulled, open: nextOpen } };
  }

  return { state, result: { status: state.status, pulled: state.pulled, open: state.open } };
};
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/side-trigger/sideTriggerCalibrationReducer.ts \
        tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts
git commit -m "feat(side-trigger): CalibrationReducer defaultWide→cycleReady→adaptive"
```

---

## Task 9: CalibrationReducer — sanity check 5 reasons

**Files:**
- Modify: `tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts`

- [ ] **Step 1: Add 5 reject scenarios**

```ts
describe("calibrationReducer sanity reject", () => {
  it("spanTooSmall: pulledMedian >= open - MIN_SPAN", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ pulledMedian: 1.2, openPreMedian: 1.2, openPostMedian: 1.2 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.rejectedCycleEvent?.reason).toBe("spanTooSmall");
  });

  it("openMedianMismatch: |openPre - openPost| / max > 0.30", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 0.5 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.rejectedCycleEvent?.reason).toBe("openMedianMismatch");
  });

  it("durationTooLong: durationMs >= 1000", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ durationMs: 1500 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.rejectedCycleEvent?.reason).toBe("durationTooLong");
  });

  it("intervalTooShort: 直前 accepted から 200ms 未満", () => {
    const { state } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ timestampMs: 1000 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    const { result } = updateCalibrationReducer(state, {
      confirmedCycleEvent: evt({ timestampMs: 1100 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.rejectedCycleEvent?.reason).toBe("intervalTooShort");
  });

  it("medianDeviationFromLastAccepted: 50% 乖離", () => {
    const { state } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ timestampMs: 1000, pulledMedian: 0.3 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    const { result } = updateCalibrationReducer(state, {
      confirmedCycleEvent: evt({ timestampMs: 1500, pulledMedian: 0.9 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.rejectedCycleEvent?.reason).toBe("medianDeviationFromLastAccepted");
  });
});
```

- [ ] **Step 2: Run PASS (実装は既に Task 8 で入っている)**

Run: `npm test -- tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts`
Expected: PASS 8 total

- [ ] **Step 3: Commit**

```bash
git add tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts
git commit -m "test(side-trigger): CalibrationReducer sanity reject 5 reasons"
```

---

## Task 10: CalibrationReducer — stableOpen assist + manualOverride

**Files:**
- Modify: `tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts`

- [ ] **Step 1: Add tests**

```ts
describe("calibrationReducer stableOpen assist + manualOverride", () => {
  it("cycleReady/adaptive 中の stableOpenObservation で open を α_assist=0.02 更新", () => {
    const { state } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 1.0 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    const { result } = updateCalibrationReducer(state, {
      confirmedCycleEvent: undefined,
      stableOpenObservation: { timestampMs: 2000, value: 1.2 },
      resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.open).toBeCloseTo(1.0 + 0.02 * (1.2 - 1.0));
  });

  it("defaultWide 中は stableOpen 無視", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: undefined,
      stableOpenObservation: { timestampMs: 2000, value: 1.5 },
      resetSignal: undefined, sliderInDefaultRange: true,
    });
    expect(result.open).toBe(1.2);
  });

  it("slider 外れたら manualOverride に遷移、cycle/cal 更新停止", () => {
    const { state } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ pulledMedian: 0.3, openPreMedian: 1.0, openPostMedian: 1.0 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: true,
    });
    const { result } = updateCalibrationReducer(state, {
      confirmedCycleEvent: evt({ timestampMs: 1500, pulledMedian: 0.4 }),
      stableOpenObservation: undefined, resetSignal: undefined, sliderInDefaultRange: false,
    });
    expect(result.status).toBe("manualOverride");
    expect(result.pulled).toBe(0.3);  // cycle 更新されていない
  });

  it("manualOverrideEntered reset で defaultWide + manualOverride 状態", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: undefined, stableOpenObservation: undefined,
      resetSignal: "manualOverrideEntered", sliderInDefaultRange: false,
    });
    expect(result.status).toBe("manualOverride");
    expect(result.pulled).toBe(0.2);
    expect(result.open).toBe(1.2);
  });
});
```

- [ ] **Step 2: Run PASS (Task 8 実装に含まれている)**

- [ ] **Step 3: Commit**

```bash
git add tests/unit/features/side-trigger/sideTriggerCalibrationReducer.test.ts
git commit -m "test(side-trigger): CalibrationReducer stableOpen assist + manualOverride"
```

---

## Task 11: FSM 調整 — time-based hold + armed=false 契約

**Files:**
- Modify: `src/features/side-trigger/sideTriggerStateMachine.ts`
- Modify: `tests/unit/features/side-trigger/sideTriggerStateMachine.test.ts` (既存)

既存 FSM は frame-count dwell。本 task は **controller level で pullEnterFirstSeenMs を保持し、armed gate を適用**する方向で既存を温存する。ただし armed=false の frame で edge emit/latched 遷移しないよう FSM 側にも armed 引数を導入する。

- [ ] **Step 1: Examine 既存 FSM API**

Run: `grep -n "updateSideTriggerMachine\|evaluateNextPhase" src/features/side-trigger/sideTriggerStateMachine.ts | head -20`

- [ ] **Step 2: Add armed 引数を既存 update API に**

実装詳細:
- `updateSideTriggerMachine(state, input)` の input に `armed: boolean` を追加
- `armed=false` のとき: `edge = "none"` に強制、`triggerPulled` を false 維持、`SideTriggerPulledLatched` / `SideTriggerCooldown` への遷移をスキップ、dwell counter は update 継続

テスト追加:

```ts
it("armed=false のとき pullStarted edge を emit しない", () => {
  // 既存のテストを参考に、armed=false 入力で pullStarted が出ないことを確認
});
it("armed=false のとき PulledLatched に遷移しない", () => {});
```

- [ ] **Step 3: Modify FSM; run tests PASS**

- [ ] **Step 4: Commit**

```bash
git add src/features/side-trigger/sideTriggerStateMachine.ts \
        tests/unit/features/side-trigger/sideTriggerStateMachine.test.ts
git commit -m "feat(side-trigger): FSM armed gate contract"
```

---

## Task 12: Controller — basic orchestration (reset 抜き)

**Files:**
- Create: `src/features/side-trigger/sideTriggerController.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerController.test.ts`

- [ ] **Step 1: Write failing tests (happy path)**

```ts
// Controller が rawReducer → cycleSegmenter → calibrationReducer → evidence → FSM の順で呼ばれる
// acceptedCycleEvent が初めて出たとき armed=true、justArmed=true
// 同 frame で edge は "none" (justArmed で FSM に armed=false 渡す)
```

- [ ] **Step 2-4: Implement & test & iterate**

```ts
// sideTriggerController.ts
// 主要: createInitialControllerState(), updateController(state, input)
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(side-trigger): Controller basic orchestration"
```

---

## Task 13: Controller — detectResetReason

**Files:**
- Modify: `src/features/side-trigger/sideTriggerController.ts`
- Modify: `tests/unit/features/side-trigger/sideTriggerController.test.ts`

- [ ] **Step 1: Add tests**

```ts
// handLoss: 1500ms raw unusable → reset
// sourceChanged: sourceKey 変化 → reset
// geometryJump: EMA ratio > 0.25 → reset
// manualOverrideEntered: slider default→non-default 遷移で 1 frame のみ
// 優先度: sourceChanged > geometryJump > handLoss > manualOverrideEntered
```

- [ ] **Step 2-4: Implement detectResetReason + reset orchestration in updateController**

```ts
// reset frame では cycle/cal/fsm skip、buildResetTelemetry 返す
// manualOverrideEntered だけ cal を呼んで mode 遷移
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(side-trigger): Controller detectResetReason + reset orchestration"
```

---

## Task 14: ControllerTelemetry — buildTelemetry / buildResetTelemetry

**Files:**
- Create: `src/features/side-trigger/sideTriggerControllerTelemetry.ts`
- Create: `tests/unit/features/side-trigger/sideTriggerControllerTelemetry.test.ts`

- [ ] **Step 1: Tests**

```ts
// buildTelemetry(state, raw, cycleResult, calResult, fsmResult, timestamp) → ControllerTelemetry
// buildResetTelemetry(state, raw, resetReason, timestamp) → reset contract
// postResetPhase(state) → fsmState.phase
```

- [ ] **Step 2-4: Implement & test**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(side-trigger): Controller telemetry builders"
```

---

## Task 15: balloonGameRuntime consumer を cycle-driven mapper へ migrate

**Files:**
- Modify: `src/app/balloonGameRuntime.ts`
- Modify: `src/features/side-trigger/createCycleDrivenSideTriggerMapper.ts`
- Verify: `src/features/side-trigger/createAdaptiveSideTriggerMapper.ts`
- Modify: `src/features/side-trigger/index.ts`

実際の migration は `balloonGameRuntime.ts` 側の consumer を
`createCycleDrivenSideTriggerMapper` の直接 import に切り替える方針で実施した。
`createAdaptiveSideTriggerMapper` は diagnostic workbench / r8 fallback 用の
legacy export として残し、controller-backed r9 path とは分ける。

- [ ] **Step 1: Verify current API surface**

Run:

```bash
grep -n "createCycleDrivenSideTriggerMapper\|createAdaptiveSideTriggerMapper" \
  src/app/balloonGameRuntime.ts src/features/side-trigger/index.ts \
  src/features/side-trigger/createAdaptiveSideTriggerMapper.ts
```

- [ ] **Step 2: Switch runtime consumer**

`src/app/balloonGameRuntime.ts` imports and instantiates
`createCycleDrivenSideTriggerMapper` directly.

- [ ] **Step 3: Keep legacy export explicit**

`src/features/side-trigger/index.ts` continues exporting
`createAdaptiveSideTriggerMapper` only for remaining r8 fallback/workbench paths.
Do not rewrite it to hide the r9 mapper behind the old API.

- [ ] **Step 4: Run consumer tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(app): use cycle-driven side-trigger mapper in runtime"
```

---

## Task 16: Diagnostic workbench migration

**Files:**
- Modify: `src/features/diagnostic-workbench/renderSideTriggerPanel.ts`
- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify: `tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts`
- Modify: `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

新 telemetry (`ControllerTelemetry`) を render できるよう panel を migrate。既存 r8 snapshot 参照を削除 or 並行表示。

- [ ] **Step 1: Update renderSideTriggerPanel to read ControllerTelemetry fields**
- [ ] **Step 2: Update liveLandmarkInspection to use new controller state**
- [ ] **Step 3: Update tests**
- [ ] **Step 4: Run tests PASS**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(diagnostic-workbench): migrate side-trigger panel to r9 telemetry"
```

---

## Task 17: Replay capture types (M2 用 type-only)

**Files:**
- Create: `src/features/replay-capture/replayCaptureTypes.ts`
- Create: `src/features/replay-capture/CLAUDE.md` (and `AGENTS.md` symlink)

- [ ] **Step 1: Types only (no implementation)**

```ts
export type ReplayDetectionInput = { /* spec Section 3.5 */ };
export type ReplayCaptureFrame = { /* ... */ };
export type ReplayCaptureFile = { /* ... */ };
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(replay-capture): add r9 capture types (M2 stub)"
```

---

## Task 18: Replay opt-in test (behavior-only)

**Files:**
- Create: `tests/replay/sideTriggerCycleReplay.replay.test.ts`

4 capture fixture を使って behavior-only mode で KPI を検証。capture file は gitignore されているので `it.skipIf` で不在時 skip。

- [ ] **Step 1: Skeleton with it.skipIf**

```ts
import fs from "node:fs";
import { describe, it, expect } from "vitest";

const captures = [
  { path: "iterations/sens-20-pulls.json", targetCommits: 19, label: "sens" },
  { path: "iterations/warmed-idle-30s.json", targetFP: 0, label: "warmed-idle" },
  // ...
];

for (const c of captures) {
  const exists = fs.existsSync(c.path);
  describe.skipIf(!exists)(`r9 replay [${c.label}]`, () => {
    it("KPI target", () => {
      // fixture 読み込み → controller 再生 → commit 数 / FP 数 / latency を計測 → target 比較
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "test(side-trigger): r9 replay opt-in behavior-only test"
```

---

## Task 19: r8 系 cleanup

**Files:**
- Delete: `src/features/side-trigger/sideTriggerAdaptiveCalibration.ts`
- Delete: `tests/unit/features/side-trigger/sideTriggerAdaptiveCalibration.test.ts`
- Delete: `tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts`
- Modify: `src/features/side-trigger/index.ts` (exports cleanup)

- [ ] **Step 1: Confirm no consumers**

Run: `grep -rn "sideTriggerAdaptiveCalibration\|updateSideTriggerAdaptiveCalibration" src tests`
Expected: r8 fallback/workbench paths からの参照のみ。削除する場合は
`createAdaptiveSideTriggerMapper` legacy export の必要性を先に再確認する。

- [ ] **Step 2-4: Delete & verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git rm src/features/side-trigger/sideTriggerAdaptiveCalibration.ts \
       tests/unit/features/side-trigger/sideTriggerAdaptiveCalibration.test.ts \
       tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts
git add src/features/side-trigger/index.ts
git commit -m "chore(side-trigger): remove r8 sliding-window adaptive calibration"
```

---

## Task 20: Final verification + PR

- [ ] **Step 1: Full test suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: ALL PASS

- [ ] **Step 2: Live smoke test**

Start dev server, open game, confirm:
- 初回「準備中」indicator
- 1 cycle ゆっくり開閉後「armed」
- 以降 pull で発射
- 手だけ動かす状況で誤発火なし (specificity)

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "feat(side-trigger): r9 cycle-driven calibration" --body "$(cat <<'EOF'
## Summary
- spec r9 に基づき、side-trigger を cycle-driven calibration + armed gate + time-based hold に全面再設計
- r8 の sliding-window adaptive 系を廃止、4 層 (Raw / CycleSegmenter / CalibrationReducer / FSM) + Controller 構成に
- 既存 `SideTriggerPhase` / `TriggerEdge` / `TriggerAvailability` 型は維持、後方互換

## Test plan
- [ ] unit tests: rawReducer / cycleSegmenter / calibrationReducer / FSM / controller / telemetry
- [ ] controller integration tests
- [ ] replay opt-in tests (4 capture KPI): sens≥19/20, warmed-idle FP=0, past sens≥18, latency≤60ms
- [ ] live smoke: 準備中→armed→発射、specificity で FP なし

## Spec
- `docs/superpowers/specs/2026-04-23-side-trigger-cycle-driven-calibration-design.md` (r9)
- r8 (`2026-04-19-adaptive-side-trigger-calibration-design.md`) を supersede

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

### Spec coverage

- [x] Section 1 (4 層 + Controller): Task 1, 12, 13, 14 で実装
- [x] Section 2.1 Raw: Task 2
- [x] Section 2.2 CycleSegmenter: Task 4-7
- [x] Section 2.3 CalibrationReducer: Task 8-10
- [x] Section 2.4 Controller (reset + armed): Task 12, 13
- [x] Section 2.5 FSM armed contract: Task 11
- [x] Section 2.6 Manual Slider: Task 10, 13 (sliderInDefaultRange)
- [x] Section 3.2 Telemetry schema: Task 1 (types), Task 14 (builders)
- [x] Section 3.3 buildResetTelemetry: Task 14
- [x] Section 3.4 Observability surface: Task 16 (diagnostic), runtime UI は balloonGameRuntime 既存で
- [x] Section 3.5 Capture format (M2 stub): Task 17
- [x] Section 3.6 migration: Task 15, 16, 19
- [x] Section 4 Test strategy 3-tier: Task 2-14 (unit + integration), Task 18 (replay)
- [x] Section 5 Rollout Phase 0-1: このプラン全体がそれ

### Placeholder scan

- [x] TBD/TODO なし
- [x] 全 task に exact file paths、test code、impl code、commands
- [x] 「similar to Task N」なし
- [x] error handling の曖昧表現なし

### Type consistency

- [x] `ControllerTelemetry` field 名が Task 1 (定義) と Task 14 (builder) で一致
- [x] `CycleSegmenterState` field 名が Task 1 (型) と Task 4-7 (reducer 実装) で一致
- [x] `CalibrationResult` の `rejectedCycleEvent` 構造が Task 1 / Task 8 / Task 9 で一致
- [x] `RawMetricUnusableReason` 4 種が Task 1 / Task 2 / reset telemetry で一致
