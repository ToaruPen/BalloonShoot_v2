import { describe, expect, it } from "vitest";
import {
  createOneEuroFilter,
  type OneEuroFilterConfig
} from "../../../../src/features/hand-tracking/oneEuroFilter";

const staticConfig = (config: OneEuroFilterConfig) => () => config;

describe("createOneEuroFilter", () => {
  it("returns the first sample unchanged", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 })
    );

    expect(filter.filter(0.5, 0)).toBe(0.5);
  });

  it("pulls subsequent stationary samples toward the previous value", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.0, dCutoff: 1.0 })
    );

    filter.filter(0.5, 0);
    // 33 ms later a noisy value arrives; with beta=0 the cutoff stays at
    // minCutoff=1 Hz so the output is dragged back toward 0.5, not snapped
    // to 0.8. Math: alpha ≈ 0.1717, output ≈ 0.5515.
    const smoothed = filter.filter(0.8, 33);

    expect(smoothed).toBeGreaterThan(0.5);
    expect(smoothed).toBeLessThan(0.8);
    expect(smoothed).toBeCloseTo(0.5 + 0.1717 * 0.3, 3);
  });

  it("approaches the input more closely when beta couples cutoff to speed", () => {
    const lowBeta = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.0, dCutoff: 1.0 })
    );
    const highBeta = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.5, dCutoff: 1.0 })
    );

    lowBeta.filter(0.0, 0);
    highBeta.filter(0.0, 0);

    const slowOut = lowBeta.filter(1.0, 33);
    const fastOut = highBeta.filter(1.0, 33);

    expect(fastOut).toBeGreaterThan(slowOut);
  });

  it("resets internal state so the next filter call seeds as if new", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 })
    );

    filter.filter(0.5, 0);
    filter.filter(0.9, 33);
    filter.reset();

    expect(filter.filter(0.2, 66)).toBe(0.2);
  });

  it("reads config from the getter on every call so live slider moves apply", () => {
    let minCutoff = 0.01;
    const filter = createOneEuroFilter(() => ({
      minCutoff,
      beta: 0.0,
      dCutoff: 1.0
    }));

    filter.filter(0.0, 0);
    const aggressive = filter.filter(1.0, 33);

    minCutoff = 1_000_000;
    const passThrough = filter.filter(1.0, 66);

    expect(passThrough).toBeGreaterThan(aggressive);
  });
});
