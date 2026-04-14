# Thumb Trigger Geometry Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the screen-space thumb trigger with a hand-relative geometry metric that fires reliably for mirrored left and right hands, while preserving handedness metadata for future debugging.

**Architecture:** Keep `mapHandToGameInput()` as the stable seam between tracking and gameplay. Move trigger evaluation to a thumb-local projection metric derived from existing landmarks, keep hysteresis in `evaluateThumbTrigger.ts`, and propagate MediaPipe handedness into `HandFrame` as optional metadata rather than as a hard dependency for firing logic.

**Tech Stack:** TypeScript, Vitest, MediaPipe Hand Landmarker, ESLint

---

## Planned File Changes

- Create: `tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`
- Modify: `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`
- Modify: `tests/unit/shared/config/gameConfig.test.ts`
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`
- Modify: `src/features/input-mapping/evaluateThumbTrigger.ts`
- Modify: `src/shared/config/gameConfig.ts`
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `src/shared/types/hand.ts`
- Modify: `src/features/hand-tracking/createMediaPipeHandTracker.ts`

### Task 1: Lock the New Trigger Contract with Failing Tests

**Files:**
- Create: `tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

- [ ] **Step 1: Add direct trigger evaluator tests for right-hand, left-hand, and hysteresis behavior**

```ts
import { describe, expect, it } from "vitest";
import {
  evaluateThumbTrigger,
  type TriggerTuning
} from "../../../../src/features/input-mapping/evaluateThumbTrigger";
import type { HandFrame } from "../../../../src/shared/types/hand";

const tuning: TriggerTuning = {
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1
};

const createFrame = (
  overrides: Partial<HandFrame["landmarks"]>
): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.4, y: 0.7, z: 0 },
    indexMcp: { x: 0.47, y: 0.48, z: 0 },
    indexTip: { x: 0.5, y: 0.3, z: 0 },
    thumbIp: { x: 0.37, y: 0.57, z: 0 },
    thumbTip: { x: 0.3, y: 0.6, z: 0 },
    middleTip: { x: 0.45, y: 0.64, z: 0 },
    ringTip: { x: 0.42, y: 0.66, z: 0 },
    pinkyTip: { x: 0.39, y: 0.67, z: 0 },
    ...overrides
  }
});

const mirrorFrame = (frame: HandFrame): HandFrame => ({
  ...frame,
  landmarks: Object.fromEntries(
    Object.entries(frame.landmarks).map(([key, point]) => [
      key,
      { ...point, x: 1 - point.x }
    ])
  ) as HandFrame["landmarks"]
});

describe("evaluateThumbTrigger", () => {
  it("pulls for a right-hand thumb closing toward the index base", () => {
    const open = createFrame({ thumbTip: { x: 0.28, y: 0.62, z: 0 } });
    const pulled = createFrame({ thumbTip: { x: 0.43, y: 0.52, z: 0 } });

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
  });

  it("pulls for the mirrored left-hand geometry too", () => {
    const open = mirrorFrame(createFrame({ thumbTip: { x: 0.28, y: 0.62, z: 0 } }));
    const pulled = mirrorFrame(createFrame({ thumbTip: { x: 0.43, y: 0.52, z: 0 } }));

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
  });

  it("keeps the trigger latched until the release threshold is crossed", () => {
    const latched = createFrame({ thumbTip: { x: 0.4, y: 0.54, z: 0 } });
    const released = createFrame({ thumbTip: { x: 0.31, y: 0.6, z: 0 } });

    expect(evaluateThumbTrigger(latched, "pulled", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(released, "pulled", tuning)).toBe("open");
  });
});
```

- [ ] **Step 2: Run the new test first and verify it fails for the current X-only implementation**

Run: `npx vitest --run tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`

Expected: FAIL because `evaluateThumbTrigger()` still depends on `thumbTip.x - wrist.x`, so the mirrored left-hand case and the new hysteresis fixture do not match the desired hand-relative behavior.

- [ ] **Step 3: Update the higher-level input-mapping tests to encode geometric trigger poses instead of raw thumb X travel**

