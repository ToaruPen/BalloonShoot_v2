import { describe, expect, it, vi } from "vitest";

type TestLandmark = { x: number; y: number; z: number } | Record<string, never>;

const BASE_LANDMARKS_FRAME_1: TestLandmark[] = [
  { x: 0.1, y: 0.2, z: 0.3 },
  {},
  {},
  { x: 0.2, y: 0.3, z: 0.4 },
  { x: 0.3, y: 0.4, z: 0.5 },
  { x: 0.4, y: 0.5, z: 0.6 },
  {},
  {},
  { x: 0.5, y: 0.6, z: 0.7 },
  {},
  {},
  {},
  { x: 0.6, y: 0.7, z: 0.8 },
  {},
  {},
  {},
  { x: 0.7, y: 0.8, z: 0.9 },
  {},
  {},
  {},
  { x: 0.8, y: 0.9, z: 1.0 }
];

const BASE_LANDMARKS_FRAME_2 = BASE_LANDMARKS_FRAME_1.map((landmark) => {
  if ("x" in landmark) {
    return {
      x: landmark.x + 0.1,
      y: landmark.y + 0.1,
      z: landmark.z + 0.1
    };
  }
  return landmark;
});

const WORLD_LANDMARKS_FRAME_1: TestLandmark[] = BASE_LANDMARKS_FRAME_1.map((landmark) => {
  if ("x" in landmark) {
    return {
      x: landmark.x + 0.1,
      y: landmark.y + 0.1,
      z: landmark.z + 0.1
    };
  }
  return landmark;
});

const WORLD_LANDMARKS_FRAME_2 = WORLD_LANDMARKS_FRAME_1.map((landmark) => {
  if ("x" in landmark) {
    return {
      x: landmark.x + 0.1,
      y: landmark.y + 0.1,
      z: landmark.z + 0.1
    };
  }
  return landmark;
});

const EXPECTED_RAW_LANDMARKS = {
  wrist: { x: 0.1, y: 0.2, z: 0.3 },
  thumbIp: { x: 0.2, y: 0.3, z: 0.4 },
  thumbTip: { x: 0.3, y: 0.4, z: 0.5 },
  indexMcp: { x: 0.4, y: 0.5, z: 0.6 },
  indexTip: { x: 0.5, y: 0.6, z: 0.7 },
  middleTip: { x: 0.6, y: 0.7, z: 0.8 },
  ringTip: { x: 0.7, y: 0.8, z: 0.9 },
  pinkyTip: { x: 0.8, y: 0.9, z: 1 }
};

const EXPECTED_WORLD_LANDMARKS = {
  wrist: { x: 0.2, y: 0.3, z: 0.4 },
  thumbIp: { x: 0.3, y: 0.4, z: 0.5 },
  thumbTip: { x: 0.4, y: 0.5, z: 0.6 },
  indexMcp: { x: 0.5, y: 0.6, z: 0.7 },
  indexTip: { x: 0.6, y: 0.7, z: 0.8 },
  middleTip: { x: 0.7, y: 0.8, z: 0.9 },
  ringTip: { x: 0.8, y: 0.9, z: 1 },
  pinkyTip: { x: 0.9, y: 1, z: 1.1 }
};

const createExpectedFrame = (
  extra: Pick<ExpectedFrame, "handedness"> | Record<string, never> = {},
  worldLandmarks?: HandLandmarkSet
): ExpectedFrame => ({
  width: 640,
  height: 480,
  ...extra,
  landmarks: EXPECTED_RAW_LANDMARKS,
  ...(worldLandmarks ? { worldLandmarks } : {})
});

const { createFromOptions, forVisionTasks } = vi.hoisted(() => ({
  createFromOptions: vi.fn(() =>
    Promise.resolve({
      detectForVideo: vi.fn(() => ({ landmarks: [BASE_LANDMARKS_FRAME_1] }))
    })
  ),
  forVisionTasks: vi.fn(() => Promise.resolve("vision"))
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks },
  HandLandmarker: { createFromOptions }
}));

import { createMediaPipeHandTracker } from "../../../../src/features/hand-tracking/createMediaPipeHandTracker";

const PASS_THROUGH_CONFIG = () => ({
  minCutoff: 1_000_000,
  beta: 0,
  dCutoff: 1_000_000
});

