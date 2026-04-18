import type {
  FrontAimCalibrationSnapshot,
  FrontAimCalibrationStatus
} from "../../shared/types/aim";
import {
  DEFAULT_FRONT_AIM_CENTER_X,
  DEFAULT_FRONT_AIM_CENTER_Y,
  DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y,
  DEFAULT_FRONT_AIM_CORNER_LEFT_X,
  DEFAULT_FRONT_AIM_CORNER_RIGHT_X,
  DEFAULT_FRONT_AIM_CORNER_TOP_Y,
  MIN_FRONT_AIM_CORNER_SPAN
} from "./frontAimConstants";

export type FrontAimCalibration = FrontAimCalibrationSnapshot;

export type FrontAimCalibrationKey =
  | "centerX"
  | "centerY"
  | "cornerLeftX"
  | "cornerRightX"
  | "cornerTopY"
  | "cornerBottomY";

interface FrontAimCalibrationSliderMetadata {
  readonly key: FrontAimCalibrationKey;
  readonly constantName: string;
  readonly displayName: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export const defaultFrontAimCalibration: FrontAimCalibration = {
  center: {
    x: DEFAULT_FRONT_AIM_CENTER_X,
    y: DEFAULT_FRONT_AIM_CENTER_Y
  },
  cornerBounds: {
    leftX: DEFAULT_FRONT_AIM_CORNER_LEFT_X,
    rightX: DEFAULT_FRONT_AIM_CORNER_RIGHT_X,
    topY: DEFAULT_FRONT_AIM_CORNER_TOP_Y,
    bottomY: DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y
  }
};

export const FRONT_AIM_CALIBRATION_SLIDER_METADATA: readonly FrontAimCalibrationSliderMetadata[] =
  [
    {
      key: "centerX",
      constantName: "DEFAULT_FRONT_AIM_CENTER_X",
      displayName: "Front center x",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CENTER_X
    },
    {
      key: "centerY",
      constantName: "DEFAULT_FRONT_AIM_CENTER_Y",
      displayName: "Front center y",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CENTER_Y
    },
    {
      key: "cornerLeftX",
      constantName: "DEFAULT_FRONT_AIM_CORNER_LEFT_X",
      displayName: "Corner left x",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CORNER_LEFT_X
    },
    {
      key: "cornerRightX",
      constantName: "DEFAULT_FRONT_AIM_CORNER_RIGHT_X",
      displayName: "Corner right x",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CORNER_RIGHT_X
    },
    {
      key: "cornerTopY",
      constantName: "DEFAULT_FRONT_AIM_CORNER_TOP_Y",
      displayName: "Corner top y",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CORNER_TOP_Y
    },
    {
      key: "cornerBottomY",
      constantName: "DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y",
      displayName: "Corner bottom y",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y
    }
  ];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundSliderValue = (value: number): number =>
  Number.parseFloat(value.toFixed(4));

export const coerceFrontAimCalibrationValue = (
  metadata: FrontAimCalibrationSliderMetadata,
  value: number
): number => roundSliderValue(clamp(value, metadata.min, metadata.max));

export const updateFrontAimCalibrationValue = (
  calibration: FrontAimCalibration,
  metadata: FrontAimCalibrationSliderMetadata,
  value: number
): FrontAimCalibration => {
  const nextValue = coerceFrontAimCalibrationValue(metadata, value);

  switch (metadata.key) {
    case "centerX":
      return { ...calibration, center: { ...calibration.center, x: nextValue } };
    case "centerY":
      return { ...calibration, center: { ...calibration.center, y: nextValue } };
    case "cornerLeftX":
      return {
        ...calibration,
        cornerBounds: {
          ...calibration.cornerBounds,
          leftX: Math.min(
            nextValue,
            calibration.cornerBounds.rightX - MIN_FRONT_AIM_CORNER_SPAN
          )
        }
      };
    case "cornerRightX":
      return {
        ...calibration,
        cornerBounds: {
          ...calibration.cornerBounds,
          rightX: Math.max(
            nextValue,
            calibration.cornerBounds.leftX + MIN_FRONT_AIM_CORNER_SPAN
          )
        }
      };
    case "cornerTopY":
      return {
        ...calibration,
        cornerBounds: {
          ...calibration.cornerBounds,
          topY: Math.min(
            nextValue,
            calibration.cornerBounds.bottomY - MIN_FRONT_AIM_CORNER_SPAN
          )
        }
      };
    case "cornerBottomY":
      return {
        ...calibration,
        cornerBounds: {
          ...calibration.cornerBounds,
          bottomY: Math.max(
            nextValue,
            calibration.cornerBounds.topY + MIN_FRONT_AIM_CORNER_SPAN
          )
        }
      };
  }
};

export const frontAimCalibrationStatusFor = (
  calibration: FrontAimCalibration
): FrontAimCalibrationStatus =>
  calibration.center.x === defaultFrontAimCalibration.center.x &&
  calibration.center.y === defaultFrontAimCalibration.center.y &&
  calibration.cornerBounds.leftX ===
    defaultFrontAimCalibration.cornerBounds.leftX &&
  calibration.cornerBounds.rightX ===
    defaultFrontAimCalibration.cornerBounds.rightX &&
  calibration.cornerBounds.topY ===
    defaultFrontAimCalibration.cornerBounds.topY &&
  calibration.cornerBounds.bottomY ===
    defaultFrontAimCalibration.cornerBounds.bottomY
    ? "default"
    : "liveTuning";
