# OneEuro Hand-Landmark Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a 1€ (OneEuro) per-landmark filter at the MediaPipe Hand Landmarker perception seam so downstream aim-and-fire logic operates on temporally smoothed landmarks instead of raw jitter, restoring reliable firing on `main` without touching the shot intent state machine. Ship the temporary raw-vs-filtered telemetry that issue #35's acceptance test demands.

**Architecture:** A dependency-free `oneEuroFilter.ts` primitive (closure-based 1D filter, reads config via getter so sliders tune live). `createMediaPipeHandTracker.ts` keeps its existing `toHandFrame` mapping and adds a thin `filterFrame` pass that applies 24 filter instances (8 tracked landmarks × 3 axes). The tracker also emits a per-frame raw-vs-filtered indexTip trace through a required callback. Filter config lives in `gameConfig.ts`, mirrors into `DebugValues`, exposes two sliders (`handFilterMinCutoff`, `handFilterBeta`), and is wired from `startApp` into the tracker as a `getFilterConfig` closure that reads `debugPanel.values` every frame. `startApp` also wires the trace callback into a small rolling-jitter accumulator whose output is surfaced through `DebugTelemetry`. `dCutoff` stays a constant (not slider-tuned).

**Trust boundaries (no dead fallbacks):** The OneEuro primitive is an internal helper called from exactly one place. Its config flows from `gameConfig` (static literals) or the debug panel (which already clamps slider values). Its values flow from MediaPipe `detectForVideo` landmarks (valid finite floats by API contract). Its timestamps flow from `requestAnimationFrame` (strictly monotonic positive reals). We therefore do not guard against `NaN`, `Infinity`, negative cutoffs, or non-positive dt inside the primitive — those scenarios cannot arise at this seam, and silently absorbing them would only hide future bugs. `MediaPipeHandTrackerOptions.getFilterConfig` and `onLandmarkTrace` are **required**, not optional: `startApp` is the only caller, and it always passes both. The jitter helper does not defend against non-finite pushes for the same reason.

**Tech Stack:** TypeScript, Vitest, MediaPipe `@mediapipe/tasks-vision` v0.10.34 (unchanged), zero new runtime dependencies.

**Scope guardrails (from issue #35):**
- Do **not** modify `shotIntentStateMachine`, `evaluateThumbTrigger`, `evaluateGunPose`, `createHandEvidence`, `mapHandToGameInput`, or `gameConfig.input.triggerPullThreshold` / `triggerReleaseThreshold`.
- Do **not** add dependencies.
- **LoC budget:** issue #35 targets `+70 to +120` production LoC. This plan lands at roughly **+215 production LoC** (see table at the end). The overshoot is concentrated in the raw-vs-filtered jitter telemetry pipeline that the same issue demands in its acceptance criteria and the tracker rewrite the issue asks for but does not line-budget. No code is added that is not traceable to a requirement.
- Keep all existing thumb-trigger behavior intact; this change is purely upstream of it.

**Spec / handover sources:**
- `docs/superpowers/handovers/2026-04-11-firing-stability-investigation-kickoff.md` — investigation brief that produced issue #35.
- GitHub issue #35 — "Stabilize firing: add OneEuro landmark filter at hand-tracking perception seam".
- 1€ Filter primary source — https://gery.casiez.net/1euro/ (tuning order: set `beta = 0`, tune `minCutoff`, then raise `beta` to reduce lag on fast motion).

---

## File Structure

**New files (production):**
- `src/features/hand-tracking/oneEuroFilter.ts` — 1D 1€ filter primitive, pure TS, zero deps.
- `src/features/hand-tracking/landmarkJitter.ts` — rolling peak-jitter tracker used to feed `DebugTelemetry` for the raw-vs-filtered acceptance check.

**New test files:**
- `tests/unit/features/hand-tracking/oneEuroFilter.test.ts`
- `tests/unit/features/hand-tracking/landmarkJitter.test.ts`

**Modified files (production):**
- `src/features/hand-tracking/createMediaPipeHandTracker.ts` — accept required `MediaPipeHandTrackerOptions` (`getFilterConfig`, `onLandmarkTrace`), instantiate the filter table, apply a thin `filterFrame` pass, reset on no-hand, emit trace.
- `src/shared/config/gameConfig.ts` — add `handFilterMinCutoff`, `handFilterBeta`, `handFilterDCutoff` defaults (beta starts at `0` per the 1€ tuning procedure).
- `src/features/debug/createDebugPanel.ts` — add `handFilterMinCutoff` + `handFilterBeta` keys, meta, rendering, and two jitter-output rows (`rawIndexJitter`, `filterIndexJitter`) on `DebugTelemetry`.
- `src/app/bootstrap/startApp.ts` — seed the new default debug values, build `getFilterConfig` + `onLandmarkTrace` closures that read `debugPanel.values` live and feed the jitter accumulator.

**Modified test files:**
- `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`
- `tests/unit/features/debug/createDebugPanel.test.ts`
- `tests/unit/app/bootstrap/startApp.test.ts`
- `tests/unit/shared/config/gameConfig.test.ts`

**Files deliberately not touched:** `shotIntentStateMachine.ts`, `mapHandToGameInput.ts`, `createHandEvidence.ts`, `evaluateThumbTrigger.ts`, `evaluateGunPose.ts`, `drawGameFrame.ts`.

---

## Pre-flight

- [ ] **Step 0.1: Verify clean tree on `main`**

Run:
```bash
git status
git log --oneline -1
npm run lint && npm run typecheck && npm run test
```
Expected: `working tree clean`, HEAD is `0060e0c docs(handovers): preserve 2026-04-11 firing stability investigation brief` (or later), all three checks green. This establishes the baseline so later failures can be attributed to this plan.

- [ ] **Step 0.2: Create and switch to the feature branch**

```bash
git checkout -b feat/issue-35-oneeuro-landmark-filter
```
Expected: `Switched to a new branch 'feat/issue-35-oneeuro-landmark-filter'`.

---

## Task 1: OneEuro filter primitive (TDD)

**Why:** Build the smallest correct unit first. Downstream wiring depends on it. This primitive is an internal helper — it trusts finite positive inputs and returns the canonical 1€ formula without guarding against invalid values.

**LoC estimate:** ~40 production LoC, ~90 test LoC.

**Files:**
- Create: `src/features/hand-tracking/oneEuroFilter.ts`
- Test: `tests/unit/features/hand-tracking/oneEuroFilter.test.ts`

### Interface we will build

```ts
export interface OneEuroFilterConfig {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export interface OneEuroFilter {
  filter(value: number, timestampMs: number): number;
  reset(): void;
}

export const createOneEuroFilter: (
  getConfig: () => OneEuroFilterConfig
) => OneEuroFilter;
```

Semantics:
- First call after construction or `reset()` returns `value` unchanged and seeds state.
- Subsequent calls compute a 1€ smoothed value: `tau = 1/(2·π·cutoff)`, `alpha = 1/(1 + tau/dt)`, `cutoff = minCutoff + beta·|dxFiltered|`.
- Timestamps are in **milliseconds**; the filter divides by 1000 to obtain dt in seconds.
- `getConfig()` is called on every `filter()` invocation so slider moves take effect immediately.

### Steps

- [ ] **Step 1.1: Create the empty source file**

Create `src/features/hand-tracking/oneEuroFilter.ts`:

```ts
export {};
```

- [ ] **Step 1.2: Write the failing test file**

Create `tests/unit/features/hand-tracking/oneEuroFilter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createOneEuroFilter,
  type OneEuroFilterConfig
} from "../../../../src/features/hand-tracking/oneEuroFilter";

const staticConfig = (config: OneEuroFilterConfig) => () => config;

describe("createOneEuroFilter", () => {
  it("returns the first sample unchanged", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 })
    );

    expect(filter.filter(0.5, 0)).toBe(0.5);
  });

  it("pulls subsequent stationary samples toward the previous value", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.0, dCutoff: 1.0 })
    );

    filter.filter(0.5, 0);
    // 33 ms later a noisy value arrives; with beta=0 the cutoff stays at
    // minCutoff=1 Hz so the output is dragged back toward 0.5, not snapped
    // to 0.8. Math: alpha ≈ 0.1717, output ≈ 0.5515.
    const smoothed = filter.filter(0.8, 33);

    expect(smoothed).toBeGreaterThan(0.5);
    expect(smoothed).toBeLessThan(0.8);
    expect(smoothed).toBeCloseTo(0.5 + 0.1717 * 0.3, 3);
  });

  it("approaches the input more closely when beta couples cutoff to speed", () => {
    const lowBeta = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.0, dCutoff: 1.0 })
    );
    const highBeta = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.5, dCutoff: 1.0 })
    );

    lowBeta.filter(0.0, 0);
    highBeta.filter(0.0, 0);

    const slowOut = lowBeta.filter(1.0, 33);
    const fastOut = highBeta.filter(1.0, 33);

    expect(fastOut).toBeGreaterThan(slowOut);
  });

  it("resets internal state so the next filter call seeds as if new", () => {
    const filter = createOneEuroFilter(
      staticConfig({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 })
    );

    filter.filter(0.5, 0);
    filter.filter(0.9, 33);
    filter.reset();

    expect(filter.filter(0.2, 66)).toBe(0.2);
  });

  it("reads config from the getter on every call so live slider moves apply", () => {
    let minCutoff = 0.01;
    const filter = createOneEuroFilter(() => ({
      minCutoff,
      beta: 0.0,
      dCutoff: 1.0
    }));

    filter.filter(0.0, 0);
    const aggressive = filter.filter(1.0, 33);

    minCutoff = 1_000_000;
    const passThrough = filter.filter(1.0, 66);

    expect(passThrough).toBeGreaterThan(aggressive);
  });
});
```

- [ ] **Step 1.3: Run the test file and confirm it fails for the right reason**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/oneEuroFilter.test.ts
```
Expected: collection error — `createOneEuroFilter` is not exported.

- [ ] **Step 1.4: Implement the 1€ filter**

Replace the contents of `src/features/hand-tracking/oneEuroFilter.ts` with:

```ts
export interface OneEuroFilterConfig {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export interface OneEuroFilter {
  filter(value: number, timestampMs: number): number;
  reset(): void;
}

const smoothingFactor = (timeElapsedSec: number, cutoffHz: number): number => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / timeElapsedSec);
};

