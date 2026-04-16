import type { HandFrame } from "./hand";
import type { FrameTimestamp } from "./timestamp";

/**
 * Tracking quality for the front aim lane.
 */
export type FrontTrackingQuality = "good" | "uncertain" | "lost";

/**
 * Side-view quality separates camera-angle failure from threshold failure.
 */
export type SideViewQuality = "good" | "frontLike" | "tooOccluded" | "lost";

/**
 * Front-camera hand detection carrying lane-specific metadata.
 * `laneRole` is fixed to `"frontAim"` to prevent side detection misuse.
 */
export interface FrontHandDetection {
  readonly laneRole: "frontAim";
  readonly deviceId: string;
  readonly streamId: string;
  readonly timestamp: FrameTimestamp;
  readonly rawFrame: HandFrame;
  readonly filteredFrame: HandFrame;
  readonly handPresenceConfidence: number;
  readonly trackingQuality: FrontTrackingQuality;
}

/**
 * Side-camera hand detection carrying lane-specific metadata.
 * `laneRole` is fixed to `"sideTrigger"` to prevent front detection misuse.
 */
export interface SideHandDetection {
  readonly laneRole: "sideTrigger";
  readonly deviceId: string;
  readonly streamId: string;
  readonly timestamp: FrameTimestamp;
  readonly rawFrame: HandFrame;
  readonly filteredFrame: HandFrame;
  readonly handPresenceConfidence: number;
  readonly sideViewQuality: SideViewQuality;
}
