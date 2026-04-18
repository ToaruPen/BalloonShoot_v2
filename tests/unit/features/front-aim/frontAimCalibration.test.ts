import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRONT_AIM_CENTER_X,
  DEFAULT_FRONT_AIM_CENTER_Y,
  DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y,
  DEFAULT_FRONT_AIM_CORNER_LEFT_X,
  DEFAULT_FRONT_AIM_CORNER_RIGHT_X,
  DEFAULT_FRONT_AIM_CORNER_TOP_Y
} from "../../../../src/features/front-aim/frontAimConstants";
import {
  FRONT_AIM_CALIBRATION_SLIDER_METADATA,
  coerceFrontAimCalibrationValue,
  defaultFrontAimCalibration,
  frontAimCalibrationStatusFor,
  updateFrontAimCalibrationValue
} from "../../../../src/features/front-aim/frontAimCalibration";

describe("front aim calibration", () => {
  it("builds default calibration from named constants", () => {
    expect(defaultFrontAimCalibration.center.x).toBe(
      DEFAULT_FRONT_AIM_CENTER_X
    );
    expect(defaultFrontAimCalibration.center.y).toBe(
      DEFAULT_FRONT_AIM_CENTER_Y
    );
    expect(defaultFrontAimCalibration.cornerBounds.leftX).toBe(
      DEFAULT_FRONT_AIM_CORNER_LEFT_X
    );
    expect(defaultFrontAimCalibration.cornerBounds.rightX).toBe(
      DEFAULT_FRONT_AIM_CORNER_RIGHT_X
    );
    expect(defaultFrontAimCalibration.cornerBounds.topY).toBe(
      DEFAULT_FRONT_AIM_CORNER_TOP_Y
    );
    expect(defaultFrontAimCalibration.cornerBounds.bottomY).toBe(
      DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y
    );
  });

  it("exposes one slider metadata entry per calibration field", () => {
    expect(
      FRONT_AIM_CALIBRATION_SLIDER_METADATA.map((item) => item.key).sort()
    ).toEqual([
      "centerX",
      "centerY",
      "cornerBottomY",
      "cornerLeftX",
      "cornerRightX",
      "cornerTopY"
    ]);
  });

  it("clamps slider values and keeps corner bounds separated", () => {
    const leftMetadata = FRONT_AIM_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "cornerLeftX"
    );
    const rightMetadata = FRONT_AIM_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "cornerRightX"
    );

    if (leftMetadata === undefined || rightMetadata === undefined) {
      throw new Error("front calibration metadata missing bounds");
    }

    const movedRight = updateFrontAimCalibrationValue(
      defaultFrontAimCalibration,
      leftMetadata,
      1.2
    );
    const movedLeft = updateFrontAimCalibrationValue(
      defaultFrontAimCalibration,
      rightMetadata,
      -0.2
    );

    expect(coerceFrontAimCalibrationValue(leftMetadata, -0.2)).toBe(0);
    expect(movedRight.cornerBounds.leftX).toBeLessThan(
      movedRight.cornerBounds.rightX
    );
    expect(movedLeft.cornerBounds.leftX).toBeLessThan(
      movedLeft.cornerBounds.rightX
    );
  });

  it("reports default status until a calibration value changes", () => {
    const metadata = FRONT_AIM_CALIBRATION_SLIDER_METADATA.find(
      (item) => item.key === "centerX"
    );

    if (metadata === undefined) {
      throw new Error("front center metadata missing");
    }

    expect(frontAimCalibrationStatusFor(defaultFrontAimCalibration)).toBe(
      "default"
    );
    expect(
      frontAimCalibrationStatusFor(
        updateFrontAimCalibrationValue(
          defaultFrontAimCalibration,
          metadata,
          0.42
        )
      )
    ).toBe("liveTuning");
  });
});
