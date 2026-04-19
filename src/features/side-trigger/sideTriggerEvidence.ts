import type { SideTriggerRejectReason } from "../../shared/types/trigger";
import type {
  HandLandmarkSet,
  SideHandDetection,
  SideViewQuality
} from "../../shared/types/hand";
import type { SideTriggerCalibration } from "./sideTriggerCalibration";
import {
  DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
  MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
} from "./sideTriggerConstants";
import { computeNormalizedThumbDistance } from "./sideTriggerThumbDistance";

export interface SideTriggerEvidence {
  readonly sideHandDetected: boolean;
  readonly sideViewQuality: SideViewQuality;
  readonly pullEvidenceScalar: number;
  readonly releaseEvidenceScalar: number;
  readonly triggerPostureConfidence: number;
  readonly shotCandidateConfidence: number;
  readonly rejectReason: SideTriggerRejectReason | undefined;
  readonly usedWorldLandmarks: boolean;
}

const MIN_HAND_CONFIDENCE = 0.35;

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const sideViewRejectReason = (
  quality: SideViewQuality
): SideTriggerRejectReason | undefined =>
  quality === "good" ? undefined : "sideViewQualityRejected";

const computeScalars = (
  worldLandmarks: HandLandmarkSet,
  calibration: SideTriggerCalibration
): {
  pullEvidenceScalar: number;
  releaseEvidenceScalar: number;
} => {
  const normalizedThumbDistance =
    computeNormalizedThumbDistance(worldLandmarks);
  const observedSpan = Math.max(
    MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN,
    calibration.openPose.normalizedThumbDistance -
      calibration.pulledPose.normalizedThumbDistance
  );
  const canonicalThumbDistance =
    DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE +
    ((normalizedThumbDistance -
      calibration.pulledPose.normalizedThumbDistance) /
      observedSpan) *
      (DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE -
        DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE);

  return {
    pullEvidenceScalar: clamp01(1 - canonicalThumbDistance),
    releaseEvidenceScalar: clamp01((canonicalThumbDistance - 0.45) / 0.75)
  };
};

export const extractSideTriggerEvidence = (
  detection: SideHandDetection,
  calibration: SideTriggerCalibration
): SideTriggerEvidence => {
  const worldLandmarks = detection.rawFrame.worldLandmarks;

  if (worldLandmarks === undefined) {
    return {
      sideHandDetected: detection.handPresenceConfidence > 0,
      sideViewQuality: detection.sideViewQuality,
      pullEvidenceScalar: 0,
      releaseEvidenceScalar: 0,
      triggerPostureConfidence: 0,
      shotCandidateConfidence: 0,
      rejectReason: "worldLandmarksUnavailable",
      usedWorldLandmarks: false
    };
  }

  const qualityRejectReason = sideViewRejectReason(detection.sideViewQuality);
  const handConfidence = clamp01(detection.handPresenceConfidence);
  const confidenceRejectReason =
    handConfidence < MIN_HAND_CONFIDENCE ? "lowHandConfidence" : undefined;
  const rejectReason = qualityRejectReason ?? confidenceRejectReason;
  const { pullEvidenceScalar, releaseEvidenceScalar } =
    computeScalars(worldLandmarks, calibration);
  const qualityMultiplier = qualityRejectReason === undefined ? 1 : 0.2;
  const triggerPostureConfidence = clamp01(handConfidence * qualityMultiplier);

  return {
    sideHandDetected: handConfidence > 0,
    sideViewQuality: detection.sideViewQuality,
    pullEvidenceScalar,
    releaseEvidenceScalar,
    triggerPostureConfidence,
    shotCandidateConfidence: Math.min(
      pullEvidenceScalar,
      triggerPostureConfidence
    ),
    rejectReason,
    usedWorldLandmarks: true
  };
};
