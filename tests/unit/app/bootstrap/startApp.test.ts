import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugTelemetry } from "../../../../src/features/debug/createDebugPanel";
import type { MediaPipeHandTrackerOptions } from "../../../../src/features/hand-tracking/createMediaPipeHandTracker";
import type { HandDetection, HandFrame } from "../../../../src/shared/types/hand";
import {
  asDetection,
  createThumbTriggerFrame,
  withThumbTriggerPose
} from "../../features/input-mapping/thumbTriggerTestHelper";

interface ScriptedHandTracker {
  detect: (
    bitmap: ImageBitmap,
    frameAtMs: number
  ) => Promise<HandDetection | undefined>;
}

const {
  createAudioControllerMock,
  createCameraControllerMock,
  createMediaPipeHandTrackerMock,
  createGameEngineMock,
  registerShotMock,
  drawGameFrameMock,
  createDebugPanelMock,
  debugPanelInstance,
  telemetryCalls,
  inputConfig
} = vi.hoisted(() => {
  const inputConfig = {
    smoothingAlpha: 0.28,
    triggerPullThreshold: 0.45,
    triggerReleaseThreshold: 0.25,
    handFilterMinCutoff: 1.0,
    handFilterBeta: 0,
    handFilterDCutoff: 1.0,
    fireCooldownFrames: 2,
    fireStableAimFrames: 2,
    stableCrosshairMaxDelta: 18,
    armedEntryConfidenceBonus: 0
  };
  const telemetryCalls: DebugTelemetry[] = [];
  const debugPanelInstance = {
    values: { ...inputConfig },
    render: vi.fn(() => `<aside class="debug-panel"></aside>`),
    bind: vi.fn(() => undefined),
    setTelemetry: vi.fn((telemetry: DebugTelemetry | undefined) => {
      if (telemetry) {
        telemetryCalls.push(telemetry);
      }

      return undefined;
    })
  };
  return {
    createAudioControllerMock: vi.fn(),
    createCameraControllerMock: vi.fn(),
    createMediaPipeHandTrackerMock: vi.fn(),
    createGameEngineMock: vi.fn(() => ({
      score: 0,
      combo: 0,
      multiplier: 1,
      balloons: [],
      timeRemainingMs: 60_000,
      advance: vi.fn()
    })),
    registerShotMock: vi.fn(),
    drawGameFrameMock: vi.fn(),
    createDebugPanelMock: vi.fn(() => debugPanelInstance),
    debugPanelInstance,
    telemetryCalls,
    inputConfig
  };
});

vi.mock("../../../../src/features/audio/createAudioController", () => ({
  createAudioController: createAudioControllerMock
}));

vi.mock("../../../../src/features/camera/createCameraController", () => ({
  createCameraController: createCameraControllerMock
}));

vi.mock(
  "../../../../src/features/hand-tracking/createMediaPipeHandTracker",
  () => ({
    createMediaPipeHandTracker: createMediaPipeHandTrackerMock
  })
);

vi.mock("../../../../src/features/gameplay/domain/createGameEngine", () => ({
  createGameEngine: createGameEngineMock,
  registerShot: registerShotMock
}));

vi.mock("../../../../src/features/rendering/drawGameFrame", () => ({
  drawGameFrame: drawGameFrameMock
}));

vi.mock("../../../../src/features/debug/createDebugPanel", () => ({
  createDebugPanel: createDebugPanelMock
}));

vi.mock("../../../../src/shared/config/gameConfig", () => ({
  gameConfig: {
    camera: { width: 640, height: 480 },
    input: inputConfig
  }
}));

vi.mock("../../../../src/app/screens/renderShell", () => ({
  renderShell: (state: { screen: string }) =>
    `<div data-screen="${state.screen}"><button data-action="${
      state.screen === "permission"
        ? "camera"
        : state.screen === "ready"
          ? "start"
          : "retry"
    }"></button></div>`
}));

class FakeElement {
  constructor(
    readonly dataset: { action?: string } = {},
    private readonly closestResult: FakeElement | null = null
  ) {}

  closest(): FakeElement | null {
    return this.closestResult;
  }
}

class FakeOverlayRoot {
  innerHTML = "";
  private clickHandler: ((event: { target: unknown }) => void) | undefined;

  addEventListener(
    type: string,
    handler: (event: { target: unknown }) => void
  ): void {
    if (type === "click") {
      this.clickHandler = handler;
    }
  }

  contains(value: unknown): boolean {
    return value instanceof FakeElement;
  }

