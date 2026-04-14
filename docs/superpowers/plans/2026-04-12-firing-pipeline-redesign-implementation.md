# Firing Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current firing hardening path with a conditioned-trigger pipeline and a thinner firing FSM, then validate the improvement with replay/video fixtures and a browser-testable build.

**Architecture:** Keep the external `HandDetection -> GameInputFrame` contract intact. Add a new conditioned-trigger layer between hand evidence and the firing FSM, shrink the firing FSM down to commit/cooldown/tracking-loss responsibilities, and extend debug + replay tooling so before/after behavior stays explainable.

**Tech Stack:** TypeScript, Vitest, existing replay fixture benches, existing debug panel, Playwright browser tests, MediaPipe hand-tracking pipeline

---

## File Structure

- Create: `src/features/input-mapping/conditionTriggerSignal.ts` — conditioned trigger state and update logic.
- Modify: `src/features/input-mapping/mapHandToGameInput.ts` — wire evidence -> conditioned trigger -> thin FSM.
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts` — reduce to commit/cooldown/tracking-lost logic.
- Modify: `src/shared/config/gameConfig.ts` — replace current firing tuning with conditioned-trigger + thin-FSM defaults.
- Modify: `src/features/debug/createDebugPanel.ts` — surface conditioned trigger telemetry and revised tuning controls.
- Modify: `src/app/bootstrap/startApp.ts` — thread conditioned trigger telemetry into debug output.
- Create: `tests/unit/features/input-mapping/conditionTriggerSignal.test.ts` — TDD for conditioned trigger behavior.
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts` — codify thin FSM transitions.
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts` — preserve contract-level behavior with new pipeline.
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts` — debug output/control assertions for new telemetry.
- Modify: `tests/unit/app/bootstrap/startApp.test.ts` — telemetry bridge assertions.
- Modify: `tests/bench/intentComparison.bench.test.ts` — compare current pipeline vs redesigned pipeline using fixture videos.
- Modify: `tests/bench/replay.bench.test.ts` — expose enough replay metrics to explain before/after changes.

## Baseline Evidence To Preserve

Before replacing the current pipeline, keep these baseline numbers visible in notes / terminal logs:

- `current_pipeline`: `shots=31`, `hitSegments=15`, `missedSegments=39`, `multiShotSegments=7`
- `thumb_only`: `shots=57`, `hitSegments=25`, `missedSegments=29`, `multiShotSegments=13`
- `thumb_plus_strict_gun_pose`: `shots=34`, `hitSegments=15`, `missedSegments=39`, `multiShotSegments=9`

These numbers are the comparison target for the redesign.

---

### Task 1: Add the conditioned trigger unit with test-first coverage

**Files:**
- Create: `tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`
- Create: `src/features/input-mapping/conditionTriggerSignal.ts`

- [ ] **Step 1: Write the failing test for stable pull edge commit**

```ts
import { describe, expect, it } from "vitest";
import {
  createInitialConditionedTriggerState,
  updateConditionedTriggerSignal
} from "../../../../src/features/input-mapping/conditionTriggerSignal";

describe("conditionTriggerSignal", () => {
  it("emits a pull edge only once for a sustained pull", () => {
    let state = createInitialConditionedTriggerState();

    state = updateConditionedTriggerSignal(state, { rawState: "open", rawCosine: -0.4 });
    state = updateConditionedTriggerSignal(state, { rawState: "pulled", rawCosine: -0.18 });
    const committed = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.08
    });

    expect(committed.edge).toBe("pull");
    expect(committed.latched).toBe(true);

    const held = updateConditionedTriggerSignal(committed, {
      rawState: "pulled",
      rawCosine: -0.04
    });

    expect(held.edge).toBe("none");
    expect(held.latched).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails for the right reason**

Run: `npx vitest run tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`

Expected: FAIL because `conditionTriggerSignal.ts` does not exist yet.

- [ ] **Step 3: Write the minimal conditioned-trigger implementation**

```ts
export type ConditionedTriggerEdge = "none" | "pull" | "release";

export interface ConditionedTriggerState {
  scalar: number;
  latched: boolean;
  edge: ConditionedTriggerEdge;
  releaseReady: boolean;
}

export const createInitialConditionedTriggerState = (): ConditionedTriggerState => ({
  scalar: 0,
  latched: false,
  edge: "none",
  releaseReady: true
});

