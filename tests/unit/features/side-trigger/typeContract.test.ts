import { describe, expect, expectTypeOf, it } from "vitest";
import type { FrameTimestamp } from "../../../../src/shared/types/camera";
import type { SideViewQuality } from "../../../../src/shared/types/hand";
import type {
  SideTriggerDwellFrameCounts,
  SideTriggerTelemetry,
  SideTriggerPhase,
  TriggerEdge,
  TriggerInputFrame
} from "../../../../src/shared/types/trigger";
import { testTimestamp } from "./testFactory";

describe("side trigger shared type contract", () => {
  it("accepts a timestamped TriggerInputFrame for the side lane only", () => {
    const timestamp: FrameTimestamp = testTimestamp();
    const phase: SideTriggerPhase = "SideTriggerOpenReady";
    const edge: TriggerEdge = "shotCommitted";
    const sideViewQuality: SideViewQuality = "good";
    const dwellFrameCounts: SideTriggerDwellFrameCounts = {
      pullDwellFrames: 2,
      releaseDwellFrames: 0,
      stablePoseFrames: 3,
      lostHandFrames: 0,
      cooldownRemainingFrames: 0
    };
    const frame: TriggerInputFrame = {
      laneRole: "sideTrigger",
      timestamp,
      triggerAvailability: "available",
      sideTriggerPhase: phase,
      triggerEdge: edge,
      triggerPulled: true,
      shotCandidateConfidence: 0.91,
      sideHandDetected: true,
      sideViewQuality,
      dwellFrameCounts
    };

    expect(frame.timestamp.frameTimestampMs).toBe(1000);
    expect(frame.laneRole).toBe("sideTrigger");
    expectTypeOf(frame.sideTriggerPhase).toEqualTypeOf<SideTriggerPhase>();
  });

  it("accepts side trigger telemetry with calibration snapshot", () => {
    const telemetry: SideTriggerTelemetry = {
      phase: "SideTriggerOpenReady",
      edge: "none",
      triggerAvailability: "available",
      calibrationStatus: "default",
      calibration: {
        openPose: { normalizedThumbDistance: 1.2 },
        pulledPose: { normalizedThumbDistance: 0 }
      },
      pullEvidenceScalar: 0.1,
      releaseEvidenceScalar: 0.9,
      triggerPostureConfidence: 0.8,
      shotCandidateConfidence: 0.1,
      dwellFrameCounts: {
        pullDwellFrames: 0,
        releaseDwellFrames: 0,
        stablePoseFrames: 1,
        lostHandFrames: 0,
        cooldownRemainingFrames: 0
      },
      cooldownRemainingFrames: 0,
      lastRejectReason: undefined,
      usedWorldLandmarks: true
    };

    expect(telemetry.calibrationStatus).toBe("default");
    expect(telemetry.calibration.openPose.normalizedThumbDistance).toBe(1.2);
  });
});
