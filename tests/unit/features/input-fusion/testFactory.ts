import type { AimInputFrame } from "../../../../src/shared/types/aim";
import type { FrameTimestamp } from "../../../../src/shared/types/camera";
import type { TriggerInputFrame } from "../../../../src/shared/types/trigger";

const createTimestamp = (
  frameTimestampMs: number,
  patch: Partial<FrameTimestamp> = {}
): FrameTimestamp => ({
  frameTimestampMs,
  timestampSource: "requestVideoFrameCallbackCaptureTime",
  presentedFrames: Math.round(frameTimestampMs),
  receivedAtPerformanceMs: frameTimestampMs + 0.5,
  ...patch
});

export const createAimFrame = (
  frameTimestampMs: number,
  patch: Partial<AimInputFrame> = {}
): AimInputFrame => ({
  laneRole: "frontAim",
  timestamp: createTimestamp(frameTimestampMs),
  aimAvailability: "available",
  aimPointViewport: { x: 320, y: 180 },
  aimPointNormalized: { x: 0.5, y: 0.5 },
  aimSmoothingState: "tracking",
  frontHandDetected: true,
  frontTrackingConfidence: 0.8,
  sourceFrameSize: { width: 640, height: 360 },
  ...patch
});

export const createTriggerFrame = (
  frameTimestampMs: number,
  patch: Partial<TriggerInputFrame> = {}
): TriggerInputFrame => ({
  laneRole: "sideTrigger",
  timestamp: createTimestamp(frameTimestampMs),
  triggerAvailability: "available",
  sideTriggerPhase: "SideTriggerOpenReady",
  triggerEdge: "none",
  triggerPulled: false,
  shotCandidateConfidence: 0.7,
  sideHandDetected: true,
  sideViewQuality: "good",
  dwellFrameCounts: {
    pullDwellFrames: 0,
    releaseDwellFrames: 0,
    stablePoseFrames: 1,
    lostHandFrames: 0,
    cooldownRemainingFrames: 0
  },
  ...patch
});
