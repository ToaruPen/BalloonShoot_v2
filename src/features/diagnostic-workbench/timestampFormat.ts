import type {
  FrameTimestamp,
  TimestampSource
} from "../../shared/types/camera";

export const timestampSourceLabel = (source: TimestampSource): string => {
  switch (source) {
    case "requestVideoFrameCallbackCaptureTime":
      return "captureTime";
    case "requestVideoFrameCallbackExpectedDisplayTime":
      return "expectedDisplayTime";
    case "performanceNowAtCallback":
      return "performance.now";
  }
};

export const formatFrameTimestamp = (
  timestamp: FrameTimestamp | undefined
): string => {
  if (timestamp === undefined) {
    return "timestamp: 未取得";
  }

  const presentedFrames =
    timestamp.presentedFrames === undefined
      ? "presentedFrames: unavailable"
      : `presentedFrames: ${String(timestamp.presentedFrames)}`;

  return [
    `${timestamp.frameTimestampMs.toFixed(1)} ms`,
    timestampSourceLabel(timestamp.timestampSource),
    presentedFrames
  ].join(" / ");
};
