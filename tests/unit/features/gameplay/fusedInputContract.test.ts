import { describe, expect, it } from "vitest";
import type { FusedGameInputFrame } from "../../../../src/features/input-fusion";

describe("M7 fused gameplay input contract", () => {
  it("consumes the public input-fusion FusedGameInputFrame type", () => {
    const frame = {
      fusionTimestampMs: 0,
      fusionMode: "noUsableInput",
      timeDeltaBetweenLanesMs: undefined,
      aim: undefined,
      trigger: undefined,
      shotFired: false,
      inputConfidence: 0,
      frontSource: {
        laneRole: "frontAim",
        frameTimestamp: undefined,
        frameAgeMs: undefined,
        laneHealth: "notStarted",
        availability: "unavailable",
        rejectReason: "frontMissing"
      },
      sideSource: {
        laneRole: "sideTrigger",
        frameTimestamp: undefined,
        frameAgeMs: undefined,
        laneHealth: "notStarted",
        availability: "unavailable",
        rejectReason: "sideMissing"
      },
      fusionRejectReason: "frontMissing"
    } satisfies FusedGameInputFrame;

    expect(frame.fusionMode).toBe("noUsableInput");
    expect(frame.shotFired).toBe(false);
  });
});
