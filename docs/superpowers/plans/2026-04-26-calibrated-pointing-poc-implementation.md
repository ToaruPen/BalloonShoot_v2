# Calibrated Pointing PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a diagnostic-only calibrated pointing PoC that maps front/side hand landmarks to a screen aim point through a short preparation-game calibration flow.

**Architecture:** Add a new pure `src/features/pointing-calibration/` feature that owns targets, feature extraction, sample acceptance, front-only projection, weighted k-nearest mapping, validation, and controller state. The diagnostic workbench only renders and drives this feature; gameplay, scoring, hit detection, side-trigger FSM, and existing front-aim behavior remain unchanged.

**Tech Stack:** TypeScript strict mode, Vitest, existing MediaPipe hand landmark types, existing diagnostic workbench DOM rendering, Chrome-first local PoC.

---

## File Structure

### Create

```text
src/features/pointing-calibration/
  AGENTS.md                         # scoped guidance; add sibling CLAUDE.md symlink
  constants.ts                      # thresholds and mapper parameters from the spec
  targets.ts                        # fixed calibration/validation target definitions
  types.ts                          # public feature types
  featureSchema.ts                  # POINTING_FEATURE_SCHEMA_V1 + vector extraction
  frontDirectionProjection.ts       # front-only baseline projection
  sampleAcceptance.ts               # stable-frame reducer and accepted sample creation
  weightedKnnMapper.ts              # calibrated front-only/front+side weighted k-nearest mapper
  pointingCalibrationController.ts  # preparation-game state machine + validation summary
  index.ts                          # public exports

tests/unit/features/pointing-calibration/
  AGENTS.md
  CLAUDE.md                         # symlink to AGENTS.md
  testFactory.ts
  targets.test.ts
  featureSchema.test.ts
  frontDirectionProjection.test.ts
  sampleAcceptance.test.ts
  weightedKnnMapper.test.ts
  pointingCalibrationController.test.ts

src/features/diagnostic-workbench/renderPointingCalibrationPanel.ts
tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts
```

### Modify

```text
src/features/AGENTS.md
src/features/diagnostic-workbench/workbenchInspectionState.ts
src/features/diagnostic-workbench/renderWorkbench.ts
src/features/diagnostic-workbench/liveLandmarkInspection.ts
src/diagnostic-main.ts
src/styles/diagnostic.css
tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts
tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts
tests/integration/importBoundaries.test.ts
```

### Do Not Modify

```text
src/features/gameplay/
src/features/front-aim/createFrontAimMapper.ts
src/features/front-aim/mapFrontHandToAimInput.ts
src/features/side-trigger/sideTriggerStateMachine.ts
src/features/input-fusion/
src/app/
index.html
```

---

## Task 1: Feature Boundary, Constants, Targets, and Types

**Files:**
- Create: `src/features/pointing-calibration/AGENTS.md`
- Create: `src/features/pointing-calibration/CLAUDE.md`
- Create: `tests/unit/features/pointing-calibration/AGENTS.md`
- Create: `tests/unit/features/pointing-calibration/CLAUDE.md`
- Create: `src/features/pointing-calibration/constants.ts`
- Create: `src/features/pointing-calibration/targets.ts`
- Create: `src/features/pointing-calibration/types.ts`
- Create: `src/features/pointing-calibration/index.ts`
- Create: `tests/unit/features/pointing-calibration/targets.test.ts`
- Modify: `src/features/AGENTS.md`

- [ ] **Step 1: Write scoped guidance files**

`src/features/pointing-calibration/AGENTS.md`:

```md
# AGENTS.md

## WHY

- `pointing-calibration/` owns the diagnostic-only calibrated pointing PoC.

## WHAT

- Preparation-game target definitions
- Front/side hand landmark feature extraction
- Sample acceptance and validation logic
- Front-only baseline projection
- Weighted k-nearest calibrated aim mapping

## HOW

- Keep this feature independent from diagnostic DOM, gameplay, rendering, side-trigger, input-fusion, and app shell modules.
- Use shared hand and aim types only for data contracts.
- Treat target coordinates and mapper parameters as explicit constants with tests.
- Do not change game scoring or hit detection from this feature.
```

`tests/unit/features/pointing-calibration/AGENTS.md`:

```md
# AGENTS.md

## WHY

- Unit tests here verify calibrated pointing pure logic.

## WHAT

- Target definitions
- Feature vector extraction
- Sample acceptance
- Weighted k-nearest mapping
- Controller transitions

## HOW

- Use deterministic synthetic hand landmarks.
- Assert exact schema order and vector lengths.
- Test front-only and front+side modes separately.
```

Create sibling symlinks:

```bash
ln -s AGENTS.md src/features/pointing-calibration/CLAUDE.md
ln -s AGENTS.md tests/unit/features/pointing-calibration/CLAUDE.md
```

- [ ] **Step 2: Write failing target tests**

`tests/unit/features/pointing-calibration/targets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POINTING_CALIBRATION_TARGETS,
  POINTING_VALIDATION_TARGETS
} from "../../../../src/features/pointing-calibration";

describe("pointing calibration targets", () => {
  it("defines the five fixed training targets from the spec", () => {
    expect(POINTING_CALIBRATION_TARGETS).toEqual([
      { id: "center", pointNormalized: { x: 0.5, y: 0.5 }, kind: "fixed" },
      { id: "topLeft", pointNormalized: { x: 0.2, y: 0.2 }, kind: "fixed" },
      { id: "topRight", pointNormalized: { x: 0.8, y: 0.2 }, kind: "fixed" },
      { id: "bottomLeft", pointNormalized: { x: 0.2, y: 0.8 }, kind: "fixed" },
      { id: "bottomRight", pointNormalized: { x: 0.8, y: 0.8 }, kind: "fixed" }
    ]);
  });

  it("keeps validation targets separate from training targets", () => {
    expect(POINTING_VALIDATION_TARGETS).toEqual([
      { id: "validationLeft", pointNormalized: { x: 0.35, y: 0.5 }, kind: "validation" },
      { id: "validationRight", pointNormalized: { x: 0.65, y: 0.5 }, kind: "validation" },
      { id: "validationTop", pointNormalized: { x: 0.5, y: 0.35 }, kind: "validation" }
    ]);
    expect(
      POINTING_VALIDATION_TARGETS.some((validationTarget) =>
        POINTING_CALIBRATION_TARGETS.some(
          (calibrationTarget) => calibrationTarget.id === validationTarget.id
        )
      )
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run target test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/targets.test.ts
```

Expected: FAIL because `src/features/pointing-calibration` does not exist.

- [ ] **Step 4: Implement constants, targets, and types**

`src/features/pointing-calibration/constants.ts`:

```ts
export const POINTING_TARGET_MARKER_RADIUS_PX = 48;
export const POINTING_IGNORE_TARGET_INITIAL_MS = 500;
export const POINTING_STABLE_WINDOW_FRAMES = 10;
export const POINTING_MIN_VALID_FRAMES = 8;
export const POINTING_FRONT_MIN_CONFIDENCE = 0.6;
export const POINTING_SIDE_MIN_CONFIDENCE = 0.5;
export const POINTING_STABLE_DURATION_MS = 300;
export const POINTING_MAX_FEATURE_VARIANCE = 0.0025;
export const POINTING_KNN_EPSILON = 1e-3;
export const POINTING_KNN_MIN_STD_DEV = 1e-6;
export const POINTING_KNN_REJECTION_DISTANCE = 3.0;
export const POINTING_VALIDATION_VIEWPORT = { width: 1366, height: 768 } as const;
export const POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO = 0.2;
export const POINTING_FAILURE_IMPROVEMENT_FLOOR_RATIO = 0.1;
export const POINTING_MAX_MEAN_ABSOLUTE_ERROR_PX = 120;
export const POINTING_MAX_SINGLE_TARGET_ERROR_PX = 200;
export const POINTING_FRONT_DIRECTION_GAIN = 0.35;
```

`src/features/pointing-calibration/types.ts`:

```ts
import type { AimPoint2D } from "../../shared/types/aim";
import type {
  FrontHandDetection,
  SideHandDetection
} from "../../shared/types/hand";

export type PointingTargetKind = "fixed" | "validation";

export interface PointingCalibrationTarget {
  readonly id: string;
  readonly pointNormalized: AimPoint2D;
  readonly kind: PointingTargetKind;
}

export interface PointingFeatureQuality {
  readonly frontConfidence: number;
  readonly sideConfidence: number | undefined;
  readonly hasSide: boolean;
  readonly sideViewQuality: string | undefined;
}

export interface PointingFeatureVector {
  readonly schemaVersion: "POINTING_FEATURE_SCHEMA_V1";
  readonly front: readonly number[];
  readonly side: readonly number[] | undefined;
  readonly quality: PointingFeatureQuality;
}

export interface PointingFeatureInput {
  readonly frontDetection: FrontHandDetection | undefined;
  readonly sideDetection: SideHandDetection | undefined;
}

export interface PointingCalibrationSample {
  readonly target: PointingCalibrationTarget;
  readonly featureVector: PointingFeatureVector;
  readonly indexTipAimPointNormalized: AimPoint2D;
  readonly frontDirectionAimPointNormalized: AimPoint2D;
  readonly timestampMs: number;
  readonly mode: "frontOnly" | "frontSide";
}

export interface PointingAimEstimate {
  readonly aimPointNormalized: AimPoint2D;
  readonly calibrationConfidence: number;
  readonly nearestDistance: number | undefined;
  readonly mode: "frontOnly" | "frontSide";
}

export interface PointingValidationTargetResult {
  readonly target: PointingCalibrationTarget;
  readonly indexTipErrorPx: number;
  readonly frontOnlyErrorPx: number | undefined;
  readonly frontSideErrorPx: number | undefined;
  readonly sampleCount: number;
}

export interface PointingValidationSummary {
  readonly targetResults: readonly PointingValidationTargetResult[];
  readonly indexTipMeanAbsoluteErrorPx: number | undefined;
  readonly frontOnlyMeanAbsoluteErrorPx: number | undefined;
  readonly frontSideMeanAbsoluteErrorPx: number | undefined;
  readonly frontSideImprovementOverIndexTip: number | undefined;
  readonly frontSideImprovementOverFrontOnly: number | undefined;
  readonly frontOnlyReady: boolean;
  readonly frontSideReady: boolean;
  readonly retryReason:
    | "insufficientValidationSamples"
    | "missingImprovementBaseline"
    | "frontSideTooInaccurate"
    | "frontSideRegression"
    | "singleTargetTooFar"
    | undefined;
}
```

