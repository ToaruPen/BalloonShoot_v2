import { describe, expect, it } from "vitest";
import {
  defaultSideTriggerTuning,
  sideTriggerSliderMetadata
} from "../../../../src/features/side-trigger/sideTriggerConfig";
import {
  SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES,
  SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT,
  SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES,
  SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES,
  SIDE_TRIGGER_PULL_ENTER_THRESHOLD,
  SIDE_TRIGGER_PULL_EXIT_THRESHOLD,
  SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD,
  SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD,
  SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES,
  SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES
} from "../../../../src/features/side-trigger/sideTriggerConstants";

const expectedConstantNames = [
  "SIDE_TRIGGER_PULL_ENTER_THRESHOLD",
  "SIDE_TRIGGER_PULL_EXIT_THRESHOLD",
  "SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD",
  "SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD",
  "SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES",
  "SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES",
  "SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES",
  "SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES",
  "SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES",
  "SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT"
];

describe("side trigger tuning configuration", () => {
  it("exposes every named M4 threshold exactly once in slider metadata", () => {
    const names = sideTriggerSliderMetadata.map((item) => item.constantName);

    expect([...names].sort()).toEqual([...expectedConstantNames].sort());
    expect(new Set(names).size).toBe(expectedConstantNames.length);
  });

  it("keeps default tuning in sync with exported constants", () => {
    expect(defaultSideTriggerTuning.pullEnterThreshold).toBe(
      SIDE_TRIGGER_PULL_ENTER_THRESHOLD
    );
    expect(defaultSideTriggerTuning.pullExitThreshold).toBe(
      SIDE_TRIGGER_PULL_EXIT_THRESHOLD
    );
    expect(defaultSideTriggerTuning.releaseEnterThreshold).toBe(
      SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD
    );
    expect(defaultSideTriggerTuning.releaseExitThreshold).toBe(
      SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD
    );
    expect(defaultSideTriggerTuning.minPullDwellFrames).toBe(
      SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES
    );
    expect(defaultSideTriggerTuning.minReleaseDwellFrames).toBe(
      SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES
    );
    expect(defaultSideTriggerTuning.stablePoseRequiredFrames).toBe(
      SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES
    );
    expect(defaultSideTriggerTuning.lostHandGraceFrames).toBe(
      SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES
    );
    expect(defaultSideTriggerTuning.shotCooldownFrames).toBe(
      SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES
    );
    expect(defaultSideTriggerTuning.minConfidenceForCommit).toBe(
      SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT
    );
  });

  it("uses valid hysteresis and positive integer frame counts", () => {
    expect(defaultSideTriggerTuning.pullEnterThreshold).toBeGreaterThan(
      defaultSideTriggerTuning.pullExitThreshold
    );
    expect(defaultSideTriggerTuning.releaseEnterThreshold).toBeGreaterThan(
      defaultSideTriggerTuning.releaseExitThreshold
    );

    for (const value of [
      defaultSideTriggerTuning.minPullDwellFrames,
      defaultSideTriggerTuning.minReleaseDwellFrames,
      defaultSideTriggerTuning.stablePoseRequiredFrames,
      defaultSideTriggerTuning.lostHandGraceFrames,
      defaultSideTriggerTuning.shotCooldownFrames
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });
});
