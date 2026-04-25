import type { AimInputFrame } from "../../shared/types/aim";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "../../shared/types/camera";
import type {
  FusedGameInputFrame,
  FusionRejectReason,
  FusionSourceSummary,
  FusionTelemetry
} from "../../shared/types/fusion";
import type { TriggerInputFrame } from "../../shared/types/trigger";
import {
  TIMESTAMP_SOURCE_CONFIDENCE_FACTOR,
  type FusionTuning
} from "./fusionConfig";
import { createFusionFrameBuffers } from "./fusionFrameBuffers";
import {
  type FusionFramePair,
  pairAimWithSideFrames,
  pairTriggerWithFrontFrames
} from "./pairFusionFrames";
import { createShotEdgeConsumption } from "./shotEdgeConsumption";
import { createFusionTelemetry } from "./fusionTelemetry";

interface InputFusionMapperContext {
  readonly frontLaneHealth: LaneHealthStatus;
  readonly sideLaneHealth: LaneHealthStatus;
  readonly tuning: FusionTuning;
}

interface FusionMapperResult {
  readonly fusedFrame: FusedGameInputFrame;
  readonly telemetry: FusionTelemetry;
}

export interface InputFusionMapper {
  updateAimFrame(
    frame: AimInputFrame,
    context: InputFusionMapperContext
  ): FusionMapperResult;
  updateTriggerFrame(
    frame: TriggerInputFrame,
    context: InputFusionMapperContext
  ): FusionMapperResult;
  updateAimUnavailable(
    timestamp: FrameTimestamp,
    context: InputFusionMapperContext
  ): FusionMapperResult;
  updateTriggerUnavailable(
    timestamp: FrameTimestamp,
    context: InputFusionMapperContext
  ): FusionMapperResult;
  resetFrontLane(): void;
  resetSideLane(): void;
  resetAll(): void;
}

const frameAgeMs = (
  fusionTimestampMs: number,
  frameTimestampMs: number | undefined
): number | undefined =>
  frameTimestampMs === undefined
    ? undefined
    : Math.max(0, fusionTimestampMs - frameTimestampMs);

const latestAimFrame = (
  frames: readonly AimInputFrame[]
): AimInputFrame | undefined => frames.at(-1);

const latestTriggerFrame = (
  frames: readonly TriggerInputFrame[]
): TriggerInputFrame | undefined => frames.at(-1);

const isFailed = (health: LaneHealthStatus): boolean =>
  health === "failed" || health === "stalled" || health === "captureLost";

const isFresh = (
  fusionTimestampMs: number,
  frame: AimInputFrame | TriggerInputFrame | undefined,
  maxFrameAgeMs: number
): boolean => {
  if (frame === undefined) {
    return false;
  }

  return (
    (frameAgeMs(fusionTimestampMs, frame.timestamp.frameTimestampMs) ??
      Number.POSITIVE_INFINITY) <= maxFrameAgeMs
  );
};

const rejectReasonFor = (
  frontFrame: AimInputFrame | undefined,
  sideFrame: TriggerInputFrame | undefined,
  pair: FusionFramePair | undefined,
  fusionTimestampMs: number,
  context: InputFusionMapperContext
): FusionRejectReason => {
  if (isFailed(context.frontLaneHealth) || isFailed(context.sideLaneHealth)) {
    return "laneFailed";
  }

  if (frontFrame === undefined) {
    return "frontMissing";
  }

  if (sideFrame === undefined) {
    return "sideMissing";
  }

  if (frontFrame.aimAvailability === "unavailable") {
    return "frontMissing";
  }

  if (sideFrame.triggerAvailability === "unavailable") {
    return "sideMissing";
  }

  if (!isFresh(fusionTimestampMs, frontFrame, context.tuning.maxFrameAgeMs)) {
    return "frontStale";
  }

  if (!isFresh(fusionTimestampMs, sideFrame, context.tuning.maxFrameAgeMs)) {
    return "sideStale";
  }

  if (pair === undefined) {
    return "timestampGapTooLarge";
  }

  return "none";
};

const frontConfidence = (frame: AimInputFrame | undefined): number =>
  frame?.frontTrackingConfidence ?? 0;

const sideConfidence = (frame: TriggerInputFrame | undefined): number =>
  frame?.shotCandidateConfidence ?? 0;