`src/features/pointing-calibration/targets.ts`:

```ts
import type { PointingCalibrationTarget } from "./types";

export const POINTING_CALIBRATION_TARGETS = [
  { id: "center", pointNormalized: { x: 0.5, y: 0.5 }, kind: "fixed" },
  { id: "topLeft", pointNormalized: { x: 0.2, y: 0.2 }, kind: "fixed" },
  { id: "topRight", pointNormalized: { x: 0.8, y: 0.2 }, kind: "fixed" },
  { id: "bottomLeft", pointNormalized: { x: 0.2, y: 0.8 }, kind: "fixed" },
  { id: "bottomRight", pointNormalized: { x: 0.8, y: 0.8 }, kind: "fixed" }
] as const satisfies readonly PointingCalibrationTarget[];

export const POINTING_VALIDATION_TARGETS = [
  { id: "validationLeft", pointNormalized: { x: 0.35, y: 0.5 }, kind: "validation" },
  { id: "validationRight", pointNormalized: { x: 0.65, y: 0.5 }, kind: "validation" },
  { id: "validationTop", pointNormalized: { x: 0.5, y: 0.35 }, kind: "validation" }
] as const satisfies readonly PointingCalibrationTarget[];
```

`src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./targets";
export type * from "./types";
```

- [ ] **Step 5: Update feature guidance**

Add `pointing-calibration/` to `src/features/AGENTS.md` WHAT list:

```md
- `pointing-calibration/`: diagnostic-only calibrated pointing input PoC
```

- [ ] **Step 6: Run target tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/targets.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/AGENTS.md src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): add calibration targets and types"
```

---

## Task 2: Feature Schema Extraction

**Files:**
- Create: `src/features/pointing-calibration/featureSchema.ts`
- Create: `tests/unit/features/pointing-calibration/testFactory.ts`
- Create: `tests/unit/features/pointing-calibration/featureSchema.test.ts`
- Modify: `src/features/pointing-calibration/index.ts`

- [ ] **Step 1: Write failing schema tests**

`tests/unit/features/pointing-calibration/testFactory.ts`:

```ts
import type {
  FrontHandDetection,
  HandFrame,
  HandLandmarkSet,
  SideHandDetection
} from "../../../../src/shared/types/hand";

const landmarksFor = (offsetX: number, offsetY: number): HandLandmarkSet => ({
  wrist: { x: 0.2 + offsetX, y: 0.7 + offsetY, z: 0 },
  indexMcp: { x: 0.35 + offsetX, y: 0.55 + offsetY, z: -0.01 },
  indexTip: { x: 0.52 + offsetX, y: 0.35 + offsetY, z: -0.04 },
  thumbIp: { x: 0.3 + offsetX, y: 0.6 + offsetY, z: -0.01 },
  thumbTip: { x: 0.26 + offsetX, y: 0.5 + offsetY, z: -0.02 },
  middleTip: { x: 0.45 + offsetX, y: 0.38 + offsetY, z: -0.03 },
  middleMcp: { x: 0.4 + offsetX, y: 0.56 + offsetY, z: -0.01 },
  ringTip: { x: 0.5 + offsetX, y: 0.48 + offsetY, z: -0.02 },
  pinkyTip: { x: 0.56 + offsetX, y: 0.56 + offsetY, z: -0.01 },
  pinkyMcp: { x: 0.48 + offsetX, y: 0.62 + offsetY, z: 0 }
});

export const createPointingHandFrame = (
  offsetX = 0,
  offsetY = 0
): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: landmarksFor(offsetX, offsetY)
});

export const createPointingFrontDetection = (
  offsetX = 0,
  offsetY = 0,
  confidence = 0.9
): FrontHandDetection => ({
  laneRole: "frontAim",
  deviceId: "front",
  streamId: "front-stream",
  timestamp: {
    frameTimestampMs: 1000,
    timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
    presentedFrames: 1,
    receivedAtPerformanceMs: 1001
  },
  rawFrame: createPointingHandFrame(offsetX, offsetY),
  filteredFrame: createPointingHandFrame(offsetX, offsetY),
  handPresenceConfidence: confidence,
  trackingQuality: "good"
});

export const createPointingSideDetection = (
  offsetX = 0,
  offsetY = 0,
  confidence = 0.85
): SideHandDetection => ({
  laneRole: "sideTrigger",
  deviceId: "side",
  streamId: "side-stream",
  timestamp: {
    frameTimestampMs: 1000,
    timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
    presentedFrames: 1,
    receivedAtPerformanceMs: 1001
  },
  rawFrame: createPointingHandFrame(offsetX, offsetY),
  filteredFrame: createPointingHandFrame(offsetX, offsetY),
  handPresenceConfidence: confidence,
  sideViewQuality: "good"
});
```

`tests/unit/features/pointing-calibration/featureSchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POINTING_FEATURE_SCHEMA_V1,
  extractPointingFeatureVector
} from "../../../../src/features/pointing-calibration";
import {
  createPointingFrontDetection,
  createPointingSideDetection
} from "./testFactory";

describe("pointing feature schema", () => {
  it("uses a stable schema name and vector lengths", () => {
    expect(POINTING_FEATURE_SCHEMA_V1.version).toBe("POINTING_FEATURE_SCHEMA_V1");
    expect(POINTING_FEATURE_SCHEMA_V1.front).toEqual([
      "indexTip.dx",
      "indexTip.dy",
      "indexMcp.dx",
      "indexMcp.dy",
      "indexMidpoint.dx",
      "indexMidpoint.dy",
      "thumbTip.dx",
      "thumbTip.dy",
      "handCenter.dx",
      "handCenter.dy",
      "indexDirection.x",
      "indexDirection.y",
      "wristToIndexTip.x",
      "wristToIndexTip.y"
    ]);
    expect(POINTING_FEATURE_SCHEMA_V1.side).toEqual([
      "indexTip.dx",
      "indexTip.dy",
      "indexMcp.dx",
      "indexMcp.dy",
      "indexMidpoint.dx",
      "indexMidpoint.dy",
      "handCenter.dx",
      "handCenter.dy",
      "indexDirection.x",
      "indexDirection.y",
      "wristToIndexTip.x",
      "wristToIndexTip.y",
      "handScale",
      "sideViewQuality.good"
    ]);
  });

  it("extracts wrist-relative scale-normalized front and side features", () => {
    const vector = extractPointingFeatureVector({
      frontDetection: createPointingFrontDetection(),
      sideDetection: createPointingSideDetection(0.03, -0.02)
    });

    expect(vector?.schemaVersion).toBe("POINTING_FEATURE_SCHEMA_V1");
    expect(vector?.front).toHaveLength(14);
    expect(vector?.side).toHaveLength(14);
    expect(vector?.quality).toEqual({
      frontConfidence: 0.9,
      sideConfidence: 0.85,
      hasSide: true,
      sideViewQuality: "good"
    });
  });

  it("returns undefined without a front detection", () => {
    expect(
      extractPointingFeatureVector({
        frontDetection: undefined,
        sideDetection: createPointingSideDetection()
      })
    ).toBeUndefined();
  });

  it("keeps side vector undefined when side detection is unavailable", () => {
    const vector = extractPointingFeatureVector({
      frontDetection: createPointingFrontDetection(),
      sideDetection: undefined
    });

    expect(vector?.side).toBeUndefined();
    expect(vector?.quality.hasSide).toBe(false);
  });
});
```

- [ ] **Step 2: Run schema test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/featureSchema.test.ts
```

Expected: FAIL because `featureSchema.ts` is missing.

- [ ] **Step 3: Implement schema extraction**

`src/features/pointing-calibration/featureSchema.ts`:

