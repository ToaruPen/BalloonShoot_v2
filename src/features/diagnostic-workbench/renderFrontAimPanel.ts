import { escapeHTML } from "../../shared/browser/escapeHTML";
import type {
  AimInputFrame,
  FrontAimTelemetry
} from "../../shared/types/aim";

const formatViewportCoordinate = (value: number | undefined): string =>
  value === undefined ? "unavailable" : value.toFixed(1);

const formatScalar = (value: number | undefined): string =>
  value === undefined
    ? "unavailable"
    : (Math.round(value * 1000) / 1000).toFixed(3);

const renderValue = (label: string, value: string): string => `
  <div class="wb-aim-value">
    <span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong>
  </div>
`;

export const renderFrontAimPanel = (
  aimFrame: AimInputFrame | undefined,
  telemetry?: FrontAimTelemetry
): string => {
  const unavailableMessage =
    aimFrame === undefined && telemetry === undefined
      ? '<p class="wb-unavailable">aim mapping unavailable</p>'
      : "";
  const viewport = aimFrame?.aimPointViewport ?? telemetry?.aimPointViewport;
  const normalized =
    aimFrame?.aimPointNormalized ?? telemetry?.aimPointNormalized;
  const sourceFrameSize =
    aimFrame?.sourceFrameSize ?? telemetry?.sourceFrameSize;
  const sourceFrameSizeText =
    sourceFrameSize === undefined
      ? "unavailable"
      : `${String(sourceFrameSize.width)} x ${String(sourceFrameSize.height)}`;
  const frontHandDetected =
    aimFrame?.frontHandDetected ?? telemetry?.frontHandDetected;
  const lastLostReason =
    telemetry === undefined ? "unavailable" : telemetry.lastLostReason ?? "none";
  const calibration = telemetry?.calibration;

  return `
    <section class="wb-aim-panel" id="wb-front-aim-panel">
      <h4>フロント aim mapping</h4>
      ${unavailableMessage}
      <div class="wb-aim-grid">
        ${renderValue("availability", aimFrame?.aimAvailability ?? telemetry?.aimAvailability ?? "unavailable")}
        ${renderValue("viewport x", formatViewportCoordinate(viewport?.x))}
        ${renderValue("viewport y", formatViewportCoordinate(viewport?.y))}
        ${renderValue("normalized x", formatScalar(normalized?.x))}
        ${renderValue("normalized y", formatScalar(normalized?.y))}
        ${renderValue("smoothing", aimFrame?.aimSmoothingState ?? telemetry?.aimSmoothingState ?? "unavailable")}
        ${renderValue("front hand", frontHandDetected === undefined ? "unavailable" : String(frontHandDetected))}
        ${renderValue("tracking confidence", formatScalar(aimFrame?.frontTrackingConfidence ?? telemetry?.frontTrackingConfidence))}
        ${renderValue("source frame", sourceFrameSizeText)}
        ${renderValue("calibration status", telemetry?.calibrationStatus ?? "unavailable")}
        ${renderValue("calibration center x", formatScalar(calibration?.center.x))}
        ${renderValue("calibration center y", formatScalar(calibration?.center.y))}
        ${renderValue("corner left x", formatScalar(calibration?.cornerBounds.leftX))}
        ${renderValue("corner right x", formatScalar(calibration?.cornerBounds.rightX))}
        ${renderValue("corner top y", formatScalar(calibration?.cornerBounds.topY))}
        ${renderValue("corner bottom y", formatScalar(calibration?.cornerBounds.bottomY))}
        ${renderValue("last lost", lastLostReason)}
      </div>
    </section>
  `;
};
