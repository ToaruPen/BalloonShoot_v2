import { describe, expect, it } from "vitest";
import { evaluateGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import type { HandFrame } from "../../../../src/shared/types/hand";

const IMAGE_SPACE_ONLY_NO_GUN_POSE: HandFrame = {
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.45, y: 0.65, z: 0 },
    indexTip: { x: 0.48, y: 0.65, z: 0 },
    indexMcp: { x: 0.5, y: 0.65, z: 0 },
    thumbTip: { x: 0.3, y: 0.65, z: 0 },
    thumbIp: { x: 0.4, y: 0.65, z: 0 },
    middleTip: { x: 0.8, y: 0.74, z: 0 },
    ringTip: { x: 0.84, y: 0.74, z: 0 },
    pinkyTip: { x: 0.88, y: 0.74, z: 0 }
  }
};

const WORLD_PREFER_GUN_POSE: HandFrame = {
  ...IMAGE_SPACE_ONLY_NO_GUN_POSE,
  worldLandmarks: {
    wrist: { x: 0, y: 0, z: 0 },
    indexMcp: { x: 1, y: 0, z: 0 },
    indexTip: { x: 1.6, y: 0, z: 0 },
    thumbTip: { x: 0.3, y: 0, z: 0 },
    thumbIp: { x: 0, y: 0.2, z: 0 },
    middleTip: { x: 0, y: 0, z: 0 },
    ringTip: { x: 0, y: -0.2, z: 0 },
    pinkyTip: { x: 0, y: -0.1, z: 0 }
  }
};

const WORLD_DEPTH_GUN_POSE: HandFrame = {
  ...IMAGE_SPACE_ONLY_NO_GUN_POSE,
  worldLandmarks: {
    wrist: { x: 0, y: 0, z: 0 },
    indexMcp: { x: 0, y: 0.1, z: 0 },
    indexTip: { x: 0, y: 0.15, z: -0.4 },
    thumbTip: { x: -0.1, y: 0.05, z: -0.05 },
    thumbIp: { x: -0.05, y: 0.08, z: -0.02 },
    middleTip: { x: 0.05, y: -0.05, z: -0.05 },
    ringTip: { x: 0.02, y: -0.07, z: -0.04 },
    pinkyTip: { x: -0.02, y: -0.06, z: -0.03 }
  }
};

describe("evaluateGunPose", () => {
  it("prefers world-space landmarks over image-space landmarks", () => {
    expect(evaluateGunPose(IMAGE_SPACE_ONLY_NO_GUN_POSE)).toBe(false);
    expect(evaluateGunPose(WORLD_PREFER_GUN_POSE)).toBe(true);
  });

  it("uses image-space landmarks when world landmarks are absent", () => {
    expect(evaluateGunPose(IMAGE_SPACE_ONLY_NO_GUN_POSE)).toBe(false);
  });

  it("detects a world-space gun pose when the index extends toward the camera", () => {
    expect(evaluateGunPose(WORLD_DEPTH_GUN_POSE)).toBe(true);
  });
});
