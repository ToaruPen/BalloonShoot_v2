import { describe, expect, it, vi, type MockInstance } from "vitest";
import {
  createBalloonGameRuntime,
  MAX_CONSECUTIVE_FRAME_ERRORS
} from "../../src/app/balloonGameRuntime";
import type { Balloon } from "../../src/features/gameplay/domain/balloon";
import type { DevicePinnedStream } from "../../src/features/camera/createDevicePinnedStream";
import { getFrontAimFilterConfig } from "../../src/features/front-aim";
import type { MediaPipeHandTracker } from "../../src/features/hand-tracking/createMediaPipeHandTracker";
import { getSideTriggerFilterConfig } from "../../src/features/side-trigger";
import type { LaneHealthStatus } from "../../src/shared/types/camera";
import type { FusedGameInputFrame } from "../../src/shared/types/fusion";
import type { HandDetection, HandFrame } from "../../src/shared/types/hand";
import type * as InputFusionModule from "../../src/features/input-fusion";
import {
  createAimFrame,
  createTriggerFrame
} from "../unit/features/input-fusion/testFactory";
import { FakeTrack } from "../helpers/fakeTrack";

interface CapturedFusionContext {
  readonly method:
    | "updateAimFrame"
    | "updateTriggerFrame"
    | "updateAimUnavailable"
    | "updateTriggerUnavailable";
  readonly frontLaneHealth: LaneHealthStatus;
  readonly sideLaneHealth: LaneHealthStatus;
}

const { capturedFusionContexts } = vi.hoisted(() => ({
  capturedFusionContexts: [] as CapturedFusionContext[]
}));

vi.mock("../../src/features/input-fusion", async (importOriginal) => {
  const actual = await importOriginal<typeof InputFusionModule>();

  return {
    ...actual,
    createInputFusionMapper: () => {
      const mapper = actual.createInputFusionMapper();
      const capture = (
        method: CapturedFusionContext["method"],
        context: Omit<CapturedFusionContext, "method">
      ): void => {
        capturedFusionContexts.push({ method, ...context });
      };

      return {
        updateAimFrame: (
          ...args: Parameters<typeof mapper.updateAimFrame>
        ): ReturnType<typeof mapper.updateAimFrame> => {
          capture("updateAimFrame", args[1]);
          return mapper.updateAimFrame(...args);
        },
        updateTriggerFrame: (
          ...args: Parameters<typeof mapper.updateTriggerFrame>
        ): ReturnType<typeof mapper.updateTriggerFrame> => {
          capture("updateTriggerFrame", args[1]);
          return mapper.updateTriggerFrame(...args);
        },
        updateAimUnavailable: (
          ...args: Parameters<typeof mapper.updateAimUnavailable>
        ): ReturnType<typeof mapper.updateAimUnavailable> => {
          capture("updateAimUnavailable", args[1]);
          return mapper.updateAimUnavailable(...args);
        },
        updateTriggerUnavailable: (
          ...args: Parameters<typeof mapper.updateTriggerUnavailable>
        ): ReturnType<typeof mapper.updateTriggerUnavailable> => {
          capture("updateTriggerUnavailable", args[1]);
          return mapper.updateTriggerUnavailable(...args);
        },
        resetFrontLane: (): void => {
          mapper.resetFrontLane();
        },
        resetSideLane: (): void => {
          mapper.resetSideLane();
        },
        resetAll: (): void => {
          mapper.resetAll();
        }
      };
    }
  };
});