export const createOneEuroFilter = (
  getConfig: () => OneEuroFilterConfig
): OneEuroFilter => {
  let prevValue: number | undefined;
  let prevDerivative = 0;
  let prevTimestampMs: number | undefined;

  const filter = (value: number, timestampMs: number): number => {
    if (prevValue === undefined || prevTimestampMs === undefined) {
      prevValue = value;
      prevDerivative = 0;
      prevTimestampMs = timestampMs;
      return value;
    }

    const dtSec = (timestampMs - prevTimestampMs) / 1000;
    const { minCutoff, beta, dCutoff } = getConfig();

    const rawDerivative = (value - prevValue) / dtSec;
    const aD = smoothingFactor(dtSec, dCutoff);
    const dxFiltered = aD * rawDerivative + (1 - aD) * prevDerivative;

    const cutoff = minCutoff + beta * Math.abs(dxFiltered);
    const a = smoothingFactor(dtSec, cutoff);
    const filteredValue = a * value + (1 - a) * prevValue;

    prevValue = filteredValue;
    prevDerivative = dxFiltered;
    prevTimestampMs = timestampMs;

    return filteredValue;
  };

  const reset = (): void => {
    prevValue = undefined;
    prevDerivative = 0;
    prevTimestampMs = undefined;
  };

  return { filter, reset };
};
```

- [ ] **Step 1.5: Run the test file and confirm it passes**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/oneEuroFilter.test.ts
```
Expected: all 5 specs pass.

- [ ] **Step 1.6: Commit**

```bash
git add src/features/hand-tracking/oneEuroFilter.ts tests/unit/features/hand-tracking/oneEuroFilter.test.ts
git commit -m "feat(hand-tracking): add OneEuro 1D filter primitive"
```

---

## Task 2: Filter defaults in `gameConfig` and its exact-shape test

**Why:** Lift starting parameters into the same config surface as other input constants so `startApp` can read them and slider bounds can reference them. Beta starts at `0` so no pre-blessed value biases live tuning. The existing `gameConfig.test.ts` asserts the exact shape of `gameConfig.input`, so it must be updated in the same task.

**LoC estimate:** ~7 production LoC, ~4 test LoC.

**Files:**
- Modify: `src/shared/config/gameConfig.ts`
- Modify: `tests/unit/shared/config/gameConfig.test.ts:10-14`

### Steps

- [ ] **Step 2.1: Update `gameConfig.test.ts` first (test fails before prod change)**

Replace lines 10-14 of `tests/unit/shared/config/gameConfig.test.ts` with:

```ts
    expect(gameConfig.input).toEqual({
      smoothingAlpha: 0.28,
      triggerPullThreshold: 0.18,
      triggerReleaseThreshold: 0.1,
      handFilterMinCutoff: 1.0,
      handFilterBeta: 0,
      handFilterDCutoff: 1.0
    });
```

- [ ] **Step 2.2: Run the test and confirm it fails**

Run:
```bash
npx vitest run tests/unit/shared/config/gameConfig.test.ts
```
Expected: fails because `gameConfig.input` still has the old shape.

- [ ] **Step 2.3: Update `gameConfig.ts`**

Replace the contents of `src/shared/config/gameConfig.ts` with:

