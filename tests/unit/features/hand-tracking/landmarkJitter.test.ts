import { describe, expect, it } from "vitest";
import {
  createLandmarkJitterTracker,
  type LandmarkJitterTracker
} from "../../../../src/features/hand-tracking/landmarkJitter";

describe("createLandmarkJitterTracker", () => {
  it("reports zero jitter before it has two samples", () => {
    const jitter: LandmarkJitterTracker = createLandmarkJitterTracker(10);
    expect(jitter.peek()).toBe(0);
    jitter.push(0.5, 0.5);
    expect(jitter.peek()).toBe(0);
  });

  it("reports the peak consecutive-sample distance inside its window", () => {
    const jitter = createLandmarkJitterTracker(10);
    jitter.push(0, 0);
    jitter.push(0.01, 0);
    jitter.push(0.01, 0.04);
    jitter.push(0.02, 0.04);
    expect(jitter.peek()).toBeCloseTo(0.04, 5);
  });

  it("forgets samples that leave the window", () => {
    const jitter = createLandmarkJitterTracker(3);
    jitter.push(0, 0);
    jitter.push(0.5, 0);
    jitter.push(0.6, 0);
    jitter.push(0.61, 0);
    expect(jitter.peek()).toBeCloseTo(0.1, 5);
  });

  it("clears history on reset so the next window starts empty", () => {
    const jitter = createLandmarkJitterTracker(10);
    jitter.push(0, 0);
    jitter.push(0.5, 0);
    jitter.reset();
    expect(jitter.peek()).toBe(0);
    jitter.push(0.2, 0);
    expect(jitter.peek()).toBe(0);
  });
});
