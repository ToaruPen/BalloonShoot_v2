import type {
  HandLandmarkSet,
  Point3D,
  SideHandDetection,
  SideViewQuality
} from "../../shared/types/hand";

const MIN_REFERENCE_LENGTH = 0.0001;

export interface SideTriggerHandGeometrySignature {
  readonly wristToIndexMcp: number;
  readonly wristToMiddleMcp: number;
  readonly indexMcpToPinkyMcp: number;
}

export interface SideTriggerRawMetric {
  readonly sourceKey: string | undefined;
  readonly timestampMs: number | undefined;
  readonly handDetected: boolean;
  readonly sideViewQuality: SideViewQuality;
  readonly normalizedThumbDistance: number | undefined;
  readonly geometrySignature: SideTriggerHandGeometrySignature | undefined;
}

export interface SideTriggerRawMetricFallback {
  readonly timestampMs?: number;
}

const distance = (a: Point3D, b: Point3D): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const normalizedThumbDistanceFor = (
  worldLandmarks: HandLandmarkSet
): number => {
  const referenceLength = Math.max(
    MIN_REFERENCE_LENGTH,
    distance(worldLandmarks.wrist, worldLandmarks.indexMcp)
  );

  return distance(worldLandmarks.thumbTip, worldLandmarks.indexMcp) /
    referenceLength;
};

const geometrySignatureFor = (
  worldLandmarks: HandLandmarkSet
): SideTriggerHandGeometrySignature | undefined => {
  if (
    worldLandmarks.middleMcp === undefined ||
    worldLandmarks.pinkyMcp === undefined
  ) {
    return undefined;
  }

  return {
    wristToIndexMcp: distance(worldLandmarks.wrist, worldLandmarks.indexMcp),
    wristToMiddleMcp: distance(worldLandmarks.wrist, worldLandmarks.middleMcp),
    indexMcpToPinkyMcp: distance(
      worldLandmarks.indexMcp,
      worldLandmarks.pinkyMcp
    )
  };
};

export const extractSideTriggerRawMetric = (
  detection: SideHandDetection | undefined,
  fallback?: SideTriggerRawMetricFallback
): SideTriggerRawMetric => {
  if (detection === undefined) {
    return {
      sourceKey: undefined,
      timestampMs: fallback?.timestampMs,
      handDetected: false,
      sideViewQuality: "lost",
      normalizedThumbDistance: undefined,
      geometrySignature: undefined
    };
  }

  const worldLandmarks = detection.rawFrame.worldLandmarks;

  return {
    sourceKey: `${detection.deviceId}:${detection.streamId}`,
    timestampMs: detection.timestamp.frameTimestampMs,
    handDetected: true,
    sideViewQuality: detection.sideViewQuality,
    normalizedThumbDistance:
      worldLandmarks === undefined
        ? undefined
        : normalizedThumbDistanceFor(worldLandmarks),
    geometrySignature:
      worldLandmarks === undefined
        ? undefined
        : geometrySignatureFor(worldLandmarks)
  };
};
