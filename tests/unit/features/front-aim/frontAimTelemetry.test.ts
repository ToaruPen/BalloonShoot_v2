import { describe, expect, it } from "vitest";
import {
  defaultFrontAimCalibration,
  mapFrontHandToAimInput,
  telemetryFromAimFrame
} from "../../../../src/features/front-aim";
import { createFrontDetection } from "./testFactory";

describe("telemetryFromAimFrame", () => {
  it("assembles mapping telemetry from an available aim frame", () => {
    const frame = mapFrontHandToAimInput({
      detection: createFrontDetection(),
      viewportSize: { width: 640, height: 480 },
      calibration: defaultFrontAimCalibration,
      projectionOptions: { objectFit: "cover" },
      aimSmoothingState: "tracking"
    });

    const telemetry = telemetryFromAimFrame(frame, defaultFrontAimCalibration);

    expect(telemetry.aimAvailability).toBe("available");
    expect(telemetry.aimPointViewport).toEqual({ x: 480, y: 120 });
    expect(telemetry.aimPointNormalized).toEqual({ x: 0.75, y: 0.25 });
    expect(telemetry.aimSmoothingState).toBe("tracking");
    expect(telemetry.calibrationStatus).toBe("default");
    expect(telemetry.calibration).toEqual(defaultFrontAimCalibration);
    expect(telemetry.lastLostReason).toBeUndefined();
    expect(JSON.stringify(telemetry)).not.toContain("front-device");
  });

  it("keeps unavailable telemetry explicit without fake scalar measurements", () => {
    const telemetry = telemetryFromAimFrame(
      undefined,
      defaultFrontAimCalibration,
      {
        aimAvailability: "unavailable",
        aimSmoothingState: "recoveringAfterLoss",
        frontHandDetected: false,
        lastLostReason: "handNotDetected"
      }
    );

    expect(telemetry.aimAvailability).toBe("unavailable");
    expect(telemetry.aimPointViewport).toBeUndefined();
    expect(telemetry.frontTrackingConfidence).toBeUndefined();
    expect(telemetry.calibrationStatus).toBe("default");
    expect(telemetry.calibration).toEqual(defaultFrontAimCalibration);
  });

  it("does not allow an unavailable telemetry patch to claim availability", () => {
    expect(() => {
      telemetryFromAimFrame(
        undefined,
        defaultFrontAimCalibration,
        {
          // @ts-expect-error unavailable telemetry cannot be marked available.
          aimAvailability: "available"
        }
      );
    }).not.toThrow();
  });
});
