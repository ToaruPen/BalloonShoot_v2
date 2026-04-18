import type { SideTriggerTuning } from "./sideTriggerConfig";
import type { SideTriggerEvidence } from "./sideTriggerEvidence";
import type {
  SideTriggerDwellFrameCounts,
  SideTriggerPhase,
  SideTriggerRejectReason,
  TriggerEdge
} from "../../shared/types/trigger";

export interface SideTriggerMachineState {
  readonly phase: SideTriggerPhase;
  readonly triggerPulled: boolean;
  readonly dwellFrameCounts: SideTriggerDwellFrameCounts;
  readonly lastRejectReason: SideTriggerRejectReason | undefined;
}

interface SideTriggerMachineResult {
  readonly state: SideTriggerMachineState;
  readonly edge: TriggerEdge;
}

const zeroDwellFrameCounts = (): SideTriggerDwellFrameCounts => ({
  pullDwellFrames: 0,
  releaseDwellFrames: 0,
  stablePoseFrames: 0,
  lostHandFrames: 0,
  cooldownRemainingFrames: 0
});

export const createInitialSideTriggerState = (): SideTriggerMachineState => ({
  phase: "SideTriggerNoHand",
  triggerPulled: false,
  dwellFrameCounts: zeroDwellFrameCounts(),
  lastRejectReason: undefined
});

const withCounts = (
  state: SideTriggerMachineState,
  counts: Partial<SideTriggerDwellFrameCounts>
): SideTriggerDwellFrameCounts => ({
  ...state.dwellFrameCounts,
  ...counts
});

const result = (
  state: SideTriggerMachineState,
  edge: TriggerEdge = "none"
): SideTriggerMachineResult => ({ state, edge });

const poseUsable = (
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): boolean =>
  evidence.sideHandDetected &&
  evidence.sideViewQuality === "good" &&
  evidence.triggerPostureConfidence >= tuning.minConfidenceForCommit &&
  evidence.rejectReason === undefined;

const noHandResult = (
  previous: SideTriggerMachineState,
  tuning: SideTriggerTuning,
  rejectReason: SideTriggerRejectReason | undefined
): SideTriggerMachineResult => {
  if (previous.phase === "SideTriggerNoHand") {
    return result({
      ...previous,
      lastRejectReason: rejectReason ?? "handNotDetected"
    });
  }

  const lostHandFrames = previous.dwellFrameCounts.lostHandFrames + 1;

  if (lostHandFrames > tuning.lostHandGraceFrames) {
    return result({
      phase: "SideTriggerNoHand",
      triggerPulled: false,
      dwellFrameCounts: zeroDwellFrameCounts(),
      lastRejectReason: rejectReason ?? "handNotDetected"
    });
  }

  return result({
    phase: "SideTriggerRecoveringAfterLoss",
    triggerPulled: previous.triggerPulled,
    dwellFrameCounts: withCounts(previous, {
      pullDwellFrames: 0,
      releaseDwellFrames: 0,
      lostHandFrames
    }),
    lastRejectReason: rejectReason ?? "handNotDetected"
  });
};

const poseSearching = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (
    !poseUsable(evidence, tuning) ||
    evidence.releaseEvidenceScalar < tuning.releaseEnterThreshold
  ) {
    return result({
      phase: "SideTriggerPoseSearching",
      triggerPulled: false,
      dwellFrameCounts: zeroDwellFrameCounts(),
      lastRejectReason: evidence.rejectReason
    });
  }

  const stablePoseFrames = previous.dwellFrameCounts.stablePoseFrames + 1;
  const phase =
    stablePoseFrames >= tuning.stablePoseRequiredFrames
      ? "SideTriggerOpenReady"
      : "SideTriggerPoseSearching";

  return result({
    phase,
    triggerPulled: false,
    dwellFrameCounts: {
      ...zeroDwellFrameCounts(),
      stablePoseFrames
    },
    lastRejectReason: undefined
  });
};

const openReady = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return poseSearching(previous, evidence, tuning);
  }

  if (evidence.pullEvidenceScalar >= tuning.pullEnterThreshold) {
    return result(
      {
        phase: "SideTriggerPullCandidate",
        triggerPulled: false,
        dwellFrameCounts: withCounts(previous, {
          pullDwellFrames: 1,
          releaseDwellFrames: 0,
          lostHandFrames: 0,
          cooldownRemainingFrames: 0
        }),
        lastRejectReason: undefined
      },
      "pullStarted"
    );
  }

  return result({
    ...previous,
    phase: "SideTriggerOpenReady",
    triggerPulled: false,
    dwellFrameCounts: withCounts(previous, {
      pullDwellFrames: 0,
      releaseDwellFrames: 0,
      lostHandFrames: 0
    }),
    lastRejectReason: undefined
  });
};

