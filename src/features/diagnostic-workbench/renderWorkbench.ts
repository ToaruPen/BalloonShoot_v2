import type { WorkbenchError, WorkbenchState } from "./DiagnosticWorkbench";
import { escapeHTML } from "../../shared/browser/escapeHTML";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "../../shared/types/camera";
import { defaultFusionTuning } from "../input-fusion";
import { defaultFrontAimCalibration } from "../front-aim";
import {
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning
} from "../side-trigger";
import { formatFrameTimestamp } from "./timestampFormat";
import { renderFrontAimCalibrationControls } from "./renderFrontAimCalibrationControls";
import { renderFrontAimPanel } from "./renderFrontAimPanel";
import { renderFusionPanel } from "./renderFusionPanel";
import { renderFusionTuningControls } from "./renderFusionTuningControls";
import { renderSideTriggerCalibrationControls } from "./renderSideTriggerCalibrationControls";
import { renderSideTriggerAdaptiveCalibrationPanel } from "./renderSideTriggerAdaptiveCalibrationPanel";
import { renderSideTriggerPanel } from "./renderSideTriggerPanel";
import { renderSideWorldLandmarks } from "./renderWorldLandmarks";
import { renderTuningControls } from "./renderTuningControls";
import { renderRecordingControls } from "./renderRecordingControls";
import type { RecordingState } from "./recording/sessionRecorder";
import type { WorkbenchInspectionState } from "./workbenchInspectionState";

const renderPermissionScreen = (): string => `
  <div class="wb-screen">
    <h2>診断ワークベンチ</h2>
    <p>フロントカメラ（照準）とサイドカメラ（トリガー）の2台を使います。</p>
    <button class="wb-btn" data-wb-action="requestPermission">カメラ許可</button>
  </div>
`;

const fallbackError: WorkbenchError = {
  kind: "cameraOpenFailed",
  title: "カメラを開始できません",
  cause: "カメラ処理中に失敗しました。",
  impact: "診断ワークベンチを続行できません。",
  reproduction: "同じ操作をもう一度実行してください。",
  nextAction: "ページをリロードしてリトライしてください。"
};

const renderErrorDetails = (error: WorkbenchError | undefined): string => {
  const detail = error ?? fallbackError;

  return `
  <div class="wb-screen wb-error">
    <h2>${escapeHTML(detail.title)}</h2>
    <p><strong>原因:</strong> ${escapeHTML(detail.cause)}</p>
    <p><strong>影響:</strong> ${escapeHTML(detail.impact)}</p>
    <p><strong>再現:</strong> ${escapeHTML(detail.reproduction)}</p>
    <p><strong>対処:</strong> ${escapeHTML(detail.nextAction)}</p>
    <button class="wb-btn" data-wb-action="requestPermission">リトライ</button>
  </div>
`;
};

const renderInlineError = (error: WorkbenchError | undefined): string => {
  if (error === undefined) {
    return "";
  }

  return `
    <div class="wb-inline-error" role="alert">
      <strong>${escapeHTML(error.title)}</strong>
      <p><strong>原因:</strong> ${escapeHTML(error.cause)}</p>
      <p><strong>影響:</strong> ${escapeHTML(error.impact)}</p>
      <p><strong>再現:</strong> ${escapeHTML(error.reproduction)}</p>
      <p><strong>対処:</strong> ${escapeHTML(error.nextAction)}</p>
    </div>
  `;
};

const renderSingleCamera = (): string => `
  <div class="wb-screen wb-warning">
    <h2>カメラが1台しか検出されません</h2>
    <p>v2トリガー設計の検証には2台のカメラが必要です。</p>
    <p>1台のカメラをフロントとサイドの両方に再利用することはできません。</p>
    <button class="wb-btn" data-wb-action="requestPermission">リトライ</button>
  </div>
`;

const renderDeviceOption = (device: MediaDeviceInfo, index: number): string => {
  const label =
    device.label !== "" ? device.label : `Camera ${String(index + 1)}`;

  return `<option value="${escapeHTML(device.deviceId)}">${escapeHTML(label)}</option>`;
};

const renderDeviceSelection = (state: WorkbenchState): string => `
  <div class="wb-screen">
    <h2>カメラ選択</h2>
    <p>フロント（照準）とサイド（トリガー）にそれぞれ別のカメラを割り当ててください。</p>
    ${renderInlineError(state.error)}
    <div class="wb-select-row">
      <label>
        フロント（照準）:
        <select id="wb-front-select">
          ${state.devices.map((d, i) => renderDeviceOption(d, i)).join("")}
        </select>
      </label>
    </div>
    <div class="wb-select-row">
      <label>
        サイド（トリガー）:
        <select id="wb-side-select">
          ${state.devices.map((d, i) => renderDeviceOption(d, i)).join("")}
        </select>
      </label>
    </div>
    <button class="wb-btn" data-wb-action="confirmDevices">確定</button>
  </div>
`;

