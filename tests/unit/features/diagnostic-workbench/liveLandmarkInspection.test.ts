import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestCameraPermission } from "../../../../src/features/camera/cameraPermission";
import { createDevicePinnedStream } from "../../../../src/features/camera/createDevicePinnedStream";
import type { DevicePinnedStream } from "../../../../src/features/camera/createDevicePinnedStream";
import { enumerateVideoDevices } from "../../../../src/features/camera/enumerateVideoDevices";
import { createDiagnosticWorkbench } from "../../../../src/features/diagnostic-workbench/DiagnosticWorkbench";
import type { DiagnosticWorkbench } from "../../../../src/features/diagnostic-workbench/DiagnosticWorkbench";
import { createLiveLandmarkInspection } from "../../../../src/features/diagnostic-workbench/liveLandmarkInspection";
import { renderWorkbenchHTML } from "../../../../src/features/diagnostic-workbench/renderWorkbench";
import type {
  HandDetection,
  HandLandmarkSet
} from "../../../../src/shared/types/hand";
import {
  openWorldLandmarks,
  pulledWorldLandmarks
} from "../side-trigger/testFactory";

const { createMediaPipeHandTrackerMock } = vi.hoisted(() => ({
  createMediaPipeHandTrackerMock: vi.fn()
}));

vi.mock("../../../../src/features/camera/cameraPermission", () => ({
  requestCameraPermission: vi.fn()
}));

vi.mock("../../../../src/features/camera/enumerateVideoDevices", () => ({
  enumerateVideoDevices: vi.fn()
}));

vi.mock("../../../../src/features/camera/createDevicePinnedStream", () => ({
  createDevicePinnedStream: vi.fn()
}));

vi.mock(
  "../../../../src/features/hand-tracking/createMediaPipeHandTracker",
  () => ({
    createMediaPipeHandTracker: createMediaPipeHandTrackerMock
  })
);

interface FakeTextElement {
  textContent: string;
}

interface FakeCanvas {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
}

interface FakeVideo {
  readonly id: string;
  srcObject: MediaStream | undefined;
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  requestVideoFrameCallback: ReturnType<typeof vi.fn>;
  cancelVideoFrameCallback: ReturnType<typeof vi.fn>;
  fireFrame(metadata?: {
    captureTime?: number;
    expectedDisplayTime?: number;
    presentedFrames?: number;
  }): void;
}

type VideoFrameCallbackLike = (
  now: number,
  metadata: {
    captureTime?: number;
    expectedDisplayTime?: number;
    presentedFrames?: number;
  }
) => void;

interface FakeTracker {
  detect: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
}

const elements = new Map<string, unknown>();

const createDevice = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    kind: "videoinput",
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

const createPinnedStream = (deviceId: string): DevicePinnedStream => ({
  stream: { id: `${deviceId}-stream` } as MediaStream,
  deviceId,
  stop: vi.fn()
});

const createCameraError = (name: string): Error =>
  Object.assign(new Error(name), { name });

const createFakeTextElement = (): FakeTextElement => ({ textContent: "" });

const createFakeCanvas = (): FakeCanvas => ({
  width: 0,
  height: 0,
  getContext: vi.fn(() => null)
});

const createFakeVideo = (id: string): FakeVideo => {
  const callbacks = new Map<number, VideoFrameCallbackLike>();
  let nextCallbackId = 1;

  return {
    id,
    srcObject: undefined,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    requestVideoFrameCallback: vi.fn((callback: VideoFrameCallbackLike) => {
      const id = nextCallbackId;
      nextCallbackId += 1;
      callbacks.set(id, callback);
      return id;
    }),
    cancelVideoFrameCallback: vi.fn((id: number) => {
      callbacks.delete(id);
    }),
    fireFrame(metadata = { captureTime: 123, presentedFrames: 1 }) {
      const next = callbacks.entries().next().value;

      if (next === undefined) {
        throw new Error("No pending video frame callback");
      }

      const [callbackId, callback] = next;
      callbacks.delete(callbackId);
      callback(1000, metadata);
    }
  };
};

