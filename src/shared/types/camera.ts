/**
 * Identifies which physical role a camera lane serves.
 * Logs, telemetry, and errors use this to identify the failing role.
 */
export type CameraLaneRole = "frontAim" | "sideTrigger";

export type TimestampSource =
  | "requestVideoFrameCallbackCaptureTime"
  | "requestVideoFrameCallbackExpectedDisplayTime"
  | "performanceNowAtCallback";

export interface FrameTimestamp {
  readonly frameTimestampMs: number;
  readonly timestampSource: TimestampSource;
  readonly presentedFrames: number | undefined;
  readonly receivedAtPerformanceMs: number;
}

export type LaneHealthStatus =
  | "notStarted"
  | "waitingForPermission"
  | "waitingForDeviceSelection"
  | "capturing"
  | "tracking"
  | "stalled"
  | "captureLost"
  | "failed";
