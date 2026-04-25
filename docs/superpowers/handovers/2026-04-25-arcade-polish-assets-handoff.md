# Arcade Polish Assets Handoff

Date: 2026-04-25

## Purpose

This handoff captures the current state of the `BalloonShoot_v2` arcade polish work so the next session can continue without re-discovering the design decisions, worktree state, and review status.

## Working Location

- Primary repo: `/Users/sankenbisha/Dev/after-school_daycare/BalloonShoot_v2`
- Active implementation worktree: `/Users/sankenbisha/.config/superpowers/worktrees/BalloonShoot_v2/codex-arcade-polish-assets`
- Branch: `codex/arcade-polish-assets`
- No commits have been made. The repo rule is commit only when explicitly requested.

## Authoritative Docs

Read these first:

1. `AGENTS.md`
2. `docs/superpowers/specs/2026-04-25-arcade-polish-asset-design.md`
3. `docs/superpowers/plans/2026-04-25-arcade-polish-asset-implementation.md`
4. `.codex/artifacts/claude-balloonshoot-arcade-polish-20260425-205105.md`

## User-Approved Design Decisions

- Use the **Arcade Celebration** visual direction.
- Do not use emoji in UI, generated assets, result screen, or copy.
- Generate cohesive balloon and UI sticker assets with a unified palette, thick ink outlines, and hard offset shadows.
- Avoid generic icon-library styling, glassmorphism, rainbow particles, and rough template-like UI.
- Crosshair is Canvas-rendered, not an image asset.
- Crosshair final form:
  - outer ring with `ink` support
  - `cream` ring and cross lines
  - cross lines stay inside the ring
  - no cross-line outline
  - no center dot
  - shot animation shrinks the reticle briefly
  - hit animation uses a separate ring, shards, and floating score

## Current Git State Summary

Expected dirty/untracked state in the worktree includes:

- Stale guidance cleanup from the beginning of the session:
  - `AGENTS.md`
  - `docs/AGENTS.md`
  - `src/app/AGENTS.md`
  - `src/features/AGENTS.md`
  - `tests/AGENTS.md`
  - `tests/integration/AGENTS.md`
  - `tests/replay/AGENTS.md`
  - `tests/unit/AGENTS.md`
- New design/plan/artifact files:
  - `docs/superpowers/specs/2026-04-25-arcade-polish-asset-design.md`
  - `docs/superpowers/plans/2026-04-25-arcade-polish-asset-implementation.md`
  - `.codex/artifacts/claude-balloonshoot-arcade-polish-20260425-205105.md`
- Task 1 generated assets:
  - `src/assets/images/arcade/balloons/normal-candy-source.png`
  - `src/assets/images/arcade/balloons/normal-mint-source.png`
  - `src/assets/images/arcade/balloons/small-alert-source.png`
  - `src/assets/images/arcade/ui/star-badge-source.png`
  - `src/assets/images/arcade/ui/hit-spark-source.png`
  - `src/assets/images/arcade/ui/confetti-ribbon-source.png`
  - `public/images/balloons/arcade/normal-candy.png`
  - `public/images/balloons/arcade/normal-mint.png`
  - `public/images/balloons/arcade/small-alert.png`
  - `public/images/arcade/ui/star-badge.png`
  - `public/images/arcade/ui/hit-spark.png`
  - `public/images/arcade/ui/confetti-ribbon.png`
- Task 2 code/test files:
  - `src/features/rendering/arcadeTheme.ts`
  - `src/features/rendering/arcadeEffects.ts`
  - `tests/unit/features/rendering/arcadeEffects.test.ts`

## Completed Work

### Stale Guidance Cleanup

Updated stale `AGENTS.md` guidance so current docs refer to the v2 structure: `front-aim`, `side-trigger`, `input-fusion`, current `src/app` files, and current test boundaries.

Validation run before implementation work:

- `agents_md_tool.py audit --root . --require-why-what-how` passed.
- stale wording search for scoped `AGENTS.md` files passed.
- `git diff --check` passed.

### Spec And Plan

Created the approved design spec:

- `docs/superpowers/specs/2026-04-25-arcade-polish-asset-design.md`

Created the implementation plan:

- `docs/superpowers/plans/2026-04-25-arcade-polish-asset-implementation.md`

Plan correction already applied:

- `hit-spark` uses `#ff00ff` chroma key because its fill is lime green.
- The plan explains `--edge-contract 1` for hit-spark if a magenta fringe remains.

### Worktree Baseline

After creating the isolated worktree and copying current uncommitted docs/guidance into it:

- `npm install` completed.
- `npm run typecheck` passed.
- `npm run test` passed: 81 test files, 521 tests.
- `npm audit` reported 1 moderate vulnerability during install; this was not investigated because it is outside the current scope.

### Task 1: Generated Assets

