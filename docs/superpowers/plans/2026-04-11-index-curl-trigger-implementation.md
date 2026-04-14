# Index Curl Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable thumb-pull trigger with a 3-state index-finger curl model and crosshair snap-lock so children can dependably point and fire.

**Architecture:** A new pure measurement function `measureIndexCurl` returns a 3-value `rawCurlState` (`extended` / `partial` / `curled`) based on `distance(indexTip, indexMcp) / handScale` with hysteresis. The state machine extends to recognise `armed → fired` on `curled` confirmation and emits a `crosshairLockAction` intent. `mapHandToGameInput` orchestrates the per-frame sequence: build evidence → conditionally update `lastExtendedCrosshair` → call state machine → apply lock action with an `undefined` guard → resolve final crosshair. Gun-pose responsibility narrows to "other 3 fingers folded" so curl no longer collides with the construct.

**Tech Stack:** TypeScript (strict), Vitest unit tests, MediaPipe `@mediapipe/tasks-vision@0.10.34` HandLandmarker, Vite dev server.

**Reference spec:** `docs/superpowers/specs/2026-04-11-index-curl-trigger-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/features/input-mapping/evaluateIndexCurl.ts` | Pure 3-state curl measurement with hysteresis. No knowledge of state machine or runtime |
| `tests/unit/features/input-mapping/evaluateIndexCurl.test.ts` | Unit tests for the new measurement |
| `tests/unit/features/input-mapping/indexCurlTestHelper.ts` | Test helper for constructing `HandFrame` fixtures with deterministic curl ratios |
| `tests/unit/features/input-mapping/evaluateGunPose.test.ts` | New focused tests for relaxed gun-pose |

### Modified files

| Path | Responsibility change |
|---|---|
| `src/shared/types/hand.ts` | Add `indexPip`, `indexDip` to `HandFrame.landmarks` |
| `src/features/hand-tracking/createMediaPipeHandTracker.ts` | Extract MediaPipe landmarks 6 and 7 |
| `src/shared/config/gameConfig.ts` | Replace `triggerPullThreshold` / `triggerReleaseThreshold` with `extendedThreshold` / `curledThreshold` / `curlHysteresisGap` / `zAssistWeight` |
| `src/features/input-mapping/evaluateGunPose.ts` | Drop `indexExtended` requirement, only check 3-finger fold |
| `src/features/input-mapping/createHandEvidence.ts` | Replace `measureThumbTrigger` with `measureIndexCurl`. Add `projectedCrosshairCandidate`. Extend `HandEvidenceRuntimeState` with `rawCurlState`, `lastExtendedCrosshair`, `lockedCrosshair` |
| `src/features/input-mapping/shotIntentStateMachine.ts` | Replace `triggerState` / `pulledFrames` / `openFrames` with `curlState` / `curledFrames` / `extendedFrames`. Add `crosshairLockAction` to `ShotIntentResult`. Rewrite phase logic |
| `src/features/input-mapping/mapHandToGameInput.ts` | Implement D4.2 frame order (a)–(f). Apply `crosshairLockAction` with `undefined` guard. Replace exported `TriggerState`/`TriggerTuning` re-exports with curl equivalents |
| `src/features/debug/createDebugPanel.ts` | Replace pull/release sliders with extended/curled/zAssistWeight. Add curl telemetry rows. Implement `extendedThreshold > curledThreshold + curlHysteresisGap` normalization. Add 30-frame ratio min/median/max ring buffer |
| `src/app/bootstrap/startApp.ts` | Pass new `gameConfig.input` keys to `createDebugPanel` |
| `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts` | Rewrite around curl evidence and lock-action assertions |
| `tests/unit/features/input-mapping/mapHandToGameInput.test.ts` | Replace thumb tuning with curl tuning. Add lock-action and runtime-update assertions |
| `tests/unit/features/input-mapping/trackingLoss.test.ts` | Update to expect curl-state reset and `release` lock action on tracking loss |
| `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts` | Extend fixtures to include landmarks 6 and 7 |
| `tests/unit/features/debug/createDebugPanel.test.ts` | Replace slider expectations. Add normalization and ring-buffer tests |
| `tests/unit/app/bootstrap/startApp.test.ts` | Update fake config to use new keys |
| `tests/unit/shared/config/gameConfig.test.ts` | Update snapshot to use new keys |
| `tests/e2e/issue30.acceptance.spec.ts` | Update only if it currently asserts thumb-trigger UI text |

### Deleted files

| Path | Reason |
|---|---|
| `src/features/input-mapping/evaluateThumbTrigger.ts` | Replaced by `evaluateIndexCurl.ts` |
| `tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts` | Replaced |
| `tests/unit/features/input-mapping/thumbTriggerTestHelper.ts` | Replaced by `indexCurlTestHelper.ts` |

---

## Conventions Used in This Plan

- **TDD per task:** write failing test → run to confirm fail → implement → run to confirm pass → commit.
- **One commit per task** unless a task explicitly says otherwise. Use Conventional Commits with a `feat(input-mapping)` / `refactor(input-mapping)` / `test(input-mapping)` prefix.
- **Exact paths and exact commands** are given. Substitute nothing.
- **Vitest single-file invocation:** `pnpm vitest run path/to/file.test.ts` (use `pnpm` because the repo uses pnpm).
- **Full suite:** `pnpm vitest run` for all unit/integration tests.
- **Typecheck:** `pnpm typecheck`. **Lint:** `pnpm lint`.

---

## Task 1: Extend `HandFrame` and MediaPipe adapter with `indexPip` and `indexDip`

**Files:**
- Modify: `src/shared/types/hand.ts`
- Modify: `src/features/hand-tracking/createMediaPipeHandTracker.ts`
- Modify: `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts`

**Why first:** Foundation. Other tasks depend on the new landmarks being present in the type and runtime extraction. Adding optional fields would be wrong — they must be required so the rest of the code can rely on them.

- [ ] **Step 1: Read current adapter test**

Run:
```bash
cat tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
```
Expected: see how landmark fixtures are constructed (an array of 21 entries indexed 0..20). Note that any fixture constructing fewer than 21 landmarks will need padding.

- [ ] **Step 2: Update `tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts` to assert `indexPip` and `indexDip` are extracted**

Add a new test case (or extend existing fixture) that includes distinct `(x,y,z)` values at indices 6 and 7, then asserts:

```typescript
expect(frame.landmarks.indexPip).toEqual({ x: 0.55, y: 0.42, z: -0.01 });
expect(frame.landmarks.indexDip).toEqual({ x: 0.56, y: 0.36, z: -0.02 });
```

If the existing fixture is built as a sparse array, fill all 21 slots with placeholder `{ x: 0, y: 0, z: 0 }` and override 0,3,4,5,6,7,8,12,16,20 with meaningful values.

- [ ] **Step 3: Run the test, expect failure**

Run:
```bash
pnpm vitest run tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
```
Expected: FAIL — `frame.landmarks.indexPip` is `undefined` and the assertion fails.

- [ ] **Step 4: Update the type in `src/shared/types/hand.ts`**

Replace the `landmarks` block:

```typescript
export interface HandFrame {
  width: number;
  height: number;
  handedness?: HandednessCategory[];
  landmarks: {
    wrist: Point3D;
    indexTip: Point3D;
    indexDip: Point3D;
    indexPip: Point3D;
    indexMcp: Point3D;
    thumbTip: Point3D;
    thumbIp: Point3D;
    middleTip: Point3D;
    ringTip: Point3D;
    pinkyTip: Point3D;
  };
}
```

- [ ] **Step 5: Extend `HAND_LANDMARK_INDEX` and extraction in `src/features/hand-tracking/createMediaPipeHandTracker.ts`**

Update the constant block (around line 26):

```typescript
const HAND_LANDMARK_INDEX = {
  wrist: 0,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20
} as const;
```

In `toHandFrame`, add the two extractions and include them in the null check and the `landmarks` literal:

```typescript
const indexPip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexPip]);
const indexDip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexDip]);
// ... existing extractions ...

if (
  !wrist || !thumbIp || !thumbTip || !indexMcp || !indexPip || !indexDip ||
  !indexTip || !middleTip || !ringTip || !pinkyTip
) {
  return undefined;
}

return {
  width: sourceSize.width,
  height: sourceSize.height,
  ...(handedness ? { handedness } : {}),
  landmarks: {
    wrist,
    thumbIp,
    thumbTip,
    indexMcp,
    indexPip,
    indexDip,
    indexTip,
    middleTip,
    ringTip,
    pinkyTip
  }
};
```

- [ ] **Step 6: Run the test, expect pass**

Run:
```bash
pnpm vitest run tests/unit/features/hand-tracking/createMediaPipeHandTracker.test.ts
```
Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: many failures across the rest of the codebase because tests and helpers construct `HandFrame` literals without `indexPip` / `indexDip`. **Do not fix them in this task.** Note the affected file list — they will be fixed in their respective task.

- [ ] **Step 8: Pad all `HandFrame` literals in the test tree with placeholder `indexPip`/`indexDip`**

Search and patch:
```bash
pnpm vitest run 2>&1 | grep -E "indexPip|indexDip" | head -50
```
For each `HandFrame` literal found, add:
```typescript
indexPip: { x: 0, y: 0, z: 0 },
indexDip: { x: 0, y: 0, z: 0 },
```
The value `(0,0,0)` is fine here — these tests don't exercise curl or PIP/DIP behaviour. Tests that DO exercise curl will be added in later tasks.

Do the same for any test helper (e.g. `thumbTriggerTestHelper.ts` if still present at this point). Production code does not construct `HandFrame` literals — it only consumes them — so no production patching is needed beyond Step 5.

- [ ] **Step 9: Run typecheck and full test suite**

Run:
```bash
pnpm typecheck && pnpm vitest run
```
Expected: green. Any persistent failure means a `HandFrame` literal was missed — search for it and add the placeholder fields.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types/hand.ts src/features/hand-tracking/createMediaPipeHandTracker.ts tests/
git commit -m "feat(hand-tracking): expose indexPip and indexDip landmarks"
```

---

## Task 2: Replace `gameConfig.input` thresholds (cutover)

**Files:**
- Modify: `src/shared/config/gameConfig.ts`
- Modify: `tests/unit/shared/config/gameConfig.test.ts`

**Why second:** Many later tasks reference the new config keys. Doing this early surfaces any consumer that needs an update. We use a single-shot replacement (no temporary coexistence) because the rest of the pipeline will be updated in later tasks within the same plan.

- [ ] **Step 1: Update `tests/unit/shared/config/gameConfig.test.ts`**

Replace the `input` snapshot expectation with:

```typescript
expect(gameConfig.input).toEqual({
  smoothingAlpha: 0.28,
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  curlHysteresisGap: 0.05,
  zAssistWeight: 0
});
```

- [ ] **Step 2: Run the test, expect failure**

Run:
```bash
pnpm vitest run tests/unit/shared/config/gameConfig.test.ts
```
Expected: FAIL — current snapshot has trigger keys.

- [ ] **Step 3: Replace `src/shared/config/gameConfig.ts`**

Overwrite with:

```typescript
export const CAMERA_WIDTH = 640;
export const CAMERA_HEIGHT = 480;
export const INPUT_SMOOTHING_ALPHA = 0.28;
export const INPUT_EXTENDED_THRESHOLD = 1.15;
export const INPUT_CURLED_THRESHOLD = 0.65;
export const INPUT_CURL_HYSTERESIS_GAP = 0.05;
export const INPUT_Z_ASSIST_WEIGHT = 0;

