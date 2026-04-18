# M5 Implementation-Granularity Task Decomposition

**Milestone:** Issue #5, Front Aim Workbench and Clean Game Crosshair
**Goal:** Establish the `FrontHandDetection -> AimInputFrame` mapping, expose front aim telemetry in `diagnostic.html`, and show a production-clean crosshair on `index.html` without landmark overlays or workbench imports.
**Boundary:** No side-triggered shots in gameplay, no fusion pairing, no diagnostic UI on the game page.

## Pre-flight checks

Before starting M5, verify all of the following on post-M4 `main`.

1. M3 and M4 must be merged and passing.
   - `HEAD` should be `35d6662` or later, plus the M4 merge commit.
   - `diagnostic.html` still renders front/side previews and raw/filtered landmark overlays.
   - M4 side trigger workbench exists and remains diagnostic-only:
     - side world-landmark readout
     - side trigger phase / evidence / dwell / cooldown
     - side trigger threshold sliders only on `diagnostic.html`
   - `index.html` and `src/main.ts` must not import `src/features/diagnostic-workbench/`.

2. Required M3/M4 contracts must exist.
   - `src/shared/types/camera.ts`
     - `FrameTimestamp`
     - `LaneHealthStatus`
     - `CameraLaneRole`
   - `src/shared/types/hand.ts`
     - `FrontHandDetection`
     - `SideHandDetection`
     - `HandFrame`
     - `HandDetection`
   - M4 likely adds:
     - `src/shared/types/trigger.ts`
     - `TriggerInputFrame`
     - `SideTriggerTelemetry`
     - side trigger fields in `WorkbenchInspectionState`
   - M5 must add `AimInputFrame` only when it is immediately consumed by front-aim mapper, diagnostic workbench, game wiring, or tests. Do not pre-export unused types because `knip` is enforced.

3. Baseline quality gates must pass before coding.
   - `npm run check`
   - `npm run test:e2e`
   - If M4 only ran the split commands, re-run the combined gate because `npm run check` includes `knip`.

4. Re-check concurrent M4 branch state.
   - During this research pass, `origin/claude/m4-followup` was not present in local refs and GitHub branch search returned no branch.
   - The M5 delegate should still run after normal network access is available:
     - `git fetch --prune origin`
     - `git log --oneline origin/claude/m4-followup -- src` if the branch appears
   - If that branch exists, inspect it before editing `renderWorkbench.ts`, `liveLandmarkInspection.ts`, `diagnostic-main.ts`, or diagnostic tests.

5. Confirm current game page state before replacing it.
   - Current `src/main.ts` is only `import "./styles/app.css";`.
   - Current `index.html` is a placeholder with a diagnostic link.
   - M5 must transform this into a production-clean v2 game page shell, not into another diagnostic surface.

## Numbered implementation steps

### 1. Add the front-aim module boundary and shared aim contract

**Scope:** Establish the M5 boundary before adding behavior.

**Files to create / modify:**
- Create `src/features/front-aim/AGENTS.md`
- Create `src/features/front-aim/CLAUDE.md` as a sibling symlink to `AGENTS.md`
- Create `src/features/front-aim/index.ts`
- Create `src/shared/types/aim.ts`
- Modify `src/shared/types/AGENTS.md` only if it needs a short mention of aim/game input contracts
- Add `tests/unit/features/front-aim/aimTypeContract.test.ts`

**Implementation notes:**
- `src/features/front-aim/AGENTS.md` must be English.
- `front-aim` consumes `FrontHandDetection` and emits `AimInputFrame`.
- `front-aim` must not import from:
  - `src/features/side-trigger/`
  - `src/features/input-fusion/`
  - `src/features/gameplay/`
  - `src/features/diagnostic-workbench/`
- `src/shared/types/aim.ts` should define:
  - `AimAvailability`: `"available" | "estimatedFromRecentFrame" | "unavailable"`
  - `AimSmoothingState`: `"coldStart" | "tracking" | "recoveringAfterLoss"`
  - `AimInputFrame`
  - `FrontAimTelemetry`
  - `FrontAimLastLostReason`
- `AimInputFrame` should match the v2 plan:
  - `laneRole: "frontAim"`
  - `timestamp: FrameTimestamp`
  - `aimAvailability`
  - `aimPointViewport: { x: number; y: number }`
  - `aimPointNormalized: { x: number; y: number }`
  - `aimSmoothingState`
  - `frontHandDetected`
  - `frontTrackingConfidence`
  - `sourceFrameSize: { width: number; height: number }`
