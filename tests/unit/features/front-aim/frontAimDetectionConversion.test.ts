import { describe, expect, it } from "vitest";
import {
  getFrontAimFilterConfig,
  resolveFrontAimViewportSize,
  toFrontDetection
} from "../../../../src/features/front-aim";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import type { HandDetection, HandFrame } from "../../../../src/shared/types/hand";
import { createFrontDetection, testTimestamp } from "./testFactory";

describe("front aim detection conversion", () => {
  it("uses the shared hand filter config", () => {
    expect(getFrontAimFilterConfig()).toEqual({
      minCutoff: gameConfig.input.handFilterMinCutoff,
      beta: gameConfig.input.handFilterBeta,
      dCutoff: gameConfig.input.handFilterDCutoff
    });
  });

  it("converts raw hand detections into front-lane detections", () => {
    const source = createFrontDetection();
    const detection: HandDetection = {
      rawFrame: source.rawFrame,
      filteredFrame: source.filteredFrame
    };
    const timestamp = testTimestamp(1234);

    const frontDetection = toFrontDetection(detection, {
      deviceId: "front-device-id",
      streamId: "front-stream-id",
      timestamp
    });

    expect(frontDetection).toMatchObject({
      laneRole: "frontAim",
      deviceId: "front-device-id",
      streamId: "front-stream-id",
      timestamp,
      rawFrame: source.rawFrame,
      filteredFrame: source.filteredFrame,
      handPresenceConfidence: 0.91,
      trackingQuality: "good"
    });
  });

  it("defaults hand presence confidence when handedness is unavailable", () => {
    const source = createFrontDetection();
    const rawFrame: HandFrame = {
      width: source.rawFrame.width,
      height: source.rawFrame.height,
      landmarks: source.rawFrame.landmarks
    };

    expect(
      toFrontDetection(
        {
          rawFrame,
          filteredFrame: source.filteredFrame
        },
        {
          deviceId: "front-device-id",
          streamId: "front-stream-id",
          timestamp: testTimestamp()
        }
      ).handPresenceConfidence
    ).toBe(1);
  });

  it("resolves viewport dimensions from ordered positive candidates", () => {
    expect(
      resolveFrontAimViewportSize({
        widthCandidates: [0, undefined, 640],
        heightCandidates: [0, 480]
      })
    ).toEqual({ width: 640, height: 480 });
  });

  it("falls back to 1x1 when all viewport candidates are unavailable", () => {
    expect(
      resolveFrontAimViewportSize({
        widthCandidates: [0, undefined],
        heightCandidates: [0, undefined]
      })
    ).toEqual({ width: 1, height: 1 });
  });
});
