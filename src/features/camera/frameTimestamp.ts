import type {
  FrameTimestamp,
  TimestampSource
} from "../../shared/types/camera";

interface FrameTimingMetadata {
  readonly captureTime?: number;
  readonly expectedDisplayTime?: number;
  readonly presentedFrames?: number;
}

const isUsableTimestamp = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

const selectTimestamp = (
  metadata: FrameTimingMetadata,
  receivedAtPerformanceMs: number
): { frameTimestampMs: number; timestampSource: TimestampSource } => {
  if (isUsableTimestamp(metadata.captureTime)) {
    return {
      frameTimestampMs: metadata.captureTime,
      timestampSource: "requestVideoFrameCallbackCaptureTime"
    };
  }

  if (isUsableTimestamp(metadata.expectedDisplayTime)) {
    return {
      frameTimestampMs: metadata.expectedDisplayTime,
      timestampSource: "requestVideoFrameCallbackExpectedDisplayTime"
    };
  }

  return {
    frameTimestampMs: receivedAtPerformanceMs,
    timestampSource: "performanceNowAtCallback"
  };
};

export const createFrameTimestamp = (
  metadata: FrameTimingMetadata,
  receivedAtPerformanceMs: number
): FrameTimestamp => {
  const selected = selectTimestamp(metadata, receivedAtPerformanceMs);

  return {
    ...selected,
    presentedFrames: metadata.presentedFrames,
    receivedAtPerformanceMs
  };
};
