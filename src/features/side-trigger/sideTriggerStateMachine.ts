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
  readonly recoveringFromPhase?: SideTriggerPhase;
}

interface SideTriggerMachineResult {
  readonly state: SideTriggerMachineState;
  readonly edge: TriggerEdge;
}

interface SideTriggerMachineOptions {
  readonly commitArmed?: boolean;
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
  const recoveringFromPhase =
    previous.phase === "SideTriggerRecoveringAfterLoss"
      ? previous.recoveringFromPhase
      : previous.phase;

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
    lastRejectReason: rejectReason ?? "handNotDetected",
    ...(recoveringFromPhase === undefined ? {} : { recoveringFromPhase })
  });
};

const enterPullCandidate = (
  previous: SideTriggerMachineState,
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  const pullDwellFrames = 1;

  if (pullDwellFrames >= tuning.minPullDwellFrames && commitArmed) {
    return result(
      {
        phase: "SideTriggerPulledLatched",
        triggerPulled: true,
        dwellFrameCounts: withCounts(previous, {
          pullDwellFrames,
          releaseDwellFrames: 0,
          lostHandFrames: 0,
          cooldownRemainingFrames: 0
        }),
        lastRejectReason: undefined
      },
      "pullStarted+shotCommitted"
    );
  }

  return result(
    {
      phase: "SideTriggerPullCandidate",
      triggerPulled: false,
      dwellFrameCounts: withCounts(previous, {
        pullDwellFrames,
        releaseDwellFrames: 0,
        lostHandFrames: 0,
        cooldownRemainingFrames: 0
      }),
      lastRejectReason: undefined
    },
    commitArmed ? "pullStarted" : "none"
  );
};

const enterReleaseCandidate = (
  previous: SideTriggerMachineState,
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  const releaseDwellFrames = 1;

  if (releaseDwellFrames >= tuning.minReleaseDwellFrames && commitArmed) {
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
    phase: "SideTriggerReleaseCandidate",
    triggerPulled: true,
    dwellFrameCounts: withCounts(previous, {
      releaseDwellFrames,
      lostHandFrames: 0
    }),
    lastRejectReason: undefined
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
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return poseSearching(previous, evidence, tuning);
  }

  if (evidence.pullEvidenceScalar >= tuning.pullEnterThreshold) {
    return enterPullCandidate(previous, tuning, commitArmed);
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
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return poseSearching(previous, evidence, tuning);
  }

  if (evidence.pullEvidenceScalar < tuning.pullExitThreshold) {
    return result({
      ...previous,
      phase: "SideTriggerOpenReady",
      dwellFrameCounts: withCounts(previous, { pullDwellFrames: 0 }),
      lastRejectReason: "insufficientPullEvidence"
    });
  }

  const pullDwellFrames = previous.dwellFrameCounts.pullDwellFrames + 1;

  if (pullDwellFrames >= tuning.minPullDwellFrames && commitArmed) {
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
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return result({ ...previous, lastRejectReason: evidence.rejectReason });
  }

  if (evidence.releaseEvidenceScalar >= tuning.releaseEnterThreshold) {
    return enterReleaseCandidate(previous, tuning, commitArmed);
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
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return poseSearching(previous, evidence, tuning);
  }

  if (evidence.releaseEvidenceScalar < tuning.releaseExitThreshold) {
    return result({
      ...previous,
      phase: "SideTriggerPulledLatched",
      dwellFrameCounts: withCounts(previous, { releaseDwellFrames: 0 }),
      lastRejectReason: "insufficientReleaseEvidence"
    });
  }

  const releaseDwellFrames = previous.dwellFrameCounts.releaseDwellFrames + 1;

  if (releaseDwellFrames >= tuning.minReleaseDwellFrames && commitArmed) {
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

const recoveringAfterLoss = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning,
  commitArmed: boolean
): SideTriggerMachineResult => {
  if (!poseUsable(evidence, tuning)) {
    return poseSearching(previous, evidence, tuning);
  }

  if (previous.recoveringFromPhase === "SideTriggerCooldown") {
    return cooldown({
      phase: "SideTriggerCooldown",
      triggerPulled: false,
      dwellFrameCounts: withCounts(previous, { lostHandFrames: 0 }),
      lastRejectReason: undefined
    });
  }

  if (!previous.triggerPulled) {
    return poseSearching(previous, evidence, tuning);
  }

  if (previous.recoveringFromPhase === "SideTriggerReleaseCandidate") {
    if (evidence.releaseEvidenceScalar >= tuning.releaseExitThreshold) {
      return enterReleaseCandidate(previous, tuning, commitArmed);
    }

    if (evidence.pullEvidenceScalar >= tuning.pullExitThreshold) {
      return result({
        phase: "SideTriggerPulledLatched",
        triggerPulled: true,
        dwellFrameCounts: withCounts(previous, {
          releaseDwellFrames: 0,
          lostHandFrames: 0
        }),
        lastRejectReason: undefined
      });
    }

    return poseSearching(previous, evidence, tuning);
  }

  if (evidence.pullEvidenceScalar >= tuning.pullExitThreshold) {
    return result({
      phase: "SideTriggerPulledLatched",
      triggerPulled: true,
      dwellFrameCounts: withCounts(previous, {
        releaseDwellFrames: 0,
        lostHandFrames: 0
      }),
      lastRejectReason: undefined
    });
  }

  return poseSearching(previous, evidence, tuning);
};

export const updateSideTriggerState = (
  previous: SideTriggerMachineState,
  evidence: SideTriggerEvidence,
  tuning: SideTriggerTuning,
  options: SideTriggerMachineOptions = {}
): SideTriggerMachineResult => {
  const commitArmed = options.commitArmed ?? true;

  if (!evidence.sideHandDetected) {
    return noHandResult(previous, tuning, evidence.rejectReason);
  }

  switch (previous.phase) {
    case "SideTriggerNoHand":
    case "SideTriggerPoseSearching":
      return poseSearching(previous, evidence, tuning);
    case "SideTriggerRecoveringAfterLoss":
      return recoveringAfterLoss(previous, evidence, tuning, commitArmed);
    case "SideTriggerOpenReady":
      return openReady(previous, evidence, tuning, commitArmed);
    case "SideTriggerPullCandidate":
      return pullCandidate(previous, evidence, tuning, commitArmed);
    case "SideTriggerPulledLatched":
      return pulledLatched(previous, evidence, tuning, commitArmed);
    case "SideTriggerReleaseCandidate":
      return releaseCandidate(previous, evidence, tuning, commitArmed);
    case "SideTriggerCooldown":
      return cooldown(previous);
  }
};