const createFusedFrame = (
  patch: Partial<FusedGameInputFrame> = {}
): FusedGameInputFrame => ({
  fusionTimestampMs: 4_016,
  fusionMode: "pairedFrontAndSide",
  timeDeltaBetweenLanesMs: 0,
  aim: createAimFrame(4_016, {
    aimPointViewport: { x: 100, y: 100 },
    aimPointNormalized: { x: 0.2, y: 0.2 }
  }),
  trigger: createTriggerFrame(4_016, {
    triggerEdge: "shotCommitted",
    triggerPulled: true
  }),
  shotFired: true,
  inputConfidence: 0.9,
  frontSource: {
    laneRole: "frontAim",
    frameTimestamp: createAimFrame(4_016).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  sideSource: {
    laneRole: "sideTrigger",
    frameTimestamp: createTriggerFrame(4_016).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  fusionRejectReason: "none",
  ...patch
});

const createRaf = () => {
  let callback: FrameRequestCallback | undefined;

  return {
    requestAnimationFrame: vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    }),
    cancelAnimationFrame: vi.fn(),
    fire(nowMs: number) {
      const next = callback;
      callback = undefined;
      next?.(nowMs);
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

const createVideoFrameMetadata = (
  patch: Partial<VideoFrameCallbackMetadata> = {}
): VideoFrameCallbackMetadata => ({
  captureTime: 100,
  expectedDisplayTime: 100,
  height: 480,
  mediaTime: 0,
  presentedFrames: 1,
  presentationTime: 100,
  processingDuration: 0,
  width: 640,
  ...patch
});

interface FakeRuntimeVideo extends HTMLVideoElement {
  readonly requestVideoFrameCallbackMock: ReturnType<typeof vi.fn>;
  readonly cancelVideoFrameCallbackMock: ReturnType<typeof vi.fn>;
  fireFrame(metadata?: Partial<VideoFrameCallbackMetadata>): void;
}

const createVideo = () => {
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  let nextCallbackId = 1;
  const requestVideoFrameCallbackMock = vi.fn(
    (callback: VideoFrameRequestCallback) => {
      const callbackId = nextCallbackId;
      nextCallbackId += 1;
      callbacks.set(callbackId, callback);
      return callbackId;
    }
  );
  const cancelVideoFrameCallbackMock = vi.fn((callbackId: number) => {
    callbacks.delete(callbackId);
  });

  return {
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: undefined,
    requestVideoFrameCallback: requestVideoFrameCallbackMock,
    requestVideoFrameCallbackMock,
    cancelVideoFrameCallback: cancelVideoFrameCallbackMock,
    cancelVideoFrameCallbackMock,
    fireFrame(metadata: Partial<VideoFrameCallbackMetadata> = {}) {
      const next = callbacks.entries().next();

      if (next.done === true) {
        throw new Error("No pending video frame callback");
      }

      const [callbackId, callback] = next.value;
      callbacks.delete(callbackId);
      callback(1000, createVideoFrameMetadata(metadata));
    }
  } as unknown as FakeRuntimeVideo;
};

const createHandFrame = (): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.5, y: 0.9, z: 0 },
    indexMcp: { x: 0.5, y: 0.65, z: 0 },
    indexTip: { x: 0.5, y: 0.5, z: 0 },
    thumbIp: { x: 0.42, y: 0.7, z: 0 },
    thumbTip: { x: 0.35, y: 0.68, z: 0 },
    middleTip: { x: 0.55, y: 0.55, z: 0 },
    ringTip: { x: 0.6, y: 0.58, z: 0 },
    pinkyTip: { x: 0.65, y: 0.62, z: 0 }
  }
});

const createHandDetection = (): HandDetection => {
  const frame = createHandFrame();

  return {
    rawFrame: frame,
    filteredFrame: frame
  };
};

interface FakePinnedStream extends DevicePinnedStream {
  readonly stopMock: ReturnType<typeof vi.fn>;
}

const createPinnedStream = (
  deviceId: string,
  tracks: readonly FakeTrack[] = []
): FakePinnedStream => {
  const stopMock = vi.fn();

  return {
    deviceId,
    stream: {
      id: `${deviceId}-stream`,
      getVideoTracks: vi.fn(() => [...tracks]),
      getTracks: vi.fn(() => [...tracks])
    } as unknown as MediaStream,
    stop: stopMock,
    stopMock
  };
};

interface FakeTracker extends MediaPipeHandTracker {
  readonly cleanupMock: ReturnType<typeof vi.fn>;
}

const createTracker = (
  detect: MediaPipeHandTracker["detect"] = vi.fn(() =>
    Promise.resolve(undefined)
  )
): FakeTracker => {
  const cleanupMock = vi.fn(() => Promise.resolve());

  return {
    detect,
    cleanup: cleanupMock,
    cleanupMock
  };
};

const createAudio = () => ({
  startBgm: vi.fn(() => Promise.resolve()),
  stopBgm: vi.fn(),
  playShot: vi.fn(() => Promise.resolve()),
  playHit: vi.fn(() => Promise.resolve()),
  playTimeout: vi.fn(() => Promise.resolve()),
  cancelTimeout: vi.fn(),
  playResult: vi.fn(() => Promise.resolve()),
  duckBgm: vi.fn(),
  restoreBgmVolume: vi.fn()
});

const createDeferred = <T = void>() => {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
};

type RuntimeOptions = Parameters<typeof createBalloonGameRuntime>[0];

interface StartupFailureTestContext {
  readonly raf: ReturnType<typeof createRaf>;
  readonly hudRoot: HTMLElement;
  readonly consoleError: MockInstance<typeof console.error>;
  readonly runtime: ReturnType<typeof createBalloonGameRuntime>;
}

