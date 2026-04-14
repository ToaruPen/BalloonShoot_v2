import { gameConfig } from "../../shared/config/gameConfig";
import type {
  ConditionedTriggerEdge,
  ConditionedTriggerState
} from "./conditionTriggerSignal";
import type { TriggerState } from "./evaluateThumbTrigger";

export type ShotIntentPhase = "idle" | "armed" | "cooldown" | "tracking_lost";

export type ShotIntentRejectReason =
  | "waiting_for_fire_eligibility"
  | "waiting_for_pull_edge"
  | "waiting_for_release"
  | "cooldown"
  | "tracking_lost";

export interface ShotIntentTuning {
  fireCooldownFrames: number;
}

export interface ShotIntentInput {
  trackingPresent: boolean;
  fireEligible: boolean;
  conditionedTrigger: ConditionedTriggerState;
  triggerConfidence: number;
  gunPoseConfidence: number;
  rawTriggerState: TriggerState;
}

export interface ShotIntentState {
  phase: ShotIntentPhase;
  rejectReason: ShotIntentRejectReason;
  triggerState: TriggerState;
  rawTriggerState: TriggerState;
  triggerConfidence: number;
  gunPoseConfidence: number;
  pulledFrames: number;
  openFrames: number;
  hasSeenStableOpen: boolean;
  gunPoseActive: boolean;
  nonGunPoseFrames: number;
  trackingPresentFrames: number;
  trackingLostFrames: number;
  stableAimFrames: number;
  cooldownFramesRemaining: number;
  fireEligible: boolean;
  conditionedTriggerScalar: number;
  conditionedTriggerEdge: ConditionedTriggerEdge;
  triggerLatched: boolean;
}

export interface ShotIntentResult {
  state: ShotIntentState;
  shotFired: boolean;
}

const normalizeFrameCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const resolveTuning = (
  tuning: ShotIntentTuning = gameConfig.input
): Required<ShotIntentTuning> => ({
  fireCooldownFrames: normalizeFrameCount(tuning.fireCooldownFrames)
});

const createInitialShotIntentState = (): ShotIntentState => ({
  phase: "idle",
  rejectReason: "waiting_for_fire_eligibility",
  triggerState: "open",
  rawTriggerState: "open",
  triggerConfidence: 0,
  gunPoseConfidence: 0,
  pulledFrames: 0,
  openFrames: 0,
  hasSeenStableOpen: false,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0,
  trackingLostFrames: 0,
  stableAimFrames: 0,
  cooldownFramesRemaining: 0,
  fireEligible: false,
  conditionedTriggerScalar: 0,
  conditionedTriggerEdge: "none",
  triggerLatched: false
});

const buildState = (
  previousState: ShotIntentState,
  input: ShotIntentInput,
  phase: ShotIntentPhase,
  rejectReason: ShotIntentRejectReason,
  cooldownFramesRemaining: number
): ShotIntentState => {
  const rawTriggerState = input.rawTriggerState;
  const pulledFrames = rawTriggerState === "pulled" ? previousState.pulledFrames + 1 : 0;
  const openFrames = rawTriggerState === "open" ? previousState.openFrames + 1 : 0;

  return {
    ...previousState,
    phase,
    rejectReason,
    triggerState: rawTriggerState,
    rawTriggerState,
    triggerConfidence: input.triggerConfidence,
    gunPoseConfidence: input.gunPoseConfidence,
    pulledFrames,
    openFrames,
    hasSeenStableOpen: previousState.hasSeenStableOpen || rawTriggerState === "open",
    gunPoseActive: input.fireEligible,
    nonGunPoseFrames: input.fireEligible ? 0 : previousState.nonGunPoseFrames + 1,
    trackingPresentFrames: input.trackingPresent ? previousState.trackingPresentFrames + 1 : 0,
    trackingLostFrames: input.trackingPresent ? 0 : previousState.trackingLostFrames + 1,
    stableAimFrames: 0,
    cooldownFramesRemaining,
    fireEligible: input.fireEligible,
    conditionedTriggerScalar: input.conditionedTrigger.scalar,
    conditionedTriggerEdge: input.conditionedTrigger.edge,
    triggerLatched: input.conditionedTrigger.latched
  };
};

export const advanceShotIntentState = (
  previousState: ShotIntentState | undefined,
  input: ShotIntentInput,
  tuning: ShotIntentTuning = gameConfig.input
): ShotIntentResult => {
  const normalizedTuning = resolveTuning(tuning);
  const stateBefore = previousState ?? createInitialShotIntentState();
  const cooldownFramesRemaining = Math.max(0, stateBefore.cooldownFramesRemaining - 1);

  if (!input.trackingPresent) {
    return {
      state: buildState(stateBefore, input, "tracking_lost", "tracking_lost", cooldownFramesRemaining),
      shotFired: false
    };
  }

  const shotFired =
    stateBefore.phase === "armed" &&
    stateBefore.conditionedTriggerEdge === "none" &&
    input.fireEligible &&
    cooldownFramesRemaining === 0 &&
    input.conditionedTrigger.edge === "pull";

  if (shotFired) {
    return {
      state: buildState(
        stateBefore,
        input,
        "cooldown",
        normalizedTuning.fireCooldownFrames > 0 ? "cooldown" : "waiting_for_release",
        normalizedTuning.fireCooldownFrames
      ),
      shotFired: true
    };
  }

  if (cooldownFramesRemaining > 0) {
    return {
      state: buildState(stateBefore, input, "cooldown", "cooldown", cooldownFramesRemaining),
      shotFired: false
    };
  }

  if (!input.fireEligible) {
    return {
      state: buildState(stateBefore, input, "idle", "waiting_for_fire_eligibility", 0),
      shotFired: false
    };
  }

  return {
    state: buildState(
      stateBefore,
      input,
      "armed",
      input.conditionedTrigger.latched ? "waiting_for_release" : "waiting_for_pull_edge",
      0
    ),
    shotFired: false
  };
};
