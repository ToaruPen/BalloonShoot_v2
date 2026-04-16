import type { WorkbenchState } from "./DiagnosticWorkbench";
import { escapeHTML } from "../../shared/browser/escapeHTML";

const renderPermissionScreen = (): string => `
  <div class="wb-screen">
    <h2>診断ワークベンチ</h2>
    <p>フロントカメラ（照準）とサイドカメラ（トリガー）の2台を使います。</p>
    <button class="wb-btn" data-wb-action="requestPermission">カメラ許可</button>
  </div>
`;

const renderPermissionDenied = (): string => `
  <div class="wb-screen wb-error">
    <h2>カメラ許可が拒否されました</h2>
    <p><strong>原因:</strong> ブラウザのカメラ権限が拒否されました。</p>
    <p><strong>影響:</strong> フロント・サイド両方のキャプチャが開始できません。</p>
    <p><strong>再現:</strong> リロードしてカメラ権限を拒否してください。</p>
    <p><strong>対処:</strong> ブラウザのサイト設定でカメラ権限を許可し、リトライしてください。</p>
    <button class="wb-btn" data-wb-action="requestPermission">リトライ</button>
  </div>
`;

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
          ${state.devices
            .map((d, i) => renderDeviceOption(d, i))
            .join("")}
        </select>
      </label>
    </div>
    <button class="wb-btn" data-wb-action="confirmDevices">確定</button>
  </div>
`;

const renderPreviewing = (state: WorkbenchState): string => `
  <div class="wb-previewing">
    <h2>ライブプレビュー</h2>
    <div class="wb-preview-grid">
      <div class="wb-preview-lane">
        <h3>フロント（照準）</h3>
        <p class="wb-device-label">${escapeHTML(state.frontAssignment?.label ?? "未選択")}</p>
        <video id="wb-front-video" autoplay playsinline muted></video>
      </div>
      <div class="wb-preview-lane">
        <h3>サイド（トリガー）</h3>
        <p class="wb-device-label">${escapeHTML(state.sideAssignment?.label ?? "未選択")}</p>
        <video id="wb-side-video" autoplay playsinline muted></video>
      </div>
    </div>
    <div class="wb-controls">
      <button class="wb-btn" data-wb-action="swap">左右入れ替え</button>
      <button class="wb-btn wb-btn-secondary" data-wb-action="reselect">再選択</button>
    </div>
  </div>
`;

export const renderWorkbenchHTML = (state: WorkbenchState): string => {
  switch (state.screen) {
    case "permission":
      return renderPermissionScreen();
    case "permissionDenied":
      return renderPermissionDenied();
    case "singleCamera":
      return renderSingleCamera();
    case "deviceSelection":
      return renderDeviceSelection(state);
    case "previewing":
      return renderPreviewing(state);
  }
};
