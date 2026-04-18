import type {
  AimAvailability,
  AimInputFrame,
  AimSmoothingState,
  FrontAimLastLostReason,
  FrontAimTelemetry
} from "../../shared/types/aim";

interface UnavailableTelemetryPatch {
  readonly aimAvailability?: Exclude<AimAvailability, "available">;
  readonly aimSmoothingState?: AimSmoothingState;
  readonly frontHandDetected?: boolean;
  readonly frontTrackingConfidence?: number;
  readonly lastLostReason?: FrontAimLastLostReason;
}

export const telemetryFromAimFrame = (
  aimFrame: AimInputFrame | undefined,
  patch: UnavailableTelemetryPatch = {}
): FrontAimTelemetry => {
  if (aimFrame?.aimAvailability === "available") {
    return {
      aimAvailability: aimFrame.aimAvailability,
      aimSmoothingState: aimFrame.aimSmoothingState,
      frontHandDetected: true,
      frontTrackingConfidence: aimFrame.frontTrackingConfidence,
      aimPointViewport: aimFrame.aimPointViewport,
      aimPointNormalized: aimFrame.aimPointNormalized,
      sourceFrameSize: aimFrame.sourceFrameSize,
      lastLostReason: undefined
    };
  }

  return {
    aimAvailability:
      aimFrame?.aimAvailability ?? patch.aimAvailability ?? "unavailable",
    aimSmoothingState:
      aimFrame?.aimSmoothingState ??
      patch.aimSmoothingState ??
      "recoveringAfterLoss",
    frontHandDetected:
      aimFrame?.frontHandDetected ?? patch.frontHandDetected ?? false,
    frontTrackingConfidence:
      aimFrame?.frontTrackingConfidence ?? patch.frontTrackingConfidence,
    aimPointViewport: undefined,
    aimPointNormalized: undefined,
    sourceFrameSize: undefined,
    lastLostReason: patch.lastLostReason
  };
};
