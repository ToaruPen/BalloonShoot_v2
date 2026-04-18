import { describe, expect, it } from "vitest";
import { renderFrontAimCalibrationControls } from "../../../../src/features/diagnostic-workbench/renderFrontAimCalibrationControls";
import { defaultFrontAimCalibration } from "../../../../src/features/front-aim";

describe("renderFrontAimCalibrationControls", () => {
  it("renders front aim calibration sliders and reset action", () => {
    const html = renderFrontAimCalibrationControls(defaultFrontAimCalibration);

    expect(html).toContain("診断ワークベンチ専用の session-only calibration");
    expect(html).toContain("DEFAULT_FRONT_AIM_CENTER_X");
    expect(html).toContain('data-front-aim-calibration="centerX"');
    expect(html).toContain('id="wb-front-aim-calibration-value-centerX"');
    expect(html).toContain('data-wb-action="resetFrontAimCalibration"');
  });
});
