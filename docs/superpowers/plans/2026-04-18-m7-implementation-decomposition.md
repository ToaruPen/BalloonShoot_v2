# M7 Implementation-Granularity Task Decomposition

**対象:** Issue #7, Minimal Balloon Gameplay with Fused Input  
**Goal:** [index.html](index.html) を 60 秒の production-clean balloon gameplay にする。gameplay は `FusedGameInputFrame` だけを読み、front aim crosshair、side-triggered shots、balloons、score/time HUD、countdown、result/retry を動かす。
**前提:** M7 は M6 完了後に開始する。現調査時点の checkout は `7ff8a06` で、[src/features/input-fusion](src/features/input-fusion) は未作成。ローカル `claude/m6-followup` は `7ff8a06` と同一、`origin/claude/m6-followup` は未存在だった。read-only 環境のため `git fetch` は未実行。

## 1. Pre-flight Checks

M7 開始前の post-M6 `main` で必ず確認する。

1. Repository and branch state
   - `git fetch --prune origin`
   - `git rev-parse --short HEAD` が post-M6 merge commit を指すこと。
   - `git log --oneline origin/claude/m6-followup -- src` を、branch が存在する場合だけ確認する。
   - M6 decomposition の untracked plan [docs/superpowers/plans/2026-04-18-m6-implementation-decomposition.md](docs/superpowers/plans/2026-04-18-m6-implementation-decomposition.md) が正式 plan と矛盾しないこと。

2. M6 fusion contract shape
   - [src/shared/types/fusion.ts](src/shared/types/fusion.ts) が存在する。
   - `FusedGameInputFrame` が少なくとも以下を持つことを確認する:
     - `fusionTimestampMs`
     - `fusionMode`
     - `timeDeltaBetweenLanesMs`
     - explicit `aim` unavailable/available state
     - explicit `trigger` state
     - one-frame `shotFired`
     - `inputConfidence`
     - `frontSource`
     - `sideSource`
     - `fusionRejectReason`
   - `FusionMode` は `pairedFrontAndSide`, `frontOnlyAim`, `sideOnlyTriggerDiagnostic`, `noUsableInput` を持つ。
   - `FusionRejectReason` は explicit enum/union で、`undefined` や free-form string に依存しない。
   - Fusion timestamp policy は `FrameTimestamp.frameTimestampMs` を使い、callback order / `Date.now()` / ad hoc `performance.now()` で pairing していない。

3. M6 input-fusion public surface
   - [src/features/input-fusion/index.ts](src/features/input-fusion/index.ts) から production game が使える最小 API が export されている:
     - `createInputFusionMapper`
     - `defaultFusionTuning` or equivalent defaults
     - `FusionTuning` type
     - `FusedGameInputFrame` type re-export は任意だが import path を統一する。
   - `createInputFusionMapper` は browser-free/pure-ish API である:
     - `updateAimFrame(frame, context)`
     - `updateTriggerFrame(frame, context)`
     - `resetFrontLane()`
     - `resetSideLane()`
     - `resetAll()`
   - [src/features/input-fusion](src/features/input-fusion) は [src/features/diagnostic-workbench](src/features/diagnostic-workbench), [src/features/gameplay](src/features/gameplay), [src/app](src/app), [src/features/rendering](src/features/rendering), [src/features/camera](src/features/camera), [src/features/hand-tracking](src/features/hand-tracking) を import しない。

4. Existing lane contracts
   - M3: [src/shared/types/camera.ts](src/shared/types/camera.ts), [src/shared/types/hand.ts](src/shared/types/hand.ts)
   - M4: [src/shared/types/trigger.ts](src/shared/types/trigger.ts), [src/features/side-trigger](src/features/side-trigger)
   - M5: [src/shared/types/aim.ts](src/shared/types/aim.ts), [src/features/front-aim](src/features/front-aim)
   - M6: [src/shared/types/fusion.ts](src/shared/types/fusion.ts), [src/features/input-fusion](src/features/input-fusion)

5. Baseline behavior
   - `/diagnostic.html` remains operational and shows M4/M5/M6 workbench surfaces.
   - `/` still has no diagnostic workbench import and no threshold sliders/debug overlay/landmark wireframe.
   - Baseline gates before editing:
     - `npm run check`
     - `npm run test:e2e`

## 2. Numbered Implementation Steps

### 1. Add M7 Gameplay Contract and Boundary Tests

**Scope:** Lock the M7 rule that gameplay consumes only `FusedGameInputFrame`.

**Files:**
- Create [tests/unit/features/gameplay/fusedInputContract.test.ts](tests/unit/features/gameplay/fusedInputContract.test.ts)
- Modify [tests/integration/importBoundaries.test.ts](tests/integration/importBoundaries.test.ts)
- Modify [tests/e2e/home.smoke.spec.ts](tests/e2e/home.smoke.spec.ts)

