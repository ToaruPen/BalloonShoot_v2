import type { FrameTimestamp } from "../../shared/types/camera";
import type { SideHandDetection } from "../../shared/types/hand";
import type {
  SideTriggerTelemetry,
  TriggerAvailability,
  TriggerInputFrame
} from "../../shared/types/trigger";
import {
  sideTriggerCalibrationStatusFor,
  type SideTriggerCalibration
} from "./sideTriggerCalibration";
import type { SideTriggerTuning } from "./sideTriggerConfig";
import {
  extractSideTriggerEvidence,
  type SideTriggerEvidence
} from "./sideTriggerEvidence";
import {
  createInitialSideTriggerState,
  updateSideTriggerState,
  type SideTriggerMachineState
} from "./sideTriggerStateMachine";

interface SideTriggerMapperUpdate {
  readonly detection: SideHandDetection | undefined;
  readonly calibration: SideTriggerCalibration;
  readonly tuning: SideTriggerTuning;
  readonly timestamp?: FrameTimestamp;
  readonly commitArmed?: boolean;
}

interface SideTriggerMapperResult {
  readonly triggerFrame: TriggerInputFrame | undefined;
  readonly telemetry: SideTriggerTelemetry;
}

export interface SideTriggerMapper {
  update(update: SideTriggerMapperUpdate): SideTriggerMapperResult;
  reset(): void;
}

const noHandEvidence = (): SideTriggerEvidence => ({
  sideHandDetected: false,
  sideViewQuality: "lost",
  pullEvidenceScalar: 0,
  releaseEvidenceScalar: 0,
  triggerPostureConfidence: 0,
  shotCandidateConfidence: 0,
  rejectReason: "handNotDetected",
  usedWorldLandmarks: false
});

const availabilityFor = (
  evidence: SideTriggerEvidence,
  state: SideTriggerMachineState
): TriggerAvailability => {
  if (evidence.rejectReason === undefined && evidence.usedWorldLandmarks) {
    return "available";
  }

  return state.triggerPulled ? "holdingPreviousState" : "unavailable";
};

const telemetryFor = (
  state: SideTriggerMachineState,
  edge: TriggerInputFrame["triggerEdge"],
  evidence: SideTriggerEvidence,
  calibration: SideTriggerCalibration,
  triggerAvailability: TriggerAvailability
): SideTriggerTelemetry => ({
  phase: state.phase,
  edge,
  triggerAvailability,
  calibrationStatus: sideTriggerCalibrationStatusFor(calibration),
  calibration,
  pullEvidenceScalar: evidence.pullEvidenceScalar,
  releaseEvidenceScalar: evidence.releaseEvidenceScalar,
  triggerPostureConfidence: evidence.triggerPostureConfidence,
  shotCandidateConfidence: evidence.shotCandidateConfidence,
  dwellFrameCounts: state.dwellFrameCounts,
  cooldownRemainingFrames: state.dwellFrameCounts.cooldownRemainingFrames,
  lastRejectReason: state.lastRejectReason ?? evidence.rejectReason,
  usedWorldLandmarks: evidence.usedWorldLandmarks
});

const frameFor = (
  timestamp: FrameTimestamp,
  state: SideTriggerMachineState,
  edge: TriggerInputFrame["triggerEdge"],
  evidence: SideTriggerEvidence,
  triggerAvailability: TriggerAvailability
): TriggerInputFrame => ({
  laneRole: "sideTrigger",
  timestamp,
  triggerAvailability,
  sideTriggerPhase: state.phase,
  triggerEdge: edge,
  triggerPulled: state.triggerPulled,
  shotCandidateConfidence: evidence.shotCandidateConfidence,
  sideHandDetected: evidence.sideHandDetected,
  sideViewQuality: evidence.sideViewQuality,
  dwellFrameCounts: state.dwellFrameCounts
});

export const createSideTriggerMapper = (): SideTriggerMapper => {
  let machineState = createInitialSideTriggerState();
  let sourceKey: string | undefined;

  const reset = (): void => {
    machineState = createInitialSideTriggerState();
    sourceKey = undefined;
  };

  return {
    update(update) {
      const detection = update.detection;
      const nextSourceKey =
        detection === undefined
          ? sourceKey
          : `${detection.deviceId}:${detection.streamId}`;

      if (nextSourceKey !== sourceKey && detection !== undefined) {
        machineState = createInitialSideTriggerState();
        sourceKey = nextSourceKey;
      }

      const evidence =
        detection === undefined
          ? noHandEvidence()
          : extractSideTriggerEvidence(detection, update.calibration);
      const timestamp = detection?.timestamp ?? update.timestamp;
      const result = updateSideTriggerState(
        machineState,
        evidence,
        update.tuning,
        { commitArmed: update.commitArmed ?? true }
      );
      machineState = result.state;
      const edge =
        update.commitArmed === false ? ("none" as const) : result.edge;

      const triggerAvailability = availabilityFor(evidence, machineState);
      const telemetry = telemetryFor(
        machineState,
        edge,
        evidence,
        update.calibration,
        triggerAvailability
      );

      return {
        triggerFrame:
          timestamp === undefined
            ? undefined
            : frameFor(
                timestamp,
                machineState,
                edge,
                evidence,
                triggerAvailability
              ),
        telemetry
      };
    },
    reset
  };
};
