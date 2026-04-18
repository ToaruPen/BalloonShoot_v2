import { createFrameTimestamp } from "../camera/frameTimestamp";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTracker
} from "../hand-tracking/createMediaPipeHandTracker";
import {
  createFrontAimMapper,
  getFrontAimFilterConfig,
  resolveFrontAimViewportSize,
  toFrontDetection
} from "../front-aim";
import { handPresenceConfidenceFor } from "../front-aim/frontAimDetectionConversion";
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
  coerceSideTriggerTuningValue,
  createSideTriggerMapper,
  defaultSideTriggerTuning,
  sideTriggerSliderMetadata,
  type SideTriggerMapper,
  type SideTriggerTuning,
  type SideTriggerTuningKey
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
import type { WorkbenchState } from "./DiagnosticWorkbench";
import { createLandmarkOverlayModel } from "./landmarkOverlay";
import { renderFrontAimPanel } from "./renderFrontAimPanel";
import { renderFusionPanel } from "./renderFusionPanel";
import { renderSideTriggerPanel } from "./renderSideTriggerPanel";
import { renderSideWorldLandmarks } from "./renderWorldLandmarks";
import type { WorkbenchInspectionState } from "./renderWorkbench";
import { formatFrameTimestamp } from "./timestampFormat";

interface FrameTimingLike {
  readonly captureTime?: number;
  readonly expectedDisplayTime?: number;
  readonly presentedFrames?: number;
}

interface LaneTrackingOptions {
  readonly role: "frontAim" | "sideTrigger";
  readonly video: HTMLVideoElement;
  readonly deviceId: string;
  readonly streamId: string;
}

interface LiveLandmarkInspection {
  getState(): WorkbenchInspectionState;
  sync(state: WorkbenchState): void;
  setSideTriggerTuning(key: SideTriggerTuningKey, value: number): void;
  resetSideTriggerTuning(): void;
  setFusionTuning(key: FusionTuningKey, value: number): void;
  resetFusionTuning(): void;
  updateDom(): void;
  destroy(): void;
}

interface ActiveTracking {
  readonly key: string;
  readonly frontVideo: HTMLVideoElement;
  readonly sideVideo: HTMLVideoElement;
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
  // TODO(M4): Compute real side view quality when side trigger lands.
  sideViewQuality: "good"
});

const videoReadyForBitmap = (video: HTMLVideoElement): boolean =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
  video.videoWidth > 0 &&
  video.videoHeight > 0;

type LaneDetection = FrontHandDetection | SideHandDetection | undefined;

