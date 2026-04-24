import {
  CYCLE_BASELINE_MIN_COVERAGE_MS,
  CYCLE_BASELINE_MIN_SAMPLES,
  CYCLE_BASELINE_WINDOW_MS,
  CYCLE_DROP_THRESHOLD,
  CYCLE_HOLD_DURATION_MS,
  CYCLE_POST_OPEN_WINDOW_MS,
  CYCLE_RECOVERY_RATIO,
  CYCLE_STABLE_OPEN_INTERVAL_MS
} from "./sideTriggerConstants";
import type {
  CycleResult,
  CycleSample,
  CycleSegmenterState,
  ConfirmedCycleEvent,
  StableOpenObservation
} from "./sideTriggerCycleTypes";
import { createInitialCycleSegmenterState } from "./sideTriggerCycleTypes";
import type { RawMetric } from "./sideTriggerRawMetricReducer";

export { createInitialCycleSegmenterState };

interface CycleSegmenterUpdateResult {
  readonly state: CycleSegmenterState;
  readonly result: CycleResult;
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const center = sorted[mid];
  if (center === undefined) return 0;
  if (sorted.length % 2 === 0) {
    const lower = sorted[mid - 1];
    return lower === undefined ? center : (lower + center) / 2;
  }
  return center;
};

const trimBaseline = (
  buffer: readonly CycleSample[],
  now: number
): readonly CycleSample[] =>
  buffer.filter((s) => now - s.timestampMs <= CYCLE_BASELINE_WINDOW_MS);

const computeBaselineReady = (
  buffer: readonly CycleSample[]
): boolean => {
  if (buffer.length < CYCLE_BASELINE_MIN_SAMPLES) return false;
  const first = buffer[0];
  const last = buffer[buffer.length - 1];
  if (first === undefined || last === undefined) return false;
  return last.timestampMs - first.timestampMs >= CYCLE_BASELINE_MIN_COVERAGE_MS;
};

const buildStableOpen = (
  state: CycleSegmenterState,
  baselineBuffer: readonly CycleSample[],
  baselineReady: boolean,
  now: number
): StableOpenObservation | undefined => {
  if (!baselineReady) return undefined;
  if (now - state.lastStableOpenEmittedMs < CYCLE_STABLE_OPEN_INTERVAL_MS)
    return undefined;
  return { timestampMs: now, value: median(baselineBuffer.map((s) => s.value)) };
};

const openBranch = (
  state: CycleSegmenterState,
  raw: Extract<RawMetric, { kind: "usable" }>,
  sample: CycleSample
): CycleSegmenterUpdateResult => {
  const now = raw.timestampMs;
  const candidateBuffer = trimBaseline([...state.baselineBuffer, sample], now);
  const baselineWindowReady = computeBaselineReady(candidateBuffer);
  if (baselineWindowReady) {
    const baselineValue = median(candidateBuffer.map((s) => s.value));
    if (raw.value <= baselineValue - CYCLE_DROP_THRESHOLD) {
      // Drop detected. Freeze baselineBuffer (spec: Drop/Hold/Recovery/PendingPostOpen 中は凍結).
      return {
        state: {
          ...state,
          phase: "drop",
          baselineWindowReady,
          cycleStart: { timestampMs: now, baselineAtStart: baselineValue },
          belowSinceMs: now,
          cycleSamples: [sample],
          holdSamples: [sample]
        },
        result: { cyclePhase: "drop" }
      };
    }
  }
  const stable = buildStableOpen(state, candidateBuffer, baselineWindowReady, now);
  const lastStableOpenEmittedMs = stable ? now : state.lastStableOpenEmittedMs;
  return {
    state: {
      ...state,
      baselineBuffer: candidateBuffer,
      baselineWindowReady,
      lastStableOpenEmittedMs
    },
    result: stable
      ? { cyclePhase: "open", stableOpenObservation: stable }
      : { cyclePhase: "open" }
  };
};

