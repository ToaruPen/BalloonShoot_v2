import { describe, expect, it } from "vitest";
import { createGameEngine, registerShot } from "../../../../src/features/gameplay/domain/createGameEngine";

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

  it("awards 1 point for a normal balloon hit", () => {
    const engine = createGameEngine();
    engine.forceBalloons([
      { id: "normal-1", x: 100, y: 100, radius: 52, vy: 36, size: "normal", alive: true }
    ]);

    registerShot(engine, { x: 100, y: 100, hit: true });

    expect(engine.score).toBe(1);
    expect(engine.combo).toBe(1);
    expect(engine.multiplier).toBe(1);
  });

  it("awards 3 points for a small balloon hit and applies combo multipliers", () => {
    const engine = createGameEngine();

    engine.forceBalloons([
      { id: "small-1", x: 100, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 100, y: 100, hit: true });

    engine.forceBalloons([
      { id: "small-2", x: 120, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 120, y: 100, hit: true });

    engine.forceBalloons([
      { id: "small-3", x: 140, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);
    registerShot(engine, { x: 140, y: 100, hit: true });

    expect(engine.score).toBe(12);
    expect(engine.combo).toBe(3);
    expect(engine.multiplier).toBe(2);
  });

  it("resets combo on miss without subtracting score", () => {
    const engine = createGameEngine();
    engine.forceScore({ score: 5, combo: 4, multiplier: 2 });

    registerShot(engine, { x: 0, y: 0, hit: false });

    expect(engine.score).toBe(5);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });

  it("does not score the same balloon twice after it is popped", () => {
    const engine = createGameEngine();
    engine.forceBalloons([
      { id: "small-1", x: 100, y: 100, radius: 28, vy: 36, size: "small", alive: true }
    ]);

    registerShot(engine, { x: 100, y: 100, hit: true });
    registerShot(engine, { x: 100, y: 100, hit: true });

    expect(engine.score).toBe(3);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
  });
});
