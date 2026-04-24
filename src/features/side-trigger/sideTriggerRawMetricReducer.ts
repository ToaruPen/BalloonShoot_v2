import type { SideViewQuality } from "../../shared/types/hand";
import type {
  SideTriggerHandGeometrySignature,
  SideTriggerRawMetric
} from "./sideTriggerRawMetric";
import type { RawMetricUnusableReason } from "./sideTriggerTelemetryTypes";

export type RawMetric =
  | {
      readonly kind: "usable";
      readonly timestampMs: number;
      readonly sourceKey: string;
      readonly value: number;
      readonly quality: SideViewQuality;
      readonly geometrySignature: SideTriggerHandGeometrySignature;
    }
  | {
      readonly kind: "unusable";
      readonly timestampMs?: number;
      readonly sourceKey?: string;
      readonly reason: RawMetricUnusableReason;
    };

const buildUnusable = (
  raw: SideTriggerRawMetric,
  reason: RawMetricUnusableReason
): RawMetric => {
  const base: {
    kind: "unusable";
    reason: RawMetricUnusableReason;
    timestampMs?: number;
    sourceKey?: string;
  } = { kind: "unusable", reason };
  if (raw.timestampMs !== undefined) base.timestampMs = raw.timestampMs;
  if (raw.sourceKey !== undefined) base.sourceKey = raw.sourceKey;
  return base;
};

export const reduceSideTriggerRawMetric = (
  raw: SideTriggerRawMetric
): RawMetric => {
  if (!raw.handDetected) return buildUnusable(raw, "noHand");
  if (raw.sideViewQuality !== "good")
    return buildUnusable(raw, "sideViewQualityRejected");
  if (raw.normalizedThumbDistance === undefined)
    return buildUnusable(raw, "noWorldLandmarks");
  if (raw.geometrySignature === undefined)
    return buildUnusable(raw, "geometryUnavailable");
  if (raw.timestampMs === undefined || raw.sourceKey === undefined)
    return buildUnusable(raw, "metadataIncomplete");
  return {
    kind: "usable",
    timestampMs: raw.timestampMs,
    sourceKey: raw.sourceKey,
    value: raw.normalizedThumbDistance,
    quality: raw.sideViewQuality,
    geometrySignature: raw.geometrySignature
  };
};
