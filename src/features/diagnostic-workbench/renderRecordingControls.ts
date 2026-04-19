import { escapeHTML } from "../../shared/browser/escapeHTML";
import type { RecordingState } from "./recording/sessionRecorder";

export const formatRecordingTimer = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const renderAction = (state: RecordingState): string => {
  switch (state.status) {
    case "recording":
      return `<button class="wb-btn wb-recording-stop" data-wb-action="stopRecording">Stop</button>`;
    case "starting":
      return `<button class="wb-btn wb-btn-secondary" disabled>Preparing</button>`;
    case "saving":
      return `<button class="wb-btn wb-btn-secondary" disabled>Saving</button>`;
    case "idle":
    case "error":
      return `<button class="wb-btn" data-wb-action="startRecording">Record</button>`;
  }
};

const renderTimer = (state: RecordingState): string =>
  state.status === "recording"
    ? `<div class="wb-diagnostic-value"><span>Timer</span><strong data-recording-timer>${escapeHTML(formatRecordingTimer(state.elapsedMs))}</strong></div>`
    : "";

const renderError = (state: RecordingState): string =>
  state.status === "error"
    ? `<p class="wb-recording-error" role="alert">${escapeHTML(state.message)}</p>`
    : "";

export const renderRecordingControls = (state: RecordingState): string => `
  <section id="wb-recording-panel" class="wb-recording-panel">
    <h3>Recording</h3>
    <div class="wb-recording-grid">
      <div class="wb-diagnostic-value"><span>Status</span><strong>${escapeHTML(state.status)}</strong></div>
      ${renderTimer(state)}
    </div>
    ${renderError(state)}
    ${renderAction(state)}
  </section>
`;
