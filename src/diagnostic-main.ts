import "./styles/diagnostic.css";
import {
  createDiagnosticWorkbench,
  type DiagnosticWorkbench,
  type WorkbenchScreen
} from "./features/diagnostic-workbench/DiagnosticWorkbench";
import {
  renderWorkbenchHTML,
  renderCaptureTelemetryHTML,
  renderTrackingStatus
} from "./features/diagnostic-workbench/renderWorkbench";
import { drawLandmarkOverlay } from "./features/diagnostic-workbench/drawLandmarkOverlay";
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTrackerOptions
} from "./features/hand-tracking/createMediaPipeHandTracker";
import {
  createFrontLaneTracker,
  createSideLaneTracker
} from "./features/hand-tracking/laneHandTracker";
import { gameConfig } from "./shared/config/gameConfig";

const root = document.querySelector<HTMLDivElement>("#diagnostic-app");

if (!root) {
  throw new Error("Missing #diagnostic-app root");
}

const workbench: DiagnosticWorkbench = createDiagnosticWorkbench();

/**
 * Track the last rendered screen and stream identity so we can decide
 * between a full re-render (screen/stream change) and a lightweight
 * telemetry patch.
 */
let lastScreen: WorkbenchScreen | undefined;
let lastFrontStreamId: string | undefined;
let lastSideStreamId: string | undefined;
let captureLoopsStarted = false;
let trackingStarted = false;
let overlayRafId: number | undefined;

const attachVideoStreams = (
  state: ReturnType<DiagnosticWorkbench["getState"]>
): void => {
  if (state.screen !== "previewing") {
    return;
  }

  const frontVideo = document.querySelector<HTMLVideoElement>("#wb-front-video");
  const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");

  if (frontVideo !== null && state.frontStream !== undefined) {
    frontVideo.srcObject = state.frontStream.stream;
  }

  if (sideVideo !== null && state.sideStream !== undefined) {
    sideVideo.srcObject = state.sideStream.stream;
  }
};

const startCaptureLoopsIfNeeded = (): void => {
  if (captureLoopsStarted) return;

  const frontVideo = document.querySelector<HTMLVideoElement>("#wb-front-video");
  const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");

  if (frontVideo === null || sideVideo === null) return;

  workbench.startCaptureLoops(frontVideo, sideVideo);
  captureLoopsStarted = true;
};

// ---------------------------------------------------------------------------
// Hand tracking initialization
// ---------------------------------------------------------------------------

const trackerOpts: MediaPipeHandTrackerOptions = {
  getFilterConfig: () => ({
    minCutoff: gameConfig.input.handFilterMinCutoff,
    beta: gameConfig.input.handFilterBeta,
    dCutoff: gameConfig.input.handFilterDCutoff
  })
};

// MediaPipe model loading is async and heavy; start it once.
let trackersReady = false;
const frontLaneTracker = { ref: undefined as ReturnType<typeof createFrontLaneTracker> | undefined };
const sideLaneTracker = { ref: undefined as ReturnType<typeof createSideLaneTracker> | undefined };

const initTrackers = async (): Promise<void> => {
  if (trackersReady) return;
  trackersReady = true; // prevent double-init

  try {
    const [frontBackend, sideBackend] = await Promise.all([
      createMediaPipeHandTracker(trackerOpts),
      createMediaPipeHandTracker(trackerOpts)
    ]);

    frontLaneTracker.ref = createFrontLaneTracker(frontBackend);
    sideLaneTracker.ref = createSideLaneTracker(sideBackend);

    // If already previewing, start tracking immediately
    startTrackingIfReady();
  } catch (err) {
    console.error("MediaPipe initialization failed:", err);
    trackersReady = false;
  }
};

const startTrackingIfReady = (): void => {
  if (trackingStarted) return;
  if (frontLaneTracker.ref === undefined || sideLaneTracker.ref === undefined) return;

  const frontVideo = document.querySelector<HTMLVideoElement>("#wb-front-video");
  const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");

  if (frontVideo === null || sideVideo === null) return;
  if (!captureLoopsStarted) return;

  workbench.startTracking(
    frontVideo,
    sideVideo,
    frontLaneTracker.ref,
    sideLaneTracker.ref
  );
  trackingStarted = true;

  startOverlayLoop();
};

// ---------------------------------------------------------------------------
// Landmark overlay drawing loop
// ---------------------------------------------------------------------------

const syncCanvasSize = (
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): void => {
  const w = video.videoWidth || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
};

