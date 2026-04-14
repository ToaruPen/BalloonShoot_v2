import { createAudioController, type AudioController } from "../../features/audio/createAudioController";
import { createCameraController, type CameraController } from "../../features/camera/createCameraController";
import {
  createDebugPanel,
  type DebugTelemetry,
  type DebugValues
} from "../../features/debug/createDebugPanel";
import { createGameEngine, registerShot } from "../../features/gameplay/domain/createGameEngine";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTrackerOptions
} from "../../features/hand-tracking/createMediaPipeHandTracker";
import type { HandDetection } from "../../shared/types/hand";
import type { OneEuroFilterConfig } from "../../features/hand-tracking/oneEuroFilter";
import { createLandmarkJitterTracker } from "../../features/hand-tracking/landmarkJitter";
import { measureThumbCosine } from "../../features/input-mapping/evaluateThumbTrigger";
import {
  mapHandToGameInput,
  type InputRuntimeState
} from "../../features/input-mapping/mapHandToGameInput";
import { drawGameFrame } from "../../features/rendering/drawGameFrame";
import { gameConfig } from "../../shared/config/gameConfig";
import { renderShell } from "../screens/renderShell";
import type { AppEvent } from "../state/appState";
import { createInitialAppState, reduceAppEvent } from "../state/reduceAppEvent";

const CROSSHAIR_Y_RATIO = 0.62;

export interface StartAppDebugHooks {
  createHandTracker?: (
    options: MediaPipeHandTrackerOptions
  ) => Promise<HandTrackerLike>;
}

interface ImageCaptureLike {
  grabFrame(): Promise<ImageBitmap>;
}

type HandTrackerLike = Pick<Awaited<ReturnType<typeof createMediaPipeHandTracker>>, "detect">;

type ImageCaptureConstructorLike = new (track: MediaStreamTrack) => ImageCaptureLike;

type CameraFeedListener = (stream: MediaStream | undefined) => void;

let cameraFeedStream: MediaStream | undefined;
let cameraFeedListener: CameraFeedListener | undefined;

const publishCameraFeedStream = (stream: MediaStream | undefined): void => {
  cameraFeedStream = stream;
  cameraFeedListener?.(stream);
};

export const getCameraFeedStream = (): MediaStream | undefined => cameraFeedStream;

const createDefaultDebugValues = (): DebugValues => ({
  smoothingAlpha: gameConfig.input.smoothingAlpha,
  triggerPullThreshold: gameConfig.input.triggerPullThreshold,
  triggerReleaseThreshold: gameConfig.input.triggerReleaseThreshold,
  handFilterMinCutoff: gameConfig.input.handFilterMinCutoff,
  handFilterBeta: gameConfig.input.handFilterBeta,
  fireCooldownFrames: gameConfig.input.fireCooldownFrames,
  fireStableAimFrames: gameConfig.input.fireStableAimFrames,
  stableCrosshairMaxDelta: gameConfig.input.stableCrosshairMaxDelta,
  armedEntryConfidenceBonus: gameConfig.input.armedEntryConfidenceBonus,
  conditionedTriggerPullFloor: gameConfig.input.conditionedTriggerPullFloor,
  conditionedTriggerReleaseFloor: gameConfig.input.conditionedTriggerReleaseFloor
});

interface TelemetryMetrics {
  rawIndexJitter: number;
  filterIndexJitter: number;
  rawTriggerProjection: number;
  filterTriggerProjection: number;
}

const toDebugTelemetry = (
  runtime: InputRuntimeState | undefined,
  metrics: TelemetryMetrics
): DebugTelemetry | undefined =>
  runtime
    ? {
        phase: runtime.phase,
        rejectReason: runtime.rejectReason,
        triggerConfidence: runtime.triggerConfidence,
        gunPoseConfidence: runtime.gunPoseConfidence,
        openFrames: runtime.openFrames,
        pulledFrames: runtime.pulledFrames,
        trackingPresentFrames: runtime.trackingPresentFrames,
        nonGunPoseFrames: runtime.nonGunPoseFrames,
        stableAimFrames: runtime.stableAimFrames,
        cooldownFramesRemaining: runtime.cooldownFramesRemaining,
        conditionedTriggerScalar: runtime.conditionedTriggerScalar,
        conditionedTriggerEdge: runtime.conditionedTriggerEdge,
        fireEligible: runtime.fireEligible,
        shotFiredMarker: runtime.phase === "cooldown" && runtime.conditionedTriggerEdge === "pull",
        ...metrics
      }
    : undefined;

