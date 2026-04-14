import { gameConfig } from "../../shared/config/gameConfig";

export interface CrosshairPoint {
  x: number;
  y: number;
}

export const smoothCrosshair = (
  previous: CrosshairPoint | undefined,
  next: CrosshairPoint,
  alpha: number = gameConfig.input.smoothingAlpha
): CrosshairPoint => {
  if (!previous) {
    return next;
  }

  const safeAlpha = Number.isFinite(alpha)
    ? Math.min(1, Math.max(0, alpha))
    : gameConfig.input.smoothingAlpha;

  return {
    x: previous.x + (next.x - previous.x) * safeAlpha,
    y: previous.y + (next.y - previous.y) * safeAlpha
  };
};
