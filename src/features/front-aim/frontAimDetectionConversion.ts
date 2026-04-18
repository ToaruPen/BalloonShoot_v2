import { gameConfig } from "../../shared/config/gameConfig";
import type { FrameTimestamp } from "../../shared/types/camera";
import type { FrontHandDetection, HandDetection } from "../../shared/types/hand";

interface ToFrontDetectionOptions {
  readonly deviceId: string;
  readonly streamId: string;
  readonly timestamp: FrameTimestamp;
}

interface ResolveFrontAimViewportSizeOptions {
  readonly widthCandidates: readonly (number | undefined)[];
  readonly heightCandidates: readonly (number | undefined)[];
}

export const getFrontAimFilterConfig = () => ({
  minCutoff: gameConfig.input.handFilterMinCutoff,
  beta: gameConfig.input.handFilterBeta,
  dCutoff: gameConfig.input.handFilterDCutoff
});

export const handPresenceConfidenceFor = (detection: HandDetection): number => {
  const scores = detection.rawFrame.handedness?.map((hand) => hand.score) ?? [];

  return scores.length === 0 ? 1 : Math.max(...scores);
};

export const toFrontDetection = (
  detection: HandDetection,
  options: ToFrontDetectionOptions
): FrontHandDetection => ({
  laneRole: "frontAim",
  deviceId: options.deviceId,
  streamId: options.streamId,
  timestamp: options.timestamp,
  rawFrame: detection.rawFrame,
  filteredFrame: detection.filteredFrame,
  handPresenceConfidence: handPresenceConfidenceFor(detection),
  trackingQuality: "good"
});

const firstPositiveDimension = (
  candidates: readonly (number | undefined)[]
): number => candidates.find((value) => value !== undefined && value > 0) ?? 1;

export const resolveFrontAimViewportSize = ({
  widthCandidates,
  heightCandidates
}: ResolveFrontAimViewportSizeOptions): { width: number; height: number } => ({
  width: firstPositiveDimension(widthCandidates),
  height: firstPositiveDimension(heightCandidates)
});
