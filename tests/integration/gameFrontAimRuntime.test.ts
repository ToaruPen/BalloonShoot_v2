import { describe, expect, it, vi } from "vitest";
import { createFrontAimGameRuntime } from "../../src/app/frontAimGameRuntime";
import type { DevicePinnedStream } from "../../src/features/camera/createDevicePinnedStream";
import type { MediaPipeHandTracker } from "../../src/features/hand-tracking/createMediaPipeHandTracker";
import type { HandDetection, HandFrame } from "../../src/shared/types/hand";

interface FakeVideo {
  srcObject: MediaStream | undefined;
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  clientWidth: number;
  clientHeight: number;
  requestVideoFrameCallback: ReturnType<typeof vi.fn>;
  cancelVideoFrameCallback: ReturnType<typeof vi.fn>;
  fireFrame(): void;
}

const createFrame = (): HandFrame => ({
  width: 640,
  height: 480,
  handedness: [{ score: 0.92, index: 0, categoryName: "Right", displayName: "Right" }],
  landmarks: {
    wrist: { x: 0.5, y: 0.9, z: 0 },
    indexMcp: { x: 0.5, y: 0.6, z: 0 },
    indexTip: { x: 0.25, y: 0.5, z: 0 },
    thumbIp: { x: 0.4, y: 0.7, z: 0 },
    thumbTip: { x: 0.35, y: 0.7, z: 0 },
    middleTip: { x: 0.55, y: 0.55, z: 0 },
    ringTip: { x: 0.6, y: 0.58, z: 0 },
    pinkyTip: { x: 0.65, y: 0.62, z: 0 }
  }
});

const createDetection = (): HandDetection => {
  const frame = createFrame();

  return { rawFrame: frame, filteredFrame: frame };
};

const createFakeVideo = (): FakeVideo => {
  const callbacks = new Map<number, (now: number, metadata: VideoFrameCallbackMetadata) => void>();
  let nextId = 1;

  return {
    srcObject: undefined,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    clientWidth: 640,
    clientHeight: 480,
    requestVideoFrameCallback: vi.fn(
      (callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
      }
    ),
    cancelVideoFrameCallback: vi.fn((id: number) => {
      callbacks.delete(id);
    }),
    fireFrame() {
      const next = callbacks.entries().next().value;

      if (next === undefined) {
        throw new Error("No pending frame callback");
      }

      const [id, callback] = next;
      callbacks.delete(id);
      callback(1000, {
        expectedDisplayTime: 100,
        presentedFrames: 1
      } as VideoFrameCallbackMetadata);
    }
  };
};

const createCanvas = () =>
  ({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: vi.fn(() => ({ canvas: { width: 640, height: 480 } }))
  }) as unknown as HTMLCanvasElement;

