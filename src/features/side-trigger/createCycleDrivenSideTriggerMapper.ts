import type { FrameTimestamp } from "../../shared/types/camera";
import type { SideHandDetection } from "../../shared/types/hand";
import type {
  SideTriggerTelemetry,
  TriggerInputFrame
} from "../../shared/types/trigger";
import type { SideTriggerCalibration } from "./sideTriggerCalibration";
import type { SideTriggerTuning } from "./sideTriggerConfig";
import type { SideTriggerMapper } from "./createSideTriggerMapper";
import {
  createSideTriggerController,
  type SideTriggerController,
  type SideTriggerControllerSnapshot
} from "./sideTriggerController";
import type {
  ControllerTelemetry,
  CycleEventTelemetry
} from "./sideTriggerTelemetryTypes";

export interface CycleDrivenSideTriggerMapperUpdate {
  readonly detection: SideHandDetection | undefined;
  readonly calibration: SideTriggerCalibration;
  readonly tuning: SideTriggerTuning;
  readonly timestamp?: FrameTimestamp;
  readonly sliderInDefaultRange?: boolean;
}

export interface CycleDrivenSideTriggerMapperResult {
  readonly triggerFrame: TriggerInputFrame | undefined;
  readonly telemetry: SideTriggerTelemetry;
  readonly controllerTelemetry: ControllerTelemetry;
  readonly cycleEvent?: CycleEventTelemetry;
}

export interface CycleDrivenSideTriggerMapper extends SideTriggerMapper {
  updateRich(
    update: CycleDrivenSideTriggerMapperUpdate
  ): CycleDrivenSideTriggerMapperResult;
  getSnapshot(): SideTriggerControllerSnapshot;
}

export const createCycleDrivenSideTriggerMapper =
  (): CycleDrivenSideTriggerMapper => {
    const controller: SideTriggerController = createSideTriggerController();

    const run = (update: CycleDrivenSideTriggerMapperUpdate) =>
      controller.update({
        detection: update.detection,
        tuning: update.tuning,
        ...(update.timestamp !== undefined ? { timestamp: update.timestamp } : {}),
        sliderInDefaultRange: update.sliderInDefaultRange ?? true
      });

    return {
      update(update) {
        const result = run(update);
        return {
          triggerFrame: result.triggerFrame,
          telemetry: result.telemetry
        };
      },
      updateRich(update) {
        const result = run(update);
        return {
          triggerFrame: result.triggerFrame,
          telemetry: result.telemetry,
          controllerTelemetry: result.controllerTelemetry,
          ...(result.cycleEvent !== undefined
            ? { cycleEvent: result.cycleEvent }
            : {})
        };
      },
      reset() {
        controller.reset();
      },
      getSnapshot() {
        return controller.getSnapshot();
      }
    };
  };
