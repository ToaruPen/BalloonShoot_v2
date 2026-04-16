import "./styles/diagnostic.css";
import {
  createDiagnosticWorkbench,
  type DiagnosticWorkbench,
  type WorkbenchScreen
} from "./features/diagnostic-workbench/DiagnosticWorkbench";
import {
  renderWorkbenchHTML,
  renderCaptureTelemetryHTML
} from "./features/diagnostic-workbench/renderWorkbench";

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

/**
 * Patch only the telemetry `<div>` elements in the DOM without
 * replacing the entire previewing layout (which would destroy videos).
 */
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
};

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
  root.innerHTML = renderWorkbenchHTML(state);
  attachVideoStreams(state);
  startCaptureLoopsIfNeeded();
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
