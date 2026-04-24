// tests/unit/features/side-trigger/sideTriggerRawMetricReducer.test.ts
import { describe, it, expect } from "vitest";
import { reduceSideTriggerRawMetric, type RawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetricReducer";
import type { SideTriggerRawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetric";

const geometry = { wristToIndexMcp: 1, wristToMiddleMcp: 1, indexMcpToPinkyMcp: 1 };

describe("reduceSideTriggerRawMetric", () => {
  it("noHand の場合 unusable + reason=noHand", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: undefined, timestampMs: 1000,
      handDetected: false, sideViewQuality: "lost",
      normalizedThumbDistance: undefined, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual({
      kind: "unusable", timestampMs: 1000, reason: "noHand",
    } satisfies RawMetric);
  });

  it("sourceKey がある noHand は sourceKey を保持する", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: false, sideViewQuality: "lost",
      normalizedThumbDistance: undefined, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "noHand",
    } satisfies RawMetric);
  });

  it("quality が frontLike の場合 sideViewQualityRejected", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "frontLike",
      normalizedThumbDistance: 0.5, geometrySignature: geometry,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "sideViewQualityRejected",
    });
  });

  it("worldLandmarks 欠損 (normalizedThumbDistance undefined) の場合 noWorldLandmarks", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: undefined, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "noWorldLandmarks",
    });
  });

  it("geometrySignature 欠損の場合 geometryUnavailable", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: 0.5, geometrySignature: undefined,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", timestampMs: 1000, sourceKey: "dev:stream", reason: "geometryUnavailable",
    });
  });

  it("handDetected=true で timestampMs が欠損した場合 metadataIncomplete", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: undefined,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: 0.5, geometrySignature: geometry,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "unusable", sourceKey: "dev:stream", reason: "metadataIncomplete",
    });
  });

  it("全条件満たす場合 usable", () => {
    const input: SideTriggerRawMetric = {
      sourceKey: "dev:stream", timestampMs: 1000,
      handDetected: true, sideViewQuality: "good",
      normalizedThumbDistance: 0.5, geometrySignature: geometry,
    };
    const result = reduceSideTriggerRawMetric(input);
    expect(result).toEqual<RawMetric>({
      kind: "usable", timestampMs: 1000, sourceKey: "dev:stream",
      value: 0.5, quality: "good", geometrySignature: geometry,
    });
  });
});