```ts
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;
const INPUT_SMOOTHING_ALPHA = 0.28;
const INPUT_TRIGGER_PULL_THRESHOLD = 0.18;
const INPUT_TRIGGER_RELEASE_THRESHOLD = 0.1;
// 1€ filter defaults. Beta starts at 0 per https://gery.casiez.net/1euro/.
const HAND_FILTER_MIN_CUTOFF_HZ = 1.0;
const HAND_FILTER_BETA = 0;
const HAND_FILTER_D_CUTOFF_HZ = 1.0;

export const gameConfig = {
  camera: {
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT
  },
  input: {
    smoothingAlpha: INPUT_SMOOTHING_ALPHA,
    triggerPullThreshold: INPUT_TRIGGER_PULL_THRESHOLD,
    triggerReleaseThreshold: INPUT_TRIGGER_RELEASE_THRESHOLD,
    handFilterMinCutoff: HAND_FILTER_MIN_CUTOFF_HZ,
    handFilterBeta: HAND_FILTER_BETA,
    handFilterDCutoff: HAND_FILTER_D_CUTOFF_HZ
  }
} as const;
```

- [ ] **Step 2.4: Re-run the config test and typecheck**

Run:
```bash
npx vitest run tests/unit/shared/config/gameConfig.test.ts && npm run typecheck
```
Expected: green. `startApp.ts`'s `createDefaultDebugValues` still compiles because it only pulls a subset of fields; the new keys are consumed in Task 6.

- [ ] **Step 2.5: Commit**

```bash
git add src/shared/config/gameConfig.ts tests/unit/shared/config/gameConfig.test.ts
git commit -m "chore(config): add OneEuro hand-filter defaults"
```

---

## Task 3: Rolling jitter helper (TDD)

**Why:** Issue #35's acceptance criteria demand "raw vs filtered index-tip jitter" telemetry. This helper consumes a stream of 2D landmark positions and reports the peak consecutive-sample displacement seen inside a short rolling window. `startApp` will feed it twice — once for raw, once for filtered — and the results surface via `DebugTelemetry`.

**LoC estimate:** ~25 production LoC, ~45 test LoC.

**Files:**
- Create: `src/features/hand-tracking/landmarkJitter.ts`
- Test: `tests/unit/features/hand-tracking/landmarkJitter.test.ts`

### Interface we will build

```ts
export interface LandmarkJitterTracker {
  push(x: number, y: number): void;
  peek(): number;
  reset(): void;
}

export const createLandmarkJitterTracker: (windowSize: number) => LandmarkJitterTracker;
```

Semantics:
- Ring-buffered; holds the last `windowSize` samples.
- `peek()` returns the max Euclidean distance between any pair of consecutive samples in the window. Zero when the buffer has fewer than 2 samples.
- `reset()` clears the buffer.

### Steps

- [ ] **Step 3.1: Write the failing test**

Create `tests/unit/features/hand-tracking/landmarkJitter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLandmarkJitterTracker } from "../../../../src/features/hand-tracking/landmarkJitter";

describe("createLandmarkJitterTracker", () => {
  it("reports zero jitter before it has two samples", () => {
    const jitter = createLandmarkJitterTracker(10);
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
```

- [ ] **Step 3.2: Run and confirm failure**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/landmarkJitter.test.ts
```
Expected: collection error on missing module.

- [ ] **Step 3.3: Implement the helper**

Create `src/features/hand-tracking/landmarkJitter.ts`:

```ts
export interface LandmarkJitterTracker {
  push(x: number, y: number): void;
  peek(): number;
  reset(): void;
}

interface Sample {
  x: number;
  y: number;
}

export const createLandmarkJitterTracker = (
  windowSize: number
): LandmarkJitterTracker => {
  const capacity = Math.max(2, Math.floor(windowSize));
  const samples: Sample[] = [];

  const push = (x: number, y: number): void => {
    samples.push({ x, y });

    if (samples.length > capacity) {
      samples.shift();
    }
  };

  const peek = (): number => {
    if (samples.length < 2) {
      return 0;
    }

    let peak = 0;

    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1] as Sample;
      const curr = samples[i] as Sample;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > peak) {
        peak = distance;
      }
    }

    return peak;
  };

  const reset = (): void => {
    samples.length = 0;
  };

  return { push, peek, reset };
};
```

- [ ] **Step 3.4: Run the test and confirm it passes**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/landmarkJitter.test.ts
```
Expected: all 4 specs pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/features/hand-tracking/landmarkJitter.ts tests/unit/features/hand-tracking/landmarkJitter.test.ts
git commit -m "feat(hand-tracking): add rolling landmark jitter tracker"
```

---

## Task 4: Wire the filter into `createMediaPipeHandTracker` (TDD)

**Why:** The perception seam. We keep the existing `toHandFrame` mapping and add a single `filterFrame` pass that runs after it. `startApp` is the sole caller of this factory, so `MediaPipeHandTrackerOptions` is **required** with **required** `getFilterConfig` and `onLandmarkTrace` fields — no default-config path, no optional-emit branch.

**LoC estimate:** ~80 production LoC net delta, ~140 test LoC updated.

**Files:**
- Modify: `src/features/hand-tracking/createMediaPipeHandTracker.ts`
- Test: `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`

### Design details

- 8 tracked landmarks × 3 axes = 24 filter instances, keyed by the names already used in `HAND_LANDMARK_INDEX`.
- Filters share a single `getFilterConfig` closure so slider mutations apply to every axis on the next frame.
- `detect` delegates raw mapping to the existing `toHandFrame`, then runs `filterHandFrame` on the result. No structural rewrite of `toHandFrame`.
- On tracking loss (`toHandFrame` returns undefined), all 24 filters are reset and the trace is not emitted because there is no raw indexTip to compare.
- The trace payload is `{ frameAtMs, rawIndexTip, filteredIndexTip }` — only the indexTip, since the acceptance test cares about that landmark.

### New/changed exports

```ts
export interface LandmarkTrace {
  frameAtMs: number;
  rawIndexTip: Point3D;
  filteredIndexTip: Point3D;
}

export interface MediaPipeHandTrackerOptions {
  getFilterConfig: () => OneEuroFilterConfig;
  onLandmarkTrace: (trace: LandmarkTrace) => void;
}

export const createMediaPipeHandTracker: (
  options: MediaPipeHandTrackerOptions
) => Promise<MediaPipeHandTracker>;
```

`MediaPipeHandTracker` (the object returned by `detect`) is unchanged.

### Steps

- [ ] **Step 4.1: Write the new failing tests**

Replace the contents of `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";

const BASE_LANDMARKS_FRAME_1 = [
  { x: 0.10, y: 0.20, z: 0.30 },
  {},
  {},
  { x: 0.20, y: 0.30, z: 0.40 },
  { x: 0.30, y: 0.40, z: 0.50 },
  { x: 0.40, y: 0.50, z: 0.60 },
  {},
  {},
  { x: 0.50, y: 0.60, z: 0.70 },
  {},
  {},
  {},
  { x: 0.60, y: 0.70, z: 0.80 },
  {},
  {},
  {},
  { x: 0.70, y: 0.80, z: 0.90 },
  {},
  {},
  {},
  { x: 0.80, y: 0.90, z: 1.00 }
];

