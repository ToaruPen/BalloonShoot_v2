import type { Balloon } from "./balloon";
import { getDifficultyProfile } from "./difficulty";
import { registerHitScore, registerMissScore, type ScoreState } from "./scoring";

interface ShotInput {
  x: number;
  y: number;
}

interface GameEngineOptions {
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

type ShotResult =
  | {
      readonly kind: "hit";
      readonly balloonId: string;
      readonly size: Balloon["size"];
      readonly points: number;
    }
  | { readonly kind: "miss" };

export interface GameEngine {
  timeRemainingMs: number;
  elapsedMs: number;
  balloons: Balloon[];
  score: number;
  combo: number;
  multiplier: number;
  advance: (deltaMs: number, random: () => number) => void;
  resizeViewport: (viewport: ViewportSize) => void;
  reset: () => void;
  forceBalloons: (balloons: Balloon[]) => void;
  forceScore: (state: ScoreState) => void;
}

const defaultViewport: ViewportSize = {
  width: 640,
  height: 768
};

// Defensive guard for test overrides that may return out-of-range values.
const clampRandom = (value: number): number => Math.min(1, Math.max(0, value));

export const createGameEngine = ({
  width = defaultViewport.width,
  height = defaultViewport.height,
  durationMs = 60_000
}: GameEngineOptions = {}): GameEngine => {
  let nextBalloonId = 0;
  let spawnAccumulatorMs = 0;
  let viewport = { width, height };

  const resetMutableState = (): void => {
    nextBalloonId = 0;
    spawnAccumulatorMs = 0;
    engine.timeRemainingMs = durationMs;
    engine.elapsedMs = 0;
    engine.balloons = [];
    engine.score = 0;
    engine.combo = 0;
    engine.multiplier = 1;
  };

  const engine: GameEngine = {
    timeRemainingMs: durationMs,
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

      engine.balloons = engine.balloons
        .map((balloon) => ({ ...balloon, y: balloon.y - balloon.vy * (deltaMs / 1_000) }))
        .filter((balloon) => balloon.alive && balloon.y + balloon.radius > 0);

      while (spawnAccumulatorMs >= profile.spawnEveryMs) {
        spawnAccumulatorMs -= profile.spawnEveryMs;
        const isSmall = random() < profile.smallChance;
        const radius = isSmall ? profile.smallRadius : profile.normalRadius;

        engine.balloons.push({
          id: `balloon-${String(nextBalloonId++)}`,
          x:
            radius + clampRandom(random()) * Math.max(0, viewport.width - radius * 2),
          y: viewport.height + radius,
          radius,
          vy: profile.balloonSpeed,
          size: isSmall ? "small" : "normal",
          alive: true
        });
      }
    },
    resizeViewport: (nextViewport) => {
      viewport = nextViewport;
    },
    reset: () => {
      resetMutableState();
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

const registerMiss = (engine: GameEngine): ShotResult => {
  const nextScore = registerMissScore({
    score: engine.score,
    combo: engine.combo,
    multiplier: engine.multiplier
  });

  engine.score = nextScore.score;
  engine.combo = nextScore.combo;
  engine.multiplier = nextScore.multiplier;

  return { kind: "miss" };
};

export const registerShot = (
  engine: GameEngine,
  shot: ShotInput
): ShotResult => {
  const hitBalloon = [...engine.balloons].reverse().find((balloon) => {
    if (!balloon.alive) {
      return false;
    }

    const dx = balloon.x - shot.x;
    const dy = balloon.y - shot.y;

    return dx * dx + dy * dy <= balloon.radius * balloon.radius;
  });

  if (!hitBalloon) {
    return registerMiss(engine);
  }

  hitBalloon.alive = false;
  const previousScore = engine.score;
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

  return {
    kind: "hit",
    balloonId: hitBalloon.id,
    size: hitBalloon.size,
    points: engine.score - previousScore
  };
};