- Avoid exporting future calibration types unless M5 actually consumes them.

**Test plan:**
- `tests/unit/features/front-aim/aimTypeContract.test.ts`
  - compiles a valid `AimInputFrame` using `FrameTimestamp`
  - verifies `laneRole` is the literal `"frontAim"`
  - compiles sample `FrontAimTelemetry` using an `AimInputFrame`
- Run:
  - `npx vitest run tests/unit/features/front-aim/aimTypeContract.test.ts`
  - `npm run typecheck`
  - `npm run knip`

**Dependency on M3/M4 contracts:**
- Requires M3 `FrameTimestamp`.
- Requires M3 `FrontHandDetection`.
- Does not depend on M4 side-trigger contracts.

### 2. Implement viewport projection and pure front aim mapping

**Scope:** Convert one front detection into one viewport-safe aim frame.

**Files to create / modify:**
- Create `src/features/front-aim/frontAimProjection.ts`
- Create `src/features/front-aim/mapFrontHandToAimInput.ts`
- Modify `src/features/front-aim/index.ts`
- Add `tests/unit/features/front-aim/frontAimProjection.test.ts`
- Add `tests/unit/features/front-aim/mapFrontHandToAimInput.test.ts`

**Implementation notes:**
- Use `FrontHandDetection.filteredFrame.landmarks.indexTip` as the initial aim source.
- Projection must account for:
  - source frame size from `HandFrame.width` / `HandFrame.height`
  - viewport size in CSS pixels
  - object-fit behavior used by the game video background, initially `"cover"`
  - optional horizontal mirroring for the production camera feed
  - clamping to viewport bounds
- Keep the projection utility pure:
  - input: normalized landmark point, source size, viewport size, projection options
  - output: viewport point and normalized viewport point
- `mapFrontHandToAimInput` should:
  - copy `FrontHandDetection.timestamp`
  - copy source frame size
  - set `frontHandDetected: true`
  - set `frontTrackingConfidence` from `handPresenceConfidence`
  - set `aimAvailability: "available"` when tracking quality is usable
  - set `aimSmoothingState: "tracking"` after the cold-start frame
  - not invent trigger, shot, fusion, or gameplay fields

**Test plan:**
- `frontAimProjection.test.ts`
  - maps center point to viewport center
  - clamps out-of-range points
  - mirrors x when `mirrorX: true`
  - handles cover-crop offsets for mismatched source/viewport aspect ratios
- `mapFrontHandToAimInput.test.ts`
  - maps synthetic `FrontHandDetection` to `AimInputFrame`
  - copies `FrameTimestamp` exactly
  - uses `filteredFrame`, not `rawFrame`
  - preserves `laneRole: "frontAim"`
  - sets confidence from `handPresenceConfidence`
- Run:
  - `npx vitest run tests/unit/features/front-aim/frontAimProjection.test.ts tests/unit/features/front-aim/mapFrontHandToAimInput.test.ts`
  - `npm run typecheck`

**Dependency on M3/M4 contracts:**
- Requires M3 `FrontHandDetection.filteredFrame`.
- Requires M3 `FrameTimestamp`.
- Does not depend on M4 side-trigger files.

### 3. Add the stateful front aim mapper and telemetry assembly

**Scope:** Add loss/recovery/default-state behavior around the pure mapper.

**Files to create / modify:**
- Create `src/features/front-aim/frontAimConstants.ts`
- Create `src/features/front-aim/createFrontAimMapper.ts`
- Create `src/features/front-aim/frontAimTelemetry.ts`
- Modify `src/features/front-aim/index.ts`
- Add `tests/unit/features/front-aim/createFrontAimMapper.test.ts`
- Add `tests/unit/features/front-aim/frontAimTelemetry.test.ts`

**Implementation notes:**
- Keep the mapper pure-stateful, not browser-aware.
- Input per update:
  - `FrontHandDetection | undefined`
  - viewport size
  - projection options
- Output:
  - latest `AimInputFrame | undefined`
  - `FrontAimTelemetry`
- Constants should be named and minimal:
  - `FRONT_AIM_MIN_TRACKING_CONFIDENCE`
  - `FRONT_AIM_LOST_FRAME_GRACE_FRAMES`