const createStartupFailureTestContext = (
  overrides: Pick<
    RuntimeOptions,
    "createDevicePinnedStream" | "createMediaPipeHandTracker"
  >
): StartupFailureTestContext => {
  capturedFusionContexts.length = 0;
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  const raf = createRaf();
  const hudRoot = { innerHTML: "" } as HTMLElement;
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const runtime = createBalloonGameRuntime({
    frontDeviceId: "front",
    sideDeviceId: "side",
    frontVideo: createVideo(),
    sideVideo: createVideo(),
    canvas: createCanvas(),
    hudRoot,
    nowMs: () => 0,
    createAudioController: createAudio,
    drawGameFrame: vi.fn(),
    requestAnimationFrame: raf.requestAnimationFrame,
    cancelAnimationFrame: raf.cancelAnimationFrame,
    createDevicePinnedStream: (deviceId) =>
      Promise.resolve(createPinnedStream(deviceId)),
    createMediaPipeHandTracker: vi.fn(() => Promise.resolve(createTracker())),
    ...overrides
  });

  return { raf, hudRoot, consoleError, runtime };
};

const cleanupStartupFailureTestContext = ({
  consoleError,
  runtime
}: StartupFailureTestContext): void => {
  consoleError.mockRestore();
  runtime.destroy();
  vi.unstubAllGlobals();
};