```ts
import type { HandLandmarkSet, Point3D } from "../../shared/types/hand";
import type { PointingFeatureInput, PointingFeatureVector } from "./types";

export const POINTING_FEATURE_SCHEMA_V1 = {
  version: "POINTING_FEATURE_SCHEMA_V1",
  front: [
    "indexTip.dx",
    "indexTip.dy",
    "indexMcp.dx",
    "indexMcp.dy",
    "indexMidpoint.dx",
    "indexMidpoint.dy",
    "thumbTip.dx",
    "thumbTip.dy",
    "handCenter.dx",
    "handCenter.dy",
    "indexDirection.x",
    "indexDirection.y",
    "wristToIndexTip.x",
    "wristToIndexTip.y"
  ],
  side: [
    "indexTip.dx",
    "indexTip.dy",
    "indexMcp.dx",
    "indexMcp.dy",
    "indexMidpoint.dx",
    "indexMidpoint.dy",
    "handCenter.dx",
    "handCenter.dy",
    "indexDirection.x",
    "indexDirection.y",
    "wristToIndexTip.x",
    "wristToIndexTip.y",
    "handScale",
    "sideViewQuality.good"
  ]
} as const;

const distance = (a: Point3D, b: Point3D): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const clampScale = (value: number): number => Math.max(value, 1e-6);

const direction = (from: Point3D, to: Point3D): readonly [number, number] => {
  const length = clampScale(distance(from, to));
  return [(to.x - from.x) / length, (to.y - from.y) / length];
};

const relativePoint = (
  point: Point3D,
  wrist: Point3D,
  scale: number
): readonly [number, number] => [
  (point.x - wrist.x) / scale,
  (point.y - wrist.y) / scale
];

const handCenter = (points: readonly Point3D[]): Point3D => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  z: points.reduce((sum, point) => sum + point.z, 0) / points.length
});

const frontFeaturesFor = (landmarks: HandLandmarkSet): readonly number[] => {
  const scale = clampScale(distance(landmarks.wrist, landmarks.indexMcp));
  const [tipDx, tipDy] = relativePoint(landmarks.indexTip, landmarks.wrist, scale);
  const [mcpDx, mcpDy] = relativePoint(landmarks.indexMcp, landmarks.wrist, scale);
  const indexMidpoint = {
    x: (landmarks.indexMcp.x + landmarks.indexTip.x) / 2,
    y: (landmarks.indexMcp.y + landmarks.indexTip.y) / 2,
    z: (landmarks.indexMcp.z + landmarks.indexTip.z) / 2
  };
  const [midDx, midDy] = relativePoint(indexMidpoint, landmarks.wrist, scale);
  const [thumbDx, thumbDy] = relativePoint(landmarks.thumbTip, landmarks.wrist, scale);
  const center = handCenter([
    landmarks.wrist,
    landmarks.indexMcp,
    landmarks.indexTip,
    landmarks.thumbTip
  ]);
  const [centerDx, centerDy] = relativePoint(center, landmarks.wrist, scale);
  const [dirX, dirY] = direction(landmarks.indexMcp, landmarks.indexTip);
  const [wristDirX, wristDirY] = direction(landmarks.wrist, landmarks.indexTip);

  return [
    tipDx,
    tipDy,
    mcpDx,
    mcpDy,
    midDx,
    midDy,
    thumbDx,
    thumbDy,
    centerDx,
    centerDy,
    dirX,
    dirY,
    wristDirX,
    wristDirY
  ];
};

const sideFeaturesFor = (
  landmarks: HandLandmarkSet,
  sideViewQuality: string
): readonly number[] => {
  const scale = clampScale(distance(landmarks.wrist, landmarks.indexMcp));
  const [tipDx, tipDy] = relativePoint(landmarks.indexTip, landmarks.wrist, scale);
  const [mcpDx, mcpDy] = relativePoint(landmarks.indexMcp, landmarks.wrist, scale);
  const indexMidpoint = {
    x: (landmarks.indexMcp.x + landmarks.indexTip.x) / 2,
    y: (landmarks.indexMcp.y + landmarks.indexTip.y) / 2,
    z: (landmarks.indexMcp.z + landmarks.indexTip.z) / 2
  };
  const [midDx, midDy] = relativePoint(indexMidpoint, landmarks.wrist, scale);
  const center = handCenter([
    landmarks.wrist,
    landmarks.indexMcp,
    landmarks.indexTip,
    landmarks.thumbTip
  ]);
  const [centerDx, centerDy] = relativePoint(center, landmarks.wrist, scale);
  const [dirX, dirY] = direction(landmarks.indexMcp, landmarks.indexTip);
  const [wristDirX, wristDirY] = direction(landmarks.wrist, landmarks.indexTip);
  const sideViewGood = sideViewQuality === "good" ? 1 : 0;

  return [
    tipDx,
    tipDy,
    mcpDx,
    mcpDy,
    midDx,
    midDy,
    centerDx,
    centerDy,
    dirX,
    dirY,
    wristDirX,
    wristDirY,
    scale,
    sideViewGood
  ];
};

export const extractPointingFeatureVector = ({
  frontDetection,
  sideDetection
}: PointingFeatureInput): PointingFeatureVector | undefined => {
  if (frontDetection === undefined) {
    return undefined;
  }

  return {
    schemaVersion: "POINTING_FEATURE_SCHEMA_V1",
    front: frontFeaturesFor(frontDetection.filteredFrame.landmarks),
    side:
      sideDetection === undefined
        ? undefined
        : sideFeaturesFor(
            sideDetection.filteredFrame.landmarks,
            sideDetection.sideViewQuality
          ),
    quality: {
      frontConfidence: frontDetection.handPresenceConfidence,
      sideConfidence: sideDetection?.handPresenceConfidence,
      hasSide: sideDetection !== undefined,
      sideViewQuality: sideDetection?.sideViewQuality
    }
  };
};
```

The initial schema uses `indexMidpoint` because the current shared `HandLandmarkSet` does not expose index PIP/DIP. This is an explicit V1 approximation, not an accidental substitute. If index PIP/DIP are later exposed from MediaPipe, add them in a V2 schema instead of changing V1 order.

Update `src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./featureSchema";
export * from "./targets";
export type * from "./types";
```

- [ ] **Step 4: Run schema tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/featureSchema.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): extract landmark feature vectors"
```

---

## Task 3: Front-Only Direction Projection Baseline

**Files:**
- Create: `src/features/pointing-calibration/frontDirectionProjection.ts`
- Create: `tests/unit/features/pointing-calibration/frontDirectionProjection.test.ts`
- Modify: `src/features/pointing-calibration/index.ts`

- [ ] **Step 1: Write failing projection tests**

`tests/unit/features/pointing-calibration/frontDirectionProjection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectFrontDirectionAim } from "../../../../src/features/pointing-calibration";
import { createPointingFrontDetection } from "./testFactory";