const dropOrHoldBranch = (
  state: CycleSegmenterState,
  raw: Extract<RawMetric, { kind: "usable" }>,
  sample: CycleSample
): CycleSegmenterUpdateResult => {
  const now = raw.timestampMs;
  const baselineAtStart = state.cycleStart?.baselineAtStart ?? raw.value;
  const belowThreshold = raw.value <= baselineAtStart - CYCLE_DROP_THRESHOLD;
  const nextCycleSamples = [...state.cycleSamples, sample];
  const nextHoldSamples = belowThreshold
    ? [...state.holdSamples, sample]
    : state.holdSamples;

  if (state.phase === "drop") {
    if (!belowThreshold) {
      const baselineBuffer = trimBaseline([...state.baselineBuffer, sample], now);
      return {
        state: {
          phase: "open",
          baselineBuffer,
          baselineWindowReady: computeBaselineReady(baselineBuffer),
          cycleSamples: [],
          holdSamples: [],
          postOpenSamples: [],
          lastStableOpenEmittedMs: state.lastStableOpenEmittedMs,
          ...(state.lastConfirmedCycleAtMs !== undefined
            ? { lastConfirmedCycleAtMs: state.lastConfirmedCycleAtMs }
            : {})
        },
        result: { cyclePhase: "open" }
      };
    }

    const belowSinceMs = state.belowSinceMs ?? now;
    if (now - belowSinceMs >= CYCLE_HOLD_DURATION_MS) {
      return {
        state: {
          ...state,
          phase: "hold",
          belowSinceMs,
          cycleSamples: nextCycleSamples,
          holdSamples: nextHoldSamples
        },
        result: { cyclePhase: "hold" }
      };
    }
    return {
      state: {
        ...state,
        belowSinceMs,
        cycleSamples: nextCycleSamples,
        holdSamples: nextHoldSamples
      },
      result: { cyclePhase: "drop" }
    };
  }

  // phase === "hold"
  const prev = state.cycleSamples[state.cycleSamples.length - 1];
  const rising = prev !== undefined && raw.value > prev.value;
  if (rising) {
    const pulledMedianFrozen = median(nextHoldSamples.map((s) => s.value));
    const recoveryThreshold =
      pulledMedianFrozen +
      (baselineAtStart - pulledMedianFrozen) * CYCLE_RECOVERY_RATIO;
    return {
      state: {
        ...state,
        phase: "recovery",
        cycleSamples: nextCycleSamples,
        holdSamples: nextHoldSamples,
        pulledMedianFrozen,
        recoveryThreshold
      },
      result: { cyclePhase: "recovery" }
    };
  }
  return {
    state: {
      ...state,
      cycleSamples: nextCycleSamples,
      holdSamples: nextHoldSamples
    },
    result: { cyclePhase: "hold" }
  };
};

const recoveryBranch = (
  state: CycleSegmenterState,
  raw: Extract<RawMetric, { kind: "usable" }>,
  sample: CycleSample
): CycleSegmenterUpdateResult => {
  const now = raw.timestampMs;
  const threshold = state.recoveryThreshold ?? raw.value;
  const nextCycleSamples = [...state.cycleSamples, sample];
  if (raw.value >= threshold) {
    return {
      state: {
        ...state,
        phase: "pendingPostOpen",
        cycleSamples: nextCycleSamples,
        postOpenSamples: [sample],
        postOpenStartMs: now
      },
      result: { cyclePhase: "pendingPostOpen" }
    };
  }
  return {
    state: { ...state, cycleSamples: nextCycleSamples },
    result: { cyclePhase: "recovery" }
  };
};

const pendingPostOpenBranch = (
  state: CycleSegmenterState,
  raw: Extract<RawMetric, { kind: "usable" }>,
  sample: CycleSample
): CycleSegmenterUpdateResult => {
  const now = raw.timestampMs;
  const start = state.postOpenStartMs ?? now;
  const nextPostSamples = [...state.postOpenSamples, sample];
  if (now - start >= CYCLE_POST_OPEN_WINDOW_MS) {
    const cycleStart = state.cycleStart;
    if (cycleStart === undefined) {
      return { state, result: { cyclePhase: "pendingPostOpen" } };
    }
    const openPreMedian = median(state.baselineBuffer.map((s) => s.value));
    const openPostMedian = median(nextPostSamples.map((s) => s.value));
    const pulledMedian =
      state.pulledMedianFrozen ?? median(state.holdSamples.map((s) => s.value));
    const durationMs = now - cycleStart.timestampMs;
    const confirmedEvent: ConfirmedCycleEvent = {
      timestampMs: now,
      pulledMedian,
      openPreMedian,
      openPostMedian,
      durationMs
    };
    const baselineBuffer = trimBaseline(
      [...state.baselineBuffer, ...nextPostSamples],
      now
    );
    const baselineWindowReady = computeBaselineReady(baselineBuffer);
    const nextState: CycleSegmenterState = {
      phase: "open",
      baselineBuffer,
      baselineWindowReady,
      cycleSamples: [],
      holdSamples: [],
      postOpenSamples: [],
      lastStableOpenEmittedMs: state.lastStableOpenEmittedMs,
      lastConfirmedCycleAtMs: now
    };
    return {
      state: nextState,
      result: { cyclePhase: "confirmed", confirmedCycleEvent: confirmedEvent }
    };
  }
  return {
    state: { ...state, postOpenSamples: nextPostSamples },
    result: { cyclePhase: "pendingPostOpen" }
  };
};

export const updateCycleSegmenter = (
  state: CycleSegmenterState,
  raw: RawMetric
): CycleSegmenterUpdateResult => {
  if (raw.kind === "unusable") {
    return { state, result: { cyclePhase: state.phase } };
  }
  const sample: CycleSample = { timestampMs: raw.timestampMs, value: raw.value };
  if (state.phase === "open") return openBranch(state, raw, sample);
  if (state.phase === "drop" || state.phase === "hold")
    return dropOrHoldBranch(state, raw, sample);
  if (state.phase === "recovery") return recoveryBranch(state, raw, sample);
  return pendingPostOpenBranch(state, raw, sample);
};
