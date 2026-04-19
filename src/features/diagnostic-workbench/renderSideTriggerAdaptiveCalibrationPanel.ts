import { escapeHTML } from "../../shared/browser/escapeHTML";
import type { SideTriggerAdaptiveCalibrationTelemetry } from "../side-trigger";

const formatNumber = (value: number | undefined): string =>
  value === undefined ? "--" : value.toFixed(3);

const renderValue = (label: string, value: string): string => `
  <div class="wb-trigger-value">
    <span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong>
  </div>
`;

export const renderSideTriggerAdaptiveCalibrationPanel = (
  telemetry: SideTriggerAdaptiveCalibrationTelemetry | undefined
): string => {
  if (telemetry === undefined) {
    return `
      <section class="wb-trigger-panel" id="wb-side-trigger-adaptive-panel">
        <h4>adaptive side-trigger calibration</h4>
        <p class="wb-unavailable">adaptive calibration unavailable</p>
      </section>
    `;
  }

  const ema = telemetry.geometrySignatureEma;

  return `
    <section class="wb-trigger-panel" id="wb-side-trigger-adaptive-panel">
      <h4>adaptive side-trigger calibration</h4>
      <div class="wb-trigger-grid">
        ${renderValue("status", telemetry.status)}
        ${renderValue("sample window", `${String(telemetry.sampleCount)} / ${String(telemetry.windowSize)}`)}
        ${renderValue("pulled calibrated", formatNumber(telemetry.pulledCalibrated))}
        ${renderValue("open calibrated", formatNumber(telemetry.openCalibrated))}
        ${renderValue("observed pulled percentile", formatNumber(telemetry.observedPulledP10))}
        ${renderValue("observed open percentile", formatNumber(telemetry.observedOpenP90))}
        ${renderValue("last reset", telemetry.lastResetReason ?? "none")}
        ${renderValue("reset timestamp", formatNumber(telemetry.lastResetTimestampMs))}
        ${renderValue("ema wrist-index", formatNumber(ema?.wristToIndexMcp))}
        ${renderValue("ema wrist-middle", formatNumber(ema?.wristToMiddleMcp))}
        ${renderValue("ema index-pinky", formatNumber(ema?.indexMcpToPinkyMcp))}
      </div>
    </section>
  `;
};
