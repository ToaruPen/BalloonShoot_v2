import { describe, expect, it } from "vitest";
import {
  defaultSideTriggerTuning,
  sideTriggerSliderMetadata
} from "../../../../src/features/side-trigger/sideTriggerConfig";
import { renderTuningControls } from "../../../../src/features/diagnostic-workbench/renderTuningControls";

describe("renderTuningControls", () => {
  it("renders every named side trigger threshold slider", () => {
    const html = renderTuningControls(defaultSideTriggerTuning);

    for (const metadata of sideTriggerSliderMetadata) {
      expect(html).toContain(metadata.constantName);
      expect(html).toContain(`data-side-trigger-tuning="${metadata.key}"`);
      expect(html).toContain(`value="${String(metadata.defaultValue)}"`);
    }
  });

  it("includes a reset-to-default action", () => {
    const html = renderTuningControls(defaultSideTriggerTuning);

    expect(html).toContain('data-wb-action="resetSideTriggerTuning"');
    expect(html).toContain("既定値に戻す");
  });
});
