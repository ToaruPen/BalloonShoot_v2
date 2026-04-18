import { describe, expect, it } from "vitest";
import {
  defaultFrontAimCalibration,
  projectAimPointToViewport
} from "../../../../src/features/front-aim";

const sourceFrameSize = { width: 640, height: 480 };

describe("projectAimPointToViewport", () => {
  it("maps the center point to the viewport center", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.5, y: 0.5 },
      calibration: defaultFrontAimCalibration,
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover"
    });

    expect(result.aimPointViewport).toEqual({ x: 400, y: 300 });
    expect(result.aimPointNormalized).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps out-of-range points to the viewport bounds", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 1.4, y: -0.2 },
      calibration: defaultFrontAimCalibration,
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover"
    });

    expect(result.aimPointViewport).toEqual({ x: 800, y: 0 });
    expect(result.aimPointNormalized).toEqual({ x: 1, y: 0 });
  });

  it("mirrors the projected x coordinate when requested", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.25, y: 0.5 },
      calibration: defaultFrontAimCalibration,
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover",
      mirrorX: true
    });

    expect(result.aimPointViewport).toEqual({ x: 600, y: 300 });
    expect(result.aimPointNormalized).toEqual({ x: 0.75, y: 0.5 });
  });

  it("accounts for cover crop offsets in a wide viewport", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.5, y: 0.25 },
      calibration: defaultFrontAimCalibration,
      sourceFrameSize,
      viewportSize: { width: 1280, height: 480 },
      objectFit: "cover"
    });

    expect(result.aimPointViewport).toEqual({ x: 640, y: 0 });
    expect(result.aimPointNormalized).toEqual({ x: 0.5, y: 0 });
  });

  it("shifts normalized aim by calibrated center before projection", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.5, y: 0.5 },
      calibration: {
        ...defaultFrontAimCalibration,
        center: { x: 0.6, y: 0.4 }
      },
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover"
    });

    expect(result.aimPointNormalized).toEqual({ x: 0.4, y: 0.6 });
  });

  it("maps axis-aligned corner bounds into full normalized aim space", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.25, y: 0.75 },
      calibration: {
        ...defaultFrontAimCalibration,
        cornerBounds: { leftX: 0.25, rightX: 0.75, topY: 0.25, bottomY: 0.75 }
      },
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover"
    });

    expect(result.aimPointNormalized).toEqual({ x: 0, y: 1 });
  });

  it("applies mirrorX after calibration", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.5, y: 0.5 },
      calibration: {
        ...defaultFrontAimCalibration,
        center: { x: 0.6, y: 0.5 }
      },
      sourceFrameSize,
      viewportSize: { width: 800, height: 600 },
      objectFit: "cover",
      mirrorX: true
    });

    expect(result.aimPointNormalized).toEqual({ x: 0.6, y: 0.5 });
  });
});
