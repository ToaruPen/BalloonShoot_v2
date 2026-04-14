import { describe, expect, it } from "vitest";
import { projectLandmarkToViewport } from "../../../../src/features/input-mapping/projectLandmarkToViewport";

const normalizedPoint = { x: 0.25, y: 0.25 };
const fallbackPoint = { x: 0, y: 0 };
const validSourceSize = { width: 640, height: 480 };
const validViewportSize = { width: 1280, height: 720 };

const invalidSourceSizes = [
  { width: 0, height: 480 },
  { width: -1, height: 480 },
  { width: Number.NaN, height: 480 },
  { width: Number.POSITIVE_INFINITY, height: 480 }
];

const invalidViewportSizes = [
  { width: 1280, height: 0 },
  { width: 1280, height: -1 },
  { width: Number.NaN, height: 720 },
  { width: 1280, height: Number.POSITIVE_INFINITY }
];

const sanitizedPointExpectations = [
  { point: { x: Number.NaN, y: 0.25 }, expected: { x: 0, y: 120 } },
  {
    point: { x: Number.POSITIVE_INFINITY, y: 0.25 },
    expected: { x: 0, y: 120 }
  },
  { point: { x: 0.25, y: Number.NaN }, expected: { x: 320, y: 0 } },
  {
    point: { x: 0.25, y: Number.NEGATIVE_INFINITY },
    expected: { x: 320, y: 0 }
  }
];

describe("projectLandmarkToViewport", () => {
  it("mirrors points without cropping when source and viewport aspect ratios match", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: 960 },
        { mirrorX: true }
      )
    ).toEqual({ x: 960, y: 240 });
  });

  it("applies centered cover cropping when a 4:3 source fills a 16:9 viewport", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: 720 },
        { mirrorX: true }
      )
    ).toEqual({ x: 960, y: 120 });
  });

  it("applies centered cover cropping when a 4:3 source fills a portrait viewport", () => {
    const projected = projectLandmarkToViewport(
      { x: 0.4, y: 0.5 },
      { width: 640, height: 480 },
      { width: 720, height: 1280 },
      { mirrorX: true }
    );

    expect(projected.x).toBeCloseTo(530.67, 2);
    expect(projected.y).toBe(640);
  });

  it("clamps points that land outside the visible covered viewport", () => {
    expect(
      projectLandmarkToViewport(
        { x: 0, y: 0 },
        { width: 640, height: 480 },
        { width: 720, height: 1280 },
        { mirrorX: true }
      )
    ).toEqual({ x: 720, y: 0 });
  });

  it.each(invalidSourceSizes)(
    "falls back deterministically for invalid source dimensions: %o",
    (sourceSize) => {
      expect(
        projectLandmarkToViewport(
          normalizedPoint,
          sourceSize,
          validViewportSize
        )
      ).toEqual(fallbackPoint);
    }
  );

  it.each(invalidViewportSizes)(
    "falls back deterministically for invalid viewport dimensions: %o",
    (viewportSize) => {
      expect(
        projectLandmarkToViewport(
          normalizedPoint,
          validSourceSize,
          viewportSize
        )
      ).toEqual(fallbackPoint);
    }
  );

  it("falls back deterministically when both source and viewport inputs are invalid", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: Number.NaN, height: 0 },
        { width: -1, height: Number.POSITIVE_INFINITY }
      )
    ).toEqual(fallbackPoint);
  });

  it.each(sanitizedPointExpectations)(
    "sanitizes non-finite normalized points before projection: %o",
    ({ point, expected }) => {
      expect(
        projectLandmarkToViewport(point, validSourceSize, validViewportSize)
      ).toEqual(expected);
    }
  );

  it("sanitizes both normalized axes when both point values are invalid", () => {
    expect(
      projectLandmarkToViewport(
        { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        validSourceSize,
        validViewportSize
      )
    ).toEqual(fallbackPoint);
  });
});
