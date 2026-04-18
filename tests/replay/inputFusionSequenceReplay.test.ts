import { describe, expect, it } from "vitest";
import {
  createInputFusionMapper,
  defaultFusionTuning
} from "../../src/features/input-fusion";
import { createAimFrame, createTriggerFrame } from "../unit/features/input-fusion/testFactory";

const context = {
  frontLaneHealth: "tracking" as const,
  sideLaneHealth: "tracking" as const,
  tuning: {
    ...defaultFusionTuning,
    maxPairDeltaMs: 18,
    maxFrameAgeMs: 90,
    recentFrameRetentionWindowMs: 100
  }
};

describe("input fusion sequence replay", () => {
  it("keeps accepted front 60fps and side 30fps pairs within max delta", () => {
    const mapper = createInputFusionMapper();
    const outputs = [
      mapper.updateAimFrame(createAimFrame(0), context),
      mapper.updateAimFrame(createAimFrame(16), context),
      mapper.updateTriggerFrame(createTriggerFrame(33), context),
      mapper.updateAimFrame(createAimFrame(48), context),
      mapper.updateTriggerFrame(createTriggerFrame(66), context)
    ].map((result) => result.fusedFrame);
    const paired = outputs.filter(
      (frame) => frame.fusionMode === "pairedFrontAndSide"
    );

    expect(paired).toHaveLength(3);
    for (const frame of paired) {
      expect(frame.timeDeltaBetweenLanesMs).toBeLessThanOrEqual(
        context.tuning.maxPairDeltaMs
      );
    }
  });

  it("degrades stale lanes and prevents stale shot commits from firing", () => {
    const mapper = createInputFusionMapper();

    mapper.updateTriggerFrame(
      createTriggerFrame(0, { triggerEdge: "shotCommitted" }),
      context
    );
    const stale = mapper.updateAimFrame(createAimFrame(95), context);

    expect(stale.fusedFrame.fusionMode).toBe("frontOnlyAim");
    expect(stale.fusedFrame.fusionRejectReason).toBe("sideStale");
    expect(stale.fusedFrame.shotFired).toBe(false);
  });

  it("fires one side-only shot commit after a later accepted pair", () => {
    const mapper = createInputFusionMapper();

    const sideOnly = mapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerEdge: "pullStarted+shotCommitted" }),
      context
    );
    const paired = mapper.updateAimFrame(createAimFrame(108), context);
    const repeat = mapper.updateAimFrame(createAimFrame(116), context);

    expect(sideOnly.fusedFrame.shotFired).toBe(false);
    expect(paired.fusedFrame.shotFired).toBe(true);
    expect(repeat.fusedFrame.shotFired).toBe(false);
  });

  it("does not fire pruned shot commits", () => {
    const mapper = createInputFusionMapper();

    mapper.updateTriggerFrame(
      createTriggerFrame(0, { triggerEdge: "shotCommitted" }),
      context
    );
    mapper.updateTriggerFrame(createTriggerFrame(140), context);
    const result = mapper.updateAimFrame(createAimFrame(142), context);

    expect(result.fusedFrame.fusionMode).toBe("pairedFrontAndSide");
    expect(result.fusedFrame.shotFired).toBe(false);
  });
});
