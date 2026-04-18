import type { CameraLaneRole, FrameTimestamp } from "./camera";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface HandednessCategory {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

export interface HandLandmarkSet {
  wrist: Point3D;
  indexTip: Point3D;
  indexMcp: Point3D;
  thumbTip: Point3D;
  thumbIp: Point3D;
  middleTip: Point3D;
  ringTip: Point3D;
  pinkyTip: Point3D;
}

/**
 * Hand landmarks are normalized to the source frame.
 * Origin is the top-left of the image, x increases to the right, y increases downward,
 * and z follows the tracker depth convention where smaller values are closer to the camera.
 */
export interface HandFrame {
  width: number;
  height: number;
  handedness?: HandednessCategory[];
  landmarks: HandLandmarkSet;
  /**
   * World-space landmark coordinates from MediaPipe, when requested and available.
   * These are in metric units and can be used for scale-invariant gesture math.
   */
  worldLandmarks?: HandLandmarkSet;
}

/**
 * A successful hand detection carries both the raw landmark snapshot and the
 * 1€-filtered version. Different downstream consumers need different time
 * characteristics: crosshair and gun-pose evaluation benefit from the smoothed
 * stream, while the transient trigger detection must stay on raw landmarks or
 * the filter shaves away the pull peak.
 */
export interface HandDetection {
  rawFrame: HandFrame;
  filteredFrame: HandFrame;
}

interface LaneHandDetectionBase extends HandDetection {
  readonly laneRole: CameraLaneRole;
  readonly deviceId: string;
  readonly streamId: string;
  readonly timestamp: FrameTimestamp;
  readonly handPresenceConfidence: number;
}

export interface FrontHandDetection extends LaneHandDetectionBase {
  readonly laneRole: "frontAim";
  readonly trackingQuality: "good" | "uncertain" | "lost";
}

export type SideViewQuality = "good" | "frontLike" | "tooOccluded" | "lost";

export interface SideHandDetection extends LaneHandDetectionBase {
  readonly laneRole: "sideTrigger";
  readonly sideViewQuality: SideViewQuality;
}
