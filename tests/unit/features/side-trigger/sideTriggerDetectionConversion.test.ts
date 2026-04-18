import { describe, expect, it } from "vitest";
import { toSideDetection } from "../../../../src/features/side-trigger";
import type { HandDetection, HandFrame } from "../../../../src/shared/types/hand";

const createFrame = (): HandFrame => ({
  width: 640,
  height: 480,
  handedness: [
    { score: 0.4, index: 0, categoryName: "Right", displayName: "Right" },
    { score: 0.9, index: 1, categoryName: "Left", displayName: "Left" }
  ],
  landmarks: {
    wrist: { x: 0.5, y: 0.9, z: 0 },
    indexMcp: { x: 0.5, y: 0.6, z: 0 },
    indexTip: { x: 0.25, y: 0.5, z: 0 },
    thumbIp: { x: 0.4, y: 0.7, z: 0 },
    thumbTip: { x: 0.35, y: 0.7, z: 0 },
    middleTip: { x: 0.55, y: 0.55, z: 0 },
    ringTip: { x: 0.6, y: 0.58, z: 0 },
    pinkyTip: { x: 0.65, y: 0.62, z: 0 }
  }
});

describe("toSideDetection", () => {
  it("converts generic hand detection into side-trigger lane detection", () => {
    const frame = createFrame();
    const detection: HandDetection = {
      rawFrame: frame,
      filteredFrame: frame
    };
    const sideDetection = toSideDetection(detection, {
      deviceId: "side-device",
      streamId: "side-stream",
      timestamp: {
        frameTimestampMs: 123,
        timestampSource: "requestVideoFrameCallbackCaptureTime",
        presentedFrames: 7,
        receivedAtPerformanceMs: 124
      }
    });

    expect(sideDetection).toEqual({
      laneRole: "sideTrigger",
      deviceId: "side-device",
      streamId: "side-stream",
      timestamp: {
        frameTimestampMs: 123,
        timestampSource: "requestVideoFrameCallbackCaptureTime",
        presentedFrames: 7,
        receivedAtPerformanceMs: 124
      },
      rawFrame: frame,
      filteredFrame: frame,
      handPresenceConfidence: 0.9,
      sideViewQuality: "good"
    });
  });
});