**Implementation notes:**
- Extend import scanner to include `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, preserving the import-boundary file-extension lesson.
- Update boundary rule: [src/main.ts](src/main.ts) and [src/app](src/app) may import [src/features/input-fusion](src/features/input-fusion) after M7, but must not import [src/features/diagnostic-workbench](src/features/diagnostic-workbench).
- [src/features/gameplay](src/features/gameplay) must not import [src/features/front-aim](src/features/front-aim), [src/features/side-trigger](src/features/side-trigger), [src/features/camera](src/features/camera), [src/features/hand-tracking](src/features/hand-tracking), or [src/features/diagnostic-workbench](src/features/diagnostic-workbench).
- E2E absence assertions must include no `wb-fusion-panel`, no `data-fusion-tuning`, no side-trigger slider labels, no landmark overlay, no `threshold`, no `wireframe`.

**Test plan:**
- Unit: `npx vitest run tests/unit/features/gameplay/fusedInputContract.test.ts`
- Integration: `npx vitest run tests/integration/importBoundaries.test.ts`
- E2E smoke after later UI wiring: `npm run test:e2e`

**Dependencies:**
- M6 `FusedGameInputFrame`
- M4/M5/M6 import boundary rules
- Prior lessons: knip, import boundary extensions, discriminated unions, explicit reject reason enum

### 2. Introduce Pure Gameplay Session State Machine

**Scope:** Add game flow state independent of DOM, camera, MediaPipe, rendering, and audio.

**Files:**
- Create [src/features/gameplay/domain/gameSession.ts](src/features/gameplay/domain/gameSession.ts)
- Create [tests/unit/features/gameplay/gameSession.test.ts](tests/unit/features/gameplay/gameSession.test.ts)
- Modify [src/features/gameplay/AGENTS.md](src/features/gameplay/AGENTS.md) only if it needs one short note about pure state machines.

**Implementation notes:**
- Use a discriminated union, not loose booleans:
  - `idle`
  - `countdown`
  - `playing`
  - `result`
- Treat `retry` as an event that returns to `countdown` or setup, not as a long-lived state unless UI requires it.
- Countdown sequence: `3`, `2`, `1`, `start`.
- `playing` duration: `60_000ms`.
- Use an injected monotonic `nowMs` or deterministic `deltaMs`, not `Date.now()`.
- Race guard: duplicate `start` during countdown must not create two sessions.
- Result transition emits a one-time event for audio/time-up hooks.

**Test plan:**
- Unit tests:
  - idle to countdown on start
  - countdown labels at exact boundaries
  - countdown to playing once
  - playing to result at exactly 60 seconds
  - retry clears session state
  - duplicate start does not restart countdown unless explicitly retried
- Use `toBe` for primitive state tags and exact numbers; use `toEqual` for structured objects.

**Dependencies:**
- Foundation spec screen flow
- M7 runtime will drive this with rAF timestamps
- Prior lessons: countdown race, timer drift, discriminated union invariants, `toBe` vs `toEqual`

### 3. Normalize Balloon Engine for Viewport-Sized Gameplay

**Scope:** Carry over the existing skeleton while removing hard-coded spawn coordinates tied to one canvas size.

**Files:**
- Modify [src/features/gameplay/domain/createGameEngine.ts](src/features/gameplay/domain/createGameEngine.ts)
- Modify [src/features/gameplay/domain/balloon.ts](src/features/gameplay/domain/balloon.ts)
- Modify [src/features/gameplay/domain/difficulty.ts](src/features/gameplay/domain/difficulty.ts)
- Modify [tests/unit/features/gameplay/createGameEngine.test.ts](tests/unit/features/gameplay/createGameEngine.test.ts)

**Implementation notes:**
- `createGameEngine({ width, height, durationMs })` or `resizeViewport({ width, height })` must drive spawn range and offscreen cleanup.
- Preserve current scoring rules:
  - normal balloon: 1 point
  - small balloon: 3 points
  - combo multiplier: current 3-hit and 6-hit thresholds unless spec says otherwise
  - miss: score unchanged, combo reset
- Hit detection should return a concrete result:
  - `hit` with balloon id/size/points
  - `miss`
  - `ignored` if not playing
- Do not let missed balloons reset combo unless a shot misses. Foundation says miss on shot cuts combo, not balloon escape.
- Use deterministic random injection for tests.

**Test plan:**
- Unit tests:
  - spawn x stays within viewport bounds minus radius
  - balloons rise from below current viewport height
  - old balloons clean up once above top
  - normal/small scoring unchanged
  - hit marks exactly one balloon dead
  - overlapping balloons choose deterministic topmost or first-defined policy and test it
  - shot outside every balloon resets combo without score penalty

**Dependencies:**
- Foundation gameplay design
- Existing skeleton in [src/features/gameplay/domain](src/features/gameplay/domain)
- Prior lessons: deterministic tests, `toBe` for scalar assertions, no hidden fallback

### 4. Add Fused Input to Gameplay Adapter

**Scope:** Convert `FusedGameInputFrame` into production gameplay actions without raw lane access.

**Files:**
- Create [src/features/gameplay/domain/fusedGameInput.ts](src/features/gameplay/domain/fusedGameInput.ts)
- Create [tests/unit/features/gameplay/fusedGameInput.test.ts](tests/unit/features/gameplay/fusedGameInput.test.ts)

**Implementation notes:**
- Input is only `FusedGameInputFrame`.
- Output should be a small shape:
  - crosshair point when `aim` is available or estimated
  - no crosshair when `aim` unavailable
  - `shot` action when `shotFired === true` and a crosshair is present (superseded 2026-04-25: relaxed from the original `fusionMode === "pairedFrontAndSide"` gate so a side commit can fire when both lanes are individually usable but the pair fails on `timestampGapTooLarge`)
  - degraded status for production copy, not telemetry
- Add M7-level shot consumption guard because the runtime may render the same latest fused frame across multiple rAF ticks.
- Key consumed shots from M6 side source summary if available. If M6 does not expose a stable key, build one from `fusionTimestampMs`, `sideSource.frameTimestampMs`, `sideSource.presentedFrames`, and trigger edge summary. Do not inspect `TriggerInputFrame` directly.
- `frontOnlyAim` can move the crosshair, and can score only when the side lane is also individually usable in the same frame (superseded 2026-04-25).
- `sideOnlyTriggerDiagnostic` cannot fire and must not consume a shot (front lane unusable → shot edge stays unconsumed for retry once front recovers).

**Test plan:**
- Unit tests:
  - paired + `shotFired` produces exactly one shot action
  - repeated same fused frame produces no second shot
  - front-only moves crosshair but no shot
  - side-only shot-like data produces no shot
  - no usable input hides crosshair and no shot
  - unavailable aim never fabricates coordinates
  - explicit reject reasons remain explicit in degraded status

**Dependencies:**
- M6 `FusedGameInputFrame`
- M6 one-shot edge consumption semantics
- M4 `shotCommitted` edge is already folded into M6 `shotFired`
- Prior lessons: shot double-consumption, fused-input availability vs degraded, explicit reject reason enum

### 5. Add HUD View Model and HTML Renderer

**Scope:** Keep production HUD clean and testable without diagnostic text.

**Files:**
- Create [src/app/gameHud.ts](src/app/gameHud.ts)
- Create [tests/unit/app/gameHud.test.ts](tests/unit/app/gameHud.test.ts)
- Modify [src/styles/app.css](src/styles/app.css)

**Implementation notes:**
- HUD fields:
  - score
  - combo
  - multiplier
  - time remaining
  - countdown label
  - result summary
  - retry button
  - production-friendly lane status copy such as `入力を準備中` only when degraded
- Do not render `fusionMode`, `fusionRejectReason`, threshold names, raw `unavailable`, or diagnostic constants on `/`.
- Escape all user/device-derived text via [src/shared/browser/escapeHTML.ts](src/shared/browser/escapeHTML.ts).
- Use key/value pair assertions in tests for score/time/combo rather than loose `toContain`.

**Test plan:**
- Unit tests:
  - renders score/combo/timer/countdown
  - result screen renders final score and retry action
  - no diagnostic labels appear
  - HTML special chars in camera labels are escaped
  - stable IDs/classes exist for E2E assertions

**Dependencies:**
- M7 `gameSession`
- M7 game engine score state
- Prior lessons: telemetry-undefined display, key/value pair test assertion, HTML escaping

### 6. Extend Canvas Rendering for Production Game State

**Scope:** Render balloons, crosshair, shot feedback, and simple result-safe clearing on Canvas 2D.

**Files:**
- Modify [src/features/rendering/drawGameFrame.ts](src/features/rendering/drawGameFrame.ts)
- Modify [tests/unit/features/rendering/drawGameFrame.test.ts](tests/unit/features/rendering/drawGameFrame.test.ts)

**Implementation notes:**
- Keep rendering as view layer only. No score, no hit rules, no input inference.
- Draw state should accept:
  - `balloons`
  - `crosshair`
  - optional short-lived shot effect
  - optional hit effect
- Preserve camera video as DOM background; renderer draws only canvas overlay.
- If using image assets later, keep fallback deterministic in tests. For M7 minimal, Canvas circles are acceptable because existing renderer already uses them and production-clean requirement is about no diagnostic surfaces.
- Stable dimensions: canvas size synchronized by runtime, not CSS-only.

**Test plan:**
- Unit tests:
  - clears full canvas
  - draws alive balloons only
  - draws crosshair when provided
  - omits crosshair when unavailable
  - draws shot effect once when provided
  - does not mutate balloon array

**Dependencies:**
- M7 game engine `Balloon`
- Existing renderer boundary
- Prior lessons: separation of rendering and rules, production clean

### 7. Implement Audio Policy and Hooks

**Scope:** Include PoC audio hooks in M7 using existing public assets, with asset polish deferred.

**Files:**
- Modify [src/features/audio/createAudioController.ts](src/features/audio/createAudioController.ts)
- Modify [tests/unit/features/audio/createAudioController.test.ts](tests/unit/features/audio/createAudioController.test.ts)
- Runtime-served assets already exist under [public/audio](public/audio)

**Implementation notes:**
- Audio belongs in M7 for hooks and existing asset playback because foundation spec includes BGM, shot, hit, time-up, result in PoC scope.
- New asset production/mixing is deferred to later polish, not M8 calibration.
- M7 uses these existing files:
  - [public/audio/bgm.mp3](public/audio/bgm.mp3)
  - [public/audio/shot.mp3](public/audio/shot.mp3)
  - [public/audio/hit.mp3](public/audio/hit.mp3)
  - [public/audio/time-up.mp3](public/audio/time-up.mp3)
  - [public/audio/result.mp3](public/audio/result.mp3)
- Hook policy:
  - start BGM on user-initiated game start/countdown
  - stop BGM on result/destroy
  - play shot on consumed `shotFired`
  - play hit only if hit detection succeeds
  - play time-up once on transition to result
  - play result once when result screen is entered
- Do not add UI controls or debug audio indicators on `/`.
- Audio playback failures should be caught at runtime boundary and logged once per event type; the audio controller itself should continue surfacing promise rejections for tests.

**Test plan:**
- Unit tests:
  - asset paths match `public/audio`
  - BGM loops and resets
  - one-shot players are created per effect
  - playback rejection is surfaced by controller
- Runtime integration tests later assert audio methods are called on shot/hit/time-up/result.

**Dependencies:**
- Foundation audio scope
- Existing [src/features/audio/AGENTS.md](src/features/audio/AGENTS.md)
- Prior lessons: no hidden fallback, browser-boundary failure handling

### 8. Build Production Two-Camera Runtime

**Scope:** Replace aim-only runtime with two-camera front/side/fusion/gameplay runtime.

**Files:**
- Create [src/app/balloonGameRuntime.ts](src/app/balloonGameRuntime.ts)
- Create [tests/integration/balloonGameRuntime.test.ts](tests/integration/balloonGameRuntime.test.ts)
- Create or move side conversion helper to [src/features/side-trigger/sideTriggerDetectionConversion.ts](src/features/side-trigger/sideTriggerDetectionConversion.ts)
- Modify [src/features/side-trigger/index.ts](src/features/side-trigger/index.ts)
- Modify [src/features/diagnostic-workbench/liveLandmarkInspection.ts](src/features/diagnostic-workbench/liveLandmarkInspection.ts) only if moving shared `toSideDetection` out of workbench
- Eventually retire [src/app/frontAimGameRuntime.ts](src/app/frontAimGameRuntime.ts) after M7 page tests migrate.

**Implementation notes:**
- Runtime owns browser lifecycle only:
  - open front stream
  - open side stream
  - create two MediaPipe trackers
  - create front aim mapper
  - create side trigger mapper
  - create input fusion mapper
  - create gameplay engine/session
  - render frame
- Runtime must not import [src/features/diagnostic-workbench](src/features/diagnostic-workbench).
- Runtime may import [src/features/front-aim](src/features/front-aim), [src/features/side-trigger](src/features/side-trigger), and [src/features/input-fusion](src/features/input-fusion) because app wiring is the composition layer.
- Preserve lessons:
  - cleanup both streams and both trackers
  - generation token for async race guard
  - stale video element guard if page re-renders videos
  - `processFrame` try-catch and recovery per lane
  - stop pending stream if tracker startup fails or destroy happens mid-start
  - reset side mapper/fusion side buffer on side stream replacement
  - reset front mapper/fusion front buffer on front stream replacement
- Use `requestVideoFrameCallback` timestamp metadata through [src/features/camera/frameTimestamp.ts](src/features/camera/frameTimestamp.ts). Do not create a new timestamp policy.
- rAF loop advances gameplay by deterministic delta. Lane frame callbacks update latest fused input.

**Test plan:**
- Integration tests with fake videos/trackers:
  - front frame updates aim in fusion
  - side `shotCommitted` close to front frame triggers one gameplay shot
  - repeated render ticks do not process same shot twice
  - timestamp gap disables shot
  - unavailable aim hides crosshair
  - `processFrame` bitmap failure logs and recovers next frame
  - tracker detection failure logs and recovers next frame
  - destroy during stream/tracker startup cleans up exactly once
  - no draw after destroy
  - retry resets game state and consumed shot keys

**Dependencies:**
- M3 camera/timestamp/hand detection
- M4 side trigger mapper
- M5 front aim mapper and `frontAimDetectionConversion`
- M6 input fusion mapper
- Prior lessons: MediaPipe cleanup, async race guard, stale video element, lifecycle race, processFrame recovery, fusion timestamp policy

### 9. Build Production Game Page Flow

**Scope:** Transform `/` from front-aim shell into full two-camera game page.

**Files:**
- Create [src/app/balloonGamePage.ts](src/app/balloonGamePage.ts)
- Create [tests/unit/app/balloonGamePage.test.ts](tests/unit/app/balloonGamePage.test.ts)
- Modify [src/main.ts](src/main.ts)
- Modify [src/styles/app.css](src/styles/app.css)
- Retire or delete [src/app/frontAimGamePage.ts](src/app/frontAimGamePage.ts) and [tests/unit/app/frontAimGamePage.test.ts](tests/unit/app/frontAimGamePage.test.ts) once replacements are green, to avoid misleading names and knip issues.

**Implementation notes:**
- Page flow:
  - camera permission
  - device selection with distinct front/side camera IDs
  - two-camera preview or ready screen
  - countdown
  - playing
  - result
  - retry
- One camera only:
  - full gameplay disabled
  - message states two cameras are required
  - do not reuse one camera for both roles
- Device labels must be escaped.
- Production-clean page:
  - no diagnostic link
  - no workbench panel
  - no threshold sliders
  - no landmark overlays
  - no wireframe
  - no fusion telemetry labels
- Keep [src/app](src/app) thin; rules remain in [src/features/gameplay](src/features/gameplay).

**Test plan:**
- Unit tests:
  - start screen renders production copy
  - permission denial renders cause/next action
  - one-camera state rejects full gameplay
  - duplicate front/side selection is rejected
  - two distinct devices start runtime
  - retry returns to countdown or setup as designed
  - destroy removes event listeners and destroys runtime
  - no diagnostic strings in rendered HTML

**Dependencies:**
- M1 camera permission/device patterns
- M7 runtime
- Prior lessons: HTML escaping, no debug leakage, default-state mismatch

### 10. Wire Game Loop Events to HUD, Renderer, and Audio

**Scope:** Connect pure state, engine, fused input, rendering, HUD patching, and audio.

**Files:**
- Modify [src/app/balloonGameRuntime.ts](src/app/balloonGameRuntime.ts)
- Modify [src/app/gameHud.ts](src/app/gameHud.ts)
- Modify [tests/integration/balloonGameRuntime.test.ts](tests/integration/balloonGameRuntime.test.ts)
- Modify [tests/unit/app/gameHud.test.ts](tests/unit/app/gameHud.test.ts)

**Implementation notes:**
- Each animation frame:
  - compute `deltaMs`
  - advance session/countdown/timer
  - if playing, advance engine
  - adapt latest `FusedGameInputFrame`
  - process newly consumed shot once
  - render canvas
  - patch HUD only when view model changes, if practical
- On shot:
  - play shot sound
  - call hit detection
  - play hit sound only on hit
  - reset combo on miss
- On result transition:
  - stop BGM
  - play time-up once
  - play result once
- On retry:
  - reset engine/session/shot consumption/effects/audio state
  - preserve selected cameras and active lane runtime unless user reselects
- Avoid race: if result transition and destroy happen in same tick, cleanup wins and no late DOM write occurs.

**Test plan:**
- Integration tests:
  - countdown does not spawn balloons
  - playing spawns balloons and decrements timer
  - one fused shot processes exactly once across multiple rAF ticks
  - hit increments score and combo
  - miss resets combo without score penalty
  - time-up transitions once to result
  - retry clears balloons/score/combo/timer and consumed shot keys
  - audio calls happen once per event

**Dependencies:**
- M7 steps 2-8
- Prior lessons: timer drift, countdown race, retry cleanup, shot double-consumption

### 11. Update E2E and Production-Clean Smoke Coverage

**Scope:** Verify `/` is playable shell and `/diagnostic.html` remains unchanged.

**Files:**
- Modify [tests/e2e/home.smoke.spec.ts](tests/e2e/home.smoke.spec.ts)
- Modify [tests/e2e/diagnostic.smoke.spec.ts](tests/e2e/diagnostic.smoke.spec.ts)
- Modify [tests/integration/importBoundaries.test.ts](tests/integration/importBoundaries.test.ts)

**Implementation notes:**
- Home smoke should mock two video input devices.
- Assert:
  - front and side device selectors exist
  - duplicate selection is rejected
  - distinct selection enters ready/countdown/game UI
  - `#game-camera-feed-front` and `#game-camera-feed-side` or equivalent hidden/visible video elements exist as designed
  - `#game-canvas` exists
  - score/time HUD exists
  - countdown/result/retry are reachable with mocked runtime if needed
