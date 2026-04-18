import type { FrameTimestamp } from "./camera";

export interface AimPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface AimFrameSize {
  readonly width: number;
  readonly height: number;
}

export interface FrontAimCalibrationSnapshot {
  readonly center: AimPoint2D;
  readonly cornerBounds: {
    readonly leftX: number;
    readonly rightX: number;
    readonly topY: number;
    readonly bottomY: number;
  };
}

export type FrontAimCalibrationStatus = "default" | "liveTuning";

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

export interface FrontAimTelemetryAvailable {
  readonly aimAvailability: "available";
  readonly aimSmoothingState: AimSmoothingState;
  readonly frontHandDetected: true;
  readonly frontTrackingConfidence: number;
  readonly aimPointViewport: AimPoint2D;
  readonly aimPointNormalized: AimPoint2D;
  readonly sourceFrameSize: AimFrameSize;
  readonly calibrationStatus: FrontAimCalibrationStatus;
  readonly calibration: FrontAimCalibrationSnapshot;
  readonly lastLostReason: undefined;
}

export interface FrontAimTelemetryUnavailable {
  readonly aimAvailability: Exclude<AimAvailability, "available">;
  readonly aimSmoothingState: AimSmoothingState;
  readonly frontHandDetected: boolean;
  readonly frontTrackingConfidence: number | undefined;
  readonly aimPointViewport: undefined;
  readonly aimPointNormalized: undefined;
  readonly sourceFrameSize: undefined;
  readonly calibrationStatus: FrontAimCalibrationStatus;
  readonly calibration: FrontAimCalibrationSnapshot;
  readonly lastLostReason: FrontAimLastLostReason | undefined;
}

export type FrontAimTelemetry =
  | FrontAimTelemetryAvailable
  | FrontAimTelemetryUnavailable;
