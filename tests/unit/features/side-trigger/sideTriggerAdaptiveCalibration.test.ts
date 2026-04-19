import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
  assertAdaptiveCalibrationConfig,
  createInitialAdaptiveSideTriggerCalibrationState,
  toAdaptiveCalibrationTelemetry,
  updateSideTriggerAdaptiveCalibration,
  type AdaptiveSideTriggerCalibrationConfig,
  type AdaptiveSideTriggerCalibrationState,
  type SideTriggerHandGeometrySignature,
  type SideTriggerRawMetric
} from "../../../../src/features/side-trigger";

const EPSILON = 1e-9;

const signature = (
  wristToIndexMcp = 1,
  wristToMiddleMcp = 1.1,
  indexMcpToPinkyMcp = 0.8
): SideTriggerHandGeometrySignature => ({
  wristToIndexMcp,
  wristToMiddleMcp,
  indexMcpToPinkyMcp
});

const metric = (
  patch: Partial<SideTriggerRawMetric> = {}
): SideTriggerRawMetric => ({
  sourceKey: "device:stream",
  timestampMs: 1000,
  handDetected: true,
  sideViewQuality: "good",
  normalizedThumbDistance: 0.5,
  geometrySignature: signature(),
  ...patch
});

const feed = (
  values: readonly number[],
  config: AdaptiveSideTriggerCalibrationConfig =
    DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
): AdaptiveSideTriggerCalibrationState =>
  values.reduce(
    (state, value, index) =>
      updateSideTriggerAdaptiveCalibration(
        state,
        metric({
          timestampMs: 1000 + index * 16,
          normalizedThumbDistance: value
        }),
        config
      ),
    createInitialAdaptiveSideTriggerCalibrationState(config)
  );

const pulled = (state: AdaptiveSideTriggerCalibrationState): number =>
  state.calibration.pulledPose.normalizedThumbDistance;

const open = (state: AdaptiveSideTriggerCalibrationState): number =>
  state.calibration.openPose.normalizedThumbDistance;

