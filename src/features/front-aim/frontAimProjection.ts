import type { AimFrameSize, AimPoint2D } from "../../shared/types/aim";
import type { FrontAimCalibration } from "./frontAimCalibration";

export type FrontAimObjectFit = "cover";

export interface FrontAimProjectionOptions {
  readonly objectFit: FrontAimObjectFit;
  readonly mirrorX?: boolean;
}

interface FrontAimProjectionInput extends FrontAimProjectionOptions {
  readonly pointNormalized: AimPoint2D;
  readonly calibration: FrontAimCalibration;
  readonly sourceFrameSize: AimFrameSize;
  readonly viewportSize: AimFrameSize;
}

interface FrontAimProjectionResult {
  readonly aimPointViewport: AimPoint2D;
  readonly aimPointNormalized: AimPoint2D;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const roundCoordinate = (value: number): number =>
  Number.parseFloat(value.toFixed(6));

const calibratedPointFor = (
  point: AimPoint2D,
  calibration: FrontAimCalibration
): AimPoint2D => {
  const { leftX, rightX, topY, bottomY } = calibration.cornerBounds;
  const spanX = Math.max(Number.EPSILON, rightX - leftX);
  const spanY = Math.max(Number.EPSILON, bottomY - topY);
  const boundedX = (point.x - leftX) / spanX;
  const boundedY = (point.y - topY) / spanY;
  const centerInBoundsX = (calibration.center.x - leftX) / spanX;
  const centerInBoundsY = (calibration.center.y - topY) / spanY;

  return {
    x: clamp(boundedX + (0.5 - centerInBoundsX), 0, 1),
    y: clamp(boundedY + (0.5 - centerInBoundsY), 0, 1)
  };
};

export const projectAimPointToViewport = ({
  pointNormalized,
  calibration,
  sourceFrameSize,
  viewportSize,
  mirrorX = false
}: FrontAimProjectionInput): FrontAimProjectionResult => {
  const calibratedPoint = calibratedPointFor(pointNormalized, calibration);
  const scale = Math.max(
    viewportSize.width / sourceFrameSize.width,
    viewportSize.height / sourceFrameSize.height
  );
  const renderedWidth = sourceFrameSize.width * scale;
  const renderedHeight = sourceFrameSize.height * scale;
  const offsetX = (viewportSize.width - renderedWidth) / 2;
  const offsetY = (viewportSize.height - renderedHeight) / 2;

  const sourceX = calibratedPoint.x * sourceFrameSize.width;
  const sourceY = calibratedPoint.y * sourceFrameSize.height;
  const projectedX = sourceX * scale + offsetX;
  const projectedY = sourceY * scale + offsetY;
  const mirroredX = mirrorX ? viewportSize.width - projectedX : projectedX;
  const clampedX = roundCoordinate(clamp(mirroredX, 0, viewportSize.width));
  const clampedY = roundCoordinate(clamp(projectedY, 0, viewportSize.height));

  return {
    aimPointViewport: { x: clampedX, y: clampedY },
    aimPointNormalized: {
      x: viewportSize.width === 0 ? 0 : roundCoordinate(clampedX / viewportSize.width),
      y:
        viewportSize.height === 0
          ? 0
          : roundCoordinate(clampedY / viewportSize.height)
    }
  };
};