export const gameConfig = {
  camera: {
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT
  },
  input: {
    smoothingAlpha: INPUT_SMOOTHING_ALPHA,
    extendedThreshold: INPUT_EXTENDED_THRESHOLD,
    curledThreshold: INPUT_CURLED_THRESHOLD,
    curlHysteresisGap: INPUT_CURL_HYSTERESIS_GAP,
    zAssistWeight: INPUT_Z_ASSIST_WEIGHT
  }
} as const;
```

- [ ] **Step 4: Run the gameConfig test, expect pass**

Run:
```bash
pnpm vitest run tests/unit/shared/config/gameConfig.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: failures at every consumer of the old keys (`evaluateThumbTrigger.ts`, `createDebugPanel.ts`, `startApp.ts`, several tests). **Do not fix them in this task.** They will be fixed in subsequent tasks.

- [ ] **Step 6: Commit despite typecheck failure (prep commit)**

The typecheck failures are intentional dead code that subsequent tasks remove. Commit with a clear message:

```bash
git add src/shared/config/gameConfig.ts tests/unit/shared/config/gameConfig.test.ts
git commit -m "refactor(config): replace thumb trigger thresholds with index curl thresholds"
```

> NOTE: This commit is the only one in the plan that intentionally leaves typecheck broken. The next 2 tasks (evaluateIndexCurl, evaluateGunPose) compile cleanly on their own; the global cutover happens in Task 5. If this leaves you uncomfortable, you may rename `gameConfig.ts` keys later in Task 5 instead — but that requires hand-editing the same file twice. The author chose this ordering for clarity of intent.

---

## Task 3: Create `evaluateIndexCurl` module (TDD)

**Files:**
- Create: `src/features/input-mapping/evaluateIndexCurl.ts`
- Create: `tests/unit/features/input-mapping/indexCurlTestHelper.ts`
- Create: `tests/unit/features/input-mapping/evaluateIndexCurl.test.ts`

- [ ] **Step 1: Create the test helper `tests/unit/features/input-mapping/indexCurlTestHelper.ts`**

```typescript
import type { HandFrame } from "../../../../src/shared/types/hand";

export interface IndexCurlFrameOptions {
  /** distance(indexTip, indexMcp) / handScale value to bake into the frame */
  ratio: number;
  /** handScale = hypot(indexMcp - wrist). Default 1 (unit scale) */
  handScale?: number;
  /** zDelta = indexTip.z - indexMcp.z baked into the frame */
  zDelta?: number;
  /** Mirror the frame horizontally (simulate the other hand) */
  mirror?: boolean;
}

const ZERO = { x: 0, y: 0, z: 0 } as const;

/**
 * Constructs a deterministic HandFrame whose
 * `distance(indexTip, indexMcp) / hypot(indexMcp - wrist)` equals `ratio`.
 *
 * The wrist is at (0.5, 0.9), the indexMcp is `handScale` units above it,
 * and the indexTip is `ratio * handScale` units further in the same direction.
 * Other landmarks are placed at the wrist by default — overrides can be added
 * in tests that need different gun-pose conditions.
 */
export const createIndexCurlFrame = ({
  ratio,
  handScale = 0.2,
  zDelta = 0,
  mirror = false
}: IndexCurlFrameOptions): HandFrame => {
  const wrist = { x: 0.5, y: 0.9, z: 0 };
  const indexMcp = { x: wrist.x, y: wrist.y - handScale, z: 0 };
  const indexTip = { x: indexMcp.x, y: indexMcp.y - ratio * handScale, z: zDelta };

  const frame: HandFrame = {
    width: 640,
    height: 480,
    landmarks: {
      wrist,
      indexMcp,
      indexPip: { x: indexMcp.x, y: indexMcp.y - 0.33 * handScale, z: 0 },
      indexDip: { x: indexMcp.x, y: indexMcp.y - 0.66 * handScale, z: 0 },
      indexTip,
      thumbIp: { x: wrist.x - 0.05, y: wrist.y - 0.05, z: 0 },
      thumbTip: { x: wrist.x - 0.08, y: wrist.y - 0.08, z: 0 },
      middleTip: { x: wrist.x + 0.02, y: wrist.y, z: 0 },
      ringTip: { x: wrist.x + 0.04, y: wrist.y, z: 0 },
      pinkyTip: { x: wrist.x + 0.06, y: wrist.y, z: 0 }
    }
  };

  if (!mirror) {
    return frame;
  }

  const mirrored = (point: { x: number; y: number; z: number }) => ({
    x: 1 - point.x,
    y: point.y,
    z: point.z
  });

  return {
    ...frame,
    landmarks: {
      wrist: mirrored(frame.landmarks.wrist),
      indexMcp: mirrored(frame.landmarks.indexMcp),
      indexPip: mirrored(frame.landmarks.indexPip),
      indexDip: mirrored(frame.landmarks.indexDip),
      indexTip: mirrored(frame.landmarks.indexTip),
      thumbIp: mirrored(frame.landmarks.thumbIp),
      thumbTip: mirrored(frame.landmarks.thumbTip),
      middleTip: mirrored(frame.landmarks.middleTip),
      ringTip: mirrored(frame.landmarks.ringTip),
      pinkyTip: mirrored(frame.landmarks.pinkyTip)
    }
  };
};
```

- [ ] **Step 2: Create `tests/unit/features/input-mapping/evaluateIndexCurl.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  measureIndexCurl,
  type IndexCurlState,
  type IndexCurlTuning
} from "../../../../src/features/input-mapping/evaluateIndexCurl";
import { createIndexCurlFrame } from "./indexCurlTestHelper";

const tuning: IndexCurlTuning = {
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  curlHysteresisGap: 0.05,
  zAssistWeight: 0
};

const measure = (
  ratio: number,
  previous: IndexCurlState | undefined,
  options: { zDelta?: number; mirror?: boolean; handScale?: number } = {}
) => measureIndexCurl(createIndexCurlFrame({ ratio, ...options }), previous, tuning);

describe("measureIndexCurl", () => {
  it("returns 'extended' when ratio is well above the extended threshold", () => {
    expect(measure(1.4, undefined).rawCurlState).toBe("extended");
  });

  it("returns 'curled' when ratio is well below the curled threshold", () => {
    expect(measure(0.45, undefined).rawCurlState).toBe("curled");
  });

  it("returns 'partial' when ratio sits between thresholds", () => {
    expect(measure(0.9, undefined).rawCurlState).toBe("partial");
  });

  it("does not flicker on a single noisy frame inside the hysteresis gap (extended → partial)", () => {
    // Once classified extended, a frame at ratio 1.18 (just below 1.15 + 0.05 = 1.20) should still be extended.
    expect(measure(1.18, "extended").rawCurlState).toBe("extended");
  });

  it("does not flicker on a single noisy frame inside the hysteresis gap (partial → curled)", () => {
    // Once classified curled, a frame at ratio 0.68 (just above 0.65 + 0.05 = 0.70 - epsilon) should still be curled.
    expect(measure(0.68, "curled").rawCurlState).toBe("curled");
  });

  it("transitions extended → partial when ratio drops past the extended threshold", () => {
    expect(measure(1.10, "extended").rawCurlState).toBe("partial");
  });

  it("transitions partial → curled when ratio drops past the curled threshold", () => {
    expect(measure(0.55, "partial").rawCurlState).toBe("curled");
  });

  it("transitions curled → partial when ratio rises past curled + hysteresis", () => {
    expect(measure(0.75, "curled").rawCurlState).toBe("partial");
  });

  it("transitions partial → extended when ratio rises past extended + hysteresis", () => {
    expect(measure(1.25, "partial").rawCurlState).toBe("extended");
  });

  it("normalises by handScale so the same ratio gives the same state across hand sizes", () => {
    expect(measure(0.55, undefined, { handScale: 0.1 }).rawCurlState).toBe("curled");
    expect(measure(0.55, undefined, { handScale: 0.3 }).rawCurlState).toBe("curled");
  });

  it("returns the same state for mirrored (left-hand) frames", () => {
    expect(measure(0.55, undefined, { mirror: true }).rawCurlState).toBe("curled");
    expect(measure(1.4, undefined, { mirror: true }).rawCurlState).toBe("extended");
  });

  it("reports the raw distance ratio in `details.ratio`", () => {
    const result = measure(0.9, undefined);
    expect(result.details.ratio).toBeCloseTo(0.9, 5);
  });

  it("reports zDelta = indexTip.z - indexMcp.z", () => {
    const result = measure(0.9, undefined, { zDelta: -0.05 });
    expect(result.details.zDelta).toBeCloseTo(-0.05, 5);
  });

  it("does not feed zDelta into curl confidence when zAssistWeight is 0", () => {
    const withoutZ = measure(0.9, undefined, { zDelta: 0 });
    const withZ = measure(0.9, undefined, { zDelta: -0.5 });
    expect(withZ.confidence).toBeCloseTo(withoutZ.confidence, 5);
  });

  it("safely returns the previous state when handScale is zero", () => {
    // wrist and indexMcp coincide
    const frame = createIndexCurlFrame({ ratio: 0.9, handScale: 0 });
    const result = measureIndexCurl(frame, "extended", tuning);
    expect(result.rawCurlState).toBe("extended");
  });
});
```

- [ ] **Step 3: Run the test, expect failure**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/evaluateIndexCurl.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `src/features/input-mapping/evaluateIndexCurl.ts`**

