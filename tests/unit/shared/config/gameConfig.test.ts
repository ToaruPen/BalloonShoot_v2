import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../../src/shared/config/gameConfig";

describe("gameConfig", () => {
  it("exposes the PoC camera and input defaults", () => {
    expect(gameConfig.camera).toEqual({
      width: 640,
      height: 480,
      stallThresholdMs: 500
    });
    expect(gameConfig.input).toEqual({
      smoothingAlpha: 0.28,
      triggerPullThreshold: -0.25,
      triggerReleaseThreshold: -0.3,
      handFilterMinCutoff: 1.0,
      handFilterBeta: 0,
      handFilterDCutoff: 1.0,
      fireCooldownFrames: 2,
      fireStableAimFrames: 2,
      stableCrosshairMaxDelta: 18,
      armedEntryConfidenceBonus: 0,
      conditionedTriggerPullFloor: -0.12,
      conditionedTriggerReleaseFloor: -0.28
    });
  });
});
