import type { AimFrameSize, AimPoint2D } from "../../shared/types/aim";

export type FrontAimObjectFit = "cover";

export interface FrontAimProjectionOptions {
  readonly objectFit: FrontAimObjectFit;
  readonly mirrorX?: boolean;
}

interface FrontAimProjectionInput extends FrontAimProjectionOptions {
  readonly pointNormalized: AimPoint2D;
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

export const projectAimPointToViewport = ({
  pointNormalized,
  sourceFrameSize,
  viewportSize,
  mirrorX = false
}: FrontAimProjectionInput): FrontAimProjectionResult => {
  const scale = Math.max(
    viewportSize.width / sourceFrameSize.width,
    viewportSize.height / sourceFrameSize.height
  );
  const renderedWidth = sourceFrameSize.width * scale;
  const renderedHeight = sourceFrameSize.height * scale;
  const offsetX = (viewportSize.width - renderedWidth) / 2;
  const offsetY = (viewportSize.height - renderedHeight) / 2;

  const sourceX = pointNormalized.x * sourceFrameSize.width;
  const sourceY = pointNormalized.y * sourceFrameSize.height;
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