- Absence assertions:
  - no `diagnostic.html` link
  - no `wb-`
  - no `data-side-trigger-tuning`
  - no `data-fusion-tuning`
  - no `SIDE_TRIGGER_`
  - no `FUSION_`
  - no `landmark`
  - no `wireframe`
- Diagnostic smoke should confirm existing M4/M5/M6 panels still render on `/diagnostic.html`.

**Test plan:**
- `npm run test:e2e`
- `npx vitest run tests/integration/importBoundaries.test.ts`

**Dependencies:**
- M6 diagnostic surfaces
- M7 page flow
- Prior lessons: production-clean boundary, no diagnostic contamination

### 12. Add Replay Coverage for Gameplay With Fused Input

**Scope:** Deterministic multi-frame gameplay sequences outside browser DOM.

**Files:**
- Create [tests/replay/fusedGameplaySequenceReplay.test.ts](tests/replay/fusedGameplaySequenceReplay.test.ts)
- Modify [tests/replay/AGENTS.md](tests/replay/AGENTS.md) if the “Future” note becomes current guidance.

**Implementation notes:**
- Use synthetic `FusedGameInputFrame` arrays from M6 contract.
- Use fixed random sequence for balloon spawning.
- Cover:
  - front-only aim movement during playing
  - paired shot hit
  - paired shot miss
  - repeated same shot frame
  - side-only diagnostic frame
  - no usable input
  - time-up with pending degraded input

