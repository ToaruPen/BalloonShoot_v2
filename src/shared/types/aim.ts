import type { FrameTimestamp } from "./camera";

export interface AimPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface AimFrameSize {
  readonly width: number;
  readonly height: number;
}

export type AimAvailability =
  | "available"
  | "estimatedFromRecentFrame"
  | "unavailable";

export type AimSmoothingState =
  | "coldStart"
  | "tracking"
  | "recoveringAfterLoss";

export type FrontAimLastLostReason =
  | "handNotDetected"
  | "lowHandConfidence"
  | "trackingQualityLost";

export interface AimInputFrame {
  readonly laneRole: "frontAim";
  readonly timestamp: FrameTimestamp;
  readonly aimAvailability: AimAvailability;
  readonly aimPointViewport: AimPoint2D;
  readonly aimPointNormalized: AimPoint2D;
  readonly aimSmoothingState: AimSmoothingState;
  readonly frontHandDetected: boolean;
  readonly frontTrackingConfidence: number;
  readonly sourceFrameSize: AimFrameSize;
}

export interface FrontAimTelemetry {
  readonly aimAvailability: AimAvailability;
  readonly aimSmoothingState: AimSmoothingState;
  readonly frontHandDetected: boolean;
  readonly frontTrackingConfidence: number | undefined;
  readonly aimPointViewport: AimPoint2D | undefined;
  readonly aimPointNormalized: AimPoint2D | undefined;
  readonly sourceFrameSize: AimFrameSize | undefined;
  readonly lastLostReason: FrontAimLastLostReason | undefined;
}
