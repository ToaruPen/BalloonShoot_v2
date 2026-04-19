import type { AimInputFrame, FrontAimTelemetry } from "../../shared/types/aim";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "../../shared/types/camera";
import type {
  FusedGameInputFrame,
  FusionTelemetry
} from "../../shared/types/fusion";
import type {
  FrontHandDetection,
  SideHandDetection
} from "../../shared/types/hand";
import type {
  SideTriggerTelemetry,
  TriggerInputFrame
} from "../../shared/types/trigger";
import type { FusionTuning } from "../input-fusion";
import type { FrontAimCalibration } from "../front-aim";
import type {
  SideTriggerCalibration,
  SideTriggerTuning
} from "../side-trigger";

export interface WorkbenchInspectionState {
  readonly frontDetection: FrontHandDetection | undefined;
  readonly sideDetection: SideHandDetection | undefined;
  readonly frontFrameTimestamp?: FrameTimestamp;
  readonly sideFrameTimestamp?: FrameTimestamp;
  readonly frontLaneHealth: LaneHealthStatus;
  readonly sideLaneHealth: LaneHealthStatus;
  readonly frontAimFrame: AimInputFrame | undefined;
  readonly frontAimTelemetry: FrontAimTelemetry | undefined;
  readonly frontAimCalibration: FrontAimCalibration;
  readonly sideTriggerFrame: TriggerInputFrame | undefined;
  readonly sideTriggerTelemetry: SideTriggerTelemetry | undefined;
  readonly sideTriggerCalibration: SideTriggerCalibration;
  readonly sideTriggerTuning: SideTriggerTuning;
  readonly fusionFrame: FusedGameInputFrame | undefined;
  readonly fusionTelemetry: FusionTelemetry | undefined;
  readonly fusionTuning: FusionTuning;
}