```ts
it("only emits a shot when a loose gun pose and trigger pull occur", () => {
  const openFrame = {
    ...frame,
    landmarks: {
      ...frame.landmarks,
      thumbTip: { x: 0.28, y: 0.62, z: 0 }
    }
  };
  const pulledFrame = {
    ...frame,
    landmarks: {
      ...frame.landmarks,
      thumbTip: { x: 0.43, y: 0.52, z: 0 }
    }
  };

  const first = mapHandToGameInput(openFrame, { width: 1280, height: 720 }, undefined);
  const second = mapHandToGameInput(pulledFrame, { width: 1280, height: 720 }, first.runtime);
  const third = mapHandToGameInput(pulledFrame, { width: 1280, height: 720 }, second.runtime);

  expect(first.shotFired).toBe(false);
  expect(second.shotFired).toBe(true);
  expect(third.shotFired).toBe(false);
});
```

- [ ] **Step 4: Re-run the input-mapping suites and keep them red until the production metric is implemented**

Run:

```bash
npx vitest --run \
  tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts \
  tests/unit/features/input-mapping/mapHandToGameInput.test.ts
```

Expected: FAIL in the new direct evaluator suite and in the updated shot/hysteresis cases.

- [ ] **Step 5: Commit the red test contract**

```bash
git add tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts
git commit -m "test(input): define geometry-based thumb trigger contract"
```

### Task 2: Implement the Geometry-Based Thumb Trigger and Retune Defaults

**Files:**
- Modify: `src/features/input-mapping/evaluateThumbTrigger.ts`
- Modify: `src/shared/config/gameConfig.ts`
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `tests/unit/shared/config/gameConfig.test.ts`
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`

- [ ] **Step 1: Replace the X-only travel metric with a thumb-local projection metric**

```ts
import type { HandFrame } from "../../shared/types/hand";
import { gameConfig } from "../../shared/config/gameConfig";

export type TriggerState = "open" | "pulled";

export interface TriggerTuning {
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

const measureThumbPull = (frame: HandFrame): number => {
  const { wrist, indexMcp, thumbIp, thumbTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const axisX = indexMcp.x - thumbIp.x;
  const axisY = indexMcp.y - thumbIp.y;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const thumbX = thumbTip.x - thumbIp.x;
  const thumbY = thumbTip.y - thumbIp.y;
  const projection = (thumbX * axisX + thumbY * axisY) / axisLength;

  return projection / handScale;
};

export const evaluateThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): TriggerState => {
  const thumbPull = measureThumbPull(frame);

  if (previousState === "pulled") {
    return thumbPull > tuning.triggerReleaseThreshold ? "pulled" : "open";
  }

  return thumbPull > tuning.triggerPullThreshold ? "pulled" : "open";
};
```

- [ ] **Step 2: Recalibrate the shared defaults around the new metric**

```ts
export const CAMERA_WIDTH = 640;
export const CAMERA_HEIGHT = 480;
export const INPUT_SMOOTHING_ALPHA = 0.28;
export const INPUT_TRIGGER_PULL_THRESHOLD = 0.18;
export const INPUT_TRIGGER_RELEASE_THRESHOLD = 0.1;
```

- [ ] **Step 3: Expand the debug slider range so the new defaults are adjustable instead of clamped**

```ts
const DEBUG_META: Record<keyof DebugValues, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  triggerPullThreshold: { label: "Pull", min: 0.05, max: 0.4, step: 0.01 },
  triggerReleaseThreshold: { label: "Release", min: 0.02, max: 0.25, step: 0.01 }
};
```

- [ ] **Step 4: Update config and debug-panel tests for the new threshold band**

```ts
expect(gameConfig.input).toEqual({
  smoothingAlpha: 0.28,
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1
});
```

```ts
expect(panel.values.triggerPullThreshold).toBeCloseTo(0.18);
expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.1);
```

- [ ] **Step 5: Run the focused suites and verify the trigger contract turns green**

Run:

```bash
npx vitest --run \
  tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts \
  tests/unit/features/input-mapping/mapHandToGameInput.test.ts \
  tests/unit/shared/config/gameConfig.test.ts \
  tests/unit/features/debug/createDebugPanel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the metric change**

```bash
git add src/features/input-mapping/evaluateThumbTrigger.ts src/shared/config/gameConfig.ts src/features/debug/createDebugPanel.ts tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts tests/unit/shared/config/gameConfig.test.ts tests/unit/features/debug/createDebugPanel.test.ts
git commit -m "fix(input): switch thumb trigger to hand-relative geometry"
```

### Task 3: Propagate Handedness Metadata Through the Tracker Boundary

