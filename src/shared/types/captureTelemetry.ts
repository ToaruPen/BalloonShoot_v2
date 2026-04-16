import type { CameraLaneRole } from "./camera";
import type { LaneHealthStatus } from "./lane";
import type { FrameTimestamp, TimestampSource } from "./timestamp";

/**
 * Per-lane capture telemetry consumed by the diagnostic workbench.
 * Carries enough context to diagnose camera feed health without
 * requiring hand-tracking or gameplay state.
 */
export interface CaptureTelemetry {
  /** Which physical role this lane serves. */
  readonly laneRole: CameraLaneRole;
  /** Current lane health. */
  readonly healthStatus: LaneHealthStatus;
  /** Human-readable device label (never raw deviceId). */
  readonly deviceLabel: string;
  /** Short hash of deviceId for diagnostics (first 8 chars). */
  readonly deviceIdHash: string;
  /** Video frame width in pixels. */
  readonly frameWidth: number;
  /** Video frame height in pixels. */
  readonly frameHeight: number;
  /** Latest timestamp metadata, or undefined before the first frame. */
  readonly latestTimestamp: FrameTimestamp | undefined;
  /** Which timestamp source is in use for this lane. */
  readonly timestampSource: TimestampSource | undefined;
  /** Total frames received since stream opened. */
  readonly presentedFrames: number;
  /** Age of the latest frame in ms (`performance.now() - receivedAtPerformanceMs`). */
  readonly latestFrameAgeMs: number | undefined;
  /** Whether the lane is stalled (no frame within the stall threshold). */
  readonly stalled: boolean;
}
