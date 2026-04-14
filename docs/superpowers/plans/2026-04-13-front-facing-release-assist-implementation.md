# Front-Facing Release Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `waiting_for_release` stickiness for front-facing hand poses without regressing replay/video fixture stability.

**Architecture:** Keep the existing conditioned-trigger + thin FSM pipeline. Add one auxiliary signal that estimates whether the hand is facing the camera, then use that signal only to align release handling when the raw thumb trigger already reports `open` but the conditioned release path would otherwise stay latched.

**Tech Stack:** TypeScript, Vitest, existing replay fixture benches, MediaPipe hand landmarks

---

## File Structure

- Modify: `src/features/input-mapping/evaluateGunPose.ts` — compute and expose front-facing confidence from existing landmarks.
- Modify: `src/features/input-mapping/mapHandToGameInput.ts` — apply front-facing release assistance only on the latched release path.
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts` — add a regression covering front-facing world-landmark release recovery.
- Modify: `tests/bench/intentComparison.bench.test.ts` — no logic change expected, but this is the benchmark we must re-run after implementation.

---

### Task 1: Add the failing regression test

**Files:**
- Modify: `tests/unit/features/input-mapping/mapHandToGameInput.test.ts`

- [ ] Add a regression test that starts from an armed runtime, feeds a front-facing world-landmark pull, then feeds a world-landmark release where raw trigger opens but the runtime previously remained in `waiting_for_release`.
- [ ] Run `npx vitest run tests/unit/features/input-mapping/mapHandToGameInput.test.ts` and confirm the new test fails for the intended reason.

### Task 2: Implement the front-facing release assist

**Files:**
- Modify: `src/features/input-mapping/evaluateGunPose.ts`
- Modify: `src/features/input-mapping/mapHandToGameInput.ts`

- [ ] Add `frontFacingConfidence` to `GunPoseMeasurement.details` using existing landmarks only.
- [ ] In `mapHandToGameInput.ts`, when the runtime is latched, the raw trigger already reads `open`, and `frontFacingConfidence` is high, align the conditioned release floor with the actual raw trigger release threshold for that frame.
- [ ] Keep pull behavior unchanged so replay multi-shot protection stays intact.

### Task 3: Verify stability

**Files:**
- Modify: none expected

- [ ] Run targeted unit tests: `npx vitest run tests/unit/features/input-mapping/mapHandToGameInput.test.ts tests/unit/features/input-mapping/shotIntentStateMachine.test.ts tests/unit/features/input-mapping/conditionTriggerSignal.test.ts`
- [ ] Run replay fixtures: `npm run test:replay`
- [ ] Run benchmark: `npx vitest run --config vitest.bench.config.ts tests/bench/intentComparison.bench.test.ts --reporter=verbose`
- [ ] If replay/bench regress multi-shot behavior materially, revert the release-assist diff and report the failed experiment instead of leaving the branch degraded.
