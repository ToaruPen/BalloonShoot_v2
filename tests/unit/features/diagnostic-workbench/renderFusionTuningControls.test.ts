import { describe, expect, it } from "vitest";
import {
  defaultFusionTuning,
  fusionSliderMetadata
} from "../../../../src/features/input-fusion";
import { renderFusionTuningControls } from "../../../../src/features/diagnostic-workbench/renderFusionTuningControls";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("renderFusionTuningControls", () => {
  it("renders every named fusion timing slider", () => {
    const html = renderFusionTuningControls(defaultFusionTuning);

    for (const metadata of fusionSliderMetadata) {
      expect(html).toContain(metadata.constantName);
      expect(html).toMatch(
        new RegExp(
          `<input(?=[^>]*\\bvalue="${escapeRegExp(String(metadata.defaultValue))}")(?=[^>]*\\bdata-fusion-tuning="${escapeRegExp(metadata.key)}")[^>]*>`
        )
      );
    }
  });

  it("includes a reset-to-default action", () => {
    const html = renderFusionTuningControls(defaultFusionTuning);

    expect(html).toContain('data-wb-action="resetFusionTuning"');
    expect(html).toContain("既定値に戻す");
  });
});