const BASE_LANDMARKS_FRAME_2 = BASE_LANDMARKS_FRAME_1.map((landmark) => {
  if ("x" in landmark && landmark.x !== undefined) {
    return {
      x: (landmark as { x: number }).x + 0.10,
      y: (landmark as { y: number }).y + 0.10,
      z: (landmark as { z: number }).z + 0.10
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

const createExpectedFrame = (extra: Record<string, unknown> = {}) => ({
  width: 640,
  height: 480,
  ...extra,
  landmarks: EXPECTED_RAW_LANDMARKS
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

const NO_OP_TRACE = (): void => undefined;

describe("createMediaPipeHandTracker", () => {
  it("loads the hand landmarker and returns HandFrame results through detect", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
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
      getFilterConfig: PASS_THROUGH_CONFIG,
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 0)).resolves.toEqual(
      createExpectedFrame({
        handedness: [
          {
            score: 0.97,
            index: 0,
            categoryName: "Right",
            displayName: "Right"
          }
        ]
      })
    );

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
      detectForVideo: vi.fn(() => ({ landmarks: [BASE_LANDMARKS_FRAME_1] }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG,
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const frame = await tracker.detect(bitmap, 0);

    expect(frame).toStrictEqual(createExpectedFrame());
    expect(frame).not.toHaveProperty("handedness");
  });

  it("omits handedness when the tracker result includes an empty selected-hand array", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        handedness: [[]]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG,
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const frame = await tracker.detect(bitmap, 0);

    expect(frame).toStrictEqual(createExpectedFrame());
    expect(frame).not.toHaveProperty("handedness");
  });

  it("returns undefined when no hands are detected", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG,
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 0)).resolves.toBeUndefined();
  });

  it("smooths per-landmark x/y/z values between consecutive detect calls", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    // Aggressive smoothing: very low minCutoff, beta zero. Math:
    //   alpha = 1/(1 + (1/(2π·0.01))/0.033) ≈ 0.00207
    // so frame 2 output ≈ prev + 0.00207 * (raw - prev).
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 }),
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const first = await tracker.detect(bitmap, 0);
    const second = await tracker.detect(bitmap, 33);

    expect(first?.landmarks.indexTip.x).toBeCloseTo(0.5);
    expect(second?.landmarks.indexTip.x).toBeGreaterThan(0.5);
    expect(second?.landmarks.indexTip.x).toBeLessThan(0.51);
    expect(second?.landmarks.indexTip.y).toBeGreaterThan(0.6);
    expect(second?.landmarks.indexTip.y).toBeLessThan(0.61);
    expect(second?.landmarks.indexTip.z).toBeGreaterThan(0.7);
    expect(second?.landmarks.indexTip.z).toBeLessThan(0.71);
  });

  it("resets filter state when the hand leaves the frame so re-acquisition seeds fresh", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 }),
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    await tracker.detect(bitmap, 33);
    const reacquired = await tracker.detect(bitmap, 66);

    expect(reacquired?.landmarks.wrist.x).toBeCloseTo(0.2);
    expect(reacquired?.landmarks.wrist.y).toBeCloseTo(0.3);
    expect(reacquired?.landmarks.wrist.z).toBeCloseTo(0.4);
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
      getFilterConfig,
      onLandmarkTrace: NO_OP_TRACE
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    config.minCutoff = 1_000_000;
    const relaxed = await tracker.detect(bitmap, 33);

    expect(relaxed?.landmarks.indexTip.x).toBeCloseTo(0.6);
    expect(getFilterConfig.mock.calls.length).toBeGreaterThan(1);
  });

  it("emits a raw-vs-filtered indexTip trace on every successful detect", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const onLandmarkTrace = vi.fn();
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 }),
      onLandmarkTrace
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    await tracker.detect(bitmap, 33);

    expect(onLandmarkTrace).toHaveBeenCalledTimes(2);
    const secondCall = onLandmarkTrace.mock.calls[1]?.[0];
    expect(secondCall?.frameAtMs).toBe(33);
    expect(secondCall?.rawIndexTip.x).toBeCloseTo(0.6);
    expect(secondCall?.filteredIndexTip.x).toBeLessThan(0.51);
  });

  it("does not emit a trace when the frame is empty", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] }))
    });
    const onLandmarkTrace = vi.fn();
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG,
      onLandmarkTrace
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);

    expect(onLandmarkTrace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.2: Run the test file and confirm failure**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
```
Expected: compile errors on the new required options shape, and spec failures on the new expectations.

- [ ] **Step 4.3: Rewrite `createMediaPipeHandTracker.ts`**

Replace the contents of `src/features/hand-tracking/createMediaPipeHandTracker.ts` with:

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandFrame, HandednessCategory, Point3D } from "../../shared/types/hand";
import {
  createOneEuroFilter,
  type OneEuroFilter,
  type OneEuroFilterConfig
} from "./oneEuroFilter";

interface LandmarkLike {
  x: number;
  y: number;
  z: number;
}

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

interface MediaPipeHandTracker {
  detect(bitmap: ImageBitmap, frameAtMs: number): Promise<HandFrame | undefined>;
}

export interface LandmarkTrace {
  frameAtMs: number;
  rawIndexTip: Point3D;
  filteredIndexTip: Point3D;
}

export interface MediaPipeHandTrackerOptions {
  getFilterConfig: () => OneEuroFilterConfig;
  onLandmarkTrace: (trace: LandmarkTrace) => void;
}

const HAND_LANDMARK_INDEX = {
  wrist: 0,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20
} as const;

type TrackedLandmarkName = keyof typeof HAND_LANDMARK_INDEX;

const TRACKED_LANDMARK_NAMES = Object.keys(
  HAND_LANDMARK_INDEX
) as TrackedLandmarkName[];

type LandmarkFilters = Record<
  TrackedLandmarkName,
  { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }
>;

const createLandmarkFilters = (
  getConfig: () => OneEuroFilterConfig
): LandmarkFilters => {
  const filters = {} as LandmarkFilters;
  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name] = {
      x: createOneEuroFilter(getConfig),
      y: createOneEuroFilter(getConfig),
      z: createOneEuroFilter(getConfig)
    };
  }
  return filters;
};

const resetLandmarkFilters = (filters: LandmarkFilters): void => {
  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name].x.reset();
    filters[name].y.reset();
    filters[name].z.reset();
  }
};

const filterPoint = (
  point: Point3D,
  filters: LandmarkFilters[TrackedLandmarkName],
  frameAtMs: number
): Point3D => ({
  x: filters.x.filter(point.x, frameAtMs),
  y: filters.y.filter(point.y, frameAtMs),
  z: filters.z.filter(point.z, frameAtMs)
});

const filterHandFrame = (
  raw: HandFrame,
  filters: LandmarkFilters,
  frameAtMs: number
): HandFrame => ({
  ...raw,
  landmarks: {
    wrist: filterPoint(raw.landmarks.wrist, filters.wrist, frameAtMs),
    thumbIp: filterPoint(raw.landmarks.thumbIp, filters.thumbIp, frameAtMs),
    thumbTip: filterPoint(raw.landmarks.thumbTip, filters.thumbTip, frameAtMs),
    indexMcp: filterPoint(raw.landmarks.indexMcp, filters.indexMcp, frameAtMs),
    indexTip: filterPoint(raw.landmarks.indexTip, filters.indexTip, frameAtMs),
    middleTip: filterPoint(raw.landmarks.middleTip, filters.middleTip, frameAtMs),
    ringTip: filterPoint(raw.landmarks.ringTip, filters.ringTip, frameAtMs),
    pinkyTip: filterPoint(raw.landmarks.pinkyTip, filters.pinkyTip, frameAtMs)
  }
});

const toPoint3D = (landmark: LandmarkLike | undefined): Point3D | undefined =>
  landmark ? { x: landmark.x, y: landmark.y, z: landmark.z } : undefined;

const toHandFrame = (
  result: HandLandmarkerResultLike,
  sourceSize: { width: number; height: number }
): HandFrame | undefined => {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return undefined;
  }

  const wrist = toPoint3D(landmarks[HAND_LANDMARK_INDEX.wrist]);
  const thumbIp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbIp]);
  const thumbTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbTip]);
  const indexMcp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexMcp]);
  const indexTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexTip]);
  const middleTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.middleTip]);
  const ringTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.ringTip]);
  const pinkyTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.pinkyTip]);
  const selectedHandedness = result.handedness?.[0];
  const handedness: HandednessCategory[] | undefined =
    selectedHandedness !== undefined && selectedHandedness.length > 0
      ? selectedHandedness
      : undefined;

  if (!wrist || !thumbIp || !thumbTip || !indexMcp || !indexTip || !middleTip || !ringTip || !pinkyTip) {
    return undefined;
  }

  return {
    width: sourceSize.width,
    height: sourceSize.height,
    ...(handedness ? { handedness } : {}),
    landmarks: { wrist, thumbIp, thumbTip, indexMcp, indexTip, middleTip, ringTip, pinkyTip }
  };
};

// MediaPipe's WASM runtime is fetched from jsDelivr instead of vendored.
// Vendoring would add ~33 MB of binaries to the repo; the CDN is pinned to the
// same @mediapipe/tasks-vision version declared in package.json.
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

export const createMediaPipeHandTracker = async (
  options: MediaPipeHandTrackerOptions
): Promise<MediaPipeHandTracker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
    numHands: 1,
    runningMode: "VIDEO"
  });

  const filters = createLandmarkFilters(options.getFilterConfig);

  return {
    detect(bitmap: ImageBitmap, frameAtMs: number): Promise<HandFrame | undefined> {
      const result = handLandmarker.detectForVideo(bitmap, frameAtMs);
      const raw = toHandFrame(result, {
        width: bitmap.width,
        height: bitmap.height
      });

      if (!raw) {
        resetLandmarkFilters(filters);
        return Promise.resolve(undefined);
      }

      const filtered = filterHandFrame(raw, filters, frameAtMs);

      options.onLandmarkTrace({
        frameAtMs,
        rawIndexTip: raw.landmarks.indexTip,
        filteredIndexTip: filtered.landmarks.indexTip
      });

      return Promise.resolve(filtered);
    }
  };
};
```

- [ ] **Step 4.4: Run the hand-tracking suite**

Run:
```bash
npx vitest run tests/unit/features/hand-tracking/
```
Expected: all four test files green.

- [ ] **Step 4.5: Commit**

```bash
git add src/features/hand-tracking/createMediaPipeHandTracker.ts tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
git commit -m "feat(hand-tracking): filter landmarks with 1euro at perception seam"
```

---

## Task 5: Debug panel — filter sliders and raw/filtered jitter outputs (TDD)

**Why:** Issue #35 requires live tunability (`minCutoff`, `beta` sliders) and raw-vs-filtered jitter readouts. We extend `DebugValues` with two new filter keys and `DebugTelemetry` with two new jitter scalars. Everything rides on the existing `DEBUG_KEYS` / `DEBUG_OUTPUT_META` infrastructure so the diff stays small. `dCutoff` is intentionally left out of the panel; it remains a constant in `gameConfig`.

**LoC estimate:** ~35 production LoC, ~55 test LoC.

**Files:**
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`

### Design details

- Extend `DebugValues` with `handFilterMinCutoff: number` and `handFilterBeta: number`.
- Extend `DebugTelemetry` with `rawIndexJitter: number` and `filterIndexJitter: number`.
- Extend `DEBUG_KEYS` + `DEBUG_META` to cover the two new sliders. No cross-field normalization.
- Extend `DEBUG_OUTPUT_META` with `rawIndexJitter` and `filterIndexJitter` rows. Formatter reuses `formatConfidence`.
- Meta ranges:
  - `handFilterMinCutoff`: `min=0.1`, `max=5.0`, `step=0.1`.
  - `handFilterBeta`: `min=0.0`, `max=0.05`, `step=0.001`.

### Steps

- [ ] **Step 5.1: Write failing tests**

In `tests/unit/features/debug/createDebugPanel.test.ts`:

Replace the existing `sampleInitial` constant at lines 10-14 with:

```ts
const sampleInitial: DebugValues = {
  smoothingAlpha: 0.28,
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1,
  handFilterMinCutoff: 1.0,
  handFilterBeta: 0
};
```

Replace the existing `sampleTelemetry` constant at lines 49-58 with:

```ts
const sampleTelemetry: DebugTelemetry = {
  phase: "armed",
  rejectReason: "waiting_for_stable_pulled",
  triggerConfidence: 0.67,
  gunPoseConfidence: 0.91,
  openFrames: 0,
  pulledFrames: 1,
  trackingPresentFrames: 4,
  nonGunPoseFrames: 0,
  rawIndexJitter: 0.12,
  filterIndexJitter: 0.03
};
```

Append the following specs inside the `describe("createDebugPanel", …)` block, just before its closing `});`:

```ts
  it("renders sliders for the hand-filter keys with their meta bounds", () => {
    const panel = createDebugPanel(sampleInitial);

    const html = panel.render();

    expect(html).toContain('data-debug="handFilterMinCutoff"');
    expect(html).toContain('data-debug="handFilterBeta"');
    expect(html).toContain('min="0.1"');
    expect(html).toContain('max="5"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="0.05"');
    expect(html).toContain('step="0.001"');
  });

  it("updates hand-filter values when bound inputs fire", () => {
    const panel = createDebugPanel(sampleInitial);
    const minCutoff = createFakeInput("handFilterMinCutoff", "1");
    const beta = createFakeInput("handFilterBeta", "0");

    panel.bind([minCutoff, beta]);

    minCutoff.value = "2.5";
    minCutoff.fireInput();
    beta.value = "0.03";
    beta.fireInput();

    expect(panel.values.handFilterMinCutoff).toBeCloseTo(2.5);
    expect(panel.values.handFilterBeta).toBeCloseTo(0.03);
  });

  it("clamps hand-filter values to their slider bounds", () => {
    const panel = createDebugPanel(sampleInitial);
    const minCutoff = createFakeInput("handFilterMinCutoff", "1");
    const beta = createFakeInput("handFilterBeta", "0");

    panel.bind([minCutoff, beta]);

    minCutoff.value = "99";
    minCutoff.fireInput();
    expect(panel.values.handFilterMinCutoff).toBeCloseTo(5);

    minCutoff.value = "0.001";
    minCutoff.fireInput();
    expect(panel.values.handFilterMinCutoff).toBeCloseTo(0.1);

    beta.value = "1";
    beta.fireInput();
    expect(panel.values.handFilterBeta).toBeCloseTo(0.05);

    beta.value = "-1";
    beta.fireInput();
    expect(panel.values.handFilterBeta).toBeCloseTo(0);
  });

  it("clamps hand-filter initial values so untrusted config cannot render outside bounds", () => {
    const panel = createDebugPanel({
      smoothingAlpha: 0.28,
      triggerPullThreshold: 0.18,
      triggerReleaseThreshold: 0.1,
      handFilterMinCutoff: 20,
      handFilterBeta: -5
    });

    expect(panel.values.handFilterMinCutoff).toBeCloseTo(5);
    expect(panel.values.handFilterBeta).toBeCloseTo(0);
  });

  it("renders raw and filtered index-tip jitter telemetry into bound outputs", () => {
    const panel = createDebugPanel(sampleInitial);
    const rawJitterOutput = createFakeOutput("rawIndexJitter");
    const filterJitterOutput = createFakeOutput("filterIndexJitter");

    panel.bind([], [rawJitterOutput, filterJitterOutput]);
    panel.setTelemetry(sampleTelemetry);

    expect(rawJitterOutput.textContent).toBe("0.12");
    expect(filterJitterOutput.textContent).toBe("0.03");
  });
