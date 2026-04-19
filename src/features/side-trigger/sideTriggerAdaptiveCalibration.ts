import type { SideTriggerCalibration } from "./sideTriggerCalibration";
import {
  INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE,
  INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
  MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN
} from "./sideTriggerConstants";
import { detectGeometryJumpAndUpdateEma } from "./sideTriggerHandGeometrySignature";
import type {
  SideTriggerHandGeometrySignature,
  SideTriggerRawMetric
} from "./sideTriggerRawMetric";

export interface AdaptiveSideTriggerCalibrationConfig {
  readonly windowSamples: number;
  readonly warmupSamples: number;
  readonly handLossResetMs: number;
  readonly geometryJumpRatio: number;
  readonly geometryEmaAlpha: number;
  readonly pulledLowerBound: number;
  readonly openUpperBound: number;
  readonly pulledPercentile: number;
  readonly openPercentile: number;
  readonly pulledOpenMinSpan: number;
  readonly initialPulled: number;
  readonly initialOpen: number;
}

export type AdaptiveCalibrationStatus =
  | "provisional"
  | "warmingUp"
  | "adaptive";

export type AdaptiveResetReason = "sourceChanged" | "handLoss" | "geometryJump";

export interface AdaptiveSampleEntry {
  readonly timestampMs: number;
  readonly normalizedThumbDistance: number;
}

export interface AdaptiveSideTriggerCalibrationState {
  readonly calibration: SideTriggerCalibration;
  readonly status: AdaptiveCalibrationStatus;
  readonly sampleCount: number;
  readonly windowSamples: number;
  readonly samples: readonly AdaptiveSampleEntry[];
  readonly observedPulledP10: number | undefined;
  readonly observedOpenP90: number | undefined;
  readonly lastObservedHandTimestampMs: number | undefined;
  readonly geometrySignatureEma: SideTriggerHandGeometrySignature | undefined;
  readonly lastResetReason: AdaptiveResetReason | undefined;
  readonly lastResetTimestampMs: number | undefined;
  readonly currentSourceKey: string | undefined;
}

export interface SideTriggerAdaptiveCalibrationTelemetry {
  readonly status: AdaptiveCalibrationStatus;
  readonly sampleCount: number;
  readonly windowSize: number;
  readonly observedPulledP10: number | undefined;
  readonly observedOpenP90: number | undefined;
  readonly pulledCalibrated: number;
  readonly openCalibrated: number;
  readonly lastResetReason: AdaptiveResetReason | undefined;
  readonly lastResetTimestampMs: number | undefined;
  readonly geometrySignatureEma: SideTriggerHandGeometrySignature | undefined;
}

export const DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG: AdaptiveSideTriggerCalibrationConfig =
  {
    windowSamples: 90,
    warmupSamples: 30,
    handLossResetMs: 1500,
    geometryJumpRatio: 0.25,
    geometryEmaAlpha: 0.1,
    pulledLowerBound: 0,
    openUpperBound: 1.2,
    pulledPercentile: 0.2,
    openPercentile: 0.8,
    pulledOpenMinSpan: MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN,
    initialPulled: INITIAL_SIDE_TRIGGER_PULLED_POSE_DISTANCE,
    initialOpen: INITIAL_SIDE_TRIGGER_OPEN_POSE_DISTANCE
  };

const calibrationFor = (
  pulled: number,
  open: number
): SideTriggerCalibration => ({
  pulledPose: {
    normalizedThumbDistance: pulled
  },
  openPose: {
    normalizedThumbDistance: open
  }
});

const assertFiniteConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  const values: readonly [string, number][] = [
    ["windowSamples", config.windowSamples],
    ["warmupSamples", config.warmupSamples],
    ["handLossResetMs", config.handLossResetMs],
    ["geometryJumpRatio", config.geometryJumpRatio],
    ["geometryEmaAlpha", config.geometryEmaAlpha],
    ["pulledLowerBound", config.pulledLowerBound],
    ["openUpperBound", config.openUpperBound],
    ["pulledPercentile", config.pulledPercentile],
    ["openPercentile", config.openPercentile],
    ["pulledOpenMinSpan", config.pulledOpenMinSpan],
    ["initialPulled", config.initialPulled],
    ["initialOpen", config.initialOpen]
  ];

  for (const [name, value] of values) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be finite.`);
    }
  }
};

const assertPositiveConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  if (config.windowSamples < 1) {
    throw new Error("windowSamples must be >= 1.");
  }
  if (config.warmupSamples < 1) {
    throw new Error("warmupSamples must be >= 1.");
  }
  if (config.warmupSamples > config.windowSamples) {
    throw new Error("warmupSamples must be <= windowSamples.");
  }
  if (config.handLossResetMs <= 0) {
    throw new Error("handLossResetMs must be > 0.");
  }
  if (config.geometryJumpRatio <= 0) {
    throw new Error("geometryJumpRatio must be > 0.");
  }
  if (config.geometryEmaAlpha <= 0 || config.geometryEmaAlpha > 1) {
    throw new Error("geometryEmaAlpha must be in (0, 1].");
  }
};

const assertBoundConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  if (config.pulledLowerBound < 0) {
    throw new Error("pulledLowerBound must be >= 0.");
  }
  if (config.openUpperBound <= config.pulledLowerBound) {
    throw new Error("openUpperBound must be > pulledLowerBound.");
  }
  if (config.pulledOpenMinSpan <= 0) {
    throw new Error("pulledOpenMinSpan must be > 0.");
  }
  if (
    config.pulledOpenMinSpan >
    config.openUpperBound - config.pulledLowerBound
  ) {
    throw new Error("pulledOpenMinSpan must fit within bounds.");
  }
};

const assertPercentileConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  if (config.pulledPercentile <= 0) {
    throw new Error("pulledPercentile must be > 0.");
  }
  if (config.openPercentile >= 1) {
    throw new Error("openPercentile must be < 1.");
  }
  if (config.pulledPercentile >= config.openPercentile) {
    throw new Error("pulledPercentile must be < openPercentile.");
  }
};

const assertInitialConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  if (
    config.initialPulled < config.pulledLowerBound ||
    config.initialPulled > config.openUpperBound
  ) {
    throw new Error("initialPulled must be within bounds.");
  }
  if (
    config.initialOpen < config.pulledLowerBound ||
    config.initialOpen > config.openUpperBound
  ) {
    throw new Error("initialOpen must be within bounds.");
  }
  if (config.initialPulled >= config.initialOpen) {
    throw new Error("initialPulled must be < initialOpen.");
  }
  if (config.initialOpen - config.initialPulled < config.pulledOpenMinSpan) {
    throw new Error("initial span must be >= pulledOpenMinSpan.");
  }
};

export const assertAdaptiveCalibrationConfig = (
  config: AdaptiveSideTriggerCalibrationConfig
): void => {
  assertFiniteConfig(config);
  assertPositiveConfig(config);
  assertBoundConfig(config);
  assertPercentileConfig(config);
  assertInitialConfig(config);
};

export const createInitialAdaptiveSideTriggerCalibrationState = (
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveSideTriggerCalibrationState => {
  assertAdaptiveCalibrationConfig(config);

  return {
    calibration: calibrationFor(config.initialPulled, config.initialOpen),
    status: "provisional",
    sampleCount: 0,
    windowSamples: config.windowSamples,
    samples: [],
    observedPulledP10: undefined,
    observedOpenP90: undefined,
    lastObservedHandTimestampMs: undefined,
    geometrySignatureEma: undefined,
    lastResetReason: undefined,
    lastResetTimestampMs: undefined,
    currentSourceKey: undefined
  };
};

const percentileNearestRank = (
  samples: readonly AdaptiveSampleEntry[],
  q: number
): number | undefined => {
  if (samples.length === 0) {
    return undefined;
  }

  const sorted = samples
    .map((sample) => sample.normalizedThumbDistance)
    .sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(q * sorted.length) - 1);

  return sorted[index];
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampObservedEndpoints = (
  rawPulled: number,
  rawOpen: number,
  config: AdaptiveSideTriggerCalibrationConfig
): { pulled: number; open: number } => {
  let clampedPulled = Math.max(config.pulledLowerBound, rawPulled);
  let clampedOpen = Math.min(config.openUpperBound, rawOpen);

  if (clampedOpen - clampedPulled < config.pulledOpenMinSpan) {
    const midpoint = (clampedPulled + clampedOpen) / 2;
    clampedPulled = midpoint - config.pulledOpenMinSpan / 2;
    clampedOpen = midpoint + config.pulledOpenMinSpan / 2;

    if (clampedPulled < config.pulledLowerBound) {
      const shift = config.pulledLowerBound - clampedPulled;
      clampedPulled = config.pulledLowerBound;
      clampedOpen += shift;
    }
    if (clampedOpen > config.openUpperBound) {
      const shift = clampedOpen - config.openUpperBound;
      clampedOpen = config.openUpperBound;
      clampedPulled -= shift;
    }
    if (clampedPulled < config.pulledLowerBound) {
      clampedPulled = config.pulledLowerBound;
    }
  }

  return {
    pulled: clampedPulled,
    open: clampedOpen
  };
};

const isObservedSpanCollapsed = (rawPulled: number, rawOpen: number): boolean =>
  rawOpen - rawPulled < MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN;

const statusFor = (
  sampleCount: number,
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveCalibrationStatus => {
  if (sampleCount === 0) {
    return "provisional";
  }

  return sampleCount < config.warmupSamples ? "warmingUp" : "adaptive";
};

const stateWithSamples = (
  state: AdaptiveSideTriggerCalibrationState,
  samples: readonly AdaptiveSampleEntry[],
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveSideTriggerCalibrationState => {
  const observedPulledP10 = percentileNearestRank(
    samples,
    config.pulledPercentile
  );
  const observedOpenP90 = percentileNearestRank(
    samples,
    config.openPercentile
  );
  const status = statusFor(samples.length, config);

  if (observedPulledP10 === undefined || observedOpenP90 === undefined) {
    return {
      ...state,
      status,
      sampleCount: samples.length,
      samples,
      observedPulledP10,
      observedOpenP90,
      calibration: calibrationFor(config.initialPulled, config.initialOpen)
    };
  }

  if (isObservedSpanCollapsed(observedPulledP10, observedOpenP90)) {
    return {
      ...state,
      status,
      sampleCount: samples.length,
      samples,
      observedPulledP10,
      observedOpenP90
    };
  }

  const clamped = clampObservedEndpoints(
    observedPulledP10,
    observedOpenP90,
    config
  );
  const weight = clamp(samples.length / config.warmupSamples, 0, 1);
  const blendedPulled =
    config.initialPulled + weight * (clamped.pulled - config.initialPulled);
  const blendedOpen =
    config.initialOpen + weight * (clamped.open - config.initialOpen);

  return {
    ...state,
    status,
    sampleCount: samples.length,
    samples,
    observedPulledP10,
    observedOpenP90,
    calibration: calibrationFor(blendedPulled, blendedOpen)
  };
};

const resetState = (
  config: AdaptiveSideTriggerCalibrationConfig,
  reason: AdaptiveResetReason,
  timestampMs: number | undefined,
  metric: SideTriggerRawMetric
): AdaptiveSideTriggerCalibrationState => ({
  ...createInitialAdaptiveSideTriggerCalibrationState(config),
  lastResetReason: reason,
  lastResetTimestampMs: timestampMs,
  currentSourceKey: metric.sourceKey,
  lastObservedHandTimestampMs: metric.handDetected
    ? metric.timestampMs
    : undefined,
  geometrySignatureEma:
    reason === "geometryJump" ? metric.geometrySignature : undefined
});

const resetReasonFor = (
  state: AdaptiveSideTriggerCalibrationState,
  metric: SideTriggerRawMetric,
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveResetReason | undefined => {
  if (
    metric.sourceKey !== undefined &&
    state.currentSourceKey !== undefined &&
    metric.sourceKey !== state.currentSourceKey
  ) {
    return "sourceChanged";
  }
  if (
    state.lastObservedHandTimestampMs !== undefined &&
    metric.timestampMs !== undefined &&
    metric.timestampMs - state.lastObservedHandTimestampMs >
      config.handLossResetMs
  ) {
    return "handLoss";
  }
  if (
    metric.handDetected &&
    metric.sideViewQuality === "good" &&
    metric.geometrySignature !== undefined &&
    state.geometrySignatureEma !== undefined &&
    detectGeometryJumpAndUpdateEma(
      metric.geometrySignature,
      state.geometrySignatureEma,
      {
        jumpRatio: config.geometryJumpRatio,
        emaAlpha: config.geometryEmaAlpha
      }
    ).isJump
  ) {
    return "geometryJump";
  }

  return undefined;
};

export const updateSideTriggerAdaptiveCalibration = (
  state: AdaptiveSideTriggerCalibrationState,
  metric: SideTriggerRawMetric,
  config: AdaptiveSideTriggerCalibrationConfig
): AdaptiveSideTriggerCalibrationState => {
  assertAdaptiveCalibrationConfig(config);

  const resetReason = resetReasonFor(state, metric, config);
  if (resetReason !== undefined) {
    return resetState(config, resetReason, metric.timestampMs, metric);
  }

  const currentSourceKey = metric.sourceKey ?? state.currentSourceKey;
  const lastObservedHandTimestampMs = metric.handDetected
    ? (metric.timestampMs ?? state.lastObservedHandTimestampMs)
    : state.lastObservedHandTimestampMs;
  const shouldPushSample =
    metric.handDetected &&
    metric.sideViewQuality === "good" &&
    metric.normalizedThumbDistance !== undefined &&
    metric.timestampMs !== undefined;
  const samples = shouldPushSample
    ? [
        ...state.samples,
        {
          timestampMs: metric.timestampMs,
          normalizedThumbDistance: metric.normalizedThumbDistance
        }
      ].slice(-config.windowSamples)
    : state.samples;
  const geometrySignatureEma =
    shouldPushSample && metric.geometrySignature !== undefined
      ? detectGeometryJumpAndUpdateEma(
          metric.geometrySignature,
          state.geometrySignatureEma,
          {
            jumpRatio: config.geometryJumpRatio,
            emaAlpha: config.geometryEmaAlpha
          }
        ).nextEma
      : state.geometrySignatureEma;

  return stateWithSamples(
    {
      ...state,
      currentSourceKey,
      lastObservedHandTimestampMs,
      geometrySignatureEma
    },
    samples,
    config
  );
};

export const toAdaptiveCalibrationTelemetry = (
  state: AdaptiveSideTriggerCalibrationState
): SideTriggerAdaptiveCalibrationTelemetry => ({
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
