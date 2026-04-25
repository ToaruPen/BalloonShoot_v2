import { describe, expect, it } from "vitest";
import {
  activeHitPopEffects,
  createHitPopEffect,
  crosshairScaleForShot
} from "../../../../src/features/rendering/arcadeEffects";

describe("arcade effects", () => {
  it("shrinks the crosshair briefly after a shot", () => {
    const shot = { x: 100, y: 120, startedAtMs: 1_000 };

    expect(crosshairScaleForShot(shot, 1_000)).toBe(1);
    expect(crosshairScaleForShot(shot, 1_060)).toBeCloseTo(0.72);
    expect(crosshairScaleForShot(shot, 1_120)).toBe(1);
    expect(crosshairScaleForShot(undefined, 1_060)).toBe(1);
  });

  it("creates deterministic hit particles and prunes expired effects", () => {
    const effect = createHitPopEffect({
      x: 160,
      y: 180,
      points: 3,
      color: "#ff5a8a",
      startedAtMs: 2_000
    });

    expect(effect.shards).toHaveLength(6);
    expect(effect.scoreLabel).toBe("+3");
    expect(activeHitPopEffects([effect], 2_899)).toHaveLength(1);
    expect(activeHitPopEffects([effect], 2_901)).toHaveLength(0);
  });
});