const timestampSourceConfidenceFactor = (
  frame: AimInputFrame | TriggerInputFrame | undefined
): number =>
  frame === undefined
    ? 0
    : TIMESTAMP_SOURCE_CONFIDENCE_FACTOR[frame.timestamp.timestampSource];

const confidenceFor = (
  mode: FusedGameInputFrame["fusionMode"],
  frontFrame: AimInputFrame | undefined,
  sideFrame: TriggerInputFrame | undefined
): number => {
  switch (mode) {
    case "pairedFrontAndSide":
      return (
        Math.min(frontConfidence(frontFrame), sideConfidence(sideFrame)) *
        Math.min(
          timestampSourceConfidenceFactor(frontFrame),
          timestampSourceConfidenceFactor(sideFrame)
        )
      );
    case "frontOnlyAim":
      return (
        frontConfidence(frontFrame) *
        0.5 *
        timestampSourceConfidenceFactor(frontFrame)
      );
    case "sideOnlyTriggerDiagnostic":
      return (
        sideConfidence(sideFrame) *
        0.5 *
        timestampSourceConfidenceFactor(sideFrame)
      );
    case "noUsableInput":
      return 0;
  }
};

const isFrontUsable = (
  frame: AimInputFrame | undefined,
  fusionTimestampMs: number,
  context: InputFusionMapperContext
): boolean =>
  frame !== undefined &&
  frame.aimAvailability !== "unavailable" &&
  !isFailed(context.frontLaneHealth) &&
  isFresh(fusionTimestampMs, frame, context.tuning.maxFrameAgeMs);

const isSideUsable = (
  frame: TriggerInputFrame | undefined,
  fusionTimestampMs: number,
  context: InputFusionMapperContext
): frame is TriggerInputFrame =>
  frame !== undefined &&
  frame.triggerAvailability !== "unavailable" &&
  !isFailed(context.sideLaneHealth) &&
  isFresh(fusionTimestampMs, frame, context.tuning.maxFrameAgeMs);

const isFrontPairCandidateUsable = (
  frame: AimInputFrame | TriggerInputFrame,
  context: InputFusionMapperContext
): boolean =>
  "aimAvailability" in frame &&
  frame.aimAvailability !== "unavailable" &&
  !isFailed(context.frontLaneHealth);

const isSidePairCandidateUsable = (
  frame: AimInputFrame | TriggerInputFrame,
  context: InputFusionMapperContext
): boolean =>
  "triggerAvailability" in frame &&
  frame.triggerAvailability !== "unavailable" &&
  !isFailed(context.sideLaneHealth);

const fusionModeFor = (
  pair: FusionFramePair | undefined,
  frontUsable: boolean,
  sideUsable: boolean
): FusedGameInputFrame["fusionMode"] => {
  if (pair !== undefined && frontUsable && sideUsable) {
    return "pairedFrontAndSide";
  }

  if (frontUsable) {
    return "frontOnlyAim";
  }

  if (sideUsable) {
    return "sideOnlyTriggerDiagnostic";
  }

  return "noUsableInput";
};

const frontSourceFor = (
  frame: AimInputFrame | undefined,
  fusionTimestampMs: number,
  laneHealth: LaneHealthStatus,
  rejectReason: FusionRejectReason
): FusionSourceSummary => ({
  laneRole: "frontAim",
  frameTimestamp: frame?.timestamp,
  frameAgeMs: frameAgeMs(fusionTimestampMs, frame?.timestamp.frameTimestampMs),
  laneHealth,
  availability: frame?.aimAvailability ?? "unavailable",
  rejectReason:
    rejectReason === "frontMissing" ||
    rejectReason === "frontStale" ||
    (rejectReason === "laneFailed" && isFailed(laneHealth))
      ? rejectReason
      : "none"
});

const sideSourceFor = (
  frame: TriggerInputFrame | undefined,
  fusionTimestampMs: number,
  laneHealth: LaneHealthStatus,
  rejectReason: FusionRejectReason
): FusionSourceSummary => ({
  laneRole: "sideTrigger",
  frameTimestamp: frame?.timestamp,
  frameAgeMs: frameAgeMs(fusionTimestampMs, frame?.timestamp.frameTimestampMs),
  laneHealth,
  availability: frame?.triggerAvailability ?? "unavailable",
  rejectReason:
    rejectReason === "sideMissing" ||
    rejectReason === "sideStale" ||
    (rejectReason === "laneFailed" && isFailed(laneHealth))
      ? rejectReason
      : "none"
});

