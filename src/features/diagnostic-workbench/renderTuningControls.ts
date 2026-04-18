import { escapeHTML } from "../../shared/browser/escapeHTML";
import {
  sideTriggerSliderMetadata,
  type SideTriggerTuning
} from "../side-trigger";

export const renderTuningControls = (tuning: SideTriggerTuning): string => {
  const controls = sideTriggerSliderMetadata
    .map((metadata) => {
      const value = tuning[metadata.key];

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
            data-side-trigger-tuning="${escapeHTML(metadata.key)}"
          />
          <output id="wb-tuning-value-${escapeHTML(metadata.key)}">${escapeHTML(String(value))}</output>
        </label>
      `;
    })
    .join("");

  return `
    <section class="wb-tuning-panel">
      <h3>サイドトリガーしきい値</h3>
      <p>診断ワークベンチ専用の live tuning です。</p>
      <div class="wb-tuning-grid">${controls}</div>
      <button class="wb-btn wb-btn-secondary" data-wb-action="resetSideTriggerTuning">既定値に戻す</button>
    </section>
  `;
};
