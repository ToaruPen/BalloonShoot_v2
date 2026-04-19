import { describe, expectTypeOf, it } from "vitest";
import type {
  AdaptiveCalibrationStatus,
  AdaptiveResetReason,
  AdaptiveSampleEntry,
  AdaptiveSideTriggerMapper,
  GeometryJumpDetectionResult,
  SideTriggerRawMetricFallback
} from "../../../../src/features/side-trigger";
import type { SideTriggerMapper } from "../../../../src/features/side-trigger";

describe("adaptive side-trigger public type contract", () => {
  it("keeps adaptive mapper compatible with the base mapper", () => {
    expectTypeOf<AdaptiveSideTriggerMapper>().toMatchTypeOf<SideTriggerMapper>();
  });

  it("exports telemetry and reducer support types intentionally", () => {
    expectTypeOf<AdaptiveCalibrationStatus>().toEqualTypeOf<
      "provisional" | "warmingUp" | "adaptive"
    >();
    expectTypeOf<AdaptiveResetReason>().toEqualTypeOf<
      "sourceChanged" | "handLoss" | "geometryJump"
    >();
    expectTypeOf<AdaptiveSampleEntry>().toMatchTypeOf<{
      readonly timestampMs: number;
      readonly normalizedThumbDistance: number;
    }>();
    expectTypeOf<SideTriggerRawMetricFallback>().toMatchTypeOf<{
      readonly timestampMs?: number;
    }>();
    expectTypeOf<GeometryJumpDetectionResult>().toMatchTypeOf<{
      readonly isJump: boolean;
      readonly nextEma: {
        readonly wristToIndexMcp: number;
        readonly wristToMiddleMcp: number;
        readonly indexMcpToPinkyMcp: number;
      };
    }>();
  });
});
