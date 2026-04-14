export interface OneEuroFilterConfig {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

interface OneEuroFilter {
  filter(value: number, timestampMs: number): number;
  reset(): void;
}

const smoothingFactor = (timeElapsedSec: number, cutoffHz: number): number => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / timeElapsedSec);
};

export const createOneEuroFilter = (
  getConfig: () => OneEuroFilterConfig
) => {
  let prevRawValue: number | undefined;
  let prevFilteredValue: number | undefined;
  let prevDerivative = 0;
  let prevTimestampMs: number | undefined;

  const filter = (value: number, timestampMs: number): number => {
    if (
      prevRawValue === undefined ||
      prevFilteredValue === undefined ||
      prevTimestampMs === undefined
    ) {
      prevRawValue = value;
      prevFilteredValue = value;
      prevDerivative = 0;
      prevTimestampMs = timestampMs;
      return value;
    }

    const dtSec = (timestampMs - prevTimestampMs) / 1000;
    const { minCutoff, beta, dCutoff } = getConfig();

    const rawDerivative = (value - prevRawValue) / dtSec;
    const aD = smoothingFactor(dtSec, dCutoff);
    const dxFiltered = aD * rawDerivative + (1 - aD) * prevDerivative;

    const cutoff = minCutoff + beta * Math.abs(dxFiltered);
    const a = smoothingFactor(dtSec, cutoff);
    const filteredValue = a * value + (1 - a) * prevFilteredValue;

    prevRawValue = value;
    prevFilteredValue = filteredValue;
    prevDerivative = dxFiltered;
    prevTimestampMs = timestampMs;

    return filteredValue;
  };

  const reset = (): void => {
    prevRawValue = undefined;
    prevFilteredValue = undefined;
    prevDerivative = 0;
    prevTimestampMs = undefined;
  };

  return { filter, reset } satisfies OneEuroFilter;
};
