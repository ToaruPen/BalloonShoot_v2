import { describe, expect, it } from "vitest";
import type { AimInputFrame } from "../../../../src/shared/types/aim";
import type { TimestampSource } from "../../../../src/shared/types/camera";
import type { TriggerInputFrame } from "../../../../src/shared/types/trigger";
import {
  createInputFusionMapper,
  defaultFusionTuning,
  TIMESTAMP_SOURCE_CONFIDENCE_FACTOR
} from "../../../../src/features/input-fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

const context = {
  frontLaneHealth: "tracking" as const,
  sideLaneHealth: "tracking" as const,
  tuning: {
    ...defaultFusionTuning,
    maxPairDeltaMs: 25,
    maxFrameAgeMs: 80,
    recentFrameRetentionWindowMs: 200
  }
};

const aimWithTimestampSource = (
  frame: AimInputFrame,
  timestampSource: TimestampSource
): AimInputFrame => ({
  ...frame,
  timestamp: {
    ...frame.timestamp,
    timestampSource
  }
});

const triggerWithTimestampSource = (
  frame: TriggerInputFrame,
  timestampSource: TimestampSource
): TriggerInputFrame => ({
  ...frame,
  timestamp: {
    ...frame.timestamp,
    timestampSource
  }
});

const expectPairedDiagnosticContract = (
  result: ReturnType<
    ReturnType<typeof createInputFusionMapper>["updateAimFrame"]
  >
): void => {
  expect(result.fusedFrame.fusionMode).toBe("pairedFrontAndSide");
  expect(result.fusedFrame.fusionRejectReason).toBe("none");
  expect(result.fusedFrame.frontSource.laneRole).toBe("frontAim");
  expect(result.fusedFrame.sideSource.laneRole).toBe("sideTrigger");
};

