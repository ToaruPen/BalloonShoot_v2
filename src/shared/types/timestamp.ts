/**
 * Identifies how `frameTimestampMs` was derived.
 * Fusion confidence is lower for degraded sources.
 */
export type TimestampSource =
  | "requestVideoFrameCallbackCaptureTime"
  | "requestVideoFrameCallbackExpectedDisplayTime"
  | "performanceNowAtCallback";

/**
 * Timestamp metadata attached to every lane frame.
 * Pairing and diagnostics share this vocabulary.
 */
export interface FrameTimestamp {
  /** Monotonic timestamp used for fusion (ms). */
  readonly frameTimestampMs: number;
  /** Source used to derive `frameTimestampMs`. */
  readonly timestampSource: TimestampSource;
  /** Browser frame counter from `requestVideoFrameCallback`, when available. */
  readonly presentedFrames: number;
  /** `performance.now()` at callback receipt (ms). */
  readonly receivedAtPerformanceMs: number;
}
