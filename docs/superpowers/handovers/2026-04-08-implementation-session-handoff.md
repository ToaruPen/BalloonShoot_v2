# BalloonShoot Implementation Session Handoff

Date: 2026-04-08

## Purpose

This handoff is for the next Codex session that will review or continue the `BalloonShoot` PoC after the issue-30 implementation pass.

The current session completed requirements/design alignment, wrote the formal PoC design, wrote the implementation plan, implemented the issue-30 interaction contract, and ran external review passes on the design docs.

## Authoritative Documents

Read these first, in this order:

1. `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`
2. `docs/superpowers/plans/2026-04-08-poc-implementation.md`
3. `docs/notes/2026-04-08-project-memo.md`
4. `AGENTS.md`

## Current Project State

- Repository reflects the issue-30 implementation branch.
- The implementation plan has been executed through the final docs alignment pass.
- The PoC is Chrome-first.
- Vanilla TypeScript + Canvas 2D is the chosen PoC stack.
- MediaPipe Hand Landmarker is the chosen tracking stack.
- The game core must stay reusable for a later Phaser migration.

## Issue-30 Interaction Contract

- Aim with the index finger.
- Shoot with a loose gun pose plus a thumb-trigger open to pulled transition.
- `pinch` is superseded and is not part of the PoC contract.
- Gun-pose confidence uses a 0.55 entry threshold and a 0.45 exit threshold.
- A low-confidence pulled frame can keep the visible pose armed while delaying fire until confidence recovers.
- Reacquisition requires a fresh tracking-present frame before re-arming.
- Tracking loss stays distinct from open-state behavior.
- Debug-only telemetry exposes phase, reject reason, trigger confidence, gun-pose confidence, and counters.

## Fixed PoC Decisions

- Browser target: Chrome is required; other browsers are best-effort only.
- Play session: exactly 1 minute.
- Screen flow: camera permission -> start -> countdown -> play -> result -> retry.
- Camera feed stays visible during PoC play.
- Input model: loose gun pose + thumb-trigger state change.
- `pinch` is not the PoC input contract.
- Score model: normal balloon = 1, small balloon = 3, combo multiplier enabled.
- Misses do not subtract score; they only reset combo.
- Audio included: shot, hit, BGM, time-up, result.
- PoC includes debug UI and tuning controls.
- `AGENTS.md` files must be written in English.
- Every `AGENTS.md` should have a sibling `CLAUDE.md` symlink.

## Implementation Constraints

- Follow fail-fast, YAGNI, DRY, and TDD.
- Avoid unnecessary `try-catch`, fallback-heavy code, `null` spread, and `any`.
- Treat `lint`, `typecheck`, and `test` as blocking checks.
- Keep `app`, `features`, and `shared` boundaries explicit.
- Keep browser-specific code thin.
- Keep gameplay, input mapping, and scoring pure and testable.

## Latest Reviewed Status

Design review was run in separate reviewer agents.

- Initial design review requested changes and those issues were fixed.
- Final review result: no substantive findings.
- The design docs are considered aligned and ready for implementation planning/execution.

## Git State

Latest committed history:

- `fb308a6` `docs: align PoC memo and foundation spec`
- `695565f` `docs: add PoC foundation design`
- `51f231f` `Initialize project docs and Codex remote setup`

Current working tree is not clean. At the time of this handoff, it contains the issue-30 implementation diff plus the Task 9 docs alignment edits.

- modified tracked files include the issue-30 code path under `src/app/bootstrap/`, `src/features/debug/`, `src/features/input-mapping/`, `src/main.ts`, related tests, and the docs updates in `README.md` plus this handoff
- untracked paths include `.playwright-mcp/`, `.sisyphus/`, `src/features/input-mapping/createHandEvidence.ts`, `src/features/input-mapping/shotIntentStateMachine.ts`, `test-results/`, and the new issue-30 test files

This is expected while the branch remains in active implementation and verification.

## Verification

- Final verification for the issue-30 branch is green: `npm run lint && npm run typecheck && npm run test && npm run test:e2e`.
- After this docs pass, `npm run typecheck` still passes.

## Recommended First Actions in the Next Session

1. Review the issue-30 docs trail and verification notes.
2. Use the spec and this handoff as the contract source for any follow-up review or delegation.
3. If further code work is needed, start from the existing implementation and keep the thumb-trigger contract intact.
4. Prefer the subagent-driven execution path if available.

## First Execution Target

The initial bootstrap tasks are already complete.

Keep any future work scoped to the implemented contract, the debug surface, and issue-30 follow-up review.

## Notes for the Next Session

- The implementation plan is intentionally detailed and should be followed task-by-task.
- UI polish is not the first priority; proving the interaction loop is.
- The main technical risk is input stability for small hands, not graphics complexity.
- If implementation starts diverging from the plan, update the plan or spec explicitly instead of silently drifting.