```

- [ ] **Step 5.2: Run the debug panel tests and confirm failure**

Run:
```bash
npx vitest run tests/unit/features/debug/createDebugPanel.test.ts
```
Expected: compile errors (missing `DebugValues` / `DebugTelemetry` fields) plus failing specs.

- [ ] **Step 5.3: Extend `createDebugPanel.ts`**

Apply these edits to `src/features/debug/createDebugPanel.ts`:

Extend `DebugValues` at lines 1-5:

```ts
export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
  handFilterMinCutoff: number;
  handFilterBeta: number;
}
```

Extend `DebugTelemetry` at lines 19-28:

```ts
export interface DebugTelemetry {
  phase: string;
  rejectReason: string;
  triggerConfidence: number;
  gunPoseConfidence: number;
  openFrames: number;
  pulledFrames: number;
  trackingPresentFrames: number;
  nonGunPoseFrames: number;
  rawIndexJitter: number;
  filterIndexJitter: number;
}
```

Extend `DebugOutputKey` at line 47:

```ts
type DebugOutputKey =
  | "phase"
  | "rejectReason"
  | "trigger"
  | "gunPose"
  | "counters"
  | "rawIndexJitter"
  | "filterIndexJitter";
```

Extend `DEBUG_KEYS` at lines 51-55:

```ts
const DEBUG_KEYS = [
  "smoothingAlpha",
  "triggerPullThreshold",
  "triggerReleaseThreshold",
  "handFilterMinCutoff",
  "handFilterBeta"
] as const satisfies readonly (keyof DebugValues)[];
```

Extend `DEBUG_META` at lines 59-63:

```ts
const DEBUG_META: Record<keyof DebugValues, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  triggerPullThreshold: { label: "Pull", min: 0.05, max: 0.4, step: 0.01 },
  triggerReleaseThreshold: { label: "Release", min: 0.02, max: 0.25, step: 0.01 },
  handFilterMinCutoff: { label: "MinCutoff", min: 0.1, max: 5.0, step: 0.1 },
  handFilterBeta: { label: "Beta", min: 0.0, max: 0.05, step: 0.001 }
};
```

Extend `DEBUG_OUTPUT_META` at lines 65-71:

```ts
const DEBUG_OUTPUT_META: Record<DebugOutputKey, string> = {
  phase: "Phase",
  rejectReason: "Reject",
  trigger: "Trigger",
  gunPose: "Pose",
  counters: "Counts",
  rawIndexJitter: "RawJtr",
  filterIndexJitter: "FiltJtr"
};
```

Replace the `formatTelemetryOutput` switch body at lines 106-117 with:

```ts
  switch (key) {
    case "phase":
      return telemetry.phase;
    case "rejectReason":
      return telemetry.rejectReason;
    case "trigger":
      return formatConfidence(telemetry.triggerConfidence);
    case "gunPose":
      return formatConfidence(telemetry.gunPoseConfidence);
    case "counters":
      return `open=${String(telemetry.openFrames)} pull=${String(telemetry.pulledFrames)} track=${String(telemetry.trackingPresentFrames)} pose=${String(telemetry.nonGunPoseFrames)}`;
    case "rawIndexJitter":
      return formatConfidence(telemetry.rawIndexJitter);
    case "filterIndexJitter":
      return formatConfidence(telemetry.filterIndexJitter);
  }
