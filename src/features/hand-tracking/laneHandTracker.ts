import type { HandDetection } from "../../shared/types/hand";
import type { FrameTimestamp } from "../../shared/types/timestamp";
import type {
  FrontHandDetection,
  FrontTrackingQuality,
  SideHandDetection,
  SideViewQuality
} from "../../shared/types/detection";
import type { CameraLaneRole } from "../../shared/types/camera";

// ---------------------------------------------------------------------------
// Quality heuristics (placeholder — M4/M5 will refine these)
// ---------------------------------------------------------------------------

const classifyFrontTrackingQuality = (
  confidence: number
): FrontTrackingQuality => {
  if (confidence >= 0.7) return "good";
  if (confidence >= 0.3) return "uncertain";
  return "lost";
};

const classifySideViewQuality = (
  confidence: number
): SideViewQuality => {
  if (confidence >= 0.7) return "good";
  if (confidence >= 0.3) return "frontLike";
  return "lost";
};

// ---------------------------------------------------------------------------
// Lane hand tracker
// ---------------------------------------------------------------------------

export type LaneDetectionListener<T> = (detection: T | undefined) => void;

export interface LaneHandTracker<T> {
  readonly laneRole: CameraLaneRole;
  /** Process a video frame and produce a lane-typed detection. */
  processFrame(
    bitmap: ImageBitmap,
    timestamp: FrameTimestamp,
    deviceId: string,
    streamId: string
  ): Promise<T | undefined>;
  /** Subscribe to detection results. */
  onDetection(listener: LaneDetectionListener<T>): () => void;
  /** Clean up. */
  destroy(): void;
}

interface TrackerBackend {
  detect(
    bitmap: ImageBitmap,
    frameAtMs: number
  ): Promise<HandDetection | undefined>;
}

export const createFrontLaneTracker = (
  backend: TrackerBackend
): LaneHandTracker<FrontHandDetection> => {
  const listeners = new Set<LaneDetectionListener<FrontHandDetection>>();
  let destroyed = false;

  return {
    laneRole: "frontAim",

    async processFrame(
      bitmap: ImageBitmap,
      timestamp: FrameTimestamp,
      deviceId: string,
      streamId: string
    ): Promise<FrontHandDetection | undefined> {
      if (destroyed) return undefined;

      const detection = await backend.detect(bitmap, timestamp.frameTimestampMs);

      if (detection === undefined) {
        for (const fn of listeners) fn(undefined);
        return undefined;
      }

      // Use the first handedness score as confidence, or 1.0 if not available
      const confidence =
        detection.rawFrame.handedness?.[0]?.score ?? 1.0;

      const result: FrontHandDetection = {
        laneRole: "frontAim",
        deviceId,
        streamId,
        timestamp,
        rawFrame: detection.rawFrame,
        filteredFrame: detection.filteredFrame,
        handPresenceConfidence: confidence,
        trackingQuality: classifyFrontTrackingQuality(confidence)
      };

      for (const fn of listeners) fn(result);
      return result;
    },

    onDetection(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    destroy() {
      destroyed = true;
      listeners.clear();
    }
  };
};

export const createSideLaneTracker = (
  backend: TrackerBackend
): LaneHandTracker<SideHandDetection> => {
  const listeners = new Set<LaneDetectionListener<SideHandDetection>>();
  let destroyed = false;

  return {
    laneRole: "sideTrigger",

    async processFrame(
      bitmap: ImageBitmap,
      timestamp: FrameTimestamp,
      deviceId: string,
      streamId: string
    ): Promise<SideHandDetection | undefined> {
      if (destroyed) return undefined;

      const detection = await backend.detect(bitmap, timestamp.frameTimestampMs);

      if (detection === undefined) {
        for (const fn of listeners) fn(undefined);
        return undefined;
      }

      const confidence =
        detection.rawFrame.handedness?.[0]?.score ?? 1.0;

      const result: SideHandDetection = {
        laneRole: "sideTrigger",
        deviceId,
        streamId,
        timestamp,
        rawFrame: detection.rawFrame,
        filteredFrame: detection.filteredFrame,
        handPresenceConfidence: confidence,
        sideViewQuality: classifySideViewQuality(confidence)
      };

      for (const fn of listeners) fn(result);
      return result;
    },

    onDetection(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    destroy() {
      destroyed = true;
      listeners.clear();
    }
  };
};