describe("front direction projection", () => {
  it("projects beyond the index tip along the index direction", () => {
    const detection = createPointingFrontDetection();
    const projected = projectFrontDirectionAim({
      detection,
      gain: 0.2
    });

    expect(projected.x).toBeGreaterThan(detection.filteredFrame.landmarks.indexTip.x);
    expect(projected.y).toBeLessThan(detection.filteredFrame.landmarks.indexTip.y);
  });

  it("clamps projected coordinates to the normalized viewport", () => {
    const detection = createPointingFrontDetection(0.45, -0.3);
    const projected = projectFrontDirectionAim({
      detection,
      gain: 2
    });

    expect(projected.x).toBeLessThanOrEqual(1);
    expect(projected.y).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run projection test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/frontDirectionProjection.test.ts
```

Expected: FAIL because `projectFrontDirectionAim` is missing.

- [ ] **Step 3: Implement projection**

`src/features/pointing-calibration/frontDirectionProjection.ts`:

```ts
import type { AimPoint2D } from "../../shared/types/aim";
import type { FrontHandDetection } from "../../shared/types/hand";
import { POINTING_FRONT_DIRECTION_GAIN } from "./constants";

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

export const projectFrontDirectionAim = ({
  detection,
  gain = POINTING_FRONT_DIRECTION_GAIN
}: {
  readonly detection: FrontHandDetection;
  readonly gain?: number;
}): AimPoint2D => {
  const { indexMcp, indexTip } = detection.filteredFrame.landmarks;
  const dx = indexTip.x - indexMcp.x;
  const dy = indexTip.y - indexMcp.y;
  const length = Math.max(Math.hypot(dx, dy), 1e-6);

  return {
    x: clamp01(indexTip.x + (dx / length) * gain),
    y: clamp01(indexTip.y + (dy / length) * gain)
  };
};
```

Update `src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./featureSchema";
export * from "./frontDirectionProjection";
export * from "./targets";
export type * from "./types";
```

- [ ] **Step 4: Run projection tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/frontDirectionProjection.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): add front direction baseline"
```

---

## Task 4: Sample Acceptance Reducer

**Files:**
- Create: `src/features/pointing-calibration/sampleAcceptance.ts`
- Create: `tests/unit/features/pointing-calibration/sampleAcceptance.test.ts`
- Modify: `src/features/pointing-calibration/index.ts`

- [ ] **Step 1: Write failing sample acceptance tests**

`tests/unit/features/pointing-calibration/sampleAcceptance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POINTING_CALIBRATION_TARGETS,
  createInitialPointingSampleWindow,
  updatePointingSampleWindow
} from "../../../../src/features/pointing-calibration";
import {
  createPointingFrontDetection,
  createPointingSideDetection
} from "./testFactory";

describe("pointing sample acceptance", () => {
  it("ignores frames during the initial target delay", () => {
    const state = updatePointingSampleWindow(
      createInitialPointingSampleWindow(),
      {
        target: POINTING_CALIBRATION_TARGETS[0],
        timestampMs: 300,
        targetShownAtMs: 0,
        frontDetection: createPointingFrontDetection(),
        sideDetection: createPointingSideDetection()
      }
    );

    expect(state.acceptedSample).toBeUndefined();
    expect(state.reason).toBe("initialDelay");
  });

  it("accepts a front-side sample after stable valid frames", () => {
    let state = createInitialPointingSampleWindow();

    for (let i = 0; i < 10; i += 1) {
      state = updatePointingSampleWindow(state, {
        target: POINTING_CALIBRATION_TARGETS[0],
        timestampMs: 600 + i * 40,
        targetShownAtMs: 0,
        frontDetection: createPointingFrontDetection(),
        sideDetection: createPointingSideDetection()
      });
    }

    expect(state.acceptedSample?.target.id).toBe("center");
    expect(state.acceptedSample?.mode).toBe("frontSide");
  });

  it("accepts a front-only sample when side confidence is low", () => {
    let state = createInitialPointingSampleWindow();

    for (let i = 0; i < 10; i += 1) {
      state = updatePointingSampleWindow(state, {
        target: POINTING_CALIBRATION_TARGETS[0],
        timestampMs: 600 + i * 40,
        targetShownAtMs: 0,
        frontDetection: createPointingFrontDetection(),
        sideDetection: createPointingSideDetection(0, 0, 0.2)
      });
    }

    expect(state.acceptedSample?.mode).toBe("frontOnly");
    expect(state.acceptedSample?.featureVector.side).toBeUndefined();
  });

  it("rejects low-confidence front frames", () => {
    let state = createInitialPointingSampleWindow();

    for (let i = 0; i < 10; i += 1) {
      state = updatePointingSampleWindow(state, {
        target: POINTING_CALIBRATION_TARGETS[0],
        timestampMs: 600 + i * 40,
        targetShownAtMs: 0,
        frontDetection: createPointingFrontDetection(0, 0, 0.1),
        sideDetection: createPointingSideDetection()
      });
    }

    expect(state.acceptedSample).toBeUndefined();
    expect(state.reason).toBe("lowFrontConfidence");
  });
});
```

- [ ] **Step 2: Run sample tests and verify they fail**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/sampleAcceptance.test.ts
```

Expected: FAIL because sample acceptance API is missing.

- [ ] **Step 3: Implement sample acceptance**

`src/features/pointing-calibration/sampleAcceptance.ts`:

```ts
import {
  POINTING_FRONT_MIN_CONFIDENCE,
  POINTING_IGNORE_TARGET_INITIAL_MS,
  POINTING_MAX_FEATURE_VARIANCE,
  POINTING_MIN_VALID_FRAMES,
  POINTING_SIDE_MIN_CONFIDENCE,
  POINTING_STABLE_DURATION_MS,
  POINTING_STABLE_WINDOW_FRAMES
} from "./constants";
import { extractPointingFeatureVector } from "./featureSchema";
import { projectFrontDirectionAim } from "./frontDirectionProjection";
import type {
  PointingCalibrationSample,
  PointingCalibrationTarget,
  PointingFeatureInput,
  PointingFeatureVector
} from "./types";

export type PointingSampleRejectReason =
  | "initialDelay"
  | "noFrontFeature"
  | "lowFrontConfidence"
  | "insufficientValidFrames"
  | "unstableFeatureVariance"
  | "accepted";

interface PointingSampleWindowFrame {
  readonly timestampMs: number;
  readonly featureVector: PointingFeatureVector | undefined;
}

export interface PointingSampleWindowState {
  readonly frames: readonly PointingSampleWindowFrame[];
  readonly acceptedSample: PointingCalibrationSample | undefined;
  readonly reason: PointingSampleRejectReason;
}

interface PointingSampleWindowInput extends PointingFeatureInput {
  readonly target: PointingCalibrationTarget;
  readonly timestampMs: number;
  readonly targetShownAtMs: number;
}

export const createInitialPointingSampleWindow = (): PointingSampleWindowState => ({
  frames: [],
  acceptedSample: undefined,
  reason: "insufficientValidFrames"
});

const flattenVector = (vector: PointingFeatureVector): readonly number[] => [
  ...vector.front,
  ...(vector.side ?? [])
];

const featureVariance = (
  frames: readonly PointingSampleWindowFrame[]
): number => {
  const validVectors = frames
    .map((frame) => frame.featureVector)
    .filter((vector): vector is PointingFeatureVector => vector !== undefined);

  if (validVectors.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const rows = validVectors.map(flattenVector);
  const width = Math.min(...rows.map((row) => row.length));
  let total = 0;

  for (let column = 0; column < width; column += 1) {
    const values = rows.map((row) => row[column] ?? 0);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    total +=
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
  }

  return total / width;
};

const latestValidFeature = (
  frames: readonly PointingSampleWindowFrame[]
): PointingFeatureVector | undefined =>
  [...frames].reverse().find((frame) => frame.featureVector !== undefined)
    ?.featureVector;

export const updatePointingSampleWindow = (
  state: PointingSampleWindowState,
  input: PointingSampleWindowInput
): PointingSampleWindowState => {
  if (
    input.timestampMs - input.targetShownAtMs <
    POINTING_IGNORE_TARGET_INITIAL_MS
  ) {
    return {
      frames: state.frames,
      acceptedSample: undefined,
      reason: "initialDelay"
    };
  }

  const extracted = extractPointingFeatureVector(input);
  const featureVector =
    extracted !== undefined &&
    extracted.quality.frontConfidence >= POINTING_FRONT_MIN_CONFIDENCE
      ? extracted.quality.sideConfidence !== undefined &&
        extracted.quality.sideConfidence < POINTING_SIDE_MIN_CONFIDENCE
        ? { ...extracted, side: undefined, quality: { ...extracted.quality, hasSide: false } }
        : extracted
      : undefined;
  const frontDetection = input.frontDetection;

  const frames = [
    ...state.frames,
    { timestampMs: input.timestampMs, featureVector }
  ].slice(-POINTING_STABLE_WINDOW_FRAMES);

  if (extracted === undefined || frontDetection === undefined) {
    return { frames, acceptedSample: undefined, reason: "noFrontFeature" };
  }

  if (extracted.quality.frontConfidence < POINTING_FRONT_MIN_CONFIDENCE) {
    return {
      frames,
      acceptedSample: undefined,
      reason: "lowFrontConfidence"
    };
  }

  const validFrames = frames.filter((frame) => frame.featureVector !== undefined);

  if (
    validFrames.length < POINTING_MIN_VALID_FRAMES ||
    input.timestampMs - validFrames[0]!.timestampMs < POINTING_STABLE_DURATION_MS
  ) {
    return {
      frames,
      acceptedSample: undefined,
      reason: "insufficientValidFrames"
    };
  }

  if (featureVariance(frames) > POINTING_MAX_FEATURE_VARIANCE) {
    return {
      frames,
      acceptedSample: undefined,
      reason: "unstableFeatureVariance"
    };
  }

  const acceptedVector = latestValidFeature(frames);

  if (acceptedVector === undefined) {
    return {
      frames,
      acceptedSample: undefined,
      reason: "noFrontFeature"
    };
  }

  return {
    frames,
    acceptedSample: {
      target: input.target,
      featureVector: acceptedVector,
      indexTipAimPointNormalized:
        frontDetection.filteredFrame.landmarks.indexTip,
      frontDirectionAimPointNormalized: projectFrontDirectionAim({
        detection: frontDetection
      }),
      timestampMs: input.timestampMs,
      mode: acceptedVector.side === undefined ? "frontOnly" : "frontSide"
    },
    reason: "accepted"
  };
};
```

Update `src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./featureSchema";
export * from "./frontDirectionProjection";
export * from "./sampleAcceptance";
export * from "./targets";
export type * from "./types";
```

- [ ] **Step 4: Run sample tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/sampleAcceptance.test.ts
npm run typecheck
```

Expected: both commands PASS. The typecheck is required here because accepted sample creation narrows optional `frontDetection` before reading index-tip landmarks.

Commit:

```bash
git add src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): accept stable calibration samples"
```

---

## Task 5: Weighted K-Nearest Mapper

**Files:**
- Create: `src/features/pointing-calibration/weightedKnnMapper.ts`
- Create: `tests/unit/features/pointing-calibration/weightedKnnMapper.test.ts`
- Modify: `src/features/pointing-calibration/index.ts`

- [ ] **Step 1: Write failing mapper tests**

`tests/unit/features/pointing-calibration/weightedKnnMapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POINTING_CALIBRATION_TARGETS,
  createWeightedKnnPointingMapper
} from "../../../../src/features/pointing-calibration";
import type {
  PointingCalibrationSample,
  PointingFeatureVector
} from "../../../../src/features/pointing-calibration";

const vectorFor = (
  value: number,
  side = true
): PointingFeatureVector => ({
  schemaVersion: "POINTING_FEATURE_SCHEMA_V1",
  front: [value, value + 0.1],
  side: side ? [value + 0.2] : undefined,
  quality: {
    frontConfidence: 0.9,
    sideConfidence: side ? 0.8 : undefined,
    hasSide: side,
    sideViewQuality: side ? "good" : undefined
  }
});

const sampleFor = (
  value: number,
  targetIndex: number,
  side = true
): PointingCalibrationSample => ({
  target: POINTING_CALIBRATION_TARGETS[targetIndex],
  featureVector: vectorFor(value, side),
  indexTipAimPointNormalized: POINTING_CALIBRATION_TARGETS[targetIndex].pointNormalized,
  frontDirectionAimPointNormalized: POINTING_CALIBRATION_TARGETS[targetIndex].pointNormalized,
  timestampMs: value * 1000,
  mode: side ? "frontSide" : "frontOnly"
});

describe("weighted k-nearest pointing mapper", () => {
  it("returns the nearest calibrated target for matching side features", () => {
    const mapper = createWeightedKnnPointingMapper([
      sampleFor(0.1, 0),
      sampleFor(0.5, 1),
      sampleFor(0.9, 2)
    ]);

    const result = mapper.estimate(vectorFor(0.5));

    expect(result?.mode).toBe("frontSide");
    expect(result?.aimPointNormalized).toEqual(
      POINTING_CALIBRATION_TARGETS[1].pointNormalized
    );
    expect(result?.calibrationConfidence).toBeGreaterThan(0.9);
  });

  it("uses front-only samples when side features are missing", () => {
    const mapper = createWeightedKnnPointingMapper([
      sampleFor(0.2, 0, false),
      sampleFor(0.8, 4, false)
    ]);

    const result = mapper.estimate(vectorFor(0.8, false));

    expect(result?.mode).toBe("frontOnly");
    expect(result?.aimPointNormalized).toEqual(
      POINTING_CALIBRATION_TARGETS[4].pointNormalized
    );
  });

  it("returns undefined when no compatible samples exist", () => {
    const mapper = createWeightedKnnPointingMapper([sampleFor(0.2, 0, true)]);

    expect(mapper.estimate(vectorFor(0.2, false))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run mapper test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/weightedKnnMapper.test.ts
```

Expected: FAIL because `createWeightedKnnPointingMapper` is missing.

- [ ] **Step 3: Implement weighted mapper**

`src/features/pointing-calibration/weightedKnnMapper.ts`:

```ts
import {
  POINTING_KNN_EPSILON,
  POINTING_KNN_MIN_STD_DEV,
  POINTING_KNN_REJECTION_DISTANCE
} from "./constants";
import type {
  PointingAimEstimate,
  PointingCalibrationSample,
  PointingFeatureVector
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const flatten = (vector: PointingFeatureVector): readonly number[] => [
  ...vector.front,
  ...(vector.side ?? [])
];

const compatible = (
  sample: PointingCalibrationSample,
  vector: PointingFeatureVector
): boolean => (vector.side === undefined ? sample.featureVector.side === undefined : sample.featureVector.side !== undefined);

const meanAndStdDev = (
  rows: readonly (readonly number[])[]
): { readonly mean: readonly number[]; readonly stdDev: readonly number[] } => {
  const width = Math.min(...rows.map((row) => row.length));
  const mean = Array.from({ length: width }, (_, column) =>
    rows.reduce((sum, row) => sum + (row[column] ?? 0), 0) / rows.length
  );
  const stdDev = mean.map((meanValue, column) => {
    const variance =
      rows.reduce((sum, row) => sum + ((row[column] ?? 0) - meanValue) ** 2, 0) /
      rows.length;
    const candidate = Math.sqrt(variance);
    return candidate < POINTING_KNN_MIN_STD_DEV ? 1 : candidate;
  });

  return { mean, stdDev };
};

const zScore = (
  row: readonly number[],
  mean: readonly number[],
  stdDev: readonly number[]
): readonly number[] =>
  mean.map((meanValue, index) => ((row[index] ?? 0) - meanValue) / (stdDev[index] ?? 1));

const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(...a.map((value, index) => value - (b[index] ?? 0)));

export interface WeightedKnnPointingMapper {
  estimate(vector: PointingFeatureVector): PointingAimEstimate | undefined;
}

export const createWeightedKnnPointingMapper = (
  samples: readonly PointingCalibrationSample[]
): WeightedKnnPointingMapper => ({
  estimate(vector) {
    const compatibleSamples = samples.filter((sample) => compatible(sample, vector));

    if (compatibleSamples.length === 0) {
      return undefined;
    }

    const rows = compatibleSamples.map((sample) => flatten(sample.featureVector));
    const { mean, stdDev } = meanAndStdDev(rows);
    const current = zScore(flatten(vector), mean, stdDev);
    const ranked = compatibleSamples
      .map((sample) => ({
        sample,
        distance: distance(current, zScore(flatten(sample.featureVector), mean, stdDev))
      }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = ranked[0];

    if (nearest === undefined) {
      return undefined;
    }

    const neighbors = ranked.slice(0, Math.min(3, ranked.length));
    const totalWeight = neighbors.reduce(
      (sum, item) => sum + 1 / (item.distance + POINTING_KNN_EPSILON),
      0
    );
    const aimPointNormalized = neighbors.reduce(
      (point, item) => {
        const weight = 1 / (item.distance + POINTING_KNN_EPSILON);
        return {
          x: point.x + item.sample.target.pointNormalized.x * weight,
          y: point.y + item.sample.target.pointNormalized.y * weight
        };
      },
      { x: 0, y: 0 }
    );

    return {
      aimPointNormalized: {
        x: clamp(aimPointNormalized.x / totalWeight, 0, 1),
        y: clamp(aimPointNormalized.y / totalWeight, 0, 1)
      },
      calibrationConfidence: clamp(
        1 - nearest.distance / POINTING_KNN_REJECTION_DISTANCE,
        0,
        1
      ),
      nearestDistance: nearest.distance,
      mode: vector.side === undefined ? "frontOnly" : "frontSide"
    };
  }
});
```

Update `src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./featureSchema";
export * from "./frontDirectionProjection";
export * from "./sampleAcceptance";
export * from "./targets";
export * from "./weightedKnnMapper";
export type * from "./types";
```

- [ ] **Step 4: Run mapper tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/weightedKnnMapper.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): map calibration samples with weighted knn"
```

---

## Task 6: Calibration Controller and Validation Summary

**Files:**
- Create: `src/features/pointing-calibration/pointingCalibrationController.ts`
- Create: `tests/unit/features/pointing-calibration/pointingCalibrationController.test.ts`
- Modify: `src/features/pointing-calibration/types.ts`
- Modify: `src/features/pointing-calibration/index.ts`

- [ ] **Step 1: Extend types for controller state**

Add to `src/features/pointing-calibration/types.ts`:

```ts
export type PointingCalibrationPhase =
  | "idle"
  | "collectingCalibration"
  | "collectingValidation"
  | "ready"
  | "needsRetry";

export interface PointingCalibrationState {
  readonly phase: PointingCalibrationPhase;
  readonly currentTarget: PointingCalibrationTarget | undefined;
  readonly targetShownAtMs: number | undefined;
  readonly calibrationSamples: readonly PointingCalibrationSample[];
  readonly validationSamples: readonly PointingCalibrationSample[];
  readonly frontOnlyEstimate: PointingAimEstimate | undefined;
  readonly frontSideEstimate: PointingAimEstimate | undefined;
  readonly validationSummary: PointingValidationSummary | undefined;
  readonly lastReason: string | undefined;
  readonly validationAcceptedCountForCurrentTarget: number;
}
```

- [ ] **Step 2: Write failing controller tests**

`tests/unit/features/pointing-calibration/pointingCalibrationController.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createInitialPointingCalibrationState,
  startPointingCalibration,
  updatePointingCalibration
} from "../../../../src/features/pointing-calibration";
import {
  createPointingFrontDetection,
  createPointingSideDetection
} from "./testFactory";

const feedStableTarget = (
  state: ReturnType<typeof createInitialPointingCalibrationState>,
  startMs: number
) => {
  let next = state;

  for (let i = 0; i < 10; i += 1) {
    next = updatePointingCalibration(next, {
      timestampMs: startMs + 600 + i * 40,
      frontDetection: createPointingFrontDetection(i * 0.0001, i * 0.0001),
      sideDetection: createPointingSideDetection(i * 0.0001, i * 0.0001)
    });
  }

  return next;
};

describe("pointing calibration controller", () => {
  it("starts at the first calibration target", () => {
    const state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      100
    );

    expect(state.phase).toBe("collectingCalibration");
    expect(state.currentTarget?.id).toBe("center");
    expect(state.targetShownAtMs).toBe(100);
  });

  it("advances through calibration targets as samples are accepted", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    state = feedStableTarget(state, 0);

    expect(state.calibrationSamples).toHaveLength(1);
    expect(state.currentTarget?.id).toBe("topLeft");
  });

  it("enters validation after five calibration samples", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 5; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    expect(state.phase).toBe("collectingValidation");
    expect(state.calibrationSamples).toHaveLength(5);
    expect(state.currentTarget?.id).toBe("validationLeft");
  });

  it("computes validation summary when validation samples finish", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 14; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    expect(["ready", "needsRetry"]).toContain(state.phase);
    expect(state.validationSummary?.targetResults).toHaveLength(3);
    expect(state.validationSummary?.targetResults[0]?.sampleCount).toBe(3);
    expect(
      state.validationSummary?.indexTipMeanAbsoluteErrorPx
    ).toBeTypeOf("number");
    expect(
      state.validationSummary?.frontSideMeanAbsoluteErrorPx
    ).toBeTypeOf("number");
  });

  it("continues collecting the same validation target until three samples are accepted", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 6; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    expect(state.phase).toBe("collectingValidation");
    expect(state.currentTarget?.id).toBe("validationLeft");
    expect(state.validationAcceptedCountForCurrentTarget).toBe(1);
  });

  it("enters needsRetry when validation misses the front+side readiness thresholds", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 14; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    expect(state.validationSummary).toBeDefined();

    if (state.validationSummary?.frontSideReady === false) {
      expect(state.phase).toBe("needsRetry");
      expect(state.validationSummary.retryReason).toBeDefined();
    } else {
      expect(state.phase).toBe("ready");
    }
  });

  it("always reports a retry reason when validation is not front-side ready", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 14; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    if (state.validationSummary?.frontSideReady === false) {
      expect(state.validationSummary.retryReason).toBeDefined();
    }
  });

  it("derives front-only estimates from front+side calibration samples when side is lost", () => {
    let state = startPointingCalibration(
      createInitialPointingCalibrationState(),
      0
    );

    for (let targetIndex = 0; targetIndex < 5; targetIndex += 1) {
      state = feedStableTarget(state, targetIndex * 2000);
    }

    state = updatePointingCalibration(state, {
      timestampMs: 12000,
      frontDetection: createPointingFrontDetection(),
      sideDetection: undefined
    });

    expect(state.frontOnlyEstimate).toBeDefined();
  });
});
```

- [ ] **Step 3: Run controller tests and verify they fail**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/pointingCalibrationController.test.ts
```

