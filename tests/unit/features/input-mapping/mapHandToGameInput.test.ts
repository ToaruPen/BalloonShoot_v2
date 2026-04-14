import { describe, expect, it } from "vitest";
import {
  buildHandEvidence,
  mapHandToGameInput,
  type GameInputFrame,
  type InputTuning
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import type { HandFrame } from "../../../../src/shared/types/hand";
import {
  asDetection,
  createThumbTriggerFrame,
  createThumbTriggerFrameFromCosine,
  withThumbTriggerPose
} from "./thumbTriggerTestHelper";

const frame: HandFrame = createThumbTriggerFrame("open");
const canvasSize = { width: 1280, height: 720 };

const expectDefined = <T>(value: T | null | undefined, message: string): T => {
  if (value === undefined || value === null) {
    throw new Error(message);
  }

  return value;
};

const runInputSequence = (
  frames: HandFrame[],
  initialRuntime?: GameInputFrame["runtime"],
  tuning: InputTuning = gameConfig.input
): GameInputFrame[] => {
  const results: GameInputFrame[] = [];
  let runtime = initialRuntime;

  for (const nextFrame of frames) {
    const result = mapHandToGameInput(asDetection(nextFrame), canvasSize, runtime, tuning);
    results.push(result);
    runtime = result.runtime;
  }

  return results;
};

const withLowConfidenceGunPose = (inputFrame: HandFrame): HandFrame => ({
  ...inputFrame,
  landmarks: {
    ...inputFrame.landmarks,
    indexTip: { ...inputFrame.landmarks.indexTip, y: inputFrame.landmarks.indexMcp.y - 0.01 },
    middleTip: { ...inputFrame.landmarks.middleTip, y: inputFrame.landmarks.indexMcp.y + 0.04 },
    ringTip: { ...inputFrame.landmarks.ringTip, y: inputFrame.landmarks.indexMcp.y + 0.04 },
    pinkyTip: { ...inputFrame.landmarks.pinkyTip, y: inputFrame.landmarks.indexMcp.y + 0.04 }
  }
});

const withWorldLandmarks = (inputFrame: HandFrame): HandFrame => ({
  ...inputFrame,
  worldLandmarks: {
    wrist: {
      x: inputFrame.landmarks.wrist.x * inputFrame.width,
      y: inputFrame.landmarks.wrist.y * inputFrame.height,
      z: inputFrame.landmarks.wrist.z * inputFrame.width
    },
    indexTip: {
      x: inputFrame.landmarks.indexTip.x * inputFrame.width,
      y: inputFrame.landmarks.indexTip.y * inputFrame.height,
      z: inputFrame.landmarks.indexTip.z * inputFrame.width
    },
    indexMcp: {
      x: inputFrame.landmarks.indexMcp.x * inputFrame.width,
      y: inputFrame.landmarks.indexMcp.y * inputFrame.height,
      z: inputFrame.landmarks.indexMcp.z * inputFrame.width
    },
    thumbTip: {
      x: inputFrame.landmarks.thumbTip.x * inputFrame.width,
      y: inputFrame.landmarks.thumbTip.y * inputFrame.height,
      z: inputFrame.landmarks.thumbTip.z * inputFrame.width
    },
    thumbIp: {
      x: inputFrame.landmarks.thumbIp.x * inputFrame.width,
      y: inputFrame.landmarks.thumbIp.y * inputFrame.height,
      z: inputFrame.landmarks.thumbIp.z * inputFrame.width
    },
    middleTip: {
      x: inputFrame.landmarks.middleTip.x * inputFrame.width,
      y: inputFrame.landmarks.middleTip.y * inputFrame.height,
      z: inputFrame.landmarks.middleTip.z * inputFrame.width
    },
    ringTip: {
      x: inputFrame.landmarks.ringTip.x * inputFrame.width,
      y: inputFrame.landmarks.ringTip.y * inputFrame.height,
      z: inputFrame.landmarks.ringTip.z * inputFrame.width
    },
    pinkyTip: {
      x: inputFrame.landmarks.pinkyTip.x * inputFrame.width,
      y: inputFrame.landmarks.pinkyTip.y * inputFrame.height,
      z: inputFrame.landmarks.pinkyTip.z * inputFrame.width
    }
  }
});

const createArmedRuntime = (
  tuning: InputTuning = gameConfig.input
): GameInputFrame["runtime"] => {
  const [first] = runInputSequence(
    [withThumbTriggerPose(frame, "open")],
    undefined,
    tuning
  );
  const armedFrame = expectDefined(first, "Expected first mapped frame");

  expect(armedFrame.runtime.phase).toBe("armed");

  return armedFrame.runtime;
};

describe("mapHandToGameInput", () => {
  it("builds hand evidence without conflating tracking presence with trigger state", () => {
    const evidence = buildHandEvidence(asDetection(frame), canvasSize, undefined, 1234, gameConfig.input);

    expect(evidence.trackingPresent).toBe(true);
    expect(evidence.frameAtMs).toBe(1234);
    expectDefined(evidence.trigger, "Expected trigger evidence");
    expectDefined(evidence.gunPose, "Expected gun pose evidence");
    expectDefined(evidence.smoothedCrosshairCandidate, "Expected smoothed crosshair");
    expect(evidence.crosshairDelta).toBeNull();
    expect(evidence.stableCrosshair).toBe(false);
  });

  it("represents missing tracking explicitly instead of inventing trigger state", () => {
    const evidence = buildHandEvidence(undefined, canvasSize, undefined, 5678, gameConfig.input);

    expect(evidence.trackingPresent).toBe(false);
    expect(evidence.frameAtMs).toBe(5678);
    expect(evidence.smoothedCrosshairCandidate).toBeNull();
    expect(evidence.trigger).toBeNull();
    expect(evidence.gunPose).toBeNull();
  });

  it("preserves the issue-30 contract with one intentional pull producing one shot", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);

    expect(results.filter((result) => result.shotFired)).toHaveLength(1);
    expect(results[2]?.shotFired).toBe(true);
    expect(results[3]?.shotFired).toBe(false);
  });

  it("does not auto-repeat while the thumb stays pulled", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);

    expect(results.filter((result) => result.shotFired)).toHaveLength(1);
    expect(results[4]?.shotFired).toBe(false);
  });

  it("turns missing tracking into tracking_lost and clears the crosshair", () => {
    const result = mapHandToGameInput(undefined, canvasSize, createArmedRuntime());

    expect(result.runtime.phase).toBe("tracking_lost");
    expect(result.runtime.rejectReason).toBe("tracking_lost");
    expect(result.shotFired).toBe(false);
    expect(result.crosshair).toBeUndefined();
    expect(result.runtime.crosshair).toBeUndefined();
  });

  it("keeps a brief pose-confidence dip from cancelling an already armed pull", () => {
    const weakPoseFrame = withLowConfidenceGunPose(frame);
    const results = runInputSequence(
      [
        withThumbTriggerPose(weakPoseFrame, "pulled"),
        withThumbTriggerPose(weakPoseFrame, "pulled")
      ],
      createArmedRuntime()
    );

    expect(results[0]?.gunPoseActive).toBe(true);
    expect(results[0]?.shotFired).toBe(true);
    expect(results[1]?.shotFired).toBe(false);
  });

  it("clears waiting_for_release after a front-facing world-landmark release", () => {
    const results = runInputSequence(
      [
        withWorldLandmarks(createThumbTriggerFrameFromCosine(0.2)),
        withWorldLandmarks(createThumbTriggerFrameFromCosine(-0.05)),
        withWorldLandmarks(createThumbTriggerFrameFromCosine(-0.05))
      ],
      createArmedRuntime()
    );

    expect(results[0]?.shotFired).toBe(true);
    expect(results[1]?.runtime.rejectReason).toBe("cooldown");
    expect(results[2]?.runtime.rejectReason).toBe("waiting_for_pull_edge");
  });

});