- If `detection` is `undefined`:
  - do not fabricate a fresh timestamp
  - keep telemetry explicit: `aimAvailability: "unavailable"` or `estimatedFromRecentFrame` only inside the configured grace window
  - do not draw a crosshair after grace expires
- Reset mapper state when `deviceId` or `streamId` changes.
- Default state values must match initial-state values used by diagnostic rendering.

**Test plan:**
- `createFrontAimMapper.test.ts`
  - first valid detection starts as `coldStart`
  - subsequent valid detections become `tracking`
  - brief hand loss returns `estimatedFromRecentFrame`
  - long hand loss becomes `unavailable`
  - stream change resets smoothing/recovery state
  - low confidence marks aim unavailable or records a reject reason
- `frontAimTelemetry.test.ts`
  - assembles `front.mapping.aimAvailability`
  - includes viewport and normalized points when available
  - includes smoothing state and last lost reason
  - never includes raw `deviceId`
- Run:
  - `npx vitest run tests/unit/features/front-aim`
  - `npm run typecheck`
  - `npm run knip`

**Dependency on M3/M4 contracts:**
- Requires M3 `FrontHandDetection.deviceId`, `streamId`, `timestamp`, `trackingQuality`, and `handPresenceConfidence`.
- Does not depend on M4 trigger output.
- Must coexist with M4 `TriggerInputFrame` but must not import it.

### 4. Render front aim telemetry in the diagnostic workbench

**Scope:** Add front aim mapping visibility to `diagnostic.html`.

**Files to create / modify:**
- Create `src/features/diagnostic-workbench/renderFrontAimPanel.ts`
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/styles/diagnostic.css`
- Add `tests/unit/features/diagnostic-workbench/renderFrontAimPanel.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`

**Implementation notes:**
- Extend `WorkbenchInspectionState` additively with:
  - `frontAimFrame: AimInputFrame | undefined`
  - `frontAimTelemetry: FrontAimTelemetry | undefined`
- Preserve all M4 side trigger fields in `WorkbenchInspectionState`.
- Update both the static default inspection state and live initial inspection state with identical front aim defaults.
- Render a front aim panel under the front lane:
  - aim availability
  - viewport x/y
  - normalized x/y
  - smoothing state
  - tracking confidence
  - source frame size
  - last lost reason
- Keep existing front raw/filtered landmark overlays only in the workbench.
- Do not add any front aim panel, sliders, or telemetry to `index.html`.
- Do not add front smoothing sliders unless Step 3 actually introduced runtime-tunable smoothing. If added, reuse M4’s tuning control pattern rather than creating a separate slider framework.

**Test plan:**
- `renderFrontAimPanel.test.ts`
  - renders available aim x/y with stable formatting
  - renders unavailable state before the first mapped frame
  - escapes all text
  - does not render raw `deviceId`
- `renderWorkbench.test.ts`
  - includes the front aim panel in previewing mode
  - keeps M4 side trigger panel intact
  - default inspection state matches `createLiveLandmarkInspection().getState()`
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderFrontAimPanel.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
  - `npm run typecheck`

**Dependency on M3/M4 contracts:**
- Requires M3 `WorkbenchInspectionState` location in `renderWorkbench.ts`.
- Must preserve M4 additions to `WorkbenchInspectionState`, side trigger panel rendering, and tuning controls.
- Uses new M5 `AimInputFrame` / `FrontAimTelemetry`.

### 5. Wire the front aim mapper into live diagnostic inspection

**Scope:** Feed live front detections into the M5 mapper and patch the workbench DOM.

**Files to create / modify:**
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify `src/diagnostic-main.ts` only if M4 moved tuning/event wiring there and front aim controls need entry-level event handling
- Modify `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
- Modify `tests/e2e/diagnostic.smoke.spec.ts` or add `tests/e2e/diagnostic.front-aim.spec.ts`

**Implementation notes:**
- Instantiate one front aim mapper for the active front stream.
- Feed it `inspectionState.frontDetection` after each front detection update.
- Pass current front preview viewport size. If DOM dimensions are unavailable in unit tests, inject or derive a deterministic fallback.
- Patch front aim text in-place where possible; avoid rebuilding video elements on every frame.
- Preserve M3/M4 protections:
  - MediaPipe tracker cleanup on stop/destroy
  - async guard after stop/destroy
  - stale video element detection after workbench re-render
  - reset state on reselect/swap/stream change
- If M4 has introduced side trigger mapper state in this file, do not overwrite it. Add front aim state alongside it.

