import { describe, expect, it } from "vitest";
import {
  pairAimWithSideFrames,
  pairTriggerWithFrontFrames
} from "../../../../src/features/input-fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

describe("pairFusionFrames", () => {
  it("picks the nearest side frame for an incoming aim frame", () => {
    const aim = createAimFrame(100);
    const sideFrames = [
      createTriggerFrame(60),
      createTriggerFrame(92),
      createTriggerFrame(130)
    ];

    const pair = pairAimWithSideFrames(aim, sideFrames, {
      maxPairDeltaMs: 20
    });

    expect(pair?.frontFrame).toBe(aim);
    expect(pair?.sideFrame).toBe(sideFrames[1]);
    expect(pair?.timeDeltaBetweenLanesMs).toBe(8);
  });

  it("picks the nearest front frame for an incoming trigger frame", () => {
    const trigger = createTriggerFrame(220);
    const frontFrames = [
      createAimFrame(180),
      createAimFrame(211),
      createAimFrame(260)
    ];

    const pair = pairTriggerWithFrontFrames(trigger, frontFrames, {
      maxPairDeltaMs: 15
    });

    expect(pair?.frontFrame).toBe(frontFrames[1]);
    expect(pair?.sideFrame).toBe(trigger);
    expect(pair?.timeDeltaBetweenLanesMs).toBe(9);
  });

  it("rejects pairs outside the maximum pair delta", () => {
    const pair = pairAimWithSideFrames(createAimFrame(100), [
      createTriggerFrame(141)
    ], {
      maxPairDeltaMs: 40
    });

    expect(pair).toBeUndefined();
  });

  it("chooses the newest candidate when deltas tie", () => {
    const pair = pairAimWithSideFrames(createAimFrame(100), [
      createTriggerFrame(90),
      createTriggerFrame(110)
    ], {
      maxPairDeltaMs: 20
    });

    expect(pair?.sideFrame.timestamp.frameTimestampMs).toBe(110);
  });
});