Task 1 is complete and reviewed.

Generated source/runtime assets:

- balloons: candy, mint, small alert
- UI: star badge, hit spark, confetti ribbon

Important implementation note:

- `hit-spark` was initially too cream/white and failed spec review.
- It was regenerated with `#ff00ff` chroma key because `#00ff00` removed too much of the lime fill.
- Re-run chroma removal for hit-spark with `--edge-contract 1` to eliminate magenta fringe.

Validation evidence:

- `file public/images/balloons/arcade/*.png public/images/arcade/ui/*.png`: all six runtime assets are PNG RGBA.
- Alpha/corner validation: all six runtime assets have transparent corners and alpha range `0..255`.
- `hit-spark` pixel validation: visible magenta-like pixels `0`, lime-like pixels `222757`, dark outline/shadow-like pixels `151812`.
- Contact sheet: `test-results/arcade-assets-contact-sheet.png`.

Review status:

- Task 1 spec compliance review: APPROVED.
- Task 1 code quality review: APPROVED.
- Quality note: runtime PNGs are 1254x1254. Total runtime asset size is about 2.4MB and decoded memory is about 38MB for six files. This is acceptable for now; 512-768px resizing can be considered later if needed.

### Task 2: Arcade Theme And Effect Helpers

Task 2 implementation has been completed by subagent, but the required two-stage review has not yet been run.

Files added:

- `src/features/rendering/arcadeTheme.ts`
- `src/features/rendering/arcadeEffects.ts`
- `tests/unit/features/rendering/arcadeEffects.test.ts`

Implemented:

- `arcadePalette`
- `arcadeCrosshair`
- `arcadeEffects`
- `TimedPointEffect`
- `HitShard`
- `HitPopEffect`
- `crosshairScaleForShot`
- `createHitPopEffect`
- `activeHitPopEffects`

Subagent validation:

- RED: `npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts` failed as expected before implementation because `arcadeEffects.ts` did not exist.
- GREEN: `npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts` passed.
- `npm run typecheck` passed.
- debug leftovers search found no matches.

Controller re-check after interruption:

- `npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts` passed: 1 file, 2 tests.
- `npm run typecheck` passed.

Review status:

- Task 2 spec compliance review: NOT RUN.
- Task 2 code quality review: NOT RUN.

## Active Process Notes

Subagent-driven workflow was selected by the user.

The required process is:

1. Implementer subagent per task.
2. Spec compliance review.
3. Code quality review.
4. Only then mark task complete and move to the next task.

Task 1 completed all three stages. Task 2 is only implemented and locally checked; it still needs both reviews.

## Next Actions

1. Run Task 2 spec compliance review.
   - Check `src/features/rendering/arcadeTheme.ts`, `src/features/rendering/arcadeEffects.ts`, and `tests/unit/features/rendering/arcadeEffects.test.ts` against Task 2 in the plan.
   - Confirm `crosshairScaleForShot(shot, 1060)` returns about `0.72`.
   - Confirm hit pop helper is deterministic and prunes after `900ms`.
2. If spec review passes, run Task 2 code quality review.
   - Watch for formatting, overly long lines, magic numbers that should use theme constants, and type clarity.
3. If Task 2 reviews pass, mark Task 2 complete and dispatch Task 3.
4. Task 3 will modify `drawGameFrame.ts` and `tests/unit/features/rendering/drawGameFrame.test.ts`.

## Commands Useful For Resuming

```bash
cd /Users/sankenbisha/.config/superpowers/worktrees/BalloonShoot_v2/codex-arcade-polish-assets
git status --short --branch
npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts
npm run typecheck
```

For Task 1 asset checks:

```bash
file public/images/balloons/arcade/*.png public/images/arcade/ui/*.png
python3 - <<'PY'
from PIL import Image
paths = [
    'public/images/balloons/arcade/normal-candy.png',
    'public/images/balloons/arcade/normal-mint.png',
    'public/images/balloons/arcade/small-alert.png',
    'public/images/arcade/ui/star-badge.png',
    'public/images/arcade/ui/hit-spark.png',
    'public/images/arcade/ui/confetti-ribbon.png',
]
for p in paths:
    im = Image.open(p).convert('RGBA')
    corners = [im.getpixel(c)[3] for c in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]]
    print(p, im.mode, im.size, im.getchannel('A').getextrema(), corners)
PY
```

## Caveats

- `test-results/arcade-assets-contact-sheet.png` is ignored and should not be committed unless explicitly requested.
- `.superpowers/brainstorm/` remains in the primary repo and is ignored; it contains design mockups only.
- The primary repo still has the earlier uncommitted docs/guidance changes. Continue in the worktree for implementation to avoid mixing active edits in the primary checkout.
- Do not revert generated assets or docs unless the user explicitly asks.