export const createInputFusionMapper = (): InputFusionMapper => {
  const buffers = createFusionFrameBuffers();
  const shotConsumption = createShotEdgeConsumption();

  const buildResult = (
    fusionTimestampMs: number,
    pair: FusionFramePair | undefined,
    fallbackFrontFrame: AimInputFrame | undefined,
    fallbackSideFrame: TriggerInputFrame | undefined,
    context: InputFusionMapperContext
  ): FusionMapperResult => {
    const frontFrame = pair?.frontFrame ?? fallbackFrontFrame;
    const sideFrame = pair?.sideFrame ?? fallbackSideFrame;
    const rejectReason = rejectReasonFor(
      frontFrame,
      sideFrame,
      pair,
      fusionTimestampMs,
      context
    );
    const frontUsable = isFrontUsable(frontFrame, fusionTimestampMs, context);
    const sideUsable = isSideUsable(sideFrame, fusionTimestampMs, context);
    const fusionMode = fusionModeFor(pair, frontUsable, sideUsable);
    const shotFired =
      sideUsable && frontUsable
        ? shotConsumption.consumeIfShotCommit(sideFrame)
        : false;
    const fusedFrame: FusedGameInputFrame = {
      fusionTimestampMs,
      fusionMode,
      timeDeltaBetweenLanesMs:
        fusionMode === "pairedFrontAndSide"
          ? pair?.timeDeltaBetweenLanesMs
          : undefined,
      aim: frontUsable ? frontFrame : undefined,
      trigger:
        (fusionMode === "pairedFrontAndSide" ||
          fusionMode === "sideOnlyTriggerDiagnostic") &&
        sideUsable
          ? sideFrame
          : undefined,
      shotFired,
      inputConfidence: confidenceFor(fusionMode, frontFrame, sideFrame),
      frontSource: frontSourceFor(
        frontFrame,
        fusionTimestampMs,
        context.frontLaneHealth,
        rejectReason
      ),
      sideSource: sideSourceFor(
        sideFrame,
        fusionTimestampMs,
        context.sideLaneHealth,
        rejectReason
      ),
      fusionRejectReason: rejectReason
    };

    return {
      fusedFrame,
      telemetry: createFusionTelemetry(fusedFrame, {
        maxPairDeltaMs: context.tuning.maxPairDeltaMs,
        maxFrameAgeMs: context.tuning.maxFrameAgeMs,
        frontBufferFrameCount: buffers.frontFrames.length,
        sideBufferFrameCount: buffers.sideFrames.length,
        shotEdgeConsumed: shotFired
      })
    };
  };

  return {
    updateAimFrame(frame, context) {
      buffers.addFrontFrame(frame, context.tuning.recentFrameRetentionWindowMs);
      const pair = pairAimWithSideFrames(frame, buffers.sideFrames, {
        maxPairDeltaMs: context.tuning.maxPairDeltaMs,
        isCandidateUsable: (candidate) =>
          isSidePairCandidateUsable(candidate, context)
      });

      return buildResult(
        frame.timestamp.frameTimestampMs,
        pair,
        frame,
        latestTriggerFrame(buffers.sideFrames),
        context
      );
    },
    updateTriggerFrame(frame, context) {
      buffers.addSideFrame(frame, context.tuning.recentFrameRetentionWindowMs);
      const pair = pairTriggerWithFrontFrames(frame, buffers.frontFrames, {
        maxPairDeltaMs: context.tuning.maxPairDeltaMs,
        isCandidateUsable: (candidate) =>
          isFrontPairCandidateUsable(candidate, context)
      });

      return buildResult(
        frame.timestamp.frameTimestampMs,
        pair,
        latestAimFrame(buffers.frontFrames),
        frame,
        context
      );
    },
    updateAimUnavailable(timestamp, context) {
      buffers.clearFront();

      return buildResult(
        timestamp.frameTimestampMs,
        undefined,
        undefined,
        latestTriggerFrame(buffers.sideFrames),
        context
      );
    },
    updateTriggerUnavailable(timestamp, context) {
      buffers.clearSide();
      shotConsumption.reset();

      return buildResult(
        timestamp.frameTimestampMs,
        undefined,
        latestAimFrame(buffers.frontFrames),
        undefined,
        context
      );
    },
    resetFrontLane() {
      buffers.clearFront();
    },
    resetSideLane() {
      buffers.clearSide();
      shotConsumption.reset();
    },
    resetAll() {
      buffers.clearAll();
      shotConsumption.reset();
    }
  };
};
