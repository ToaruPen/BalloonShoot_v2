import { escapeHTML } from "../../shared/browser/escapeHTML";
import type {
  SideTriggerTelemetry,
  TriggerInputFrame
} from "../../shared/types/trigger";

const formatScalar = (value: number): string => value.toFixed(3);

const formatScalarOrUnavailable = (value: number | undefined): string =>
  value === undefined ? "unavailable" : formatScalar(value);

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
  const triggerPulled =
    triggerFrame === undefined ? "unavailable" : String(triggerFrame.triggerPulled);
  const lastReject =
    telemetry === undefined ? "unavailable" : telemetry.lastRejectReason ?? "none";
  const calibration = telemetry?.calibration;
  const shotCommitted =
    edge.includes("shotCommitted")
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
        ${renderValue("open pose distance", formatScalarOrUnavailable(calibration?.openPose.normalizedThumbDistance))}
        ${renderValue("pulled pose distance", formatScalarOrUnavailable(calibration?.pulledPose.normalizedThumbDistance))}
        ${renderValue("triggerPulled", triggerPulled)}
        ${renderValue("pull evidence", formatScalarOrUnavailable(telemetry?.pullEvidenceScalar))}
        ${renderValue("release evidence", formatScalarOrUnavailable(telemetry?.releaseEvidenceScalar))}
        ${renderValue("posture confidence", formatScalarOrUnavailable(telemetry?.triggerPostureConfidence))}
        ${renderValue("shot confidence", formatScalar(triggerFrame?.shotCandidateConfidence ?? telemetry?.shotCandidateConfidence ?? 0))}
        ${renderValue("pull dwell", String(counts?.pullDwellFrames ?? 0))}
        ${renderValue("release dwell", String(counts?.releaseDwellFrames ?? 0))}
        ${renderValue("cooldown", String(telemetry?.cooldownRemainingFrames ?? counts?.cooldownRemainingFrames ?? 0))}
        ${renderValue("last reject", lastReject)}
      </div>
    </section>
  `;
};