Expected: FAIL because controller functions are missing.

- [ ] **Step 4: Implement controller**

`src/features/pointing-calibration/pointingCalibrationController.ts`:

```ts
import type {
  FrontHandDetection,
  SideHandDetection
} from "../../shared/types/hand";
import {
  POINTING_CALIBRATION_TARGETS,
  POINTING_VALIDATION_TARGETS
} from "./targets";
import {
  POINTING_FAILURE_IMPROVEMENT_FLOOR_RATIO,
  POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO,
  POINTING_MAX_MEAN_ABSOLUTE_ERROR_PX,
  POINTING_MAX_SINGLE_TARGET_ERROR_PX,
  POINTING_VALIDATION_VIEWPORT
} from "./constants";
import {
  createInitialPointingSampleWindow,
  updatePointingSampleWindow,
  type PointingSampleWindowState
} from "./sampleAcceptance";
import {
  createWeightedKnnPointingMapper
} from "./weightedKnnMapper";
import {
  extractPointingFeatureVector
} from "./featureSchema";
import type {
  PointingAimEstimate,
  PointingCalibrationSample,
  PointingCalibrationState,
  PointingCalibrationTarget,
  PointingValidationSummary
} from "./types";

interface InternalState extends PointingCalibrationState {
  readonly sampleWindow: PointingSampleWindowState;
}

interface UpdateInput {
  readonly timestampMs: number;
  readonly frontDetection: FrontHandDetection | undefined;
  readonly sideDetection: SideHandDetection | undefined;
}

export const createInitialPointingCalibrationState = (): InternalState => ({
  phase: "idle",
  currentTarget: undefined,
  targetShownAtMs: undefined,
  calibrationSamples: [],
  validationSamples: [],
  frontOnlyEstimate: undefined,
  frontSideEstimate: undefined,
  validationSummary: undefined,
  lastReason: undefined,
  validationAcceptedCountForCurrentTarget: 0,
  sampleWindow: createInitialPointingSampleWindow()
});

const targetAt = (
  targets: readonly PointingCalibrationTarget[],
  index: number
): PointingCalibrationTarget | undefined => targets[index];

export const startPointingCalibration = (
  state: InternalState,
  timestampMs: number
): InternalState => ({
  ...state,
  phase: "collectingCalibration",
  currentTarget: POINTING_CALIBRATION_TARGETS[0],
  targetShownAtMs: timestampMs,
  calibrationSamples: [],
  validationSamples: [],
  validationSummary: undefined,
  validationAcceptedCountForCurrentTarget: 0,
  sampleWindow: createInitialPointingSampleWindow(),
  lastReason: undefined
});

export const resetPointingCalibration = (): InternalState =>
  createInitialPointingCalibrationState();

const pixelError = (
  actual: { readonly x: number; readonly y: number },
  expected: { readonly x: number; readonly y: number }
): number =>
  Math.hypot(
    (actual.x - expected.x) * POINTING_VALIDATION_VIEWPORT.width,
    (actual.y - expected.y) * POINTING_VALIDATION_VIEWPORT.height
  );

const mean = (values: readonly number[]): number | undefined =>
  values.length === 0
    ? undefined
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const medianPoint = (
  values: readonly { readonly x: number; readonly y: number }[]
): { readonly x: number; readonly y: number } | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const median = (items: readonly number[]): number => {
    const sorted = [...items].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };

  return {
    x: median(values.map((value) => value.x)),
    y: median(values.map((value) => value.y))
  };
};

const estimateWith = (
  samples: readonly PointingCalibrationSample[],
  validationSample: PointingCalibrationSample,
  mode: "frontOnly" | "frontSide"
): PointingAimEstimate | undefined => {
  const mapper = createWeightedKnnPointingMapper(
    mode === "frontOnly"
      ? samples.map((sample) => ({
          ...sample,
          featureVector: {
            ...sample.featureVector,
            side: undefined,
            quality: { ...sample.featureVector.quality, hasSide: false }
          },
          mode: "frontOnly" as const
        }))
      : samples.filter((sample) => sample.mode === "frontSide")
  );
  const vector =
    mode === "frontOnly"
      ? {
          ...validationSample.featureVector,
          side: undefined,
          quality: {
            ...validationSample.featureVector.quality,
            hasSide: false
          }
        }
      : validationSample.featureVector;

  return mapper.estimate(vector);
};

const nextCollectingState = (
  state: InternalState,
  sample: PointingCalibrationSample,
  timestampMs: number
): InternalState => {
  if (state.phase === "collectingCalibration") {
    const calibrationSamples = [...state.calibrationSamples, sample];
    const nextTarget = targetAt(
      POINTING_CALIBRATION_TARGETS,
      calibrationSamples.length
    );

    if (nextTarget !== undefined) {
      return {
        ...state,
        currentTarget: nextTarget,
        targetShownAtMs: timestampMs,
        calibrationSamples,
        sampleWindow: createInitialPointingSampleWindow(),
        lastReason: "accepted"
      };
    }

    return {
      ...state,
      phase: "collectingValidation",
      currentTarget: POINTING_VALIDATION_TARGETS[0],
      targetShownAtMs: timestampMs,
      calibrationSamples,
      sampleWindow: createInitialPointingSampleWindow(),
      lastReason: "accepted"
    };
  }

  const validationSamples = [...state.validationSamples, sample];
  const acceptedForTarget = validationSamples.filter(
    (item) => item.target.id === sample.target.id
  );

  if (acceptedForTarget.length < 3) {
    return {
      ...state,
      validationSamples,
      validationAcceptedCountForCurrentTarget: acceptedForTarget.length,
      sampleWindow: createInitialPointingSampleWindow(),
      lastReason: "accepted"
    };
  }

  const nextTarget = targetAt(
    POINTING_VALIDATION_TARGETS,
    POINTING_VALIDATION_TARGETS.findIndex(
      (target) => target.id === sample.target.id
    ) + 1
  );

  if (nextTarget !== undefined) {
    return {
      ...state,
      currentTarget: nextTarget,
      targetShownAtMs: timestampMs,
      validationSamples,
      validationAcceptedCountForCurrentTarget: 0,
      sampleWindow: createInitialPointingSampleWindow(),
      lastReason: "accepted"
    };
  }

  const validationSummary = buildPointingValidationSummary({
    calibrationSamples: state.calibrationSamples,
    validationSamples
  });

  return {
    ...state,
    phase: validationSummary.frontSideReady ? "ready" : "needsRetry",
    currentTarget: undefined,
    validationSamples,
    validationSummary,
    validationAcceptedCountForCurrentTarget: 0,
    sampleWindow: createInitialPointingSampleWindow(),
    lastReason: "accepted"
  };
};

export const buildPointingValidationSummary = ({
  calibrationSamples,
  validationSamples
}: {
  readonly calibrationSamples: readonly PointingCalibrationSample[];
  readonly validationSamples: readonly PointingCalibrationSample[];
}): PointingValidationSummary => {
  const targetResults = POINTING_VALIDATION_TARGETS.map((target) => {
    const samplesForTarget = validationSamples.filter(
      (sample) => sample.target.id === target.id
    );
    const frontOnlyPoints = samplesForTarget
      .map((sample) => estimateWith(calibrationSamples, sample, "frontOnly"))
      .filter((estimate): estimate is PointingAimEstimate => estimate !== undefined)
      .map((estimate) => estimate.aimPointNormalized);
    const frontSidePoints = samplesForTarget
      .map((sample) =>
        sample.featureVector.side === undefined
          ? undefined
          : estimateWith(calibrationSamples, sample, "frontSide")
      )
      .filter((estimate): estimate is PointingAimEstimate => estimate !== undefined)
      .map((estimate) => estimate.aimPointNormalized);
    const medianIndexTip = medianPoint(
      samplesForTarget.map((sample) => sample.indexTipAimPointNormalized)
    );
    const medianFrontDirection = medianPoint(
      samplesForTarget.map((sample) => sample.frontDirectionAimPointNormalized)
    );
    const medianFrontOnly = medianPoint(frontOnlyPoints) ?? medianFrontDirection;
    const medianFrontSide = medianPoint(frontSidePoints);

    return {
      target,
      indexTipErrorPx:
        medianIndexTip === undefined
          ? Number.POSITIVE_INFINITY
          : pixelError(medianIndexTip, target.pointNormalized),
      frontOnlyErrorPx:
        medianFrontOnly === undefined
          ? undefined
          : pixelError(medianFrontOnly, target.pointNormalized),
      frontSideErrorPx:
        medianFrontSide === undefined
          ? undefined
          : pixelError(medianFrontSide, target.pointNormalized),
      sampleCount: samplesForTarget.length
    };
  });
  const indexTipMeanAbsoluteErrorPx = mean(
    targetResults.map((result) => result.indexTipErrorPx)
  );
  const frontOnlyMeanAbsoluteErrorPx = mean(
    targetResults
      .map((result) => result.frontOnlyErrorPx)
      .filter((value): value is number => value !== undefined)
  );
  const frontSideMeanAbsoluteErrorPx = mean(
    targetResults
      .map((result) => result.frontSideErrorPx)
      .filter((value): value is number => value !== undefined)
  );
  const worstFrontSideError = Math.max(
    ...targetResults.map((result) => result.frontSideErrorPx ?? Number.POSITIVE_INFINITY)
  );
  const frontSideImprovement =
    indexTipMeanAbsoluteErrorPx !== undefined &&
    frontSideMeanAbsoluteErrorPx !== undefined &&
    indexTipMeanAbsoluteErrorPx > 0
      ? 1 - frontSideMeanAbsoluteErrorPx / indexTipMeanAbsoluteErrorPx
      : undefined;
  const frontSideImprovementOverFrontOnly =
    frontOnlyMeanAbsoluteErrorPx !== undefined &&
    frontSideMeanAbsoluteErrorPx !== undefined &&
    frontOnlyMeanAbsoluteErrorPx > 0
      ? 1 - frontSideMeanAbsoluteErrorPx / frontOnlyMeanAbsoluteErrorPx
      : undefined;
  const retryReason = (() => {
    if (targetResults.some((result) => result.sampleCount < 3)) {
      return "insufficientValidationSamples";
    }

    if (worstFrontSideError > POINTING_MAX_SINGLE_TARGET_ERROR_PX) {
      return "singleTargetTooFar";
    }

    if (
      frontSideMeanAbsoluteErrorPx !== undefined &&
      frontSideMeanAbsoluteErrorPx > POINTING_MAX_MEAN_ABSOLUTE_ERROR_PX
    ) {
      return "frontSideTooInaccurate";
    }

    if (
      frontSideMeanAbsoluteErrorPx === undefined ||
      frontSideImprovement === undefined ||
      frontSideImprovementOverFrontOnly === undefined
    ) {
      return "missingImprovementBaseline";
    }

    if (frontSideImprovement < POINTING_FAILURE_IMPROVEMENT_FLOOR_RATIO) {
      return "frontSideRegression";
    }

    if (
      frontSideImprovement < POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO
    ) {
      return "frontSideTooInaccurate";
    }

    if (
      frontSideImprovementOverFrontOnly <
        POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO
    ) {
      return "frontSideRegression";
    }

    return undefined;
  })();

  return {
    targetResults,
    indexTipMeanAbsoluteErrorPx,
    frontOnlyMeanAbsoluteErrorPx,
    frontSideMeanAbsoluteErrorPx,
    frontSideImprovementOverIndexTip: frontSideImprovement,
    frontSideImprovementOverFrontOnly,
    frontOnlyReady: frontOnlyMeanAbsoluteErrorPx !== undefined,
    frontSideReady:
      retryReason === undefined &&
      frontSideMeanAbsoluteErrorPx !== undefined &&
      frontSideMeanAbsoluteErrorPx <= POINTING_MAX_MEAN_ABSOLUTE_ERROR_PX &&
      worstFrontSideError <= POINTING_MAX_SINGLE_TARGET_ERROR_PX &&
      frontSideImprovement !== undefined &&
      frontSideImprovement >= POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO &&
      frontSideImprovementOverFrontOnly !== undefined &&
      frontSideImprovementOverFrontOnly >=
        POINTING_FRONT_SIDE_REQUIRED_IMPROVEMENT_RATIO,
    retryReason
  };
};

export const updatePointingCalibration = (
  state: InternalState,
  input: UpdateInput
): InternalState => {
  const featureVector = extractPointingFeatureVector(input);
  const frontOnlySamples = state.calibrationSamples.map((sample) => ({
    ...sample,
    featureVector: {
      ...sample.featureVector,
      side: undefined,
      quality: { ...sample.featureVector.quality, hasSide: false }
    },
    mode: "frontOnly" as const
  }));
  const frontOnlyEstimate =
    featureVector === undefined
      ? undefined
      : createWeightedKnnPointingMapper(frontOnlySamples).estimate({
          ...featureVector,
          side: undefined,
          quality: { ...featureVector.quality, hasSide: false }
        });
  const frontSideEstimate =
    featureVector === undefined
      ? undefined
      : createWeightedKnnPointingMapper(
          state.calibrationSamples.filter((sample) => sample.mode === "frontSide")
        ).estimate(featureVector);

  if (
    state.phase !== "collectingCalibration" &&
    state.phase !== "collectingValidation"
  ) {
    return { ...state, frontOnlyEstimate, frontSideEstimate };
  }

  if (state.currentTarget === undefined || state.targetShownAtMs === undefined) {
    return state;
  }

  const sampleWindow = updatePointingSampleWindow(state.sampleWindow, {
    target: state.currentTarget,
    timestampMs: input.timestampMs,
    targetShownAtMs: state.targetShownAtMs,
    frontDetection: input.frontDetection,
    sideDetection: input.sideDetection
  });

  if (sampleWindow.acceptedSample === undefined) {
    return {
      ...state,
      frontOnlyEstimate,
      frontSideEstimate,
      sampleWindow,
      lastReason: sampleWindow.reason
    };
  }

  return nextCollectingState(state, sampleWindow.acceptedSample, input.timestampMs);
};
```

