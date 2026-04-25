import {
  createAudioController,
  type AudioController
} from "../features/audio/createAudioController";
import {
  createDevicePinnedStream,
  type DevicePinnedStream
} from "../features/camera/createDevicePinnedStream";
import { createFrameTimestamp } from "../features/camera/frameTimestamp";
import { observeTrackEnded } from "../features/camera/observeTrackEnded";
import {
  createFrontAimMapper,
  defaultFrontAimCalibration,
  getFrontAimFilterConfig,
  resolveFrontAimViewportSize,
  toFrontDetection
} from "../features/front-aim";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTracker
} from "../features/hand-tracking/createMediaPipeHandTracker";
import {
  createInputFusionMapper,
  defaultFusionTuning,
  type InputFusionMapper
} from "../features/input-fusion";
import {
  createCycleDrivenSideTriggerMapper,
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning,
  getSideTriggerFilterConfig,
  toSideDetection,
  type CycleDrivenSideTriggerMapper
} from "../features/side-trigger";
import { drawGameFrame } from "../features/rendering/drawGameFrame";
import {
  activeHitPopEffects,
  createHitPopEffect,
  type HitPopEffect,
  type TimedPointEffect
} from "../features/rendering/arcadeEffects";
import { arcadePalette } from "../features/rendering/arcadeTheme";
import type { BalloonSprites } from "../features/rendering/balloonSpriteUtils";
import { createBalloonSpriteLoader } from "../features/rendering/createBalloonSpriteLoader";
import { loadBalloonSprites } from "./loadBalloonSpritesAdapter";
import type { Balloon } from "../features/gameplay/domain/balloon";
import {
  createGameEngine,
  registerShot,
  type GameEngine
} from "../features/gameplay/domain/createGameEngine";
import {
  createFusedGameInputAdapter,
  readFusedGameInput,
  resetFusedGameInputAdapter
} from "../features/gameplay/domain/fusedGameInput";
import {
  advanceGameSession,
  createInitialGameSession,
  retryGameSession,
  startGameSession,
  type GameSession
} from "../features/gameplay/domain/gameSession";
import type {
  FusedGameInputFrame,
  FusionRejectReason
} from "../shared/types/fusion";
import type { FrameTimestamp, LaneHealthStatus } from "../shared/types/camera";
import type { HandDetection } from "../shared/types/hand";
import { renderGameHud } from "./gameHud";

type RequestAnimationFrameLike = (callback: FrameRequestCallback) => number;
type CancelAnimationFrameLike = (handle: number) => void;

interface FrameTimingLike {
  readonly captureTime?: number;
  readonly expectedDisplayTime?: number;
  readonly presentedFrames?: number;
}

interface BalloonGameRuntimeOptions {
  readonly frontDeviceId: string;
  readonly sideDeviceId: string;
  readonly frontVideo: HTMLVideoElement;
  readonly sideVideo: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly readFusedInputFrame?: () => FusedGameInputFrame | undefined;
  readonly initialBalloons?: readonly Balloon[];
  readonly random?: () => number;
  readonly nowMs?: () => number;
  readonly createAudioController?: () => AudioController;
  readonly drawGameFrame?: typeof drawGameFrame;
  readonly loadBalloonSprites?: () => Promise<BalloonSprites>;
  readonly requestAnimationFrame?: RequestAnimationFrameLike;
  readonly cancelAnimationFrame?: CancelAnimationFrameLike;
  readonly createDevicePinnedStream?: (
    deviceId: string
  ) => Promise<DevicePinnedStream>;
  readonly createMediaPipeHandTracker?: typeof createMediaPipeHandTracker;
  readonly createImageBitmap?: (
    source: HTMLVideoElement
  ) => Promise<ImageBitmap>;
}

export interface BalloonGameRuntime {
  start(): void;
  retry(): void;
  destroy(): void;
}

const positiveDimension = (value: number): number | undefined =>
  value > 0 ? value : undefined;

