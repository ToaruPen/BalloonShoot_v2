# Firing Stability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing thumb-trigger firing flow with a short cooldown, a stability/dwell gate, stronger armed-entry conditions, and explicit before/after replay validation tied to issue #37 on the current branch.

**Architecture:** Keep the contract at the input-mapping seam. Extend `shotIntentStateMachine` to delay commit until the hand is stably armed, prevent immediate refire, and reject weak/noisy armed transitions. Surface only the minimum extra tuning/debug knobs needed, and use the existing replay fixture harness as the authoritative before/after comparison path.

**Tech Stack:** TypeScript, Vitest, existing replay fixture benches, existing debug panel, GitHub issue #37

---

## File Structure

- Modify: `src/features/input-mapping/shotIntentStateMachine.ts` — add cooldown, dwell/stability counters, and stronger armed-entry gating.
- Modify: `src/shared/config/gameConfig.ts` — add default tuning values for the new gates.
- Modify: `src/features/debug/createDebugPanel.ts` — expose the minimum new tuning knobs for live validation.
- Modify: `src/app/bootstrap/startApp.ts` — thread new debug values into the runtime tuning object.
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts` — codify new transitions first.
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts` — preserve contract-level behavior and runtime plumbing.
- Modify: `tests/unit/shared/config/gameConfig.test.ts` — fix defaults if config changes.
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts` — guard new sliders.
- Modify: `tests/bench/replay.bench.test.ts` and/or `tests/bench/intentComparison.bench.test.ts` — capture before/after replay evidence.
- Modify: `docs/superpowers/handovers/2026-04-11-firing-stability-investigation-kickoff.md` only if final evidence needs an explicit handoff update.

### Task 1: Freeze the current baseline for issue #37

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-firing-stability-hardening.md`
- Verify: `tests/bench/replay.bench.test.ts`
- Verify: `tests/bench/intentComparison.bench.test.ts`

- [ ] **Step 1: Run the current replay benchmarks and capture the baseline output**

```bash
npm run test:replay
npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose
```

Expected: both commands pass, and the console prints the current `current_pipeline` replay numbers that will be used as the “before” reference.

- [ ] **Step 2: Record the before-state metrics in the plan/notes while the numbers are fresh**

```md
- Before baseline:
  - replay suite: PASS
  - intentComparison aggregate: current_pipeline shots=<value>, hitSegments=<value>, missedSegments=<value>, multiShotSegments=<value>
```

Expected: the branch has a concrete before-state to compare against after the code changes.

### Task 2: Codify cooldown behavior first