```

Extend the initial-value normalization inside `createDebugPanel` at lines 139-146:

```ts
export const createDebugPanel = (initial: DebugValues): DebugPanel => {
  const values: DebugValues = {
    smoothingAlpha: clampToMeta("smoothingAlpha", initial.smoothingAlpha),
    handFilterMinCutoff: clampToMeta("handFilterMinCutoff", initial.handFilterMinCutoff),
    handFilterBeta: clampToMeta("handFilterBeta", initial.handFilterBeta),
    ...normalizeTriggerThresholds(
      initial.triggerPullThreshold,
      initial.triggerReleaseThreshold
    )
  };
```

No other logic in the file needs to change.

- [ ] **Step 5.4: Run the debug panel tests**

Run:
```bash
npx vitest run tests/unit/features/debug/createDebugPanel.test.ts
```
Expected: all specs pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/features/debug/createDebugPanel.ts tests/unit/features/debug/createDebugPanel.test.ts
git commit -m "feat(debug): expose 1euro sliders and raw/filtered jitter readouts"
```

---

## Task 6: Wire `startApp` — live config closure + jitter telemetry (TDD)

**Why:** Now we bind the new plumbing: `startApp` must build a `getFilterConfig` closure that reads `debugPanel.values` every frame, plus two `LandmarkJitterTracker` instances that consume raw-vs-filtered traces and feed them into `debugPanel.setTelemetry`. This is the final wiring that converts the new primitives into a running feature.

**LoC estimate:** ~35 production LoC, ~60 test LoC.

**Files:**
- Modify: `src/app/bootstrap/startApp.ts`
- Modify: `tests/unit/app/bootstrap/startApp.test.ts`

### Design details

- `createDefaultDebugValues` gains the two new filter keys from `gameConfig`.
- `getFilterConfig` closure returns an `OneEuroFilterConfig` composed from `debugPanel.values` (`minCutoff`, `beta`) and `gameConfig.input.handFilterDCutoff` (constant).
- Two `LandmarkJitterTracker` instances with a 30-sample window are instantiated next to `debugPanel`. The `onLandmarkTrace` callback pushes `raw.x/y` into one and `filtered.x/y` into the other.
- `toDebugTelemetry` is extended to include jitter peeks every call.
- On tracking loss (`phase === "tracking_lost"` path), camera failure, start, and retry, both jitter trackers are reset alongside telemetry.
- `createHandTracker` is invoked with `{ getFilterConfig, onLandmarkTrace }` (both required). `StartAppDebugHooks.createHandTracker` signature widens to accept `MediaPipeHandTrackerOptions`.

### Steps

- [ ] **Step 6.1: Extend the startApp test mocks and add a new spec**

In `tests/unit/app/bootstrap/startApp.test.ts`:

Extend the `inputConfig` literal inside the `vi.hoisted` block at lines 22-26:

```ts
  const inputConfig = {
    smoothingAlpha: 0.28,
    triggerPullThreshold: 0.45,
    triggerReleaseThreshold: 0.25,
    handFilterMinCutoff: 1.0,
    handFilterBeta: 0,
    handFilterDCutoff: 1.0
  };
```

(`debugPanelInstance.values: { ...inputConfig }` picks up the new keys automatically through the spread.)

Append the following spec inside the existing `describe("startApp", …)` block, just before its closing `});`:

```ts
  it("passes a live 1euro config closure and jitter trace sink to the tracker", async () => {
    mockAudioAndCameraControllers(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [{ kind: "video" } as MediaStreamTrack]
      } as unknown as MediaStream)
    );

    const scriptedFrames = createScriptedHandFrames();
    const scriptedTracker: ScriptedHandTracker = {
      detect: vi.fn(() => Promise.resolve(scriptedFrames.shift()))
    };
    let capturedOptions:
      | {
          getFilterConfig: () => {
            minCutoff: number;
            beta: number;
            dCutoff: number;
          };
          onLandmarkTrace: (trace: {
            frameAtMs: number;
            rawIndexTip: { x: number; y: number; z: number };
            filteredIndexTip: { x: number; y: number; z: number };
          }) => void;
        }
      | undefined;
    createMediaPipeHandTrackerMock.mockImplementation((options) => {
      capturedOptions = options;
      return Promise.resolve(scriptedTracker);
    });

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    expect(createMediaPipeHandTrackerMock).toHaveBeenCalledTimes(1);
    expect(typeof capturedOptions?.getFilterConfig).toBe("function");
    expect(typeof capturedOptions?.onLandmarkTrace).toBe("function");

    debugPanelInstance.values.handFilterMinCutoff = 3.0;
    debugPanelInstance.values.handFilterBeta = 0.04;

    expect(capturedOptions?.getFilterConfig()).toEqual({
      minCutoff: 3.0,
      beta: 0.04,
      dCutoff: 1.0
    });

    // Feed a raw-vs-filtered step change through the sink so the jitter
    // trackers register a non-zero spread.
    capturedOptions?.onLandmarkTrace({
      frameAtMs: 0,
      rawIndexTip: { x: 0.1, y: 0.2, z: 0 },
      filteredIndexTip: { x: 0.1, y: 0.2, z: 0 }
    });
    capturedOptions?.onLandmarkTrace({
      frameAtMs: 33,
      rawIndexTip: { x: 0.5, y: 0.2, z: 0 },
      filteredIndexTip: { x: 0.15, y: 0.2, z: 0 }
    });

    // Drive one tracking frame through the real processTrackingFrame loop so
    // setTelemetry is called with the computed jitter values.
    await runNextAnimationFrame(16);
    await runNextAnimationFrame(33);

    const lastTelemetry = telemetryCalls.at(-1);
    expect(lastTelemetry?.rawIndexJitter).toBeGreaterThan(
      lastTelemetry?.filterIndexJitter ?? Number.POSITIVE_INFINITY
    );
  });
```

- [ ] **Step 6.2: Run the startApp test file and confirm failure**

Run:
```bash
npx vitest run tests/unit/app/bootstrap/startApp.test.ts
```
Expected: new spec fails because `startApp` does not yet pass options or wire the jitter pipeline.

- [ ] **Step 6.3: Extend `startApp.ts`**

Apply these edits to `src/app/bootstrap/startApp.ts`:

Replace the import block at lines 9-14 with:

```ts
import {
  createMediaPipeHandTracker,
  type MediaPipeHandTrackerOptions,
  type LandmarkTrace
} from "../../features/hand-tracking/createMediaPipeHandTracker";
import type { OneEuroFilterConfig } from "../../features/hand-tracking/oneEuroFilter";
import { createLandmarkJitterTracker } from "../../features/hand-tracking/landmarkJitter";
```

Widen `StartAppDebugHooks` at lines 22-24:

```ts
export interface StartAppDebugHooks {
  createHandTracker?: (
    options: MediaPipeHandTrackerOptions
  ) => Promise<HandTrackerLike>;
}
```

Widen `createDefaultDebugValues` at lines 46-50:

```ts
const createDefaultDebugValues = (): DebugValues => ({
  smoothingAlpha: gameConfig.input.smoothingAlpha,
  triggerPullThreshold: gameConfig.input.triggerPullThreshold,
  triggerReleaseThreshold: gameConfig.input.triggerReleaseThreshold,
  handFilterMinCutoff: gameConfig.input.handFilterMinCutoff,
  handFilterBeta: gameConfig.input.handFilterBeta
});
```

Update `toDebugTelemetry` at lines 52-64 to surface jitter readings:

```ts
const toDebugTelemetry = (
  runtime: InputRuntimeState | undefined,
  rawIndexJitter: number,
  filterIndexJitter: number
): DebugTelemetry | undefined =>
  runtime
    ? {
        phase: runtime.phase,
        rejectReason: runtime.rejectReason,
        triggerConfidence: runtime.triggerConfidence,
        gunPoseConfidence: runtime.gunPoseConfidence,
        openFrames: runtime.openFrames,
        pulledFrames: runtime.pulledFrames,
        trackingPresentFrames: runtime.trackingPresentFrames,
        nonGunPoseFrames: runtime.nonGunPoseFrames,
        rawIndexJitter,
        filterIndexJitter
      }
    : undefined;
```

Build the closures and jitter trackers just after `debugPanel.bind(...)` (around line 153):

```ts
  const debugPanel = createDebugPanel(debugValues);
  debugRoot.innerHTML = debugPanel.render();
  debugPanel.bind(
    debugRoot.querySelectorAll<HTMLInputElement>("[data-debug]"),
    debugRoot.querySelectorAll<HTMLElement>("[data-debug-output]")
  );

  const rawJitterTracker = createLandmarkJitterTracker(30);
  const filterJitterTracker = createLandmarkJitterTracker(30);

  const getFilterConfig = (): OneEuroFilterConfig => ({
    minCutoff: debugPanel.values.handFilterMinCutoff,
    beta: debugPanel.values.handFilterBeta,
    dCutoff: gameConfig.input.handFilterDCutoff
  });

  const handleLandmarkTrace = (trace: LandmarkTrace): void => {
    rawJitterTracker.push(trace.rawIndexTip.x, trace.rawIndexTip.y);
    filterJitterTracker.push(trace.filteredIndexTip.x, trace.filteredIndexTip.y);
  };
```

Update the `debugPanel.setTelemetry` call inside `processTrackingFrame` (around line 302) to pass the jitter peeks:

```ts
        debugPanel.setTelemetry(
          toDebugTelemetry(
            input.runtime,
            rawJitterTracker.peek(),
            filterJitterTracker.peek()
          )
        );
```

At each of the three lifecycle reset sites that call `debugPanel.setTelemetry(undefined)` (`handleCameraFailure`, the `START_CLICKED` branch of `dispatch`, the `RETRY_CLICKED` branch of `dispatch`), add the jitter resets just above the existing call:

```ts
    rawJitterTracker.reset();
    filterJitterTracker.reset();
    debugPanel.setTelemetry(undefined);
```

Update `getTrackerPromise` at lines 216-223 to pass both options:

```ts
  const getTrackerPromise = (): ReturnType<typeof createHandTracker> => {
    trackerPromise ??= createHandTracker({
      getFilterConfig,
      onLandmarkTrace: handleLandmarkTrace
    }).catch((error: unknown) => {
      trackerPromise = undefined;
      throw error;
    });

    return trackerPromise;
  };
```

- [ ] **Step 6.4: Run lint + typecheck + tests**

Run:
```bash
npm run lint && npm run typecheck && npm run test
```
Expected: all green.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/bootstrap/startApp.ts tests/unit/app/bootstrap/startApp.test.ts
git commit -m "feat(bootstrap): wire live 1euro config and jitter telemetry"
```

---

## Task 7: End-to-end verification and live Chrome check

**Why:** Unit tests prove wiring; only a live Chrome run proves the filter restores reliable aim-and-fire. Issue #35's acceptance criteria are all falsifiable — we run them before calling this done.

**Files:** none modified (except the handover append in Step 7.4).

### Steps

- [ ] **Step 7.1: Run the full blocking check battery**

Run:
```bash
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
Expected: all four commands exit 0.

- [ ] **Step 7.2: Start the dev server**

Run (dedicated terminal or background):
```bash
npm run dev
```
Expected: Vite prints a local URL (typically `http://localhost:5173/`).

- [ ] **Step 7.3: Run the live Chrome acceptance test from issue #35**

Open the local URL in Chrome. Grant camera permission. Enter play mode.

1. Hold a loose finger-gun pose still for 5 seconds. Read the debug panel `RawJtr` vs `FiltJtr` readouts.
2. Aim at balloons and attempt **10 intended shots**.
3. Momentarily move the hand out of frame and back to check recovery.
4. Walk the `MinCutoff` slider between 0.1 and 5.0 to confirm live tunability.

Record outcomes against the issue-#35 acceptance list:

- [ ] Debug panel shows `RawJtr > FiltJtr` on a stationary hold.
- [ ] Filtered crosshair peak jitter is visibly lower than the thumb-hammer baseline on `main` pre-change.
- [ ] At least **8 of 10** intended shots actually fire.
- [ ] At most **1** accidental shot.
- [ ] Recovery from a single-frame hand drop completes in under 1 second.
- [ ] No new dependencies (`git diff main -- package.json package-lock.json` is empty).
- [ ] `MinCutoff` and `Beta` sliders visibly affect crosshair behavior during play.

If any check fails, apply the 1€ primary-source tuning sequence:

1. Keep `beta = 0`. Lower `MinCutoff` toward 0.3 until stationary jitter drops noticeably.
2. Raise `MinCutoff` back toward 1.0 if the crosshair feels laggy.
3. Only after (1) and (2), raise `Beta` in `0.001` steps to allow fast motion through without lag.
4. If step (3) still leaves poor fire reliability, document the failure mode in the handover and stop — do not modify `shotIntentStateMachine`.

- [ ] **Step 7.4: Update the handover note with results**

Append a short results block (under 20 lines) to `docs/superpowers/handovers/2026-04-11-firing-stability-investigation-kickoff.md` summarizing: commit SHAs, the `minCutoff` / `beta` values that worked best, raw-vs-filtered jitter numbers, leftover issues, and what the next session should look at (likely the parked state-machine simplification).

- [ ] **Step 7.5: Commit the handover update**

```bash
git add docs/superpowers/handovers/2026-04-11-firing-stability-investigation-kickoff.md
git commit -m "docs(handovers): record OneEuro filter live-test results"
```

- [ ] **Step 7.6: Push the branch and open the PR**

```bash
git push -u origin feat/issue-35-oneeuro-landmark-filter
gh pr create \
  --title "feat(hand-tracking): filter MediaPipe landmarks with 1euro filter" \
  --body "Closes #35. Adds a dependency-free 1€ filter at the perception seam, raw-vs-filtered index-tip jitter telemetry, and live minCutoff/beta sliders. See docs/superpowers/plans/2026-04-11-oneeuro-landmark-filter-implementation.md for the full task breakdown and live-acceptance results."
```

Expected: PR is created as **ready for review**.

---

## Out-of-Scope (explicitly parked)

- Collapsing `shotIntentStateMachine` phases or switching frame-count hysteresis to ms-based timing. Only justified after live traces of the filtered input confirm which gates are now redundant.
- Replacing the thumb-trigger metric with a filtered angle/distance hybrid. Fallback from issue #35, only activates if Task 7 Step 7.3 fails even after tuning.
- Swapping `HandLandmarker` for `GestureRecognizer`. Ruled out in issue #35.
- Multi-hand support or pre-game calibration wizards.
- Permanent telemetry: the `RawJtr` / `FiltJtr` rows are temporary per issue #35 and can be removed in the follow-up.

## Self-Review Notes

Every item in issue #35's acceptance list maps to a concrete verification step in Task 7. Raw-vs-filtered telemetry is covered end-to-end (Task 3 helper, Task 4 tracker emission, Task 5 debug-panel readouts, Task 6 startApp wiring, Task 7 live observation). Beta default is `0` per the 1€ primary source. `gameConfig.test.ts` is updated in lockstep with `gameConfig.ts`. Type names (`OneEuroFilterConfig`, `MediaPipeHandTrackerOptions`, `LandmarkTrace`, `LandmarkJitterTracker`, new `DebugValues` and `DebugTelemetry` keys) are consistent across task boundaries. The OneEuro primitive and jitter helper do not carry guards for invalid inputs because their only caller is an internal tracker wired to MediaPipe output, `requestAnimationFrame` timestamps, and a debug panel that already clamps slider values — guarding here would only hide real bugs at a system boundary that does not exist. `MediaPipeHandTrackerOptions` and its two fields are required (not optional) because `startApp` is the sole caller; there is no backward-compatible second path to maintain.

## Estimated production LoC delta

| File | Delta |
|---|---|
| `oneEuroFilter.ts` (new) | +40 |
| `landmarkJitter.ts` (new) | +28 |
| `createMediaPipeHandTracker.ts` | +80 |
| `gameConfig.ts` | +7 |
| `createDebugPanel.ts` | +35 |
| `startApp.ts` | +35 |
| **Total production** | **+225** |

Above issue #35's +70/+120 target. The overshoot is (1) the tracker rewrite the issue asks for but does not line-budget, and (2) the raw-vs-filtered telemetry pipeline that the same issue demands in its acceptance criteria. No code was added that is not traceable to an issue requirement.