```typescript
import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";

export type IndexCurlState = "extended" | "partial" | "curled";

export interface IndexCurlTuning {
  extendedThreshold: number;
  curledThreshold: number;
  curlHysteresisGap: number;
  zAssistWeight: number;
}

export interface IndexCurlMeasurement {
  rawCurlState: IndexCurlState;
  confidence: number;
  details: {
    ratio: number;
    zDelta: number;
    extendedThreshold: number;
    curledThreshold: number;
    curlHysteresisGap: number;
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeTuning = (tuning: IndexCurlTuning): IndexCurlTuning => {
  const extendedThreshold = Number.isFinite(tuning.extendedThreshold)
    ? tuning.extendedThreshold
    : gameConfig.input.extendedThreshold;
  const curledThreshold = Number.isFinite(tuning.curledThreshold)
    ? tuning.curledThreshold
    : gameConfig.input.curledThreshold;
  const curlHysteresisGap = Number.isFinite(tuning.curlHysteresisGap)
    ? tuning.curlHysteresisGap
    : gameConfig.input.curlHysteresisGap;
  const zAssistWeight = Number.isFinite(tuning.zAssistWeight)
    ? tuning.zAssistWeight
    : gameConfig.input.zAssistWeight;

  // Enforce extended > curled + gap (defensive; debug panel also enforces this).
  const safeExtended = Math.max(extendedThreshold, curledThreshold + curlHysteresisGap + Number.EPSILON);

  return {
    extendedThreshold: safeExtended,
    curledThreshold,
    curlHysteresisGap,
    zAssistWeight
  };
};

const computeRatio = (frame: HandFrame): number | undefined => {
  const { wrist, indexMcp, indexTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y);
  if (handScale === 0 || !Number.isFinite(handScale)) {
    return undefined;
  }
  const tipToMcp = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);
  return tipToMcp / handScale;
};

const classify = (
  ratio: number,
  previous: IndexCurlState | undefined,
  tuning: IndexCurlTuning
): IndexCurlState => {
  const { extendedThreshold, curledThreshold, curlHysteresisGap } = tuning;
  const extendedReturnGate = extendedThreshold + curlHysteresisGap;
  const curledReturnGate = curledThreshold + curlHysteresisGap;

  switch (previous) {
    case "extended":
      // Stay extended unless we drop strictly below the entry threshold.
      if (ratio < extendedThreshold) {
        return ratio < curledThreshold ? "curled" : "partial";
      }
      return "extended";
    case "curled":
      // Stay curled unless we rise strictly above curled + gap.
      if (ratio > curledReturnGate) {
        return ratio >= extendedReturnGate ? "extended" : "partial";
      }
      return "curled";
    case "partial":
    case undefined:
    default:
      if (ratio >= extendedThreshold) {
        return "extended";
      }
      if (ratio < curledThreshold) {
        return "curled";
      }
      return "partial";
  }
};

const computeConfidence = (
  ratio: number,
  rawCurlState: IndexCurlState,
  tuning: IndexCurlTuning
): number => {
  const { extendedThreshold, curledThreshold } = tuning;
  switch (rawCurlState) {
    case "extended":
      return clamp01((ratio - extendedThreshold) / Math.max(extendedThreshold, Number.EPSILON));
    case "curled":
      return clamp01((curledThreshold - ratio) / Math.max(curledThreshold, Number.EPSILON));
    case "partial":
    default: {
      const distanceFromExtended = Math.abs(ratio - extendedThreshold);
      const distanceFromCurled = Math.abs(ratio - curledThreshold);
      // Confidence in being "partial" is highest at the midpoint of the band.
      const bandWidth = Math.max(extendedThreshold - curledThreshold, Number.EPSILON);
      const closer = Math.min(distanceFromExtended, distanceFromCurled);
      return clamp01(1 - closer / (bandWidth / 2));
    }
  }
};

export const measureIndexCurl = (
  frame: HandFrame,
  previousRawCurlState: IndexCurlState | undefined,
  tuning: IndexCurlTuning = gameConfig.input
): IndexCurlMeasurement => {
  const safeTuning = normalizeTuning(tuning);
  const ratio = computeRatio(frame);

  // Defensive: handScale = 0 (degenerate frame). Hold the previous state.
  if (ratio === undefined) {
    return {
      rawCurlState: previousRawCurlState ?? "partial",
      confidence: 0,
      details: {
        ratio: 0,
        zDelta: 0,
        extendedThreshold: safeTuning.extendedThreshold,
        curledThreshold: safeTuning.curledThreshold,
        curlHysteresisGap: safeTuning.curlHysteresisGap
      }
    };
  }

  const rawCurlState = classify(ratio, previousRawCurlState, safeTuning);
  const confidence = computeConfidence(ratio, rawCurlState, safeTuning);
  const zDelta = frame.landmarks.indexTip.z - frame.landmarks.indexMcp.z;

  return {
    rawCurlState,
    confidence,
    details: {
      ratio,
      zDelta,
      extendedThreshold: safeTuning.extendedThreshold,
      curledThreshold: safeTuning.curledThreshold,
      curlHysteresisGap: safeTuning.curlHysteresisGap
    }
  };
};
```

- [ ] **Step 5: Run the test, expect pass**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/evaluateIndexCurl.test.ts
```
Expected: PASS for all 14 cases.

- [ ] **Step 6: Commit**

```bash
git add src/features/input-mapping/evaluateIndexCurl.ts tests/unit/features/input-mapping/evaluateIndexCurl.test.ts tests/unit/features/input-mapping/indexCurlTestHelper.ts
git commit -m "feat(input-mapping): add evaluateIndexCurl 3-state measurement"
```

---

## Task 4: Relax `evaluateGunPose` to "3 fingers folded only" (TDD)

**Files:**
- Create: `tests/unit/features/input-mapping/evaluateGunPose.test.ts`
- Modify: `src/features/input-mapping/evaluateGunPose.ts`

- [ ] **Step 1: Create `tests/unit/features/input-mapping/evaluateGunPose.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { measureGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import type { HandFrame } from "../../../../src/shared/types/hand";

const baseLandmarks = (): HandFrame["landmarks"] => ({
  wrist: { x: 0.5, y: 0.9, z: 0 },
  indexMcp: { x: 0.5, y: 0.7, z: 0 },
  indexPip: { x: 0.5, y: 0.6, z: 0 },
  indexDip: { x: 0.5, y: 0.5, z: 0 },
  indexTip: { x: 0.5, y: 0.4, z: 0 }, // straight up
  thumbIp: { x: 0.45, y: 0.85, z: 0 },
  thumbTip: { x: 0.42, y: 0.82, z: 0 },
  middleTip: { x: 0.52, y: 0.85, z: 0 }, // folded (below indexMcp + threshold)
  ringTip: { x: 0.54, y: 0.86, z: 0 },
  pinkyTip: { x: 0.56, y: 0.87, z: 0 }
});

const buildFrame = (overrides?: Partial<HandFrame["landmarks"]>): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: { ...baseLandmarks(), ...overrides }
});

