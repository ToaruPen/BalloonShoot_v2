import { createFrameTimestamp } from "../camera/frameTimestamp";
import { observeTrackEnded } from "../camera/observeTrackEnded";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTracker
} from "../hand-tracking/createMediaPipeHandTracker";
import {
  FRONT_AIM_CALIBRATION_SLIDER_METADATA,
  createFrontAimMapper,
  defaultFrontAimCalibration,
  type FrontAimCalibration,
  type FrontAimCalibrationKey,
  getFrontAimFilterConfig,
  resolveFrontAimViewportSize,
  toFrontDetection,
  updateFrontAimCalibrationValue
} from "../front-aim";
import {
  coerceFusionTuningValue,
  createInputFusionMapper,
  defaultFusionTuning,
  fusionSliderMetadata,
  type FusionTuning,
  type FusionTuningKey,
  type InputFusionMapper
} from "../input-fusion";
import {
  SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA,
  coerceSideTriggerTuningValue,
  createSideTriggerMapper,
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning,
  getSideTriggerFilterConfig,
  sideTriggerSliderMetadata,
  type SideTriggerCalibration,
  type SideTriggerCalibrationKey,
  type SideTriggerMapper,
  type SideTriggerTuning,
  type SideTriggerTuningKey,
  updateSideTriggerCalibrationValue
} from "../side-trigger";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "../../shared/types/camera";
import type {
  FrontHandDetection,
  HandDetection,
  HandFrame,
  SideHandDetection
} from "../../shared/types/hand";
import { handPresenceConfidenceFor } from "../../shared/helpers/handConfidence";
import type { WorkbenchState } from "./DiagnosticWorkbench";
import { createLandmarkOverlayModel } from "./landmarkOverlay";
import { renderFrontAimCalibrationControls } from "./renderFrontAimCalibrationControls";
import { renderFrontAimPanel } from "./renderFrontAimPanel";
import { renderFusionPanel } from "./renderFusionPanel";
import { renderSideTriggerCalibrationControls } from "./renderSideTriggerCalibrationControls";
import { renderSideTriggerPanel } from "./renderSideTriggerPanel";
import { renderSideWorldLandmarks } from "./renderWorldLandmarks";
import {
  formatLaneHealthLabel,
  type WorkbenchInspectionState
} from "./renderWorkbench";
import { formatFrameTimestamp } from "./timestampFormat";

interface FrameTimingLike {
  readonly captureTime?: number;
  readonly expectedDisplayTime?: number;
  readonly presentedFrames?: number;
}

interface LaneTrackingOptions {
  readonly role: "frontAim" | "sideTrigger";
  readonly video: HTMLVideoElement;
  readonly stream: MediaStream;
  readonly deviceId: string;
  readonly streamId: string;
}

interface LiveLandmarkInspection {
  getState(): WorkbenchInspectionState;
  sync(state: WorkbenchState): void;
  setFrontAimCalibration(key: FrontAimCalibrationKey, value: number): void;
  resetFrontAimCalibration(): void;
  setSideTriggerCalibration(
    key: SideTriggerCalibrationKey,
    value: number
  ): void;
  resetSideTriggerCalibration(): void;
  setSideTriggerTuning(key: SideTriggerTuningKey, value: number): void;
  resetSideTriggerTuning(): void;
  setFusionTuning(key: FusionTuningKey, value: number): void;
  resetFusionTuning(): void;
  updateDom(): void;
  destroy(): void;
}

interface ActiveTracking {
  readonly key: string;
  frontVideo: HTMLVideoElement;
  sideVideo: HTMLVideoElement;
  bindVideos(frontVideo: HTMLVideoElement, sideVideo: HTMLVideoElement): void;
  stop(): void;
}

interface LaneTracking {
  bindVideo(video: HTMLVideoElement): void;
  stop(): void;
}

const createInitialInspectionState = (): WorkbenchInspectionState => ({
  frontDetection: undefined,
  sideDetection: undefined,
  frontLaneHealth: "notStarted",
  sideLaneHealth: "notStarted",
  frontAimFrame: undefined,
  frontAimTelemetry: undefined,
  sideTriggerFrame: undefined,
  sideTriggerTelemetry: undefined,
  frontAimCalibration: defaultFrontAimCalibration,
  sideTriggerCalibration: defaultSideTriggerCalibration,
  sideTriggerTuning: defaultSideTriggerTuning,
  fusionFrame: undefined,
  fusionTelemetry: undefined,
  fusionTuning: defaultFusionTuning
});

