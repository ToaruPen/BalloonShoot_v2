import type {
  AimAvailability,
  AimInputFrame
} from "./aim";
import type {
  FrameTimestamp,
  LaneHealthStatus
} from "./camera";
import type {
  TriggerAvailability,
  TriggerInputFrame
} from "./trigger";

export type FusionMode =
  | "pairedFrontAndSide"
  | "frontOnlyAim"
  | "sideOnlyTriggerDiagnostic"
  | "noUsableInput";

export type FusionRejectReason =
  | "none"
  | "frontMissing"
  | "sideMissing"
  | "timestampGapTooLarge"
  | "frontStale"
  | "sideStale"
  | "laneFailed";

export type FusionSourceAvailability = AimAvailability | TriggerAvailability;

export interface FusionSourceSummary {
  readonly laneRole: "frontAim" | "sideTrigger";
  readonly frameTimestamp: FrameTimestamp | undefined;
  readonly frameAgeMs: number | undefined;
  readonly laneHealth: LaneHealthStatus;
  readonly availability: FusionSourceAvailability;
  readonly rejectReason: FusionRejectReason;
}

export interface FusedGameInputFrame {
  readonly fusionTimestampMs: number;
  readonly fusionMode: FusionMode;
  readonly timeDeltaBetweenLanesMs: number | undefined;
  readonly aim: AimInputFrame | undefined;
  readonly trigger: TriggerInputFrame | undefined;
  readonly shotFired: boolean;
  readonly inputConfidence: number;
  readonly frontSource: FusionSourceSummary;
  readonly sideSource: FusionSourceSummary;
  readonly fusionRejectReason: FusionRejectReason;
}

export interface FusionTelemetry {
  readonly mode: FusionMode;
  readonly timeDeltaBetweenLanesMs: number | undefined;
  readonly maxPairDeltaMs: number;
  readonly maxFrameAgeMs: number;
  readonly frontBufferFrameCount: number;
  readonly sideBufferFrameCount: number;
  readonly frontLatestAgeMs: number | undefined;
  readonly sideLatestAgeMs: number | undefined;
  readonly inputConfidence: number;
  readonly shotFired: boolean;
  readonly rejectReason: FusionRejectReason;
  readonly lastPairedFrontTimestampMs: number | undefined;
  readonly lastPairedSideTimestampMs: number | undefined;
  readonly timestampSourceSummary: string;
  readonly shotEdgeConsumed: boolean;
}