const createFakeTracker = (): FakeTracker => ({
  detect: vi.fn(() => Promise.resolve(undefined)),
  cleanup: vi.fn()
});

const createHandFrame = () => ({
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.1, y: 0.2, z: 0 },
    thumbIp: { x: 0.2, y: 0.3, z: 0 },
    thumbTip: { x: 0.3, y: 0.4, z: 0 },
    indexMcp: { x: 0.4, y: 0.5, z: 0 },
    indexTip: { x: 0.5, y: 0.6, z: 0 },
    middleTip: { x: 0.6, y: 0.7, z: 0 },
    ringTip: { x: 0.7, y: 0.8, z: 0 },
    pinkyTip: { x: 0.8, y: 0.9, z: 0 }
  }
});

const createHandDetection = () => {
  const frame = createHandFrame();

  return {
    rawFrame: frame,
    filteredFrame: frame
  };
};

const createHandDetectionWithWorld = (
  worldLandmarks: HandLandmarkSet
): HandDetection => {
  const frame = {
    width: 640,
    height: 480,
    landmarks: worldLandmarks,
    worldLandmarks
  };

  return {
    rawFrame: frame,
    filteredFrame: frame
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const installBaseDom = (): void => {
  elements.clear();

  for (const id of [
    "#wb-front-health",
    "#wb-side-health",
    "#wb-front-timestamp",
    "#wb-side-timestamp"
  ]) {
    elements.set(id, createFakeTextElement());
  }

  for (const id of [
    "#wb-front-raw-overlay",
    "#wb-front-filtered-overlay",
    "#wb-side-raw-overlay",
    "#wb-side-filtered-overlay"
  ]) {
    elements.set(id, createFakeCanvas());
  }

  vi.stubGlobal("document", {
    querySelector: vi.fn((selector: string) => elements.get(selector) ?? null)
  });
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() =>
      Promise.resolve({
        width: 640,
        height: 480,
        close: vi.fn()
      })
    )
  );
};

const installPreviewVideos = (): {
  frontVideo: FakeVideo;
  frontFilteredVideo: FakeVideo;
  sideVideo: FakeVideo;
  sideFilteredVideo: FakeVideo;
} => {
  const frontVideo = createFakeVideo("wb-front-video");
  const frontFilteredVideo = createFakeVideo("wb-front-filtered-video");
  const sideVideo = createFakeVideo("wb-side-video");
  const sideFilteredVideo = createFakeVideo("wb-side-filtered-video");

  elements.set("#wb-front-video", frontVideo);
  elements.set("#wb-front-filtered-video", frontFilteredVideo);
  elements.set("#wb-side-video", sideVideo);
  elements.set("#wb-side-filtered-video", sideFilteredVideo);

  return {
    frontVideo,
    frontFilteredVideo,
    sideVideo,
    sideFilteredVideo
  };
};

const attachVideoStreams = (
  workbench: DiagnosticWorkbench,
  videos: ReturnType<typeof installPreviewVideos>
): void => {
  const state = workbench.getState();

  videos.frontVideo.srcObject = state.frontStream?.stream;
  videos.frontFilteredVideo.srcObject = state.frontStream?.stream;
  videos.sideVideo.srcObject = state.sideStream?.stream;
  videos.sideFilteredVideo.srcObject = state.sideStream?.stream;
};

