import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
  MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
} from "../../../../src/features/side-trigger/sideTriggerConstants";
import {
  SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA,
  coerceSideTriggerCalibrationValue,
  defaultSideTriggerCalibration,
  sideTriggerCalibrationStatusFor,
  updateSideTriggerCalibrationValue
} from "../../../../src/features/side-trigger/sideTriggerCalibration";

describe("side trigger calibration", () => {
  it("builds default calibration from named constants", () => {
    expect(
      defaultSideTriggerCalibration.openPose.normalizedThumbDistance
    ).toBe(DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE);
    expect(
      defaultSideTriggerCalibration.pulledPose.normalizedThumbDistance
    ).toBe(DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE);
  });

  it("exposes one slider metadata entry per calibration field", () => {
    expect(
      SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.map((item) => item.key).sort()
    ).toEqual(["openPoseDistance", "pulledPoseDistance"]);
  });

  it("keeps open and pulled pose distances separated", () => {
    const openMetadata = SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "openPoseDistance"
    );
    const pulledMetadata = SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "pulledPoseDistance"
    );

    if (openMetadata === undefined || pulledMetadata === undefined) {
      throw new Error("side calibration metadata missing");
    }

    const collapsedOpen = updateSideTriggerCalibrationValue(
      defaultSideTriggerCalibration,
      openMetadata,
      0
    );
    const collapsedPulled = updateSideTriggerCalibrationValue(
      defaultSideTriggerCalibration,
      pulledMetadata,
      1.2
    );

    expect(
      collapsedOpen.openPose.normalizedThumbDistance -
        collapsedOpen.pulledPose.normalizedThumbDistance
    ).toBeGreaterThanOrEqual(MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN);
    expect(
      collapsedPulled.openPose.normalizedThumbDistance -
        collapsedPulled.pulledPose.normalizedThumbDistance
    ).toBeGreaterThanOrEqual(MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN);
    expect(coerceSideTriggerCalibrationValue(openMetadata, 3)).toBe(2);
  });

  it("reports default status until a calibration value changes", () => {
    const metadata = SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "openPoseDistance"
    );

    if (metadata === undefined) {
      throw new Error("side open pose metadata missing");
    }

    expect(sideTriggerCalibrationStatusFor(defaultSideTriggerCalibration)).toBe(
      "default"
    );
    expect(
      sideTriggerCalibrationStatusFor(
        updateSideTriggerCalibrationValue(
          defaultSideTriggerCalibration,
          metadata,
          0.9
        )
      )
    ).toBe("liveTuning");
  });
});
