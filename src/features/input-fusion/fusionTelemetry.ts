import type { TimestampSource } from "../../shared/types/camera";
import type {
  FusedGameInputFrame,
  FusionTelemetry
} from "../../shared/types/fusion";

interface FusionTelemetryDiagnostics {
  readonly maxPairDeltaMs: number;
  readonly maxFrameAgeMs: number;
  readonly frontBufferFrameCount: number;
  readonly sideBufferFrameCount: number;
  readonly shotEdgeConsumed: boolean;
}

const timestampSourceLabel = (source: TimestampSource | undefined): string => {
  switch (source) {
    case "requestVideoFrameCallbackCaptureTime":
      return "captureTime";
    case "requestVideoFrameCallbackExpectedDisplayTime":
      return "expectedDisplayTime";
    case "performanceNowAtCallback":
      return "callbackReceipt";
    case undefined:
      return "unavailable";
  }
};

export const createFusionTelemetry = (
  frame: FusedGameInputFrame,
  diagnostics: FusionTelemetryDiagnostics
): FusionTelemetry => {
  const hasPair =
    frame.fusionMode === "pairedFrontAndSide" &&
    frame.aim !== undefined &&
    frame.trigger !== undefined;
  const deltaText =
    frame.timeDeltaBetweenLanesMs === undefined
      ? "unavailable"
      : `${frame.timeDeltaBetweenLanesMs.toFixed(3)}ms`;

  return {
    mode: frame.fusionMode,
    timeDeltaBetweenLanesMs: frame.timeDeltaBetweenLanesMs,
    maxPairDeltaMs: diagnostics.maxPairDeltaMs,
    maxFrameAgeMs: diagnostics.maxFrameAgeMs,
    frontBufferFrameCount: diagnostics.frontBufferFrameCount,
    sideBufferFrameCount: diagnostics.sideBufferFrameCount,
    frontLatestAgeMs: frame.frontSource.frameAgeMs,
    sideLatestAgeMs: frame.sideSource.frameAgeMs,
    inputConfidence: frame.inputConfidence,
    shotFired: frame.shotFired,
    rejectReason: frame.fusionRejectReason,
    lastPairedFrontTimestampMs: hasPair
      ? frame.aim.timestamp.frameTimestampMs
      : undefined,
    lastPairedSideTimestampMs: hasPair
      ? frame.trigger.timestamp.frameTimestampMs
      : undefined,
    timestampSourceSummary: `front=${timestampSourceLabel(
      frame.frontSource.frameTimestamp?.timestampSource
    )} side=${timestampSourceLabel(
      frame.sideSource.frameTimestamp?.timestampSource
    )} delta=${deltaText}`,
    shotEdgeConsumed: diagnostics.shotEdgeConsumed
  };
};