describe("measureGunPose", () => {
  it("detects gun-pose when middle, ring, and pinky are folded — regardless of index curl", () => {
    expect(measureGunPose(buildFrame()).detected).toBe(true);
  });

  it("still detects gun-pose when the index finger is bent (curl trigger fired)", () => {
    const bentIndex = buildFrame({
      indexTip: { x: 0.5, y: 0.72, z: 0 } // tip dropped below indexMcp.y
    });
    expect(measureGunPose(bentIndex).detected).toBe(true);
  });

  it("does not detect gun-pose when fewer than 2 of (middle, ring, pinky) are folded", () => {
    const middleExtended = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 } // sticking up
    });
    expect(measureGunPose(middleExtended).detected).toBe(false);
  });

  it("does not regress on the prior smoke fixture: open hand returns false", () => {
    const openHand = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 },
      ringTip: { x: 0.54, y: 0.4, z: 0 },
      pinkyTip: { x: 0.56, y: 0.4, z: 0 }
    });
    expect(measureGunPose(openHand).detected).toBe(false);
  });

  it("reports `details.indexExtended` for backward inspection but does not gate `detected` on it", () => {
    const bent = buildFrame({ indexTip: { x: 0.5, y: 0.72, z: 0 } });
    const result = measureGunPose(bent);
    expect(result.details.indexExtended).toBe(false);
    expect(result.detected).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/evaluateGunPose.test.ts
```
Expected: FAIL — current implementation gates `detected` on `indexExtended`.

- [ ] **Step 3: Update `src/features/input-mapping/evaluateGunPose.ts`**

Replace the file body:

```typescript
import type { HandFrame } from "../../shared/types/hand";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

export interface GunPoseMeasurement {
  detected: boolean;
  confidence: number;
  details: {
    indexExtended: boolean;
    curledFingerCount: number;
    curledThreshold: number;
  };
}

export const measureGunPose = (frame: HandFrame): GunPoseMeasurement => {
  const { wrist, indexTip, indexMcp, middleTip, ringTip, pinkyTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const curledThreshold = handScale * 0.25;
  const indexExtended = indexTip.y < indexMcp.y;
  const curledFingerCount = [middleTip, ringTip, pinkyTip].filter(
    (point) => point.y > indexMcp.y + curledThreshold
  ).length;

  // Gun-pose is now defined ONLY by the other three fingers being folded.
  // Index curl/extension is the curl trigger's responsibility, not gun-pose's.
  const detected = curledFingerCount >= 2;
  const confidence = detected
    ? Math.min(1, 0.5 + curledFingerCount / 6)
    : Math.min(0.5, curledFingerCount / 6);

  return {
    detected,
    confidence: detected ? Math.max(confidence, FIRE_ENTRY_GUN_POSE_CONFIDENCE) : confidence,
    details: {
      indexExtended,
      curledFingerCount,
      curledThreshold
    }
  };
};

export const evaluateGunPose = (frame: HandFrame): boolean => {
  return measureGunPose(frame).detected;
};
```

> The `confidence` floor on `detected = true` keeps the existing `FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55` gating in `shotIntentStateMachine` working without re-tuning. This is a deliberate choice — the state machine still requires `confidence ≥ 0.55` to enter armed.

- [ ] **Step 4: Run the gun-pose test, expect pass**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/evaluateGunPose.test.ts
```
Expected: PASS for all 5 cases.

- [ ] **Step 5: Run the full unit suite to surface incidental regressions**

Run:
```bash
pnpm vitest run
```
Expected: many failures unrelated to gun-pose (config keys, thumb trigger, etc.). The `evaluateGunPose` and `evaluateIndexCurl` tests must be GREEN. If any other test that exercises gun-pose only (no thumb / no debug panel) fails, fix it now.

- [ ] **Step 6: Commit**

```bash
git add src/features/input-mapping/evaluateGunPose.ts tests/unit/features/input-mapping/evaluateGunPose.test.ts
git commit -m "refactor(input-mapping): narrow gun-pose to three-finger fold check"
```

---

## Task 5: Replace state machine fields with curl model and add `crosshairLockAction`

**Files:**
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts`
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`

This task is the largest single edit. It must end with the state machine compiling cleanly on its own AND `shotIntentStateMachine.test.ts` passing. Other call sites (`createHandEvidence`, `mapHandToGameInput`) may temporarily fail to compile until Tasks 6 and 7.

### 5.1 Define the new state and result shapes

- [ ] **Step 1: Read the current `shotIntentStateMachine.ts` end-to-end**

```bash
cat src/features/input-mapping/shotIntentStateMachine.ts | head -100
```
Note: it already has a phase enum (`idle | tracking_lost | ready | armed | fired | recovering`), confirmation-frame counters, and pose-loss handling. We are renaming counters and changing entry/exit conditions, NOT redesigning phases.

- [ ] **Step 2: Update the type imports/exports at the top of `shotIntentStateMachine.ts`**

Replace the `import` of `TriggerState` with:

```typescript
import type { HandEvidence } from "./createHandEvidence";
import type { IndexCurlState } from "./evaluateIndexCurl";
```

Add the new lock-action type next to `ShotIntentRejectReason`:

```typescript
export type CrosshairLockAction = "none" | "freeze" | "release";
```

Update `ShotIntentState`:

```typescript
export interface ShotIntentState {
  phase: ShotIntentPhase;
  rejectReason: ShotIntentRejectReason;
  curlState: IndexCurlState;
  rawCurlState: IndexCurlState;
  curlConfidence: number;
  gunPoseConfidence: number;
  curledFrames: number;
  extendedFrames: number;
  hasSeenStableExtended: boolean;
  gunPoseActive: boolean;
  nonGunPoseFrames: number;
  trackingPresentFrames: number;
}
```

Update `ShotIntentResult`:

```typescript
export interface ShotIntentResult {
  state: ShotIntentState;
  shotFired: boolean;
  crosshairLockAction: CrosshairLockAction;
}
```

Update reject reasons:

```typescript
export type ShotIntentRejectReason =
  | "waiting_for_stable_extended"
  | "waiting_for_fire_entry"
  | "waiting_for_stable_curled"
  | "waiting_for_release"
  | "tracking_lost";
```

### 5.2 Replace counter resolution

- [ ] **Step 3: Replace `resolveTriggerState` with `resolveCurlState`**

```typescript
const resolveCurlState = (
  evidence: HandEvidence,
  previousState: ShotIntentState
): Pick<
  ShotIntentState,
  "curlState" | "rawCurlState" | "curlConfidence" | "curledFrames" | "extendedFrames"
> => {
  const rawCurlState = evidence.curl?.rawCurlState ?? previousState.rawCurlState;
  const curlConfidence = evidence.curl?.confidence ?? 0;
  const curledFrames = rawCurlState === "curled" ? previousState.curledFrames + 1 : 0;
  const extendedFrames = rawCurlState === "extended" ? previousState.extendedFrames + 1 : 0;

  let curlState = previousState.curlState;

  // extended → curled is not allowed without going through partial.
  if (
    previousState.curlState === "extended" &&
    rawCurlState === "partial"
  ) {
    curlState = "partial";
  } else if (
    previousState.curlState === "partial" &&
    rawCurlState === "curled" &&
    curledFrames >= TRIGGER_CONFIRMATION_FRAMES
  ) {
    curlState = "curled";
  } else if (
    previousState.curlState !== "extended" &&
    rawCurlState === "extended" &&
    extendedFrames >= TRIGGER_RELEASE_FRAMES
  ) {
    curlState = "extended";
  }

  return {
    curlState,
    rawCurlState,
    curlConfidence,
    curledFrames,
    extendedFrames
  };
};
```

> Keep the existing constants `TRIGGER_CONFIRMATION_FRAMES = 2` and `TRIGGER_RELEASE_FRAMES = 2`. Their semantics carry over: 2 frames of `curled` to fire, 2 frames of `extended` to release.

### 5.3 Update reject reasons and reset helpers

- [ ] **Step 4: Replace `resolveRejectReason`, `withTrackingLossReset`, `withPoseLossReset`, and `createInitialShotIntentState`**

```typescript
const createInitialShotIntentState = (): ShotIntentState => ({
  phase: "idle",
  rejectReason: "waiting_for_stable_extended",
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence: 0,
  gunPoseConfidence: 0,
  curledFrames: 0,
  extendedFrames: 0,
  hasSeenStableExtended: false,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0
});

const resolveRejectReason = (phase: ShotIntentPhase): ShotIntentRejectReason => {
  switch (phase) {
    case "idle":
      return "waiting_for_stable_extended";
    case "tracking_lost":
      return "tracking_lost";
    case "ready":
      return "waiting_for_fire_entry";
    case "armed":
      return "waiting_for_stable_curled";
    case "fired":
      return "waiting_for_release";
    case "recovering":
      return "waiting_for_release";
  }
};

const withTrackingLossReset = (state: ShotIntentState): ShotIntentState => ({
  ...state,
  phase: "tracking_lost",
  rejectReason: "tracking_lost",
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence: 0,
  gunPoseConfidence: 0,
  curledFrames: 0,
  extendedFrames: 0,
  hasSeenStableExtended: false,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0
});

const withPoseLossReset = (
  state: ShotIntentState,
  trackingPresentFrames: number,
  nonGunPoseFrames: number,
  curlConfidence: number,
  gunPoseConfidence: number
): ShotIntentState => ({
  ...state,
  phase: "idle",
  rejectReason: resolveRejectReason("idle"),
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence,
  gunPoseConfidence,
  curledFrames: 0,
  extendedFrames: 0,
  hasSeenStableExtended: false,
  gunPoseActive: false,
  nonGunPoseFrames,
  trackingPresentFrames
});
```

### 5.4 Replace phase transitions

- [ ] **Step 5: Replace `advanceIdlePhase`, `advanceReadyPhase`, `advanceArmedPhase`, `advanceFiredPhase`, `advanceRecoveringPhase`**

The pattern stays the same — only the trigger predicates change:

```typescript
type CurlStateResolution = ReturnType<typeof resolveCurlState>;
type GunPoseResolution = ReturnType<typeof resolveGunPoseActive>;

const buildTrackedState = (
  stateBefore: ShotIntentState,
  phase: ShotIntentPhase,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  trackingPresentFrames: number
): ShotIntentState => ({
  ...stateBefore,
  phase,
  rejectReason: resolveRejectReason(phase),
  curlState: curl.curlState,
  rawCurlState: curl.rawCurlState,
  curlConfidence: curl.curlConfidence,
  gunPoseConfidence: gunPose.gunPoseConfidence,
  curledFrames: curl.curledFrames,
  extendedFrames: curl.extendedFrames,
  hasSeenStableExtended:
    phase === "ready" || phase === "armed" || phase === "recovering" || stateBefore.hasSeenStableExtended,
  gunPoseActive: gunPose.gunPoseActive,
  nonGunPoseFrames: gunPose.nonGunPoseFrames,
  trackingPresentFrames
});

const advanceIdlePhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "ready" : "idle";
  const nextState = buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames);

  if (phase === "idle") {
    nextState.hasSeenStableExtended = stateBefore.hasSeenStableExtended || (trackingAndPoseReady && stableExtended);
  }

  return {
    state: nextState,
    shotFired: false,
    crosshairLockAction: "none"
  };
};

const advanceReadyPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "armed" : "ready";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired: false,
    crosshairLockAction: "none"
  };
};

const advanceArmedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableCurled = curl.curlState === "curled" && curl.curledFrames >= TRIGGER_CONFIRMATION_FRAMES;
  const shotFired = trackingAndPoseReady && stableCurled;
  const phase: ShotIntentPhase = shotFired ? "fired" : "armed";

  // Spec D4.3: emit "freeze" the first frame the user enters partial from extended,
  // i.e. on a transition while we are armed.
  const enteringPartial =
    stateBefore.curlState === "extended" && curl.rawCurlState === "partial";
  const crosshairLockAction: CrosshairLockAction = enteringPartial ? "freeze" : "none";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired,
    crosshairLockAction
  };
};

const advanceFiredPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => ({
  state: buildTrackedState(stateBefore, "recovering", curl, gunPose, trackingPresentFrames),
  shotFired: false,
  crosshairLockAction: "none"
});

const advanceRecoveringPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "ready" : "recovering";

  // Release the crosshair lock once we have confirmed extended again.
  const crosshairLockAction: CrosshairLockAction =
    phase === "ready" ? "release" : "none";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired: false,
    crosshairLockAction
  };
};
```

### 5.5 Wire up the dispatcher and entry function

- [ ] **Step 6: Update `advanceTrackedPhase` to thread `curl` instead of `triggerState`**

```typescript
const advanceTrackedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  switch (stateBefore.phase) {
    case "idle":
      return advanceIdlePhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "ready":
      return advanceReadyPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "armed":
      return advanceArmedPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "fired":
      return advanceFiredPhase(stateBefore, trackingPresentFrames, curl, gunPose);
    case "recovering":
      return advanceRecoveringPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
  }

  throw new Error(`Unhandled shot intent phase: ${stateBefore.phase}`);
};
```

- [ ] **Step 7: Update `resolveTrackingLostState` to thread the new types**

Same body, but rename the parameter and add `crosshairLockAction: "release"` because tracking loss must release the lock per D4.3:

```typescript
const resolveTrackingLostState = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => {
  if (trackingPresentFrames < TRACKING_RECOVERY_FRAMES) {
    return {
      state: {
        ...stateBefore,
        phase: "tracking_lost",
        rejectReason: "tracking_lost",
        curlState: curl.curlState,
        rawCurlState: curl.rawCurlState,
        curlConfidence: curl.curlConfidence,
        gunPoseConfidence: gunPose.gunPoseConfidence,
        curledFrames: curl.curledFrames,
        extendedFrames: curl.extendedFrames,
        gunPoseActive: gunPose.gunPoseActive,
        nonGunPoseFrames: gunPose.nonGunPoseFrames,
        trackingPresentFrames
      },
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  return {
    state: {
      ...stateBefore,
      phase: "idle",
      rejectReason: resolveRejectReason("idle"),
      curlState: curl.curlState,
      rawCurlState: curl.rawCurlState,
      curlConfidence: curl.curlConfidence,
      gunPoseConfidence: gunPose.gunPoseConfidence,
      curledFrames: curl.curledFrames,
      extendedFrames: curl.extendedFrames,
      hasSeenStableExtended: false,
      gunPoseActive: gunPose.gunPoseActive,
      nonGunPoseFrames: gunPose.nonGunPoseFrames,
      trackingPresentFrames
    },
    shotFired: false,
    crosshairLockAction: "none"
  };
};
```

- [ ] **Step 8: Update `advanceShotIntentState` to use `resolveCurlState` and emit `release` on pose-loss**

```typescript
export const advanceShotIntentState = (
  previousState: ShotIntentState | undefined,
  evidence: HandEvidence
): ShotIntentResult => {
  const stateBefore = previousState ?? createInitialShotIntentState();

  if (!evidence.trackingPresent) {
    return {
      state: withTrackingLossReset(stateBefore),
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  const trackingPresentFrames = stateBefore.trackingPresentFrames + 1;
  const curl = resolveCurlState(evidence, stateBefore);
  const gunPose = resolveGunPoseActive(evidence, stateBefore);
  const gunPoseFireReady = (evidence.gunPose?.confidence ?? 0) >= FIRE_ENTRY_GUN_POSE_CONFIDENCE;
  const poseLost = !gunPose.gunPoseActive && gunPose.nonGunPoseFrames > GUN_POSE_GRACE_FRAMES;

  if (poseLost) {
    return {
      state: withPoseLossReset(
        stateBefore,
        trackingPresentFrames,
        gunPose.nonGunPoseFrames,
        curl.curlConfidence,
        gunPose.gunPoseConfidence
      ),
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  if (stateBefore.phase === "tracking_lost") {
    return resolveTrackingLostState(stateBefore, trackingPresentFrames, curl, gunPose);
  }

  return advanceTrackedPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
};
```

### 5.6 Update the test file

- [ ] **Step 9: Rewrite `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`**

The test file currently builds evidence with `trigger: { rawState, ... }`. We replace that with `curl: { rawCurlState, ... }`. Replace the entire test file with:

```typescript
import { describe, expect, it } from "vitest";
import {
  advanceShotIntentState,
  type ShotIntentResult,
  type ShotIntentState
} from "../../../../src/features/input-mapping/shotIntentStateMachine";
import type { HandEvidence } from "../../../../src/features/input-mapping/createHandEvidence";
import type { IndexCurlState } from "../../../../src/features/input-mapping/evaluateIndexCurl";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

interface EvidenceOptions {
  trackingPresent?: boolean;
  rawCurlState?: IndexCurlState;
  gunPoseConfidence?: number;
}

const createEvidence = ({
  trackingPresent = true,
  rawCurlState = "extended",
  gunPoseConfidence = FIRE_ENTRY_GUN_POSE_CONFIDENCE
}: EvidenceOptions = {}): HandEvidence => ({
  trackingPresent,
  frameAtMs: undefined,
  projectedCrosshairCandidate: trackingPresent ? { x: 0.5, y: 0.5 } : null,
  curl: trackingPresent
    ? {
        rawCurlState,
        confidence: 1,
        details: {
          ratio: rawCurlState === "extended" ? 1.4 : rawCurlState === "curled" ? 0.5 : 0.9,
          zDelta: 0,
          extendedThreshold: 1.15,
          curledThreshold: 0.65,
          curlHysteresisGap: 0.05
        }
      }
    : null,
  gunPose: trackingPresent
    ? {
        detected: gunPoseConfidence >= FIRE_ENTRY_GUN_POSE_CONFIDENCE,
        confidence: gunPoseConfidence,
        details: {
          indexExtended: false,
          curledFingerCount: 3,
          curledThreshold: 0.05
        }
      }
    : null
});

const runSequence = (steps: EvidenceOptions[]): ShotIntentResult[] => {
  const results: ShotIntentResult[] = [];
  let state: ShotIntentState | undefined;

  for (const step of steps) {
    const result = advanceShotIntentState(state, createEvidence(step));
    results.push(result);
    state = result.state;
  }

  return results;
};

describe("ShotIntentStateMachine (curl)", () => {
  it("promotes idle → ready → armed after stable extended frames", () => {
    const [first, second, third] = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }
    ]);
    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("armed");
    expect(third?.crosshairLockAction).toBe("none");
  });

  it("does not fire while extended is held", () => {
    const results = runSequence(Array.from({ length: 10 }, () => ({ rawCurlState: "extended" })));
    expect(results.every((r) => !r.shotFired)).toBe(true);
  });

  it("emits a freeze action on the first armed frame that observes partial", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" }   // expect freeze
    ]);
    const lockActions = results.map((r) => r.crosshairLockAction);
    expect(lockActions[0]).toBe("none");
    expect(lockActions[3]).toBe("freeze");
  });

  it("does not fire on a single curled frame", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },   // 1 curled frame
      { rawCurlState: "partial" }   // backed off
    ]);
    expect(results.some((r) => r.shotFired)).toBe(false);
  });

  it("fires after two consecutive curled frames", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" }    // fire
    ]);
    expect(results[5]?.shotFired).toBe(true);
    expect(results[5]?.state.phase).toBe("fired");
  });

  it("does not fire while only partial is sustained", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      ...Array.from({ length: 30 }, () => ({ rawCurlState: "partial" as const }))
    ]);
    expect(results.some((r) => r.shotFired)).toBe(false);
  });

  it("blocks re-fire until extended is confirmed for two frames, then emits release", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" },   // fired
      { rawCurlState: "extended" }, // recovering, 1 frame extended
      { rawCurlState: "extended" }  // ready, lockAction = release
    ]);
    const releaseActions = results.map((r) => r.crosshairLockAction);
    expect(results[5]?.shotFired).toBe(true);
    expect(results[6]?.state.phase).toBe("recovering");
    expect(results[7]?.state.phase).toBe("ready");
    expect(releaseActions[7]).toBe("release");
  });

  it("does not arm on a cold start that begins in partial or curled", () => {
    const partialFirst = runSequence([
      { rawCurlState: "partial" },
      { rawCurlState: "partial" },
      { rawCurlState: "partial" }
    ]);
    expect(partialFirst.every((r) => r.state.phase !== "armed")).toBe(true);
    expect(partialFirst.every((r) => r.crosshairLockAction !== "freeze")).toBe(true);

    const curledFirst = runSequence([
      { rawCurlState: "curled" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" }
    ]);
    expect(curledFirst.every((r) => r.state.phase !== "armed")).toBe(true);
    expect(curledFirst.every((r) => r.crosshairLockAction !== "freeze")).toBe(true);
  });

  it("emits release when tracking is lost", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { trackingPresent: false }
    ]);
    expect(results[3]?.crosshairLockAction).toBe("release");
    expect(results[3]?.state.phase).toBe("tracking_lost");
  });

  it("emits release when gun-pose is lost (after grace frames)", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { gunPoseConfidence: 0 },
      { gunPoseConfidence: 0 },
      { gunPoseConfidence: 0 }
    ]);
    const releaseEmitted = results.some((r) => r.crosshairLockAction === "release");
    expect(releaseEmitted).toBe(true);
  });
});
```

- [ ] **Step 10: Run the rewritten test, expect failure on first run if compilation breaks elsewhere**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/shotIntentStateMachine.test.ts
```
Expected: PASS for the state-machine test by itself. If the run fails because of TypeScript errors in `createHandEvidence.ts` or `mapHandToGameInput.ts`, those are intentional and will be fixed in Tasks 6 and 7. If you want to scope the typecheck, run vitest with `--no-isolate` or temporarily comment those import errors out — but the test file itself should compile because it does not import those broken modules.

> **If vitest cannot run because the dependency graph is broken**, jump straight to Task 6 and Task 7, then return here to confirm the state-machine tests pass.

- [ ] **Step 11: Commit (state machine internals done)**

```bash
git add src/features/input-mapping/shotIntentStateMachine.ts tests/unit/features/input-mapping/shotIntentStateMachine.test.ts
git commit -m "feat(input-mapping): switch shot intent state machine to curl model"
```

---

## Task 6: Wire `createHandEvidence` to use curl measurement and runtime fields

**Files:**
- Modify: `src/features/input-mapping/createHandEvidence.ts`

- [ ] **Step 1: Replace the file body**

```typescript
import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import type { CrosshairPoint } from "./createCrosshairSmoother";
import {
  measureGunPose,
  type GunPoseMeasurement
} from "./evaluateGunPose";
import {
  measureIndexCurl,
  type IndexCurlMeasurement,
  type IndexCurlState,
  type IndexCurlTuning
} from "./evaluateIndexCurl";
import type { ViewportSize } from "./projectLandmarkToViewport";
import { projectLandmarkToViewport } from "./projectLandmarkToViewport";

export interface HandEvidenceRuntimeState {
  rawCurlState?: IndexCurlState | undefined;
  lastExtendedCrosshair?: CrosshairPoint | undefined;
  lockedCrosshair?: CrosshairPoint | undefined;
}

export interface HandEvidenceTuning extends IndexCurlTuning {
  smoothingAlpha: number;
}

export interface HandEvidence {
  trackingPresent: boolean;
  frameAtMs: number | undefined;
  projectedCrosshairCandidate: CrosshairPoint | null;
  curl: IndexCurlMeasurement | null;
  gunPose: GunPoseMeasurement | null;
}

export const buildHandEvidence = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: HandEvidenceRuntimeState | undefined,
  frameAtMs?: number,
  tuning: HandEvidenceTuning = gameConfig.input
): HandEvidence => {
  if (!frame) {
    return {
      trackingPresent: false,
      frameAtMs,
      projectedCrosshairCandidate: null,
      curl: null,
      gunPose: null
    };
  }

  const projectedCrosshairCandidate = projectLandmarkToViewport(
    frame.landmarks.indexTip,
    { width: frame.width, height: frame.height },
    viewportSize,
    { mirrorX: true }
  );

  const curl = measureIndexCurl(frame, runtime?.rawCurlState, tuning);
  const gunPose = measureGunPose(frame);

  return {
    trackingPresent: true,
    frameAtMs,
    projectedCrosshairCandidate,
    curl,
    gunPose
  };
};
```

> **Note:** `buildHandEvidence` no longer runs `smoothCrosshair`. The smoothing will happen in `mapHandToGameInput` only when `rawCurlState === "extended"` (D4.2 step (b)). `buildHandEvidence` returns the raw projected point as `projectedCrosshairCandidate`.

- [ ] **Step 2: Run the existing tests that exercise `buildHandEvidence` directly**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/shotIntentStateMachine.test.ts tests/unit/features/input-mapping/evaluateIndexCurl.test.ts tests/unit/features/input-mapping/evaluateGunPose.test.ts
```
Expected: PASS for all three. (The state-machine test references `HandEvidence` shape — the new `curl` and `projectedCrosshairCandidate` fields must compile.)

- [ ] **Step 3: Commit**

```bash
git add src/features/input-mapping/createHandEvidence.ts
git commit -m "feat(input-mapping): rewire hand evidence to curl measurement"
```

---

## Task 7: Implement `mapHandToGameInput` orchestration (D4.2)

**Files:**
- Modify: `src/features/input-mapping/mapHandToGameInput.ts`
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

- [ ] **Step 1: Replace `src/features/input-mapping/mapHandToGameInput.ts` with the orchestration logic**

```typescript
import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import {
  smoothCrosshair,
  type CrosshairPoint
} from "./createCrosshairSmoother";
import {
  buildHandEvidence,
  type HandEvidence,
  type HandEvidenceRuntimeState,
  type HandEvidenceTuning
} from "./createHandEvidence";
import type { IndexCurlState, IndexCurlTuning } from "./evaluateIndexCurl";
import {
  advanceShotIntentState,
  type ShotIntentResult,
  type ShotIntentState
} from "./shotIntentStateMachine";
import type { ViewportSize } from "./projectLandmarkToViewport";

export interface InputRuntimeState extends ShotIntentState, HandEvidenceRuntimeState {}

export interface GameInputFrame {
  crosshair?: CrosshairPoint;
  gunPoseActive: boolean;
  curlState: IndexCurlState;
  shotFired: boolean;
  crosshairLockAction: ShotIntentResult["crosshairLockAction"];
  runtime: InputRuntimeState;
}

export interface InputTuning extends IndexCurlTuning {
  smoothingAlpha: number;
}

export { buildHandEvidence } from "./createHandEvidence";

const stripHandEvidenceRuntime = (state: InputRuntimeState): InputRuntimeState => {
  const {
    rawCurlState: _rawCurlState,
    lastExtendedCrosshair: _lastExtendedCrosshair,
    lockedCrosshair: _lockedCrosshair,
    ...rest
  } = state;
  return rest as InputRuntimeState;
};

const computeNextLastExtendedCrosshair = (
  evidence: HandEvidence,
  runtime: InputRuntimeState | undefined,
  alpha: number
): CrosshairPoint | undefined => {
  if (!evidence.projectedCrosshairCandidate) {
    return runtime?.lastExtendedCrosshair;
  }
  if (evidence.curl?.rawCurlState !== "extended") {
    return runtime?.lastExtendedCrosshair;
  }
  return smoothCrosshair(runtime?.lastExtendedCrosshair, evidence.projectedCrosshairCandidate, alpha);
};

const computeNextLockedCrosshair = (
  intent: ShotIntentResult,
  nextLastExtendedCrosshair: CrosshairPoint | undefined,
  previousLockedCrosshair: CrosshairPoint | undefined
): CrosshairPoint | undefined => {
  switch (intent.crosshairLockAction) {
    case "freeze":
      // D4.3 physical guard: only freeze when we have something to freeze.
      return nextLastExtendedCrosshair ?? previousLockedCrosshair;
    case "release":
      return undefined;
    case "none":
    default:
      return previousLockedCrosshair;
  }
};

const resolveFinalCrosshair = (
  intent: ShotIntentResult,
  nextLockedCrosshair: CrosshairPoint | undefined,
  nextLastExtendedCrosshair: CrosshairPoint | undefined,
  evidence: HandEvidence
): CrosshairPoint | undefined => {
  if (intent.state.phase === "tracking_lost") {
    return undefined;
  }
  return (
    nextLockedCrosshair ??
    nextLastExtendedCrosshair ??
    evidence.projectedCrosshairCandidate ??
    { x: 0, y: 0 }
  );
};

export const mapHandToGameInput = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  // (a) Build raw evidence (curl measurement, gun-pose, projected crosshair candidate).
  const evidence = buildHandEvidence(
    frame,
    viewportSize,
    runtime,
    undefined,
    tuning as HandEvidenceTuning
  );

  // (b) Conditionally update lastExtendedCrosshair (only when raw curl is extended).
  const nextLastExtendedCrosshair = computeNextLastExtendedCrosshair(
    evidence,
    runtime,
    tuning.smoothingAlpha
  );

  // (c) Drive the state machine.
  const intent = advanceShotIntentState(runtime, evidence);

  // (d) Apply the crosshair lock action with the undefined-data physical guard.
  const nextLockedCrosshair = computeNextLockedCrosshair(
    intent,
    nextLastExtendedCrosshair,
    runtime?.lockedCrosshair
  );

  // (f) Resolve the final crosshair the game will see.
  const finalCrosshair = resolveFinalCrosshair(
    intent,
    nextLockedCrosshair,
    nextLastExtendedCrosshair,
    evidence
  );

  // (e) Build the next runtime state.
  const baseRuntime = stripHandEvidenceRuntime(intent.state as InputRuntimeState);
  const nextRuntime: InputRuntimeState = {
    ...baseRuntime,
    rawCurlState: evidence.curl?.rawCurlState ?? runtime?.rawCurlState,
    ...(nextLastExtendedCrosshair === undefined
      ? {}
      : { lastExtendedCrosshair: nextLastExtendedCrosshair }),
    ...(nextLockedCrosshair === undefined
      ? {}
      : { lockedCrosshair: nextLockedCrosshair })
  };

  return {
    gunPoseActive: intent.state.gunPoseActive,
    curlState: intent.state.curlState,
    shotFired: intent.shotFired,
    crosshairLockAction: intent.crosshairLockAction,
    ...(finalCrosshair === undefined ? {} : { crosshair: finalCrosshair }),
    runtime: nextRuntime
  };
};
```

- [ ] **Step 2: Rewrite `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`**

The current file (517 lines) is long because it covers many integration cases. The minimal viable rewrite uses fixtures from `indexCurlTestHelper.ts` plus `createIndexCurlFrame` to drive the orchestration. Replace the assertions about `triggerState` with `curlState` / `crosshairLockAction` and add the new physical-guard tests.

Because the original file is large, the recommended approach is:

1. Open the original file and skim each `describe`/`it` block.
2. For each test, decide whether it asserts thumb-trigger behaviour (delete) or general orchestration (keep, just rename `triggerState` → `curlState`).
3. Add the new test cases listed below.

**New test cases (must exist after the rewrite):**

```typescript
import { describe, expect, it } from "vitest";
import {
  mapHandToGameInput,
  type InputRuntimeState
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import { createIndexCurlFrame } from "./indexCurlTestHelper";
import type { InputTuning } from "../../../../src/features/input-mapping/mapHandToGameInput";

const VIEWPORT = { width: 1280, height: 720 };
const TUNING: InputTuning = {
  smoothingAlpha: 0.28,
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  curlHysteresisGap: 0.05,
  zAssistWeight: 0
};

const advance = (
  steps: { ratio: number }[]
): ReturnType<typeof mapHandToGameInput>[] => {
  const results: ReturnType<typeof mapHandToGameInput>[] = [];
  let runtime: InputRuntimeState | undefined;
  for (const step of steps) {
    const frame = createIndexCurlFrame({ ratio: step.ratio });
    const next = mapHandToGameInput(frame, VIEWPORT, runtime, TUNING);
    results.push(next);
    runtime = next.runtime;
  }
  return results;
};

describe("mapHandToGameInput (curl orchestration)", () => {
  it("updates lastExtendedCrosshair only on extended frames", () => {
    const results = advance([
      { ratio: 1.4 }, // extended → update
      { ratio: 1.4 }, // extended → update
      { ratio: 0.9 }, // partial  → no update
      { ratio: 0.5 }  // curled   → no update
    ]);
    const lastExtendedHistory = results.map((r) => r.runtime.lastExtendedCrosshair);
    expect(lastExtendedHistory[0]).toBeDefined();
    expect(lastExtendedHistory[1]).toBeDefined();
    expect(lastExtendedHistory[2]).toEqual(lastExtendedHistory[1]);
    expect(lastExtendedHistory[3]).toEqual(lastExtendedHistory[1]);
  });

  it("locks the crosshair to lastExtendedCrosshair when state machine emits freeze", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 }, // armed
      { ratio: 0.9 }  // partial → freeze
    ]);
    const last = results[3];
    expect(last?.crosshairLockAction).toBe("freeze");
    expect(last?.runtime.lockedCrosshair).toBeDefined();
    expect(last?.crosshair).toEqual(last?.runtime.lockedCrosshair);
  });

  it("uses the locked crosshair as the shot coordinate", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 }, // armed
      { ratio: 0.9 }, // freeze
      { ratio: 0.5 },
      { ratio: 0.5 }  // fire
    ]);
    const fireFrame = results[5];
    expect(fireFrame?.shotFired).toBe(true);
    expect(fireFrame?.crosshair).toEqual(results[3]?.runtime.lockedCrosshair);
  });

  it("does not lock the crosshair on a cold start that begins in partial (no lastExtendedCrosshair yet)", () => {
    const results = advance([
      { ratio: 0.9 },
      { ratio: 0.9 },
      { ratio: 0.5 }
    ]);
    expect(results.every((r) => r.runtime.lockedCrosshair === undefined)).toBe(true);
  });

  it("releases the lock once two extended frames are observed after a fire", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 }, // armed
      { ratio: 0.9 }, // freeze
      { ratio: 0.5 },
      { ratio: 0.5 }, // fire
      { ratio: 1.4 },
      { ratio: 1.4 }  // ready → release
    ]);
    expect(results[7]?.crosshairLockAction).toBe("release");
    expect(results[7]?.runtime.lockedCrosshair).toBeUndefined();
  });

  it("falls back to projectedCrosshairCandidate when neither locked nor lastExtended is set", () => {
    const result = mapHandToGameInput(
      createIndexCurlFrame({ ratio: 0.9 }),
      VIEWPORT,
      undefined,
      TUNING
    );
    expect(result.crosshair).toBeDefined();
    expect(result.runtime.lastExtendedCrosshair).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the new tests, iterate until green**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/mapHandToGameInput.test.ts
```
Expected: PASS. If a test fails, debug the orchestration in `mapHandToGameInput.ts` — common pitfalls:
- Forgetting to thread `runtime?.lastExtendedCrosshair` into `smoothCrosshair`
- Returning `undefined` for the locked crosshair when `freeze` is requested but `nextLastExtendedCrosshair` is set
- Not stripping the `HandEvidenceRuntimeState` keys from the previous runtime before merging

- [ ] **Step 4: Commit**

```bash
git add src/features/input-mapping/mapHandToGameInput.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts
git commit -m "feat(input-mapping): orchestrate curl crosshair lock in mapHandToGameInput"
```

---

## Task 8: Update `trackingLoss.test.ts` for the curl model

**Files:**
- Modify: `tests/unit/features/input-mapping/trackingLoss.test.ts`

- [ ] **Step 1: Skim the current file**

Run:
```bash
cat tests/unit/features/input-mapping/trackingLoss.test.ts
```
Note: it asserts `triggerState` resets to `"open"` and similar. Replace with curl-equivalent assertions.

- [ ] **Step 2: Update assertions**

Replace `triggerState`, `pulledFrames`, `openFrames`, `rawTriggerState`, etc. with their curl counterparts (`curlState`, `curledFrames`, `extendedFrames`, `rawCurlState`). For tracking-loss assertions, expect:

```typescript
expect(result.runtime.curlState).toBe("partial");
expect(result.runtime.rawCurlState).toBe("partial");
expect(result.runtime.curledFrames).toBe(0);
expect(result.runtime.extendedFrames).toBe(0);
expect(result.runtime.lockedCrosshair).toBeUndefined();
expect(result.crosshairLockAction).toBe("release");
```

- [ ] **Step 3: Run the test**

Run:
```bash
pnpm vitest run tests/unit/features/input-mapping/trackingLoss.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/features/input-mapping/trackingLoss.test.ts
git commit -m "test(input-mapping): align trackingLoss test with curl runtime"
```

---

## Task 9: Refresh debug panel — sliders, telemetry, normalization, ring buffer

**Files:**
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`

This is the second-largest single edit. Design the rewrite in pieces.

### 9.1 Replace `DebugValues` and meta tables

- [ ] **Step 1: Update `DebugValues`, meta, and constants**

Open `src/features/debug/createDebugPanel.ts` and replace the top-of-file constants:

```typescript
export interface DebugValues {
  smoothingAlpha: number;
  extendedThreshold: number;
  curledThreshold: number;
  zAssistWeight: number;
}

const HYSTERESIS_GAP = 0.05;

const DEBUG_KEYS = [
  "smoothingAlpha",
  "extendedThreshold",
  "curledThreshold",
  "zAssistWeight"
] as const satisfies readonly (keyof DebugValues)[];

const DEBUG_KEY_SET: ReadonlySet<string> = new Set(DEBUG_KEYS);

const DEBUG_META: Record<keyof DebugValues, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  extendedThreshold: { label: "Extended", min: 0.9, max: 1.6, step: 0.01 },
  curledThreshold: { label: "Curled", min: 0.4, max: 0.9, step: 0.01 },
  zAssistWeight: { label: "zAssist (display only)", min: 0, max: 0.1, step: 0.005 }
};
```

### 9.2 Replace telemetry shape and ring buffer

- [ ] **Step 2: Replace `DebugTelemetry` and add ratio history**

```typescript
export interface DebugTelemetry {
  phase: string;
  rejectReason: string;
  curlState: string;
  rawCurlState: string;
  curlConfidence: number;
  gunPoseConfidence: number;
  ratio: number;
  zDelta: number;
  extendedFrames: number;
  curledFrames: number;
  trackingPresentFrames: number;
  nonGunPoseFrames: number;
}

const RATIO_HISTORY_LENGTH = 30;

interface RatioStats {
  min: number;
  median: number;
  max: number;
}

const computeRatioStats = (history: number[]): RatioStats => {
  if (history.length === 0) {
    return { min: 0, median: 0, max: 0 };
  }
  const sorted = [...history].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    median: sorted[Math.floor(sorted.length / 2)]!
  };
};
```

### 9.3 Replace output keys

- [ ] **Step 3: Replace `DEBUG_OUTPUT_META` and `DEBUG_OUTPUT_KEYS`**

```typescript
type DebugOutputKey =
  | "phase"
  | "rejectReason"
  | "curlState"
  | "ratio"
  | "ratioStats"
  | "zDelta"
  | "gunPose"
  | "counters";

