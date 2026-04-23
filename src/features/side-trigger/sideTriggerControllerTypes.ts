import type { SideHandDetection } from "../../shared/types/hand";
import type { TriggerEdge } from "../../shared/types/trigger";
import type { SideTriggerMachineState } from "./sideTriggerStateMachine";
import type { CycleSegmenterState } from "./sideTriggerCycleTypes";
import type { CalibrationReducerState } from "./sideTriggerCalibrationTypes";
import type {
  ControllerTelemetry,
  CycleEventTelemetry
} from "./sideTriggerTelemetryTypes";
import type { SideTriggerHandGeometrySignature } from "./sideTriggerRawMetric";

export interface ControllerState {
  readonly armed: boolean;
  readonly cycleState: CycleSegmenterState;
  readonly calibrationState: CalibrationReducerState;
  readonly fsmState: SideTriggerMachineState;
  readonly pullEnterFirstSeenMs?: number;
  readonly lastObservedHandTimestampMs?: number;
  readonly lastSourceKey?: string;
  readonly geometryEma?: SideTriggerHandGeometrySignature;
  readonly manualOverridePrevActive: boolean;
}

export interface ControllerInput {
  readonly detection: SideHandDetection | undefined;
  readonly timestampMs: number;
  readonly sliderInDefaultRange: boolean;
}

export interface ControllerOutput {
  readonly state: ControllerState;
  readonly edge: TriggerEdge;
  readonly telemetry: ControllerTelemetry;
  readonly cycleEvent?: CycleEventTelemetry;
}