describe("createLiveLandmarkInspection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installBaseDom();
    vi.mocked(requestCameraPermission).mockResolvedValue({ status: "granted" });
    vi.mocked(enumerateVideoDevices).mockResolvedValue([
      createDevice("front-id", "Front Camera"),
      createDevice("side-id", "Side Camera")
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restarts tracking when a preserve-preview swap failure re-renders fresh video elements", async () => {
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    const attemptedSwapStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream)
      .mockResolvedValueOnce(attemptedSwapStream)
      .mockRejectedValueOnce(createCameraError("OverconstrainedError"));
    const workbench = createDiagnosticWorkbench();
    const liveInspection = createLiveLandmarkInspection();
    let currentVideos: ReturnType<typeof installPreviewVideos> | undefined;
    const render = (): void => {
      const state = workbench.getState();
      renderWorkbenchHTML(state, liveInspection.getState());

      if (state.screen === "previewing") {
        currentVideos = installPreviewVideos();
        attachVideoStreams(workbench, currentVideos);
      }

      liveInspection.sync(state);
      liveInspection.updateDom();
    };

    workbench.subscribe(render);
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");

    const initialVideos = currentVideos;
    expect(initialVideos).toBeDefined();
    if (initialVideos === undefined) {
      throw new Error("preview videos should be installed");
    }
    expect(
      initialVideos.frontVideo.requestVideoFrameCallback
    ).toHaveBeenCalledOnce();
    expect(
      initialVideos.sideVideo.requestVideoFrameCallback
    ).toHaveBeenCalledOnce();

    await workbench.swapRoles();

    const rerenderedVideos = currentVideos;
    expect(rerenderedVideos).toBeDefined();
    if (rerenderedVideos === undefined) {
      throw new Error("rerendered preview videos should be installed");
    }
    expect(rerenderedVideos.frontVideo).not.toBe(initialVideos.frontVideo);
    expect(rerenderedVideos.sideVideo).not.toBe(initialVideos.sideVideo);
    expect(
      initialVideos.frontVideo.cancelVideoFrameCallback
    ).toHaveBeenCalledOnce();
    expect(
      initialVideos.sideVideo.cancelVideoFrameCallback
    ).toHaveBeenCalledOnce();
    expect(
      rerenderedVideos.frontVideo.requestVideoFrameCallback
    ).toHaveBeenCalledOnce();
    expect(
      rerenderedVideos.sideVideo.requestVideoFrameCallback
    ).toHaveBeenCalledOnce();
  });

  it("cleans up MediaPipe trackers when live tracking stops", async () => {
    const frontTracker = createFakeTracker();
    const sideTracker = createFakeTracker();
    createMediaPipeHandTrackerMock
      .mockResolvedValueOnce(frontTracker)
      .mockResolvedValueOnce(sideTracker);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });
    videos.frontVideo.fireFrame();
    videos.sideVideo.fireFrame();

    await vi.waitFor(() => {
      expect(frontTracker.detect).toHaveBeenCalledOnce();
      expect(sideTracker.detect).toHaveBeenCalledOnce();
    });
    liveInspection.destroy();

    await vi.waitFor(() => {
      expect(frontTracker.cleanup).toHaveBeenCalledOnce();
      expect(sideTracker.cleanup).toHaveBeenCalledOnce();
    });
  });

  it("does not run detection after stop while tracker startup is pending", async () => {
    const frontTracker = createFakeTracker();
    const sideTracker = createFakeTracker();
    const frontTrackerStartup = createDeferred<FakeTracker>();
    const sideTrackerStartup = createDeferred<FakeTracker>();
    createMediaPipeHandTrackerMock
      .mockReturnValueOnce(frontTrackerStartup.promise)
      .mockReturnValueOnce(sideTrackerStartup.promise);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });
    videos.frontVideo.fireFrame();
    videos.sideVideo.fireFrame();
    liveInspection.destroy();
    frontTrackerStartup.resolve(frontTracker);
    sideTrackerStartup.resolve(sideTracker);

    await vi.waitFor(() => {
      expect(frontTracker.cleanup).toHaveBeenCalledOnce();
      expect(sideTracker.cleanup).toHaveBeenCalledOnce();
    });
    expect(frontTracker.detect).not.toHaveBeenCalled();
    expect(sideTracker.detect).not.toHaveBeenCalled();
  });

  it("does not write stale detection results after stop while detect is in flight", async () => {
    const frontTracker = createFakeTracker();
    const detectResult =
      createDeferred<ReturnType<typeof createHandDetection>>();
    const bitmapClose = vi.fn();
    frontTracker.detect.mockReturnValueOnce(detectResult.promise);
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 640,
      height: 480,
      close: bitmapClose
    } as ImageBitmap);
    createMediaPipeHandTrackerMock.mockResolvedValueOnce(frontTracker);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });
    videos.frontVideo.fireFrame();

    await vi.waitFor(() => {
      expect(frontTracker.detect).toHaveBeenCalledOnce();
    });
    liveInspection.destroy();
    detectResult.resolve(createHandDetection());

    await vi.waitFor(() => {
      expect(bitmapClose).toHaveBeenCalledOnce();
    });
    expect(liveInspection.getState().frontDetection).toBeUndefined();
  });

  it("maps live side detections into trigger frames and telemetry", async () => {
    const sideTracker = createFakeTracker();
    sideTracker.detect
      .mockResolvedValueOnce(createHandDetectionWithWorld(openWorldLandmarks()))
      .mockResolvedValueOnce(
        createHandDetectionWithWorld(pulledWorldLandmarks())
      )
      .mockResolvedValueOnce(
        createHandDetectionWithWorld(pulledWorldLandmarks())
      );
    createMediaPipeHandTrackerMock.mockResolvedValueOnce(sideTracker);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });
    videos.sideVideo.fireFrame({ captureTime: 100, presentedFrames: 1 });

    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame?.sideTriggerPhase).toBe(
        "SideTriggerOpenReady"
      );
    });

    videos.sideVideo.fireFrame({ captureTime: 110, presentedFrames: 2 });
    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame?.triggerEdge).toBe(
        "pullStarted"
      );
    });

    videos.sideVideo.fireFrame({ captureTime: 120, presentedFrames: 3 });
    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame?.triggerEdge).toBe(
        "shotCommitted"
      );
      expect(liveInspection.getState().sideTriggerTelemetry?.phase).toBe(
        "SideTriggerPulledLatched"
      );
    });
  });

  it("passes live tuning changes to subsequent side trigger mapper updates", async () => {
    const sideTracker = createFakeTracker();
    sideTracker.detect
      .mockResolvedValueOnce(createHandDetectionWithWorld(openWorldLandmarks()))
      .mockResolvedValueOnce(
        createHandDetectionWithWorld(pulledWorldLandmarks())
      )
      .mockResolvedValueOnce(
        createHandDetectionWithWorld(pulledWorldLandmarks())
      );
    createMediaPipeHandTrackerMock.mockResolvedValueOnce(sideTracker);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.setSideTriggerTuning("minPullDwellFrames", 3);
    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });

    videos.sideVideo.fireFrame({ captureTime: 100, presentedFrames: 1 });
    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame?.sideTriggerPhase).toBe(
        "SideTriggerOpenReady"
      );
    });

    videos.sideVideo.fireFrame({ captureTime: 110, presentedFrames: 2 });
    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame?.triggerEdge).toBe(
        "pullStarted"
      );
    });

    videos.sideVideo.fireFrame({ captureTime: 120, presentedFrames: 3 });
    await vi.waitFor(() => {
      expect(sideTracker.detect).toHaveBeenCalledTimes(3);
      expect(liveInspection.getState().sideTriggerFrame?.sideTriggerPhase).toBe(
        "SideTriggerPullCandidate"
      );
    });
    expect(liveInspection.getState().sideTriggerFrame?.triggerEdge).toBe(
      "none"
    );
  });

  it("clears side trigger snapshots when leaving preview", async () => {
    const sideTracker = createFakeTracker();
    sideTracker.detect.mockResolvedValueOnce(
      createHandDetectionWithWorld(openWorldLandmarks())
    );
    createMediaPipeHandTrackerMock.mockResolvedValueOnce(sideTracker);
    const liveInspection = createLiveLandmarkInspection();
    const videos = installPreviewVideos();

    liveInspection.sync({
      screen: "previewing",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: createPinnedStream("front-id"),
      sideStream: createPinnedStream("side-id"),
      error: undefined
    });
    videos.sideVideo.fireFrame();

    await vi.waitFor(() => {
      expect(liveInspection.getState().sideTriggerFrame).toBeDefined();
    });

    liveInspection.sync({
      screen: "deviceSelection",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: undefined,
      sideStream: undefined,
      error: undefined
    });

    expect(liveInspection.getState().sideTriggerFrame).toBeUndefined();
    expect(liveInspection.getState().sideTriggerTelemetry).toBeUndefined();
  });
});