const DEBUG_OUTPUT_META: Record<DebugOutputKey, string> = {
  phase: "Phase",
  rejectReason: "Reject",
  curlState: "Curl",
  ratio: "Ratio",
  ratioStats: "Ratio (min/med/max)",
  zDelta: "zDelta",
  gunPose: "Pose",
  counters: "Counts"
};

const DEBUG_OUTPUT_KEYS = Object.keys(DEBUG_OUTPUT_META) as DebugOutputKey[];
```

### 9.4 Replace formatters

- [ ] **Step 4: Update `formatTelemetryOutput` and helpers**

```typescript
const formatRatio = (value: number | undefined): string =>
  Number.isFinite(value) ? Number(value).toFixed(2) : "--";

const formatTelemetryOutput = (
  key: DebugOutputKey,
  telemetry: DebugTelemetry | undefined,
  stats: RatioStats
): string => {
  if (!telemetry) {
    if (key === "counters") return "extended=0 curled=0 track=0 pose=0";
    if (key === "ratioStats") return "min=-- med=-- max=--";
    return "--";
  }

  switch (key) {
    case "phase":
      return telemetry.phase;
    case "rejectReason":
      return telemetry.rejectReason;
    case "curlState":
      return `${telemetry.curlState} (raw: ${telemetry.rawCurlState})`;
    case "ratio":
      return formatRatio(telemetry.ratio);
    case "ratioStats":
      return `min=${formatRatio(stats.min)} med=${formatRatio(stats.median)} max=${formatRatio(stats.max)}`;
    case "zDelta":
      return formatRatio(telemetry.zDelta);
    case "gunPose":
      return formatRatio(telemetry.gunPoseConfidence);
    case "counters":
      return `extended=${telemetry.extendedFrames} curled=${telemetry.curledFrames} track=${telemetry.trackingPresentFrames} pose=${telemetry.nonGunPoseFrames}`;
  }
};
```

### 9.5 Update normalization

- [ ] **Step 5: Replace `normalizeTriggerThresholds` with `normalizeCurlThresholds`**

```typescript
const normalizeCurlThresholds = (
  extendedThreshold: number,
  curledThreshold: number
): Pick<DebugValues, "extendedThreshold" | "curledThreshold"> => {
  const normalizedExtended = clampToMeta("extendedThreshold", extendedThreshold);
  const normalizedCurled = clampToMeta("curledThreshold", curledThreshold);
  return {
    extendedThreshold: Math.max(normalizedExtended, normalizedCurled + HYSTERESIS_GAP),
    curledThreshold: normalizedCurled
  };
};
```

### 9.6 Update the panel constructor and bindings

- [ ] **Step 6: Update `createDebugPanel` constructor body**

Replace the constructor to use the new normalization, store ratio history, and recompute stats on `setTelemetry`:

```typescript
export const createDebugPanel = (initial: DebugValues): DebugPanel => {
  const values: DebugValues = {
    smoothingAlpha: clampToMeta("smoothingAlpha", initial.smoothingAlpha),
    zAssistWeight: clampToMeta("zAssistWeight", initial.zAssistWeight),
    ...normalizeCurlThresholds(initial.extendedThreshold, initial.curledThreshold)
  };
  const boundInputs: Partial<Record<keyof DebugValues, DebugInputElement>> = {};
  const boundOutputs: Partial<Record<DebugOutputKey, DebugOutputElement>> = {};
  let telemetry: DebugTelemetry | undefined;
  const ratioHistory: number[] = [];
  let stats: RatioStats = computeRatioStats(ratioHistory);

  // ... existing renderRow / render / syncInputValue helpers (unchanged signatures) ...

  const normalizeAndSyncThresholds = (): void => {
    const normalized = normalizeCurlThresholds(values.extendedThreshold, values.curledThreshold);
    values.extendedThreshold = normalized.extendedThreshold;
    values.curledThreshold = normalized.curledThreshold;
    syncInputValue("extendedThreshold");
    syncInputValue("curledThreshold");
  };

  const setTelemetry = (nextTelemetry: DebugTelemetry | undefined): void => {
    telemetry = nextTelemetry;
    if (nextTelemetry && Number.isFinite(nextTelemetry.ratio)) {
      ratioHistory.push(nextTelemetry.ratio);
      if (ratioHistory.length > RATIO_HISTORY_LENGTH) {
        ratioHistory.shift();
      }
      stats = computeRatioStats(ratioHistory);
    }
    for (const key of DEBUG_OUTPUT_KEYS) {
      syncTelemetryOutput(key);
    }
  };

  // syncTelemetryOutput uses the new formatter signature:
  const syncTelemetryOutput = (key: DebugOutputKey): void => {
    const output = boundOutputs[key];
    if (!output) return;
    output.textContent = formatTelemetryOutput(key, telemetry, stats);
  };

  // ... bind() body unchanged except the input listener now special-cases
  // extendedThreshold/curledThreshold to call normalizeAndSyncThresholds() ...
  const bind = (
    inputs: Iterable<DebugInputElement>,
    outputs: Iterable<DebugOutputElement> = []
  ): void => {
    for (const input of inputs) {
      const boundKey = input.dataset.debug;
      if (isDebugKey(boundKey)) {
        boundInputs[boundKey] = input;
      }
      input.addEventListener("input", () => {
        const key = input.dataset.debug;
        if (!isDebugKey(key)) return;
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) return;
        values[key] = clampToMeta(key, parsed);
        syncInputValue(key);
        if (key === "extendedThreshold" || key === "curledThreshold") {
          normalizeAndSyncThresholds();
        }
      });
    }
    for (const output of outputs) {
      const key = output.dataset.debugOutput;
      if (!isDebugOutputKey(key)) continue;
      boundOutputs[key] = output;
      syncTelemetryOutput(key);
    }
  };

  return { values, render, bind, setTelemetry };
};
```

### 9.7 Update tests

- [ ] **Step 7: Replace `tests/unit/features/debug/createDebugPanel.test.ts` assertions**

This file is 229 lines. The mechanical changes:
- Initial values: replace `triggerPullThreshold` / `triggerReleaseThreshold` with `extendedThreshold: 1.15`, `curledThreshold: 0.65`, `zAssistWeight: 0`.
- HTML assertions: `data-debug="extendedThreshold"`, `data-debug="curledThreshold"`, `data-debug="zAssistWeight"`.
- Slider clamp tests: ranges `0.9-1.6` for extended, `0.4-0.9` for curled, `0-0.1` for zAssistWeight.

Add the following new tests:

```typescript
it("normalizes extendedThreshold up if it would land within HYSTERESIS_GAP of curledThreshold", () => {
  const panel = createDebugPanel({
    smoothingAlpha: 0.28,
    extendedThreshold: 0.95,
    curledThreshold: 0.92,
    zAssistWeight: 0
  });
  expect(panel.values.extendedThreshold).toBeCloseTo(0.97); // 0.92 + 0.05
});