**Test plan:**
- `npm run test:replay`
- Assert exact score/combo/timer values with `toBe`.
- Assert final structured state with `toEqual`.

**Dependencies:**
- M6 `FusedGameInputFrame`
- M7 game session/engine/fused adapter
- Prior lessons: deterministic replay, shot edge, degraded input

### 13. Remove or Rename M5 Aim-Only App Artifacts

**Scope:** Prevent misleading app names and unused exports after M7 is wired.

**Files:**
- Delete or replace [src/app/frontAimGamePage.ts](src/app/frontAimGamePage.ts)
- Delete or replace [src/app/frontAimGameRuntime.ts](src/app/frontAimGameRuntime.ts)
- Delete or replace [tests/unit/app/frontAimGamePage.test.ts](tests/unit/app/frontAimGamePage.test.ts)
- Delete or replace [tests/integration/gameFrontAimRuntime.test.ts](tests/integration/gameFrontAimRuntime.test.ts)

**Implementation notes:**
- Prefer new `balloonGame*` names over keeping aim-only names for fused gameplay.
- Do this after replacement tests pass, not before.
- Run `npm run knip` immediately after deletion/rename.
- If keeping wrappers temporarily, wrappers must be used by real entry or tests, not dead exports.

**Test plan:**
- `npm run knip`
- `npm run typecheck`
- `npx vitest run tests/unit/app tests/integration`