const defaultInspectionState: WorkbenchInspectionState = {
  frontDetection: undefined,
  sideDetection: undefined,
  frontFrameTimestamp: undefined,
  sideFrameTimestamp: undefined,
  frontLaneHealth: "notStarted",
  sideLaneHealth: "notStarted",
  frontAimFrame: undefined,
  frontAimTelemetry: undefined,
  frontAimCalibration: defaultFrontAimCalibration,
  sideTriggerFrame: undefined,
  sideTriggerTelemetry: undefined,
  sideTriggerCalibration: defaultSideTriggerCalibration,
  sideTriggerTuning: defaultSideTriggerTuning,
  fusionFrame: undefined,
  fusionTelemetry: undefined,
  fusionTuning: defaultFusionTuning
};

const defaultRecordingState: RecordingState = { status: "idle" };

const renderInspectionPane = (
  lanePrefix: "front" | "side",
  kind: "raw" | "filtered"
): string => {
  const label = kind === "raw" ? "生ランドマーク" : "フィルタ後ランドマーク";
  const videoId =
    kind === "raw"
      ? `wb-${lanePrefix}-video`
      : `wb-${lanePrefix}-${kind}-video`;

  return `
    <div class="wb-inspection-pane">
      <h4>${label}</h4>
      <div class="wb-video-stack">
        <video id="${videoId}" autoplay playsinline muted></video>
        <canvas id="wb-${lanePrefix}-${kind}-overlay" class="wb-landmark-overlay"></canvas>
      </div>
    </div>
  `;
};

export const formatLaneHealthLabel = (health: LaneHealthStatus): string => {
  switch (health) {
    case "captureLost":
      return `${health} (カメラが切断されました)`;
    case "failed":
      return `${health} (カメラ処理に失敗しました)`;
    case "stalled":
      return `${health} (カメラ入力が停止しています)`;
    case "notStarted":
    case "waitingForPermission":
    case "waitingForDeviceSelection":
    case "capturing":
    case "tracking":
      return health;
  }
};

const renderInspectionLane = (
  lanePrefix: "front" | "side",
  title: string,
  deviceLabel: string,
  health: LaneHealthStatus,
  timestamp: FrameTimestamp | undefined,
  extraContent = ""
): string => `
  <section class="wb-preview-lane wb-inspection-lane">
    <h3>${title}</h3>
    <p class="wb-device-label">${escapeHTML(deviceLabel)}</p>
    <p id="wb-${lanePrefix}-health" class="wb-lane-health">health: ${escapeHTML(formatLaneHealthLabel(health))}</p>
    <p id="wb-${lanePrefix}-timestamp" class="wb-timestamp-readout">${escapeHTML(formatFrameTimestamp(timestamp))}</p>
    <div class="wb-inspection-panes">
      ${renderInspectionPane(lanePrefix, "raw")}
      ${renderInspectionPane(lanePrefix, "filtered")}
    </div>
    ${extraContent}
  </section>
`;

const renderPreviewing = (
  state: WorkbenchState,
  inspection: WorkbenchInspectionState,
  recording: RecordingState
): string => `
  <div class="wb-previewing">
    <h2>ライブプレビュー</h2>
    ${renderInlineError(state.error)}
    ${renderRecordingControls(recording)}
    <div class="wb-preview-grid">
      ${renderInspectionLane(
        "front",
        "フロント（照準）",
        state.frontAssignment?.label ?? "未選択",
        inspection.frontLaneHealth,
        inspection.frontDetection?.timestamp ?? inspection.frontFrameTimestamp,
        renderFrontAimPanel(
          inspection.frontAimFrame,
          inspection.frontAimTelemetry
        )
      )}
      ${renderInspectionLane(
        "side",
        "サイド（トリガー）",
        state.sideAssignment?.label ?? "未選択",
        inspection.sideLaneHealth,
        inspection.sideDetection?.timestamp ?? inspection.sideFrameTimestamp,
        `${renderSideWorldLandmarks(inspection.sideDetection)}
        ${renderSideTriggerPanel(
          inspection.sideTriggerFrame,
          inspection.sideTriggerTelemetry
        )}
        ${renderSideTriggerAdaptiveCalibrationPanel(
          inspection.sideTriggerAdaptiveCalibration
        )}`
      )}
    </div>
    ${renderFusionPanel(inspection.fusionFrame, inspection.fusionTelemetry)}
    ${renderFrontAimCalibrationControls(inspection.frontAimCalibration)}
    ${renderSideTriggerCalibrationControls(inspection.sideTriggerCalibration)}
    ${renderTuningControls(inspection.sideTriggerTuning)}
    ${renderFusionTuningControls(inspection.fusionTuning)}
    <div class="wb-controls">
      <button class="wb-btn" data-wb-action="swap">左右入れ替え</button>
      <button class="wb-btn wb-btn-secondary" data-wb-action="reselect">再選択</button>
    </div>
  </div>
`;

export const renderWorkbenchHTML = (
  state: WorkbenchState,
  inspection: WorkbenchInspectionState = defaultInspectionState,
  recording: RecordingState = defaultRecordingState
): string => {
  switch (state.screen) {
    case "permission":
      return renderPermissionScreen();
    case "cameraUnsupported":
    case "permissionDenied":
    case "permissionFailed":
    case "cameraNotFound":
    case "enumerationFailed":
    case "cameraConstraintFailed":
    case "cameraOpenFailed":
      return renderErrorDetails(state.error);
    case "singleCamera":
      return renderSingleCamera();
    case "deviceSelection":
      return renderDeviceSelection(state);
    case "previewing":
      return renderPreviewing(state, inspection, recording);
  }
};
