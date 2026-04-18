import { escapeHTML } from "../../shared/browser/escapeHTML";
import type { SideHandDetection } from "../../shared/types/hand";
import { formatFrameTimestamp } from "./timestampFormat";

const landmarkNames = [
  "wrist",
  "thumbIp",
  "thumbTip",
  "indexMcp",
  "indexTip"
] as const;

const formatCoordinate = (value: number): string => value.toFixed(3);

export const renderSideWorldLandmarks = (
  sideDetection: SideHandDetection | undefined
): string => {
  const worldLandmarks = sideDetection?.rawFrame.worldLandmarks;

  if (sideDetection === undefined || worldLandmarks === undefined) {
    return `
      <section class="wb-world-landmarks" id="wb-side-world-landmarks">
        <h4>サイド world landmarks</h4>
        <p class="wb-unavailable">world landmarks unavailable</p>
      </section>
    `;
  }

  const rows = landmarkNames
    .map((name) => {
      const point = worldLandmarks[name];
      const coordinates = [
        formatCoordinate(point.x),
        formatCoordinate(point.y),
        formatCoordinate(point.z)
      ].join(" / ");

      return `
        <tr>
          <th scope="row">${escapeHTML(name)}</th>
          <td>${escapeHTML(coordinates)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="wb-world-landmarks" id="wb-side-world-landmarks">
      <h4>サイド world landmarks</h4>
      <p class="wb-timestamp-readout">${escapeHTML(formatFrameTimestamp(sideDetection.timestamp))}</p>
      <p class="wb-timestamp-readout">frames: ${escapeHTML(String(sideDetection.timestamp.presentedFrames ?? "unavailable"))}</p>
      <table>
        <thead>
          <tr><th>landmark</th><th>x / y / z</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
};