describe("createBalloonGameRuntime", () => {
  it("passes lane-specific filter configs to front and side game trackers", async () => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValue(createTracker());
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: createVideo(),
      sideVideo: createVideo(),
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: (deviceId) =>
        Promise.resolve(createPinnedStream(deviceId)),
      createMediaPipeHandTracker
    });

    runtime.start();

    await vi.waitFor(() => {
      expect(createMediaPipeHandTracker).toHaveBeenCalledTimes(2);
    });
    expect(createMediaPipeHandTracker).toHaveBeenNthCalledWith(1, {
      getFilterConfig: getFrontAimFilterConfig
    });
    expect(createMediaPipeHandTracker).toHaveBeenNthCalledWith(2, {
      getFilterConfig: getSideTriggerFilterConfig
    });

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("logs tracker cleanup failures instead of leaking unhandled rejections", async () => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const cleanupError = new Error("cleanup failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const tracker = createTracker();
    const sideTracker = createTracker();
    tracker.cleanupMock.mockRejectedValueOnce(cleanupError);
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValueOnce(tracker)
      .mockResolvedValueOnce(sideTracker);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: createVideo(),
      sideVideo: createVideo(),
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: (deviceId) =>
        Promise.resolve(createPinnedStream(deviceId)),
      createMediaPipeHandTracker
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(createMediaPipeHandTracker).toHaveBeenCalledTimes(2);
    });

    runtime.destroy();

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "[balloon game runtime] tracker cleanup failed",
        cleanupError
      );
    });
    vi.unstubAllGlobals();
  });

  it("shows a recovery action when both tracker startups fail", async () => {
    const startupError = new Error("tracker wasm unavailable");
    const context = createStartupFailureTestContext({
      createMediaPipeHandTracker: vi.fn(() => Promise.reject(startupError))
    });

    context.runtime.start();
    await vi.waitFor(() => {
      expect(capturedFusionContexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "updateAimUnavailable",
            frontLaneHealth: "failed"
          }),
          expect.objectContaining({
            method: "updateTriggerUnavailable",
            sideLaneHealth: "failed"
          })
        ])
      );
    });
    context.raf.fire(4_000);

    expect(context.hudRoot.innerHTML).toContain("カメラが失敗しました");
    expect(context.hudRoot.innerHTML).toContain("カメラを選び直す");
    expect(context.hudRoot.innerHTML).not.toContain("入力を準備中");
    expect(context.consoleError).toHaveBeenCalledWith(
      "[balloon game runtime] tracker startup failed",
      startupError
    );

    cleanupStartupFailureTestContext(context);
  });

  it("shows a recovery action when both camera streams fail during startup", async () => {
    const streamError = new Error("camera unavailable");
    const context = createStartupFailureTestContext({
      createDevicePinnedStream: vi.fn(() => Promise.reject(streamError)),
      createMediaPipeHandTracker: vi.fn()
    });

    context.runtime.start();
    await vi.waitFor(() => {
      expect(capturedFusionContexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "updateAimUnavailable",
            frontLaneHealth: "failed"
          }),
          expect.objectContaining({
            method: "updateTriggerUnavailable",
            sideLaneHealth: "failed"
          })
        ])
      );
    });
    context.raf.fire(4_000);

    expect(context.hudRoot.innerHTML).toContain("カメラが失敗しました");
    expect(context.hudRoot.innerHTML).toContain("カメラを選び直す");
    expect(context.hudRoot.innerHTML).not.toContain("入力を準備中");
    expect(context.consoleError).toHaveBeenCalledWith(
      "[balloon game runtime] front lane failed",
      streamError
    );
    expect(context.consoleError).toHaveBeenCalledWith(
      "[balloon game runtime] side lane failed",
      streamError
    );

    cleanupStartupFailureTestContext(context);
  });

  it("shows a recovery action when only the front tracker startup fails", async () => {
    const startupError = new Error("front tracker unavailable");
    const context = createStartupFailureTestContext({
      createMediaPipeHandTracker: vi
        .fn()
        .mockRejectedValueOnce(startupError)
        .mockResolvedValueOnce(createTracker())
    });

    context.runtime.start();
    await vi.waitFor(() => {
      expect(capturedFusionContexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "updateAimUnavailable",
            frontLaneHealth: "failed"
          })
        ])
      );
    });
    context.raf.fire(4_000);

    expect(context.hudRoot.innerHTML).toContain("カメラが失敗しました");
    expect(context.hudRoot.innerHTML).toContain(
      'data-game-action="reselectCameras"'
    );

    cleanupStartupFailureTestContext(context);
  });

  it("shows a recovery action when only the side tracker startup fails", async () => {
    const startupError = new Error("side tracker unavailable");
    const context = createStartupFailureTestContext({
      createMediaPipeHandTracker: vi
        .fn()
        .mockResolvedValueOnce(createTracker())
        .mockRejectedValueOnce(startupError)
    });

    context.runtime.start();
    await vi.waitFor(() => {
      expect(capturedFusionContexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "updateTriggerUnavailable",
            sideLaneHealth: "failed"
          })
        ])
      );
    });
    context.raf.fire(4_000);

    expect(context.hudRoot.innerHTML).toContain("カメラが失敗しました");
    expect(context.hudRoot.innerHTML).toContain(
      'data-game-action="reselectCameras"'
    );

    cleanupStartupFailureTestContext(context);
  });

  it("restores front lane health before fusing after a transient frame error", async () => {
    capturedFusionContexts.length = 0;
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const drawGameFrame = vi.fn();
    const audio = createAudio();
    const frontVideo = createVideo();
    const sideVideo = createVideo();
    const transientError = new Error("bitmap failed once");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const frontDetect = vi.fn(() => Promise.resolve(createHandDetection()));
    const frontTracker = createTracker(frontDetect);
    const sideTracker = createTracker();
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValueOnce(frontTracker)
      .mockResolvedValueOnce(sideTracker);
    const createImageBitmap = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue({
        width: 640,
        height: 480,
        close: vi.fn()
      } as unknown as ImageBitmap);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo,
      sideVideo,
      canvas: createCanvas(),
      hudRoot,
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: (deviceId) =>
        Promise.resolve(createPinnedStream(deviceId)),
      createMediaPipeHandTracker,
      createImageBitmap
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledOnce();
    });

    frontVideo.fireFrame({ captureTime: 100, presentedFrames: 1 });
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(2);
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[balloon game runtime] processFrame failed",
      transientError
    );

    frontVideo.fireFrame({ captureTime: 116, presentedFrames: 2 });
    await vi.waitFor(() => {
      expect(frontDetect).toHaveBeenCalledOnce();
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(3);
    });
    raf.fire(4_000);

    expect(
      capturedFusionContexts.find(
        (context) => context.method === "updateAimFrame"
      )
    ).toMatchObject({
      frontLaneHealth: "tracking",
      sideLaneHealth: "tracking"
    });
    expect(drawGameFrame).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        crosshair: { x: 320, y: 240 }
      })
    );

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("processes one fused shot once across repeated render ticks", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const drawGameFrame = vi.fn();
    const audio = createAudio();
    const balloon: Balloon = {
      id: "target",
      x: 100,
      y: 100,
      radius: 32,
      vy: 0,
      size: "normal",
      alive: true
    };
    const frame = createFusedFrame();
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => frame,
      initialBalloons: [balloon],
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(4_016);
    raf.fire(4_032);

    expect(audio.playShot).toHaveBeenCalledTimes(1);
    expect(audio.playHit).toHaveBeenCalledTimes(1);
    expect(audio.duckBgm).toHaveBeenCalledWith(0.07);
    expect(hudRoot.innerHTML).toMatch(
      /<span[^>]*>スコア<\/span>\s*<strong[^>]*>1<\/strong>/
    );
    expect(drawGameFrame).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        crosshair: { x: 100, y: 100 },
        shotEffect: { x: 100, y: 100, startedAtMs: 4_000 },
        hitEffects: [
          expect.objectContaining({
            x: 100,
            y: 100,
            points: 1,
            scoreLabel: "+1",
            startedAtMs: 4_000
          })
        ]
      })
    );
  });

  it("keeps bgm ducked until the latest rapid hit restore window expires", () => {
    vi.useFakeTimers();
    try {
      const raf = createRaf();
      const hudRoot = { innerHTML: "" } as HTMLElement;
      const audio = createAudio();
      const secondTrigger = createTriggerFrame(4_116, {
        triggerEdge: "shotCommitted",
        triggerPulled: true
      });
      const baseSideSource = createFusedFrame().sideSource;
      const frames = [
        createFusedFrame(),
        createFusedFrame({
          fusionTimestampMs: 4_116,
          aim: createAimFrame(4_116, {
            aimPointViewport: { x: 100, y: 100 },
            aimPointNormalized: { x: 0.2, y: 0.2 }
          }),
          trigger: secondTrigger,
          sideSource: {
            ...baseSideSource,
            frameTimestamp: secondTrigger.timestamp
          }
        })
      ];
      let currentFrame = frames[0];
      const runtime = createBalloonGameRuntime({
        frontDeviceId: "front",
        sideDeviceId: "side",
        frontVideo: {} as HTMLVideoElement,
        sideVideo: {} as HTMLVideoElement,
        canvas: createCanvas(),
        hudRoot,
        readFusedInputFrame: () => currentFrame,
        initialBalloons: [
          {
            id: "target-1",
            x: 100,
            y: 100,
            radius: 32,
            vy: 0,
            size: "normal",
            alive: true
          },
          {
            id: "target-2",
            x: 100,
            y: 100,
            radius: 32,
            vy: 0,
            size: "normal",
            alive: true
          }
        ],
        nowMs: () => 0,
        createAudioController: () => audio,
        drawGameFrame: vi.fn(),
        loadBalloonSprites: () => Promise.resolve({ frames: [] }),
        requestAnimationFrame: raf.requestAnimationFrame,
        cancelAnimationFrame: raf.cancelAnimationFrame
      });

      runtime.start();
      raf.fire(4_000);
      vi.advanceTimersByTime(100);
      currentFrame = frames[1];
      raf.fire(4_100);
      vi.advanceTimersByTime(99);

      expect(audio.duckBgm).toHaveBeenCalledTimes(2);
      expect(audio.restoreBgmVolume).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(audio.restoreBgmVolume).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(audio.restoreBgmVolume).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores bgm volume before starting bgm on retry after a hit duck", () => {
    vi.useFakeTimers();
    try {
      const raf = createRaf();
      const hudRoot = { innerHTML: "" } as HTMLElement;
      const audio = createAudio();
      const runtime = createBalloonGameRuntime({
        frontDeviceId: "front",
        sideDeviceId: "side",
        frontVideo: {} as HTMLVideoElement,
        sideVideo: {} as HTMLVideoElement,
        canvas: createCanvas(),
        hudRoot,
        readFusedInputFrame: createFusedFrame,
        initialBalloons: [
          {
            id: "target-1",
            x: 100,
            y: 100,
            radius: 32,
            vy: 0,
            size: "normal",
            alive: true
          }
        ],
        nowMs: () => 0,
        createAudioController: () => audio,
        drawGameFrame: vi.fn(),
        requestAnimationFrame: raf.requestAnimationFrame,
        cancelAnimationFrame: raf.cancelAnimationFrame
      });

      runtime.start();
      raf.fire(4_000);
      runtime.retry();
      vi.advanceTimersByTime(200);

      expect(audio.duckBgm).toHaveBeenCalledOnce();
      expect(audio.restoreBgmVolume).toHaveBeenCalledOnce();
      const restoreCallOrder =
        audio.restoreBgmVolume.mock.invocationCallOrder[0];
      const retryStartCallOrder = audio.startBgm.mock.invocationCallOrder[1];
      if (restoreCallOrder === undefined || retryStartCallOrder === undefined) {
        throw new Error("Expected retry BGM call order to be recorded");
      }
      expect(restoreCallOrder).toBeLessThan(retryStartCallOrder);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows HUD status while side input is missing but front aim remains usable", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const frontOnlyFrame = createFusedFrame({
      fusionMode: "frontOnlyAim",
      trigger: undefined,
      shotFired: false,
      sideSource: {
        ...createFusedFrame().sideSource,
        frameTimestamp: undefined,
        frameAgeMs: undefined,
        availability: "unavailable",
        rejectReason: "sideMissing"
      },
      fusionRejectReason: "sideMissing"
    });
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => frontOnlyFrame,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);

    expect(hudRoot.innerHTML).toContain("サイドカメラの入力を待っています");
  });

  it("retries sprite loading after a transient failure on retry", async () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const sprites = { frames: [{} as HTMLImageElement] };
    const loadError = new Error("sprite load failed once");
    const loadBalloonSprites = vi
      .fn()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(sprites);
    const drawGameFrame = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame,
      loadBalloonSprites,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(loadBalloonSprites).toHaveBeenCalledOnce();
    });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "[balloon game runtime] balloon sprites load failed",
        loadError
      );
    });

    runtime.retry();
    await vi.waitFor(() => {
      expect(loadBalloonSprites).toHaveBeenCalledTimes(2);
    });
    raf.fire(4_000);

    expect(drawGameFrame).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        balloonSprites: sprites
      })
    );
  });

  it("passes loaded balloon sprites without animation frame switching", async () => {
    const raf = createRaf();
    const sprites = {
      frames: [{} as HTMLImageElement, {} as HTMLImageElement]
    };
    const drawGameFrame = vi.fn();
    const loadBalloonSprites = vi.fn(() => Promise.resolve(sprites));
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame,
      loadBalloonSprites,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(loadBalloonSprites).toHaveBeenCalledOnce();
    });
    await Promise.resolve();

    raf.fire(120);

    const drawState = (drawGameFrame.mock.calls.at(-1)?.[1] ?? {}) as {
      readonly balloonSprites?: typeof sprites;
    };
    expect(drawState.balloonSprites).toBe(sprites);
    expect(drawState).not.toHaveProperty("balloonFrameIndex");
  });

  it("ignores a shot committed before countdown completes", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const drawGameFrame = vi.fn();
    const audio = createAudio();
    const balloon: Balloon = {
      id: "target",
      x: 100,
      y: 100,
      radius: 32,
      vy: 0,
      size: "normal",
      alive: true
    };
    const countdownShotFrame = createFusedFrame({
      fusionTimestampMs: 4_006,
      aim: createAimFrame(4_006, {
        aimPointViewport: { x: 100, y: 100 },
        aimPointNormalized: { x: 0.2, y: 0.2 }
      }),
      trigger: createTriggerFrame(3_995, {
        triggerEdge: "shotCommitted",
        triggerPulled: true
      }),
      sideSource: {
        ...createFusedFrame().sideSource,
        frameTimestamp: createTriggerFrame(3_995).timestamp
      }
    });
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => countdownShotFrame,
      initialBalloons: [balloon],
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_006);

    expect(audio.playShot).not.toHaveBeenCalled();
    expect(audio.playHit).not.toHaveBeenCalled();
    expect(hudRoot.innerHTML).toMatch(
      /<span[^>]*>スコア<\/span>\s*<strong[^>]*>0<\/strong>/
    );
    expect(drawGameFrame).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        crosshair: { x: 100, y: 100 },
        shotEffect: undefined,
        hitEffects: []
      })
    );
  });

  it("resets failed lane state and restarts tracking on retry", async () => {
    capturedFusionContexts.length = 0;
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const drawGameFrame = vi.fn();
    const audio = createAudio();
    const frontVideo = createVideo();
    const sideVideo = createVideo();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const frontTracker = createTracker(() =>
      Promise.resolve(createHandDetection())
    );
    const sideTracker = createTracker(() =>
      Promise.resolve(createHandDetection())
    );
    const restartedFrontDetect = vi.fn(() =>
      Promise.resolve(createHandDetection())
    );
    const restartedSideDetect = vi.fn(() =>
      Promise.resolve(createHandDetection())
    );
    const restartedFrontTracker = createTracker(restartedFrontDetect);
    const restartedSideTracker = createTracker(restartedSideDetect);
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValueOnce(frontTracker)
      .mockResolvedValueOnce(sideTracker)
      .mockResolvedValueOnce(restartedFrontTracker)
      .mockResolvedValueOnce(restartedSideTracker);
    const createImageBitmap = vi
      .fn()
      .mockRejectedValueOnce(new Error("front lane failed"))
      .mockResolvedValue({
        width: 640,
        height: 480,
        close: vi.fn()
      } as unknown as ImageBitmap);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo,
      sideVideo,
      canvas: createCanvas(),
      hudRoot,
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: (deviceId) =>
        Promise.resolve(createPinnedStream(deviceId)),
      createMediaPipeHandTracker,
      createImageBitmap
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledOnce();
    });

    frontVideo.fireFrame({ captureTime: 100, presentedFrames: 1 });
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(2);
    });

    raf.fire(64_000);
    runtime.retry();

    await vi.waitFor(() => {
      expect(createMediaPipeHandTracker).toHaveBeenCalledTimes(4);
    });
    frontVideo.fireFrame({ captureTime: 64_100, presentedFrames: 2 });
    sideVideo.fireFrame({ captureTime: 64_100, presentedFrames: 2 });
    await vi.waitFor(() => {
      expect(restartedFrontDetect).toHaveBeenCalledOnce();
      expect(restartedSideDetect).toHaveBeenCalledOnce();
    });

    expect(
      capturedFusionContexts.filter(
        (context) =>
          context.method === "updateAimFrame" ||
          context.method === "updateTriggerFrame"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frontLaneHealth: "tracking",
          sideLaneHealth: "tracking"
        })
      ])
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[balloon game runtime] processFrame failed",
      expect.any(Error)
    );

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("stops scheduling a lane after consecutive frame processing failures", async () => {
    capturedFusionContexts.length = 0;
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const frontVideo = createVideo();
    const sideVideo = createVideo();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const frontStream = createPinnedStream("front");
    const sideStream = createPinnedStream("side");
    const frontTracker = createTracker();
    const sideTracker = createTracker();
    const createDevicePinnedStream = vi
      .fn()
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream);
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValueOnce(frontTracker)
      .mockResolvedValueOnce(sideTracker);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo,
      sideVideo,
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream,
      createMediaPipeHandTracker,
      createImageBitmap: vi.fn(() =>
        Promise.reject(new Error("bitmap keeps failing"))
      )
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledOnce();
    });
    consoleError.mockClear();

    for (
      let attempt = 0;
      attempt < MAX_CONSECUTIVE_FRAME_ERRORS;
      attempt += 1
    ) {
      frontVideo.fireFrame({
        captureTime: 100 + attempt,
        presentedFrames: attempt
      });
      await vi.waitFor(() => {
        expect(
          consoleError.mock.calls.filter(
            ([message]) =>
              message === "[balloon game runtime] processFrame failed"
          )
        ).toHaveLength(attempt + 1);
      });
    }

    expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(
      MAX_CONSECUTIVE_FRAME_ERRORS
    );
    expect(capturedFusionContexts.at(-1)).toMatchObject({
      frontLaneHealth: "failed"
    });
    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(frontTracker.cleanupMock).toHaveBeenCalledOnce();
    expect(sideStream.stopMock).not.toHaveBeenCalled();
    expect(sideTracker.cleanupMock).not.toHaveBeenCalled();

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("marks the front lane captureLost, clears fusion, and leaves side resources active when the front track ends", async () => {
    capturedFusionContexts.length = 0;
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const frontTrack = new FakeTrack("front-track");
    const frontStream = createPinnedStream("front", [frontTrack]);
    const sideStream = createPinnedStream("side", [
      new FakeTrack("side-track")
    ]);
    const frontTracker = createTracker(() =>
      Promise.resolve(createHandDetection())
    );
    const sideTracker = createTracker(() =>
      Promise.resolve(createHandDetection())
    );
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: createVideo(),
      sideVideo: createVideo(),
      canvas: createCanvas(),
      hudRoot,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: vi
        .fn()
        .mockResolvedValueOnce(frontStream)
        .mockResolvedValueOnce(sideStream),
      createMediaPipeHandTracker: vi
        .fn()
        .mockResolvedValueOnce(frontTracker)
        .mockResolvedValueOnce(sideTracker)
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(frontTrack.listenerCount()).toBe(1);
    });
    frontTrack.fireEnded();

    await vi.waitFor(() => {
      expect(frontTracker.cleanupMock).toHaveBeenCalledOnce();
    });
    raf.fire(4_000);

    expect(capturedFusionContexts.at(-1)).toMatchObject({
      method: "updateAimUnavailable",
      frontLaneHealth: "captureLost",
      sideLaneHealth: "tracking"
    });
    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(sideStream.stopMock).not.toHaveBeenCalled();
    expect(sideTracker.cleanupMock).not.toHaveBeenCalled();
    expect(frontTrack.listenerCount()).toBe(0);
    expect(hudRoot.innerHTML).toContain("カメラが切断されました");
    expect(hudRoot.innerHTML).not.toContain("captureLost");

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("retry after capture loss starts fresh lanes and clears the laneFailed context", async () => {
    capturedFusionContexts.length = 0;
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const frontVideo = createVideo();
    const sideVideo = createVideo();
    const oldFrontTrack = new FakeTrack("old-front-track");
    const oldFrontStream = createPinnedStream("front", [oldFrontTrack]);
    const oldSideStream = createPinnedStream("side", [
      new FakeTrack("old-side-track")
    ]);
    const newFrontStream = createPinnedStream("front", [
      new FakeTrack("new-front-track")
    ]);
    const newSideStream = createPinnedStream("side", [
      new FakeTrack("new-side-track")
    ]);
    const restartedFrontDetect = vi.fn(() =>
      Promise.resolve(createHandDetection())
    );
    const restartedSideDetect = vi.fn(() =>
      Promise.resolve(createHandDetection())
    );
    const oldFrontTracker = createTracker();
    const oldSideTracker = createTracker();
    const newFrontTracker = createTracker(restartedFrontDetect);
    const newSideTracker = createTracker(restartedSideDetect);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo,
      sideVideo,
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream: vi
        .fn()
        .mockResolvedValueOnce(oldFrontStream)
        .mockResolvedValueOnce(oldSideStream)
        .mockResolvedValueOnce(newFrontStream)
        .mockResolvedValueOnce(newSideStream),
      createMediaPipeHandTracker: vi
        .fn()
        .mockResolvedValueOnce(oldFrontTracker)
        .mockResolvedValueOnce(oldSideTracker)
        .mockResolvedValueOnce(newFrontTracker)
        .mockResolvedValueOnce(newSideTracker),
      createImageBitmap: vi.fn(() =>
        Promise.resolve({
          width: 640,
          height: 480,
          close: vi.fn()
        } as unknown as ImageBitmap)
      )
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(oldFrontTrack.listenerCount()).toBe(1);
    });
    oldFrontTrack.fireEnded();
    await vi.waitFor(() => {
      expect(oldFrontTracker.cleanupMock).toHaveBeenCalledOnce();
    });

    runtime.retry();
    await vi.waitFor(() => {
      expect(frontVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(2);
      expect(sideVideo.requestVideoFrameCallbackMock).toHaveBeenCalledTimes(2);
    });
    expect(oldFrontTrack.listenerCount()).toBe(0);

    frontVideo.fireFrame({ captureTime: 64_100, presentedFrames: 2 });
    sideVideo.fireFrame({ captureTime: 64_100, presentedFrames: 2 });
    await vi.waitFor(() => {
      expect(restartedFrontDetect).toHaveBeenCalledOnce();
      expect(restartedSideDetect).toHaveBeenCalledOnce();
    });

    expect(
      capturedFusionContexts.filter(
        (context) =>
          context.method === "updateAimFrame" ||
          context.method === "updateTriggerFrame"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frontLaneHealth: "tracking",
          sideLaneHealth: "tracking"
        })
      ])
    );

    runtime.destroy();
    vi.unstubAllGlobals();
  });

  it("plays timeout before the result jingle when playing duration ends", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const audio = createAudio();
    const timeoutPlayback = createDeferred();
    audio.playTimeout.mockReturnValueOnce(timeoutPlayback.promise);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(64_000);
    raf.fire(64_016);

    expect(audio.stopBgm).toHaveBeenCalledTimes(1);
    expect(audio.playTimeout).toHaveBeenCalledTimes(1);
    expect(audio.playResult).not.toHaveBeenCalled();

    timeoutPlayback.resolve();

    return vi.waitFor(() => {
      expect(audio.playResult).toHaveBeenCalledTimes(1);
    });
  });

  it("does not play the old result jingle when retry interrupts timeout audio", async () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const audio = createAudio();
    const timeoutPlayback = createDeferred();
    audio.playTimeout.mockReturnValueOnce(timeoutPlayback.promise);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(64_000);
    expect(audio.playTimeout).toHaveBeenCalledTimes(1);

    runtime.retry();
    expect(audio.cancelTimeout).toHaveBeenCalledTimes(1);
    timeoutPlayback.resolve();
    await Promise.resolve();

    expect(audio.playResult).not.toHaveBeenCalled();
  });

  it("renders the result panel after playing duration ends", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(64_000);
    raf.fire(64_016);

    expect(hudRoot.innerHTML).toContain("結果");
    expect(hudRoot.innerHTML).toContain('data-game-action="retry"');
  });

  it("stops camera tracking on result and restarts tracking on retry", async () => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
    const raf = createRaf();
    const frontVideo = createVideo();
    const sideVideo = createVideo();
    const oldFrontStream = createPinnedStream("front");
    const oldSideStream = createPinnedStream("side");
    const newFrontStream = createPinnedStream("front");
    const newSideStream = createPinnedStream("side");
    const oldFrontTracker = createTracker();
    const oldSideTracker = createTracker();
    const newFrontTracker = createTracker();
    const newSideTracker = createTracker();
    const createDevicePinnedStream = vi
      .fn()
      .mockResolvedValueOnce(oldFrontStream)
      .mockResolvedValueOnce(oldSideStream)
      .mockResolvedValueOnce(newFrontStream)
      .mockResolvedValueOnce(newSideStream);
    const createMediaPipeHandTracker = vi
      .fn()
      .mockResolvedValueOnce(oldFrontTracker)
      .mockResolvedValueOnce(oldSideTracker)
      .mockResolvedValueOnce(newFrontTracker)
      .mockResolvedValueOnce(newSideTracker);
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo,
      sideVideo,
      canvas: createCanvas(),
      hudRoot: { innerHTML: "" } as HTMLElement,
      nowMs: () => 0,
      createAudioController: createAudio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createDevicePinnedStream,
      createMediaPipeHandTracker
    });

    runtime.start();
    await vi.waitFor(() => {
      expect(createMediaPipeHandTracker).toHaveBeenCalledTimes(2);
    });

    raf.fire(4_000);
    raf.fire(64_000);

    expect(oldFrontStream.stopMock).toHaveBeenCalledOnce();
    expect(oldSideStream.stopMock).toHaveBeenCalledOnce();
    expect(oldFrontTracker.cleanupMock).toHaveBeenCalledOnce();
    expect(oldSideTracker.cleanupMock).toHaveBeenCalledOnce();

    runtime.retry();
    await vi.waitFor(() => {
      expect(createMediaPipeHandTracker).toHaveBeenCalledTimes(4);
    });

    expect(newFrontStream.stopMock).not.toHaveBeenCalled();
    expect(newSideStream.stopMock).not.toHaveBeenCalled();
    expect(newFrontTracker.cleanupMock).not.toHaveBeenCalled();
    expect(newSideTracker.cleanupMock).not.toHaveBeenCalled();

    runtime.destroy();
    vi.unstubAllGlobals();
  });
});
