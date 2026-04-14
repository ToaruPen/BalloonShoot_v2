import type { CrosshairPoint } from "./createCrosshairSmoother";

export interface ViewportSize {
  width: number;
  height: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface ProjectLandmarkOptions {
  mirrorX?: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const isValidSize = (size: ViewportSize): boolean =>
  isPositiveFinite(size.width) && isPositiveFinite(size.height);

const sanitizeNormalized = (value: number): number =>
  clamp(Number.isFinite(value) ? value : 0, 0, 1);

export const projectLandmarkToViewport = (
  point: NormalizedPoint,
  sourceSize: ViewportSize,
  viewportSize: ViewportSize,
  options: ProjectLandmarkOptions = {}
): CrosshairPoint => {
  if (!isValidSize(sourceSize) || !isValidSize(viewportSize)) {
    return { x: 0, y: 0 };
  }

  const normalizedX = sanitizeNormalized(point.x);
  const normalizedY = sanitizeNormalized(point.y);
  const scale = Math.max(
    viewportSize.width / sourceSize.width,
    viewportSize.height / sourceSize.height
  );
  const renderedWidth = sourceSize.width * scale;
  const renderedHeight = sourceSize.height * scale;
  const offsetX = (renderedWidth - viewportSize.width) / 2;
  const offsetY = (renderedHeight - viewportSize.height) / 2;
  const projectedX = normalizedX * renderedWidth - offsetX;
  const projectedY = normalizedY * renderedHeight - offsetY;
  const mirrorX = options.mirrorX === true;
  const mirroredX = mirrorX ? viewportSize.width - projectedX : projectedX;

  return {
    x: clamp(mirroredX, 0, viewportSize.width),
    y: clamp(projectedY, 0, viewportSize.height)
  };
};
