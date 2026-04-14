import type { HandFrame } from "../../shared/types/hand";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

export interface GunPoseMeasurement {
  detected: boolean;
  confidence: number;
  details: {
    indexExtended: boolean;
    curledFingerCount: number;
    curledThreshold: number;
    frontFacingConfidence: number;
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const measureFrontFacingConfidence = (frame: HandFrame): number => {
  const { wrist, indexMcp, pinkyTip } = resolveLandmarks(frame);
  const { x: sx, y: sy, z: sz } = getScale(frame);

  const handAxisX = (indexMcp.x - wrist.x) * sx;
  const handAxisY = (indexMcp.y - wrist.y) * sy;
  const handAxisZ = (indexMcp.z - wrist.z) * sz;
  const lateralAxisX = (pinkyTip.x - indexMcp.x) * sx;
  const lateralAxisY = (pinkyTip.y - indexMcp.y) * sy;
  const lateralAxisZ = (pinkyTip.z - indexMcp.z) * sz;

  const normalX = handAxisY * lateralAxisZ - handAxisZ * lateralAxisY;
  const normalY = handAxisZ * lateralAxisX - handAxisX * lateralAxisZ;
  const normalZ = handAxisX * lateralAxisY - handAxisY * lateralAxisX;
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;

  return clamp01(Math.abs(normalZ) / normalLength);
};

const resolveLandmarks = (frame: HandFrame) => frame.worldLandmarks ?? frame.landmarks;

const getScale = (frame: HandFrame) =>
  frame.worldLandmarks
    ? { x: 1, y: 1, z: 1 }
    : { x: frame.width, y: frame.height, z: frame.width };

// Ratio of hand scale the index fingertip must exceed to count as extended.
// Derived from the recorded bench fixtures: p10 of tip-MCP ratios across all
// detected frames is ~0.45 (curled region) and the minimum ratio on missed
// pulls was ~0.594, so 0.55 sits cleanly in the gap.
const INDEX_EXTENDED_RATIO = 0.55;

// Ratio of hand scale along the palm axis a non-index fingertip must retreat
// from the MCP for the finger to count as curled. Positive values mean the
// tip has moved toward the wrist.
const CURLED_PROJECTION_RATIO = 0.15;

export const measureGunPose = (frame: HandFrame): GunPoseMeasurement => {
  const { wrist, indexTip, indexMcp, middleTip, ringTip, pinkyTip } = resolveLandmarks(frame);
  const { x: sx, y: sy, z: sz } = getScale(frame);
  const frontFacingConfidence = measureFrontFacingConfidence(frame);

  const wristToMcpX = (indexMcp.x - wrist.x) * sx;
  const wristToMcpY = (indexMcp.y - wrist.y) * sy;
  const wristToMcpZ = (indexMcp.z - wrist.z) * sz;
  const handScale = Math.hypot(wristToMcpX, wristToMcpY, wristToMcpZ) || 1;

  const indexReachX = (indexTip.x - indexMcp.x) * sx;
  const indexReachY = (indexTip.y - indexMcp.y) * sy;
  const indexReachZ = (indexTip.z - indexMcp.z) * sz;
  const indexReach = Math.hypot(indexReachX, indexReachY, indexReachZ);
  const indexExtended = indexReach > handScale * INDEX_EXTENDED_RATIO;

  // Palm axis: from the index knuckle toward the wrist. A curled fingertip
  // projects positively onto this axis (it has moved back toward the palm).
  const palmAxisX = -wristToMcpX;
  const palmAxisY = -wristToMcpY;
  const palmAxisZ = -wristToMcpZ;
  const palmAxisLength = Math.hypot(palmAxisX, palmAxisY, palmAxisZ) || 1;
  const palmAxisUnitX = palmAxisX / palmAxisLength;
  const palmAxisUnitY = palmAxisY / palmAxisLength;
  const palmAxisUnitZ = palmAxisZ / palmAxisLength;
  const curledThreshold = handScale * CURLED_PROJECTION_RATIO;

  const curledFingerCount = [middleTip, ringTip, pinkyTip].filter((point) => {
    const dx = (point.x - indexMcp.x) * sx;
    const dy = (point.y - indexMcp.y) * sy;
    const dz = (point.z - indexMcp.z) * sz;
    const projection = dx * palmAxisUnitX + dy * palmAxisUnitY + dz * palmAxisUnitZ;
    return projection > curledThreshold;
  }).length;

  const detected = indexExtended && curledFingerCount >= 2;
  const rawConfidence = indexExtended ? Math.min(1, 0.5 + curledFingerCount / 6) : 0;
  const confidence = detected
    ? rawConfidence
    : Math.min(rawConfidence, FIRE_ENTRY_GUN_POSE_CONFIDENCE - Number.EPSILON);

  return {
    detected,
    confidence,
    details: {
      indexExtended,
      curledFingerCount,
      curledThreshold,
      frontFacingConfidence
    }
  };
};

export const evaluateGunPose = (frame: HandFrame): boolean => {
  return measureGunPose(frame).detected;
};
