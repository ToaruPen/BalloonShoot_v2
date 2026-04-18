import { describe, expect, it } from "vitest";
import { createFrameTimestamp } from "../../../../src/features/camera/frameTimestamp";

describe("createFrameTimestamp", () => {
  it("prefers requestVideoFrameCallback captureTime when available", () => {
    const timestamp = createFrameTimestamp(
      {
        captureTime: 1234.5,
        expectedDisplayTime: 2345.6,
        presentedFrames: 42
      },
      3456.7
    );

    expect(timestamp).toStrictEqual({
      frameTimestampMs: 1234.5,
      timestampSource: "requestVideoFrameCallbackCaptureTime",
      presentedFrames: 42,
      receivedAtPerformanceMs: 3456.7
    });
  });

  it("falls back to expectedDisplayTime when captureTime is unavailable", () => {
    const timestamp = createFrameTimestamp(
      {
        expectedDisplayTime: 2345.6,
        presentedFrames: 42
      },
      3456.7
    );

    expect(timestamp).toStrictEqual({
      frameTimestampMs: 2345.6,
      timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
      presentedFrames: 42,
      receivedAtPerformanceMs: 3456.7
    });
  });

  it("uses callback receipt time when browser frame metadata has no usable timing", () => {
    const timestamp = createFrameTimestamp({}, 3456.7);

    expect(timestamp).toStrictEqual({
      frameTimestampMs: 3456.7,
      timestampSource: "performanceNowAtCallback",
      presentedFrames: undefined,
      receivedAtPerformanceMs: 3456.7
    });
  });
});
