import type { FrameTimestamp } from "../../shared/types/timestamp";
import type { FrontHandDetection, SideHandDetection } from "../../shared/types/detection";
import type { CaptureLoop } from "../camera/captureLoop";
import type { LaneHandTracker } from "../hand-tracking/laneHandTracker";

/**
 * Per-lane tracking pipeline that bridges the capture loop to the
 * lane hand tracker. On each capture frame the pipeline grabs a
 * bitmap from the video element and schedules async detection.
 *
 * Only the latest detection is kept — earlier in-flight results
 * are discarded via a generation counter.
 */
export interface TrackingPipeline<T> {
  /** Latest detection result (undefined = no hand or not yet started). */
  getLatestDetection(): T | undefined;
  /** Whether a detection is currently in flight. */
  isProcessing(): boolean;
  /** Stop and clean up. */
  destroy(): void;
}

interface TrackingPipelineOptions<T> {
  readonly video: HTMLVideoElement;
  readonly captureLoop: CaptureLoop;
  readonly tracker: LaneHandTracker<T>;
  readonly deviceId: string;
  readonly streamId: string;
}

export const createTrackingPipeline = <T extends FrontHandDetection | SideHandDetection>(
  opts: TrackingPipelineOptions<T>
): TrackingPipeline<T> => {
  const { video, captureLoop, tracker, deviceId, streamId } = opts;

  let latestDetection: T | undefined;
  let processing = false;
  let generation = 0;
  let destroyed = false;

  const unsubscribe = captureLoop.onFrame((timestamp: FrameTimestamp) => {
    if (destroyed || processing) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    processing = true;
    generation += 1;
    const myGeneration = generation;

    // createImageBitmap is async but fast for video elements
    void createImageBitmap(video).then((bitmap) => {
      if (destroyed || myGeneration !== generation) {
        bitmap.close();
        processing = false;
        return;
      }

      return tracker.processFrame(bitmap, timestamp, deviceId, streamId).then(
        (detection) => {
          bitmap.close();
          if (!destroyed && myGeneration === generation) {
            latestDetection = detection;
          }
          processing = false;
        },
        () => {
          bitmap.close();
          processing = false;
        }
      );
    }).catch(() => {
      processing = false;
    });
  });

  return {
    getLatestDetection() {
      return latestDetection;
    },

    isProcessing() {
      return processing;
    },

    destroy() {
      destroyed = true;
      unsubscribe();
      latestDetection = undefined;
    }
  };
};
