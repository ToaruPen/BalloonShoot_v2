import type { HandDetection } from "../types/hand";

export const handPresenceConfidenceFor = (detection: HandDetection): number => {
  const scores = detection.rawFrame.handedness?.map((hand) => hand.score) ?? [];

  return scores.length === 0 ? 1 : Math.max(...scores);
};
