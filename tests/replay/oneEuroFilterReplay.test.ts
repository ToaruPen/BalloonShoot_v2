import { describe, expect, it } from "vitest";
import { createOneEuroFilter } from "../../src/features/hand-tracking/oneEuroFilter";

const FILTER_CONFIG = { minCutoff: 1.5, beta: 0.1, dCutoff: 1.0 };

const runSequence = (
  samples: readonly (readonly [number, number])[]
): number[] => {
  const filter = createOneEuroFilter(() => FILTER_CONFIG);
  return samples.map(([value, timestampMs]) => filter.filter(value, timestampMs));
};

const requireSample = (samples: readonly number[], index: number): number => {
  const value = samples[index];
  if (value === undefined) {
    throw new Error(`Missing replay sample at index ${String(index)}`);
  }
  return value;
};

describe("replay: OneEuro filter deterministic sequence", () => {
  it("produces identical output when replayed with the same fixed samples", () => {
    const samples: readonly (readonly [number, number])[] = [
      [0.5, 0],
      [0.6, 33],
      [0.8, 66],
      [0.7, 100],
      [0.75, 133]
    ];

    expect(runSequence(samples)).toEqual(runSequence(samples));
  });

  it("smooths a clean step transition instead of passing the raw level through", () => {
    const samples: readonly (readonly [number, number])[] = Array.from(
      { length: 20 },
      (_, i) => [i < 10 ? 0 : 1, i * 33] as const
    );

    const output = runSequence(samples);

    expect(requireSample(output, 0)).toBe(0);
    expect(requireSample(output, 9)).toBeLessThan(0.1);

    // Transition sample must sit strictly between the two input levels; a
    // pass-through degradation would pin it to 1 and a frozen filter would
    // leave it at 0.
    const firstPostStep = requireSample(output, 10);
    expect(firstPostStep).toBeGreaterThan(0.1);
    expect(firstPostStep).toBeLessThan(0.6);

    // Smoothing should keep closing the gap — a later post-step sample must
    // exceed the first one.
    expect(requireSample(output, 15)).toBeGreaterThan(firstPostStep);

    // Final sample approaches the new level but cannot equal it; equality
    // would mean the filter is no longer damping anything.
    const finalSample = requireSample(output, 19);
    expect(finalSample).toBeGreaterThan(0.5);
    expect(finalSample).toBeLessThan(1);
  });
});
