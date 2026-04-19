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
import { MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN } from "../../../../src/features/side-trigger/sideTriggerConstants";

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
  config: AdaptiveSideTriggerCalibrationConfig = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
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
  it("uses the shared 0.05 minimum calibration span by default", () => {
    expect(
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.pulledOpenMinSpan
    ).toBe(MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN);
  });

  it("uses p20/p80 as default calibration percentiles", () => {
    expect(
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.pulledPercentile
    ).toBe(0.2);
    expect(
      DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG.openPercentile
    ).toBe(0.8);
  });

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
    const state = feed(
      [
        ...Array.from({ length: 3 }, () => 0.3),
        ...Array.from({ length: 8 }, () => 0.6),
        ...Array.from({ length: 4 }, () => 0.8)
      ],
      config
    );

    expect(pulled(state)).toBeCloseTo(0.25);
    expect(open(state)).toBeCloseTo(1);
  });

  it("uses nearest-rank p20/p80 for 10 samples by default", () => {
    const state = feed([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);

    expect(state.observedPulledP10).toBe(0.2);
    expect(state.observedOpenP90).toBe(0.8);
  });

  it("uses the 18th and 72nd sorted samples for a 90-sample window by default", () => {
    const values = Array.from({ length: 90 }, (_, index) => (index + 1) / 100);
    const state = feed(values);

    expect(state.observedPulledP10).toBe(0.18);
    expect(state.observedOpenP90).toBe(0.72);
  });

  it("uses configured nearest-rank percentiles when provided", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 10,
      warmupSamples: 1,
      pulledPercentile: 0.3,
      openPercentile: 0.7
    };
    const state = feed(
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      config
    );

    expect(state.observedPulledP10).toBe(0.3);
    expect(state.observedOpenP90).toBe(0.7);
    expect(pulled(state)).toBeCloseTo(0.3);
    expect(open(state)).toBeCloseTo(0.7);
  });

  it("allows asymmetric configured percentiles (sum is not required to be 1)", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 10,
      warmupSamples: 1,
      pulledPercentile: 0.2,
      openPercentile: 0.85
    };

    expect(() => { assertAdaptiveCalibrationConfig(config); }).not.toThrow();

    const state = feed(
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      config
    );

    expect(state.observedPulledP10).toBe(0.2);
    expect(state.observedOpenP90).toBe(0.9);
    expect(pulled(state)).toBeCloseTo(0.2);
    expect(open(state)).toBeCloseTo(0.9);
  });

  it("clamps observed endpoints to bounds without widening valid observed spans", () => {
    const lowerClamped = feed([
      ...Array.from({ length: 6 }, () => -0.2),
      ...Array.from({ length: 23 }, () => 0.1),
      0.2
    ]);
    const upperClamped = feed([
      ...Array.from({ length: 23 }, () => 1),
      ...Array.from({ length: 7 }, () => 2)
    ]);
    const observed = feed([
      ...Array.from({ length: 6 }, () => 0.31),
      ...Array.from({ length: 17 }, () => 0.34),
      ...Array.from({ length: 7 }, () => 0.37)
    ]);

    expect(pulled(lowerClamped)).toBe(0);
    expect(open(lowerClamped)).toBeCloseTo(0.1);
    expect(pulled(upperClamped)).toBeCloseTo(1);
    expect(open(upperClamped)).toBe(1.2);
    expect(pulled(observed)).toBeCloseTo(0.31);
    expect(open(observed)).toBeCloseTo(0.37);
  });

  it("keeps configured percentiles as calibration endpoints when observed span is at least 0.05", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 10,
      warmupSamples: 1,
      pulledOpenMinSpan: 0.05
    };
    const state = feed(
      [0.31, 0.32, 0.33, 0.34, 0.35, 0.36, 0.37, 0.38, 0.39, 0.4],
      config
    );

    expect(state.observedPulledP10).toBe(0.32);
    expect(state.observedOpenP90).toBe(0.38);
    expect(pulled(state)).toBeCloseTo(0.32);
    expect(open(state)).toBeCloseTo(0.38);
  });

  it("holds only calibration when observed span collapses below 0.05", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 2,
      warmupSamples: 1,
      pulledOpenMinSpan: 0.05
    };
    const calibrated = feed([0.2, 0.4], config);

    const held = updateSideTriggerAdaptiveCalibration(
      calibrated,
      metric({ timestampMs: 1032, normalizedThumbDistance: 0.41 }),
      config
    );

    expect(held.observedPulledP10).toBe(0.4);
    expect(held.observedOpenP90).toBe(0.41);
    expect(held.sampleCount).toBe(2);
    expect(held.status).toBe("adaptive");
    expect(held.calibration).toEqual(calibrated.calibration);
  });

  it("resumes normal calibration immediately after a span-collapse hold clears", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 2,
      warmupSamples: 1,
      pulledOpenMinSpan: 0.05
    };
    const held = updateSideTriggerAdaptiveCalibration(
      feed([0.2, 0.4], config),
      metric({ timestampMs: 1032, normalizedThumbDistance: 0.41 }),
      config
    );

    const resumed = updateSideTriggerAdaptiveCalibration(
      held,
      metric({ timestampMs: 1048, normalizedThumbDistance: 0.6 }),
      config
    );

    expect(resumed.observedPulledP10).toBe(0.41);
    expect(resumed.observedOpenP90).toBe(0.6);
    expect(pulled(resumed)).toBeCloseTo(0.41);
    expect(open(resumed)).toBeCloseTo(0.6);
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

  it("does not reset on geometry jump when frame quality is not good", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const seeded = updateSideTriggerAdaptiveCalibration(
      createInitialAdaptiveSideTriggerCalibrationState(config),
      metric({ geometrySignature: signature(1, 1, 1) }),
      config
    );
    const distortedSignature = signature(1.3, 1, 1);

    const occluded = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({
        timestampMs: 1016,
        sideViewQuality: "tooOccluded",
        geometrySignature: distortedSignature
      }),
      config
    );
    const frontLike = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({
        timestampMs: 1016,
        sideViewQuality: "frontLike",
        geometrySignature: distortedSignature
      }),
      config
    );

    for (const next of [occluded, frontLike]) {
      expect(next.lastResetReason).toBeUndefined();
      expect(next.geometrySignatureEma).toEqual(seeded.geometrySignatureEma);
      expect(next.sampleCount).toBe(seeded.sampleCount);
    }
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
    expect(notGood.observedPulledP10).toBe(
      goodWithoutSignature.observedPulledP10
    );
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

  it("triggers hand-loss reset across the 8c/8d/8e quality-gate cases", () => {
    const config = DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG;
    const seedAt = (timestampMs: number) =>
      updateSideTriggerAdaptiveCalibration(
        createInitialAdaptiveSideTriggerCalibrationState(config),
        metric({ timestampMs, normalizedThumbDistance: 0.4 }),
        config
      );
    const expired = (current: number) => current + config.handLossResetMs + 1;

    const seeded = seedAt(1000);

    const occludedExpired = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({
        timestampMs: expired(1000),
        sideViewQuality: "tooOccluded"
      }),
      config
    );
    expect(occludedExpired.lastResetReason).toBe("handLoss");

    const noThumbExpired = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({
        timestampMs: expired(1000),
        normalizedThumbDistance: undefined,
        geometrySignature: undefined
      }),
      config
    );
    expect(noThumbExpired.lastResetReason).toBe("handLoss");

    const noHandExpired = updateSideTriggerAdaptiveCalibration(
      seeded,
      metric({
        sourceKey: undefined,
        timestampMs: expired(1000),
        handDetected: false,
        sideViewQuality: "lost",
        normalizedThumbDistance: undefined,
        geometrySignature: undefined
      }),
      config
    );
    expect(noHandExpired.lastResetReason).toBe("handLoss");
  });

  it("respects windowSamples when sliding the ring buffer", () => {
    const config: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 1,
      warmupSamples: 1
    };
    const after10 = feed(
      Array.from({ length: 10 }, (_, index) => 0.3 + index * 0.05),
      config
    );
    expect(after10.samples).toHaveLength(1);
    expect(after10.samples[0]?.normalizedThumbDistance).toBeCloseTo(0.75);

    const wideConfig: AdaptiveSideTriggerCalibrationConfig = {
      ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
      windowSamples: 5,
      warmupSamples: 1
    };
    const after10Wide = feed(
      Array.from({ length: 10 }, (_, index) => 0.3 + index * 0.05),
      wideConfig
    );
    expect(after10Wide.samples).toHaveLength(5);
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
      pulledCalibrated: state.calibration.pulledPose.normalizedThumbDistance,
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
    ["pulledPercentile lower", { pulledPercentile: 0 }],
    ["openPercentile upper", { openPercentile: 1 }],
    ["percentile ordering", { pulledPercentile: 0.8, openPercentile: 0.8 }],
    ["pulledOpenMinSpan positive", { pulledOpenMinSpan: 0 }],
    ["pulledOpenMinSpan fits bounds", { pulledOpenMinSpan: 2 }],
    ["initialPulled bounds", { initialPulled: -0.1 }],
    ["initialOpen bounds", { initialOpen: 2 }],
    ["initial ordering", { initialPulled: 1.2 }],
    ["initial span", { initialOpen: 0.22 }]
  ] as const)("throws for invalid config: %s", (_name, patch) => {
    expect(() => {
      assertAdaptiveCalibrationConfig({
        ...DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
        ...patch
      });
    }).toThrow();
  });
});