**Test plan:**
- Extend `liveLandmarkInspection.test.ts`:
  - mapped front aim frame appears after a front detection
  - front aim telemetry clears on reselect/destroy
  - stale detection results after stop do not write `frontAimFrame`
  - tracker cleanup tests still pass
  - stale video element re-render test still restarts tracking
- E2E:
  - diagnostic preview contains front aim telemetry labels
  - diagnostic preview still contains M4 side trigger evidence
  - landmark overlays remain diagnostic-only
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - `npm run test:e2e`

**Dependency on M3/M4 contracts:**
- Requires M3 live front detection flow.
- Must preserve M4 side trigger state fields and tuning behavior.
- Uses M5 `createFrontAimMapper`.

### 6. Replace the game placeholder with a production-clean front aim shell

**Scope:** Convert `index.html` / `src/main.ts` from placeholder to a clean game page scaffold.

**Files to create / modify:**
- Modify `index.html`
- Modify `src/main.ts`
- Create `src/app/frontAimGamePage.ts`
- Modify `src/styles/app.css`
- Add `tests/unit/app/frontAimGamePage.test.ts`
- Modify `tests/e2e/home.smoke.spec.ts`

**Implementation notes:**
- `index.html` should expose only the game root, e.g. `<div id="app"></div>`.
- Remove the visible diagnostic link from the production game page.
- `src/main.ts` should stay thin:
  - import `app.css`
  - mount the front aim game page
  - register cleanup on unload if the app controller exposes `destroy`
- The game page shell may include:
  - camera permission/start screen
  - front camera selection when multiple cameras exist
  - full-screen camera background
  - full-screen canvas
  - minimal HUD/copy that clearly states this milestone is aim-only
- It must not include:
  - diagnostic workbench imports
  - landmark overlay canvas
  - threshold sliders
  - debug panels
  - side-trigger shot wiring
- Existing `.debug-root` / `.debug-panel` CSS should be removed or left unused only if tests assert they are not rendered. Prefer removing unused dev overlay CSS while touching `app.css`.

**Test plan:**
- `frontAimGamePage.test.ts`
  - renders permission/start state
  - renders camera selection from fake devices
  - handles permission denial with user-facing cause/next action
  - does not render diagnostic links or slider controls
- `home.smoke.spec.ts`
  - home page renders game title/start affordance
  - no `diagnostic.html` link is visible
  - no text matching landmark/threshold/slider/debug controls is visible
- Run:
  - `npx vitest run tests/unit/app/frontAimGamePage.test.ts`
  - `npm run test:e2e`
  - `npm run typecheck`

**Dependency on M3/M4 contracts:**
- Reuses existing M3 camera helpers:
  - `requestCameraPermission`
  - `enumerateVideoDevices`
  - `createDevicePinnedStream`
- Does not depend on M4 trigger types.
- Must not import `src/features/diagnostic-workbench/`.

### 7. Wire live front aim tracking and production crosshair on the game page

**Scope:** Make `index.html` display the front-camera-driven crosshair without diagnostics.

**Files to create / modify:**
- Create `src/app/frontAimGameRuntime.ts`
- Modify `src/app/frontAimGamePage.ts`
- Modify `src/features/rendering/drawGameFrame.ts` only if the existing crosshair rendering needs production styling changes
- Modify `tests/unit/features/rendering/drawGameFrame.test.ts` if rendering behavior changes
- Add `tests/integration/gameFrontAimRuntime.test.ts`
- Modify `tests/unit/app/frontAimGamePage.test.ts`

**Implementation notes:**
- Runtime responsibilities:
  - open selected front stream
  - attach stream to the production video element
  - schedule video frames via `requestVideoFrameCallback` with timeout fallback
  - create `FrameTimestamp`
  - run `createMediaPipeHandTracker`
  - convert the tracker’s `HandDetection` into the existing `FrontHandDetection` shape
  - pass `FrontHandDetection` into `createFrontAimMapper`
  - render `drawGameFrame(ctx, { balloons: [], crosshair })`
- The game page should draw crosshair only when `AimInputFrame.aimAvailability` is `"available"` or `"estimatedFromRecentFrame"`.
- No shots:
  - do not call `registerShot`
  - do not read `TriggerInputFrame`
  - do not import `side-trigger`
  - do not import `input-fusion`
