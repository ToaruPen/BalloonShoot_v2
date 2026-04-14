import type { HandFrame } from "../../shared/types/hand";
import { gameConfig } from "../../shared/config/gameConfig";

export type TriggerState = "open" | "pulled";

export interface ThumbTriggerMeasurement {
  rawState: TriggerState;
  confidence: number;
  details: {
    cosine: number;
    pullThreshold: number;
    releaseThreshold: number;
  };
}

export interface TriggerTuning {
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

const HYSTERESIS_GAP = 0.01;
const WORLD_SPACE_PULL_THRESHOLD_OFFSET = 0.35;
const WORLD_SPACE_RELEASE_THRESHOLD_OFFSET = 0.3;

const resolveLandmarks = (frame: HandFrame) => frame.worldLandmarks ?? frame.landmarks;

const getScale = (frame: HandFrame) =>
  frame.worldLandmarks
    ? { x: 1, y: 1, z: 1 }
    : { x: frame.width, y: frame.height, z: frame.width };

// 3D cosine of the angle at thumbIp between the thumb tip and the index MCP:
// neutral finger-gun pose (thumb extended outward) yields negative values,
// pulling the thumb toward the index knuckle rotates the tip vector toward
// the index direction so the cosine rises toward +1. Lateral (x/y-plane) and
// palmward (z) hammer motions both reduce the angle, so one scalar covers
// both gesture styles.
// MediaPipe normalizes x/y per axis, so deltas are converted to pixel space
// before the dot product — otherwise a non-square frame skews the contributions.
// World-space landmarks are already metric, so we switch to unit scale there.
export const measureThumbCosine = (frame: HandFrame): number => {
  const { indexMcp, thumbIp, thumbTip } = resolveLandmarks(frame);
  const { x: sx, y: sy, z: sz } = getScale(frame);

  const v1x = (thumbTip.x - thumbIp.x) * sx;
  const v1y = (thumbTip.y - thumbIp.y) * sy;
  const v1z = (thumbTip.z - thumbIp.z) * sz;
  const v2x = (indexMcp.x - thumbIp.x) * sx;
  const v2y = (indexMcp.y - thumbIp.y) * sy;
  const v2z = (indexMcp.z - thumbIp.z) * sz;
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const m1 = Math.hypot(v1x, v1y, v1z) || 1;
  const m2 = Math.hypot(v2x, v2y, v2z) || 1;

  return dot / (m1 * m2);
};

const normalizeTriggerTuning = (tuning: TriggerTuning): TriggerTuning => {
  const triggerPullThreshold = Number.isFinite(tuning.triggerPullThreshold)
    ? tuning.triggerPullThreshold
    : gameConfig.input.triggerPullThreshold;
  const triggerReleaseThreshold = Number.isFinite(tuning.triggerReleaseThreshold)
    ? tuning.triggerReleaseThreshold
    : gameConfig.input.triggerReleaseThreshold;

  return {
    triggerPullThreshold,
    triggerReleaseThreshold: Math.min(
      triggerReleaseThreshold,
      triggerPullThreshold - HYSTERESIS_GAP
    )
  };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const measureThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): ThumbTriggerMeasurement => {
  const cosine = measureThumbCosine(frame);
  const safeTuning = normalizeTriggerTuning(
    frame.worldLandmarks
      ? {
          triggerPullThreshold:
            tuning.triggerPullThreshold + WORLD_SPACE_PULL_THRESHOLD_OFFSET,
          triggerReleaseThreshold:
            tuning.triggerReleaseThreshold + WORLD_SPACE_RELEASE_THRESHOLD_OFFSET
        }
      : tuning
  );
  const rawState =
    previousState === "pulled"
      ? cosine > safeTuning.triggerReleaseThreshold
        ? "pulled"
        : "open"
      : cosine > safeTuning.triggerPullThreshold
        ? "pulled"
        : "open";
  const confidenceRange = Math.max(
    safeTuning.triggerPullThreshold - safeTuning.triggerReleaseThreshold,
    Number.EPSILON
  );
  const confidence =
    rawState === "pulled"
      ? clamp01((cosine - safeTuning.triggerReleaseThreshold) / confidenceRange)
      : clamp01((safeTuning.triggerPullThreshold - cosine) / confidenceRange);

  return {
    rawState,
    confidence,
    details: {
      cosine,
      pullThreshold: safeTuning.triggerPullThreshold,
      releaseThreshold: safeTuning.triggerReleaseThreshold
    }
  };
};

export const evaluateThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): TriggerState => {
  return measureThumbTrigger(frame, previousState, tuning).rawState;
};
