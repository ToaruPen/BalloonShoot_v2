import type { BalloonSize } from "./balloon";

export interface ScoreState {
  score: number;
  combo: number;
  multiplier: number;
}

const getMultiplier = (combo: number): number => {
  if (combo >= 6) {
    return 3;
  }

  if (combo >= 3) {
    return 2;
  }

  return 1;
};

export const registerHitScore = (state: ScoreState, size: BalloonSize): ScoreState => {
  const combo = state.combo + 1;
  const multiplier = getMultiplier(combo);
  const baseScore = size === "small" ? 3 : 1;

  return {
    score: state.score + baseScore * multiplier,
    combo,
    multiplier
  };
};

export const registerMissScore = (state: ScoreState): ScoreState => ({
  score: state.score,
  combo: 0,
  multiplier: 1
});
