import { describe, expect, it } from "vitest";
import { mapFrontHandToAimInput } from "../../../../src/features/front-aim";
import { createFrontDetection, testTimestamp } from "./testFactory";

describe("mapFrontHandToAimInput", () => {
  it("maps a front detection to an AimInputFrame", () => {
    const timestamp = testTimestamp(1234);
    const detection = createFrontDetection({ timestamp });

    const frame = mapFrontHandToAimInput({
      detection,
      viewportSize: { width: 640, height: 480 },
      projectionOptions: { objectFit: "cover" },
      aimSmoothingState: "tracking"
    });

    expect(frame.timestamp).toEqual(timestamp);
    expect(frame.laneRole).toBe("frontAim");
    expect(frame.aimAvailability).toBe("available");
    expect(frame.aimSmoothingState).toBe("tracking");
    expect(frame.frontTrackingConfidence).toBe(0.91);
    expect(frame.sourceFrameSize).toEqual({ width: 640, height: 480 });
  });

  it("uses the filtered index tip rather than the raw index tip", () => {
    const detection = createFrontDetection({
      rawIndexTip: { x: 0.1, y: 0.1, z: 0 },
      filteredIndexTip: { x: 0.75, y: 0.25, z: 0 }
    });

    const frame = mapFrontHandToAimInput({
      detection,
      viewportSize: { width: 640, height: 480 },
      projectionOptions: { objectFit: "cover" }
    });

    expect(frame.aimPointViewport).toEqual({ x: 480, y: 120 });
    expect(frame.aimPointNormalized).toEqual({ x: 0.75, y: 0.25 });
  });
});
