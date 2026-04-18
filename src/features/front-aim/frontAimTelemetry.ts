import type {
  AimAvailability,
  AimInputFrame,
  AimSmoothingState,
  FrontAimLastLostReason,
  FrontAimTelemetry
} from "../../shared/types/aim";

interface UnavailableTelemetryPatch {
  readonly aimAvailability?: AimAvailability;
  readonly aimSmoothingState?: AimSmoothingState;
  readonly frontHandDetected?: boolean;
  readonly frontTrackingConfidence?: number;
  readonly lastLostReason?: FrontAimLastLostReason;
}

export const telemetryFromAimFrame = (
  aimFrame: AimInputFrame | undefined,
  patch: UnavailableTelemetryPatch = {}
): FrontAimTelemetry => {
  if (aimFrame !== undefined) {
    return {
      aimAvailability: aimFrame.aimAvailability,
      aimSmoothingState: aimFrame.aimSmoothingState,
      frontHandDetected: aimFrame.frontHandDetected,
      frontTrackingConfidence: aimFrame.frontTrackingConfidence,
      aimPointViewport: aimFrame.aimPointViewport,
      aimPointNormalized: aimFrame.aimPointNormalized,
      sourceFrameSize: aimFrame.sourceFrameSize,
      lastLostReason: patch.lastLostReason
    };
  }

  return {
    aimAvailability: patch.aimAvailability ?? "unavailable",
    aimSmoothingState: patch.aimSmoothingState ?? "recoveringAfterLoss",
    frontHandDetected: patch.frontHandDetected ?? false,
    frontTrackingConfidence: patch.frontTrackingConfidence,
    aimPointViewport: undefined,
    aimPointNormalized: undefined,
    sourceFrameSize: undefined,
    lastLostReason: patch.lastLostReason
  };
};
