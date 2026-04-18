import { describe, expect, it } from "vitest";
import {
  formatFrameTimestamp,
  timestampSourceLabel
} from "../../../../src/features/diagnostic-workbench/timestampFormat";

describe("timestampFormat", () => {
  it("labels requestVideoFrameCallback timestamp sources", () => {
    expect(timestampSourceLabel("requestVideoFrameCallbackCaptureTime")).toBe(
      "captureTime"
    );
    expect(
      timestampSourceLabel("requestVideoFrameCallbackExpectedDisplayTime")
    ).toBe("expectedDisplayTime");
    expect(timestampSourceLabel("performanceNowAtCallback")).toBe(
      "performance.now"
    );
  });

  it("formats missing and present frame timestamps", () => {
    expect(formatFrameTimestamp(undefined)).toBe("timestamp: 未取得");
    expect(
      formatFrameTimestamp({
        frameTimestampMs: 1234.56,
        timestampSource: "requestVideoFrameCallbackCaptureTime",
        presentedFrames: 7,
        receivedAtPerformanceMs: 1250
      })
    ).toBe("1234.6 ms / captureTime / presentedFrames: 7");
    expect(
      formatFrameTimestamp({
        frameTimestampMs: 1240,
        timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
        presentedFrames: undefined,
        receivedAtPerformanceMs: 1255
      })
    ).toBe("1240.0 ms / expectedDisplayTime / presentedFrames: unavailable");
  });
});
