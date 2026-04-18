import type {
  AimAvailability,
  AimInputFrame,
  AimSmoothingState,
  FrontAimLastLostReason,
  FrontAimTelemetry
} from "../../shared/types/aim";
import {
  type FrontAimCalibration,
  frontAimCalibrationStatusFor
} from "./frontAimCalibration";

interface UnavailableTelemetryPatch {
  readonly aimAvailability?: Exclude<AimAvailability, "available">;
  readonly aimSmoothingState?: AimSmoothingState;
  readonly frontHandDetected?: boolean;
  readonly frontTrackingConfidence?: number;
  readonly lastLostReason?: FrontAimLastLostReason;
}

export const telemetryFromAimFrame = (
  aimFrame: AimInputFrame | undefined,
  calibration: FrontAimCalibration,
  patch: UnavailableTelemetryPatch = {}
): FrontAimTelemetry => {
  const calibrationStatus = frontAimCalibrationStatusFor(calibration);

  if (aimFrame?.aimAvailability === "available") {
    return {
      aimAvailability: aimFrame.aimAvailability,
      aimSmoothingState: aimFrame.aimSmoothingState,
      frontHandDetected: true,
      frontTrackingConfidence: aimFrame.frontTrackingConfidence,
      aimPointViewport: aimFrame.aimPointViewport,
      aimPointNormalized: aimFrame.aimPointNormalized,
      sourceFrameSize: aimFrame.sourceFrameSize,
      calibrationStatus,
      calibration,
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
    calibrationStatus,
    calibration,
    lastLostReason: patch.lastLostReason
  };
};
