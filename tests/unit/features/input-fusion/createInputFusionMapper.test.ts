import { describe, expect, it } from "vitest";
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
    maxPairDeltaMs: 25,
    maxFrameAgeMs: 80,
    recentFrameRetentionWindowMs: 200
  }
};

describe("createInputFusionMapper", () => {
  it("emits pairedFrontAndSide when timestamps are close", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const result = mapper.updateTriggerFrame(createTriggerFrame(115), context);

    expect(result.fusedFrame.fusionMode).toBe("pairedFrontAndSide");
    expect(result.fusedFrame.timeDeltaBetweenLanesMs).toBe(15);
    expect(result.fusedFrame.fusionTimestampMs).toBe(115);
    expect(result.telemetry.lastPairedFrontTimestampMs).toBe(100);
    expect(result.telemetry.lastPairedSideTimestampMs).toBe(115);
  });

  it("degrades to frontOnlyAim when side is missing", () => {
    const mapper = createInputFusionMapper();
    const result = mapper.updateAimFrame(createAimFrame(100), context);

    expect(result.fusedFrame.fusionMode).toBe("frontOnlyAim");
    expect(result.fusedFrame.fusionRejectReason).toBe("sideMissing");
    expect(result.fusedFrame.shotFired).toBe(false);
  });

  it("degrades to sideOnlyTriggerDiagnostic when front is missing", () => {
    const mapper = createInputFusionMapper();
    const result = mapper.updateTriggerFrame(createTriggerFrame(100), context);

    expect(result.fusedFrame.fusionMode).toBe("sideOnlyTriggerDiagnostic");
    expect(result.fusedFrame.fusionRejectReason).toBe("frontMissing");
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
    expect(
      gapMapper.updateTriggerFrame(createTriggerFrame(160), context).fusedFrame
        .fusionRejectReason
    ).toBe("timestampGapTooLarge");

    const staleMapper = createInputFusionMapper();
    staleMapper.updateTriggerFrame(createTriggerFrame(100), context);
    expect(
      staleMapper.updateAimFrame(createAimFrame(200), context).fusedFrame
        .fusionRejectReason
    ).toBe("sideStale");

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

  it("fires and consumes a shot commit only in paired mode", () => {
    const mapper = createInputFusionMapper();
    const sideCommit = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    const sideOnly = mapper.updateTriggerFrame(sideCommit, context);
    expect(sideOnly.fusedFrame.fusionMode).toBe("sideOnlyTriggerDiagnostic");
    expect(sideOnly.fusedFrame.shotFired).toBe(false);
    expect(sideOnly.telemetry.shotEdgeConsumed).toBe(false);

    const paired = mapper.updateAimFrame(createAimFrame(108), context);
    expect(paired.fusedFrame.shotFired).toBe(true);
    expect(paired.telemetry.shotEdgeConsumed).toBe(true);

    const repeat = mapper.updateAimFrame(createAimFrame(110), context);
    expect(repeat.fusedFrame.shotFired).toBe(false);
    expect(repeat.telemetry.shotEdgeConsumed).toBe(false);
  });

  it("resets affected buffers and side shot consumption independently", () => {
    const mapper = createInputFusionMapper();
    const sideCommit = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    mapper.updateTriggerFrame(sideCommit, context);
    expect(mapper.updateAimFrame(createAimFrame(105), context).fusedFrame.shotFired)
      .toBe(true);
    mapper.resetFrontLane();
    expect(mapper.updateTriggerFrame(createTriggerFrame(112), context).fusedFrame.fusionMode)
      .toBe("sideOnlyTriggerDiagnostic");
    mapper.resetSideLane();
    mapper.updateTriggerFrame(sideCommit, context);
    expect(mapper.updateAimFrame(createAimFrame(105), context).fusedFrame.shotFired)
      .toBe(true);
  });
});
