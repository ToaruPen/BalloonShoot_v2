import { escapeHTML } from "../../shared/browser/escapeHTML";
import {
  SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA,
  type SideTriggerCalibration
} from "../side-trigger";

const valueFor = (
  calibration: SideTriggerCalibration,
  key: (typeof SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA)[number]["key"]
): number =>
  key === "openPoseDistance"
    ? calibration.openPose.normalizedThumbDistance
    : calibration.pulledPose.normalizedThumbDistance;

export const renderSideTriggerCalibrationControls = (
  calibration: SideTriggerCalibration
): string => {
  const controls = SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA.map((metadata) => {
    const value = valueFor(calibration, metadata.key);

    return `
      <label class="wb-tuning-control">
        <span>${escapeHTML(metadata.constantName)}</span>
        <small>${escapeHTML(metadata.displayName)}</small>
        <input
          type="range"
          min="${String(metadata.min)}"
          max="${String(metadata.max)}"
          step="${String(metadata.step)}"
          value="${String(value)}"
          data-side-trigger-calibration="${escapeHTML(metadata.key)}"
        />
        <output id="wb-side-trigger-calibration-value-${escapeHTML(metadata.key)}">${escapeHTML(String(value))}</output>
      </label>
    `;
  }).join("");

  return `
    <section class="wb-tuning-panel wb-side-trigger-calibration-panel">
      <h3>side trigger calibration</h3>
      <p>診断ワークベンチ専用の session-only calibration です。</p>
      <div class="wb-tuning-grid">${controls}</div>
      <button class="wb-btn wb-btn-secondary" data-wb-action="resetSideTriggerCalibration">既定値に戻す</button>
    </section>
  `;
};