**Dependencies:**
- M5 files being superseded
- Prior lessons: knip, DRY across app/features

### 14. Final M7 Acceptance Pass

**Scope:** Verify M7 fulfills Issue #7 and does not regress diagnostic workbench.

**Files:**
- No planned source changes. Only fix gaps found by gates.

**Acceptance checklist:**
- `/` runs 60-second production-clean gameplay.
- Gameplay reads only `FusedGameInputFrame`.
- Balloons spawn, rise, disappear, and score on hit.
- Crosshair follows fused front aim.
- Side-trigger shot via `shotFired` produces exactly one gameplay shot.
- Score, combo, multiplier, timer, countdown, result, retry are visible.
- BGM, shot, hit, time-up, result audio hooks exist.
- `/` has no threshold sliders/debug overlay/landmark wireframe/diagnostic telemetry.
- `/diagnostic.html` remains operational.
- [src/main.ts](src/main.ts) does not import [src/features/diagnostic-workbench](src/features/diagnostic-workbench).
- [src/features/gameplay](src/features/gameplay) does not import raw lane modules.

**Test plan:**
- `npm run check`
- `npm run test:e2e`
- Manual live-camera probe:
  - open `/`
  - assign distinct front/side cameras
  - start countdown
  - verify crosshair from front hand
  - fire from side trigger
  - verify exactly one shot per trigger commit
  - play until result
  - retry and verify clean reset
  - open `/diagnostic.html` and verify workbench still shows front/side/fusion diagnostics