  click(action: string): void {
    if (!this.innerHTML.includes(`data-action="${action}"`)) {
      throw new Error(
        `Action "${action}" is not rendered in the current screen`
      );
    }

    const actionElement = new FakeElement({ action });
    const target = new FakeElement({}, actionElement);

    this.clickHandler?.({ target });
  }
}

const createFakeRoot = () => {
  const overlayRoot = new FakeOverlayRoot();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({}))
  };
  const cameraRoot = {};
  const cameraVideo = {
    srcObject: null as MediaStream | null,
    play: vi.fn(() => Promise.resolve())
  };
  const debugRoot = {
    innerHTML: "",
    querySelectorAll: vi.fn(() => [])
  };
  const selectors = new Map<string, unknown>([
    [".game-canvas", canvas],
    ["#camera-root", cameraRoot],
    [".overlay-root", overlayRoot],
    [".camera-feed", cameraVideo],
    ["#debug-root", debugRoot]
  ]);
  const root = {
    innerHTML: "",
    querySelector: vi.fn((selector: string) => selectors.get(selector) ?? null)
  };

  return {
    root,
    overlayRoot,
    cameraVideo,
    debugRoot
  };
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createScriptedHandFrames = (): HandFrame[] => [
  withThumbTriggerPose(createThumbTriggerFrame("open"), "open"),
  withThumbTriggerPose(createThumbTriggerFrame("open"), "open"),
  withThumbTriggerPose(createThumbTriggerFrame("open"), "open"),
  withThumbTriggerPose(createThumbTriggerFrame("pulled"), "pulled"),
  withThumbTriggerPose(createThumbTriggerFrame("pulled"), "pulled")
];

const createScriptedHandDetections = (): HandDetection[] =>
  createScriptedHandFrames().map(asDetection);

const createTrackingLossHandDetections = (): (HandDetection | undefined)[] => [
  asDetection(withThumbTriggerPose(createThumbTriggerFrame("open"), "open")),
  asDetection(withThumbTriggerPose(createThumbTriggerFrame("open"), "open")),
  undefined,
  undefined,
  asDetection(withThumbTriggerPose(createThumbTriggerFrame("open"), "open")),
  asDetection(withThumbTriggerPose(createThumbTriggerFrame("open"), "open"))
];

const mockAudioAndCameraControllers = (
  requestStream: () => Promise<unknown>,
  stop = vi.fn()
): typeof stop => {
  createAudioControllerMock.mockReturnValue({
    startBgm: vi.fn(() => Promise.resolve()),
    stopBgm: vi.fn(),
    playShot: vi.fn(() => Promise.resolve()),
    playHit: vi.fn(() => Promise.resolve()),
    playTimeout: vi.fn(() => Promise.resolve()),
    playResult: vi.fn(() => Promise.resolve())
  });
  createCameraControllerMock.mockReturnValue({
    requestStream: vi.fn(requestStream),
    stop
  });

  return stop;
};