const pullCandidate = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (
    !poseUsable(evidence, tuning) ||
    evidence.pullEvidenceScalar < tuning.pullExitThreshold
  ) {
    return result({
      ...previous,
      phase: "SideTriggerOpenReady",
      dwellFrameCounts: withCounts(previous, { pullDwellFrames: 0 }),
      lastRejectReason: evidence.rejectReason
    });
  }

  const pullDwellFrames = previous.dwellFrameCounts.pullDwellFrames + 1;

  if (pullDwellFrames >= tuning.minPullDwellFrames) {
    return result(
      {
        phase: "SideTriggerPulledLatched",
        triggerPulled: true,
        dwellFrameCounts: withCounts(previous, {
          pullDwellFrames,
          releaseDwellFrames: 0,
          lostHandFrames: 0
        }),
        lastRejectReason: undefined
      },
      "shotCommitted"
    );
  }

  return result({
    ...previous,
    dwellFrameCounts: withCounts(previous, { pullDwellFrames }),
    lastRejectReason: undefined
  });
};

const pulledLatched = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return result({ ...previous, lastRejectReason: evidence.rejectReason });
  }

  if (evidence.releaseEvidenceScalar >= tuning.releaseEnterThreshold) {
    return result({
      phase: "SideTriggerReleaseCandidate",
      triggerPulled: true,
      dwellFrameCounts: withCounts(previous, {
        releaseDwellFrames: 1,
        lostHandFrames: 0
      }),
      lastRejectReason: undefined
    });
  }

  return result({
    ...previous,
    phase: "SideTriggerPulledLatched",
    triggerPulled: true,
    lastRejectReason: undefined
  });
};

const releaseCandidate = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (
    !poseUsable(evidence, tuning) ||
    evidence.releaseEvidenceScalar < tuning.releaseExitThreshold
  ) {
    return result({
      ...previous,
      phase: "SideTriggerPulledLatched",
      dwellFrameCounts: withCounts(previous, { releaseDwellFrames: 0 }),
      lastRejectReason: evidence.rejectReason
    });
  }

  const releaseDwellFrames = previous.dwellFrameCounts.releaseDwellFrames + 1;

  if (releaseDwellFrames >= tuning.minReleaseDwellFrames) {
    return result(
      {
        phase: "SideTriggerCooldown",
        triggerPulled: false,
        dwellFrameCounts: withCounts(previous, {
          releaseDwellFrames,
          cooldownRemainingFrames: tuning.shotCooldownFrames,
          lostHandFrames: 0
        }),
        lastRejectReason: undefined
      },
      "releaseConfirmed"
    );
  }

  return result({
    ...previous,
    dwellFrameCounts: withCounts(previous, { releaseDwellFrames }),
    lastRejectReason: undefined
  });
};

const cooldown = (
  previous: SideTriggerMachineState
): SideTriggerMachineResult => {
  const cooldownRemainingFrames = Math.max(
    0,
    previous.dwellFrameCounts.cooldownRemainingFrames - 1
  );

  if (cooldownRemainingFrames === 0) {
    return result({
      phase: "SideTriggerOpenReady",
      triggerPulled: false,
      dwellFrameCounts: withCounts(previous, {
        pullDwellFrames: 0,
        releaseDwellFrames: 0,
        cooldownRemainingFrames: 0,
        lostHandFrames: 0
      }),
      lastRejectReason: undefined
    });
  }

  return result({
    ...previous,
    dwellFrameCounts: withCounts(previous, { cooldownRemainingFrames })
  });
};

export const updateSideTriggerState = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning
): SideTriggerMachineResult => {
  if (!evidence.sideHandDetected) {
    return noHandResult(previous, tuning, evidence.rejectReason);
  }

  switch (previous.phase) {
    case "SideTriggerNoHand":
    case "SideTriggerPoseSearching":
    case "SideTriggerRecoveringAfterLoss":
      return poseSearching(previous, evidence, tuning);
    case "SideTriggerOpenReady":
      return openReady(previous, evidence, tuning);
    case "SideTriggerPullCandidate":
      return pullCandidate(previous, evidence, tuning);
    case "SideTriggerPulledLatched":
      return pulledLatched(previous, evidence, tuning);
    case "SideTriggerReleaseCandidate":
      return releaseCandidate(previous, evidence, tuning);
    case "SideTriggerCooldown":
      return cooldown(previous);
  }
};
