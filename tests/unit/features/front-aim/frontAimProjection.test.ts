import { describe, expect, it } from "vitest";
import { projectAimPointToViewport } from "../../../../src/features/front-aim";

const sourceFrameSize = { width: 640, height: 480 };

describe("projectAimPointToViewport", () => {
  it("maps the center point to the viewport center", () => {
    const result = projectAimPointToViewport({
      pointNormalized: { x: 0.5, y: 0.5 },
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
      sourceFrameSize,
      viewportSize: { width: 1280, height: 480 },
      objectFit: "cover"
    });

    expect(result.aimPointViewport).toEqual({ x: 640, y: 0 });
    expect(result.aimPointNormalized).toEqual({ x: 0.5, y: 0 });
  });
});
