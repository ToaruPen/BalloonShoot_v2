import { describe, expect, it } from "vitest";
import {
  createGameEngine,
  registerShot
} from "../../../../src/features/gameplay/domain/createGameEngine";

describe("createGameEngine", () => {
  it("starts with a 60 second timer and no balloons", () => {
    const engine = createGameEngine();

    expect(engine.timeRemainingMs).toBe(60_000);
    expect(engine.balloons).toHaveLength(0);
    expect(engine.score).toBe(0);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });

  it("ramps difficulty as time advances", () => {
    const early = createGameEngine();
    const late = createGameEngine();

    early.advance(1_200, () => 0);
    late.advance(40_000, () => 0);
    late.advance(700, () => 0);

    expect(early.balloons[0]?.radius).toBeGreaterThan(late.balloons[0]?.radius ?? 0);
    expect(early.balloons[0]?.vy).toBeLessThan(late.balloons[0]?.vy ?? 0);
  });

  it("spawns balloons within the configured viewport bounds", () => {
    const engine = createGameEngine({ width: 320, height: 240 });

    engine.advance(1_200, () => 0);

    const spawned = engine.balloons[0];
    expect(spawned?.x).toBe(spawned?.radius);
    expect(spawned?.y).toBeGreaterThan(240);
  });

  it("uses resized viewport bounds for later spawns", () => {
    const engine = createGameEngine({ width: 320, height: 240 });

    engine.resizeViewport({ width: 500, height: 300 });
    engine.advance(1_200, () => 1);

    const spawned = engine.balloons[0];
    expect(spawned?.x).toBe(500 - (spawned?.radius ?? 0));
    expect(spawned?.y).toBeGreaterThan(300);
  });

  it("cleans up balloons once they leave the current viewport", () => {
    const engine = createGameEngine({ width: 320, height: 240 });
    engine.forceBalloons([
      {
        id: "escaped",
        x: 100,
        y: -54,
        radius: 52,
        vy: 36,
        size: "normal",
        alive: true
      }
    ]);

    engine.advance(100, () => 0.5);

    expect(engine.balloons).toEqual([]);
  });

  it("awards 1 point for a normal balloon hit", () => {
    const engine = createGameEngine();
    engine.forceBalloons([
      { id: "normal-1", x: 100, y: 100, radius: 52, vy: 36, size: "normal", alive: true }
    ]);

    const result = registerShot(engine, { x: 100, y: 100 });

    expect(result).toEqual({
      kind: "hit",
      balloonId: "normal-1",
      points: 1,
      size: "normal"
    });
    expect(engine.score).toBe(1);
    expect(engine.combo).toBe(1);
    expect(engine.multiplier).toBe(1);
  });

  it("awards 3 points for a small balloon hit and applies combo multipliers", () => {
    const engine = createGameEngine();

    engine.forceBalloons([
      { id: "small-1", x: 100, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 100, y: 100 });

    engine.forceBalloons([
      { id: "small-2", x: 120, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 120, y: 100 });

    engine.forceBalloons([
      { id: "small-3", x: 140, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 140, y: 100 });

    expect(engine.score).toBe(12);
    expect(engine.combo).toBe(3);
    expect(engine.multiplier).toBe(2);
  });

  it("resets combo on miss without subtracting score", () => {
    const engine = createGameEngine();
    engine.forceScore({ score: 5, combo: 4, multiplier: 2 });

    const result = registerShot(engine, { x: 0, y: 0 });

    expect(result).toEqual({ kind: "miss" });
    expect(engine.score).toBe(5);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });

  it("does not score the same balloon twice after it is popped", () => {
    const engine = createGameEngine();
    engine.forceBalloons([
      { id: "small-1", x: 100, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);

    registerShot(engine, { x: 100, y: 100 });
    const secondShot = registerShot(engine, { x: 100, y: 100 });

    expect(secondShot).toEqual({ kind: "miss" });
    expect(engine.score).toBe(3);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });

  it("hits the topmost balloon when balloons overlap", () => {
    const engine = createGameEngine();
    engine.forceBalloons([
      {
        id: "back",
        x: 100,
        y: 100,
        radius: 52,
        vy: 36,
        size: "normal",
        alive: true
      },
      {
        id: "front",
        x: 100,
        y: 100,
        radius: 28,
        vy: 36,
        size: "small",
        alive: true
      }
    ]);

    const result = registerShot(engine, { x: 100, y: 100 });

    expect(result).toEqual({
      kind: "hit",
      balloonId: "front",
      points: 3,
      size: "small"
    });
    expect(engine.balloons.find((balloon) => balloon.id === "back")?.alive).toBe(
      true
    );
    expect(engine.balloons.find((balloon) => balloon.id === "front")?.alive).toBe(
      false
    );
  });
});
