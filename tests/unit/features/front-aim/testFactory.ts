import type { FrameTimestamp } from "../../../../src/shared/types/camera";
import type {
  FrontHandDetection,
  HandFrame,
  HandLandmarkSet,
  Point3D
} from "../../../../src/shared/types/hand";

export const testTimestamp = (frameTimestampMs = 1000): FrameTimestamp => ({
  frameTimestampMs,
  timestampSource: "requestVideoFrameCallbackCaptureTime",
  presentedFrames: 3,
  receivedAtPerformanceMs: frameTimestampMs + 2
});

const point = (x: number, y: number, z = 0): Point3D => ({ x, y, z });

const frontLandmarks = (indexTip = point(0.5, 0.5)): HandLandmarkSet => ({
  wrist: point(0.5, 0.9),
  indexMcp: point(0.5, 0.65),
  indexTip,
  thumbIp: point(0.42, 0.7),
  thumbTip: point(0.35, 0.68),
  middleTip: point(0.55, 0.55),
  ringTip: point(0.6, 0.58),
  pinkyTip: point(0.65, 0.62)
});

const frame = (landmarks: HandLandmarkSet): HandFrame => ({
  width: 640,
  height: 480,
  handedness: [{ score: 0.91, index: 0, categoryName: "Right", displayName: "Right" }],
  landmarks
});

export const createFrontDetection = (
  patch: Partial<FrontHandDetection> & {
    rawIndexTip?: Point3D;
    filteredIndexTip?: Point3D;
    handPresenceConfidence?: number;
    streamId?: string;
    timestamp?: FrameTimestamp;
  } = {}
): FrontHandDetection => {
  const rawFrame = frame(frontLandmarks(patch.rawIndexTip ?? point(0.2, 0.2)));
  const filteredFrame = frame(
    frontLandmarks(patch.filteredIndexTip ?? point(0.75, 0.25))
  );

  return {
    laneRole: "frontAim",
    deviceId: "front-device",
    streamId: patch.streamId ?? "front-stream",
    timestamp: patch.timestamp ?? testTimestamp(),
    rawFrame,
    filteredFrame,
    handPresenceConfidence: patch.handPresenceConfidence ?? 0.91,
    trackingQuality: "good",
    ...patch
  };
};
