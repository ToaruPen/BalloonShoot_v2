export interface BalloonSprites {
  readonly frames: readonly HTMLImageElement[];
}

const ANIMATION_FRAME_INTERVAL_MS = 120;

export const balloonAnimationFrameIndex = (
  nowMs: number,
  frameCount: number
): number => {
  if (frameCount <= 0) {
    return 0;
  }

  const tick = Math.floor(nowMs / ANIMATION_FRAME_INTERVAL_MS);
  const wrapped = ((tick % frameCount) + frameCount) % frameCount;
  return wrapped;
};
