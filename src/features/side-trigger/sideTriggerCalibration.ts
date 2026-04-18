import type {
  SideTriggerCalibrationSnapshot,
  SideTriggerCalibrationStatus
} from "../../shared/types/trigger";
import {
  DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
  MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
} from "./sideTriggerConstants";

export type SideTriggerCalibration = SideTriggerCalibrationSnapshot;

export type SideTriggerCalibrationKey =
  | "openPoseDistance"
  | "pulledPoseDistance";

interface SideTriggerCalibrationSliderMetadata {
  readonly key: SideTriggerCalibrationKey;
  readonly constantName: string;
  readonly displayName: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export const defaultSideTriggerCalibration: SideTriggerCalibration = {
  openPose: {
    normalizedThumbDistance: DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE
  },
  pulledPose: {
    normalizedThumbDistance: DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE
  }
};

export const SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA: readonly SideTriggerCalibrationSliderMetadata[] =
  [
    {
      key: "openPoseDistance",
      constantName: "DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE",
      displayName: "Open pose normalized thumb distance",
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE
    },
    {
      key: "pulledPoseDistance",
      constantName: "DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE",
      displayName: "Pulled pose normalized thumb distance",
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE
    }
  ];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundSliderValue = (value: number): number =>
  Number.parseFloat(value.toFixed(4));

export const coerceSideTriggerCalibrationValue = (
  metadata: SideTriggerCalibrationSliderMetadata,
  value: number
): number => roundSliderValue(clamp(value, metadata.min, metadata.max));

export const updateSideTriggerCalibrationValue = (
  calibration: SideTriggerCalibration,
  metadata: SideTriggerCalibrationSliderMetadata,
  value: number
): SideTriggerCalibration => {
  const nextValue = coerceSideTriggerCalibrationValue(metadata, value);

  if (metadata.key === "openPoseDistance") {
    return {
      ...calibration,
      openPose: {
        normalizedThumbDistance: Math.max(
          nextValue,
          calibration.pulledPose.normalizedThumbDistance +
            MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
        )
      }
    };
  }

  return {
    ...calibration,
    pulledPose: {
      normalizedThumbDistance: Math.min(
        nextValue,
        calibration.openPose.normalizedThumbDistance -
          MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
      )
    }
  };
};

export const sideTriggerCalibrationStatusFor = (
  calibration: SideTriggerCalibration
): SideTriggerCalibrationStatus =>
  calibration.openPose.normalizedThumbDistance ===
    defaultSideTriggerCalibration.openPose.normalizedThumbDistance &&
  calibration.pulledPose.normalizedThumbDistance ===
    defaultSideTriggerCalibration.pulledPose.normalizedThumbDistance
    ? "default"
    : "liveTuning";