Update `src/features/pointing-calibration/index.ts`:

```ts
export * from "./constants";
export * from "./featureSchema";
export * from "./frontDirectionProjection";
export * from "./pointingCalibrationController";
export * from "./sampleAcceptance";
export * from "./targets";
export * from "./weightedKnnMapper";
export type * from "./types";
```

- [ ] **Step 5: Run controller tests and commit**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration/pointingCalibrationController.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/pointing-calibration tests/unit/features/pointing-calibration
git commit -m "feat(pointing): add calibration controller"
```

---

## Task 7: Diagnostic Panel Rendering

**Files:**
- Create: `src/features/diagnostic-workbench/renderPointingCalibrationPanel.ts`
- Create: `tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts`
- Modify: `src/features/diagnostic-workbench/workbenchInspectionState.ts`
- Modify: `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify: `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
- Modify: `src/styles/diagnostic.css`

- [ ] **Step 1: Write failing panel render tests**

`tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createInitialPointingCalibrationState,
  startPointingCalibration
} from "../../../../src/features/pointing-calibration";
import { renderPointingCalibrationPanel } from "../../../../src/features/diagnostic-workbench/renderPointingCalibrationPanel";

describe("renderPointingCalibrationPanel", () => {
  it("renders idle controls", () => {
    const html = renderPointingCalibrationPanel(
      createInitialPointingCalibrationState()
    );

    expect(html).toContain("pointing calibration");
    expect(html).toContain('data-wb-action="startPointingCalibration"');
    expect(html).toContain("idle");
  });

  it("renders the current target during collection", () => {
    const html = renderPointingCalibrationPanel(
      startPointingCalibration(createInitialPointingCalibrationState(), 100)
    );

    expect(html).toContain("center");
    expect(html).toContain("0.500");
    expect(html).toContain('data-wb-action="resetPointingCalibration"');
  });
});
```

- [ ] **Step 2: Run render test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts
```

