import "./styles/diagnostic.css";
import { observeDeviceChange } from "./features/camera/observeDeviceChange";
import {
  createDiagnosticWorkbench,
  type DiagnosticWorkbench
} from "./features/diagnostic-workbench/DiagnosticWorkbench";
import { renderWorkbenchHTML } from "./features/diagnostic-workbench/renderWorkbench";
import { createLiveLandmarkInspection } from "./features/diagnostic-workbench/liveLandmarkInspection";
import { createSessionRecorder } from "./features/diagnostic-workbench/recording/sessionRecorder";
import { formatRecordingTimer } from "./features/diagnostic-workbench/renderRecordingControls";

const root = document.querySelector<HTMLDivElement>("#diagnostic-app");

if (!root) {
  throw new Error("Missing #diagnostic-app root");
}

const liveInspection = createLiveLandmarkInspection();
const recorder = createSessionRecorder();
const workbench: DiagnosticWorkbench = createDiagnosticWorkbench({
  stopActiveRecording: () => recorder.stop()
});
let recordingTimerId: number | undefined;

const runAction = (actionPromise: Promise<void>): void => {
  void actionPromise.catch((error: unknown) => {
    console.error("Diagnostic workbench action failed", error);
  });
};

const deviceChangeObserver = observeDeviceChange(() => {
  runAction(workbench.refreshDevicesFromDeviceChange());
});

const render = (): void => {
  const state = workbench.getState();
  root.innerHTML = renderWorkbenchHTML(
    state,
    liveInspection.getState(),
    recorder.getState()
  );
  attachVideoStreams(state);
  liveInspection.sync(state);
  liveInspection.updateDom();
  syncRecordingTimer();
};

const updateRecordingTimer = (): void => {
  const timerElement = document.querySelector<HTMLElement>(
    "[data-recording-timer]"
  );
  const recordingState = recorder.getState();

  if (timerElement === null || recordingState.status !== "recording") {
    return;
  }

  timerElement.textContent = formatRecordingTimer(recordingState.elapsedMs);
};

const syncRecordingTimer = (): void => {
  const isRecording = recorder.getState().status === "recording";

  if (
    isRecording &&
    recordingTimerId === undefined &&
    typeof window.setInterval === "function"
  ) {
    recordingTimerId = window.setInterval(updateRecordingTimer, 1000);
    return;
  }

  if (
    !isRecording &&
    recordingTimerId !== undefined &&
    typeof window.clearInterval === "function"
  ) {
    window.clearInterval(recordingTimerId);
    recordingTimerId = undefined;
  }
};

const attachVideoStreams = (
  state: ReturnType<DiagnosticWorkbench["getState"]>
): void => {
  if (state.screen !== "previewing") {
    return;
  }

  const frontVideo =
    document.querySelector<HTMLVideoElement>("#wb-front-video");
  const frontFilteredVideo = document.querySelector<HTMLVideoElement>(
    "#wb-front-filtered-video"
  );
  const sideVideo = document.querySelector<HTMLVideoElement>("#wb-side-video");
  const sideFilteredVideo = document.querySelector<HTMLVideoElement>(
    "#wb-side-filtered-video"
  );

  if (frontVideo !== null && state.frontStream !== undefined) {
    frontVideo.srcObject = state.frontStream.stream;
  }

  if (frontFilteredVideo !== null && state.frontStream !== undefined) {
    frontFilteredVideo.srcObject = state.frontStream.stream;
  }

  if (sideVideo !== null && state.sideStream !== undefined) {
    sideVideo.srcObject = state.sideStream.stream;
  }

  if (sideFilteredVideo !== null && state.sideStream !== undefined) {
    sideFilteredVideo.srcObject = state.sideStream.stream;
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
      runAction(workbench.requestPermission());
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

      runAction(workbench.assignDevices(frontId, sideId));
      break;
    }
    case "swap":
      runAction(workbench.swapRoles());
      break;
    case "reselect":
      workbench.reselect();
      break;
    case "resetSideTriggerTuning":
      liveInspection.resetSideTriggerTuning();
      render();
      break;
    case "resetFrontAimCalibration":
      liveInspection.resetFrontAimCalibration();
      render();
      break;
    case "resetSideTriggerCalibration":
      liveInspection.resetSideTriggerCalibration();
      render();
      break;
    case "resetFusionTuning":
      liveInspection.resetFusionTuning();
      render();
      break;
    case "startRecording": {
      const state = workbench.getState();

      if (
        state.screen !== "previewing" ||
        state.frontStream === undefined ||
        state.sideStream === undefined
      ) {
        return;
      }

      runAction(
        recorder.start({
          frontStream: state.frontStream.stream,
          sideStream: state.sideStream.stream,
          subscribeFrame: (callback) => liveInspection.subscribeFrame(callback)
        })
      );
      break;
    }
    case "stopRecording":
      runAction(recorder.stop());
      break;
  }
};

root.addEventListener("click", handleClick);
root.addEventListener("input", (e: Event) => {
  const target = e.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const numericValue = target.valueAsNumber;

  if (!Number.isFinite(numericValue)) {
    return;
  }

  const sideTriggerKey = target.dataset["sideTriggerTuning"];

  if (sideTriggerKey !== undefined) {
    liveInspection.setSideTriggerTuning(
      sideTriggerKey as Parameters<
        typeof liveInspection.setSideTriggerTuning
      >[0],
      numericValue
    );
    return;
  }

  const frontAimCalibrationKey = target.dataset["frontAimCalibration"];

  if (frontAimCalibrationKey !== undefined) {
    liveInspection.setFrontAimCalibration(
      frontAimCalibrationKey as Parameters<
        typeof liveInspection.setFrontAimCalibration
      >[0],
      numericValue
    );
    return;
  }

  const sideTriggerCalibrationKey = target.dataset["sideTriggerCalibration"];

  if (sideTriggerCalibrationKey !== undefined) {
    liveInspection.setSideTriggerCalibration(
      sideTriggerCalibrationKey as Parameters<
        typeof liveInspection.setSideTriggerCalibration
      >[0],
      numericValue
    );
    return;
  }

  const fusionKey = target.dataset["fusionTuning"];

  if (fusionKey !== undefined) {
    liveInspection.setFusionTuning(
      fusionKey as Parameters<typeof liveInspection.setFusionTuning>[0],
      numericValue
    );
  }
});
workbench.subscribe(render);
recorder.subscribe(render);
window.addEventListener("beforeunload", () => {
  deviceChangeObserver.stop();
  if (
    recordingTimerId !== undefined &&
    typeof window.clearInterval === "function"
  ) {
    window.clearInterval(recordingTimerId);
    recordingTimerId = undefined;
  }
  void recorder.destroy();
  liveInspection.destroy();
  workbench.destroy();
});

// Initial render
render();
