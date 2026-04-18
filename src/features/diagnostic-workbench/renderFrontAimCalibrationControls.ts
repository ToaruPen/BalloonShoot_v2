import { escapeHTML } from "../../shared/browser/escapeHTML";
import {
  FRONT_AIM_CALIBRATION_SLIDER_METADATA,
  type FrontAimCalibrationKey,
  type FrontAimCalibration
} from "../front-aim";

const assertNever = (value: never): never => {
  throw new Error(`Unhandled front aim calibration key: ${String(value)}`);
};

const valueFor = (
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
    default:
      return assertNever(key);
  }
};

export const renderFrontAimCalibrationControls = (
  calibration: FrontAimCalibration
): string => {
  const controls = FRONT_AIM_CALIBRATION_SLIDER_METADATA.map((metadata) => {
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
          data-front-aim-calibration="${escapeHTML(metadata.key)}"
        />
        <output id="wb-front-aim-calibration-value-${escapeHTML(metadata.key)}">${escapeHTML(String(value))}</output>
      </label>
    `;
  }).join("");

  return `
    <section id="wb-front-aim-calibration-panel" class="wb-tuning-panel wb-front-aim-calibration-panel">
      <h3>front aim calibration</h3>
      <p>診断ワークベンチ専用の session-only calibration です。</p>
      <div class="wb-tuning-grid">${controls}</div>
      <button class="wb-btn wb-btn-secondary" data-wb-action="resetFrontAimCalibration">既定値に戻す</button>
    </section>
  `;
};