it("normalizes after a slider input that crosses thresholds", () => {
  const panel = createDebugPanel({
    smoothingAlpha: 0.28,
    extendedThreshold: 1.15,
    curledThreshold: 0.65,
    zAssistWeight: 0
  });
  const extendedInput = createFakeInput("extendedThreshold", "1.15");
  const curledInput = createFakeInput("curledThreshold", "0.65");
  panel.bind([extendedInput, curledInput]);
  curledInput.value = "1.20";
  curledInput.fire();
  expect(panel.values.extendedThreshold).toBeGreaterThanOrEqual(panel.values.curledThreshold + 0.05);
});

it("zAssistWeight slider stores values but does not affect curl judgement", () => {
  const panel = createDebugPanel({
    smoothingAlpha: 0.28,
    extendedThreshold: 1.15,
    curledThreshold: 0.65,
    zAssistWeight: 0
  });
  const z = createFakeInput("zAssistWeight", "0");
  panel.bind([z]);
  z.value = "0.05";
  z.fire();
  expect(panel.values.zAssistWeight).toBeCloseTo(0.05);
  // The plan does not test runtime impact here — that is verified by
  // evaluateIndexCurl.test.ts ("does not feed zDelta into curl confidence").
});

it("renders ratio min/median/max from telemetry history", () => {
  const panel = createDebugPanel({
    smoothingAlpha: 0.28,
    extendedThreshold: 1.15,
    curledThreshold: 0.65,
    zAssistWeight: 0
  });
  const out = createFakeOutput("ratioStats");
  panel.bind([], [out]);
  const baseTelemetry = {
    phase: "ready",
    rejectReason: "waiting_for_fire_entry",
    curlState: "extended",
    rawCurlState: "extended",
    curlConfidence: 1,
    gunPoseConfidence: 0.9,
    zDelta: 0,
    extendedFrames: 1,
    curledFrames: 0,
    trackingPresentFrames: 5,
    nonGunPoseFrames: 0
  };
  panel.setTelemetry({ ...baseTelemetry, ratio: 1.0 });
  panel.setTelemetry({ ...baseTelemetry, ratio: 1.4 });
  panel.setTelemetry({ ...baseTelemetry, ratio: 0.7 });
  expect(out.textContent).toContain("min=0.70");
  expect(out.textContent).toContain("max=1.40");
});
```

> A `createFakeOutput` helper may need to be added next to the existing `createFakeInput`. Mirror the input fake exactly with `dataset.debugOutput`.

- [ ] **Step 8: Run the debug panel test, iterate until green**

Run:
```bash
pnpm vitest run tests/unit/features/debug/createDebugPanel.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/debug/createDebugPanel.ts tests/unit/features/debug/createDebugPanel.test.ts
git commit -m "feat(debug): replace thumb sliders with curl telemetry and ratio history"
```

---

## Task 10: Update bootstrap and integration tests

**Files:**
- Modify: `src/app/bootstrap/startApp.ts`
- Modify: `tests/unit/app/bootstrap/startApp.test.ts`
- Modify: `tests/integration/app/reduceAppEvent.test.ts` (only if it touches old keys)
- Modify: `tests/integration/app/renderShell.test.ts` (only if it touches old keys)

- [ ] **Step 1: Update `src/app/bootstrap/startApp.ts`**

Find the section that constructs the debug panel initial values (around line 48):

```typescript
// BEFORE
const debugPanel = createDebugPanel({
  smoothingAlpha: gameConfig.input.smoothingAlpha,
  triggerPullThreshold: gameConfig.input.triggerPullThreshold,
  triggerReleaseThreshold: gameConfig.input.triggerReleaseThreshold
});
```

Replace with:

```typescript
const debugPanel = createDebugPanel({
  smoothingAlpha: gameConfig.input.smoothingAlpha,
  extendedThreshold: gameConfig.input.extendedThreshold,
  curledThreshold: gameConfig.input.curledThreshold,
  zAssistWeight: gameConfig.input.zAssistWeight
});
```

Then find the per-frame call that pushes telemetry into the panel and pass the new fields:

```typescript
debugPanel.setTelemetry({
  phase: gameInputFrame.runtime.phase,
  rejectReason: gameInputFrame.runtime.rejectReason,
  curlState: gameInputFrame.runtime.curlState,
  rawCurlState: gameInputFrame.runtime.rawCurlState ?? "partial",
  curlConfidence: gameInputFrame.runtime.curlConfidence,
  gunPoseConfidence: gameInputFrame.runtime.gunPoseConfidence,
  ratio: 0, // wire from evidence in a follow-up — see note below
  zDelta: 0,
  extendedFrames: gameInputFrame.runtime.extendedFrames,
  curledFrames: gameInputFrame.runtime.curledFrames,
  trackingPresentFrames: gameInputFrame.runtime.trackingPresentFrames,
  nonGunPoseFrames: gameInputFrame.runtime.nonGunPoseFrames
});
```

> **Wiring `ratio` and `zDelta` to the panel**: `mapHandToGameInput` currently does not surface the curl details. To plumb them through, either (a) add a `curl: IndexCurlMeasurement | undefined` field to `GameInputFrame` and read it here, or (b) add `ratio: number; zDelta: number` to `InputRuntimeState` and write them in `mapHandToGameInput` from `evidence.curl?.details`. Option (b) is smaller. Pick (b) and apply the change as part of this step.

For option (b), in `mapHandToGameInput.ts` add to the `nextRuntime`:
```typescript
ratio: evidence.curl?.details.ratio ?? runtime?.ratio ?? 0,
zDelta: evidence.curl?.details.zDelta ?? runtime?.zDelta ?? 0,
```
And extend `InputRuntimeState` (re-exported via `ShotIntentState` extension or directly) accordingly.

- [ ] **Step 2: Update `tests/unit/app/bootstrap/startApp.test.ts`**

Find the fake `gameConfig.input` shape (around line 24) and replace `triggerPullThreshold` / `triggerReleaseThreshold` with the new keys.

- [ ] **Step 3: Run bootstrap and integration tests**

Run:
```bash
pnpm vitest run tests/unit/app/bootstrap/startApp.test.ts tests/integration/app/reduceAppEvent.test.ts tests/integration/app/renderShell.test.ts
```
Expected: PASS. Fix any cascading type errors as they appear.

- [ ] **Step 4: Commit**

```bash
git add src/app/bootstrap/startApp.ts tests/unit/app/bootstrap/startApp.test.ts tests/integration/app/
git commit -m "feat(bootstrap): wire curl telemetry into debug panel"
```

---

## Task 11: Delete legacy thumb trigger files and verify the full suite

**Files:**
- Delete: `src/features/input-mapping/evaluateThumbTrigger.ts`
- Delete: `tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts`
- Delete: `tests/unit/features/input-mapping/thumbTriggerTestHelper.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm src/features/input-mapping/evaluateThumbTrigger.ts
rm tests/unit/features/input-mapping/evaluateThumbTrigger.test.ts
rm tests/unit/features/input-mapping/thumbTriggerTestHelper.ts
```

- [ ] **Step 2: Search for any lingering imports**

```bash
pnpm vitest run 2>&1 | grep -i "thumb" || echo "no lingering thumb references"
```
If anything remains (e.g. an `e2e` spec that imports `thumbTriggerTestHelper`), update or remove the offending lines.

Also check for the `knip` dead-code report:
```bash
pnpm knip || true
```
Remove anything `knip` flags as related to the deleted modules.

- [ ] **Step 3: Run the full unit + integration suite**

```bash
pnpm vitest run
```
Expected: PASS.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Run lint**

```bash
pnpm lint
```
Expected: PASS. Fix any unused-import or unused-variable warnings introduced by the cleanup.

- [ ] **Step 6: Run E2E smoke**

```bash
pnpm test:e2e
```
or whatever the project's e2e command is (`grep "test:e2e\|playwright" package.json`).

Expected: existing smoke test passes. If `tests/e2e/issue30.acceptance.spec.ts` references thumb-trigger UI text, update to the curl equivalent (most likely it does not — it asserts game behaviour rather than UI strings).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(input-mapping): remove legacy thumb trigger module and tests"
```

