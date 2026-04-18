import { describe, expect, it } from "vitest";
import { defaultSideTriggerTuning } from "../../../../src/features/side-trigger/sideTriggerConfig";
import {
  createInitialSideTriggerState,
  updateSideTriggerState
} from "../../../../src/features/side-trigger/sideTriggerStateMachine";
import type { SideTriggerEvidence } from "../../../../src/features/side-trigger/sideTriggerEvidence";

const goodEvidence = (
  patch: Partial<SideTriggerEvidence> = {}
): SideTriggerEvidence => ({
  sideHandDetected: true,
  sideViewQuality: "good",
  pullEvidenceScalar: 0.1,
  releaseEvidenceScalar: 0.9,
  triggerPostureConfidence: 0.95,
  shotCandidateConfidence: 0.1,
  rejectReason: undefined,
  usedWorldLandmarks: true,
  ...patch
});

describe("updateSideTriggerState", () => {
  it("transitions from no hand to open ready after stable acceptable open pose", () => {
    let state = createInitialSideTriggerState();

    state = updateSideTriggerState(
      state,
      goodEvidence(),
      defaultSideTriggerTuning
    ).state;

    expect(state.phase).toBe("SideTriggerOpenReady");
    expect(state.triggerPulled).toBe(false);
    expect(state.dwellFrameCounts.stablePoseFrames).toBe(1);
  });

  it("commits exactly once after pull dwell completes and does not repeat while held", () => {
    let state = updateSideTriggerState(
      createInitialSideTriggerState(),
      goodEvidence(),
      defaultSideTriggerTuning
    ).state;

    const pullStart = updateSideTriggerState(
      state,
      goodEvidence({
        pullEvidenceScalar: 0.9,
        releaseEvidenceScalar: 0.1,
        shotCandidateConfidence: 0.9
      }),
      defaultSideTriggerTuning
    );
    state = pullStart.state;
    expect(pullStart.edge).toBe("pullStarted");
    expect(state.phase).toBe("SideTriggerPullCandidate");

    const commit = updateSideTriggerState(
      state,
      goodEvidence({
        pullEvidenceScalar: 0.92,
        releaseEvidenceScalar: 0.08,
        shotCandidateConfidence: 0.92
      }),
      defaultSideTriggerTuning
    );
    state = commit.state;
    expect(commit.edge).toBe("shotCommitted");
    expect(state.phase).toBe("SideTriggerPulledLatched");
    expect(state.triggerPulled).toBe(true);

    const held = updateSideTriggerState(
      state,
      goodEvidence({
        pullEvidenceScalar: 0.95,
        releaseEvidenceScalar: 0.04,
        shotCandidateConfidence: 0.95
      }),
      defaultSideTriggerTuning
    );
    expect(held.edge).toBe("none");
    expect(held.state.phase).toBe("SideTriggerPulledLatched");
  });

  it("requires release dwell and cooldown before returning to open ready", () => {
    let state = createInitialSideTriggerState();

    for (const evidence of [
      goodEvidence(),
      goodEvidence({
        pullEvidenceScalar: 0.9,
        releaseEvidenceScalar: 0.1,
        shotCandidateConfidence: 0.9
      }),
      goodEvidence({
        pullEvidenceScalar: 0.9,
        releaseEvidenceScalar: 0.1,
        shotCandidateConfidence: 0.9
      })
    ]) {
      state = updateSideTriggerState(
        state,
        evidence,
        defaultSideTriggerTuning
      ).state;
    }

    const releaseStart = updateSideTriggerState(
      state,
      goodEvidence({ releaseEvidenceScalar: 0.9, pullEvidenceScalar: 0.1 }),
      defaultSideTriggerTuning
    );
    state = releaseStart.state;
    expect(releaseStart.edge).toBe("none");
    expect(state.phase).toBe("SideTriggerReleaseCandidate");

    const releaseConfirmed = updateSideTriggerState(
      state,
      goodEvidence({ releaseEvidenceScalar: 0.92, pullEvidenceScalar: 0.08 }),
      defaultSideTriggerTuning
    );
    state = releaseConfirmed.state;
    expect(releaseConfirmed.edge).toBe("releaseConfirmed");
    expect(state.phase).toBe("SideTriggerCooldown");
    expect(state.dwellFrameCounts.cooldownRemainingFrames).toBeGreaterThan(0);

    for (let i = 0; i < defaultSideTriggerTuning.shotCooldownFrames; i += 1) {
      state = updateSideTriggerState(
        state,
        goodEvidence(),
        defaultSideTriggerTuning
      ).state;
    }

    expect(state.phase).toBe("SideTriggerOpenReady");
  });

  it("does not treat hand loss as release", () => {
    const pulled = updateSideTriggerState(
      updateSideTriggerState(
        updateSideTriggerState(
          createInitialSideTriggerState(),
          goodEvidence(),
          defaultSideTriggerTuning
        ).state,
        goodEvidence({
          pullEvidenceScalar: 0.9,
          releaseEvidenceScalar: 0.1,
          shotCandidateConfidence: 0.9
        }),
        defaultSideTriggerTuning
      ).state,
      goodEvidence({
        pullEvidenceScalar: 0.9,
        releaseEvidenceScalar: 0.1,
        shotCandidateConfidence: 0.9
      }),
      defaultSideTriggerTuning
    ).state;

    const lost = updateSideTriggerState(
      pulled,
      goodEvidence({
        sideHandDetected: false,
        sideViewQuality: "lost",
        pullEvidenceScalar: 0,
        releaseEvidenceScalar: 0,
        triggerPostureConfidence: 0,
        shotCandidateConfidence: 0,
        rejectReason: "handNotDetected"
      }),
      defaultSideTriggerTuning
    );

    expect(lost.edge).toBe("none");
    expect(lost.state.phase).toBe("SideTriggerRecoveringAfterLoss");
    expect(lost.state.triggerPulled).toBe(true);
  });

  it("blocks shot commitment when side view quality is rejected", () => {
    let state = updateSideTriggerState(
      createInitialSideTriggerState(),
      goodEvidence(),
      defaultSideTriggerTuning
    ).state;

    for (let i = 0; i < 3; i += 1) {
      const result = updateSideTriggerState(
        state,
        goodEvidence({
          sideViewQuality: "frontLike",
          pullEvidenceScalar: 0.95,
          releaseEvidenceScalar: 0.1,
          triggerPostureConfidence: 0.2,
          shotCandidateConfidence: 0.2,
          rejectReason: "sideViewQualityRejected"
        }),
        defaultSideTriggerTuning
      );
      state = result.state;
      expect(result.edge).not.toBe("shotCommitted");
    }

    expect(state.phase).toBe("SideTriggerPoseSearching");
  });
});
