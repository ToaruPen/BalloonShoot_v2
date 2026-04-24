import {
  INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE
} from "./sideTriggerConstants";
import type { ConfirmedCycleEvent } from "./sideTriggerCycleTypes";
import type { ControllerCalibrationStatus } from "./sideTriggerTelemetryTypes";

export type RejectedCycleReason =
  | "spanTooSmall"
  | "openMedianMismatch"
  | "durationTooLong"
  | "intervalTooShort"
  | "medianDeviationFromLastAccepted"
  | "invalidNumeric";

export interface RejectedCycleDigest {
  readonly pulledMedian: number;
  readonly openPreMedian: number;
  readonly openPostMedian: number;
  readonly durationMs: number;
}

interface CalibrationBase {
  readonly status: ControllerCalibrationStatus;
  readonly pulled: number;
  readonly open: number;
}

export type CalibrationResult =
  | (CalibrationBase & {
      readonly acceptedCycleEvent: ConfirmedCycleEvent;
      readonly rejectedCycleEvent?: never;
    })
  | (CalibrationBase & {
      readonly rejectedCycleEvent: {
        readonly reason: RejectedCycleReason;
        readonly cycleDigest: RejectedCycleDigest;
      };
      readonly acceptedCycleEvent?: never;
    })
  | (CalibrationBase & {
      readonly acceptedCycleEvent?: undefined;
      readonly rejectedCycleEvent?: undefined;
    });

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
  pulled: INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
  open: INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  manualOverrideActive: false
});
