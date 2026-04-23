import { escapeHTML } from "../../shared/browser/escapeHTML";
import type {
  SideTriggerPhase,
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

type ThumbState = "up" | "pulling" | "down" | "releasing" | "unknown";

const deriveThumbState = (phase: SideTriggerPhase | undefined): ThumbState => {
  switch (phase) {
    case "SideTriggerOpenReady":
      return "up";
    case "SideTriggerPullCandidate":
      return "pulling";
    case "SideTriggerPulledLatched":
    case "SideTriggerCooldown":
      return "down";
    case "SideTriggerReleaseCandidate":
      return "releasing";
    case "SideTriggerNoHand":
    case "SideTriggerPoseSearching":
    case "SideTriggerRecoveringAfterLoss":
    case undefined:
    default:
      return "unknown";
  }
};

const THUMB_STATE_LABEL: Record<ThumbState, string> = {
  up: "親指 UP (open)",
  pulling: "親指 ↓ pulling",
  down: "親指 DOWN (pulled)",
  releasing: "親指 ↑ releasing",
  unknown: "親指 —"
};

const renderThumbStateBadge = (phase: SideTriggerPhase | undefined): string => {
  const state = deriveThumbState(phase);
  return `
    <p class="wb-thumb-state wb-thumb-state--${state}" data-thumb-state="${state}">
      ${escapeHTML(THUMB_STATE_LABEL[state])}
    </p>
  `;
};

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
      ${renderThumbStateBadge(phase)}
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