const viewportSizeFor = (
  canvas: HTMLCanvasElement
): { width: number; height: number } => ({
  width:
    positiveDimension(canvas.clientWidth) ??
    positiveDimension(canvas.width) ??
    1,
  height:
    positiveDimension(canvas.clientHeight) ??
    positiveDimension(canvas.height) ??
    1
});

const syncCanvasSize = (canvas: HTMLCanvasElement): void => {
  const viewport = viewportSizeFor(canvas);

  if (canvas.width !== viewport.width) {
    canvas.width = viewport.width;
  }

  if (canvas.height !== viewport.height) {
    canvas.height = viewport.height;
  }
};

const readyStateForCurrentData = (): number =>
  (globalThis as { HTMLMediaElement?: { HAVE_CURRENT_DATA?: number } })
    .HTMLMediaElement?.HAVE_CURRENT_DATA ?? 2;

const videoReadyForBitmap = (video: HTMLVideoElement): boolean =>
  video.readyState >= readyStateForCurrentData() &&
  video.videoWidth > 0 &&
  video.videoHeight > 0;

const defaultCreateImageBitmap = (
  source: HTMLVideoElement
): Promise<ImageBitmap> => createImageBitmap(source);

// ~15fps fallback for browsers without requestVideoFrameCallback.
const VIDEO_FRAME_FALLBACK_INTERVAL_MS = 66;

// Ten consecutive frame failures spans ~330ms at 30fps, enough for transient browser hiccups.
export const MAX_CONSECUTIVE_FRAME_ERRORS = 10;

const HIT_BGM_DUCK_VOLUME = 0.07;
const HIT_BGM_RESTORE_DELAY_MS = 200;

const degradedInputMessages = {
  frontMissing: "正面カメラの入力を待っています",
  frontStale: "正面カメラの入力を待っています",
  sideMissing: "サイドカメラの入力を待っています",
  sideStale: "サイドカメラの入力を待っています",
  laneFailed: "カメラが失敗しました。リトライしてください",
  timestampGapTooLarge: "タイミングずれを再同期中"
} satisfies Record<Exclude<FusionRejectReason, "none">, string>;

const statusMessageForFusedFrame = (
  frame: FusedGameInputFrame | undefined
): string | undefined => {
  if (frame === undefined) {
    return "入力を準備中";
  }

  if (
    frame.fusionRejectReason === "laneFailed" &&
    (frame.frontSource.laneHealth === "captureLost" ||
      frame.sideSource.laneHealth === "captureLost")
  ) {
    return "カメラが切断されました";
  }

  if (frame.fusionRejectReason !== "none") {
    return degradedInputMessages[frame.fusionRejectReason];
  }

  return frame.fusionMode === "noUsableInput" ? "入力を準備中" : undefined;
};

const removeItem = <T>(items: T[], item: T): void => {
  const index = items.indexOf(item);

  if (index !== -1) {
    items.splice(index, 1);
  }
};

