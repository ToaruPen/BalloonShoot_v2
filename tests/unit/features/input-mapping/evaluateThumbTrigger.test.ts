import { describe, expect, it } from "vitest";
import {
  evaluateThumbTrigger,
  type TriggerTuning
} from "../../../../src/features/input-mapping/evaluateThumbTrigger";
import {
  createThumbTriggerFrame,
  createThumbTriggerFrameFromCosine,
  mirrorThumbTriggerFrame
} from "./thumbTriggerTestHelper";
import type { HandFrame } from "../../../../src/shared/types/hand";

const tuning: TriggerTuning = {
  triggerPullThreshold: -0.2,
  triggerReleaseThreshold: -0.45
};

// thumbTip points away from indexMcp → cosine ~ -0.5 (neutral finger-gun)
const DIRECT_LANDMARKS: HandFrame["landmarks"] = {
  wrist: { x: 0.4, y: 0.7, z: 0 },
  indexTip: { x: 0.5, y: 0.3, z: 0 },
  indexMcp: { x: 0.47, y: 0.48, z: 0 },
  thumbIp: { x: 0.37, y: 0.57, z: 0 },
  thumbTip: { x: 0.3, y: 0.6, z: 0 },
  middleTip: { x: 0.45, y: 0.64, z: 0 },
  ringTip: { x: 0.42, y: 0.66, z: 0 },
  pinkyTip: { x: 0.39, y: 0.67, z: 0 }
};

// thumbTip sits close to indexMcp → vector aligned with indexMcp direction,
// cosine ~ +0.9 (well above the 0.3 pull threshold).
const DIRECT_PULLED_LANDMARKS: HandFrame["landmarks"] = {
  ...DIRECT_LANDMARKS,
  thumbTip: { x: 0.46, y: 0.49, z: 0 }
};

describe("evaluateThumbTrigger", () => {
  it("keeps the same decision across hand scales for the same normalized projection", () => {
    const openSmall = createThumbTriggerFrame("open", { scale: 0.85 });
    const openLarge = createThumbTriggerFrame("open", { scale: 1.2 });
    const pulledSmall = createThumbTriggerFrame("pulled", { scale: 0.85 });
    const pulledLarge = createThumbTriggerFrame("pulled", { scale: 1.2 });

    expect(evaluateThumbTrigger(openSmall, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(openLarge, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulledSmall, "open", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(pulledLarge, "open", tuning)).toBe("pulled");
  });

  it("pulls for the mirrored left-hand geometry too", () => {
    const open = mirrorThumbTriggerFrame(createThumbTriggerFrame("open"));
    const pulled = mirrorThumbTriggerFrame(createThumbTriggerFrame("pulled"));

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
  });

  it("classifies explicit hand coordinates and their mirror without the helper formula", () => {
    const open: HandFrame = {
      width: 640,
      height: 480,
      landmarks: DIRECT_LANDMARKS
    };
    const pulled: HandFrame = {
      width: 640,
      height: 480,
      landmarks: DIRECT_PULLED_LANDMARKS
    };
    const mirroredOpen = mirrorThumbTriggerFrame(open);
    const mirroredPulled = mirrorThumbTriggerFrame(pulled);

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(mirroredOpen, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(mirroredPulled, "open", tuning)).toBe("pulled");
  });

  it("keeps the trigger latched until the release threshold is crossed", () => {
    const latched = createThumbTriggerFrame("latched");
    const released = createThumbTriggerFrame("open");

    expect(evaluateThumbTrigger(latched, "pulled", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(released, "pulled", tuning)).toBe("open");
  });

  it("stays open just below the pull threshold", () => {
    const boundary = createThumbTriggerFrameFromCosine(
      tuning.triggerPullThreshold - 1e-6
    );

    expect(evaluateThumbTrigger(boundary, "open", tuning)).toBe("open");
  });

  it("releases just below the release threshold", () => {
    const boundary = createThumbTriggerFrameFromCosine(
      tuning.triggerReleaseThreshold - 1e-6
    );

    expect(evaluateThumbTrigger(boundary, "pulled", tuning)).toBe("open");
  });

  it("clamps invalid hysteresis ordering when tuning is passed directly", () => {
    const invalidTuning: TriggerTuning = {
      triggerPullThreshold: -0.2,
      triggerReleaseThreshold: 0.0
    };

    expect(evaluateThumbTrigger(createThumbTriggerFrame("pulled"), "open", invalidTuning)).toBe(
      "pulled"
    );
    expect(
      evaluateThumbTrigger(createThumbTriggerFrame("pulled"), "pulled", invalidTuning)
    ).toBe("pulled");
  });

  it("prefers world-space landmarks for trigger when present", () => {
    const imageOpen = createThumbTriggerFrame("open");
    const withWorldLandmarks: HandFrame = {
      ...imageOpen,
      worldLandmarks: {
        ...imageOpen.landmarks,
        thumbIp: { x: 0, y: 0, z: 0 },
        indexMcp: { x: 1, y: 0, z: 0 },
        thumbTip: { x: 0.9, y: 0, z: 0 }
      }
    };

    expect(evaluateThumbTrigger(imageOpen, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(withWorldLandmarks, "open", tuning)).toBe("pulled");
  });

  it("falls back to image landmarks when world landmarks are absent", () => {
    const imageOpen = createThumbTriggerFrame("open");

    expect(evaluateThumbTrigger(imageOpen, "open", tuning)).toBe("open");
  });

});
