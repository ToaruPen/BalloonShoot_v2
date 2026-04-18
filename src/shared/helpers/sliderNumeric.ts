interface SliderNumericMetadata {
  readonly min: number;
  readonly max: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundSliderValue = (value: number): number =>
  Number.parseFloat(value.toFixed(4));

export const coerceSliderNumericValue = (
  metadata: SliderNumericMetadata,
  value: number
): number => roundSliderValue(clamp(value, metadata.min, metadata.max));
