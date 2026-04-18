import { describe, expect, it } from "vitest";
import type {
  FusedGameInputFrame,
  FusionRejectReason,
  FusionTelemetry
} from "../../../../src/shared/types/fusion";
import {
  createInputFusionMapper,
  defaultFusionTuning
} from "../../../../src/features/input-fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

const context = {
  frontLaneHealth: "tracking" as const,
  sideLaneHealth: "tracking" as const,
  tuning: {
    ...defaultFusionTuning,
    maxPairDeltaMs: 20,
    maxFrameAgeMs: 80,
    recentFrameRetentionWindowMs: 200
  }
};

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
    expect(fusedFrame.fusionTimestampMs).toBe(108);
    expect(fusedFrame.aim?.timestamp.frameTimestampMs).toBe(100);
    expect(fusedFrame.trigger?.timestamp.frameTimestampMs).toBe(108);
    expect(fusedFrame.frontSource.rejectReason).toBe("none");
    expect(fusedFrame.sideSource.rejectReason).toBe("none");
    expect(fusedFrame.fusionRejectReason).toBe("none");
    expect(telemetry.mode).toBe("pairedFrontAndSide");
    expect(telemetry.rejectReason).toBe("none");
  });

  it("keeps every fusion reject reason reachable in mapper output", () => {
    const reasons = new Set<FusionRejectReason>();

    const noneMapper = createInputFusionMapper();
    noneMapper.updateAimFrame(createAimFrame(100), context);
    reasons.add(
      noneMapper.updateTriggerFrame(createTriggerFrame(108), context).fusedFrame
        .fusionRejectReason
    );

    reasons.add(
      createInputFusionMapper().updateAimFrame(createAimFrame(100), context)
        .fusedFrame.fusionRejectReason
    );
    reasons.add(
      createInputFusionMapper().updateTriggerFrame(
        createTriggerFrame(100),
        context
      ).fusedFrame.fusionRejectReason
    );

    const gapMapper = createInputFusionMapper();
    gapMapper.updateAimFrame(createAimFrame(100), context);
    reasons.add(
      gapMapper.updateTriggerFrame(createTriggerFrame(150), context).fusedFrame
        .fusionRejectReason
    );

    const frontStaleMapper = createInputFusionMapper();
    frontStaleMapper.updateAimFrame(createAimFrame(100), context);
    reasons.add(
      frontStaleMapper.updateTriggerFrame(createTriggerFrame(190), {
        ...context,
        tuning: { ...context.tuning, maxPairDeltaMs: 100 }
      }).fusedFrame.fusionRejectReason
    );

    const sideStaleMapper = createInputFusionMapper();
    sideStaleMapper.updateTriggerFrame(createTriggerFrame(100), context);
    reasons.add(
      sideStaleMapper.updateAimFrame(createAimFrame(190), {
        ...context,
        tuning: { ...context.tuning, maxPairDeltaMs: 100 }
      }).fusedFrame.fusionRejectReason
    );

    reasons.add(
      createInputFusionMapper().updateAimFrame(createAimFrame(100), {
        ...context,
        sideLaneHealth: "failed"
      }).fusedFrame.fusionRejectReason
    );

    expect([...reasons].sort()).toEqual([
      "frontMissing",
      "frontStale",
      "laneFailed",
      "none",
      "sideMissing",
      "sideStale",
      "timestampGapTooLarge"
    ]);
  });
});
