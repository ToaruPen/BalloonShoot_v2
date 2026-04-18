import { describe, expect, it } from "vitest";
import { handPresenceConfidenceFor } from "../../../../src/shared/helpers/handConfidence";
import type {
  HandDetection,
  HandFrame
} from "../../../../src/shared/types/hand";

const createFrame = (handedness?: HandFrame["handedness"]): HandFrame => ({
  width: 640,
  height: 480,
  ...(handedness === undefined ? {} : { handedness }),
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

const createDetection = (rawFrame: HandFrame): HandDetection => ({
  rawFrame,
  filteredFrame: rawFrame
});

describe("handPresenceConfidenceFor", () => {
  it("returns the highest handedness score", () => {
    expect(
      handPresenceConfidenceFor(
        createDetection(
          createFrame([
            {
              score: 0.4,
              index: 0,
              categoryName: "Right",
              displayName: "Right"
            },
            { score: 0.9, index: 1, categoryName: "Left", displayName: "Left" }
          ])
        )
      )
    ).toBe(0.9);
  });

  it("defaults to full confidence when handedness is unavailable", () => {
    expect(handPresenceConfidenceFor(createDetection(createFrame()))).toBe(1);
  });
});