const createImageCapture = (stream: MediaStream): ImageCaptureLike => {
  const ImageCaptureApi = (
    window as Window & {
      ImageCapture?: ImageCaptureConstructorLike;
    }
  ).ImageCapture;
  const videoTrack = stream.getVideoTracks()[0];

  if (!ImageCaptureApi) {
    throw new Error("ImageCapture API is unavailable");
  }

  if (!videoTrack) {
    throw new Error("Camera stream is missing a video track");
  }

  return new ImageCaptureApi(videoTrack);
};

export const resolveOverlayAction = (
  target: Element | null,
  overlayRoot: Pick<HTMLElement, "contains">
): string | undefined => {
  if (!target) {
    return undefined;
  }

  const actionElement = target.closest<HTMLElement>("[data-action]");

  if (!actionElement || !overlayRoot.contains(actionElement)) {
    return undefined;
  }

  return actionElement.dataset["action"];
};

export const startApp = (
  root: HTMLDivElement,
  debugValues: DebugValues = createDefaultDebugValues(),
  debugHooks?: StartAppDebugHooks
): void => {
  let state = createInitialAppState();
  let engine = createGameEngine();
  let audio: AudioController | undefined;
  let camera: CameraController | undefined;
  let countdownTimerId: number | undefined;
  const createHandTracker =
    debugHooks?.createHandTracker ?? createMediaPipeHandTracker;
  let trackerPromise: ReturnType<typeof createHandTracker> | undefined;
  let gameFrameRequestId: number | undefined;
  let trackingFrameRequestId: number | undefined;
  let trackingCapture: ImageCaptureLike | undefined;
  let trackingFramePending = false;
  let inputRuntime: InputRuntimeState | undefined;
  let trackedCrosshair:
    | {
        x: number;
        y: number;
      }
    | undefined;
  let lastFrameAtMs: number | undefined;

  root.innerHTML = `
    <div class="app-layout">
      <div class="camera-underlay" id="camera-root" aria-hidden="true">
        <video class="camera-feed" playsinline muted autoplay></video>
      </div>
      <canvas class="game-canvas"></canvas>
      <div class="overlay-root"></div>
      <div class="debug-root" id="debug-root"></div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".game-canvas");
  const cameraRoot = root.querySelector<HTMLDivElement>("#camera-root");
  const overlayRoot = root.querySelector<HTMLDivElement>(".overlay-root");
  const cameraVideo = root.querySelector<HTMLVideoElement>(".camera-feed");
  const debugRoot = root.querySelector<HTMLElement>("#debug-root");

  if (!canvas || !cameraRoot || !overlayRoot || !cameraVideo || !debugRoot) {
    throw new Error("Missing app shell roots");
  }

  const debugPanel = createDebugPanel(debugValues);
  debugRoot.innerHTML = debugPanel.render();
  debugPanel.bind(
    debugRoot.querySelectorAll<HTMLInputElement>("[data-debug]"),
    debugRoot.querySelectorAll<HTMLElement>("[data-debug-output]")
  );

  const rawJitterTracker = createLandmarkJitterTracker(30);
  const filterJitterTracker = createLandmarkJitterTracker(30);
  let latestRawTriggerProjection = 0;
  let latestFilterTriggerProjection = 0;

  const resetLandmarkMetrics = (): void => {
    rawJitterTracker.reset();
    filterJitterTracker.reset();
    latestRawTriggerProjection = 0;
    latestFilterTriggerProjection = 0;
  };

  const getFilterConfig = (): OneEuroFilterConfig => ({
    minCutoff: debugPanel.values.handFilterMinCutoff,
    beta: debugPanel.values.handFilterBeta,
    dCutoff: gameConfig.input.handFilterDCutoff
  });

  const recordDetectionMetrics = (detection: HandDetection): void => {
    const rawIndexTip = detection.rawFrame.landmarks.indexTip;
    const filteredIndexTip = detection.filteredFrame.landmarks.indexTip;
    rawJitterTracker.push(rawIndexTip.x, rawIndexTip.y);
    filterJitterTracker.push(filteredIndexTip.x, filteredIndexTip.y);
    latestRawTriggerProjection = measureThumbCosine(detection.rawFrame);
    latestFilterTriggerProjection = measureThumbCosine(detection.filteredFrame);
  };

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const resizeCanvas = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const stopCountdown = (): void => {
    if (countdownTimerId === undefined) {
      return;
    }

    window.clearInterval(countdownTimerId);
    countdownTimerId = undefined;
  };

  const stopGameLoop = (): void => {
    if (gameFrameRequestId === undefined) {
      return;
    }

    window.cancelAnimationFrame(gameFrameRequestId);
    gameFrameRequestId = undefined;
    lastFrameAtMs = undefined;
  };

  const stopTrackerLoop = (): void => {
    if (trackingFrameRequestId !== undefined) {
      window.cancelAnimationFrame(trackingFrameRequestId);
      trackingFrameRequestId = undefined;
    }

    trackingCapture = undefined;
    trackingFramePending = false;
  };

  const logAudioPlaybackFailure = (label: string) => (error: unknown): void => {
    console.error(`${label} playback failed`, error);
  };

  const handleCameraFailure = (error: unknown): void => {
    stopCountdown();
    stopTrackerLoop();
    stopGameLoop();
    audio?.stopBgm();
    camera?.stop();
    publishCameraFeedStream(undefined);
    trackerPromise = undefined;
    inputRuntime = undefined;
    trackedCrosshair = undefined;
    resetLandmarkMetrics();
    debugPanel.setTelemetry(undefined);
    engine = createGameEngine();
    state = createInitialAppState();
    console.error("Camera startup failed", error);
    render();
  };

  const getTrackerPromise = (): ReturnType<typeof createHandTracker> => {
    trackerPromise ??= createHandTracker({
      getFilterConfig
    }).catch((error: unknown) => {
      trackerPromise = undefined;
      throw error;
    });

    return trackerPromise;
  };

  const syncScore = (): void => {
    state = reduceAppEvent(state, {
      type: "SCORE_SYNC",
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    });
  };

  const render = (): void => {
    overlayRoot.innerHTML = renderShell(state);
    const crosshair =
      state.screen === "playing"
        ? inputRuntime?.phase === "tracking_lost"
          ? undefined
          : trackedCrosshair ??
            inputRuntime?.crosshair ?? {
              x: canvas.width / 2,
              y: canvas.height * CROSSHAIR_Y_RATIO
            }
        : undefined;

    drawGameFrame(ctx, {
      balloons: engine.balloons,
      ...(crosshair === undefined ? {} : { crosshair })
    });
  };

  const finishRound = (): void => {
    syncScore();
    state = reduceAppEvent(state, { type: "TIME_UP" });
    stopTrackerLoop();
    stopGameLoop();
    render();
  };

  const processTrackingFrame = async (frameAtMs: number): Promise<void> => {
    if (trackingFrameRequestId === undefined) {
      return;
    }

    trackingFrameRequestId = window.requestAnimationFrame((nextFrameAtMs) => {
      void processTrackingFrame(nextFrameAtMs);
    });

    if (trackingFramePending || state.screen !== "playing") {
      return;
    }

    const stream = getCameraFeedStream();

    if (!stream) {
      return;
    }

    trackingFramePending = true;

    try {
      trackingCapture ??= createImageCapture(stream);

      const tracker = await getTrackerPromise();
      const bitmap = await trackingCapture.grabFrame();

      try {
        const detection = await tracker.detect(bitmap, frameAtMs);

        if (detection) {
          recordDetectionMetrics(detection);
        } else {
          resetLandmarkMetrics();
        }

        const input = mapHandToGameInput(
          detection,
          { width: canvas.width, height: canvas.height },
          inputRuntime,
          debugPanel.values
        );

        const previousTrackedCrosshair = trackedCrosshair;

        inputRuntime = input.runtime;
        trackedCrosshair = input.crosshair;
        debugPanel.setTelemetry(
          toDebugTelemetry(input.runtime, {
            rawIndexJitter: rawJitterTracker.peek(),
            filterIndexJitter: filterJitterTracker.peek(),
            rawTriggerProjection: latestRawTriggerProjection,
            filterTriggerProjection: latestFilterTriggerProjection
          })
        );

        if (input.runtime.phase === "tracking_lost") {
          render();
        }

        if (input.shotFired) {
          void audio?.playShot().catch(logAudioPlaybackFailure("Shot"));

          const scoreBefore = engine.score;
          const shotCrosshair = input.crosshair ?? previousTrackedCrosshair;

          if (shotCrosshair) {
            registerShot(engine, {
              x: shotCrosshair.x,
              y: shotCrosshair.y,
              // `hit: true` opts this shot into collision detection inside the engine.
              hit: true
            });
          }

          if (engine.score > scoreBefore) {
            void audio?.playHit().catch(logAudioPlaybackFailure("Hit"));
          }

          syncScore();
          render();
        }
      } finally {
        bitmap.close();
      }
    } catch (error) {
      handleCameraFailure(error);
    } finally {
      trackingFramePending = false;
    }
  };

  const startTrackerLoop = (): void => {
    if (trackingFrameRequestId !== undefined) {
      return;
    }

    trackingFrameRequestId = window.requestAnimationFrame((frameAtMs) => {
      void processTrackingFrame(frameAtMs);
    });
  };

  const handleTimeUp = (): void => {
    stopTrackerLoop();
    audio?.stopBgm();
    void audio?.playTimeout().catch(logAudioPlaybackFailure("Timeout"));
    void audio?.playResult().catch(logAudioPlaybackFailure("Result"));
    finishRound();
  };

  const tickGameLoop = (frameAtMs: number): void => {
    if (state.screen !== "playing") {
      stopGameLoop();
      return;
    }

    lastFrameAtMs ??= frameAtMs;

    const deltaMs = Math.min(32, frameAtMs - lastFrameAtMs);
    lastFrameAtMs = frameAtMs;

    engine.advance(deltaMs, Math.random);
    syncScore();
    render();

    if (engine.timeRemainingMs <= 0) {
      handleTimeUp();
      return;
    }

    gameFrameRequestId = window.requestAnimationFrame(tickGameLoop);
  };

  const startPlaying = (): void => {
    stopGameLoop();
    syncScore();
    render();
    gameFrameRequestId = window.requestAnimationFrame(tickGameLoop);
  };

  const startCountdown = (): void => {
    stopCountdown();
    render();

    let secondsRemaining = 3;

    countdownTimerId = window.setInterval(() => {
      secondsRemaining -= 1;
      state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining });
      render();

      if (secondsRemaining > 0) {
        return;
      }

      stopCountdown();
      startPlaying();
    }, 1_000);
  };

  const dispatch = (event: AppEvent): void => {
    if (event.type === "START_CLICKED") {
      const nextState = reduceAppEvent(state, event);

      if (nextState === state) {
        return;
      }

      state = nextState;
      stopGameLoop();
      inputRuntime = undefined;
      trackedCrosshair = undefined;
      resetLandmarkMetrics();
      debugPanel.setTelemetry(undefined);
      engine = createGameEngine();
      void audio?.startBgm().catch(logAudioPlaybackFailure("BGM"));
      startTrackerLoop();
      startCountdown();
      return;
    }

    if (event.type === "RETRY_CLICKED") {
      const nextState = reduceAppEvent(state, event);

      if (nextState === state) {
        return;
      }

      stopCountdown();
      stopTrackerLoop();
      stopGameLoop();
      audio?.stopBgm();
      camera?.stop();
      publishCameraFeedStream(undefined);
      inputRuntime = undefined;
      trackedCrosshair = undefined;
      resetLandmarkMetrics();
      debugPanel.setTelemetry(undefined);
      engine = createGameEngine();
      state = nextState;
      render();
      return;
    }

    state = reduceAppEvent(state, event);
    render();
  };

  overlayRoot.addEventListener("click", (event) => {
    const target = event.target;
    const action = target instanceof Element ? resolveOverlayAction(target, overlayRoot) : undefined;

    if (action === "camera") {
      audio ??= createAudioController();
      camera ??= createCameraController();
      // Prewarm the MediaPipe tracker asynchronously. If this fails (e.g.
      // missing model asset, CDN hiccup), log and continue: the tracker loop
      // will retry when gameplay actually starts, and camera-ready should not
      // depend on tracker readiness.
      void getTrackerPromise().catch((error: unknown) => {
        console.error("Tracker prewarm failed; will retry on first frame", error);
      });

      void camera
        .requestStream()
        .then((stream) => {
          cameraVideo.srcObject = stream;
          // Autoplay with muted is allowed without a gesture in Chrome; the
          // promise is ignored because the `muted` attribute covers the
          // autoplay policy and any exception would only affect playback
          // visuals, not the state transition.
          void cameraVideo.play().catch(() => undefined);
          publishCameraFeedStream(stream);
          dispatch({ type: "CAMERA_READY" });
        })
        .catch(handleCameraFailure);
      return;
    }

    if (action === "start") {
      dispatch({ type: "START_CLICKED" });
      return;
    }

    if (action === "retry") {
      dispatch({ type: "RETRY_CLICKED" });
    }
  });

  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });
  render();
};
