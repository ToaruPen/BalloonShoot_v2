import {
  createSideTriggerMapper,
  type SideTriggerMapper
} from "./createSideTriggerMapper";
import {
  DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
  assertAdaptiveCalibrationConfig,
  createInitialAdaptiveSideTriggerCalibrationState,
  updateSideTriggerAdaptiveCalibration,
  type AdaptiveSideTriggerCalibrationConfig,
  type AdaptiveSideTriggerCalibrationState
} from "./sideTriggerAdaptiveCalibration";
import { extractSideTriggerRawMetric } from "./sideTriggerRawMetric";

export interface AdaptiveSideTriggerMapper extends SideTriggerMapper {
  getAdaptiveState(): AdaptiveSideTriggerCalibrationState;
}

export const createAdaptiveSideTriggerMapper = (
  override: Partial<AdaptiveSideTriggerCalibrationConfig> = {}
): AdaptiveSideTriggerMapper => {
  const config: AdaptiveSideTriggerCalibrationConfig = {
    ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
    ...override
  };
  assertAdaptiveCalibrationConfig(config);

  const inner = createSideTriggerMapper();
  let adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(config);

  return {
    update(update) {
      const metric = extractSideTriggerRawMetric(
        update.detection,
        update.timestamp === undefined
          ? undefined
          : { timestampMs: update.timestamp.frameTimestampMs }
      );
      adaptiveState = updateSideTriggerAdaptiveCalibration(
        adaptiveState,
        metric,
        config
      );

      return inner.update({
        ...update,
        calibration: adaptiveState.calibration
      });
    },
    reset() {
      adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(config);
      inner.reset();
    },
    getAdaptiveState() {
      return adaptiveState;
    }
  };
};
