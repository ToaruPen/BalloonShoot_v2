import { arcadeEffects, arcadePalette } from "./arcadeTheme";

export interface TimedPointEffect {
  readonly x: number;
  readonly y: number;
  readonly startedAtMs: number;
}

export interface HitShard {
  readonly dx: number;
  readonly dy: number;
  readonly rotationDeg: number;
  readonly color: string;
}

export interface HitPopEffect extends TimedPointEffect {
  readonly points: number;
  readonly scoreLabel: string;
  readonly color: string;
  readonly shards: readonly HitShard[];
}

const shardPattern = [
  { dx: -70, dy: -54, rotationDeg: -28 },
  { dx: 46, dy: -68, rotationDeg: 34 },
  { dx: 18, dy: 62, rotationDeg: 18 },
  { dx: -42, dy: 46, rotationDeg: -78 },
  { dx: 74, dy: 28, rotationDeg: 92 },
  { dx: -8, dy: -82, rotationDeg: 12 }
] as const;

export const crosshairScaleForShot = (
  shot: TimedPointEffect | undefined,
  nowMs: number
): number => {
  if (shot === undefined) {
    return 1;
  }

  const ageMs = nowMs - shot.startedAtMs;
  if (ageMs < 0 || ageMs >= arcadeEffects.shotShrinkMs) {
    return 1;
  }

  const half = arcadeEffects.shotShrinkMs / 2;
  const progress = ageMs <= half ? ageMs / half : (arcadeEffects.shotShrinkMs - ageMs) / half;
  return 1 - 0.28 * progress;
};

export const createHitPopEffect = ({
  x,
  y,
  points,
  color,
  startedAtMs
}: {
  readonly x: number;
  readonly y: number;
  readonly points: number;
  readonly color: string;
  readonly startedAtMs: number;
}): HitPopEffect => ({
  x,
  y,
  points,
  color,
  startedAtMs,
  scoreLabel: `+${String(points)}`,
  shards: shardPattern.map((shard, index) => ({
    ...shard,
    color: index % 2 === 0 ? color : arcadePalette.lime
  }))
});

export const activeHitPopEffects = (
  effects: readonly HitPopEffect[],
  nowMs: number
): HitPopEffect[] =>
  effects.filter((effect) => nowMs - effect.startedAtMs <= arcadeEffects.hitLifetimeMs);