describe("createInputFusionMapper", () => {
  it("emits pairedFrontAndSide when timestamps are close", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const result = mapper.updateTriggerFrame(createTriggerFrame(115), context);

    expectPairedDiagnosticContract(result);
    expect(result.fusedFrame.timeDeltaBetweenLanesMs).toBe(15);
    expect(result.fusedFrame.fusionTimestampMs).toBe(115);
    expect(result.fusedFrame.trigger?.timestamp.frameTimestampMs).toBe(115);
    expect(result.telemetry.lastPairedFrontTimestampMs).toBe(100);
    expect(result.telemetry.lastPairedSideTimestampMs).toBe(115);
  });

  it("degrades to frontOnlyAim when side is missing", () => {
    const mapper = createInputFusionMapper();
    const result = mapper.updateAimFrame(createAimFrame(100), context);

    expect(result.fusedFrame.fusionMode).toBe("frontOnlyAim");
    expect(result.fusedFrame.fusionRejectReason).toBe("sideMissing");
    expect(result.fusedFrame.frontSource.rejectReason).toBe("none");
    expect(result.fusedFrame.sideSource.rejectReason).toBe("sideMissing");
    expect(result.fusedFrame.shotFired).toBe(false);
  });

  it("degrades to sideOnlyTriggerDiagnostic when front is missing", () => {
    const mapper = createInputFusionMapper();
    const result = mapper.updateTriggerFrame(createTriggerFrame(100), context);

    expect(result.fusedFrame.fusionMode).toBe("sideOnlyTriggerDiagnostic");
    expect(result.fusedFrame.fusionRejectReason).toBe("frontMissing");
    expect(result.fusedFrame.frontSource.rejectReason).toBe("frontMissing");
    expect(result.fusedFrame.sideSource.rejectReason).toBe("none");
    expect(result.fusedFrame.shotFired).toBe(false);
  });

  it("reports noUsableInput when both lanes are unavailable or stale", () => {
    const mapper = createInputFusionMapper();
    mapper.updateAimFrame(
      createAimFrame(100, { aimAvailability: "unavailable" }),
      context
    );
    const result = mapper.updateTriggerFrame(
      createTriggerFrame(400, { triggerAvailability: "unavailable" }),
      context
    );

    expect(result.fusedFrame.fusionMode).toBe("noUsableInput");
    expect(result.fusedFrame.shotFired).toBe(false);
  });

  it("rejects timestamp gaps, stale frames, and failed lanes explicitly", () => {
    const gapMapper = createInputFusionMapper();
    gapMapper.updateAimFrame(createAimFrame(100), context);
    const timestampGap = gapMapper.updateTriggerFrame(
      createTriggerFrame(160),
      context
    ).fusedFrame;
    expect(timestampGap.fusionRejectReason).toBe("timestampGapTooLarge");
    expect(timestampGap.frontSource.rejectReason).toBe("none");
    expect(timestampGap.sideSource.rejectReason).toBe("none");

    const staleMapper = createInputFusionMapper();
    staleMapper.updateTriggerFrame(createTriggerFrame(100), context);
    const sideStale = staleMapper.updateAimFrame(
      createAimFrame(200),
      context
    ).fusedFrame;
    expect(sideStale.fusionRejectReason).toBe("sideStale");
    expect(sideStale.frontSource.rejectReason).toBe("none");
    expect(sideStale.sideSource.rejectReason).toBe("sideStale");

    const frontStaleMapper = createInputFusionMapper();
    frontStaleMapper.updateAimFrame(createAimFrame(100), context);
    const frontStale = frontStaleMapper.updateTriggerFrame(
      createTriggerFrame(200),
      context
    ).fusedFrame;
    expect(frontStale.fusionRejectReason).toBe("frontStale");
    expect(frontStale.frontSource.rejectReason).toBe("frontStale");
    expect(frontStale.sideSource.rejectReason).toBe("none");

    const failedMapper = createInputFusionMapper();
    expect(
      failedMapper.updateAimFrame(createAimFrame(100), {
        ...context,
        sideLaneHealth: "failed"
      }).fusedFrame.fusionRejectReason
    ).toBe("laneFailed");
    expect(
      failedMapper.updateAimFrame(createAimFrame(110), {
        ...context,
        sideLaneHealth: "stalled"
      }).fusedFrame.fusionRejectReason
    ).toBe("laneFailed");
  });

  it("fires the side shot commit even when the pair fails due to timestamp gap", () => {
    const mapper = createInputFusionMapper();
    const gapContext = {
      ...context,
      tuning: {
        ...context.tuning,
        maxPairDeltaMs: 25,
        maxFrameAgeMs: 250,
        recentFrameRetentionWindowMs: 300
      }
    };

    mapper.updateAimFrame(createAimFrame(100), gapContext);
    const result = mapper.updateTriggerFrame(
      createTriggerFrame(160, { triggerEdge: "shotCommitted" }),
      gapContext
    );

    expect(result.fusedFrame.fusionMode).toBe("frontOnlyAim");
    expect(result.fusedFrame.fusionRejectReason).toBe("timestampGapTooLarge");
    expect(result.fusedFrame.shotFired).toBe(true);
    expect(result.telemetry.shotEdgeConsumed).toBe(true);
  });

  it("fires and consumes a shot commit only when both lanes are usable", () => {
    const mapper = createInputFusionMapper();
    const sideCommit = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    const sideOnly = mapper.updateTriggerFrame(sideCommit, context);
    expect(sideOnly.fusedFrame.fusionMode).toBe("sideOnlyTriggerDiagnostic");
    expect(sideOnly.fusedFrame.shotFired).toBe(false);
    expect(sideOnly.telemetry.shotEdgeConsumed).toBe(false);

    const paired = mapper.updateAimFrame(createAimFrame(108), context);
    expectPairedDiagnosticContract(paired);
    expect(paired.fusedFrame.shotFired).toBe(true);
    expect(paired.telemetry.shotEdgeConsumed).toBe(true);

    const repeat = mapper.updateAimFrame(createAimFrame(110), context);
    expect(repeat.fusedFrame.shotFired).toBe(false);
    expect(repeat.telemetry.shotEdgeConsumed).toBe(false);
  });

  it("skips unavailable side candidates before consuming an earlier committed shot", () => {
    const mapper = createInputFusionMapper();
    const pairingContext = {
      ...context,
      tuning: { ...context.tuning, maxPairDeltaMs: 40 }
    };

    mapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerEdge: "shotCommitted" }),
      pairingContext
    );
    mapper.updateTriggerFrame(
      createTriggerFrame(120, { triggerAvailability: "unavailable" }),
      pairingContext
    );

    const result = mapper.updateAimFrame(createAimFrame(130), pairingContext);

    expectPairedDiagnosticContract(result);
    expect(result.fusedFrame.shotFired).toBe(true);
    expect(result.fusedFrame.trigger?.timestamp.frameTimestampMs).toBe(100);
  });

  it("treats unavailable fresh side frames as sideMissing", () => {
    const mapper = createInputFusionMapper();

    mapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerAvailability: "unavailable" }),
      context
    );
    const result = mapper.updateAimFrame(createAimFrame(100), context);

    expect(result.fusedFrame.fusionRejectReason).toBe("sideMissing");
    expect(result.fusedFrame.frontSource.rejectReason).toBe("none");
    expect(result.fusedFrame.sideSource.rejectReason).toBe("sideMissing");
  });

  it("keeps the nearest side candidate when it is usable", () => {
    const mapper = createInputFusionMapper();
    const pairingContext = {
      ...context,
      tuning: { ...context.tuning, maxPairDeltaMs: 40 }
    };

    mapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerEdge: "shotCommitted" }),
      pairingContext
    );
    mapper.updateTriggerFrame(createTriggerFrame(120), pairingContext);

    const result = mapper.updateAimFrame(createAimFrame(130), pairingContext);

    expectPairedDiagnosticContract(result);
    expect(result.fusedFrame.shotFired).toBe(false);
    expect(result.fusedFrame.trigger?.timestamp.frameTimestampMs).toBe(120);
  });

  it("skips unavailable front candidates before pairing an incoming shot commit", () => {
    const mapper = createInputFusionMapper();
    const pairingContext = {
      ...context,
      tuning: { ...context.tuning, maxPairDeltaMs: 40 }
    };

    mapper.updateAimFrame(createAimFrame(100), pairingContext);
    mapper.updateAimFrame(
      createAimFrame(120, { aimAvailability: "unavailable" }),
      pairingContext
    );

    const result = mapper.updateTriggerFrame(
      createTriggerFrame(130, { triggerEdge: "shotCommitted" }),
      pairingContext
    );

    expectPairedDiagnosticContract(result);
    expect(result.fusedFrame.shotFired).toBe(true);
    expect(result.fusedFrame.aim?.timestamp.frameTimestampMs).toBe(100);
  });

  it("treats unavailable fresh front frames as frontMissing", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(
      createAimFrame(100, { aimAvailability: "unavailable" }),
      context
    );
    const result = mapper.updateTriggerFrame(createTriggerFrame(100), context);

    expect(result.fusedFrame.fusionRejectReason).toBe("frontMissing");
    expect(result.fusedFrame.frontSource.rejectReason).toBe("frontMissing");
    expect(result.fusedFrame.sideSource.rejectReason).toBe("none");
  });

  it("does not expose side trigger data when timestamp gap falls back to frontOnlyAim", () => {
    const mapper = createInputFusionMapper();
    const gapContext = {
      ...context,
      tuning: {
        ...context.tuning,
        maxPairDeltaMs: 25,
        maxFrameAgeMs: 250,
        recentFrameRetentionWindowMs: 300
      }
    };

    mapper.updateAimFrame(createAimFrame(100), gapContext);
    const result = mapper.updateTriggerFrame(
      createTriggerFrame(300),
      gapContext
    );

    expect(result.fusedFrame.fusionMode).toBe("frontOnlyAim");
    expect(result.fusedFrame.fusionRejectReason).toBe("timestampGapTooLarge");
    expect(result.fusedFrame.trigger).toBeUndefined();
  });

  it("keeps paired trigger data when timestamps pair successfully", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const result = mapper.updateTriggerFrame(createTriggerFrame(115), context);

    expectPairedDiagnosticContract(result);
    expect(result.fusedFrame.trigger?.timestamp.frameTimestampMs).toBe(115);
    expect(result.fusedFrame.trigger?.laneRole).toBe("sideTrigger");
  });

  it("penalizes confidence when paired lanes use degraded timestamp sources", () => {
    const captureMapper = createInputFusionMapper();
    captureMapper.updateAimFrame(createAimFrame(100), context);
    const captureResult = captureMapper.updateTriggerFrame(
      createTriggerFrame(115),
      context
    );

    const sidePerformanceMapper = createInputFusionMapper();
    sidePerformanceMapper.updateAimFrame(createAimFrame(100), context);
    const sidePerformanceResult = sidePerformanceMapper.updateTriggerFrame(
      triggerWithTimestampSource(
        createTriggerFrame(115),
        "performanceNowAtCallback"
      ),
      context
    );

    const bothDegradedMapper = createInputFusionMapper();
    bothDegradedMapper.updateAimFrame(
      aimWithTimestampSource(
        createAimFrame(100),
        "requestVideoFrameCallbackExpectedDisplayTime"
      ),
      context
    );
    const bothDegradedResult = bothDegradedMapper.updateTriggerFrame(
      triggerWithTimestampSource(
        createTriggerFrame(115),
        "performanceNowAtCallback"
      ),
      context
    );

    expect(captureResult.fusedFrame.inputConfidence).toBeCloseTo(0.7);
    expect(sidePerformanceResult.fusedFrame.inputConfidence).toBeCloseTo(
      0.7 * TIMESTAMP_SOURCE_CONFIDENCE_FACTOR.performanceNowAtCallback
    );
    expect(bothDegradedResult.fusedFrame.inputConfidence).toBeCloseTo(
      0.7 *
        Math.min(
          TIMESTAMP_SOURCE_CONFIDENCE_FACTOR.requestVideoFrameCallbackExpectedDisplayTime,
          TIMESTAMP_SOURCE_CONFIDENCE_FACTOR.performanceNowAtCallback
        )
    );
  });

  it("attributes laneFailed only to sources whose current lane health failed", () => {
    const sideFailed = createInputFusionMapper().updateAimFrame(
      createAimFrame(100),
      {
        ...context,
        sideLaneHealth: "failed"
      }
    ).fusedFrame;

    expect(sideFailed.frontSource.rejectReason).toBe("none");
    expect(sideFailed.sideSource.rejectReason).toBe("laneFailed");

    const frontFailed = createInputFusionMapper().updateTriggerFrame(
      createTriggerFrame(100),
      {
        ...context,
        frontLaneHealth: "failed"
      }
    ).fusedFrame;

    expect(frontFailed.frontSource.rejectReason).toBe("laneFailed");
    expect(frontFailed.sideSource.rejectReason).toBe("none");

    const bothFailed = createInputFusionMapper().updateAimFrame(
      createAimFrame(100),
      {
        ...context,
        frontLaneHealth: "failed",
        sideLaneHealth: "failed"
      }
    ).fusedFrame;

    expect(bothFailed.frontSource.rejectReason).toBe("laneFailed");
    expect(bothFailed.sideSource.rejectReason).toBe("laneFailed");
  });

  it("locks captureLost lane health to laneFailed without pairing stale opposite frames", () => {
    const frontLostMapper = createInputFusionMapper();
    frontLostMapper.updateAimFrame(createAimFrame(100), context);
    const frontLost = frontLostMapper.updateTriggerUnavailable(
      createTriggerFrame(116).timestamp,
      {
        ...context,
        frontLaneHealth: "captureLost"
      }
    ).fusedFrame;

    expect(frontLost.fusionRejectReason).toBe("laneFailed");
    expect(frontLost.frontSource.laneHealth).toBe("captureLost");
    expect(frontLost.frontSource.rejectReason).toBe("laneFailed");
    expect(frontLost.fusionMode).not.toBe("pairedFrontAndSide");

    const sideLostMapper = createInputFusionMapper();
    sideLostMapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerEdge: "shotCommitted" }),
      context
    );
    const sideLost = sideLostMapper.updateAimUnavailable(
      createAimFrame(116).timestamp,
      {
        ...context,
        sideLaneHealth: "captureLost"
      }
    ).fusedFrame;

    expect(sideLost.fusionRejectReason).toBe("laneFailed");
    expect(sideLost.sideSource.laneHealth).toBe("captureLost");
    expect(sideLost.sideSource.rejectReason).toBe("laneFailed");
    expect(sideLost.fusionMode).not.toBe("pairedFrontAndSide");
    expect(sideLost.shotFired).toBe(false);
  });

  it("resets affected buffers and side shot consumption independently", () => {
    const mapper = createInputFusionMapper();
    const sideCommit = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    mapper.updateTriggerFrame(sideCommit, context);
    expect(
      mapper.updateAimFrame(createAimFrame(105), context).fusedFrame.shotFired
    ).toBe(true);
    mapper.resetFrontLane();
    expect(
      mapper.updateTriggerFrame(createTriggerFrame(112), context).fusedFrame
        .fusionMode
    ).toBe("sideOnlyTriggerDiagnostic");
    mapper.resetSideLane();
    // Reuse sideCommit intentionally to prove resetSideLane clears consumption
    // keys before updateTriggerFrame and updateAimFrame pair it again.
    mapper.updateTriggerFrame(sideCommit, context);
    expect(
      mapper.updateAimFrame(createAimFrame(105), context).fusedFrame.shotFired
    ).toBe(true);
  });
});
