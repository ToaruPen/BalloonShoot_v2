import { describe, expect, it } from "vitest";
import type { HandFrame } from "../../../../src/shared/types/hand";
import { createLandmarkOverlayModel } from "../../../../src/features/diagnostic-workbench/landmarkOverlay";

const createFrame = (): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.1, y: 0.2, z: 0 },
    thumbIp: { x: 0.2, y: 0.3, z: 0 },
    thumbTip: { x: 0.3, y: 0.4, z: 0 },
    indexMcp: { x: 0.4, y: 0.5, z: 0 },
    indexTip: { x: 0.5, y: 0.6, z: 0 },
    middleTip: { x: 0.6, y: 0.7, z: 0 },
    ringTip: { x: 0.7, y: 0.8, z: 0 },
    pinkyTip: { x: 0.8, y: 0.9, z: 0 }
  }
});

describe("createLandmarkOverlayModel", () => {
  it("projects normalized landmarks to source-frame pixels", () => {
    const model = createLandmarkOverlayModel(createFrame());

    expect(model.width).toBe(640);
    expect(model.height).toBe(480);
    expect(
      model.points.find((point) => point.name === "indexTip")
    ).toStrictEqual({
      name: "indexTip",
      x: 320,
      y: 288
    });
  });

  it("keeps named landmark connections for overlay drawing", () => {
    const model = createLandmarkOverlayModel(createFrame());

    expect(model.connections).toContainEqual({
      from: "wrist",
      to: "indexMcp"
    });
    expect(model.connections).toContainEqual({
      from: "indexMcp",
      to: "indexTip"
    });
  });
});