describe("startApp", () => {
  let intervalCallback: (() => void) | undefined;
  let animationFrameCallbacks: (FrameRequestCallback | undefined)[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    telemetryCalls.length = 0;

    let nextAnimationFrameId = 1;
    animationFrameCallbacks = [];
    intervalCallback = undefined;

    vi.stubGlobal("Element", FakeElement);

    vi.stubGlobal("window", {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: vi.fn(),
      setInterval: vi.fn((callback: () => void) => {
        intervalCallback = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        const id = nextAnimationFrameId;
        nextAnimationFrameId += 1;
        animationFrameCallbacks[id - 1] = callback;
        return id;
      }),
      cancelAnimationFrame: vi.fn((id: number) => {
        animationFrameCallbacks[id - 1] = undefined;
      }),
      ImageCapture: class {
        grabFrame(): Promise<ImageBitmap> {
          return Promise.resolve({
            width: 640,
            height: 480,
            close: vi.fn()
          } as unknown as ImageBitmap);
        }
      }
    });

    vi.stubGlobal("console", {
      ...console,
      error: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runNextAnimationFrame = async (timestamp = 0): Promise<void> => {
    const callbackIndex = animationFrameCallbacks.findIndex(
      (callback) => callback !== undefined
    );

    if (callbackIndex === -1) {
      throw new Error("Expected an animation frame callback to be queued");
    }

    const callback = animationFrameCallbacks[callbackIndex];
    if (!callback) {
      throw new Error("Expected an animation frame callback to be queued");
    }

    animationFrameCallbacks[callbackIndex] = undefined;
    callback(timestamp);
    await flushPromises();
  };

  const tickCountdown = async (ticks: number): Promise<void> => {
    for (let index = 0; index < ticks; index += 1) {
      intervalCallback?.();
      await flushPromises();
    }
  };

  it("seeds the debug panel from shared input config", async () => {
    mockAudioAndCameraControllers(() =>
      Promise.resolve({ getTracks: () => [], getVideoTracks: () => [] })
    );
    createMediaPipeHandTrackerMock.mockResolvedValue({ detect: vi.fn() });

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);

    expect(createDebugPanelMock).toHaveBeenCalledWith({
      smoothingAlpha: inputConfig.smoothingAlpha,
      triggerPullThreshold: inputConfig.triggerPullThreshold,
      triggerReleaseThreshold: inputConfig.triggerReleaseThreshold,
      handFilterMinCutoff: inputConfig.handFilterMinCutoff,
      handFilterBeta: inputConfig.handFilterBeta,
      fireCooldownFrames: inputConfig.fireCooldownFrames,
      fireStableAimFrames: inputConfig.fireStableAimFrames,
      stableCrosshairMaxDelta: inputConfig.stableCrosshairMaxDelta,
      armedEntryConfidenceBonus: inputConfig.armedEntryConfidenceBonus
    });
    expect(debugPanelInstance.render).toHaveBeenCalled();
    expect(debugPanelInstance.bind).toHaveBeenCalled();
  });

  it("clears the prewarmed tracker promise when camera startup fails so the user can retry", async () => {
    const cameraStop = vi.fn();
    mockAudioAndCameraControllers(
      () => Promise.reject(new Error("camera denied")),
      cameraStop
    );
    createMediaPipeHandTrackerMock.mockResolvedValue({
      detect: vi.fn()
    });

    const { getCameraFeedStream, startApp } =
      await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    expect(cameraStop).toHaveBeenCalledTimes(1);
    expect(getCameraFeedStream()).toBeUndefined();
    expect(overlayRoot.innerHTML).toContain('data-screen="permission"');

    overlayRoot.click("camera");
    await flushPromises();

    expect(createMediaPipeHandTrackerMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a debug-only synthetic hand tracker factory for scripted frame sequences", async () => {
    const createHandTracker = vi.fn(() =>
      Promise.resolve<ScriptedHandTracker>({
        detect: vi.fn(() => Promise.resolve(undefined as HandDetection | undefined))
      })
    );
    const scriptedDetections = createScriptedHandDetections();
    const scriptedTracker: ScriptedHandTracker = {
      detect: vi.fn(() => Promise.resolve(scriptedDetections.shift()))
    };

    mockAudioAndCameraControllers(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
      } as unknown as MediaStream)
    );

    createHandTracker.mockResolvedValue(scriptedTracker);

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    (
      startApp as unknown as (
        root: HTMLDivElement,
        debugValues: unknown,
        debugHooks: { createHandTracker: typeof createHandTracker }
      ) => void
    )(root as unknown as HTMLDivElement, undefined, { createHandTracker });

    overlayRoot.click("camera");
    await flushPromises();
    expect(createMediaPipeHandTrackerMock).not.toHaveBeenCalled();
    expect(createHandTracker).toHaveBeenCalledTimes(1);

    overlayRoot.click("start");
    await tickCountdown(3);

    for (let index = 0; index < 9; index += 1) {
      await runNextAnimationFrame();
    }

    expect(scriptedTracker.detect).toHaveBeenCalledTimes(5);
    expect(scriptedDetections).toHaveLength(0);
  });

  it("bridges mapper runtime telemetry into the debug panel without affecting gameplay flow", async () => {
    const createHandTracker = vi.fn(() =>
      Promise.resolve<ScriptedHandTracker>({
        detect: vi.fn(() => Promise.resolve(undefined as HandDetection | undefined))
      })
    );
    const scriptedDetections = createScriptedHandDetections();
    const scriptedTracker: ScriptedHandTracker = {
      detect: vi.fn(() => Promise.resolve(scriptedDetections.shift()))
    };

    mockAudioAndCameraControllers(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
      } as unknown as MediaStream)
    );

    createHandTracker.mockResolvedValue(scriptedTracker);

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    (
      startApp as unknown as (
        root: HTMLDivElement,
        debugValues: unknown,
        debugHooks: { createHandTracker: typeof createHandTracker }
      ) => void
    )(root as unknown as HTMLDivElement, undefined, { createHandTracker });

    overlayRoot.click("camera");
    await flushPromises();
    overlayRoot.click("start");
    await tickCountdown(3);

    for (let index = 0; index < 7; index += 1) {
      await runNextAnimationFrame();
    }

    const lastTelemetry = telemetryCalls.at(-1);

    expect(debugPanelInstance.setTelemetry).toHaveBeenCalled();
    expect(lastTelemetry).toBeDefined();
    if (!lastTelemetry) {
      throw new Error("Expected telemetry to be present");
    }

    expect(typeof lastTelemetry.phase).toBe("string");
    expect(typeof lastTelemetry.rejectReason).toBe("string");
    expect(lastTelemetry.triggerConfidence).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.gunPoseConfidence).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.openFrames).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.pulledFrames).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.trackingPresentFrames).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.nonGunPoseFrames).toBeGreaterThanOrEqual(0);
    expect(lastTelemetry.conditionedTriggerScalar).toBeGreaterThanOrEqual(0);
    expect(typeof lastTelemetry.conditionedTriggerEdge).toBe("string");
    expect(typeof lastTelemetry.fireEligible).toBe("boolean");
    expect(typeof lastTelemetry.shotFiredMarker).toBe("boolean");
    expect(
      telemetryCalls.some((telemetry) => telemetry.phase === "armed")
    ).toBe(true);
  });

  it("hides the crosshair while tracking is lost and restores it after reacquisition", async () => {
    const createHandTracker = vi.fn(() =>
      Promise.resolve<ScriptedHandTracker>({
        detect: vi.fn(() => Promise.resolve(undefined as HandDetection | undefined))
      })
    );
    const scriptedDetections = createTrackingLossHandDetections();
    const scriptedTracker: ScriptedHandTracker = {
      detect: vi.fn(() => Promise.resolve(scriptedDetections.shift()))
    };

    createAudioControllerMock.mockReturnValue({
      startBgm: vi.fn(() => Promise.resolve()),
      stopBgm: vi.fn(),
      playShot: vi.fn(() => Promise.resolve()),
      playHit: vi.fn(() => Promise.resolve()),
      playTimeout: vi.fn(() => Promise.resolve()),
      playResult: vi.fn(() => Promise.resolve())
    });
    createCameraControllerMock.mockReturnValue({
      requestStream: vi.fn(() =>
        Promise.resolve({
          getTracks: () => [],
          getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
        } as unknown as MediaStream)
      ),
      stop: vi.fn()
    });

    createHandTracker.mockResolvedValue(scriptedTracker);

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    (
      startApp as unknown as (
        root: HTMLDivElement,
        debugValues: unknown,
        debugHooks: { createHandTracker: typeof createHandTracker }
      ) => void
    )(root as unknown as HTMLDivElement, undefined, { createHandTracker });

    overlayRoot.click("camera");
    await flushPromises();

    overlayRoot.click("start");
    await tickCountdown(2);

    const drawCallsBeforePlaying = drawGameFrameMock.mock.calls.length;

    await tickCountdown(1);

    expect(overlayRoot.innerHTML).toContain('data-screen="playing"');

    for (let index = 0; index < 20; index += 1) {
      await runNextAnimationFrame();
    }

    const drawCalls = drawGameFrameMock.mock.calls
      .slice(drawCallsBeforePlaying)
      .map(
        ([, state]) =>
          state as {
            crosshair?: { x: number; y: number };
          }
      );

    const crosshairTransitions = drawCalls.reduce<("defined" | "undefined")[]>(
      (transitions, state) => {
        const nextTransition =
          state.crosshair === undefined ? "undefined" : "defined";

        if (transitions.at(-1) !== nextTransition) {
          transitions.push(nextTransition);
        }

        return transitions;
      },
      []
    );

    expect(crosshairTransitions.slice(0, 3)).toEqual([
      "defined",
      "undefined",
      "defined"
    ]);
  });

  it("clears landmark jitter when tracking is lost before measuring reacquired hands", async () => {
    const firstFrame = withThumbTriggerPose(
      createThumbTriggerFrame("open"),
      "open"
    );
    const reacquiredBaseFrame = createThumbTriggerFrame("open");
    const reacquiredFrame = withThumbTriggerPose(
      {
        ...reacquiredBaseFrame,
        landmarks: {
          ...reacquiredBaseFrame.landmarks,
          indexTip: { x: 0.8, y: 0.3, z: 0 }
        }
      },
      "open"
    );
    const scriptedDetections: (HandDetection | undefined)[] = [
      asDetection(firstFrame),
      undefined,
      asDetection(reacquiredFrame)
    ];
    const detectMock = vi.fn(() => Promise.resolve(scriptedDetections.shift()));
    const scriptedTracker: ScriptedHandTracker = {
      detect: detectMock
    };
    const createHandTracker = vi.fn(() => Promise.resolve(scriptedTracker));

    mockAudioAndCameraControllers(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
      } as unknown as MediaStream)
    );

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    (
      startApp as unknown as (
        root: HTMLDivElement,
        debugValues: unknown,
        debugHooks: { createHandTracker: typeof createHandTracker }
      ) => void
    )(root as unknown as HTMLDivElement, undefined, { createHandTracker });

    overlayRoot.click("camera");
    await flushPromises();
    overlayRoot.click("start");
    await tickCountdown(3);

    while (detectMock.mock.calls.length < 3) {
      await runNextAnimationFrame();
    }

    const lastTelemetry = telemetryCalls.at(-1);

    expect(lastTelemetry?.rawIndexJitter).toBeCloseTo(0);
  });

  it("keeps the app in ready state when tracker prewarm fails (non-fatal)", async () => {
    const trackerStartupError = new Error("tracker prewarm failed");
    const cameraStop = vi.fn();
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => []
    } as unknown as MediaStream;

    mockAudioAndCameraControllers(() => Promise.resolve(stream), cameraStop);
    createMediaPipeHandTrackerMock.mockImplementationOnce(() =>
      Promise.reject(trackerStartupError)
    );

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    // Tracker prewarm failure is logged but non-fatal: state should reach ready,
    // not get reset back to permission.
    expect(cameraStop).not.toHaveBeenCalled();
    expect(overlayRoot.innerHTML).toContain('data-screen="ready"');
  });

  it("passes a live 1euro config closure and records raw-vs-filtered jitter from detections", async () => {
    mockAudioAndCameraControllers(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
      } as unknown as MediaStream)
    );

    const baseFrame = createThumbTriggerFrame("open");
    const withIndexTipX = (frame: HandFrame, x: number): HandFrame => ({
      ...frame,
      landmarks: { ...frame.landmarks, indexTip: { x, y: 0.2, z: 0 } }
    });

    // Raw swings between 0.1 and 0.5 while the filtered side stays near 0.1 —
    // mirrors what the 1€ filter produces when raw landmarks jitter.
    const scriptedDetections: HandDetection[] = [
      {
        rawFrame: withIndexTipX(baseFrame, 0.1),
        filteredFrame: withIndexTipX(baseFrame, 0.1)
      },
      {
        rawFrame: withIndexTipX(baseFrame, 0.5),
        filteredFrame: withIndexTipX(baseFrame, 0.15)
      }
    ];
    const scriptedTracker: ScriptedHandTracker = {
      detect: vi.fn(() => Promise.resolve(scriptedDetections.shift()))
    };
    let capturedOptions: MediaPipeHandTrackerOptions | undefined;
    createMediaPipeHandTrackerMock.mockImplementation((options: MediaPipeHandTrackerOptions) => {
      capturedOptions = options;
      return Promise.resolve(scriptedTracker);
    });

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    expect(createMediaPipeHandTrackerMock).toHaveBeenCalledTimes(1);
    expect(typeof capturedOptions?.getFilterConfig).toBe("function");

    debugPanelInstance.values.handFilterMinCutoff = 3.0;
    debugPanelInstance.values.handFilterBeta = 0.04;

    expect(capturedOptions?.getFilterConfig()).toEqual({
      minCutoff: 3.0,
      beta: 0.04,
      dCutoff: 1.0
    });

    overlayRoot.click("start");
    await tickCountdown(3);

    // Cycle animation frames until processTrackingFrame has recorded both
    // detections — the queue also carries the game-loop callback, which
    // interleaves with the tracker loop. Bounded so a regression cannot hang.
    const detectMock = scriptedTracker.detect as ReturnType<typeof vi.fn>;
    for (
      let attempts = 0;
      detectMock.mock.calls.length < 2 && attempts < 20;
      attempts += 1
    ) {
      await runNextAnimationFrame();
    }

    expect(detectMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    const lastTelemetry = telemetryCalls.at(-1);
    expect(lastTelemetry?.rawIndexJitter).toBeGreaterThan(
      lastTelemetry?.filterIndexJitter ?? Number.POSITIVE_INFINITY
    );
  });
});
