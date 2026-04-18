import {
  FUSION_MAX_FRAME_AGE_MS,
  FUSION_MAX_PAIR_DELTA_MS,
  FUSION_RECENT_FRAME_RETENTION_WINDOW_MS
} from "./fusionConstants";

export interface FusionTuning {
  readonly maxPairDeltaMs: number;
  readonly maxFrameAgeMs: number;
  readonly recentFrameRetentionWindowMs: number;
}

export type FusionTuningKey = keyof FusionTuning;

interface FusionSliderMetadata {
  readonly key: FusionTuningKey;
  readonly constantName: string;
  readonly displayName: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly numericKind: "milliseconds";
}

export const defaultFusionTuning: FusionTuning = {
  maxPairDeltaMs: FUSION_MAX_PAIR_DELTA_MS,
  maxFrameAgeMs: FUSION_MAX_FRAME_AGE_MS,
  recentFrameRetentionWindowMs: FUSION_RECENT_FRAME_RETENTION_WINDOW_MS
};

export const fusionSliderMetadata: readonly FusionSliderMetadata[] = [
  {
    key: "maxPairDeltaMs",
    constantName: "FUSION_MAX_PAIR_DELTA_MS",
    displayName: "Maximum pair delta",
    min: 0,
    max: 200,
    step: 1,
    defaultValue: FUSION_MAX_PAIR_DELTA_MS,
    numericKind: "milliseconds"
  },
  {
    key: "maxFrameAgeMs",
    constantName: "FUSION_MAX_FRAME_AGE_MS",
    displayName: "Maximum frame age",
    min: 16,
    max: 500,
    step: 1,
    defaultValue: FUSION_MAX_FRAME_AGE_MS,
    numericKind: "milliseconds"
  },
  {
    key: "recentFrameRetentionWindowMs",
    constantName: "FUSION_RECENT_FRAME_RETENTION_WINDOW_MS",
    displayName: "Recent frame retention window",
    min: 40,
    max: 1000,
    step: 1,
    defaultValue: FUSION_RECENT_FRAME_RETENTION_WINDOW_MS,
    numericKind: "milliseconds"
  }
];

export const coerceFusionTuningValue = (
  metadata: FusionSliderMetadata,
  value: number
): number => {
  const clamped = Math.min(metadata.max, Math.max(metadata.min, value));
  const stepped =
    metadata.step > 0
      ? metadata.min +
        Math.round((clamped - metadata.min) / metadata.step) * metadata.step
      : clamped;

  return Math.min(metadata.max, Math.max(metadata.min, stepped));
};