export const updateConditionedTriggerSignal = (
  previous: ConditionedTriggerState,
  input: { rawState: "open" | "pulled"; rawCosine: number }
): ConditionedTriggerState => {
  const scalar = input.rawState === "pulled" ? Math.max(0, input.rawCosine + 1) : 0;
  const pullEdge = !previous.latched && input.rawState === "pulled";
  const releaseEdge = previous.latched && input.rawState === "open";

  return {
    scalar,
    latched: releaseEdge ? false : previous.latched || pullEdge,
    edge: pullEdge ? "pull" : releaseEdge ? "release" : "none",
    releaseReady: input.rawState === "open"
  };
};
```

- [ ] **Step 4: Re-run the conditioned-trigger test and confirm it passes**

Run: `npx vitest run tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`

Expected: PASS.

### Task 2: Expand conditioned-trigger tests until release/reset semantics are covered

**Files:**
- Modify: `tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`
- Modify: `src/features/input-mapping/conditionTriggerSignal.ts`

- [ ] **Step 1: Add a failing test for release re-arming**

```ts
it("requires a release before a second pull edge can commit", () => {
  let state = createInitialConditionedTriggerState();

  state = updateConditionedTriggerSignal(state, { rawState: "pulled", rawCosine: -0.05 });
  expect(state.edge).toBe("pull");

  state = updateConditionedTriggerSignal(state, { rawState: "pulled", rawCosine: -0.02 });
  expect(state.edge).toBe("none");

  state = updateConditionedTriggerSignal(state, { rawState: "open", rawCosine: -0.6 });
  expect(state.edge).toBe("release");

  state = updateConditionedTriggerSignal(state, { rawState: "pulled", rawCosine: -0.04 });
  expect(state.edge).toBe("pull");
});
```

- [ ] **Step 2: Run the test and confirm the new behavior fails first**

Run: `npx vitest run tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`

Expected: FAIL on the new release/re-arm expectation.

- [ ] **Step 3: Refine the implementation to model release explicitly**

```ts
const releaseEdge = previous.latched && input.rawState === "open";
const latched = input.rawState === "open" ? false : previous.latched || pullEdge;

return {
  scalar,
  latched,
  edge: pullEdge ? "pull" : releaseEdge ? "release" : "none",
  releaseReady: input.rawState === "open"
};
```

- [ ] **Step 4: Re-run the test file and confirm all conditioned-trigger tests pass**

Run: `npx vitest run tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`

Expected: PASS.

### Task 3: Replace the heavy FSM contract with thin-FSM tests first

**Files:**
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts`

- [ ] **Step 1: Write a failing state-machine test for pull-edge commit + cooldown only**

```ts
it("commits once on a pull edge and then waits for release + cooldown", () => {
  const results = runSequence([
    { edge: "none", fireEligible: true, trackingPresent: true },
    { edge: "pull", fireEligible: true, trackingPresent: true },
    { edge: "none", fireEligible: true, trackingPresent: true },
    { edge: "release", fireEligible: true, trackingPresent: true },
    { edge: "pull", fireEligible: true, trackingPresent: true }
  ]);

  expect(results.filter((result) => result.shotFired)).toHaveLength(1);
  expect(results[1]?.state.phase).toBe("cooldown");
});
```

- [ ] **Step 2: Run the state-machine test file and confirm it fails**

Run: `npx vitest run tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`

Expected: FAIL because the current FSM still expects trigger debounce / stable aim / ready / recovering semantics.

- [ ] **Step 3: Rewrite the state machine around thin commit phases**

```ts
export type ShotIntentPhase = "idle" | "armed" | "cooldown" | "tracking_lost";

export interface ShotIntentState {
  phase: ShotIntentPhase;
  rejectReason: "waiting_for_fire_eligibility" | "waiting_for_release" | "cooldown" | "tracking_lost";
  cooldownFramesRemaining: number;
  fireEligible: boolean;
  trackingPresent: boolean;
}
```

- [ ] **Step 4: Re-run the state-machine tests and confirm the thin-FSM behavior passes**

Run: `npx vitest run tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`

Expected: PASS for the rewritten phase expectations.

### Task 4: Rewire `mapHandToGameInput` through conditioned trigger + thin FSM

**Files:**
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`
- Modify: `src/features/input-mapping/mapHandToGameInput.ts`
- Modify: `src/features/input-mapping/createHandEvidence.ts` (only if extra observation fields are needed)

- [ ] **Step 1: Add a failing contract test that the redesigned pipeline still emits exactly one shot for one intentional pull**

```ts
it("preserves the issue-30 contract with conditioned trigger commit", () => {
  const results = runIssue30Sequence([
    { pose: "open" },
    { pose: "open" },
    { pose: "pulled" },
    { pose: "pulled" }
  ]);

  expect(results.filter((result) => result.shotFired)).toHaveLength(1);
  expect(results[3]?.shotFired).toBe(true);
});
```

- [ ] **Step 2: Run the map-hand test file and confirm the new contract test fails first**

Run: `npx vitest run tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

Expected: FAIL until `mapHandToGameInput` starts consuming conditioned trigger state.

- [ ] **Step 3: Update orchestration to carry conditioned trigger runtime state**

```ts
const conditioned = updateConditionedTriggerSignal(runtime?.conditionedTrigger, {
  rawState: evidence.trigger?.rawState ?? "open",
  rawCosine: evidence.trigger?.details.cosine ?? -1
});

const intent = advanceShotIntentState(runtime, {
  trackingPresent: evidence.trackingPresent,
  fireEligible,
  triggerEdge: conditioned.edge
}, tuning);
```

