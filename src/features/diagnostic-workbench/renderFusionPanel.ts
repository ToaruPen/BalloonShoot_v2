import type {
  FusedGameInputFrame,
  FusionTelemetry
} from "../../shared/types/fusion";
import {
  formatScalarOrUnavailable,
  renderDiagnosticValue
} from "./diagnosticValueFormat";

const unavailableTelemetry: FusionTelemetry = {
  mode: "noUsableInput",
  timeDeltaBetweenLanesMs: undefined,
  maxPairDeltaMs: 0,
  maxFrameAgeMs: 0,
  frontBufferFrameCount: 0,
  sideBufferFrameCount: 0,
  frontLatestAgeMs: undefined,
  sideLatestAgeMs: undefined,
  inputConfidence: 0,
  shotFired: false,
  rejectReason: "frontMissing",
  lastPairedFrontTimestampMs: undefined,
  lastPairedSideTimestampMs: undefined,
  timestampSourceSummary: "unavailable",
  shotEdgeConsumed: false
};

export const renderFusionPanel = (
  fusionFrame: FusedGameInputFrame | undefined,
  telemetry: FusionTelemetry | undefined
): string => {
  const model = telemetry ?? unavailableTelemetry;
  const unavailableMessage =
    telemetry === undefined
      ? '<p class="wb-unavailable">fusion unavailable</p>'
      : "";

  return `
    <section class="wb-fusion-panel" id="wb-fusion-panel">
      <h3>fusion pairing</h3>
      ${unavailableMessage}
      <div class="wb-fusion-grid">
        ${renderDiagnosticValue("fusion mode", telemetry?.mode ?? "unavailable")}
        ${renderDiagnosticValue("timestamp delta", formatScalarOrUnavailable(telemetry?.timeDeltaBetweenLanesMs))}
        ${renderDiagnosticValue("max pair delta", telemetry === undefined ? "unavailable" : formatScalarOrUnavailable(model.maxPairDeltaMs))}
        ${renderDiagnosticValue("max frame age", telemetry === undefined ? "unavailable" : formatScalarOrUnavailable(model.maxFrameAgeMs))}
        ${renderDiagnosticValue("front buffer count", telemetry === undefined ? "unavailable" : String(model.frontBufferFrameCount))}
        ${renderDiagnosticValue("side buffer count", telemetry === undefined ? "unavailable" : String(model.sideBufferFrameCount))}
        ${renderDiagnosticValue("front latest age", formatScalarOrUnavailable(telemetry?.frontLatestAgeMs))}
        ${renderDiagnosticValue("side latest age", formatScalarOrUnavailable(telemetry?.sideLatestAgeMs))}
        ${renderDiagnosticValue("input confidence", telemetry === undefined ? "unavailable" : formatScalarOrUnavailable(model.inputConfidence))}
        ${renderDiagnosticValue("shot fired", telemetry === undefined ? "unavailable" : String(model.shotFired))}
        ${renderDiagnosticValue("shot edge consumed", telemetry === undefined ? "unavailable" : String(model.shotEdgeConsumed))}
        ${renderDiagnosticValue("reject reason", telemetry?.rejectReason ?? "unavailable")}
        ${renderDiagnosticValue("front lane health", fusionFrame?.frontSource.laneHealth ?? "unavailable")}
        ${renderDiagnosticValue("side lane health", fusionFrame?.sideSource.laneHealth ?? "unavailable")}
        ${renderDiagnosticValue("front availability", fusionFrame?.frontSource.availability ?? "unavailable")}
        ${renderDiagnosticValue("side availability", fusionFrame?.sideSource.availability ?? "unavailable")}
        ${renderDiagnosticValue("last paired front timestamp", formatScalarOrUnavailable(telemetry?.lastPairedFrontTimestampMs))}
        ${renderDiagnosticValue("last paired side timestamp", formatScalarOrUnavailable(telemetry?.lastPairedSideTimestampMs))}
        ${renderDiagnosticValue("timestamp source summary", telemetry?.timestampSourceSummary ?? "unavailable")}
      </div>
    </section>
  `;
};
