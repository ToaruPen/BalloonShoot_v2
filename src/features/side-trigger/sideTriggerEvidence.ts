import type { SideTriggerRejectReason } from "../../shared/types/trigger";
import type {
  HandLandmarkSet,
  Point3D,
  SideHandDetection,
  SideViewQuality
} from "../../shared/types/hand";

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
const MIN_REFERENCE_LENGTH = 0.0001;

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const distance = (a: Point3D, b: Point3D): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;

  return Math.hypot(dx, dy, dz);
};

const sideViewRejectReason = (
  quality: SideViewQuality
): SideTriggerRejectReason | undefined =>
  quality === "good" ? undefined : "sideViewQualityRejected";

const computeScalars = (
  worldLandmarks: HandLandmarkSet
): {
  pullEvidenceScalar: number;
  releaseEvidenceScalar: number;
} => {
  const referenceLength = Math.max(
    MIN_REFERENCE_LENGTH,
    distance(worldLandmarks.wrist, worldLandmarks.indexMcp)
  );
  const normalizedThumbDistance =
    distance(worldLandmarks.thumbTip, worldLandmarks.indexMcp) /
    referenceLength;

  return {
    pullEvidenceScalar: clamp01(1 - normalizedThumbDistance),
    releaseEvidenceScalar: clamp01((normalizedThumbDistance - 0.45) / 0.75)
  };
};

export const extractSideTriggerEvidence = (
  detection: SideHandDetection
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
    computeScalars(worldLandmarks);
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