export const createLiveLandmarkInspection = (): LiveLandmarkInspection => {
  let inspectionState = createInitialInspectionState();
  let activeTracking: ActiveTracking | undefined;
  let frontAimMapper = createFrontAimMapper();
  let sideTriggerMapper: SideTriggerMapper = createSideTriggerMapper();
  let inputFusionMapper: InputFusionMapper = createInputFusionMapper();

  const setInspection = (patch: Partial<WorkbenchInspectionState>): void => {
    inspectionState = { ...inspectionState, ...patch };
    updateDom();
  };

  const updateDom = (): void => {
    updateText("wb-front-health", `health: ${inspectionState.frontLaneHealth}`);
    updateText("wb-side-health", `health: ${inspectionState.sideLaneHealth}`);
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

  const setLaneDetection = (
    role: LaneTrackingOptions["role"],
    detection: FrontHandDetection | SideHandDetection | undefined,
    timestamp: FrameTimestamp,
    video: HTMLVideoElement
  ): void => {
    if (role === "sideTrigger") {
      const sideResult = sideTriggerMapper.update({
        detection: detection as SideHandDetection | undefined,
        timestamp,
        tuning: inspectionState.sideTriggerTuning
      });
      const fusionResult =
        sideResult.triggerFrame === undefined
          ? undefined
          : inputFusionMapper.updateTriggerFrame(sideResult.triggerFrame, {
              frontLaneHealth: inspectionState.frontLaneHealth,
              sideLaneHealth: inspectionState.sideLaneHealth,
              tuning: inspectionState.fusionTuning
            });
      setInspection({
        sideDetection: detection as SideHandDetection | undefined,
        sideTriggerFrame: sideResult.triggerFrame,
        sideTriggerTelemetry: sideResult.telemetry,
        ...(fusionResult === undefined
          ? {}
          : {
              fusionFrame: fusionResult.fusedFrame,
              fusionTelemetry: fusionResult.telemetry
            })
      });
      return;
    }

    const frontDetection = detection as FrontHandDetection | undefined;
    const frontResult = frontAimMapper.update({
      detection: frontDetection,
      viewportSize: videoViewportSize(video, frontDetection),
      projectionOptions: { objectFit: "cover" }
    });
    const fusionResult =
      frontResult.aimFrame === undefined
        ? undefined
        : inputFusionMapper.updateAimFrame(frontResult.aimFrame, {
            frontLaneHealth: inspectionState.frontLaneHealth,
            sideLaneHealth: inspectionState.sideLaneHealth,
            tuning: inspectionState.fusionTuning
          });

    setInspection({
      frontDetection,
      frontAimFrame: frontResult.aimFrame,
      frontAimTelemetry: frontResult.telemetry,
      ...(fusionResult === undefined
        ? {}
        : {
            fusionFrame: fusionResult.fusedFrame,
            fusionTelemetry: fusionResult.telemetry
          })
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

  const startLaneTracking = (
    options: LaneTrackingOptions
  ): { stop(): void } => {
    let stopped = false;
    let cleanupStarted = false;
    let callbackId: number | undefined;
    let timeoutId: number | undefined;
    let trackerPromise: Promise<MediaPipeHandTracker> | undefined;

    setLaneHealth(options.role, "capturing");

    const getTracker = (): Promise<MediaPipeHandTracker> => {
      trackerPromise ??= createMediaPipeHandTracker({
        getFilterConfig: getFrontAimFilterConfig
      });
      return trackerPromise;
    };

    const isStopped = (): boolean => stopped;

    const processFrame = async (metadata: FrameTimingLike): Promise<void> => {
      if (isStopped()) {
        return;
      }

      const timestamp = createFrameTimestamp(metadata, performance.now());
      setLaneTimestamp(options.role, timestamp);

      if (!videoReadyForBitmap(options.video)) {
        schedule();
        return;
      }

      try {
        const tracker = await getTracker();

        if (isStopped()) {
          return;
        }

        const laneDetection = await runLaneDetection(
          tracker,
          options,
          timestamp
        );

        if (isStopped()) {
          return;
        }

        setLaneDetection(options.role, laneDetection, timestamp, options.video);
        setLaneHealth(options.role, "tracking");
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

      if (typeof options.video.requestVideoFrameCallback === "function") {
        callbackId = options.video.requestVideoFrameCallback(
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

    schedule();

    return {
      stop() {
        stopped = true;

        if (
          callbackId !== undefined &&
          typeof options.video.cancelVideoFrameCallback === "function"
        ) {
          options.video.cancelVideoFrameCallback(callbackId);
        }

        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }

        cleanupTracker();
      }
    };
  };

  const resetTrackingState = (): void => {
    const { fusionTuning, sideTriggerTuning } = inspectionState;
    inspectionState = {
      ...createInitialInspectionState(),
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

    const key = `${state.frontStream.stream.id}:${state.sideStream.stream.id}`;

    if (
      activeTracking?.key === key &&
      activeTracking.frontVideo === frontVideo &&
      activeTracking.sideVideo === sideVideo
    ) {
      return;
    }

    stopActiveTracking();
    resetTrackingState();

    const frontLane = startLaneTracking({
      role: "frontAim",
      video: frontVideo,
      deviceId: state.frontStream.deviceId,
      streamId: state.frontStream.stream.id
    });
    const sideLane = startLaneTracking({
      role: "sideTrigger",
      video: sideVideo,
      deviceId: state.sideStream.deviceId,
      streamId: state.sideStream.stream.id
    });

    activeTracking = {
      key,
      frontVideo,
      sideVideo,
      stop() {
        frontLane.stop();
        sideLane.stop();
      }
    };
  };

  return {
    getState() {
      return inspectionState;
    },
    sync,
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
      resetTrackingState();
    }
  };
};
