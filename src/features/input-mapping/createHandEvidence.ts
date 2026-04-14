import { gameConfig } from "../../shared/config/gameConfig";
import type { HandDetection } from "../../shared/types/hand";
import {
  smoothCrosshair,
  type CrosshairPoint
} from "./createCrosshairSmoother";
import {
  measureGunPose,
  type GunPoseMeasurement
} from "./evaluateGunPose";
import {
  measureThumbTrigger,
  type ThumbTriggerMeasurement,
  type TriggerState,
  type TriggerTuning
} from "./evaluateThumbTrigger";
import type { ViewportSize } from "./projectLandmarkToViewport";
import { projectLandmarkToViewport } from "./projectLandmarkToViewport";

interface HandEvidenceRuntimeState {
  crosshair?: CrosshairPoint | undefined;
  rawTriggerState?: TriggerState | undefined;
}

export interface HandEvidenceTuning extends TriggerTuning {
  smoothingAlpha: number;
  stableCrosshairMaxDelta: number;
}

export interface HandEvidence {
  trackingPresent: boolean;
  frameAtMs: number | undefined;
  smoothedCrosshairCandidate: CrosshairPoint | null;
  crosshairDelta: number | null;
  stableCrosshair: boolean;
  trigger: ThumbTriggerMeasurement | null;
  gunPose: GunPoseMeasurement | null;
}

const measureCrosshairDelta = (
  previous: CrosshairPoint | undefined,
  next: CrosshairPoint
): number | null => {
  if (!previous) {
    return null;
  }

  return Math.hypot(next.x - previous.x, next.y - previous.y);
};

export const buildHandEvidence = (
  detection: HandDetection | undefined,
  viewportSize: ViewportSize,
  runtime: HandEvidenceRuntimeState | undefined,
  frameAtMs?: number,
  tuning: HandEvidenceTuning = gameConfig.input
): HandEvidence => {
  if (!detection) {
    return {
      trackingPresent: false,
      frameAtMs,
      smoothedCrosshairCandidate: null,
      crosshairDelta: null,
      stableCrosshair: false,
      trigger: null,
      gunPose: null
    };
  }

  const { rawFrame, filteredFrame } = detection;

  const projectedCrosshair = projectLandmarkToViewport(
    filteredFrame.landmarks.indexTip,
    { width: filteredFrame.width, height: filteredFrame.height },
    viewportSize,
    { mirrorX: true }
  );
  const smoothedCrosshairCandidate = smoothCrosshair(
    runtime?.crosshair,
    projectedCrosshair,
    tuning.smoothingAlpha
  );
  const crosshairDelta = measureCrosshairDelta(runtime?.crosshair, smoothedCrosshairCandidate);
  const trigger = measureThumbTrigger(rawFrame, runtime?.rawTriggerState, tuning);
  const gunPose = measureGunPose(filteredFrame);

  return {
    trackingPresent: true,
    frameAtMs,
    smoothedCrosshairCandidate,
    crosshairDelta,
    stableCrosshair:
      crosshairDelta !== null && crosshairDelta <= tuning.stableCrosshairMaxDelta,
    trigger,
    gunPose
  };
};