**Files:**
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts`
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

- [ ] **Step 1: Write failing state-machine tests for post-fire cooldown**

```ts
it("does not refire immediately after a valid shot while cooldown is active", () => {
  const results = runSequence([
    { triggerState: "open" },
    { triggerState: "open" },
    { triggerState: "open" },
    { triggerState: "pulled" },
    { triggerState: "pulled" },
    { triggerState: "open" },
    { triggerState: "open" },
    { triggerState: "pulled" },
    { triggerState: "pulled" }
  ]);

  expect(results.filter((result) => result.shotFired)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused state-machine test and confirm it fails for the right reason**

```bash
npm run test -- tests/unit/features/input-mapping/shotIntentStateMachine.test.ts
```

Expected: FAIL because the current machine allows a second quick shot after release recovery.

- [ ] **Step 3: Add the minimal cooldown fields and gating logic**

```ts
interface ShotIntentState {
  // existing fields...
  cooldownFramesRemaining: number;
}

const FIRE_COOLDOWN_FRAMES = 2;

const tickCooldown = (state: ShotIntentState): number =>
  Math.max(0, state.cooldownFramesRemaining - 1);
```

Expected: the state machine can block armed→fired while cooldown is non-zero and re-enter normal flow afterward.

- [ ] **Step 4: Re-run the focused tests**

```bash
npm run test -- tests/unit/features/input-mapping/shotIntentStateMachine.test.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts
```

Expected: PASS for cooldown-specific scenarios, with no breakage to the existing issue-30 contract tests.

### Task 3: Add a stable-ready dwell gate before firing

**Files:**
- Modify: `tests/unit/features/input-mapping/shotIntentStateMachine.test.ts`
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts`

- [ ] **Step 1: Write failing tests for a short stable-ready window**

```ts
it("requires a short stable-ready window before a pull can commit", () => {
  const results = runSequence([
    { triggerState: "open" },
    { triggerState: "open" },
    { triggerState: "open" },
    { triggerState: "pulled" },
    { triggerState: "pulled" }
  ]);

  expect(results.at(-1)?.shotFired).toBe(false);
});
```

- [ ] **Step 2: Implement a minimal dwell/stability counter in the armed path**

```ts
interface ShotIntentState {
  // existing fields...
  stableReadyFrames: number;
}

const FIRE_STABLE_READY_FRAMES = 2;
```

Expected: the machine only commits once the ready/armed pose has been stable for the configured window.

- [ ] **Step 3: Re-run the focused input-mapping tests**

```bash
npm run test -- tests/unit/features/input-mapping/shotIntentStateMachine.test.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts tests/unit/features/input-mapping/trackingLoss.test.ts
```

Expected: PASS, including recovery behavior around tracking loss.

### Task 4: Strengthen the armed-entry condition and surface the tuning

**Files:**
- Modify: `src/features/input-mapping/shotIntentStateMachine.ts`
- Modify: `src/shared/config/gameConfig.ts`
- Modify: `src/features/debug/createDebugPanel.ts`
- Modify: `src/app/bootstrap/startApp.ts`
- Modify: `tests/unit/shared/config/gameConfig.test.ts`
- Modify: `tests/unit/features/debug/createDebugPanel.test.ts`

- [ ] **Step 1: Write failing tests that weak/noisy pose states should not arm as easily**

```ts
it("keeps weak pose confidence in ready instead of arming immediately", () => {
  const results = runSequence([
    { triggerState: "open", gunPoseConfidence: 0.55 },
    { triggerState: "open", gunPoseConfidence: 0.55 },
    { triggerState: "open", gunPoseConfidence: 0.55 }
  ]);

  expect(results.at(-1)?.state.phase).not.toBe("armed");
});
```

- [ ] **Step 2: Add explicit config values and debug controls for the new gates**

```ts
input: {
  // existing values...
  fireCooldownFrames: 2,
  fireStableReadyFrames: 2,
  armedEntryConfidenceBias: 0.05
}
```

Expected: the branch has one authoritative place for defaults and the debug panel can tune them live.

- [ ] **Step 3: Re-run unit tests for config + debug + state machine**

```bash
npm run test -- tests/unit/shared/config/gameConfig.test.ts tests/unit/features/debug/createDebugPanel.test.ts tests/unit/features/input-mapping/shotIntentStateMachine.test.ts
```

Expected: PASS.

### Task 5: Validate the branch against replay fixtures before and after

**Files:**
- Modify: `tests/bench/intentComparison.bench.test.ts`
- Verify: `tests/bench/replay.bench.test.ts`
- Verify: `tests/fixtures/videos/README.md`

- [ ] **Step 1: Extend the comparison bench only as needed to print the new metrics clearly**

```ts
console.table(
  aggregate.map((metric) => ({
    strategy: metric.strategy,
    shots: metric.totalShots,
    hitSegments: metric.hitPullSegments,
    missedSegments: metric.missedPullSegments,
    multiShotSegments: metric.multiShotSegments
  }))
);
```

Expected: before/after comparison remains deterministic and easy to quote.

- [ ] **Step 2: Run the full verification sweep**

```bash
npm run lint
npm run typecheck
npm run test -- tests/unit/features/input-mapping/shotIntentStateMachine.test.ts tests/unit/features/input-mapping/mapHandToGameInput.test.ts tests/unit/features/input-mapping/trackingLoss.test.ts tests/unit/features/debug/createDebugPanel.test.ts tests/unit/shared/config/gameConfig.test.ts
npm run test:replay
npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose
```

Expected: all commands pass and the after-state metrics can be compared directly to Task 1.

- [ ] **Step 3: Record the after-state delta against the before baseline**

```md
- After baseline:
  - replay suite: PASS
  - intentComparison aggregate: current_pipeline shots=<value>, hitSegments=<value>, missedSegments=<value>, multiShotSegments=<value>
  - Delta vs before: <what improved>, <what regressed if anything>
```

Expected: the branch ends with explicit evidence for what changed on the fixture videos.
