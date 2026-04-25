export const arcadePalette = {
  ink: "#1a1430",
  cream: "#fff5e1",
  candy: "#ff5a8a",
  lime: "#c8ff3a",
  sky: "#40c7ff",
  mint: "#00d1b2",
  alert: "#ffb400"
} as const;

export const arcadeCrosshair = {
  radius: 24,
  ringWidth: 5,
  outlineWidth: 4,
  lineHalfLength: 21,
  lineWidth: 4,
  shadowOffset: 5
} as const;

export const arcadeEffects = {
  shotShrinkMs: 120,
  hitLifetimeMs: 900,
  hitRingMs: 280,
  floatingScoreMs: 700
} as const;

export const arcadeHitEffects = {
  ringStartRadius: 20,
  ringRadiusGrowth: 58,
  shardLifetimeMs: 600,
  shardGravity: 36,
  shardWidth: 16,
  shardHeight: 10,
  scoreXOffset: 42,
  scoreBaseYOffset: 82,
  scoreRiseDelayMs: 100,
  scoreRiseStepMs: 20,
  scoreMaxRise: 24
} as const;