**Files:**
- Modify: `src/shared/types/hand.ts`
- Modify: `src/features/hand-tracking/createMediaPipeHandTracker.ts`
- Modify: `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`

- [ ] **Step 1: Extend the local hand type with optional handedness metadata**

```ts
export interface HandednessCategory {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

export interface HandFrame {
  width: number;
  height: number;
  handedness?: HandednessCategory[];
  landmarks: {
    wrist: Point3D;
    indexTip: Point3D;
    indexMcp: Point3D;
    thumbTip: Point3D;
    thumbIp: Point3D;
    middleTip: Point3D;
    ringTip: Point3D;
    pinkyTip: Point3D;
  };
}
```

- [ ] **Step 2: Map MediaPipe handedness for the selected hand without making trigger logic depend on it**

```ts
interface HandednessLike {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

interface HandLandmarkerResultLike {
  landmarks: LandmarkLike[][];
  handedness?: HandednessLike[][];
}

const toHandFrame = (
  result: HandLandmarkerResultLike,
  sourceSize: { width: number; height: number }
): HandFrame | undefined => {
  const landmarks = result.landmarks[0];
  const handedness = result.handedness?.[0];

  // existing landmark extraction...

  return {
    width: sourceSize.width,
    height: sourceSize.height,
    handedness,
    landmarks: {
      wrist,
      thumbIp,
      thumbTip,
      indexMcp,
      indexTip,
      middleTip,
      ringTip,
      pinkyTip
    }
  };
};
```

- [ ] **Step 3: Update tracker tests to prove handedness is preserved and aligned with the first hand**

```ts
await expect(tracker.detect(bitmap, 123)).resolves.toEqual({
  width: 640,
  height: 480,
  handedness: [
    {
      score: 0.97,
      index: 0,
      categoryName: "Right",
      displayName: "Right"
    }
  ],
  landmarks: {
    wrist: { x: 0.1, y: 0.2, z: 0.3 },
    thumbIp: { x: 0.2, y: 0.3, z: 0.4 },
    thumbTip: { x: 0.3, y: 0.4, z: 0.5 },
    indexMcp: { x: 0.4, y: 0.5, z: 0.6 },
    indexTip: { x: 0.5, y: 0.6, z: 0.7 },
    middleTip: { x: 0.6, y: 0.7, z: 0.8 },
    ringTip: { x: 0.7, y: 0.8, z: 0.9 },
    pinkyTip: { x: 0.8, y: 0.9, z: 1 }
  }
});
```

- [ ] **Step 4: Run the tracker tests and verify the boundary stays stable when handedness is missing**

Run:

```bash
npx vitest --run tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
```

Expected: PASS, including the existing no-hand case and a new/updated expectation that `handedness` is optional metadata.

- [ ] **Step 5: Commit the tracking metadata change**

```bash
git add src/shared/types/hand.ts src/features/hand-tracking/createMediaPipeHandTracker.ts tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
git commit -m "feat(tracking): propagate handedness metadata"
```

### Task 4: Run Blocking Verification and Perform a Short Webcam Sanity Check

**Files:**
- No code changes required unless verification exposes regressions

- [ ] **Step 1: Run the repo blocking gate**

Run: `npm run check`

Expected: `lint`, `typecheck`, and `test` all exit with code `0`.

- [ ] **Step 2: Run the browser smoke check to ensure the app still boots through the current path**

Run: `npm run test:e2e`

Expected: PASS for `tests/e2e/app.smoke.spec.ts`.

- [ ] **Step 3: Manually validate the live thumb trigger in Chrome with both mirrored hand geometries**

Checklist:

```text
1. Start the app in Chrome with the debug panel visible.
2. Confirm the crosshair still tracks the index finger.
3. Confirm a loose gun pose plus thumb pull fires once on the open -> pulled edge.
4. Confirm holding the thumb in the pulled pose does not auto-repeat.
5. Confirm a mirrored hand can also fire without retuning the code.
6. Record any threshold adjustments made in the debug panel before changing defaults again.
```

- [ ] **Step 4: If manual validation requires threshold tweaks, commit the tuned defaults and matching tests**

```bash
git add src/shared/config/gameConfig.ts src/features/debug/createDebugPanel.ts tests/unit/shared/config/gameConfig.test.ts tests/unit/features/debug/createDebugPanel.test.ts
git commit -m "fix(input): tune live thumb trigger thresholds"
```
