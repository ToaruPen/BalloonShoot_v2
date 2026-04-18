import { describe, expect, it } from "vitest";
import type {
  FusedGameInputFrame,
  FusionTelemetry
} from "../../../../src/shared/types/fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

describe("input fusion type contracts", () => {
  it("accepts M5 aim frames and M4 trigger frames without changing lane roles", () => {
    const aim = createAimFrame(100);
    const trigger = createTriggerFrame(108);
    const fusedFrame: FusedGameInputFrame = {
      fusionTimestampMs: 108,
      fusionMode: "pairedFrontAndSide",
      timeDeltaBetweenLanesMs: 8,
      aim,
      trigger,
      shotFired: false,
      inputConfidence: 0.7,
      frontSource: {
        laneRole: "frontAim",
        frameTimestamp: aim.timestamp,
        frameAgeMs: 8,
        laneHealth: "tracking",
        availability: "available",
        rejectReason: "none"
      },
      sideSource: {
        laneRole: "sideTrigger",
        frameTimestamp: trigger.timestamp,
        frameAgeMs: 0,
        laneHealth: "tracking",
        availability: "available",
        rejectReason: "none"
      },
      fusionRejectReason: "none"
    };
    const telemetry: FusionTelemetry = {
      mode: "pairedFrontAndSide",
      timeDeltaBetweenLanesMs: 8,
      maxPairDeltaMs: 40,
      maxFrameAgeMs: 120,
      frontBufferFrameCount: 1,
      sideBufferFrameCount: 1,
      frontLatestAgeMs: 8,
      sideLatestAgeMs: 0,
      inputConfidence: 0.7,
      shotFired: false,
      rejectReason: "none",
      lastPairedFrontTimestampMs: 100,
      lastPairedSideTimestampMs: 108,
      timestampSourceSummary:
        "front=captureTime side=captureTime delta=8.000ms",
      shotEdgeConsumed: false
    };

    expect(fusedFrame.aim?.laneRole).toBe("frontAim");
    expect(fusedFrame.trigger?.laneRole).toBe("sideTrigger");
    expect(telemetry.mode).toBe("pairedFrontAndSide");
  });
});