const updateText = (id: string, value: string): void => {
  const element = document.querySelector<HTMLElement>(`#${id}`);

  if (element !== null) {
    element.textContent = value;
  }
};

const updateOuterHTML = (id: string, value: string): void => {
  const element = document.querySelector<HTMLElement>(`#${id}`);

  if (element !== null) {
    element.outerHTML = value;
  }
};

export const videoViewportSize = (
  video: HTMLVideoElement,
  detection: FrontHandDetection | undefined
): { width: number; height: number } =>
  resolveFrontAimViewportSize({
    widthCandidates: [
      video.clientWidth,
      video.videoWidth,
      detection?.filteredFrame.width
    ],
    heightCandidates: [
      video.clientHeight,
      video.videoHeight,
      detection?.filteredFrame.height
    ]
  });

const drawOverlay = (
  canvasId: string,
  frame: HandFrame | undefined,
  color: string
): void => {
  const canvas = document.querySelector<HTMLCanvasElement>(`#${canvasId}`);

  if (canvas === null) {
    return;
  }

  const context = canvas.getContext("2d");

  if (context === null) {
    return;
  }

  if (frame === undefined) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const model = createLandmarkOverlayModel(frame);
  canvas.width = model.width;
  canvas.height = model.height;
  context.clearRect(0, 0, model.width, model.height);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 3;

  for (const connection of model.connections) {
    const from = model.points.find((point) => point.name === connection.from);
    const to = model.points.find((point) => point.name === connection.to);

    if (from === undefined || to === undefined) {
      continue;
    }

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  for (const point of model.points) {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
  }
};

const toSideDetection = (
  detection: HandDetection,
  options: LaneTrackingOptions,
  timestamp: FrameTimestamp
): SideHandDetection => ({
  laneRole: "sideTrigger",
  deviceId: options.deviceId,
  streamId: options.streamId,
  timestamp,
  rawFrame: detection.rawFrame,
  filteredFrame: detection.filteredFrame,
  handPresenceConfidence: handPresenceConfidenceFor(detection),
  sideViewQuality: "good"
});

const videoReadyForBitmap = (video: HTMLVideoElement): boolean =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
  video.videoWidth > 0 &&
  video.videoHeight > 0;

type LaneDetection = FrontHandDetection | SideHandDetection | undefined;

interface FrameCalibrationContext {
  readonly frontAimCalibration: FrontAimCalibration;
  readonly sideTriggerCalibration: SideTriggerCalibration;
  readonly sideTriggerTuning: SideTriggerTuning;
  readonly fusionTuning: FusionTuning;
}

const frontCalibrationValueFor = (
  calibration: FrontAimCalibration,
  key: FrontAimCalibrationKey
): number => {
  switch (key) {
    case "centerX":
      return calibration.center.x;
    case "centerY":
      return calibration.center.y;
    case "cornerLeftX":
      return calibration.cornerBounds.leftX;
    case "cornerRightX":
      return calibration.cornerBounds.rightX;
    case "cornerTopY":
      return calibration.cornerBounds.topY;
    case "cornerBottomY":
      return calibration.cornerBounds.bottomY;
  }
};

const sideCalibrationValueFor = (
  calibration: SideTriggerCalibration,
  key: SideTriggerCalibrationKey
): number => {
  switch (key) {
    case "openPoseDistance":
      return calibration.openPose.normalizedThumbDistance;
    case "pulledPoseDistance":
      return calibration.pulledPose.normalizedThumbDistance;
  }
};

export const createLiveLandmarkInspection = (): LiveLandmarkInspection => {
  let inspectionState = createInitialInspectionState();
  let activeTracking: ActiveTracking | undefined;
  let frontAimMapper = createFrontAimMapper();
  let sideTriggerMapper: SideTriggerMapper = createSideTriggerMapper();
  let inputFusionMapper: InputFusionMapper = createInputFusionMapper();
  let lastPreviewDeviceIds:
    | { readonly frontDeviceId: string; readonly sideDeviceId: string }
    | undefined;

  const setInspection = (patch: Partial<WorkbenchInspectionState>): void => {
    inspectionState = { ...inspectionState, ...patch };
    updateDom();
  };

  const updateDom = (): void => {
    updateText(
      "wb-front-health",
      `health: ${formatLaneHealthLabel(inspectionState.frontLaneHealth)}`
    );
    updateText(
      "wb-side-health",
      `health: ${formatLaneHealthLabel(inspectionState.sideLaneHealth)}`
    );
    updateText(
      "wb-front-timestamp",
      formatFrameTimestamp(
        inspectionState.frontDetection?.timestamp ??
          inspectionState.frontFrameTimestamp
      )
    );
    updateText(
      "wb-side-timestamp",
      formatFrameTimestamp(
        inspectionState.sideDetection?.timestamp ??
          inspectionState.sideFrameTimestamp
      )
    );
    drawOverlay(
      "wb-front-raw-overlay",
      inspectionState.frontDetection?.rawFrame,
      "#ff5a5f"
    );
    drawOverlay(
      "wb-front-filtered-overlay",
      inspectionState.frontDetection?.filteredFrame,
      "#34d399"
    );
    drawOverlay(
      "wb-side-raw-overlay",
      inspectionState.sideDetection?.rawFrame,
      "#ff5a5f"
    );
    drawOverlay(
      "wb-side-filtered-overlay",
      inspectionState.sideDetection?.filteredFrame,
      "#34d399"
    );
    updateOuterHTML(
      "wb-front-aim-panel",
      renderFrontAimPanel(
        inspectionState.frontAimFrame,
        inspectionState.frontAimTelemetry
      )
    );
    updateOuterHTML(
      "wb-side-world-landmarks",
      renderSideWorldLandmarks(inspectionState.sideDetection)
    );
    updateOuterHTML(
      "wb-side-trigger-panel",
      renderSideTriggerPanel(
        inspectionState.sideTriggerFrame,
        inspectionState.sideTriggerTelemetry
      )
    );
    updateOuterHTML(
      "wb-fusion-panel",
      renderFusionPanel(
        inspectionState.fusionFrame,
        inspectionState.fusionTelemetry
      )
    );
    updateOuterHTML(
      "wb-front-aim-calibration-panel",
      renderFrontAimCalibrationControls(inspectionState.frontAimCalibration)
    );
    updateOuterHTML(
      "wb-side-trigger-calibration-panel",
      renderSideTriggerCalibrationControls(
        inspectionState.sideTriggerCalibration
      )
    );
  };

  const setLaneHealth = (
    role: LaneTrackingOptions["role"],
    health: LaneHealthStatus
  ): void => {
    setInspection(
      role === "frontAim"
        ? { frontLaneHealth: health }
        : { sideLaneHealth: health }
    );
  };

  const setLaneTimestamp = (
    role: LaneTrackingOptions["role"],
    timestamp: FrameTimestamp
  ): void => {
    setInspection(
      role === "frontAim"
        ? { frontFrameTimestamp: timestamp }
        : { sideFrameTimestamp: timestamp }
    );
  };

  const frameCalibrationContext = (): FrameCalibrationContext => ({
    frontAimCalibration: inspectionState.frontAimCalibration,
    sideTriggerCalibration: inspectionState.sideTriggerCalibration,
    sideTriggerTuning: inspectionState.sideTriggerTuning,
    fusionTuning: inspectionState.fusionTuning
  });

  const currentFusionContext = (context: FrameCalibrationContext) => ({
    frontLaneHealth: inspectionState.frontLaneHealth,
    sideLaneHealth: inspectionState.sideLaneHealth,
    tuning: context.fusionTuning
  });

  const timestampNow = (): FrameTimestamp => {
    const now = performance.now();

    return createFrameTimestamp({ expectedDisplayTime: now }, now);
  };

  const setLaneDetection = (
    role: LaneTrackingOptions["role"],
    detection: FrontHandDetection | SideHandDetection | undefined,
    timestamp: FrameTimestamp,
    video: HTMLVideoElement,
    context: FrameCalibrationContext
  ): void => {
    if (role === "sideTrigger") {
      const sideResult = sideTriggerMapper.update({
        detection: detection as SideHandDetection | undefined,
        timestamp,
        calibration: context.sideTriggerCalibration,
        tuning: context.sideTriggerTuning
      });
      const fusionResult =
        sideResult.triggerFrame === undefined
          ? inputFusionMapper.updateTriggerUnavailable(
              timestamp,
              currentFusionContext(context)
            )
          : inputFusionMapper.updateTriggerFrame(
              sideResult.triggerFrame,
              currentFusionContext(context)
            );
      setInspection({
        sideDetection: detection as SideHandDetection | undefined,
        sideTriggerFrame: sideResult.triggerFrame,
        sideTriggerTelemetry: sideResult.telemetry,
        fusionFrame: fusionResult.fusedFrame,
        fusionTelemetry: fusionResult.telemetry
      });
      return;
    }

    const frontDetection = detection as FrontHandDetection | undefined;
    const frontResult = frontAimMapper.update({
      detection: frontDetection,
      viewportSize: videoViewportSize(video, frontDetection),
      calibration: context.frontAimCalibration,
      projectionOptions: { objectFit: "cover" }
    });
    const fusionResult =
      frontResult.aimFrame === undefined
        ? inputFusionMapper.updateAimUnavailable(
            timestamp,
            currentFusionContext(context)
          )
        : inputFusionMapper.updateAimFrame(
            frontResult.aimFrame,
            currentFusionContext(context)
          );

    setInspection({
      frontDetection,
      frontAimFrame: frontResult.aimFrame,
      frontAimTelemetry: frontResult.telemetry,
      fusionFrame: fusionResult.fusedFrame,
      fusionTelemetry: fusionResult.telemetry
    });
  };

  const runLaneDetection = async (
    tracker: MediaPipeHandTracker,
    options: LaneTrackingOptions,
    timestamp: FrameTimestamp
  ): Promise<LaneDetection> => {
    const bitmap = await createImageBitmap(options.video);

    try {
      const detection = await tracker.detect(
        bitmap,
        timestamp.frameTimestampMs
      );

      return detection === undefined
        ? undefined
        : options.role === "frontAim"
          ? toFrontDetection(detection, {
              deviceId: options.deviceId,
              streamId: options.streamId,
              timestamp
            })
          : toSideDetection(detection, options, timestamp);
    } finally {
      bitmap.close();
    }
  };

  const startLaneTracking = (options: LaneTrackingOptions): LaneTracking => {
    let video = options.video;
    let stopped = false;
    let cleanupStarted = false;
    let callbackId: number | undefined;
    let timeoutId: number | undefined;
    let trackerPromise: Promise<MediaPipeHandTracker> | undefined;
    const trackEndedObserver: { current?: { stop(): void } } = {};

    setLaneHealth(options.role, "capturing");

    const getTracker = (): Promise<MediaPipeHandTracker> => {
      trackerPromise ??= createMediaPipeHandTracker({
        getFilterConfig:
          options.role === "frontAim"
            ? getFrontAimFilterConfig
            : getSideTriggerFilterConfig
      });
      return trackerPromise;
    };

    const isStopped = (): boolean => stopped;

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

    const processFrame = async (metadata: FrameTimingLike): Promise<void> => {
      if (isStopped()) {
        return;
      }

      const timestamp = createFrameTimestamp(metadata, performance.now());
      const context = frameCalibrationContext();
      setLaneTimestamp(options.role, timestamp);

      if (!videoReadyForBitmap(video)) {
        schedule();
        return;
      }

      let tracker: MediaPipeHandTracker;

      try {
        tracker = await getTracker();
      } catch (error: unknown) {
        if (isStopped()) {
          return;
        }

        console.error("Diagnostic lane tracker startup failed", error);
        trackerPromise = undefined;
        setLaneHealth(options.role, "failed");
        return;
      }

      try {
        if (isStopped()) {
          return;
        }

        const laneDetection = await runLaneDetection(
          tracker,
          { ...options, video },
          timestamp
        );

        if (isStopped()) {
          return;
        }

        setLaneHealth(options.role, "tracking");
        setLaneDetection(
          options.role,
          laneDetection,
          timestamp,
          video,
          context
        );
      } catch (error: unknown) {
        if (isStopped()) {
          return;
        }

        console.error("Diagnostic lane tracking failed", error);
        setLaneHealth(options.role, "failed");
        schedule();
        return;
      }

      schedule();
    };

    const schedule = (): void => {
      if (stopped) {
        return;
      }

      if (typeof video.requestVideoFrameCallback === "function") {
        callbackId = video.requestVideoFrameCallback(
          (_now, metadata) => {
            void processFrame(metadata);
          }
        );
        return;
      }

      timeoutId = window.setTimeout(() => {
        void processFrame({ expectedDisplayTime: performance.now() });
      }, 66);
    };

    const cleanupTracker = (): void => {
      if (cleanupStarted || trackerPromise === undefined) {
        return;
      }

      cleanupStarted = true;
      void trackerPromise
        .then((tracker) => tracker.cleanup())
        .catch((error: unknown) => {
          console.error("Diagnostic lane tracker cleanup failed", error);
        });
    };

    const updateLaneUnavailableForCaptureLoss = (): void => {
      const context = frameCalibrationContext();
      const timestamp = timestampNow();
      const fusionResult =
        options.role === "frontAim"
          ? inputFusionMapper.updateAimUnavailable(timestamp, {
              ...currentFusionContext(context),
              frontLaneHealth: "captureLost"
            })
          : inputFusionMapper.updateTriggerUnavailable(timestamp, {
              ...currentFusionContext(context),
              sideLaneHealth: "captureLost"
            });

      setInspection(
        options.role === "frontAim"
          ? {
              frontLaneHealth: "captureLost",
              frontDetection: undefined,
              frontAimFrame: undefined,
              frontAimTelemetry: undefined,
              frontFrameTimestamp: timestamp,
              fusionFrame: fusionResult.fusedFrame,
              fusionTelemetry: fusionResult.telemetry
            }
          : {
              sideLaneHealth: "captureLost",
              sideDetection: undefined,
              sideTriggerFrame: undefined,
              sideTriggerTelemetry: undefined,
              sideFrameTimestamp: timestamp,
              fusionFrame: fusionResult.fusedFrame,
              fusionTelemetry: fusionResult.telemetry
            }
      );
    };

    const stopLane = (): void => {
      stopped = true;
      cancelScheduledFrame();
      trackEndedObserver.current?.stop();
      cleanupTracker();
    };

    trackEndedObserver.current = observeTrackEnded(options.stream, () => {
      if (stopped) {
        return;
      }

      stopLane();
      updateLaneUnavailableForCaptureLoss();
    });

    schedule();

    return {
      bindVideo(nextVideo) {
        if (stopped || nextVideo === video) {
          return;
        }

        cancelScheduledFrame();
        video = nextVideo;
        schedule();
      },
      stop() {
        stopLane();
      }
    };
  };

  const resetTrackingState = (
    options: { readonly resetCalibration?: boolean } = {}
  ): void => {
    const {
      frontAimCalibration,
      fusionTuning,
      sideTriggerCalibration,
      sideTriggerTuning
    } = inspectionState;
    const calibrationPatch =
      options.resetCalibration === true
        ? {}
        : { frontAimCalibration, sideTriggerCalibration };

    inspectionState = {
      ...createInitialInspectionState(),
      ...calibrationPatch,
      sideTriggerTuning,
      fusionTuning
    };
    frontAimMapper = createFrontAimMapper();
    sideTriggerMapper = createSideTriggerMapper();
    inputFusionMapper = createInputFusionMapper();
    updateDom();
  };

  const stopActiveTracking = (): void => {
    activeTracking?.stop();
    activeTracking = undefined;
  };

  const deviceIdsFor = (
    state: WorkbenchState
  ):
    | { readonly frontDeviceId: string; readonly sideDeviceId: string }
    | undefined => {
    if (state.frontStream === undefined || state.sideStream === undefined) {
      return undefined;
    }

    return {
      frontDeviceId: state.frontStream.deviceId,
      sideDeviceId: state.sideStream.deviceId
    };
  };

  const deviceIdsChanged = (
    previous:
      | { readonly frontDeviceId: string; readonly sideDeviceId: string }
      | undefined,
    next: { readonly frontDeviceId: string; readonly sideDeviceId: string }
  ): boolean =>
    previous !== undefined &&
    (previous.frontDeviceId !== next.frontDeviceId ||
      previous.sideDeviceId !== next.sideDeviceId);

  const sync = (state: WorkbenchState): void => {
    if (
      state.screen !== "previewing" ||
      state.frontStream === undefined ||
      state.sideStream === undefined
    ) {
      stopActiveTracking();
      resetTrackingState();
      return;
    }

    const frontVideo =
      document.querySelector<HTMLVideoElement>("#wb-front-video");
    const sideVideo =
      document.querySelector<HTMLVideoElement>("#wb-side-video");

    if (frontVideo === null || sideVideo === null) {
      return;
    }

    const key = JSON.stringify([
      [state.frontStream.deviceId, state.frontStream.stream.id],
      [state.sideStream.deviceId, state.sideStream.stream.id]
    ]);

    if (activeTracking?.key === key) {
      activeTracking.bindVideos(frontVideo, sideVideo);
      return;
    }

    stopActiveTracking();
    const nextDeviceIds = deviceIdsFor(state);
    resetTrackingState({
      resetCalibration:
        nextDeviceIds === undefined
          ? false
          : deviceIdsChanged(lastPreviewDeviceIds, nextDeviceIds)
    });
    lastPreviewDeviceIds = nextDeviceIds;

    const frontLane = startLaneTracking({
      role: "frontAim",
      video: frontVideo,
      stream: state.frontStream.stream,
      deviceId: state.frontStream.deviceId,
      streamId: state.frontStream.stream.id
    });
    const sideLane = startLaneTracking({
      role: "sideTrigger",
      video: sideVideo,
      stream: state.sideStream.stream,
      deviceId: state.sideStream.deviceId,
      streamId: state.sideStream.stream.id
    });

    const tracking: ActiveTracking = {
      key,
      frontVideo,
      sideVideo,
      bindVideos(nextFrontVideo, nextSideVideo) {
        frontLane.bindVideo(nextFrontVideo);
        sideLane.bindVideo(nextSideVideo);
        tracking.frontVideo = nextFrontVideo;
        tracking.sideVideo = nextSideVideo;
      },
      stop() {
        frontLane.stop();
        sideLane.stop();
      }
    };
    activeTracking = tracking;
  };

  return {
    getState() {
      return inspectionState;
    },
    sync,
    setFrontAimCalibration(key, value) {
      const metadata = FRONT_AIM_CALIBRATION_SLIDER_METADATA.find(
        (item) => item.key === key
      );

      if (metadata === undefined) {
        return;
      }

      const frontAimCalibration = updateFrontAimCalibrationValue(
        inspectionState.frontAimCalibration,
        metadata,
        value
      );

      setInspection({ frontAimCalibration });
      updateText(
        `wb-front-aim-calibration-value-${key}`,
        String(frontCalibrationValueFor(frontAimCalibration, key))
      );
    },
    resetFrontAimCalibration() {
      setInspection({ frontAimCalibration: defaultFrontAimCalibration });
    },
    setSideTriggerCalibration(key, value) {
      const metadata = SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.find(
        (item) => item.key === key
      );

      if (metadata === undefined) {
        return;
      }

      const sideTriggerCalibration = updateSideTriggerCalibrationValue(
        inspectionState.sideTriggerCalibration,
        metadata,
        value
      );

      setInspection({ sideTriggerCalibration });
      updateText(
        `wb-side-trigger-calibration-value-${key}`,
        String(sideCalibrationValueFor(sideTriggerCalibration, key))
      );
    },
    resetSideTriggerCalibration() {
      setInspection({ sideTriggerCalibration: defaultSideTriggerCalibration });
    },
    setSideTriggerTuning(key, value) {
      const metadata = sideTriggerSliderMetadata.find(
        (item) => item.key === key
      );

      if (metadata === undefined) {
        return;
      }

      const sideTriggerTuning: SideTriggerTuning = {
        ...inspectionState.sideTriggerTuning,
        [key]: coerceSideTriggerTuningValue(metadata, value)
      };

      setInspection({ sideTriggerTuning });
      updateText(`wb-tuning-value-${key}`, String(sideTriggerTuning[key]));
    },
    resetSideTriggerTuning() {
      setInspection({ sideTriggerTuning: defaultSideTriggerTuning });
    },
    setFusionTuning(key, value) {
      const metadata = fusionSliderMetadata.find((item) => item.key === key);

      if (metadata === undefined) {
        return;
      }

      const fusionTuning: FusionTuning = {
        ...inspectionState.fusionTuning,
        [key]: coerceFusionTuningValue(metadata, value)
      };

      setInspection({ fusionTuning });
      updateText(`wb-fusion-tuning-value-${key}`, String(fusionTuning[key]));
    },
    resetFusionTuning() {
      setInspection({ fusionTuning: defaultFusionTuning });
    },
    updateDom,
    destroy() {
      stopActiveTracking();
      resetTrackingState({ resetCalibration: true });
      lastPreviewDeviceIds = undefined;
    }
  };
};
