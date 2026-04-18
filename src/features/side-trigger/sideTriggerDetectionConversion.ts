import type { FrameTimestamp } from "../../shared/types/camera";
import type { HandDetection, SideHandDetection } from "../../shared/types/hand";

interface ToSideDetectionOptions {
  readonly deviceId: string;
  readonly streamId: string;
  readonly timestamp: FrameTimestamp;
}

const handPresenceConfidenceFor = (detection: HandDetection): number => {
  const scores = detection.rawFrame.handedness?.map((hand) => hand.score) ?? [];

  return scores.length === 0 ? 1 : Math.max(...scores);
};

export const toSideDetection = (
  detection: HandDetection,
  options: ToSideDetectionOptions
): SideHandDetection => ({
  laneRole: "sideTrigger",
  deviceId: options.deviceId,
  streamId: options.streamId,
  timestamp: options.timestamp,
  rawFrame: detection.rawFrame,
  filteredFrame: detection.filteredFrame,
  handPresenceConfidence: handPresenceConfidenceFor(detection),
  sideViewQuality: "good"
});
