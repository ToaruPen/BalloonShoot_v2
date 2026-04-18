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
  | "worldLandmarksUnavailable"
  | "sideViewQualityRejected"
  | "lowHandConfidence";

export type SideTriggerCalibrationStatus = "uncalibrated" | "liveTuning";

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
  readonly pullEvidenceScalar: number;
  readonly releaseEvidenceScalar: number;
  readonly triggerPostureConfidence: number;
  readonly shotCandidateConfidence: number;
  readonly dwellFrameCounts: SideTriggerDwellFrameCounts;
  readonly cooldownRemainingFrames: number;
  readonly lastRejectReason: SideTriggerRejectReason | undefined;
  readonly usedWorldLandmarks: boolean;
}