const startOverlayLoop = (): void => {
  if (overlayRafId !== undefined) return;

  const tick = (): void => {
    const state = workbench.getState();

    const frontCanvas = document.querySelector<HTMLCanvasElement>("#wb-front-overlay");
    const sideCanvas = document.querySelector<HTMLCanvasElement>("#wb-side-overlay");
    const frontVideo = document.querySelector<HTMLVideoElement>("#wb-front-video");
    const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");

    if (frontCanvas !== null && frontVideo !== null) {
      syncCanvasSize(frontCanvas, frontVideo);
      const ctx = frontCanvas.getContext("2d");
      if (ctx !== null) {
        drawLandmarkOverlay(
          ctx,
          state.frontDetection?.rawFrame,
          state.frontDetection?.filteredFrame
        );
      }
    }

    if (sideCanvas !== null && sideVideo !== null) {
      syncCanvasSize(sideCanvas, sideVideo);
      const ctx = sideCanvas.getContext("2d");
      if (ctx !== null) {
        drawLandmarkOverlay(
          ctx,
          state.sideDetection?.rawFrame,
          state.sideDetection?.filteredFrame
        );
      }
    }

    overlayRafId = requestAnimationFrame(tick);
  };

  overlayRafId = requestAnimationFrame(tick);
};

const stopOverlayLoop = (): void => {
  if (overlayRafId !== undefined) {
    cancelAnimationFrame(overlayRafId);
    overlayRafId = undefined;
  }
};

// ---------------------------------------------------------------------------
// Telemetry + tracking status DOM patching
// ---------------------------------------------------------------------------

const patchTelemetry = (
  state: ReturnType<DiagnosticWorkbench["getState"]>
): void => {
  const frontSlot = document.querySelector<HTMLDivElement>("#wb-front-telemetry");
  const sideSlot = document.querySelector<HTMLDivElement>("#wb-side-telemetry");

  if (frontSlot !== null) {
    frontSlot.innerHTML = renderCaptureTelemetryHTML(
      state.frontCaptureTelemetry,
      "フロント"
    );
  }

  if (sideSlot !== null) {
    sideSlot.innerHTML = renderCaptureTelemetryHTML(
      state.sideCaptureTelemetry,
      "サイド"
    );
  }

  // Patch tracking status
  const frontTrackingSlot = document.querySelector<HTMLDivElement>("#wb-front-tracking-status");
  const sideTrackingSlot = document.querySelector<HTMLDivElement>("#wb-side-tracking-status");

  if (frontTrackingSlot !== null) {
    frontTrackingSlot.innerHTML = renderTrackingStatus(
      state.frontDetection,
      "フロント"
    );
  }

  if (sideTrackingSlot !== null) {
    sideTrackingSlot.innerHTML = renderTrackingStatus(
      state.sideDetection,
      "サイド"
    );
  }
};

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

const render = (): void => {
  const state = workbench.getState();

  const currentFrontStreamId = state.frontStream?.stream.id;
  const currentSideStreamId = state.sideStream?.stream.id;

  const streamsChanged =
    currentFrontStreamId !== lastFrontStreamId ||
    currentSideStreamId !== lastSideStreamId;

  if (
    state.screen === lastScreen &&
    state.screen === "previewing" &&
    !streamsChanged
  ) {
    // Telemetry-only update: patch in-place, don't rebuild the DOM.
    patchTelemetry(state);
    return;
  }

  // Full re-render on screen transitions or stream changes.
  lastScreen = state.screen;
  lastFrontStreamId = currentFrontStreamId;
  lastSideStreamId = currentSideStreamId;
  captureLoopsStarted = false;
  trackingStarted = false;
  stopOverlayLoop();
  root.innerHTML = renderWorkbenchHTML(state);
  attachVideoStreams(state);
  startCaptureLoopsIfNeeded();

  // Start tracker init when first reaching previewing
  if (state.screen === "previewing") {
    void initTrackers();
    startTrackingIfReady();
  }
};

const handleClick = (e: MouseEvent): void => {
  const target = e.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionEl = target.closest<HTMLElement>("[data-wb-action]");

  if (actionEl === null) {
    return;
  }

  const action = actionEl.dataset["wbAction"];

  switch (action) {
    case "requestPermission":
      void workbench.requestPermission();
      break;
    case "confirmDevices": {
      const frontSelect =
        document.querySelector<HTMLSelectElement>("#wb-front-select");
      const sideSelect =
        document.querySelector<HTMLSelectElement>("#wb-side-select");

      if (frontSelect === null || sideSelect === null) {
        return;
      }

      const frontId = frontSelect.value;
      const sideId = sideSelect.value;

      if (frontId === sideId) {
        alert("フロントとサイドには異なるカメラを選択してください。");
        return;
      }

      void workbench.assignDevices(frontId, sideId);
      break;
    }
    case "swap":
      void workbench.swapRoles();
      break;
    case "reselect":
      workbench.reselect();
      break;
  }
};

root.addEventListener("click", handleClick);
workbench.subscribe(render);

// Initial render
render();