const createPinnedStream = (): DevicePinnedStream => ({
  stream: { id: "front-stream" } as MediaStream,
  deviceId: "front-device",
  stop: vi.fn()
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createFrontAimGameRuntime", () => {
  it("maps a synthetic front detection to mirrored crosshair draw input", async () => {
    const video = createFakeVideo();
    const canvas = createCanvas();
    const stream = createPinnedStream();
    const tracker = {
      detect: vi.fn(() => Promise.resolve(createDetection())),
      cleanup: vi.fn()
    };
    const drawGameFrame = vi.fn();
    const runtime = createFrontAimGameRuntime({
      deviceId: "front-device",
      video: video as unknown as HTMLVideoElement,
      canvas,
      createDevicePinnedStream: vi.fn(() => Promise.resolve(stream)),
      createMediaPipeHandTracker: vi.fn(() => Promise.resolve(tracker)),
      createImageBitmap: vi.fn(() =>
        Promise.resolve({ width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap)
      ),
      drawGameFrame
    });

    runtime.start();
    await flush();
    video.fireFrame();
    await flush();

    expect(video.srcObject).toBe(stream.stream);
    expect(tracker.detect).toHaveBeenCalledOnce();
    expect(drawGameFrame).toHaveBeenCalledWith(expect.anything(), {
      balloons: [],
      crosshair: { x: 480, y: 240 }
    });
  });

  it("hides the crosshair when aim is unavailable", async () => {
    const video = createFakeVideo();
    const tracker = {
      detect: vi.fn(() => Promise.resolve(undefined)),
      cleanup: vi.fn()
    };
    const drawGameFrame = vi.fn();
    const runtime = createFrontAimGameRuntime({
      deviceId: "front-device",
      video: video as unknown as HTMLVideoElement,
      canvas: createCanvas(),
      createDevicePinnedStream: vi.fn(() => Promise.resolve(createPinnedStream())),
      createMediaPipeHandTracker: vi.fn(() => Promise.resolve(tracker)),
      createImageBitmap: vi.fn(() =>
        Promise.resolve({ width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap)
      ),
      drawGameFrame
    });

    runtime.start();
    await flush();
    video.fireFrame();
    await flush();

    expect(drawGameFrame).toHaveBeenCalledWith(expect.anything(), {
      balloons: [],
      crosshair: undefined
    });
  });

  it("cleans up tracker and stream on destroy", async () => {
    const tracker = { detect: vi.fn(), cleanup: vi.fn() };
    const stream = createPinnedStream();
    const runtime = createFrontAimGameRuntime({
      deviceId: "front-device",
      video: createFakeVideo() as unknown as HTMLVideoElement,
      canvas: createCanvas(),
      createDevicePinnedStream: vi.fn(() => Promise.resolve(stream)),
      createMediaPipeHandTracker: vi.fn(() => Promise.resolve(tracker))
    });

    runtime.start();
    await flush();
    runtime.destroy();

    expect(
      (stream.stop as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(tracker.cleanup).toHaveBeenCalledOnce();
  });

  it("does not draw after destroy while tracker startup is pending", async () => {
    let resolveTracker!: (tracker: MediaPipeHandTracker) => void;
    const trackerPromise = new Promise<MediaPipeHandTracker>((resolve) => {
      resolveTracker = resolve;
    });
    const tracker: MediaPipeHandTracker = {
      detect: vi.fn(() => Promise.resolve(undefined)),
      cleanup: vi.fn()
    };
    const drawGameFrame = vi.fn();
    const runtime = createFrontAimGameRuntime({
      deviceId: "front-device",
      video: createFakeVideo() as unknown as HTMLVideoElement,
      canvas: createCanvas(),
      createDevicePinnedStream: vi.fn(() => Promise.resolve(createPinnedStream())),
      createMediaPipeHandTracker: vi.fn(() => trackerPromise),
      drawGameFrame
    });

    runtime.start();
    await flush();
    runtime.destroy();
    resolveTracker(tracker);
    await flush();

    expect(
      (tracker.cleanup as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (tracker.detect as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
    expect(drawGameFrame).not.toHaveBeenCalled();
  });

  it("stops an opened stream immediately when destroyed while tracker startup is pending", async () => {
    let resolveTracker!: (tracker: MediaPipeHandTracker) => void;
    const trackerPromise = new Promise<MediaPipeHandTracker>((resolve) => {
      resolveTracker = resolve;
    });
    const tracker: MediaPipeHandTracker = {
      detect: vi.fn(() => Promise.resolve(undefined)),
      cleanup: vi.fn()
    };
    const stream = createPinnedStream();
    const runtime = createFrontAimGameRuntime({
      deviceId: "front-device",
      video: createFakeVideo() as unknown as HTMLVideoElement,
      canvas: createCanvas(),
      createDevicePinnedStream: vi.fn(() => Promise.resolve(stream)),
      createMediaPipeHandTracker: vi.fn(() => trackerPromise)
    });

    runtime.start();
    await flush();
    runtime.destroy();

    expect(
      (stream.stop as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);

    resolveTracker(tracker);
    await flush();

    expect(
      (stream.stop as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (tracker.cleanup as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (tracker.detect as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
  });
});