---

## Task 12: Manual live test against PoC acceptance criteria

**No code changes — verification only.**

This task implements the manual verification protocol from the spec. Skipping it leaves the spec acceptance criteria unmet.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```
Open the printed URL in Chrome.

- [ ] **Step 2: Open the debug panel and enter live play**

Verify the debug panel shows:
- `Curl: extended (raw: extended)` while pointing
- `Ratio: ~1.3-1.5` while pointing
- `Phase: armed` after 2-3 frames of extended
- `Phase: fired` after a deliberate bend

- [ ] **Step 3: Run the PoC acceptance protocol**

Conduct the protocol from spec section "受け入れ基準": adult + 2 children, 10 trials each. Record:
- Intentional fire success rate (target ≥ 80%)
- False fires per minute (target ≤ 2)

Save a session note to `docs/notes/2026-04-11-live-acceptance-results.md` with the numbers, the date, the tester names (anonymised if needed), and any qualitative observations.

- [ ] **Step 4: If acceptance fails**

Tune `extendedThreshold` and `curledThreshold` live via the debug panel. If tuning cannot reach acceptance, file a follow-up issue and reference Issue #32 — do NOT modify the spec without going back through brainstorming.

- [ ] **Step 5: Final commit (note only)**

```bash
git add docs/notes/2026-04-11-live-acceptance-results.md
git commit -m "docs(notes): record index curl trigger live acceptance results"
```

---

## Self-Review Checklist (mark complete before handing the plan to an executor)

- [x] Every spec D1-D9 decision is covered by at least one task: D1 (Task 3), D2 (Task 3 + Task 5), D3 (Task 3 + Task 5), D4.1/D4.2/D4.3/D4.4 (Task 5 + Task 7), D5 (Task 4), D6 (Task 1), D7 (Task 9), D8 (Task 9), D9 (Task 11)
- [x] No `TODO`, `TBD`, "implement later" placeholders remain
- [x] Every code step shows the actual code, not just a description
- [x] File paths are exact
- [x] Vitest commands include the test file path
- [x] Method/property names match across tasks (e.g. `curlState` is used consistently, never `curlStateValue` or `curlPhase`)
- [x] The `crosshairLockAction` field appears in `ShotIntentResult` (Task 5) and is consumed in `mapHandToGameInput` (Task 7)
- [x] `lastExtendedCrosshair` and `lockedCrosshair` are owned by `HandEvidenceRuntimeState` (Task 6) and updated in `mapHandToGameInput` (Task 7)
- [x] The undefined-data physical guard for `freeze` is implemented in Task 7 step 1 (`computeNextLockedCrosshair`) and tested in Task 7 step 2 ("does not lock the crosshair on a cold start that begins in partial")
- [x] Manual acceptance is captured as Task 12 with measurable success criteria