- Mandatory cleanup:
  - stop camera stream tracks
  - cancel video frame callback or timeout
  - call `MediaPipeHandTracker.cleanup()`
  - guard every async continuation after stop/destroy
- Stale video element detection:
  - if the page re-renders and a new video/canvas element replaces the old one, stop the old runtime and start a fresh one
  - do not keep drawing into stale canvas elements

**Test plan:**
- `gameFrontAimRuntime.test.ts`
  - starts tracker on video frame
  - maps a synthetic front detection to crosshair draw input
  - uses mirrored projection when the production video is mirrored
  - hides crosshair after unavailable aim
  - calls tracker cleanup on destroy
  - does not write crosshair state after destroy while tracker startup is pending
  - does not write crosshair state after destroy while detect is in flight
- `drawGameFrame.test.ts`
  - still draws balloons
  - draws crosshair when provided
  - draws no landmark wireframe
- Run:
  - `npx vitest run tests/integration/gameFrontAimRuntime.test.ts tests/unit/features/rendering/drawGameFrame.test.ts`
  - `npm run typecheck`

**Dependency on M3/M4 contracts:**
- Requires M3 `FrameTimestamp` and `FrontHandDetection`.
- Reuses M3 MediaPipe tracker interface.
- Does not depend on M4 side trigger.
- Must respect M5 lesson: MediaPipe cleanup and async race guards are mandatory for this new tracker.

### 8. Add import-boundary and production-clean regression guards

**Scope:** Prevent M5 from leaking workbench or trigger concepts into the game page.

**Files to create / modify:**
- Create `tests/integration/importBoundaries.test.ts` if M4 did not create it
- Otherwise modify the M4-created `tests/integration/importBoundaries.test.ts`
- Modify `tests/e2e/home.smoke.spec.ts`
- Optionally modify `eslint.config.mjs` only if the existing boundaries setup can express the rule without a broad refactor

**Implementation notes:**
- Static boundary test should guard:
  - `src/main.ts` does not import `src/features/diagnostic-workbench/`
  - `src/app/**` game page files do not import `src/features/diagnostic-workbench/`
  - `src/features/front-aim/` does not import `side-trigger`, `input-fusion`, `gameplay`, or `diagnostic-workbench`
  - `src/features/gameplay/` does not import `front-aim`, `side-trigger`, `input-fusion`, or `diagnostic-workbench`
  - `src/features/rendering/` does not import hand tracking or diagnostic workbench
- E2E production-clean assertions:
  - no landmark overlay IDs on `/`
  - no threshold slider labels on `/`
  - no debug panel on `/`
  - no diagnostic workbench panel on `/`
  - crosshair canvas exists on `/` after front aim setup path
- Prefer deterministic static scans over fragile visual assertions where possible.

**Test plan:**
- Run:
  - `npx vitest run tests/integration/importBoundaries.test.ts`
  - `npm run test:e2e`
  - `npm run lint`
  - `npm run typecheck`

**Dependency on M3/M4 contracts:**
- If M4 already created boundary tests for side-trigger leakage, extend them instead of creating a duplicate test file.
- No direct dependency on `FrameTimestamp`.

### 9. Final M5 acceptance pass

**Scope:** Verify the implementation as front aim mapping plus clean game crosshair.

**Files to create / modify:**
- No new source files expected.
- Only adjust tests if acceptance gaps are found.

**Acceptance checklist:**
- `FrontHandDetection -> AimInputFrame` path exists.
- Front aim mapping uses `FrontHandDetection.filteredFrame`.
- `AimInputFrame.timestamp` is copied from `FrontHandDetection.timestamp`.
- Diagnostic workbench shows front aim mapping telemetry.
- Diagnostic workbench still shows M3 landmark overlays.
- Diagnostic workbench still shows M4 side trigger telemetry and sliders.
- Game page shows production crosshair from front aim.
- Game page has no landmark wireframes.
- Game page has no threshold sliders.
- Game page has no development overlays.
- `index.html` / `src/main.ts` do not import diagnostic workbench modules.
- No side-triggered shots are wired.
- No fusion pairing is implemented.
- MediaPipe tracker cleanup is verified for the game runtime.
- Async stop/destroy guards are verified for the game runtime.
- Workbench stale-video-element detection still passes.
- Default inspection state and live initial state match.

**Test plan:**
- Run full gates:
  - `npm run check`
  - `npm run test:e2e`