export const createBalloonGameRuntime = ({
  canvas,
  hudRoot,
  readFusedInputFrame,
  initialBalloons,
  random = Math.random,
  nowMs = () => performance.now(),
  createAudioController: createAudio = createAudioController,
  drawGameFrame: renderFrame = drawGameFrame,
  loadBalloonSprites: loadSprites = loadBalloonSprites,
  requestAnimationFrame: requestFrame = (callback) =>
    window.requestAnimationFrame(callback),
  cancelAnimationFrame: cancelFrame = (handle) => {
    window.cancelAnimationFrame(handle);
  },
  createDevicePinnedStream: openStream = createDevicePinnedStream,
  createMediaPipeHandTracker: createTracker = createMediaPipeHandTracker,
  createImageBitmap: createBitmap = defaultCreateImageBitmap,
  frontDeviceId,
  sideDeviceId,
  frontVideo,
  sideVideo
}: BalloonGameRuntimeOptions): BalloonGameRuntime => {
  const context = canvas.getContext("2d");
  const audio = createAudio();
  const inputAdapter = createFusedGameInputAdapter();
  const engine: GameEngine = createGameEngine(viewportSizeFor(canvas));
  let session: GameSession = createInitialGameSession();
  let stopped = false;
  let frameHandle: number | undefined;
  let lastFrameMs = nowMs();
  let bestCombo = 0;
  let shotEffect: TimedPointEffect | undefined;
  let hitEffects: HitPopEffect[] = [];
  let bgmRestoreTimeout: ReturnType<typeof setTimeout> | undefined;
  let latestFusedFrame: FusedGameInputFrame | undefined;
  let frontLaneHealth: LaneHealthStatus = "notStarted";
  let sideLaneHealth: LaneHealthStatus = "notStarted";
  let balloonSprites: BalloonSprites | undefined;
  const frontAimMapper = createFrontAimMapper();
  const sideTriggerMapper: CycleDrivenSideTriggerMapper =
    createCycleDrivenSideTriggerMapper();
  const inputFusionMapper: InputFusionMapper = createInputFusionMapper();
  const streams: DevicePinnedStream[] = [];
  const trackers: MediaPipeHandTracker[] = [];
  const laneStops: (() => void)[] = [];
  const balloonSpriteLoader = createBalloonSpriteLoader({
    load: loadSprites,
    onLoaded: (sprites) => {
      balloonSprites = sprites;
    },
    onError: (error: unknown) => {
      if (!stopped) {
        console.error(
          "[balloon game runtime] balloon sprites load failed",
          error
        );
      }
    }
  });

  const safeCleanupTracker = (tracker: MediaPipeHandTracker): void => {
    removeItem(trackers, tracker);

    try {
      void Promise.resolve(tracker.cleanup()).catch((error: unknown) => {
        console.error("[balloon game runtime] tracker cleanup failed", error);
      });
    } catch (error: unknown) {
      console.error("[balloon game runtime] tracker cleanup failed", error);
    }
  };

  if (initialBalloons !== undefined) {
    engine.forceBalloons([...initialBalloons]);
  }

  const play = (action: () => Promise<void>): void => {
    void action().catch((error: unknown) => {
      if (!stopped) {
        console.error("[balloon game runtime] audio playback failed", error);
      }
    });
  };

  const clearBgmRestoreTimeout = (
    options: { readonly restoreVolume?: boolean } = {}
  ): void => {
    if (bgmRestoreTimeout !== undefined) {
      clearTimeout(bgmRestoreTimeout);
      bgmRestoreTimeout = undefined;

      if (options.restoreVolume === true && !stopped) {
        audio.restoreBgmVolume();
      }
    }
  };

  const duckBgmForHit = (): void => {
    audio.duckBgm(HIT_BGM_DUCK_VOLUME);
    clearBgmRestoreTimeout();
    bgmRestoreTimeout = setTimeout(() => {
      bgmRestoreTimeout = undefined;
      if (!stopped) {
        audio.restoreBgmVolume();
      }
    }, HIT_BGM_RESTORE_DELAY_MS);
  };

  const renderHud = (): void => {
    const currentFusedFrame = readFusedInputFrame?.() ?? latestFusedFrame;
    const statusMessage =
      session.state === "playing"
        ? statusMessageForFusedFrame(currentFusedFrame)
        : undefined;

    const hudHtml = renderGameHud({
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier,
      timeRemainingMs: session.timeRemainingMs,
      countdownLabel: session.countdownLabel,
      statusMessage,
      statusAction:
        statusMessage === "カメラが切断されました"
          ? { action: "reselectCameras", label: "カメラを選び直す" }
          : undefined,
      result:
        session.state === "result"
          ? { finalScore: engine.score, bestCombo }
          : undefined
    });

    if (
      typeof hudRoot.replaceChildren === "function" &&
      typeof hudRoot.insertAdjacentHTML === "function"
    ) {
      hudRoot.replaceChildren();
      hudRoot.insertAdjacentHTML("afterbegin", hudHtml);
      return;
    }

    Reflect.set(hudRoot, "innerHTML", hudHtml);
  };

  const schedule = (): void => {
    if (!stopped) {
      frameHandle = requestFrame(tick);
    }
  };

  const renderCanvas = (
    crosshair: { x: number; y: number } | undefined,
    frameNowMs: number
  ): void => {
    if (context === null) {
      return;
    }

    renderFrame(context, {
      balloons: engine.balloons,
      crosshair,
      shotEffect,
      hitEffects,
      balloonSprites,
      frameNowMs
    });
  };

  function tick(frameNowMs: number): void {
    if (stopped) {
      return;
    }

    syncCanvasSize(canvas);
    engine.resizeViewport(viewportSizeFor(canvas));
    const previousSessionState = session.state;
    const deltaMs = Math.max(0, frameNowMs - lastFrameMs);
    lastFrameMs = frameNowMs;
    const nextSession = advanceGameSession(session, frameNowMs);
    const shouldAdvanceEngine =
      previousSessionState === "playing" && nextSession.state === "playing";
    session = nextSession;
    hitEffects = activeHitPopEffects(hitEffects, frameNowMs);

    if (shouldAdvanceEngine) {
      engine.advance(deltaMs, random);
    }

    const fusedFrame = readFusedInputFrame?.() ?? latestFusedFrame;
    const input =
      fusedFrame === undefined
        ? { crosshair: undefined, shot: undefined }
        : readFusedGameInput(inputAdapter, fusedFrame);
    const shotTimestampMs =
      fusedFrame?.trigger?.timestamp.frameTimestampMs ??
      fusedFrame?.sideSource.frameTimestamp?.frameTimestampMs ??
      fusedFrame?.fusionTimestampMs;
    const shotStartedDuringPlaying =
      session.state === "playing" &&
      input.shot !== undefined &&
      shotTimestampMs !== undefined &&
      shotTimestampMs >= session.playingStartedAtMs;

    if (shotStartedDuringPlaying) {
      shotEffect = { ...input.shot, startedAtMs: frameNowMs };
      play(() => audio.playShot());
      const shotResult = registerShot(engine, input.shot);

      if (shotResult.kind === "hit") {
        hitEffects = [
          ...hitEffects,
          createHitPopEffect({
            x: input.shot.x,
            y: input.shot.y,
            points: shotResult.points,
            color:
              shotResult.size === "small"
                ? arcadePalette.alert
                : arcadePalette.candy,
            startedAtMs: frameNowMs
          })
        ];
        play(() => audio.playHit());
        duckBgmForHit();
      }

      bestCombo = Math.max(bestCombo, engine.combo);
    }

    if (session.resultEntered) {
      audio.stopBgm();
      play(() => audio.playResult());
    }

    renderCanvas(input.crosshair, frameNowMs);
    renderHud();
    schedule();
  }

  const currentFusionContext = () => ({
    frontLaneHealth,
    sideLaneHealth,
    tuning: defaultFusionTuning
  });

  const updateFrontFusion = (
    detection: HandDetection | undefined,
    timestamp: FrameTimestamp
  ): void => {
    const frontDetection =
      detection === undefined
        ? undefined
        : toFrontDetection(detection, {
            deviceId: frontDeviceId,
            streamId:
              streams.find((stream) => stream.deviceId === frontDeviceId)
                ?.stream.id ?? "front-stream",
            timestamp
          });
    const viewport = resolveFrontAimViewportSize({
      widthCandidates: [
        canvas.width,
        canvas.clientWidth,
        frontVideo.videoWidth
      ],
      heightCandidates: [
        canvas.height,
        canvas.clientHeight,
        frontVideo.videoHeight
      ]
    });
    const frontResult = frontAimMapper.update({
      detection: frontDetection,
      calibration: defaultFrontAimCalibration,
      viewportSize: viewport,
      projectionOptions: { objectFit: "cover", mirrorX: true }
    });
    latestFusedFrame =
      frontResult.aimFrame === undefined
        ? inputFusionMapper.updateAimUnavailable(
            timestamp,
            currentFusionContext()
          ).fusedFrame
        : inputFusionMapper.updateAimFrame(
            frontResult.aimFrame,
            currentFusionContext()
          ).fusedFrame;
  };

  const updateSideFusion = (
    detection: HandDetection | undefined,
    timestamp: FrameTimestamp
  ): void => {
    const sideDetection =
      detection === undefined
        ? undefined
        : toSideDetection(detection, {
            deviceId: sideDeviceId,
            streamId:
              streams.find((stream) => stream.deviceId === sideDeviceId)?.stream
                .id ?? "side-stream",
            timestamp
          });
    const sideResult = sideTriggerMapper.update({
      detection: sideDetection,
      timestamp,
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });
    latestFusedFrame =
      sideResult.triggerFrame === undefined
        ? inputFusionMapper.updateTriggerUnavailable(
            timestamp,
            currentFusionContext()
          ).fusedFrame
        : inputFusionMapper.updateTriggerFrame(
            sideResult.triggerFrame,
            currentFusionContext()
          ).fusedFrame;
  };

  const startLane = async (
    role: "frontAim" | "sideTrigger",
    deviceId: string,
    video: HTMLVideoElement
  ): Promise<void> => {
    let callbackId: number | undefined;
    let timeoutId: number | undefined;
    let laneStopped = false;
    let consecutiveFrameErrors = 0;
    const trackEndedObserver: { current?: { stop(): void } } = {};
    let laneResourcesReleased = false;
    let tracker: MediaPipeHandTracker | undefined;
    const laneStillActive = (): boolean => !stopped && !laneStopped;

    const setLaneHealth = (health: LaneHealthStatus): void => {
      if (role === "frontAim") {
        frontLaneHealth = health;
      } else {
        sideLaneHealth = health;
      }
    };

    const stopLane = (): void => {
      laneStopped = true;
      trackEndedObserver.current?.stop();

      if (
        callbackId !== undefined &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(callbackId);
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };

    laneStops.push(stopLane);
    setLaneHealth("capturing");

    const stream = await openStream(deviceId);

    if (!laneStillActive()) {
      stream.stop();
      return;
    }

    streams.push(stream);
    video.srcObject = stream.stream;

    const timestampNow = (): FrameTimestamp => {
      const now = performance.now();

      return createFrameTimestamp({ expectedDisplayTime: now }, now);
    };

    const updateUnavailable = (timestamp: FrameTimestamp): void => {
      if (role === "frontAim") {
        latestFusedFrame = inputFusionMapper.updateAimUnavailable(
          timestamp,
          currentFusionContext()
        ).fusedFrame;
      } else {
        latestFusedFrame = inputFusionMapper.updateTriggerUnavailable(
          timestamp,
          currentFusionContext()
        ).fusedFrame;
      }
    };

    const releaseLaneResources = (): void => {
      if (laneResourcesReleased) {
        return;
      }

      laneResourcesReleased = true;
      stopLane();
      removeItem(laneStops, stopLane);
      removeItem(streams, stream);
      stream.stop();

      if (tracker !== undefined) {
        safeCleanupTracker(tracker);
      }
    };

    trackEndedObserver.current = observeTrackEnded(stream.stream, () => {
      if (!laneStillActive()) {
        return;
      }

      setLaneHealth("captureLost");
      updateUnavailable(timestampNow());
      releaseLaneResources();
    });

    try {
      tracker = await createTracker({
        getFilterConfig:
          role === "frontAim"
            ? getFrontAimFilterConfig
            : getSideTriggerFilterConfig
      });
    } catch (error: unknown) {
      if (laneStillActive()) {
        console.error("[balloon game runtime] tracker startup failed", error);
        setLaneHealth("failed");
      }
      releaseLaneResources();
      return;
    }

    if (!laneStillActive()) {
      safeCleanupTracker(tracker);
      return;
    }

    trackers.push(tracker);
    setLaneHealth("tracking");

    const scheduleVideoFrame = (): void => {
      if (!laneStillActive()) {
        return;
      }

      if (typeof video.requestVideoFrameCallback === "function") {
        callbackId = video.requestVideoFrameCallback((_now, metadata) => {
          void processVideoFrame(metadata);
        });
        return;
      }

      timeoutId = window.setTimeout(() => {
        void processVideoFrame({ expectedDisplayTime: performance.now() });
      }, VIDEO_FRAME_FALLBACK_INTERVAL_MS);
    };

    async function processVideoFrame(metadata: FrameTimingLike): Promise<void> {
      if (!laneStillActive()) {
        return;
      }

      const timestamp = createFrameTimestamp(metadata, performance.now());
      const activeTracker = tracker;

      if (activeTracker === undefined) {
        return;
      }

      if (!videoReadyForBitmap(video)) {
        updateUnavailable(timestamp);
        scheduleVideoFrame();
        return;
      }

      let bitmap: ImageBitmap | undefined;

      try {
        bitmap = await createBitmap(video);

        if (!laneStillActive()) {
          return;
        }

        const detection = await activeTracker.detect(
          bitmap,
          timestamp.frameTimestampMs
        );

        if (!laneStillActive()) {
          return;
        }

        consecutiveFrameErrors = 0;
        setLaneHealth("tracking");

        if (role === "frontAim") {
          updateFrontFusion(detection, timestamp);
        } else {
          updateSideFusion(detection, timestamp);
        }
      } catch (error: unknown) {
        if (laneStillActive()) {
          console.error("[balloon game runtime] processFrame failed", error);
          consecutiveFrameErrors += 1;
          setLaneHealth("failed");
          updateUnavailable(timestamp);
        }
      } finally {
        bitmap?.close();
      }

      if (consecutiveFrameErrors >= MAX_CONSECUTIVE_FRAME_ERRORS) {
        releaseLaneResources();
        return;
      }

      scheduleVideoFrame();
    }

    scheduleVideoFrame();
  };

  const startCameraTracking = (): void => {
    if (readFusedInputFrame !== undefined) {
      return;
    }

    void startLane("frontAim", frontDeviceId, frontVideo).catch(
      (error: unknown) => {
        if (!stopped) {
          console.error("[balloon game runtime] front lane failed", error);
          frontLaneHealth = "failed";
        }
      }
    );
    void startLane("sideTrigger", sideDeviceId, sideVideo).catch(
      (error: unknown) => {
        if (!stopped) {
          console.error("[balloon game runtime] side lane failed", error);
          sideLaneHealth = "failed";
        }
      }
    );
  };

  const stopCameraTracking = (): void => {
    for (const stopLane of laneStops) {
      stopLane();
    }
    laneStops.length = 0;

    for (const stream of streams) {
      stream.stop();
    }
    streams.length = 0;

    for (const tracker of [...trackers]) {
      safeCleanupTracker(tracker);
    }
    trackers.length = 0;

    frontLaneHealth = "notStarted";
    sideLaneHealth = "notStarted";
  };

  return {
    start() {
      if (stopped || session.state !== "idle") {
        return;
      }

      const startMs = nowMs();
      lastFrameMs = startMs;
      session = startGameSession(session, startMs);
      play(() => audio.startBgm());
      balloonSpriteLoader.ensureStarted();
      startCameraTracking();
      renderHud();
      schedule();
    },
    retry() {
      if (stopped) {
        return;
      }

      engine.reset();
      stopCameraTracking();
      frontAimMapper.reset();
      sideTriggerMapper.reset();
      inputFusionMapper.resetAll();
      latestFusedFrame = undefined;
      session = retryGameSession(session, nowMs());
      resetFusedGameInputAdapter(inputAdapter);
      bestCombo = 0;
      shotEffect = undefined;
      hitEffects = [];
      clearBgmRestoreTimeout({ restoreVolume: true });
      play(() => audio.startBgm());
      balloonSpriteLoader.ensureStarted();
      startCameraTracking();
      renderHud();
    },
    destroy() {
      stopped = true;
      if (frameHandle !== undefined) {
        cancelFrame(frameHandle);
      }
      stopCameraTracking();
      clearBgmRestoreTimeout();
      audio.stopBgm();
    }
  };
};
