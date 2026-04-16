import type { CameraLaneRole } from "../../shared/types/camera";
import type { CaptureTelemetry } from "../../shared/types/captureTelemetry";
import type { FrameTimestamp } from "../../shared/types/timestamp";
import { gameConfig } from "../../shared/config/gameConfig";

// ---------------------------------------------------------------------------
// Timestamp production
// ---------------------------------------------------------------------------

const produceTimestamp = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameCallbackMetadata | undefined
): FrameTimestamp => {
  const receivedAtPerformanceMs = now;

  if (metadata !== undefined) {
    // Prefer captureTime (highest accuracy)
    if (metadata.captureTime !== undefined) {
      return {
        frameTimestampMs: metadata.captureTime,
        timestampSource: "requestVideoFrameCallbackCaptureTime",
        presentedFrames: metadata.presentedFrames,
        receivedAtPerformanceMs
      };
    }
    // Fall back to expectedDisplayTime
    return {
      frameTimestampMs: metadata.expectedDisplayTime,
      timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
      presentedFrames: metadata.presentedFrames,
      receivedAtPerformanceMs
    };
  }

  // Lowest confidence: performance.now() at callback time
  return {
    frameTimestampMs: receivedAtPerformanceMs,
    timestampSource: "performanceNowAtCallback",
    presentedFrames: 0,
    receivedAtPerformanceMs
  };
};

// ---------------------------------------------------------------------------
// Capture loop
// ---------------------------------------------------------------------------

export type CaptureFrameListener = (timestamp: FrameTimestamp) => void;

export interface CaptureLoop {
  /** Current capture telemetry snapshot. */
  getTelemetry(): CaptureTelemetry;
  /** Subscribe to each new frame timestamp. */
  onFrame(listener: CaptureFrameListener): () => void;
  /** Stop the capture loop and clean up. */
  destroy(): void;
}

export interface CaptureLoopOptions {
  readonly video: HTMLVideoElement;
  readonly laneRole: CameraLaneRole;
  readonly deviceId: string;
  readonly deviceLabel: string;
}

export const createCaptureLoop = (opts: CaptureLoopOptions): CaptureLoop => {
  const { video, laneRole, deviceId, deviceLabel } = opts;

  let latestTimestamp: FrameTimestamp | undefined;
  let totalPresentedFrames = 0;
  let destroyed = false;
  let rvfcHandle: number | undefined;

  const listeners = new Set<CaptureFrameListener>();

  // ------- rVFC loop -------

  const scheduleNext = (): void => {
    if (destroyed) return;

    rvfcHandle = video.requestVideoFrameCallback(
      (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
        if (destroyed) return;

        const ts = produceTimestamp(now, metadata);
        latestTimestamp = ts;
        totalPresentedFrames = metadata.presentedFrames;

        for (const fn of listeners) {
          fn(ts);
        }

        scheduleNext();
      }
    );
  };

  // ------- start -------

  scheduleNext();

  // ------- telemetry snapshot -------

  const getTelemetry = (): CaptureTelemetry => {
    const now = performance.now();
    const latestFrameAgeMs =
      latestTimestamp !== undefined
        ? now - latestTimestamp.receivedAtPerformanceMs
        : undefined;

    const stalled =
      latestFrameAgeMs !== undefined &&
      latestFrameAgeMs > gameConfig.camera.stallThresholdMs;

    let healthStatus: CaptureTelemetry["healthStatus"];
    if (destroyed) {
      healthStatus = "captureLost";
    } else if (latestTimestamp === undefined) {
      healthStatus = "notStarted";
    } else if (stalled) {
      healthStatus = "stalled";
    } else {
      healthStatus = "capturing";
    }

    return {
      laneRole,
      healthStatus,
      deviceLabel,
      deviceIdHash: deviceId.slice(0, 8),
      frameWidth: video.videoWidth,
      frameHeight: video.videoHeight,
      latestTimestamp,
      timestampSource: latestTimestamp?.timestampSource,
      presentedFrames: totalPresentedFrames,
      latestFrameAgeMs,
      stalled
    };
  };

  return {
    getTelemetry,

    onFrame(listener: CaptureFrameListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy() {
      destroyed = true;
      listeners.clear();

      if (rvfcHandle !== undefined) {
        video.cancelVideoFrameCallback(rvfcHandle);
      }
    }
  };
};
