import { describe, expect, expectTypeOf, it } from "vitest";
import type { FrameTimestamp } from "../../../../src/shared/types/camera";
import type {
  AimAvailability,
  AimInputFrame,
  AimSmoothingState,
  FrontAimTelemetry
} from "../../../../src/shared/types/aim";
import { testTimestamp } from "./testFactory";

describe("front aim shared type contract", () => {
  it("accepts a timestamped AimInputFrame for the front lane only", () => {
    const timestamp: FrameTimestamp = testTimestamp();
    const availability: AimAvailability = "available";
    const smoothingState: AimSmoothingState = "tracking";
    const frame: AimInputFrame = {
      laneRole: "frontAim",
      timestamp,
      aimAvailability: availability,
      aimPointViewport: { x: 320, y: 180 },
      aimPointNormalized: { x: 0.5, y: 0.5 },
      aimSmoothingState: smoothingState,
      frontHandDetected: true,
      frontTrackingConfidence: 0.91,
      sourceFrameSize: { width: 640, height: 480 }
    };

    expect(frame.timestamp.frameTimestampMs).toBe(1000);
    expect(frame.laneRole).toBe("frontAim");
    expectTypeOf(frame.aimAvailability).toEqualTypeOf<AimAvailability>();
  });

  it("accepts telemetry derived from an AimInputFrame", () => {
    const frame: AimInputFrame = {
      laneRole: "frontAim",
      timestamp: testTimestamp(),
      aimAvailability: "estimatedFromRecentFrame",
      aimPointViewport: { x: 512, y: 256 },
      aimPointNormalized: { x: 0.8, y: 0.4 },
      aimSmoothingState: "recoveringAfterLoss",
      frontHandDetected: false,
      frontTrackingConfidence: 0.8,
      sourceFrameSize: { width: 640, height: 480 }
    };
    const telemetry: FrontAimTelemetry = {
      aimAvailability: frame.aimAvailability,
      aimSmoothingState: frame.aimSmoothingState,
      frontHandDetected: frame.frontHandDetected,
      frontTrackingConfidence: frame.frontTrackingConfidence,
      aimPointViewport: frame.aimPointViewport,
      aimPointNormalized: frame.aimPointNormalized,
      sourceFrameSize: frame.sourceFrameSize,
      lastLostReason: "handNotDetected"
    };

    expect(telemetry.aimPointViewport?.x).toBe(512);
    expect(telemetry.lastLostReason).toBe("handNotDetected");
  });
});