**Dependencies:**
- All M3-M6 contracts
- All M7 tasks

## 3. Risk Register

1. Balloon hit detection accuracy
   - Risk: viewport scaling or canvas CSS size mismatch makes hits feel wrong.
   - Probe: unit test hit detection at canvas edges and after resize; manual probe at four corners and center.

1. Shot edge double-consumption
   - Risk: M6 emits one `shotFired`, but M7 rAF processes the same fused frame repeatedly.
   - Probe: replay and runtime tests repeat the same fused frame across multiple ticks and assert one shot.

1. Timer drift
   - Risk: using frame count or wall-clock inconsistently makes 60 seconds inaccurate.
   - Probe: fake rAF sequence totals exactly `60_000ms`; assert result transition once.

1. Countdown race
   - Risk: repeated start clicks or async runtime readiness starts multiple countdowns.
   - Probe: unit test duplicate `start` and delayed runtime readiness.

1. Retry state cleanup
   - Risk: old balloons, consumed shot keys, audio state, or result events leak into retry.
   - Probe: integration test retry after a hit and result, then first new shot can score once.

1. Fused-input availability vs degraded mode
   - Risk: front-only or side-only diagnostic frames accidentally score.
   - Probe: `frontOnlyAim`, `sideOnlyTriggerDiagnostic`, and `noUsableInput` tests assert no shot action.

