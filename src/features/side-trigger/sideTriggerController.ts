import type { FrameTimestamp } from "../../shared/types/camera";
import type { SideHandDetection } from "../../shared/types/hand";
import type {
  SideTriggerTelemetry,
  TriggerInputFrame
} from "../../shared/types/trigger";
import { sideTriggerCalibrationStatusFor } from "./sideTriggerCalibration";
import {
  CTRL_GEOMETRY_EMA_ALPHA,
  CTRL_GEOMETRY_JUMP_RATIO,
  CTRL_HAND_LOSS_THRESHOLD_MS
} from "./sideTriggerConstants";
import type { SideTriggerTuning } from "./sideTriggerConfig";
import {
  createSideTriggerMapper,
  type SideTriggerMapper
} from "./createSideTriggerMapper";
import {
  createInitialCalibrationState,
  updateCalibrationReducer
} from "./sideTriggerCalibrationReducer";
import {
  createInitialCycleSegmenterState,
  updateCycleSegmenter
} from "./sideTriggerCycleSegmenter";
import type { CalibrationReducerState } from "./sideTriggerCalibrationTypes";
import type { CycleSegmenterState } from "./sideTriggerCycleTypes";
import { extractSideTriggerRawMetric } from "./sideTriggerRawMetric";
import type { SideTriggerHandGeometrySignature } from "./sideTriggerRawMetric";
import { reduceSideTriggerRawMetric } from "./sideTriggerRawMetricReducer";
import type {
  ControllerTelemetry,
  CycleEventTelemetry,
  ResetReason
} from "./sideTriggerTelemetryTypes";

export interface SideTriggerControllerUpdate {
  readonly detection: SideHandDetection | undefined;
  readonly tuning: SideTriggerTuning;
  readonly timestamp?: FrameTimestamp;
  readonly sliderInDefaultRange: boolean;
}

export interface SideTriggerControllerResult {
  readonly triggerFrame: TriggerInputFrame | undefined;
  readonly telemetry: SideTriggerTelemetry;
  readonly controllerTelemetry: ControllerTelemetry;
  readonly cycleEvent?: CycleEventTelemetry;
}

export interface SideTriggerControllerSnapshot {
  readonly armed: boolean;
  readonly cycleState: CycleSegmenterState;
  readonly calibrationState: CalibrationReducerState;
  readonly baselineWindowReady: boolean;
  readonly lastAcceptedCycleAtMs?: number;
}

export interface SideTriggerController {
  update(update: SideTriggerControllerUpdate): SideTriggerControllerResult;
  reset(): void;
  getSnapshot(): SideTriggerControllerSnapshot;
}

const geometryJumpDetected = (
  ema: SideTriggerHandGeometrySignature,
  current: SideTriggerHandGeometrySignature
): boolean => {
  const ratios = [
    Math.abs(current.wristToIndexMcp - ema.wristToIndexMcp) /
      Math.max(ema.wristToIndexMcp, 0.001),
    Math.abs(current.wristToMiddleMcp - ema.wristToMiddleMcp) /
      Math.max(ema.wristToMiddleMcp, 0.001),
    Math.abs(current.indexMcpToPinkyMcp - ema.indexMcpToPinkyMcp) /
      Math.max(ema.indexMcpToPinkyMcp, 0.001)
  ];
  return Math.max(...ratios) > CTRL_GEOMETRY_JUMP_RATIO;
};

const updateGeometryEma = (
  ema: SideTriggerHandGeometrySignature | undefined,
  current: SideTriggerHandGeometrySignature
): SideTriggerHandGeometrySignature => {
  if (ema === undefined) return current;
  const a = CTRL_GEOMETRY_EMA_ALPHA;
  return {
    wristToIndexMcp: (1 - a) * ema.wristToIndexMcp + a * current.wristToIndexMcp,
    wristToMiddleMcp: (1 - a) * ema.wristToMiddleMcp + a * current.wristToMiddleMcp,
    indexMcpToPinkyMcp:
      (1 - a) * ema.indexMcpToPinkyMcp + a * current.indexMcpToPinkyMcp
  };
};

