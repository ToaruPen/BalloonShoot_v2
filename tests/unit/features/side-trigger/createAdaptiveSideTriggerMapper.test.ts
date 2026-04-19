import { describe, expect, it } from "vitest";
import {
  createAdaptiveSideTriggerMapper,
  createSideTriggerMapper,
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning
} from "../../../../src/features/side-trigger";
import type { HandLandmarkSet, Point3D } from "../../../../src/shared/types/hand";
import { createSideDetection, testTimestamp } from "./testFactory";

const point = (x: number, y: number, z = 0): Point3D => ({ x, y, z });

const poseWithThumbDistance = (distance: number): HandLandmarkSet => ({
  wrist: point(0, 0, 0),
  indexMcp: point(0, 1, 0),
  indexTip: point(0, 1.5, 0),
  thumbIp: point(distance / 2, 1, 0),
  thumbTip: point(distance, 1, 0),
  middleMcp: point(0.1, 1, 0),
  middleTip: point(0.1, 1.5, 0),
  ringTip: point(0.2, 1.4, 0),
  pinkyMcp: point(0.3, 1, 0),
  pinkyTip: point(0.3, 1.3, 0)
});

const adaptiveSequence = (): HandLandmarkSet[] => [
  ...Array.from({ length: 15 }, () => poseWithThumbDistance(1)),
  ...Array.from({ length: 15 }, () => poseWithThumbDistance(0.35)),
  poseWithThumbDistance(1),
  poseWithThumbDistance(1),
  poseWithThumbDistance(0.35),
  poseWithThumbDistance(0.35)
];

const countCommits = (
  mapper: ReturnType<typeof createSideTriggerMapper>,
  poses: readonly HandLandmarkSet[]
): number => {
  let commits = 0;

  poses.forEach((worldLandmarks, index) => {
    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks,
        timestamp: testTimestamp(1000 + index * 16)
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    if (
      result.triggerFrame?.triggerEdge === "shotCommitted" ||
      result.triggerFrame?.triggerEdge === "pullStarted+shotCommitted"
    ) {
      commits += 1;
    }
  });

  return commits;
};

describe("createAdaptiveSideTriggerMapper", () => {
  it("injects adaptive calibration so a player-specific sequence can commit", () => {
    const staticMapper = createSideTriggerMapper();
    const adaptiveMapper = createAdaptiveSideTriggerMapper();
    const poses = adaptiveSequence();

    expect(countCommits(staticMapper, poses)).toBe(0);
    expect(countCommits(adaptiveMapper, poses)).toBeGreaterThan(0);
  });

  it("resets adaptive state and the inner mapper", () => {
    const mapper = createAdaptiveSideTriggerMapper();
    countCommits(mapper, adaptiveSequence());
    expect(mapper.getAdaptiveState().sampleCount).toBeGreaterThan(0);

    mapper.reset();
    const afterReset = mapper.update({
      detection: createSideDetection({
        worldLandmarks: poseWithThumbDistance(0.35),
        timestamp: testTimestamp(3000)
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(mapper.getAdaptiveState().status).toBe("warmingUp");
    expect(mapper.getAdaptiveState().sampleCount).toBe(1);
    expect(afterReset.triggerFrame?.triggerEdge).toBe("none");
  });

  it("exposes reducer state and validates config overrides", () => {
    const mapper = createAdaptiveSideTriggerMapper({ windowSamples: 30 });

    expect(mapper.getAdaptiveState().windowSamples).toBe(30);
    expect(() =>
      createAdaptiveSideTriggerMapper({ windowSamples: 0 })
    ).toThrow();
  });
});
