import type { FrontAimCalibration } from "../../front-aim";
import type { SideTriggerEvidence } from "../../side-trigger/sideTriggerEvidence";
import type {
  SideTriggerAdaptiveCalibrationTelemetry,
  SideTriggerCalibration
} from "../../side-trigger";
import type {
  FrontAimTelemetry,
  FrontAimTelemetryUnavailable
} from "../../../shared/types/aim";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "../../../shared/types/camera";
import type {
  FusionMode,
  FusedGameInputFrame
} from "../../../shared/types/fusion";
import type {
  HandLandmarkSet,
  SideViewQuality
} from "../../../shared/types/hand";
import type {
  SideTriggerPhase,
  TriggerEdge
} from "../../../shared/types/trigger";
import type { WorkbenchInspectionState } from "../workbenchInspectionState";

export interface TelemetryFrame {
  readonly timestamp: FrameTimestamp;
  readonly fusionMode: FusionMode;
  readonly calibration: {
    readonly frontAim: FrontAimCalibration;
    readonly sideTrigger: SideTriggerCalibration;
  };
  readonly front: {
    readonly landmarks: HandLandmarkSet | undefined;
    readonly laneHealth: LaneHealthStatus;
    readonly aimContext: FrontAimTelemetry | undefined;
  };
  readonly side: {
    readonly landmarks: HandLandmarkSet | undefined;
    readonly worldLandmarks: HandLandmarkSet | undefined;
    readonly sideViewQuality: SideViewQuality;
    readonly evidence: SideTriggerEvidence;
    readonly fsmPhase: SideTriggerPhase;
    readonly triggerEdge: TriggerEdge | undefined;
    readonly laneHealth: LaneHealthStatus;
  };
  readonly sideTriggerAdaptiveCalibration?:
    | SideTriggerAdaptiveCalibrationTelemetry
    | undefined;
  readonly fusion: FusedGameInputFrame;
}

export interface TelemetrySessionJson {
  readonly schemaVersion: 1;
  readonly sessionStart: string;
  readonly sessionEnd: string;
  readonly frames: readonly TelemetryFrame[];
}

const unavailableAimContext = (
  state: WorkbenchInspectionState
): FrontAimTelemetryUnavailable => ({
  aimAvailability: "unavailable",
  aimSmoothingState: "coldStart",
  frontHandDetected: false,
  frontTrackingConfidence: undefined,
  aimPointViewport: undefined,
  aimPointNormalized: undefined,
  sourceFrameSize: undefined,
  calibrationStatus: "liveTuning",
  calibration: state.frontAimCalibration,
  lastLostReason: "handNotDetected"
});

const evidenceFromInspection = (
  state: WorkbenchInspectionState
): SideTriggerEvidence => {
  const telemetry = state.sideTriggerTelemetry;

  if (telemetry === undefined) {
    return {
      sideHandDetected: false,
      sideViewQuality: state.sideDetection?.sideViewQuality ?? "lost",
      pullEvidenceScalar: 0,
      releaseEvidenceScalar: 0,
      triggerPostureConfidence: 0,
      shotCandidateConfidence: 0,
      rejectReason: "handNotDetected",
      usedWorldLandmarks: false
    };
  }

  return {
    sideHandDetected: state.sideTriggerFrame?.sideHandDetected ?? false,
    sideViewQuality: state.sideDetection?.sideViewQuality ?? "lost",
    pullEvidenceScalar: telemetry.pullEvidenceScalar,
    releaseEvidenceScalar: telemetry.releaseEvidenceScalar,
    triggerPostureConfidence: telemetry.triggerPostureConfidence,
    shotCandidateConfidence: telemetry.shotCandidateConfidence,
    rejectReason: telemetry.lastRejectReason,
    usedWorldLandmarks: telemetry.usedWorldLandmarks
  };
};

const triggerEdgeFromInspection = (
  state: WorkbenchInspectionState
): TriggerEdge | undefined => {
  const edge =
    state.sideTriggerTelemetry?.edge ?? state.sideTriggerFrame?.triggerEdge;

  return edge === undefined || edge === "none" ? undefined : edge;
};

export const assembleTelemetryFrame = (
  state: WorkbenchInspectionState,
  timestamp: FrameTimestamp
): TelemetryFrame | undefined => {
  if (state.fusionFrame === undefined) {
    return undefined;
  }

  return {
    timestamp,
    fusionMode: state.fusionFrame.fusionMode,
    calibration: {
      frontAim: state.frontAimCalibration,
      sideTrigger: state.sideTriggerCalibration
    },
    front: {
      landmarks: state.frontDetection?.rawFrame.landmarks,
      laneHealth: state.frontLaneHealth,
      aimContext: state.frontAimTelemetry ?? unavailableAimContext(state)
    },
    side: {
      landmarks: state.sideDetection?.rawFrame.landmarks,
      worldLandmarks: state.sideDetection?.rawFrame.worldLandmarks,
      sideViewQuality: state.sideDetection?.sideViewQuality ?? "lost",
      evidence: evidenceFromInspection(state),
      fsmPhase:
        state.sideTriggerTelemetry?.phase ??
        state.sideTriggerFrame?.sideTriggerPhase ??
        "SideTriggerNoHand",
      triggerEdge: triggerEdgeFromInspection(state),
      laneHealth: state.sideLaneHealth
    },
    fusion: state.fusionFrame
  };
};