export const createSideTriggerController = (): SideTriggerController => {
  const inner: SideTriggerMapper = createSideTriggerMapper();
  let cycleState: CycleSegmenterState = createInitialCycleSegmenterState();
  let calibrationState: CalibrationReducerState = createInitialCalibrationState();
  let armed = false;
  let lastSourceKey: string | undefined;
  let lastObservedHandTimestampMs: number | undefined;
  let geometryEma: SideTriggerHandGeometrySignature | undefined;
  let manualOverridePrev = false;
  let lastAcceptedCycleAtMs: number | undefined;
  let lastRejectedCycleReason:
    | NonNullable<ControllerTelemetry["lastRejectedCycleReason"]>
    | undefined;

  const resetAll = (
    resetReason: ResetReason,
    sliderInDefaultRange: boolean
  ): void => {
    cycleState = createInitialCycleSegmenterState();
    const { state: nextCal } = updateCalibrationReducer(calibrationState, {
      resetSignal: resetReason,
      sliderInDefaultRange
    });
    calibrationState = nextCal;
    armed = false;
    geometryEma = undefined;
    lastObservedHandTimestampMs = undefined;
    lastAcceptedCycleAtMs = undefined;
    lastRejectedCycleReason = undefined;
    inner.reset();
  };

  return {
    // eslint-disable-next-line sonarjs/cognitive-complexity
    update(update) {
      const timestampMs =
        update.detection?.timestamp.frameTimestampMs ??
        update.timestamp?.frameTimestampMs ??
        0;
      const rawLegacy = extractSideTriggerRawMetric(update.detection, {
        timestampMs
      });
      const raw = reduceSideTriggerRawMetric(rawLegacy);

      // Detect reset reason
      let resetReason: ResetReason | undefined;
      const currentSourceKey = rawLegacy.sourceKey;
      if (
        currentSourceKey !== undefined &&
        lastSourceKey !== undefined &&
        currentSourceKey !== lastSourceKey
      ) {
        resetReason = "sourceChanged";
      } else if (
        raw.kind === "usable" &&
        geometryEma !== undefined &&
        geometryJumpDetected(geometryEma, raw.geometrySignature)
      ) {
        resetReason = "geometryJump";
      } else if (
        lastObservedHandTimestampMs !== undefined &&
        timestampMs - lastObservedHandTimestampMs >=
          CTRL_HAND_LOSS_THRESHOLD_MS &&
        raw.kind === "unusable"
      ) {
        resetReason = "handLoss";
      } else if (!update.sliderInDefaultRange && !manualOverridePrev) {
        resetReason = "manualOverrideEntered";
      }

      if (currentSourceKey !== undefined) lastSourceKey = currentSourceKey;
      if (raw.kind === "usable") {
        lastObservedHandTimestampMs = timestampMs;
        geometryEma = updateGeometryEma(geometryEma, raw.geometrySignature);
      }
      manualOverridePrev = !update.sliderInDefaultRange;

      const frameTimestamp = update.detection?.timestamp ?? update.timestamp;

      if (resetReason !== undefined) {
        resetAll(resetReason, update.sliderInDefaultRange);
        // Inner reset returns a minimal trigger frame; skip FSM eval
        const innerResult = inner.update({
          detection: undefined,
          calibration: {
            openPose: { normalizedThumbDistance: calibrationState.open },
            pulledPose: { normalizedThumbDistance: calibrationState.pulled }
          },
          tuning: update.tuning,
          ...(frameTimestamp !== undefined ? { timestamp: frameTimestamp } : {})
        });
        const ctrlTelemetry: ControllerTelemetry = {
          timestampMs,
          rawMetricKind: raw.kind,
          ...(raw.kind === "usable" ? { rawValue: raw.value } : {}),
          ...(raw.kind === "unusable" ? { rawUnusableReason: raw.reason } : {}),
          controllerArmed: false,
          justArmed: false,
          baselineWindowReady: false,
          cyclePhase: "open",
          calibrationStatus: calibrationState.status,
          calibrationSnapshot: {
            pulled: calibrationState.pulled,
            open: calibrationState.open
          },
          pullEvidenceScalar: 0,
          fsmPhase: "SideTriggerNoHand",
          triggerEdge: "none",
          triggerAvailability: "unavailable",
          dwellFrameCounts: innerResult.telemetry.dwellFrameCounts,
          resetReason
        };
        return {
          triggerFrame: innerResult.triggerFrame,
          telemetry: innerResult.telemetry,
          controllerTelemetry: ctrlTelemetry
        };
      }

      const cycle = updateCycleSegmenter(cycleState, raw);
      cycleState = cycle.state;

      const calInput: Parameters<typeof updateCalibrationReducer>[1] = {
        sliderInDefaultRange: update.sliderInDefaultRange,
        ...(cycle.result.confirmedCycleEvent !== undefined
          ? { confirmedCycleEvent: cycle.result.confirmedCycleEvent }
          : {}),
        ...(cycle.result.stableOpenObservation !== undefined
          ? { stableOpenObservation: cycle.result.stableOpenObservation }
          : {})
      };
      const cal = updateCalibrationReducer(calibrationState, calInput);
      calibrationState = cal.state;

      let justArmed = false;
      if (cal.result.acceptedCycleEvent && !armed) {
        armed = true;
        justArmed = true;
      }
      if (cal.result.acceptedCycleEvent) {
        lastAcceptedCycleAtMs = cal.result.acceptedCycleEvent.timestampMs;
      }
      if (cal.result.rejectedCycleEvent) {
        lastRejectedCycleReason = cal.result.rejectedCycleEvent.reason;
      }

      // Use fresh calibration for inner FSM; commit gating is applied after dwell
      // accounting so unarmed frames still build pull timing state.
      const commitArmed = armed && !justArmed;
      const innerResult = inner.update({
        detection: update.detection,
        calibration: {
          openPose: { normalizedThumbDistance: calibrationState.open },
          pulledPose: { normalizedThumbDistance: calibrationState.pulled }
        },
        tuning: update.tuning,
        commitArmed,
        ...(update.timestamp !== undefined ? { timestamp: update.timestamp } : {})
      });

      let cycleEvent: CycleEventTelemetry | undefined;
      if (cal.result.acceptedCycleEvent) {
        const ev = cal.result.acceptedCycleEvent;
        cycleEvent = {
          kind: "accepted",
          timestampMs: ev.timestampMs,
          pulledMedian: ev.pulledMedian,
          openPreMedian: ev.openPreMedian,
          openPostMedian: ev.openPostMedian,
          durationMs: ev.durationMs
        };
      } else if (cal.result.rejectedCycleEvent) {
        cycleEvent = {
          kind: "rejected",
          timestampMs: timestampMs,
          reason: cal.result.rejectedCycleEvent.reason,
          cycleDigest: cal.result.rejectedCycleEvent.cycleDigest
        };
      }

      const ctrlTelemetry: ControllerTelemetry = {
        timestampMs,
        rawMetricKind: raw.kind,
        ...(raw.kind === "usable" ? { rawValue: raw.value } : {}),
        ...(raw.kind === "unusable" ? { rawUnusableReason: raw.reason } : {}),
        controllerArmed: armed,
        justArmed,
        baselineWindowReady: cycleState.baselineWindowReady,
        cyclePhase: cycle.result.cyclePhase,
        calibrationStatus: cal.result.status,
        calibrationSnapshot: {
          pulled: cal.result.pulled,
          open: cal.result.open
        },
        ...(lastAcceptedCycleAtMs !== undefined ? { lastAcceptedCycleAtMs } : {}),
        ...(lastRejectedCycleReason !== undefined
          ? { lastRejectedCycleReason }
          : {}),
        pullEvidenceScalar: innerResult.telemetry.pullEvidenceScalar,
        fsmPhase: innerResult.telemetry.phase,
        triggerEdge: commitArmed ? innerResult.telemetry.edge : "none",
        triggerAvailability: innerResult.telemetry.triggerAvailability,
        dwellFrameCounts: innerResult.telemetry.dwellFrameCounts
      };

      // If not commit-armed, suppress edge in the trigger frame too.
      const triggerFrame =
        !commitArmed && innerResult.triggerFrame !== undefined
          ? { ...innerResult.triggerFrame, triggerEdge: "none" as const }
          : innerResult.triggerFrame;

      return {
        triggerFrame,
        telemetry: {
          ...innerResult.telemetry,
          calibrationStatus: sideTriggerCalibrationStatusFor({
            openPose: { normalizedThumbDistance: calibrationState.open },
            pulledPose: { normalizedThumbDistance: calibrationState.pulled }
          })
        },
        controllerTelemetry: ctrlTelemetry,
        ...(cycleEvent !== undefined ? { cycleEvent } : {})
      };
    },
    reset() {
      cycleState = createInitialCycleSegmenterState();
      calibrationState = createInitialCalibrationState();
      armed = false;
      lastSourceKey = undefined;
      lastObservedHandTimestampMs = undefined;
      geometryEma = undefined;
      manualOverridePrev = false;
      lastAcceptedCycleAtMs = undefined;
      lastRejectedCycleReason = undefined;
      inner.reset();
    },
    getSnapshot() {
      return {
        armed,
        cycleState,
        calibrationState,
        baselineWindowReady: cycleState.baselineWindowReady,
        ...(lastAcceptedCycleAtMs !== undefined
          ? { lastAcceptedCycleAtMs }
          : {})
      };
    }
  };
};
