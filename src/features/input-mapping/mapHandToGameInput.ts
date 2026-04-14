import { gameConfig } from "../../shared/config/gameConfig";
import type { HandDetection } from "../../shared/types/hand";
import {
  updateConditionedTriggerSignal,
  type ConditionedTriggerState
} from "./conditionTriggerSignal";
import type { CrosshairPoint } from "./createCrosshairSmoother";
import { buildHandEvidence, type HandEvidenceTuning } from "./createHandEvidence";
import {
  advanceShotIntentState,
  type ShotIntentInput,
  type ShotIntentState
} from "./shotIntentStateMachine";
import type { ViewportSize } from "./projectLandmarkToViewport";
import { type TriggerState, type TriggerTuning } from "./evaluateThumbTrigger";

export interface InputRuntimeState extends ShotIntentState {
  crosshair?: CrosshairPoint | undefined;
  conditionedTrigger?: ConditionedTriggerState | undefined;
}

export interface GameInputFrame {
  crosshair?: CrosshairPoint;
  gunPoseActive: boolean;
  triggerState: TriggerState;
  shotFired: boolean;
  runtime: InputRuntimeState;
}

export interface InputTuning extends TriggerTuning {
  smoothingAlpha: number;
  fireCooldownFrames: number;
  stableCrosshairMaxDelta: number;
  conditionedTriggerPullFloor: number;
  conditionedTriggerReleaseFloor: number;
}

export { buildHandEvidence } from "./createHandEvidence";

const FRONT_FACING_RELEASE_ASSIST_THRESHOLD = 0.75;

const resolveHandEvidence = (
  detection: HandDetection | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning
): ReturnType<typeof buildHandEvidence> =>
  buildHandEvidence(
    detection,
    viewportSize,
    {
      crosshair: runtime?.crosshair,
      rawTriggerState: runtime?.rawTriggerState
    },
    undefined,
    tuning as HandEvidenceTuning
  );

const resolveFireEligibility = (
  runtime: InputRuntimeState | undefined,
  evidence: ReturnType<typeof buildHandEvidence>,
  conditionedTrigger: ConditionedTriggerState
): boolean => {
  if (!evidence.trackingPresent) {
    return false;
  }

  const confidence = evidence.gunPose?.confidence ?? 0;
  const detected = evidence.gunPose?.detected ?? false;
  const runtimeGunPoseActive = runtime?.gunPoseActive ?? false;
  const runtimePhase = runtime?.phase;

  return (
    detected ||
    conditionedTrigger.scalar >= 0.9 ||
    (runtimeGunPoseActive && confidence >= 0.15) ||
    ((runtimePhase === "armed" || runtimePhase === "cooldown") && runtimeGunPoseActive)
  );
};

const inferShotIntent = (
  runtime: InputRuntimeState | undefined,
  evidence: ReturnType<typeof buildHandEvidence>,
  tuning: InputTuning
): {
  conditionedTrigger: ConditionedTriggerState;
  intent: ReturnType<typeof advanceShotIntentState>;
} => {
  const frontFacingConfidence = evidence.gunPose?.details.frontFacingConfidence ?? 0;
  const useFrontFacingReleaseAssist =
    (runtime?.conditionedTrigger?.latched ?? false) &&
    evidence.trigger?.rawState === "open" &&
    frontFacingConfidence >= FRONT_FACING_RELEASE_ASSIST_THRESHOLD;

  const conditionedTrigger = updateConditionedTriggerSignal(runtime?.conditionedTrigger, {
    rawState: evidence.trigger?.rawState ?? runtime?.rawTriggerState ?? "open",
    rawCosine: evidence.trigger?.details.cosine ?? -1,
    pullFloor: useFrontFacingReleaseAssist
      ? evidence.trigger?.details.pullThreshold ?? tuning.conditionedTriggerPullFloor
      : tuning.conditionedTriggerPullFloor,
    releaseFloor: useFrontFacingReleaseAssist
      ? evidence.trigger?.details.releaseThreshold ?? tuning.conditionedTriggerReleaseFloor
      : tuning.conditionedTriggerReleaseFloor
  });

  const input: ShotIntentInput = {
    trackingPresent: evidence.trackingPresent,
    fireEligible: resolveFireEligibility(runtime, evidence, conditionedTrigger),
    conditionedTrigger,
    triggerConfidence: evidence.trigger?.confidence ?? 0,
    gunPoseConfidence: evidence.gunPose?.confidence ?? 0,
    rawTriggerState: evidence.trigger?.rawState ?? runtime?.rawTriggerState ?? "open"
  };

  return {
    conditionedTrigger,
    intent: advanceShotIntentState(runtime, input, {
      fireCooldownFrames: tuning.fireCooldownFrames
    })
  };
};

const dropRuntimeCrosshair = (
  state: InputRuntimeState
): Omit<InputRuntimeState, "crosshair"> => {
  const { crosshair: _previousCrosshair, ...runtimeState } = state;

  return runtimeState;
};

const adaptGameInputFrame = (
  evidence: ReturnType<typeof buildHandEvidence>,
  conditionedTrigger: ConditionedTriggerState,
  intent: ReturnType<typeof advanceShotIntentState>
): GameInputFrame => {
  const crosshair =
    intent.state.phase === "tracking_lost"
      ? undefined
      : evidence.smoothedCrosshairCandidate ?? { x: 0, y: 0 };

  return {
    gunPoseActive: intent.state.gunPoseActive,
    triggerState: intent.state.triggerState,
    shotFired: intent.shotFired,
    ...(crosshair === undefined ? {} : { crosshair }),
    // `advanceShotIntentState` preserves prior runtime fields, so drop any stale crosshair
    // before attaching the current one.
    runtime: {
      ...dropRuntimeCrosshair(intent.state as InputRuntimeState),
      conditionedTrigger,
      rejectReason: intent.state.rejectReason,
      ...(crosshair === undefined ? {} : { crosshair })
    }
  };
};

export const mapHandToGameInput = (
  detection: HandDetection | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  const evidence = resolveHandEvidence(detection, viewportSize, runtime, tuning);
  const { conditionedTrigger, intent } = inferShotIntent(runtime, evidence, tuning);

  return adaptGameInputFrame(evidence, conditionedTrigger, intent);
};