- Manual live-camera probe:
  - open `/diagnostic.html`
  - assign front and side cameras
  - verify front aim telemetry changes with index fingertip movement
  - verify M4 side trigger panel still renders
  - open `/`
  - select/allow front camera
  - verify camera background and crosshair appear
  - verify no landmark wireframe, threshold slider, or diagnostic panel appears
  - move hand across center/corners and note mirror/crop alignment

**Dependency on M3/M4 contracts:**
- Requires all post-M4 diagnostic workbench contracts.
- Requires M3 camera/tracking lifecycle contracts.
- M5 must not consume M4 `TriggerInputFrame` in gameplay.

## Risk register

1. **Post-M4 contract drift**
   - Risk: M4 renames `WorkbenchInspectionState`, changes `liveLandmarkInspection.ts`, or moves tuning/event state.
   - Probe: before coding, run `rg -n "WorkbenchInspectionState|TriggerInputFrame|SideTriggerTelemetry|createLiveLandmarkInspection" src tests`.
   - Decision: adapt M5 to the post-M4 shape; do not restore M3-era fields by accident.

2. **Projection mismatch from mirrored video**
   - Risk: the camera feed is mirrored but aim projection is not, so the crosshair moves opposite the visible hand.
   - Probe: Step 2 unit tests for `mirrorX`, then manual game-page center/left/right hand movement.
   - Decision: make `mirrorX` an explicit projection option; game page uses the same value as its video CSS.

3. **Projection mismatch from `object-fit: cover` cropping**
   - Risk: normalized landmark coordinates map to the source frame, while the visible video is cropped by CSS cover.
   - Probe: Step 2 aspect-ratio tests with 640x480 source into wide and tall viewports.
   - Decision: keep projection in a pure utility that models cover offsets before clamping.

4. **Game page accidentally becomes a diagnostic page**
   - Risk: crosshair work pulls landmark overlays or tuning controls into `/`.
   - Probe: Step 8 import-boundary test and E2E absence assertions.
   - Decision: reject any game-page import from `diagnostic-workbench`.

5. **MediaPipe lifecycle leaks on the new game runtime**
   - Risk: M3 cleanup tests protect only diagnostic tracking, not the new game tracker.
   - Probe: Step 7 integration tests for cleanup after destroy, pending tracker startup, and in-flight detect.
   - Decision: M5 cannot be accepted until game runtime cleanup tests pass.

6. **Async stale writes after stop/destroy**
   - Risk: pending detection writes crosshair after navigation, reselect, or destroy.
   - Probe: Step 7 deferred-promise tests mirroring M3’s stale detection tests.
   - Decision: add generation/stopped guards around tracker creation, bitmap creation, detect, mapper update, and draw.

7. **Stale video/canvas element after re-render**
   - Risk: front runtime keeps using a removed video or canvas element.
   - Probe: Step 7 test that re-renders the game page with fresh elements and verifies old callbacks are canceled.
   - Decision: key active runtime by stream id plus element identity, as M3 does for workbench tracking.

8. **`knip` flags unused exported aim contracts**
   - Risk: `AimInputFrame` or telemetry types are exported before production code consumes them.
   - Probe: run `npm run knip` after Steps 1 and 3.
   - Decision: keep types local until they cross a real boundary; tests alone should not be the only consumer for long-lived exports.

9. **Front tracking quality remains placeholder**
   - Risk: M3 currently hard-codes `trackingQuality: "good"` in diagnostic conversion.
   - Probe: Step 3 low-confidence tests and manual hand-loss probe.
   - Decision: M5 may compute aim availability from `handPresenceConfidence` and mapper state even if `trackingQuality` remains coarse; do not change detection schema unless necessary.

10. **M4 merge conflict in workbench files**
   - Risk: both M4 and M5 modify `renderWorkbench.ts`, `liveLandmarkInspection.ts`, `diagnostic-main.ts`, and diagnostic tests.
   - Probe: rebase M5 branch onto post-M4 main before touching those files; inspect M4 diff first.
   - Decision: append front aim state to M4’s side trigger state rather than replacing whole objects.

11. **User expectation mismatch around shooting**
   - Risk: game page crosshair looks playable, but side-triggered shots are intentionally not wired until M6+.
   - Probe: Step 6 copy and tests should label the M5 game page as aim-only without diagnostic wording.
   - Decision: do not add temporary keyboard/mouse shooting unless a later issue explicitly asks for it.

## Quality gate sequence

1. **Before M5 branch work**
   - `npm run check`
   - `npm run test:e2e`