Expected: FAIL because renderer is missing.

- [ ] **Step 3: Implement panel renderer**

`src/features/diagnostic-workbench/renderPointingCalibrationPanel.ts`:

```ts
import { escapeHTML } from "../../shared/browser/escapeHTML";
import type { PointingCalibrationState } from "../pointing-calibration";

const formatPoint = (
  point: { readonly x: number; readonly y: number } | undefined
): string =>
  point === undefined ? "-" : `${point.x.toFixed(3)}, ${point.y.toFixed(3)}`;

export const renderPointingCalibrationPanel = (
  state: PointingCalibrationState
): string => `
  <section id="wb-pointing-calibration-panel" class="wb-debug-panel wb-pointing-panel">
    <h3>pointing calibration</h3>
    <p>phase: ${escapeHTML(state.phase)}</p>
    <p>target: ${escapeHTML(state.currentTarget?.id ?? "-")}</p>
    <p>target point: ${escapeHTML(formatPoint(state.currentTarget?.pointNormalized))}</p>
    <p>calibration samples: ${String(state.calibrationSamples.length)}</p>
    <p>validation samples: ${String(state.validationSamples.length)}</p>
    <p>front-only estimate: ${escapeHTML(formatPoint(state.frontOnlyEstimate?.aimPointNormalized))}</p>
    <p>front+side estimate: ${escapeHTML(formatPoint(state.frontSideEstimate?.aimPointNormalized))}</p>
    <p>last reason: ${escapeHTML(state.lastReason ?? "-")}</p>
    <div class="wb-controls">
      <button class="wb-btn" data-wb-action="startPointingCalibration">準備体操を開始</button>
      <button class="wb-btn wb-btn-secondary" data-wb-action="resetPointingCalibration">リセット</button>
    </div>
  </section>
