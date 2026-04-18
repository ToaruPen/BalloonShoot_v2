import { describe, expect, it } from "vitest";
import { coerceSliderNumericValue } from "../../../../src/shared/helpers/sliderNumeric";

describe("sliderNumeric helpers", () => {
  it("clamps finite slider values and rounds to four decimals", () => {
    const metadata = { min: 0, max: 1 };

    expect(coerceSliderNumericValue(metadata, -0.2)).toBe(0);
    expect(coerceSliderNumericValue(metadata, 1.2)).toBe(1);
    expect(coerceSliderNumericValue(metadata, 0.123456)).toBe(0.1235);
  });

  it("falls back to the metadata minimum for non-finite values", () => {
    expect(coerceSliderNumericValue({ min: 0.25, max: 1 }, Number.NaN)).toBe(
      0.25
    );
  });
});