const LANDMARK_NAMES = [
  "wrist",
  "thumbIp",
  "thumbTip",
  "indexMcp",
  "indexTip",
  "middleTip",
  "ringTip",
  "pinkyTip"
] as const;

type HandLandmarkSet = Record<(typeof LANDMARK_NAMES)[number], { x: number; y: number; z: number }>;

interface ExpectedFrame {
  width: number;
  height: number;
  handedness?: { score: number; index: number; categoryName: string; displayName: string }[];
  landmarks: HandLandmarkSet;
  worldLandmarks?: HandLandmarkSet;
}

const expectCloseToPoint = (
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number }
): void => {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
};

const expectCloseToLandmarks = (
  actual: HandLandmarkSet,
  expected: HandLandmarkSet
): void => {
  for (const name of LANDMARK_NAMES) {
    expectCloseToPoint(actual[name], expected[name]);
  }
};

const expectHandFrameCloseTo = (
  actual: {
    width: number;
    height: number;
    handedness?: {
      score: number;
      index: number;
      categoryName: string;
      displayName: string;
    }[];
    landmarks: HandLandmarkSet;
    worldLandmarks?: HandLandmarkSet;
  },
  expected: ExpectedFrame
): void => {
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);
  expectCloseToLandmarks(actual.landmarks, expected.landmarks);

  if (expected.worldLandmarks !== undefined) {
    expect(actual.worldLandmarks).toBeDefined();
    if (actual.worldLandmarks === undefined) {
      throw new Error("worldLandmarks expected but was undefined");
    }
    expectCloseToLandmarks(actual.worldLandmarks, expected.worldLandmarks);
  } else {
    expect(actual.worldLandmarks).toBeUndefined();
  }

  if (expected.handedness !== undefined) {
    expect(actual.handedness).toEqual(expected.handedness);
  } else {
    expect(actual).not.toHaveProperty("handedness");
  }
};