`;
```

- [ ] **Step 4: Add panel to inspection state and workbench HTML**

Modify `src/features/diagnostic-workbench/workbenchInspectionState.ts`:

```ts
import type {
  PointingCalibrationState
} from "../pointing-calibration";

export interface WorkbenchInspectionState {
  // existing fields...
  readonly pointingCalibration: PointingCalibrationState;
}
```

Modify `src/features/diagnostic-workbench/renderWorkbench.ts`:

```ts
import {
  createInitialPointingCalibrationState
} from "../pointing-calibration";
import { renderPointingCalibrationPanel } from "./renderPointingCalibrationPanel";

const defaultInspectionState: WorkbenchInspectionState = {
  // existing fields...
  pointingCalibration: createInitialPointingCalibrationState()
};

// In renderPreviewing, after renderFusionPanel:
${renderPointingCalibrationPanel(inspection.pointingCalibration)}
```

Update all test helper `WorkbenchInspectionState` literals in `renderWorkbench.test.ts` by adding:

```ts
pointingCalibration: createInitialPointingCalibrationState()
```

Import `createInitialPointingCalibrationState` from `../../../../src/features/pointing-calibration`.

- [ ] **Step 5: Add minimal panel CSS**

Append to `src/styles/diagnostic.css`:

```css
.wb-pointing-panel {
  border-left: 4px solid #2d9a5b;
}
```

- [ ] **Step 6: Run render tests and commit**

Run:

```bash
npm test -- tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/diagnostic-workbench src/styles/diagnostic.css tests/unit/features/diagnostic-workbench
git commit -m "feat(pointing): render diagnostic calibration panel"
```

---

## Task 8: Live Diagnostic Wiring

**Files:**
- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify: `src/diagnostic-main.ts`
- Modify: `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
- Modify: `tests/integration/importBoundaries.test.ts`

- [ ] **Step 1: Write failing live inspection test**

Add to `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`:

```ts
it("exposes pointing calibration controls in inspection state", () => {
  const inspection = createLiveLandmarkInspection();

  expect(inspection.getState().pointingCalibration.phase).toBe("idle");
  inspection.startPointingCalibration(100);
  expect(inspection.getState().pointingCalibration.phase).toBe(
    "collectingCalibration"
  );
  inspection.resetPointingCalibration();
  expect(inspection.getState().pointingCalibration.phase).toBe("idle");

  inspection.destroy();
});
```

If the current test file does not import `createLiveLandmarkInspection`, reuse the existing import style in that file.

- [ ] **Step 2: Run live inspection test and verify it fails**

Run:

```bash
npm test -- tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts
```

Expected: FAIL because `startPointingCalibration` and `resetPointingCalibration` are missing.

- [ ] **Step 3: Wire controller into live inspection**

Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts` imports:

```ts
import {
  createInitialPointingCalibrationState,
  resetPointingCalibration,
  startPointingCalibration,
  updatePointingCalibration
} from "../pointing-calibration";
import { renderPointingCalibrationPanel } from "./renderPointingCalibrationPanel";
```

Extend `LiveLandmarkInspection` interface:

```ts
startPointingCalibration(timestampMs?: number): void;
resetPointingCalibration(): void;
```

Add to `createInitialInspectionState()`:

```ts
pointingCalibration: createInitialPointingCalibrationState()
```

Add in `updateDom()`:

```ts
updateOuterHTML(
  "wb-pointing-calibration-panel",
  renderPointingCalibrationPanel(inspectionState.pointingCalibration)
);
```

Add helper inside `createLiveLandmarkInspection()`:

```ts
const updatePointingFromLatestDetections = (timestampMs: number): void => {
  inspectionState = {
    ...inspectionState,
    pointingCalibration: updatePointingCalibration(
      inspectionState.pointingCalibration,
      {
        timestampMs,
        frontDetection: inspectionState.frontDetection,
        sideDetection: inspectionState.sideDetection
      }
    )
  };
};
```

Call it near the end of `setLaneDetection()` after front or side detection has been applied. Use the same `timestamp.frameTimestampMs`.

When resetting tracking state, preserve pointing calibration only while the same preview devices are active. If `resetCalibration` is true, reset pointing too:

```ts
const pointingCalibration =
  options.resetCalibration === true
    ? createInitialPointingCalibrationState()
    : inspectionState.pointingCalibration;

inspectionState = {
  ...createInitialInspectionState(),
  ...calibrationPatch,
  sideTriggerTuning,
  fusionTuning,
  pointingCalibration
};
```

Add returned methods:

```ts
startPointingCalibration(timestampMs = performance.now()) {
  setInspection({
    pointingCalibration: startPointingCalibration(
      inspectionState.pointingCalibration,
      timestampMs
    )
  });
},
resetPointingCalibration() {
  setInspection({ pointingCalibration: resetPointingCalibration() });
},
```

If naming conflicts with imported functions, alias imports:

```ts
startPointingCalibration as startPointingCalibrationState
```

- [ ] **Step 4: Wire diagnostic buttons**

Modify `src/diagnostic-main.ts` click handler:

```ts
case "startPointingCalibration":
  liveInspection.startPointingCalibration();
  render();
  break;
case "resetPointingCalibration":
  liveInspection.resetPointingCalibration();
  render();
  break;
```

- [ ] **Step 5: Add import boundary test for pointing-calibration**

Add to `tests/integration/importBoundaries.test.ts`:

```ts
it("keeps pointing-calibration independent of workbench, trigger, fusion, gameplay, rendering, and app layers", () => {
  const forbidden = [
    "diagnostic-workbench",
    "side-trigger",
    "input-fusion",
    "gameplay",
    "rendering",
    "src/app"
  ];
  const pointingFiles = listSourceFiles(
    join(rootDir, "src/features/pointing-calibration")
  );
  const offenders = pointingFiles.filter((file) =>
    importsFrom(file).some((specifier) =>
      forbidden.some((forbiddenPart) =>
        forbiddenPart === "src/app"
          ? importsForbiddenPath(file, specifier, join(rootDir, "src/app"))
          : specifier.includes(forbiddenPart)
      )
    )
  );

  expect(offenders.map(relativeSourcePath)).toEqual([]);
});
```

- [ ] **Step 6: Run live wiring tests and commit**

Run:

```bash
npm test -- tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts tests/integration/importBoundaries.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/diagnostic-workbench src/diagnostic-main.ts tests/unit/features/diagnostic-workbench tests/integration/importBoundaries.test.ts
git commit -m "feat(pointing): wire calibration into diagnostics"
```

---

## Task 9: Verification and Manual Trial Readiness

**Files:**
- Modify only files touched in Tasks 1-8 when a verification command exposes a concrete failure.

- [ ] **Step 1: Run focused pointing tests**

Run:

```bash
npm test -- tests/unit/features/pointing-calibration tests/unit/features/diagnostic-workbench/renderPointingCalibrationPanel.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full unit/integration/replay check set**

Run:

```bash
npm run lint
npm test
npm run test:replay
npm run knip
```

Expected: PASS.

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Start dev server for manual diagnostic check**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

Open `/diagnostic.html` in Chrome. Verify:

- The previewing screen includes a `pointing calibration` panel.
- `準備体操を開始` changes phase to `collectingCalibration`.
- Current target starts at `center`.
- Without cameras or without enough confidence, the panel shows a non-accepted reason rather than crashing.
- Existing front aim, side trigger, fusion, and recording panels still render.

Stop the dev server before finishing the turn unless the user asks to keep it running.

- [ ] **Step 6: Commit any verification fixes**

If verification required edits:

```bash
git add <changed-files>
git commit -m "fix(pointing): stabilize diagnostic calibration poc"
```

If no edits were required, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Diagnostic-only scope: Tasks 7-8 keep integration under `/diagnostic`.
  - Fixed calibration/validation targets: Task 1.
  - Feature schema and normalization: Task 2.
  - Front-only direction projection baseline: Task 3.
  - Stable sample acceptance: Task 4.
  - Weighted k-nearest mapping parameters: Task 5.
  - `frontOnlyReady` / `frontSideReady` state: Task 6 type and summary path.
  - Import boundaries: Task 8.
  - Verification: Task 9.
- No game scoring, hit detection, side-trigger FSM, or production front-aim behavior is modified.
- Validation MAE is implemented in Task 6 using indexTip, front-direction baseline, and weighted front+side estimates against the fixed 1366x768 equivalent viewport.
