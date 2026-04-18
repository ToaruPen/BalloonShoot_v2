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
  const noHandEvidence = (): SideTriggerEvidence =>
    goodEvidence({
      sideHandDetected: false,
      sideViewQuality: "lost",
      pullEvidenceScalar: 0,
      releaseEvidenceScalar: 0,
      triggerPostureConfidence: 0,
      shotCandidateConfidence: 0,
      rejectReason: "handNotDetected"
    });

  const pulledEvidence = (): SideTriggerEvidence =>
    goodEvidence({
      pullEvidenceScalar: 0.9,
      releaseEvidenceScalar: 0.1,
      shotCandidateConfidence: 0.9
    });

  const openEvidence = (): SideTriggerEvidence =>
    goodEvidence({ releaseEvidenceScalar: 0.9, pullEvidenceScalar: 0.1 });

  const driveToPulledLatched = () => {
    let state = createInitialSideTriggerState();

    for (const evidence of [goodEvidence(), pulledEvidence(), pulledEvidence()]) {
      state = updateSideTriggerState(
        state,
        evidence,
        defaultSideTriggerTuning
      ).state;
    }

    expect(state.phase).toBe("SideTriggerPulledLatched");
    return state;
  };

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

  it("commits on the candidate entry frame when pull dwell tuning is one frame", () => {
    const tuning = {
      ...defaultSideTriggerTuning,
      minPullDwellFrames: 1
    };
    const open = updateSideTriggerState(
      createInitialSideTriggerState(),
      goodEvidence(),
      tuning
    ).state;

    const commit = updateSideTriggerState(open, pulledEvidence(), tuning);

    expect(commit.edge).toContain("pullStarted");
    expect(commit.edge).toContain("shotCommitted");
    expect(commit.state.phase).toBe("SideTriggerPulledLatched");
    expect(commit.state.triggerPulled).toBe(true);
    expect(commit.state.dwellFrameCounts.pullDwellFrames).toBe(1);
  });

  it("keeps the default two-frame pull dwell behavior", () => {
    const tuning = {
      ...defaultSideTriggerTuning,
      minPullDwellFrames: 2
    };
    let state = updateSideTriggerState(
      createInitialSideTriggerState(),
      goodEvidence(),
      tuning
    ).state;

    const pullStart = updateSideTriggerState(state, pulledEvidence(), tuning);

    expect(pullStart.edge).toBe("pullStarted");
    expect(pullStart.state.phase).toBe("SideTriggerPullCandidate");

    state = pullStart.state;
    const commit = updateSideTriggerState(state, pulledEvidence(), tuning);

    expect(commit.edge).toBe("shotCommitted");
    expect(commit.state.phase).toBe("SideTriggerPulledLatched");
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

  it("confirms release on the candidate entry frame when release dwell tuning is one frame", () => {
    const tuning = {
      ...defaultSideTriggerTuning,
      minReleaseDwellFrames: 1
    };
    const pulled = driveToPulledLatched();

    const releaseConfirmed = updateSideTriggerState(
      pulled,
      openEvidence(),
      tuning
    );

    expect(releaseConfirmed.edge).toBe("releaseConfirmed");
    expect(releaseConfirmed.state.phase).toBe("SideTriggerCooldown");
    expect(releaseConfirmed.state.triggerPulled).toBe(false);
    expect(releaseConfirmed.state.dwellFrameCounts.releaseDwellFrames).toBe(1);
  });

  it("keeps the default two-frame release dwell behavior", () => {
    const tuning = {
      ...defaultSideTriggerTuning,
      minReleaseDwellFrames: 2
    };
    let state = driveToPulledLatched();

    const releaseStart = updateSideTriggerState(state, openEvidence(), tuning);

    expect(releaseStart.edge).toBe("none");
    expect(releaseStart.state.phase).toBe("SideTriggerReleaseCandidate");

    state = releaseStart.state;
    const releaseConfirmed = updateSideTriggerState(
      state,
      openEvidence(),
      tuning
    );

    expect(releaseConfirmed.edge).toBe("releaseConfirmed");
    expect(releaseConfirmed.state.phase).toBe("SideTriggerCooldown");
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

  it("restores a latched trigger after brief hand loss when reacquired still pulled", () => {
    let state = driveToPulledLatched();

    for (let i = 0; i < defaultSideTriggerTuning.lostHandGraceFrames - 1; i += 1) {
      state = updateSideTriggerState(
        state,
        noHandEvidence(),
        defaultSideTriggerTuning
      ).state;
    }

    const recovered = updateSideTriggerState(
      state,
      pulledEvidence(),
      defaultSideTriggerTuning
    );

    expect(recovered.edge).toBe("none");
    expect(recovered.state.phase).toBe("SideTriggerPulledLatched");
    expect(recovered.state.triggerPulled).toBe(true);
  });

  it("drops preserved pull state after brief hand loss when reacquired clearly open", () => {
    let state = driveToPulledLatched();

    for (let i = 0; i < defaultSideTriggerTuning.lostHandGraceFrames - 1; i += 1) {
      state = updateSideTriggerState(
        state,
        noHandEvidence(),
        defaultSideTriggerTuning
      ).state;
    }

    const recovered = updateSideTriggerState(
      state,
      openEvidence(),
      defaultSideTriggerTuning
    );

    expect(recovered.edge).toBe("none");
    expect(recovered.state.phase).toBe("SideTriggerOpenReady");
    expect(recovered.state.triggerPulled).toBe(false);
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