describe("createMediaPipeHandTracker", () => {
  it("loads the hand landmarker and returns a HandDetection with matching raw and filtered frames", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_1],
        handedness: [
          [
            {
              score: 0.97,
              index: 0,
              categoryName: "Right",
              displayName: "Right"
            }
          ]
        ]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const expectedFrame = createExpectedFrame(
      {
        handedness: [
          {
            score: 0.97,
            index: 0,
            categoryName: "Right",
            displayName: "Right"
          }
        ]
      },
      EXPECTED_WORLD_LANDMARKS
    );

    const detection = await tracker.detect(bitmap, 0);

    expect(detection).not.toBeUndefined();
    if (detection === undefined) {
      throw new Error("detection should be defined");
    }
    const rawFrame = detection.rawFrame;
    const filteredFrame = detection.filteredFrame;
    expectHandFrameCloseTo(rawFrame, expectedFrame);
    expectHandFrameCloseTo(filteredFrame, expectedFrame);

    expect(forVisionTasks).toHaveBeenCalledWith(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
    );
    expect(createFromOptions).toHaveBeenCalledWith("vision", {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
      numHands: 1,
      runningMode: "VIDEO"
    });
  });

  it("omits handedness when the tracker result does not include it", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_1]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const detection = await tracker.detect(bitmap, 0);

    const expectedFrame = createExpectedFrame({}, EXPECTED_WORLD_LANDMARKS);

    expect(detection).not.toBeUndefined();
    if (detection === undefined) {
      throw new Error("detection should be defined");
    }
    const rawFrame = detection.rawFrame;
    const filteredFrame = detection.filteredFrame;
    expectHandFrameCloseTo(rawFrame, expectedFrame);
    expectHandFrameCloseTo(filteredFrame, expectedFrame);
    expect(rawFrame).not.toHaveProperty("handedness");
    expect(filteredFrame).not.toHaveProperty("handedness");
  });

  it("omits handedness when the tracker result includes an empty selected-hand array", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        handedness: [[]]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const detection = await tracker.detect(bitmap, 0);

    if (detection === undefined) {
      throw new Error("detection should be defined");
    }
    expect(detection.rawFrame).toStrictEqual(createExpectedFrame());
    expect(detection.rawFrame).not.toHaveProperty("handedness");
  });

  it("accepts handednesses alias when handedness is absent", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_1],
        handednesses: [
          [
            {
              score: 0.96,
              index: 0,
              categoryName: "Left",
              displayName: "Left"
            }
          ]
        ]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const expectedFrame = createExpectedFrame(
      {
        handedness: [
          {
            score: 0.96,
            index: 0,
            categoryName: "Left",
            displayName: "Left"
          }
        ]
      },
      EXPECTED_WORLD_LANDMARKS
    );

    const detection = await tracker.detect(bitmap, 0);

    expect(detection).not.toBeUndefined();
    if (detection === undefined) {
      throw new Error("detection should be defined");
    }
    const rawFrame = detection.rawFrame;
    const filteredFrame = detection.filteredFrame;
    expectHandFrameCloseTo(rawFrame, expectedFrame);
    expectHandFrameCloseTo(filteredFrame, expectedFrame);
  });

  it("returns undefined when no hands are detected", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 0)).resolves.toBeUndefined();
  });

  it("smooths per-landmark x/y/z values on the filtered frame while keeping raw untouched", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_1]
      })
      .mockReturnValueOnce({
        landmarks: [BASE_LANDMARKS_FRAME_2],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_2]
      });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    // Aggressive smoothing: very low minCutoff, beta zero. Math:
    //   alpha = 1/(1 + (1/(2*pi*0.01))/0.033) ~= 0.00207
    // so frame 2 output ~= prev + 0.00207 * (raw - prev).
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 })
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const first = await tracker.detect(bitmap, 0);
    const second = await tracker.detect(bitmap, 33);

    if (first === undefined || second === undefined) {
      throw new Error("detection frames should be defined");
    }

    expect(first.filteredFrame.landmarks.indexTip.x).toBeCloseTo(0.5);
    expect(second.rawFrame.landmarks.indexTip.x).toBeCloseTo(0.6);
    expect(second.filteredFrame.landmarks.indexTip.x).toBeGreaterThan(0.5);
    expect(second.filteredFrame.landmarks.indexTip.x).toBeLessThan(0.51);

    expect(first.filteredFrame.worldLandmarks?.indexTip.x).toBeCloseTo(0.6);
    expect(second.rawFrame.worldLandmarks?.indexTip.x).toBeCloseTo(0.7);
    expect(second.filteredFrame.worldLandmarks?.indexTip.x).toBeGreaterThan(0.6);
    expect(second.filteredFrame.worldLandmarks?.indexTip.x).toBeLessThan(0.61);

    expect(first.filteredFrame.worldLandmarks?.wrist.y).toBeCloseTo(0.3);
    expect(second.filteredFrame.worldLandmarks?.wrist.y).toBeGreaterThan(0.3);
    expect(second.filteredFrame.worldLandmarks?.wrist.y).toBeLessThan(0.31);
  });

  it("resets filter state when the hand leaves the frame so re-acquisition seeds fresh", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_1]
      })
      .mockReturnValueOnce({ landmarks: [] })
      .mockReturnValueOnce({
        landmarks: [BASE_LANDMARKS_FRAME_2],
        worldLandmarks: [WORLD_LANDMARKS_FRAME_2]
      });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 })
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    await tracker.detect(bitmap, 33);
    const reacquired = await tracker.detect(bitmap, 66);

    if (reacquired === undefined) {
      throw new Error("reacquired frame should be defined");
    }

    expect(reacquired.filteredFrame.landmarks.wrist.x).toBeCloseTo(0.2);
    expect(reacquired.filteredFrame.landmarks.wrist.y).toBeCloseTo(0.3);
    expect(reacquired.filteredFrame.landmarks.wrist.z).toBeCloseTo(0.4);

    expect(reacquired.filteredFrame.worldLandmarks?.wrist.x).toBeCloseTo(0.3);
    expect(reacquired.filteredFrame.worldLandmarks?.wrist.y).toBeCloseTo(0.4);
    expect(reacquired.filteredFrame.worldLandmarks?.wrist.z).toBeCloseTo(0.5);
  });

  it("re-reads getFilterConfig on every detect call so slider moves apply live", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const config = { minCutoff: 0.01, beta: 0, dCutoff: 1.0 };
    const getFilterConfig = vi.fn(() => config);
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    config.minCutoff = 1_000_000;
    const relaxed = await tracker.detect(bitmap, 33);

    if (relaxed === undefined) {
      throw new Error("relaxed frame should be defined");
    }
    expect(relaxed.filteredFrame.landmarks.indexTip.x).toBeCloseTo(0.6);
    expect(getFilterConfig.mock.calls.length).toBeGreaterThan(1);
  });
});
