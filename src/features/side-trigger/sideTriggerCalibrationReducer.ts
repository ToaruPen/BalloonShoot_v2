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
  CAL_OPEN_MEDIAN_MAX_DEVIATION
} from "./sideTriggerConstants";
import type {
  CalibrationReducerState,
  CalibrationResult,
  RejectedCycleReason
} from "./sideTriggerCalibrationTypes";
import { createInitialCalibrationState } from "./sideTriggerCalibrationTypes";
import type { ConfirmedCycleEvent } from "./sideTriggerCycleTypes";
import type { ResetReason } from "./sideTriggerTelemetryTypes";

export { createInitialCalibrationState };

export interface CalibrationReducerInput {
  readonly confirmedCycleEvent?: ConfirmedCycleEvent;
  readonly stableOpenObservation?: {
    readonly timestampMs: number;
    readonly value: number;
  };
  readonly resetSignal?: ResetReason;
  readonly sliderInDefaultRange: boolean;
}

export interface CalibrationReducerUpdateResult {
  readonly state: CalibrationReducerState;
  readonly result: CalibrationResult;
}

const evaluateSanity = (
  ev: ConfirmedCycleEvent,
  state: CalibrationReducerState,
  effectiveOpen: number
): RejectedCycleReason | undefined => {
  if (ev.pulledMedian >= effectiveOpen - CAL_MIN_SPAN) return "spanTooSmall";
  const diff = Math.abs(ev.openPreMedian - ev.openPostMedian);
  const maxOpen = Math.max(ev.openPreMedian, ev.openPostMedian);
  if (maxOpen > 0 && diff / maxOpen >= CAL_OPEN_MEDIAN_MAX_DEVIATION)
    return "openMedianMismatch";
  if (ev.durationMs >= CAL_CYCLE_MAX_DURATION_MS) return "durationTooLong";
  if (
    state.lastAcceptedCycleAtMs !== undefined &&
    ev.timestampMs - state.lastAcceptedCycleAtMs < CAL_CYCLE_MIN_INTERVAL_MS
  ) {
    return "intervalTooShort";
  }
  if (state.lastAcceptedCycleDigest !== undefined) {
    const prev = state.lastAcceptedCycleDigest;
    const prevOpen = (prev.openPreMedian + prev.openPostMedian) / 2;
    const currOpen = (ev.openPreMedian + ev.openPostMedian) / 2;
    const pulledDev =
      Math.abs(ev.pulledMedian - prev.pulledMedian) /
      Math.max(prev.pulledMedian, 0.01);
    const openDev = Math.abs(currOpen - prevOpen) / Math.max(prevOpen, 0.01);
    if (
      pulledDev >= CAL_LAST_CYCLE_MAX_DEVIATION ||
      openDev >= CAL_LAST_CYCLE_MAX_DEVIATION
    ) {
      return "medianDeviationFromLastAccepted";
    }
  }
  return undefined;
};

export const updateCalibrationReducer = (
  state: CalibrationReducerState,
  input: CalibrationReducerInput
): CalibrationReducerUpdateResult => {
  if (input.resetSignal !== undefined) {
    const toManualOverride = input.resetSignal === "manualOverrideEntered";
    const nextState: CalibrationReducerState = {
      status: toManualOverride ? "manualOverride" : "defaultWide",
      pulled: CAL_DEFAULT_PULLED,
      open: CAL_DEFAULT_OPEN,
      manualOverrideActive: toManualOverride
    };
    return {
      state: nextState,
      result: {
        status: nextState.status,
        pulled: nextState.pulled,
        open: nextState.open
      }
    };
  }

  if (!input.sliderInDefaultRange) {
    const nextState: CalibrationReducerState = {
      ...state,
      status: "manualOverride",
      manualOverrideActive: true
    };
    return {
      state: nextState,
      result: { status: "manualOverride", pulled: state.pulled, open: state.open }
    };
  }

  if (state.manualOverrideActive && input.sliderInDefaultRange) {
    // Slider restored. manualOverride→adaptive 復帰は controller が 3 秒安定で判定する。
    // ここでは mode のまま (controller が別途 resetSignal 発火して defaultWide に戻す)。
  }

  if (input.confirmedCycleEvent !== undefined) {
    const ev = input.confirmedCycleEvent;
    const rejectReason = evaluateSanity(ev, state, state.open);
    if (rejectReason !== undefined) {
      return {
        state,
        result: {
          status: state.status,
          pulled: state.pulled,
          open: state.open,
          rejectedCycleEvent: {
            reason: rejectReason,
            cycleDigest: {
              pulledMedian: ev.pulledMedian,
              openPreMedian: ev.openPreMedian,
              openPostMedian: ev.openPostMedian,
              durationMs: ev.durationMs
            }
          }
        }
      };
    }
    const avgOpen = (ev.openPreMedian + ev.openPostMedian) / 2;
    const digest = {
      pulledMedian: ev.pulledMedian,
      openPreMedian: ev.openPreMedian,
      openPostMedian: ev.openPostMedian,
      durationMs: ev.durationMs
    };
    if (state.status === "defaultWide") {
      const nextState: CalibrationReducerState = {
        status: "cycleReady",
        pulled: ev.pulledMedian,
        open: avgOpen,
        lastAcceptedCycleAtMs: ev.timestampMs,
        lastAcceptedCycleDigest: digest,
        manualOverrideActive: false
      };
      return {
        state: nextState,
        result: {
          status: "cycleReady",
          pulled: ev.pulledMedian,
          open: avgOpen,
          acceptedCycleEvent: ev
        }
      };
    }
    const nextPulled = state.pulled + CAL_ALPHA_PULL * (ev.pulledMedian - state.pulled);
    const nextOpen = state.open + CAL_ALPHA_OPEN_CYCLE * (avgOpen - state.open);
    const nextState: CalibrationReducerState = {
      status: "adaptive",
      pulled: nextPulled,
      open: nextOpen,
      lastAcceptedCycleAtMs: ev.timestampMs,
      lastAcceptedCycleDigest: digest,
      manualOverrideActive: false
    };
    return {
      state: nextState,
      result: {
        status: "adaptive",
        pulled: nextPulled,
        open: nextOpen,
        acceptedCycleEvent: ev
      }
    };
  }

  if (
    input.stableOpenObservation !== undefined &&
    state.status !== "defaultWide" &&
    state.status !== "manualOverride"
  ) {
    const nextOpen =
      state.open + CAL_ALPHA_OPEN_ASSIST * (input.stableOpenObservation.value - state.open);
    const nextState: CalibrationReducerState = { ...state, open: nextOpen };
    return {
      state: nextState,
      result: { status: state.status, pulled: state.pulled, open: nextOpen }
    };
  }

  return {
    state,
    result: { status: state.status, pulled: state.pulled, open: state.open }
  };
};
