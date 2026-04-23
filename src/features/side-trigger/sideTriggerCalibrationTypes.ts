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
  manualOverrideActive: false
});
