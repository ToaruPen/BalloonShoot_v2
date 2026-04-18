import { createDevicePinnedStream } from "../features/camera/createDevicePinnedStream";
import type { DevicePinnedStream } from "../features/camera/createDevicePinnedStream";
import { createFrameTimestamp } from "../features/camera/frameTimestamp";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTracker
} from "../features/hand-tracking/createMediaPipeHandTracker";
import { drawGameFrame } from "../features/rendering/drawGameFrame";
import { createFrontAimMapper } from "../features/front-aim";
import { gameConfig } from "../shared/config/gameConfig";
import type { FrameTimestamp } from "../shared/types/camera";
import type {
  FrontHandDetection,
  HandDetection
} from "../shared/types/hand";

interface FrameTimingLike {
  readonly captureTime?: number;
  readonly expectedDisplayTime?: number;
  readonly presentedFrames?: number;
}

interface FrontAimGameRuntimeDeps {
  readonly createDevicePinnedStream?: (
    deviceId: string
  ) => Promise<DevicePinnedStream>;
  readonly createMediaPipeHandTracker?: typeof createMediaPipeHandTracker;
  readonly createImageBitmap?: (source: HTMLVideoElement) => Promise<ImageBitmap>;
  readonly drawGameFrame?: typeof drawGameFrame;
}

interface FrontAimGameRuntimeOptions extends FrontAimGameRuntimeDeps {
  readonly deviceId: string;
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
}

interface FrontAimGameRuntime {
  start(): void;
  destroy(): void;
}

const getFilterConfig = () => ({
  minCutoff: gameConfig.input.handFilterMinCutoff,
  beta: gameConfig.input.handFilterBeta,
  dCutoff: gameConfig.input.handFilterDCutoff
});

const handPresenceConfidenceFor = (detection: HandDetection): number => {
  const scores = detection.rawFrame.handedness?.map((hand) => hand.score) ?? [];

  return scores.length === 0 ? 1 : Math.max(...scores);
};

const toFrontDetection = (
  detection: HandDetection,
  deviceId: string,
  streamId: string,
  timestamp: FrameTimestamp
): FrontHandDetection => ({
  laneRole: "frontAim",
  deviceId,
  streamId,
  timestamp,
  rawFrame: detection.rawFrame,
  filteredFrame: detection.filteredFrame,
  handPresenceConfidence: handPresenceConfidenceFor(detection),
  trackingQuality: "good"
});

const readyStateForCurrentData = (): number =>
  (globalThis as { HTMLMediaElement?: { HAVE_CURRENT_DATA?: number } })
    .HTMLMediaElement?.HAVE_CURRENT_DATA ?? 2;

const videoReadyForBitmap = (video: HTMLVideoElement): boolean =>
  video.readyState >= readyStateForCurrentData() &&
  video.videoWidth > 0 &&
  video.videoHeight > 0;

const positiveDimension = (value: number): number | undefined =>
  value > 0 ? value : undefined;

const syncCanvasSize = (canvas: HTMLCanvasElement): void => {
  const width =
    positiveDimension(canvas.clientWidth) ?? positiveDimension(canvas.width) ?? 1;
  const height =
    positiveDimension(canvas.clientHeight) ??
    positiveDimension(canvas.height) ??
    1;

  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
};

const viewportSizeFor = (
  canvas: HTMLCanvasElement
): { width: number; height: number } => ({
  width: positiveDimension(canvas.width) ?? 1,
  height: positiveDimension(canvas.height) ?? 1
});

const defaultCreateImageBitmap = (
  source: HTMLVideoElement
): Promise<ImageBitmap> => createImageBitmap(source);

export const createFrontAimGameRuntime = ({
  deviceId,
  video,
  canvas,
  createDevicePinnedStream: openStream = createDevicePinnedStream,
  createMediaPipeHandTracker: createTracker = createMediaPipeHandTracker,
  createImageBitmap: createBitmap = defaultCreateImageBitmap,
  drawGameFrame: renderFrame = drawGameFrame
}: FrontAimGameRuntimeOptions): FrontAimGameRuntime => {
  const mapper = createFrontAimMapper();
  const context = canvas.getContext("2d");
  let stopped = false;
  let stream: DevicePinnedStream | undefined;
  let tracker: MediaPipeHandTracker | undefined;
  let callbackId: number | undefined;
  let timeoutId: number | undefined;
  let startPromise: Promise<void> | undefined;

  const isStopped = (): boolean => stopped;

  const stopStream = (): void => {
    stream?.stop();
    stream = undefined;
  };

  const cancelScheduledFrame = (): void => {
    if (
      callbackId !== undefined &&
      typeof video.cancelVideoFrameCallback === "function"
    ) {
      video.cancelVideoFrameCallback(callbackId);
      callbackId = undefined;
    }

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const schedule = (): void => {
    if (isStopped()) {
      return;
    }

    if (typeof video.requestVideoFrameCallback === "function") {
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        void processFrame(metadata);
      });
      return;
    }

    timeoutId = window.setTimeout(() => {
      void processFrame({ expectedDisplayTime: performance.now() });
    }, 66);
  };

  const drawCrosshair = (
    detection: HandDetection | undefined,
    timestamp: FrameTimestamp
  ): void => {
    if (context === null || stream === undefined) {
      return;
    }

    syncCanvasSize(canvas);
    const frontDetection =
      detection === undefined
        ? undefined
        : toFrontDetection(detection, deviceId, stream.stream.id, timestamp);
    const result = mapper.update({
      detection: frontDetection,
      viewportSize: viewportSizeFor(canvas),
      projectionOptions: { objectFit: "cover", mirrorX: true }
    });
    const crosshair =
      result.aimFrame?.aimAvailability === "available" ||
      result.aimFrame?.aimAvailability === "estimatedFromRecentFrame"
        ? result.aimFrame.aimPointViewport
        : undefined;

    renderFrame(context, { balloons: [], crosshair });
  };

  async function processFrame(metadata: FrameTimingLike): Promise<void> {
    if (isStopped()) {
      return;
    }

    if (tracker === undefined) {
      schedule();
      return;
    }

    const timestamp = createFrameTimestamp(metadata, performance.now());

    if (!videoReadyForBitmap(video)) {
      schedule();
      return;
    }

    const bitmap = await createBitmap(video);

    if (isStopped()) {
      bitmap.close();
      return;
    }

    let detection: HandDetection | undefined;

    try {
      detection = await tracker.detect(bitmap, timestamp.frameTimestampMs);
    } finally {
      bitmap.close();
    }

    if (isStopped()) {
      return;
    }

    drawCrosshair(detection, timestamp);
    schedule();
  }

  const startAsync = async (): Promise<void> => {
    let openedStream: DevicePinnedStream | undefined;

    try {
      openedStream = await openStream(deviceId);
      stream = openedStream;

      if (isStopped()) {
        stopStream();
        return;
      }

      const openedTracker = await createTracker({ getFilterConfig });

      if (isStopped()) {
        stopStream();
        void openedTracker.cleanup();
        return;
      }

      tracker = openedTracker;
      video.srcObject = openedStream.stream;
      schedule();
    } catch (error: unknown) {
      if (stream === openedStream) {
        stopStream();
      }
      throw error;
    }
  };

  return {
    start() {
      startPromise ??= startAsync().catch((error: unknown) => {
        if (!isStopped()) {
          console.error("Front aim game runtime failed", error);
        }
      });
    },
    destroy() {
      stopped = true;
      cancelScheduledFrame();
      stopStream();
      void tracker?.cleanup();
      void startPromise;
    }
  };
};