describe("adaptive side-trigger calibration reducer", () => {
  it("transitions from provisional to warmingUp to adaptive by sample count", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const initial = createInitialAdaptiveSideTriggerCalibrationState(config);

    expect(initial.status).toBe("provisional");
    const warming = feed([0.4]);
    expect(warming.status).toBe("warmingUp");
    const adaptive = feed(Array.from({ length: 30 }, () => 0.4));
    expect(adaptive.status).toBe("adaptive");
  });

  it("linearly blends pulled and open calibration during warmup", () => {
    const config = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      warmupSamples: 30
    };
    const state = feed(Array.from({ length: 15 }, () => 0.6), config);

    expect(pulled(state)).toBeCloseTo(0.3);
    expect(open(state)).toBeCloseTo(1);
  });

  it("uses nearest-rank p10/p90 for 10 samples", () => {
    const state = feed([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);

    expect(state.observedPulledP10).toBe(0.1);
    expect(state.observedOpenP90).toBe(0.9);
  });

  it("uses the 9th and 81st sorted samples for a 90-sample window", () => {
    const values = Array.from({ length: 90 }, (_, index) => (index + 1) / 100);
    const state = feed(values);

    expect(state.observedPulledP10).toBe(0.09);
    expect(state.observedOpenP90).toBe(0.81);
  });

  it("clamps observed endpoints to bounds and expands narrow spans", () => {
    const lowerClamped = feed(Array.from({ length: 30 }, () => -0.2));
    const upperClamped = feed(Array.from({ length: 30 }, () => 2));
    const expanded = feed(Array.from({ length: 30 }, () => 0.5));
    const shiftedLower = feed(
      Array.from({ length: 30 }, () => 0.05),
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
    );
    const shiftedUpper = feed(
      Array.from({ length: 30 }, () => 1.15),
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
    );

    expect(pulled(lowerClamped)).toBe(0);
    expect(open(upperClamped)).toBe(1.2);
    expect(open(expanded) - pulled(expanded)).toBeCloseTo(0.4);
    expect(pulled(shiftedLower)).toBe(0);
    expect(open(shiftedLower)).toBeCloseTo(0.4);
    expect(open(shiftedUpper)).toBe(1.2);
    expect(pulled(shiftedUpper)).toBeCloseTo(0.8);
  });

  it("resets on source change without treating undefined source as a change", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const started = updateSideTriggerAdaptiveCalibration(
      createInitialAdaptiveSideTriggerCalibrationState(config),
      metric({ normalizedThumbDistance: 0.4 }),
      config
    );
    const unknownSource = updateSideTriggerAdaptiveCalibration(
      started,
      metric({ sourceKey: undefined, handDetected: false }),
      config
    );
    const reset = updateSideTriggerAdaptiveCalibration(
      unknownSource,
      metric({ sourceKey: "device:replacement" }),
      config
    );

    expect(unknownSource.lastResetReason).toBeUndefined();
    expect(reset.status).toBe("provisional");
    expect(reset.sampleCount).toBe(0);
    expect(reset.samples).toEqual([]);
    expect(reset.lastResetReason).toBe("sourceChanged");
    expect(reset.currentSourceKey).toBe("device:replacement");
  });

  it("resets on timestamp-based hand loss", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const seen = updateSideTriggerAdaptiveCalibration(
      createInitialAdaptiveSideTriggerCalibrationState(config),
      metric({ timestampMs: 1000 }),
      config
    );
    const reset = updateSideTriggerAdaptiveCalibration(
      seen,
      metric({
        sourceKey: undefined,
        timestampMs: 2601,
        handDetected: false,
        sideViewQuality: "lost",
        normalizedThumbDistance: undefined,
        geometrySignature: undefined
      }),
      config
    );

    expect(reset.status).toBe("provisional");
    expect(reset.lastResetReason).toBe("handLoss");
    expect(reset.lastResetTimestampMs).toBe(2601);
  });

  it("resets on geometry jump and seeds EMA from the new signature", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const seeded = updateSideTriggerAdaptiveCalibration(
      createInitialAdaptiveSideTriggerCalibrationState(config),
      metric({ geometrySignature: signature(1, 1, 1) }),
      config
    );
    const nextSignature = signature(1.3, 1, 1);
    const reset = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({ timestampMs: 1016, geometrySignature: nextSignature }),
      config
    );

    expect(reset.status).toBe("provisional");
    expect(reset.lastResetReason).toBe("geometryJump");
    expect(reset.geometrySignatureEma).toEqual(nextSignature);
  });

  it("applies the five quality-gate cases", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const initial = createInitialAdaptiveSideTriggerCalibrationState(config);

    const goodWithSignature = updateSideTriggerAdaptiveCalibration(
      initial,
      metric({ timestampMs: 1000, normalizedThumbDistance: 0.4 }),
      config
    );
    expect(goodWithSignature.sampleCount).toBe(1);
    expect(goodWithSignature.geometrySignatureEma).toEqual(signature());
    expect(goodWithSignature.lastObservedHandTimestampMs).toBe(1000);

    const goodWithoutSignature = updateSideTriggerAdaptiveCalibration(
      goodWithSignature,
      metric({
        timestampMs: 1016,
        normalizedThumbDistance: 0.3,
        geometrySignature: undefined
      }),
      config
    );
    expect(goodWithoutSignature.sampleCount).toBe(2);
    expect(goodWithoutSignature.geometrySignatureEma).toEqual(signature());
    expect(goodWithoutSignature.lastObservedHandTimestampMs).toBe(1016);

    let legacyState = goodWithoutSignature;
    for (let index = 0; index < 100; index += 1) {
      legacyState = updateSideTriggerAdaptiveCalibration(
        legacyState,
        metric({
          timestampMs: 1032 + index * 100,
          normalizedThumbDistance: 0.35,
          geometrySignature: undefined
        }),
        config
      );
    }
    expect(legacyState.lastResetReason).toBeUndefined();

    const notGood = updateSideTriggerAdaptiveCalibration(
      goodWithoutSignature,
      metric({ timestampMs: 1032, sideViewQuality: "tooOccluded" }),
      config
    );
    expect(notGood.sampleCount).toBe(2);
    expect(notGood.observedPulledP10).toBe(goodWithoutSignature.observedPulledP10);
    expect(notGood.geometrySignatureEma).toEqual(signature());
    expect(notGood.lastObservedHandTimestampMs).toBe(1032);

    const noThumb = updateSideTriggerAdaptiveCalibration(
      goodWithoutSignature,
      metric({
        timestampMs: 1032,
        normalizedThumbDistance: undefined,
        geometrySignature: undefined
      }),
      config
    );
    expect(noThumb.sampleCount).toBe(2);
    expect(noThumb.lastObservedHandTimestampMs).toBe(1032);

    const noHand = updateSideTriggerAdaptiveCalibration(
      goodWithoutSignature,
      metric({
        sourceKey: undefined,
        timestampMs: 1032,
        handDetected: false,
        sideViewQuality: "lost",
        normalizedThumbDistance: undefined,
        geometrySignature: undefined
      }),
      config
    );
    expect(noHand.sampleCount).toBe(2);
    expect(noHand.lastObservedHandTimestampMs).toBe(1016);
  });

  it("keeps output within bounds and deterministic for the same metric sequence", () => {
    const values = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4];
    const first = feed(values);
    const second = feed(values);

    expect(first).toEqual(second);
    expect(pulled(first)).toBeGreaterThanOrEqual(
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.pulledLowerBound
    );
    expect(open(first)).toBeLessThanOrEqual(
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.openUpperBound
    );
    expect(pulled(first)).toBeLessThanOrEqual(
      open(first) -
        DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.pulledOpenMinSpan +
        EPSILON
    );
  });

  it("projects reducer state into telemetry snapshots", () => {
    const state = updateSideTriggerAdaptiveCalibration(
      createInitialAdaptiveSideTriggerCalibrationState(
        DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
      ),
      metric({ normalizedThumbDistance: 0.4 }),
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
    );

    expect(toAdaptiveCalibrationTelemetry(state)).toEqual({
      status: state.status,
      sampleCount: state.sampleCount,
      windowSize: state.windowSamples,
      observedPulledP10: state.observedPulledP10,
      observedOpenP90: state.observedOpenP90,
      pulledCalibrated:
        state.calibration.pulledPose.normalizedThumbDistance,
      openCalibrated: state.calibration.openPose.normalizedThumbDistance,
      lastResetReason: state.lastResetReason,
      lastResetTimestampMs: state.lastResetTimestampMs,
      geometrySignatureEma: state.geometrySignatureEma
    });
  });

  it.each([
    ["windowSamples", { windowSamples: 0 }],
    ["warmupSamples", { warmupSamples: 0 }],
    ["warmupSamples<=windowSamples", { warmupSamples: 91 }],
    ["handLossResetMs", { handLossResetMs: 0 }],
    ["geometryJumpRatio", { geometryJumpRatio: 0 }],
    ["geometryEmaAlpha lower", { geometryEmaAlpha: 0 }],
    ["geometryEmaAlpha upper", { geometryEmaAlpha: 1.1 }],
    ["pulledLowerBound", { pulledLowerBound: -0.1 }],
    ["openUpperBound", { openUpperBound: 0 }],
    ["pulledOpenMinSpan positive", { pulledOpenMinSpan: 0 }],
    ["pulledOpenMinSpan fits bounds", { pulledOpenMinSpan: 2 }],
    ["initialPulled bounds", { initialPulled: -0.1 }],
    ["initialOpen bounds", { initialOpen: 2 }],
    ["initial ordering", { initialPulled: 1.2 }],
    ["initial span", { initialOpen: 0.5 }]
  ] as const)("throws for invalid config: %s", (_name, patch) => {
    expect(() => {
      assertAdaptiveCalibrationConfig({
        ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
        ...patch
      });
    }).toThrow();
  });
});
