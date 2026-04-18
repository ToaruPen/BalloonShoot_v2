import type { FrameTimestamp } from "./camera";
import type { SideViewQuality } from "./hand";

export type SideTriggerPhase =
  | "SideTriggerNoHand"
  | "SideTriggerPoseSearching"
  | "SideTriggerOpenReady"
  | "SideTriggerPullCandidate"
  | "SideTriggerPulledLatched"
  | "SideTriggerReleaseCandidate"
  | "SideTriggerCooldown"
  | "SideTriggerRecoveringAfterLoss";

export type TriggerEdge =
  | "none"
  | "pullStarted"
  | "pullStarted+shotCommitted"
  | "shotCommitted"
  | "releaseConfirmed";

export type TriggerAvailability =
  | "available"
  | "holdingPreviousState"
  | "unavailable";

export interface SideTriggerDwellFrameCounts {
  readonly pullDwellFrames: number;
  readonly releaseDwellFrames: number;
  readonly stablePoseFrames: number;
  readonly lostHandFrames: number;
  readonly cooldownRemainingFrames: number;
}

export type SideTriggerRejectReason =
  | "handNotDetected"
  | "insufficientPullEvidence"
  | "insufficientReleaseEvidence"
  | "worldLandmarksUnavailable"
  | "sideViewQualityRejected"
  | "lowHandConfidence";

export type SideTriggerCalibrationStatus = "default" | "liveTuning";

export interface SideTriggerCalibrationSnapshot {
  readonly openPose: {
    readonly normalizedThumbDistance: number;
  };
  readonly pulledPose: {
    readonly normalizedThumbDistance: number;
  };
}

export interface TriggerInputFrame {
  readonly laneRole: "sideTrigger";
  readonly timestamp: FrameTimestamp;
  readonly triggerAvailability: TriggerAvailability;
  readonly sideTriggerPhase: SideTriggerPhase;
  readonly triggerEdge: TriggerEdge;
  readonly triggerPulled: boolean;
  readonly shotCandidateConfidence: number;
  readonly sideHandDetected: boolean;
  readonly sideViewQuality: SideViewQuality;
  readonly dwellFrameCounts: SideTriggerDwellFrameCounts;
}

export interface SideTriggerTelemetry {
  readonly phase: SideTriggerPhase;
  readonly edge: TriggerEdge;
  readonly triggerAvailability: TriggerAvailability;
  readonly calibrationStatus: SideTriggerCalibrationStatus;
  readonly calibration: SideTriggerCalibrationSnapshot;
  readonly pullEvidenceScalar: number;
  readonly releaseEvidenceScalar: number;
  readonly triggerPostureConfidence: number;
  readonly shotCandidateConfidence: number;
  readonly dwellFrameCounts: SideTriggerDwellFrameCounts;
  /** Mirrors dwellFrameCounts.cooldownRemainingFrames for diagnostic UI convenience. */
  readonly cooldownRemainingFrames: number;
  readonly lastRejectReason: SideTriggerRejectReason | undefined;
  readonly usedWorldLandmarks: boolean;
}
