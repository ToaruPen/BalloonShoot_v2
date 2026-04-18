import { describe, expect, it } from "vitest";
import { createFusionTelemetry } from "../../../../src/features/input-fusion";
import type { FusedGameInputFrame } from "../../../../src/shared/types/fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

describe("fusion telemetry", () => {
  it("mirrors latest fused frame and buffer diagnostics", () => {
    const aim = createAimFrame(100, {
      timestamp: {
        frameTimestampMs: 100,
        timestampSource: "requestVideoFrameCallbackCaptureTime",
        presentedFrames: 1,
        receivedAtPerformanceMs: 101
      }
    });
    const trigger = createTriggerFrame(120, {
      timestamp: {
        frameTimestampMs: 120,
        timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
        presentedFrames: 2,
        receivedAtPerformanceMs: 121
      }
    });
    const fusedFrame: FusedGameInputFrame = {
      fusionTimestampMs: 120,
      fusionMode: "pairedFrontAndSide",
      timeDeltaBetweenLanesMs: 20,
      aim,
      trigger,
      shotFired: true,
      inputConfidence: 0.7,
      frontSource: {
        laneRole: "frontAim",
        frameTimestamp: aim.timestamp,
        frameAgeMs: 20,
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

    const telemetry = createFusionTelemetry(fusedFrame, {
      maxPairDeltaMs: 40,
      maxFrameAgeMs: 120,
      frontBufferFrameCount: 2,
      sideBufferFrameCount: 3,
      shotEdgeConsumed: true
    });

    expect(telemetry.mode).toBe("pairedFrontAndSide");
    expect(telemetry.frontLatestAgeMs).toBe(20);
    expect(telemetry.sideLatestAgeMs).toBe(0);
    expect(telemetry.timestampSourceSummary).toBe(
      "front=captureTime side=expectedDisplayTime delta=20.000ms"
    );
    expect(telemetry.shotEdgeConsumed).toBe(true);
  });

  it("keeps missing pair timestamps unavailable for renderers", () => {
    const aim = createAimFrame(100);
    const telemetry = createFusionTelemetry(
      {
        fusionTimestampMs: 100,
        fusionMode: "frontOnlyAim",
        timeDeltaBetweenLanesMs: undefined,
        aim,
        trigger: undefined,
        shotFired: false,
        inputConfidence: 0.4,
        frontSource: {
          laneRole: "frontAim",
          frameTimestamp: aim.timestamp,
          frameAgeMs: 0,
          laneHealth: "tracking",
          availability: "available",
          rejectReason: "none"
        },
        sideSource: {
          laneRole: "sideTrigger",
          frameTimestamp: undefined,
          frameAgeMs: undefined,
          laneHealth: "notStarted",
          availability: "unavailable",
          rejectReason: "sideMissing"
        },
        fusionRejectReason: "sideMissing"
      },
      {
        maxPairDeltaMs: 40,
        maxFrameAgeMs: 120,
        frontBufferFrameCount: 1,
        sideBufferFrameCount: 0,
        shotEdgeConsumed: false
      }
    );

    expect(telemetry.lastPairedFrontTimestampMs).toBeUndefined();
    expect(telemetry.lastPairedSideTimestampMs).toBeUndefined();
  });
});
