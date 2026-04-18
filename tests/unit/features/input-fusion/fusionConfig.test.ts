import { describe, expect, it } from "vitest";
import {
  FUSION_MAX_FRAME_AGE_MS,
  FUSION_MAX_PAIR_DELTA_MS,
  FUSION_RECENT_FRAME_RETENTION_WINDOW_MS,
  coerceFusionTuningValue,
  defaultFusionTuning,
  fusionSliderMetadata
} from "../../../../src/features/input-fusion";

describe("fusion tuning configuration", () => {
  it("mirrors named constants in default tuning", () => {
    expect(defaultFusionTuning).toEqual({
      maxPairDeltaMs: FUSION_MAX_PAIR_DELTA_MS,
      maxFrameAgeMs: FUSION_MAX_FRAME_AGE_MS,
      recentFrameRetentionWindowMs: FUSION_RECENT_FRAME_RETENTION_WINDOW_MS
    });
  });

  it("describes every slider with concrete constant names", () => {
    expect(fusionSliderMetadata.map((item) => item.key)).toEqual([
      "maxPairDeltaMs",
      "maxFrameAgeMs",
      "recentFrameRetentionWindowMs"
    ]);
    expect(fusionSliderMetadata.map((item) => item.constantName)).toEqual([
      "FUSION_MAX_PAIR_DELTA_MS",
      "FUSION_MAX_FRAME_AGE_MS",
      "FUSION_RECENT_FRAME_RETENTION_WINDOW_MS"
    ]);
  });

  it("clamps and rounds integer millisecond slider values", () => {
    const metadata = fusionSliderMetadata.find(
      (item) => item.key === "maxPairDeltaMs"
    );

    expect(metadata).toBeDefined();
    if (metadata === undefined) {
      throw new Error("maxPairDeltaMs metadata should exist");
    }
    expect(coerceFusionTuningValue(metadata, metadata.min - 3)).toBe(
      metadata.min
    );
    expect(coerceFusionTuningValue(metadata, metadata.max + 3)).toBe(
      metadata.max
    );
    expect(coerceFusionTuningValue(metadata, metadata.min + 0.6)).toBe(
      Math.round(metadata.min + 0.6)
    );
  });
});
