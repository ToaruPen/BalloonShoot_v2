import { escapeHTML } from "../../shared/browser/escapeHTML";
import type {
  SideTriggerTelemetry,
  TriggerInputFrame
} from "../../shared/types/trigger";

const formatScalar = (value: number): string => value.toFixed(3);

const renderValue = (label: string, value: string): string => `
  <div class="wb-trigger-value">
    <span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong>
  </div>
`;

export const renderSideTriggerPanel = (
  triggerFrame: TriggerInputFrame | undefined,
  telemetry?: SideTriggerTelemetry
): string => {
  if (triggerFrame === undefined && telemetry === undefined) {
    return `
      <section class="wb-trigger-panel" id="wb-side-trigger-panel">
        <h4>サイド trigger evidence</h4>
        <p class="wb-unavailable">side trigger unavailable</p>
      </section>
    `;
  }

  const phase = triggerFrame?.sideTriggerPhase ?? telemetry?.phase;
  const edge = triggerFrame?.triggerEdge ?? telemetry?.edge ?? "none";
  const counts = triggerFrame?.dwellFrameCounts ?? telemetry?.dwellFrameCounts;
  const shotCommitted =
    edge === "shotCommitted"
      ? '<p class="wb-shot-committed">SHOT COMMITTED</p>'
      : "";

  return `
    <section class="wb-trigger-panel" id="wb-side-trigger-panel">
      <h4>サイド trigger evidence</h4>
      ${shotCommitted}
      <div class="wb-trigger-grid">
        ${renderValue("phase", phase ?? "unavailable")}
        ${renderValue("triggerEdge", edge)}
        ${renderValue("calibration", telemetry?.calibrationStatus ?? "unavailable")}
        ${renderValue("triggerPulled", String(triggerFrame?.triggerPulled ?? false))}
        ${renderValue("pull evidence", formatScalar(telemetry?.pullEvidenceScalar ?? 0))}
        ${renderValue("release evidence", formatScalar(telemetry?.releaseEvidenceScalar ?? 0))}
        ${renderValue("posture confidence", formatScalar(telemetry?.triggerPostureConfidence ?? 0))}
        ${renderValue("shot confidence", formatScalar(triggerFrame?.shotCandidateConfidence ?? telemetry?.shotCandidateConfidence ?? 0))}
        ${renderValue("pull dwell", String(counts?.pullDwellFrames ?? 0))}
        ${renderValue("release dwell", String(counts?.releaseDwellFrames ?? 0))}
        ${renderValue("cooldown", String(telemetry?.cooldownRemainingFrames ?? counts?.cooldownRemainingFrames ?? 0))}
        ${renderValue("last reject", telemetry?.lastRejectReason ?? "none")}
      </div>
    </section>
  `;
};