2. **After Steps 1-3**
   - `npx vitest run tests/unit/features/front-aim`
   - `npm run typecheck`
   - `npm run knip`

3. **After Steps 4-5**
   - `npx vitest run tests/unit/features/diagnostic-workbench/renderFrontAimPanel.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
   - `npm run check`
   - `npm run test:e2e`

4. **After Steps 6-7**
   - `npx vitest run tests/unit/app/frontAimGamePage.test.ts tests/integration/gameFrontAimRuntime.test.ts tests/unit/features/rendering/drawGameFrame.test.ts`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:e2e`

5. **After Step 8 and before PR**
   - `npx vitest run tests/integration/importBoundaries.test.ts`
   - `npm run check`
   - `npm run test:e2e`

6. **Final acceptance**
   - `npm run check`
   - `npm run test:e2e`
   - Manual live-camera probe on `/diagnostic.html` and `/`

## Boundaries reminder

- Preserve the lane invariant:
  - front = aim
  - side = trigger
  - fusion = later pairing
- `index.html` / `src/main.ts` must not import `src/features/diagnostic-workbench/`.
- No landmark wireframes on the game canvas.
- No threshold sliders on the game page.
- No development overlays on the game page.
- Front aim telemetry, landmark overlays, and optional tuning controls live only in `diagnostic.html`.
- Side-triggered shots are not wired to the game in M5.
- Do not add fusion pairing in M5.
- Do not reuse one camera as both front and side lanes.
- Do not introduce a workbench-only detection schema.
- Reuse the existing `FrontHandDetection` shape from M3.

## M4 coordination notes

Files and symbols likely touched by both M4 and M5:

- `src/features/diagnostic-workbench/renderWorkbench.ts`
  - M4 adds side trigger fields to `WorkbenchInspectionState`.
  - M5 adds front aim fields to the same state.
  - Merge rule: preserve M4 side fields and append M5 front fields; do not replace the interface wholesale.

- `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
  - M4 wires side trigger mapper, telemetry, tuning, and reset behavior.
  - M5 wires front aim mapper and telemetry.
  - Merge rule: keep M3 cleanup/race/stale-video guards and M4 side-trigger state; add front mapper as a parallel lane concern.

- `src/diagnostic-main.ts`
  - M4 may add slider/event handling for side trigger tuning.
  - M5 may need front aim event handling only if front tuning controls are added.
  - Merge rule: extend existing action handling, do not create a second diagnostic event system.

- `src/styles/diagnostic.css`
  - M4 adds world landmark, side trigger, and tuning panel styles.
  - M5 adds front aim telemetry styles.
  - Merge rule: reuse panel/table/readout classes where possible.

- `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
  - M4 adds side trigger render expectations.
  - M5 adds front aim render expectations.
  - Merge rule: keep both in preview-mode fixture.

- `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - M4 adds side trigger mapper/tuning/reset tests.
  - M5 adds front aim mapper/reset/stale-write tests.
  - Merge rule: preserve existing M3 tests for MediaPipe cleanup, async stop guard, stale detect write, and stale video element re-render.

- `tests/e2e/diagnostic.smoke.spec.ts`
  - M4 adds side trigger panel and slider smoke checks.
  - M5 adds front aim telemetry smoke checks.
  - Merge rule: keep diagnostic-only assertions here; do not assert these panels on `/`.

- `tests/integration/importBoundaries.test.ts`
  - M4 may create this for side-trigger leakage.
  - M5 should extend it for front-aim and game-page cleanliness.
  - Merge rule: one shared boundary test file is preferable to duplicate scanners.

- `src/shared/types/hand.ts`
  - M4 may extract `SideViewQuality` from the inline union.
  - M5 should avoid changing `FrontHandDetection` unless absolutely required.
  - Merge rule: no new front detection schema; derive aim semantics in `src/features/front-aim/`.

- `src/shared/types/trigger.ts`
  - M4 owns this.
  - M5 should not import it, except possibly in future M6 fusion work.

- `src/features/diagnostic-workbench/renderTuningControls.ts`
  - M4 may create this for side trigger sliders.
  - M5 should only touch it if front aim introduces runtime-tunable controls.
  - Merge rule: no tuning controls on `index.html`.

Current research note: no `origin/claude/m4-followup` branch was available during this read-only planning pass, but the M5 implementer should still fetch/re-check before editing because M4 was described as concurrent.
