import { describe, expect, it } from "vitest";
import { createOneEuroFilter } from "../../src/features/hand-tracking/oneEuroFilter";

const FILTER_CONFIG = { minCutoff: 1.5, beta: 0.1, dCutoff: 1.0 };

const runSequence = (
  samples: readonly (readonly [number, number])[]
): number[] => {
  const filter = createOneEuroFilter(() => FILTER_CONFIG);
  return samples.map(([value, timestampMs]) => filter.filter(value, timestampMs));
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

  it("smooths a clean step transition toward the new level", () => {
    const samples: readonly (readonly [number, number])[] = Array.from(
      { length: 20 },
      (_, i) => [i < 10 ? 0 : 1, i * 33] as const
    );

    const output = runSequence(samples);

    expect(output[0]).toBe(0);
    expect(output[9]).toBeLessThan(0.1);
    expect(output[19]).toBeGreaterThan(0.5);
    expect(output[19]).toBeLessThanOrEqual(1);
  });
});
