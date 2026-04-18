import { describe, expect, it } from "vitest";
import { renderSideTriggerCalibrationControls } from "../../../../src/features/diagnostic-workbench/renderSideTriggerCalibrationControls";
import { defaultSideTriggerCalibration } from "../../../../src/features/side-trigger";

describe("renderSideTriggerCalibrationControls", () => {
  it("renders side trigger calibration sliders and reset action", () => {
    const html = renderSideTriggerCalibrationControls(
      defaultSideTriggerCalibration
    );

    expect(html).toContain("診断ワークベンチ専用の session-only calibration");
    expect(html).toContain("DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE");
    expect(html).toContain("DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE");
    expect(html).toContain('data-side-trigger-calibration="openPoseDistance"');
    expect(html).toContain(
      'data-side-trigger-calibration="pulledPoseDistance"'
    );
    expect(html).toContain(
      'id="wb-side-trigger-calibration-value-openPoseDistance"'
    );
    expect(html).toContain(
      'id="wb-side-trigger-calibration-value-pulledPoseDistance"'
    );
    expect(html).toContain('data-wb-action="resetSideTriggerCalibration"');
  });
});