1. Fusion timestamp policy regression
   - Risk: gameplay runtime uses rAF time instead of frame timestamps for pairing.
   - Probe: runtime tests assert fusion mapper receives `FrameTimestamp.frameTimestampMs` from `createFrameTimestamp`.

1. MediaPipe lifecycle race
   - Risk: destroy during stream/tracker startup leaks camera or writes stale DOM.
   - Probe: integration tests for destroy-before-tracker-resolve and stream-open-before-tracker-failure.

1. Stale video element
   - Risk: page re-render replaces video nodes while callbacks keep old nodes alive.
   - Probe: runtime/page test re-renders setup and asserts old callbacks do not draw or fuse.

1. Process frame failure
   - Risk: one `createImageBitmap` or tracker failure kills the game loop.
   - Probe: mock rejection once, assert logged and next frame recovers.

1. Default-state mismatch
   - Risk: page render defaults differ from runtime initial state and produce `undefined`.
   - Probe: `gameHud` and page tests compare default view model with runtime initial snapshot.

1. Diagnostic contamination
   - Risk: M7 imports workbench helpers for formatting or side conversion.
   - Probe: import-boundary tests with expected offenders `[]`.

1. Audio autoplay or asset failure
   - Risk: audio promise rejects and blocks gameplay.
   - Probe: runtime catches/logs audio failures while controller unit tests still surface rejection.

1. `knip` unused exports
   - Risk: old M5 app files or new helpers remain unused.
   - Probe: run `npm run knip` after app replacement and final check.

1. Markdown lint MD029
   - Risk: if this decomposition is copied into a committed Markdown plan, ordered list numbering fails.
   - Probe: run formatter/markdown lint in the target commit path if plan is saved.

## 4. Quality Gate Sequence

1. Before M7 edits:
   - `npm run check`
   - `npm run test:e2e`

2. After Steps 1-4:
   - `npx vitest run tests/unit/features/gameplay`
   - `npx vitest run tests/integration/importBoundaries.test.ts`
   - `npm run typecheck`
   - `npm run knip`

3. After Steps 5-7:
   - `npx vitest run tests/unit/app/gameHud.test.ts tests/unit/features/rendering/drawGameFrame.test.ts tests/unit/features/audio/createAudioController.test.ts`
   - `npm run check`

4. After Steps 8-10:
   - `npx vitest run tests/integration/balloonGameRuntime.test.ts tests/unit/app/balloonGamePage.test.ts`
   - `npm run typecheck`
   - `npm run knip`

5. After Steps 11-13:
   - `npm run test:replay`
   - `npm run test:e2e`
   - `npm run check`

6. Final acceptance:
   - `npm run check`
   - `npm run test:e2e`
   - manual two-camera `/` gameplay probe
   - manual `/diagnostic.html` regression probe

## 5. Boundaries Reminder

