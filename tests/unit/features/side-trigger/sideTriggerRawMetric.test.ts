import { describe, expect, it } from "vitest";
import type { HandLandmarkSet, Point3D } from "../../../../src/shared/types/hand";
import { extractSideTriggerRawMetric } from "../../../../src/features/side-trigger";
import { createSideDetection, testTimestamp } from "./testFactory";

const point = (x: number, y: number, z = 0): Point3D => ({ x, y, z });

const metricWorldLandmarks = (): HandLandmarkSet => ({
  wrist: point(0, 0, 0),
  indexMcp: point(0, 3, 4),
  indexTip: point(0, 5, 0),
  thumbIp: point(1, 1, 0),
  thumbTip: point(0, 6, 8),
  middleMcp: point(0, 0, 12),
  middleTip: point(0, 7, 0),
  ringTip: point(0, 8, 0),
  pinkyMcp: point(0, 0, 15),
  pinkyTip: point(0, 9, 0)
});

describe("extractSideTriggerRawMetric", () => {
  it("returns a lost no-hand metric and preserves fallback timestamp", () => {
    const metric = extractSideTriggerRawMetric(undefined, {
      timestampMs: 1234
    });

    expect(metric).toEqual({
      sourceKey: undefined,
      timestampMs: 1234,
      handDetected: false,
      sideViewQuality: "lost",
      normalizedThumbDistance: undefined,
      geometrySignature: undefined
    });
  });

  it("returns undefined timestamp for no-hand frames without fallback", () => {
    expect(extractSideTriggerRawMetric(undefined).timestampMs).toBeUndefined();
  });

  it("keeps source and timestamp when world landmarks are missing", () => {
    const metric = extractSideTriggerRawMetric(
      createSideDetection({
        worldLandmarks: undefined,
        timestamp: testTimestamp(2000)
      })
    );

    expect(metric.sourceKey).toBe("side-device:side-stream");
    expect(metric.timestampMs).toBe(2000);
    expect(metric.handDetected).toBe(true);
    expect(metric.sideViewQuality).toBe("good");
    expect(metric.normalizedThumbDistance).toBeUndefined();
    expect(metric.geometrySignature).toBeUndefined();
  });

  it("computes thumb distance while leaving geometry undefined for legacy landmarks", () => {
    const worldLandmarks = metricWorldLandmarks();
    const { middleMcp: _middleMcp, pinkyMcp: _pinkyMcp, ...legacyLandmarks } =
      worldLandmarks;
    const metric = extractSideTriggerRawMetric(
      createSideDetection({
        worldLandmarks: legacyLandmarks
      })
    );

    expect(metric.normalizedThumbDistance).toBeCloseTo(1);
    expect(metric.geometrySignature).toBeUndefined();
  });

  it("computes normalized thumb distance and geometry signature", () => {
    const metric = extractSideTriggerRawMetric(
      createSideDetection({
        worldLandmarks: metricWorldLandmarks(),
        timestamp: testTimestamp(3456)
      })
    );

    expect(metric.sourceKey).toBe("side-device:side-stream");
    expect(metric.timestampMs).toBe(3456);
    expect(metric.normalizedThumbDistance).toBeCloseTo(1);
    expect(metric.geometrySignature).toEqual({
      wristToIndexMcp: 5,
      wristToMiddleMcp: 12,
      indexMcpToPinkyMcp: Math.hypot(0, 3, 11)
    });
  });

  it("guards normalized distance against zero reference length", () => {
    const metric = extractSideTriggerRawMetric(
      createSideDetection({
        worldLandmarks: {
          ...metricWorldLandmarks(),
          wrist: point(0, 0, 0),
          indexMcp: point(0, 0, 0),
          thumbTip: point(0.01, 0, 0)
        }
      })
    );

    expect(metric.normalizedThumbDistance).toBeCloseTo(100);
  });
});
