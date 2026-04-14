import type { Balloon } from "./balloon";
import { getDifficultyProfile } from "./difficulty";
import { registerHitScore, registerMissScore, type ScoreState } from "./scoring";

interface ShotInput {
  x: number;
  y: number;
  hit: boolean;
}

interface GameEngine {
  timeRemainingMs: number;
  elapsedMs: number;
  balloons: Balloon[];
  score: number;
  combo: number;
  multiplier: number;
  advance: (deltaMs: number, random: () => number) => void;
  forceBalloons: (balloons: Balloon[]) => void;
  forceScore: (state: ScoreState) => void;
}

export const createGameEngine = (): GameEngine => {
  let nextBalloonId = 0;
  let spawnAccumulatorMs = 0;

  const engine: GameEngine = {
    timeRemainingMs: 60_000,
    elapsedMs: 0,
    balloons: [],
    score: 0,
    combo: 0,
    multiplier: 1,
    advance: (deltaMs, random) => {
      engine.elapsedMs += deltaMs;
      engine.timeRemainingMs = Math.max(0, engine.timeRemainingMs - deltaMs);

      const profile = getDifficultyProfile(engine.elapsedMs);
      spawnAccumulatorMs += deltaMs;

      while (spawnAccumulatorMs >= profile.spawnEveryMs) {
        spawnAccumulatorMs -= profile.spawnEveryMs;
        const isSmall = random() < profile.smallChance;

        engine.balloons.push({
          id: `balloon-${String(nextBalloonId++)}`,
          x: 80 + random() * 480,
          y: 820,
          radius: isSmall ? profile.smallRadius : profile.normalRadius,
          vy: profile.balloonSpeed,
          size: isSmall ? "small" : "normal",
          alive: true
        });
      }

      engine.balloons = engine.balloons
        .map((balloon) => ({ ...balloon, y: balloon.y - balloon.vy * (deltaMs / 1_000) }))
        .filter((balloon) => balloon.alive && balloon.y + balloon.radius > -20);
    },
    forceBalloons: (balloons) => {
      engine.balloons = balloons;
    },
    forceScore: (state) => {
      engine.score = state.score;
      engine.combo = state.combo;
      engine.multiplier = state.multiplier;
    }
  };

  return engine;
};

export const registerShot = (engine: GameEngine, shot: ShotInput): void => {
  if (!shot.hit) {
    const nextScore = registerMissScore({
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    });

    engine.score = nextScore.score;
    engine.combo = nextScore.combo;
    engine.multiplier = nextScore.multiplier;
    return;
  }

  const hitBalloon = engine.balloons.find((balloon) => {
    if (!balloon.alive) {
      return false;
    }

    const dx = balloon.x - shot.x;
    const dy = balloon.y - shot.y;

    return dx * dx + dy * dy <= balloon.radius * balloon.radius;
  });

  if (!hitBalloon) {
    registerShot(engine, { ...shot, hit: false });
    return;
  }

  hitBalloon.alive = false;
  const nextScore = registerHitScore(
    {
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    },
    hitBalloon.size
  );

  engine.score = nextScore.score;
  engine.combo = nextScore.combo;
  engine.multiplier = nextScore.multiplier;
};
