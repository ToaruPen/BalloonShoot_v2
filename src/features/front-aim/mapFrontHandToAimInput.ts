import type {
  AimInputFrame,
  AimSmoothingState
} from "../../shared/types/aim";
import type { FrontHandDetection } from "../../shared/types/hand";
import type { FrontAimCalibration } from "./frontAimCalibration";
import {
  projectAimPointToViewport,
  type FrontAimProjectionOptions
} from "./frontAimProjection";

interface MapFrontHandToAimInputOptions {
  readonly detection: FrontHandDetection;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly calibration: FrontAimCalibration;
  readonly projectionOptions?: FrontAimProjectionOptions;
  readonly aimSmoothingState?: AimSmoothingState;
}

export const mapFrontHandToAimInput = ({
  detection,
  viewportSize,
  calibration,
  projectionOptions = { objectFit: "cover" },
  aimSmoothingState = "tracking"
}: MapFrontHandToAimInputOptions): AimInputFrame => {
  const sourceFrameSize = {
    width: detection.filteredFrame.width,
    height: detection.filteredFrame.height
  };
  const projection = projectAimPointToViewport({
    pointNormalized: detection.filteredFrame.landmarks.indexTip,
    calibration,
    sourceFrameSize,
    viewportSize,
    ...projectionOptions
  });

  return {
    laneRole: "frontAim",
    timestamp: detection.timestamp,
    aimAvailability: "available",
    aimPointViewport: projection.aimPointViewport,
    aimPointNormalized: projection.aimPointNormalized,
    aimSmoothingState,
    frontHandDetected: true,
    frontTrackingConfidence: detection.handPresenceConfidence,
    sourceFrameSize
  };
};
