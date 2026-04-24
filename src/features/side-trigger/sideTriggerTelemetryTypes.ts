import type {
  SideTriggerDwellFrameCounts,
  SideTriggerPhase,
  TriggerAvailability,
  TriggerEdge
} from "../../shared/types/trigger";
import type { CyclePhase } from "./sideTriggerCycleTypes";
import type { RejectedCycleReason } from "./sideTriggerCalibrationTypes";

export type RawMetricUnusableReason =
  | "noHand"
  | "sideViewQualityRejected"
  | "noWorldLandmarks"
  | "geometryUnavailable"
  | "metadataIncomplete";

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

export interface ControllerCalibrationSnapshot {
  readonly pulled: number;
  readonly open: number;
}

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
  readonly calibrationSnapshot: ControllerCalibrationSnapshot;
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