- [ ] **Step 4: Re-run the map-hand test file and confirm the contract still passes**

Run: `npx vitest run tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

Expected: PASS.

### Task 5: Replace outdated firing tuning with redesign tuning

**Files:**
- Modify: `tests/unit/shared/config/gameConfig.test.ts`
- Modify: `src/shared/config/gameConfig.ts`

- [ ] **Step 1: Add a failing config test for the new conditioned-trigger defaults**

```ts
expect(gameConfig.input).toMatchObject({
  fireCooldownFrames: 2,
  conditionedTriggerPullFloor: expect.any(Number),
  conditionedTriggerReleaseFloor: expect.any(Number)
});
```

- [ ] **Step 2: Run the config test and confirm it fails before changing defaults**

Run: `npx vitest run tests/unit/shared/config/gameConfig.test.ts`

Expected: FAIL because the new keys do not exist yet.

- [ ] **Step 3: Replace the old state-machine-heavy tuning keys with redesign keys**

```ts
const INPUT_FIRE_COOLDOWN_FRAMES = 2;
const INPUT_CONDITIONED_TRIGGER_PULL_FLOOR = 0.72;
const INPUT_CONDITIONED_TRIGGER_RELEASE_FLOOR = 0.2;
```

- [ ] **Step 4: Re-run the config test and confirm it passes**

Run: `npx vitest run tests/unit/shared/config/gameConfig.test.ts`

Expected: PASS.

### Task 6: Expose redesigned telemetry in debug and bootstrap

**Files:**
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`
- Modify: `tests/unit/app/bootstrap/startApp.test.ts`
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `src/app/bootstrap/startApp.ts`

- [ ] **Step 1: Add failing debug-panel tests for conditioned trigger outputs**

```ts
expect(panel.render()).toContain("CondTrig");
expect(panel.render()).toContain("FireOK");
```

- [ ] **Step 2: Run the debug + bootstrap tests and confirm the new expectations fail**

Run: `npx vitest run tests/unit/features/debug/createDebugPanel.test.ts tests/unit/app/bootstrap/startApp.test.ts`

Expected: FAIL because the telemetry surface does not yet include the new outputs.

- [ ] **Step 3: Thread conditioned trigger telemetry through the panel**

```ts
export interface DebugTelemetry {
  conditionedTriggerScalar: number;
  conditionedTriggerEdge: string;
  fireEligible: boolean;
  shotFiredMarker: boolean;
}
```

- [ ] **Step 4: Re-run the debug + bootstrap tests and confirm they pass**

Run: `npx vitest run tests/unit/features/debug/createDebugPanel.test.ts tests/unit/app/bootstrap/startApp.test.ts`

Expected: PASS.

### Task 7: Make replay benches explain the redesign and compare before/after

**Files:**
- Modify: `tests/bench/intentComparison.bench.test.ts`
- Modify: `tests/bench/replay.bench.test.ts`

- [ ] **Step 1: Add a failing bench assertion for the redesigned strategy name and metrics capture**

```ts
expect(aggregate.map((metric) => metric.strategy)).toContain("conditioned_trigger_thin_fsm");
```

- [ ] **Step 2: Run the bench file and confirm it fails before implementation**

Run: `npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose`

Expected: FAIL because the redesigned strategy is not wired yet.

- [ ] **Step 3: Add the redesigned strategy and richer peak diagnostics**

```ts
const conditionedTriggerThinFsmStrategy: StrategyDefinition<InputRuntimeState | undefined> = {
  name: "conditioned_trigger_thin_fsm",
  createRuntime: () => undefined,
  step: ({ detection, viewport }, runtime) => {
    const result = mapHandToGameInput(detection, viewport, runtime, redesignTuning);
    return { runtime: result.runtime, shotFired: result.shotFired };
  }
};
```

- [ ] **Step 4: Re-run the comparison bench and confirm it passes with the new strategy printed**

Run: `npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose`

Expected: PASS, with the redesigned strategy listed in the aggregate table.

### Task 8: Re-run the authoritative replay suite and capture the after-state

**Files:**
- Verify: `tests/bench/replay.bench.test.ts`
- Verify: `tests/bench/intentComparison.bench.test.ts`

- [ ] **Step 1: Run the replay suite on fixture videos**

Run: `npm run test:replay`

Expected: PASS with replay metrics for the redesigned pipeline.

- [ ] **Step 2: Run the intent comparison bench and record the after-state aggregate**

Run: `npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose`

Expected: PASS with printed aggregate numbers for `conditioned_trigger_thin_fsm`.

- [ ] **Step 3: Compare before/after metrics explicitly in notes or final report**

```md
- Before: current_pipeline shots=31 hitSegments=15 missedSegments=39 multiShotSegments=7
- After: conditioned_trigger_thin_fsm shots=(record actual output) hitSegments=(record actual output) missedSegments=(record actual output) multiShotSegments=(record actual output)
```

- [ ] **Step 4: Run the full verification set before handing to the user**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.