- [index.html](index.html) and [src/main.ts](src/main.ts) must not import [src/features/diagnostic-workbench](src/features/diagnostic-workbench).
- Game page reads only `FusedGameInputFrame` as semantic gameplay input.
- [src/features/gameplay](src/features/gameplay) must not read raw `AimInputFrame`, raw `TriggerInputFrame`, `FrontHandDetection`, `SideHandDetection`, camera streams, MediaPipe trackers, or diagnostic telemetry.
- App/runtime may compose front/side/fusion because [src/app](src/app) is the browser wiring layer.
- No threshold sliders, debug overlay, workbench panels, landmark wireframe, fusion telemetry, or trigger evidence on `/`.
- Diagnostic workbench user-facing behavior must remain unchanged except for any M6-approved fusion diagnostics already present on `/diagnostic.html`.
- Lane invariant stays fixed:
  - front = aim
  - side = trigger
  - fusion = pairing
  - gameplay = `FusedGameInputFrame` consumer

## 6. M6 Coordination Notes

Expected M6/M7 coordination points:

1. [src/shared/types/fusion.ts](src/shared/types/fusion.ts)
   - M6 owns contract creation.
   - M7 consumes it from gameplay adapter/runtime.
   - Risk: M7 must not reshape it to fit gameplay if diagnostic already depends on it. Add an adapter in gameplay instead.

2. [src/features/input-fusion/index.ts](src/features/input-fusion/index.ts)
   - M6 exports diagnostic-used fusion API.
   - M7 uses the same public API in production runtime.
   - Risk: `knip` and import-boundary tests need updating because app imports `input-fusion` become valid in M7.

3. [src/features/diagnostic-workbench/liveLandmarkInspection.ts](src/features/diagnostic-workbench/liveLandmarkInspection.ts)
   - M6 likely wires fusion here.
   - M7 should not import from it, but may extract shared side detection conversion out of it.
   - Risk: extraction must preserve M6 diagnostic behavior and tests.

4. [src/features/diagnostic-workbench/renderWorkbench.ts](src/features/diagnostic-workbench/renderWorkbench.ts)
   - M6 may extend `WorkbenchInspectionState` with `fusionFrame`, `fusionTelemetry`, `fusionTuning`.
   - M7 should not need to touch it unless shared helper extraction causes type imports to move.
   - Risk: default-state mismatch if M7 changes shared types.

5. [src/diagnostic-main.ts](src/diagnostic-main.ts)
   - M6 likely adds fusion tuning event handling.
   - M7 should avoid touching it.
   - Risk: app-level shared helper changes must not create a second diagnostic event system.

6. [tests/integration/importBoundaries.test.ts](tests/integration/importBoundaries.test.ts)
   - M6 likely forbids game app importing `input-fusion`.
   - M7 must relax that specific rule while keeping `diagnostic-workbench` forbidden.
   - Risk: stale M6 absence rule blocks intended production fusion wiring.

7. [tests/e2e/home.smoke.spec.ts](tests/e2e/home.smoke.spec.ts)
   - M6 likely adds fusion absence assertions.
   - M7 must keep absence of diagnostic UI, but no longer assert that production game lacks all fusion behavior internally.
   - Risk: assertions should target visible diagnostic text/controls, not implementation imports.

8. [src/app/frontAimGameRuntime.ts](src/app/frontAimGameRuntime.ts) and [src/app/frontAimGamePage.ts](src/app/frontAimGamePage.ts)
   - M6 should not touch them by plan, but any `claude/m6-followup` changes must be inspected before M7 replacement.
   - Risk: M5 follow-up fixes for cleanup/processFrame recovery must be carried into new `balloonGame*` files.

9. [src/styles/diagnostic.css](src/styles/diagnostic.css) and [src/styles/app.css](src/styles/app.css)
   - M6 touches diagnostic styles.
   - M7 touches app styles.
   - Risk: class names like `wb-*` must remain diagnostic-only; app CSS should not reuse workbench selectors.

## 7. Audio Policy

Audio is in M7 scope for playback hooks and existing runtime-served assets. It is not deferred to M8 because M8 is calibration/tuning, while foundation spec includes audio in PoC gameplay scope.

M7 includes:
- BGM hook: [public/audio/bgm.mp3](public/audio/bgm.mp3)
- shot hook: [public/audio/shot.mp3](public/audio/shot.mp3)
- hit hook: [public/audio/hit.mp3](public/audio/hit.mp3)
- time-up hook: [public/audio/time-up.mp3](public/audio/time-up.mp3)
- result hook: [public/audio/result.mp3](public/audio/result.mp3)

M7 defers:
- new audio asset production
- volume UI
- mute settings
- persistent audio preferences
- detailed audio mixing

The runtime should use [src/features/audio/createAudioController.ts](src/features/audio/createAudioController.ts), catch/log browser playback failures at the app boundary, and keep gameplay functional if an audio promise rejects.
