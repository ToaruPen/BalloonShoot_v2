import type { HandFrame, HandLandmarkSet } from "../../shared/types/hand";

type OverlayLandmarkName = keyof HandLandmarkSet;

interface LandmarkOverlayPoint {
  readonly name: OverlayLandmarkName;
  readonly x: number;
  readonly y: number;
}

interface LandmarkOverlayConnection {
  readonly from: OverlayLandmarkName;
  readonly to: OverlayLandmarkName;
}

interface LandmarkOverlayModel {
  readonly width: number;
  readonly height: number;
  readonly points: LandmarkOverlayPoint[];
  readonly connections: LandmarkOverlayConnection[];
}

const LANDMARK_NAMES = [
  "wrist",
  "thumbIp",
  "thumbTip",
  "indexMcp",
  "indexTip",
  "middleTip",
  "ringTip",
  "pinkyTip"
] as const satisfies readonly OverlayLandmarkName[];

const LANDMARK_CONNECTIONS = [
  { from: "wrist", to: "thumbIp" },
  { from: "thumbIp", to: "thumbTip" },
  { from: "wrist", to: "indexMcp" },
  { from: "indexMcp", to: "indexTip" },
  { from: "wrist", to: "middleTip" },
  { from: "middleTip", to: "ringTip" },
  { from: "ringTip", to: "pinkyTip" }
] as const satisfies readonly LandmarkOverlayConnection[];

export const createLandmarkOverlayModel = (
  frame: HandFrame
): LandmarkOverlayModel => ({
  width: frame.width,
  height: frame.height,
  points: LANDMARK_NAMES.map((name) => ({
    name,
    x: frame.landmarks[name].x * frame.width,
    y: frame.landmarks[name].y * frame.height
  })),
  connections: [...LANDMARK_CONNECTIONS]
});
