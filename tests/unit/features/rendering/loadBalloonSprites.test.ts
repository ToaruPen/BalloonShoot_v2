import { describe, expect, it } from "vitest";
import { balloonAnimationFrameIndex } from "../../../../src/features/rendering/loadBalloonSprites";

describe("balloonAnimationFrameIndex", () => {
  it("returns 0 when frame count is 0", () => {
    expect(balloonAnimationFrameIndex(123, 0)).toBe(0);
  });

  it("advances the index every 120ms", () => {
    expect(balloonAnimationFrameIndex(0, 5)).toBe(0);
    expect(balloonAnimationFrameIndex(119, 5)).toBe(0);
    expect(balloonAnimationFrameIndex(120, 5)).toBe(1);
    expect(balloonAnimationFrameIndex(240, 5)).toBe(2);
  });

  it("wraps the index modulo the frame count", () => {
    expect(balloonAnimationFrameIndex(120 * 5, 5)).toBe(0);
    expect(balloonAnimationFrameIndex(120 * 7, 5)).toBe(2);
  });

  it("handles negative time inputs without producing a negative index", () => {
    const value = balloonAnimationFrameIndex(-1, 5);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(5);
  });
});
