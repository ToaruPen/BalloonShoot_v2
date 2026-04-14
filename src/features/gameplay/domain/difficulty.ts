interface DifficultyProfile {
  spawnEveryMs: number;
  normalRadius: number;
  smallRadius: number;
  smallChance: number;
  balloonSpeed: number;
}

export const getDifficultyProfile = (elapsedMs: number): DifficultyProfile => {
  if (elapsedMs < 20_000) {
    return {
      spawnEveryMs: 1_200,
      normalRadius: 52,
      smallRadius: 28,
      smallChance: 0.1,
      balloonSpeed: 36
    };
  }

  if (elapsedMs < 40_000) {
    return {
      spawnEveryMs: 900,
      normalRadius: 46,
      smallRadius: 24,
      smallChance: 0.2,
      balloonSpeed: 48
    };
  }

  return {
    spawnEveryMs: 700,
    normalRadius: 40,
    smallRadius: 20,
    smallChance: 0.35,
    balloonSpeed: 64
  };
};
