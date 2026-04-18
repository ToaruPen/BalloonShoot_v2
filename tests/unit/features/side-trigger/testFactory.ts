import type { FrameTimestamp } from "../../../../src/shared/types/camera";
import type {
  HandFrame,
  HandLandmarkSet,
  Point3D,
  SideHandDetection,
  SideViewQuality
} from "../../../../src/shared/types/hand";

export const testTimestamp = (frameTimestampMs = 1000): FrameTimestamp => ({
  frameTimestampMs,
  timestampSource: "requestVideoFrameCallbackCaptureTime",
  presentedFrames: 12,
  receivedAtPerformanceMs: frameTimestampMs + 4
});

const point = (x: number, y: number, z = 0): Point3D => ({ x, y, z });

export const openWorldLandmarks = (): HandLandmarkSet => ({
  wrist: point(0, 0, 0),
  indexMcp: point(0, 0.1, 0),
  indexTip: point(0, 0.45, 0),
  thumbIp: point(0.08, 0.05, 0),
  thumbTip: point(0.13, 0.05, 0),
  middleTip: point(0, 0.28, 0),
  ringTip: point(0, 0.24, 0),
  pinkyTip: point(0, 0.2, 0)
});

export const pulledWorldLandmarks = (): HandLandmarkSet => ({
  ...openWorldLandmarks(),
  thumbIp: point(0.035, 0.085, 0),
  thumbTip: point(0.025, 0.105, 0)
});

export const createSideDetection = (
  patch: Partial<SideHandDetection> & {
    worldLandmarks?: HandLandmarkSet | undefined;
    sideViewQuality?: SideViewQuality;
    handPresenceConfidence?: number;
    streamId?: string;
    timestamp?: FrameTimestamp;
  } = {}
): SideHandDetection => {
  const hasWorldLandmarks = Object.hasOwn(patch, "worldLandmarks");
  const worldLandmarks = hasWorldLandmarks
    ? patch.worldLandmarks
    : openWorldLandmarks();
  const landmarks = worldLandmarks ?? openWorldLandmarks();
  const rawFrame: HandFrame = {
    width: 640,
    height: 480,
    landmarks,
    ...(worldLandmarks === undefined ? {} : { worldLandmarks })
  };

  return {
    laneRole: "sideTrigger",
    deviceId: "side-device",
    streamId: patch.streamId ?? "side-stream",
    timestamp: patch.timestamp ?? testTimestamp(),
    rawFrame,
    filteredFrame: rawFrame,
    handPresenceConfidence: patch.handPresenceConfidence ?? 0.92,
    sideViewQuality: patch.sideViewQuality ?? "good",
    ...patch
  };
};
