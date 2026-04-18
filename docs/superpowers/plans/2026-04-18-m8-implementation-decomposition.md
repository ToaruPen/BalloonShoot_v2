# M8: Calibration and Tuning Pass 実装粒度タスク分解

## 1. Pre-flight checks

M8 開始前に post-M7 main が次を満たすことを確認する。

- `git rev-parse --short HEAD` が `1fa082a` 以降であること。今回確認時点は `1fa082a`。
- `gh issue view 8` が `M8: Calibration and Tuning Pass` を指し、M7 完了依存・session-only boundary が明記されていること。
- `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` には calibration の詳細仕様はない。M8 の具体形は `docs/superpowers/plans/2026-04-15-v2-two-camera-implementation-plan.md` と Issue #8 を source of truth とする。
- `AimInputFrame` は `src/shared/types/aim.ts` で `laneRole`, `timestamp`, `aimAvailability`, `aimPointViewport`, `aimPointNormalized`, `aimSmoothingState`, `frontHandDetected`, `frontTrackingConfidence`, `sourceFrameSize` を持つ。calibration 値は現状持たない。
- `FrontAimTelemetry` は discriminated union だが、現状 `calibrationStatus` と calibration 値を持たない。M8 で追加する。
- `TriggerInputFrame` は `src/shared/types/trigger.ts` で trigger phase / edge / pulled / confidence / dwell counts を持つ。calibration 値は現状持たない。
- `SideTriggerTelemetry` は `calibrationStatus: "uncalibrated" | "liveTuning"` を持つが、open/pulled calibration 値を持たない。M8 で status と値を再定義する。
- `FusedGameInputFrame` は `src/shared/types/fusion.ts` で `AimInputFrame | undefined` と `TriggerInputFrame | undefined` をそのまま運ぶ。M8 では fusion contract を原則変更しない。
- `FusionTelemetry` は fusion timing/timestamp/shot consumption を扱う。lane-local calibration telemetry は入れない。
- M4 side trigger tuning は `sideTriggerConfig.ts` の metadata 配列、`coerceSideTriggerTuningValue`, `renderTuningControls.ts`, `liveLandmarkInspection.ts`, `diagnostic-main.ts` の `data-side-trigger-tuning` で配線されている。
- M6 fusion tuning は `fusionConfig.ts` の metadata 配列、`coerceFusionTuningValue`, `renderFusionTuningControls.ts`, `liveLandmarkInspection.ts`, `diagnostic-main.ts` の `data-fusion-tuning` で配線されている。
- `balloonGameRuntime.ts` は game page で `createFrontAimMapper()` / `createSideTriggerMapper()` / `createInputFusionMapper()` を使い、gameplay は fused frame だけを読む。game page に diagnostic UI はない。

## 2. Numbered implementation steps

### 1. Front aim calibration contract and defaults

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/front-aim/frontAimCalibration.ts`
- Modify: `src/features/front-aim/frontAimConstants.ts`
- Modify: `src/features/front-aim/index.ts`
- Modify: `src/shared/types/aim.ts`
- Add tests: `tests/unit/features/front-aim/frontAimCalibration.test.ts`
- Modify tests: `tests/unit/features/front-aim/aimTypeContract.test.ts`

**Implementation notes**

- Add feature-local `FrontAimCalibration` as the lane-local state type.
- Add shared telemetry snapshot types in `src/shared/types/aim.ts`, because shared types cannot import from `features/front-aim/`:
  - `FrontAimCalibrationStatus = "default" | "liveTuning"`
  - `FrontAimCalibrationSnapshot`
- In `frontAimCalibration.ts`, make `FrontAimCalibration` an alias or structurally identical type to the shared snapshot.
- Use axis-aligned corner bounds rather than full 4-corner homography for M8:
  - `center: { x, y }`
  - `cornerBounds: { leftX, rightX, topY, bottomY }`
- Named defaults:
  - `DEFAULT_FRONT_AIM_CENTER_X = 0.5`
  - `DEFAULT_FRONT_AIM_CENTER_Y = 0.5`
  - `DEFAULT_FRONT_AIM_CORNER_LEFT_X = 0`
  - `DEFAULT_FRONT_AIM_CORNER_RIGHT_X = 1`
  - `DEFAULT_FRONT_AIM_CORNER_TOP_Y = 0`
  - `DEFAULT_FRONT_AIM_CORNER_BOTTOM_Y = 1`
- Export:
  - `defaultFrontAimCalibration`
  - `FRONT_AIM_CALIBRATION_SLIDER_METADATA`
  - `coerceFrontAimCalibrationValue`
  - `updateFrontAimCalibrationValue`
  - `frontAimCalibrationStatusFor`
- Default-state-mismatch guard: tests must assert every default calibration field is exactly sourced from the named constants.

**Test plan**

- Unit: metadata includes each constant exactly once.
- Unit: `defaultFrontAimCalibration` equals named constants.
- Unit: `coerceFrontAimCalibrationValue` clamps values to `[0, 1]` and maintains a minimum span between left/right and top/bottom if implemented there.
- Type contract: available and unavailable `FrontAimTelemetry` must both carry calibration status and calibration snapshot.

**Dependencies**

- M3: front detection shape and `HandFrame` landmarks.
- M5: `AimInputFrame` and front telemetry contracts.
- M6/M7: no fusion/gameplay contract change.

### 2. Side trigger calibration contract and defaults

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/side-trigger/sideTriggerCalibration.ts`
- Modify: `src/features/side-trigger/sideTriggerConstants.ts`
- Modify: `src/features/side-trigger/index.ts`
- Modify: `src/shared/types/trigger.ts`
- Add tests: `tests/unit/features/side-trigger/sideTriggerCalibration.test.ts`
- Modify tests: `tests/unit/features/side-trigger/typeContract.test.ts`

**Implementation notes**

- Add lane-local `SideTriggerCalibration` with:
  - `openPose: { normalizedThumbDistance }`
  - `pulledPose: { normalizedThumbDistance }`
- Add shared telemetry snapshot types in `src/shared/types/trigger.ts`:
  - `SideTriggerCalibrationStatus = "default" | "liveTuning"`
  - `SideTriggerCalibrationSnapshot`
- Preserve current evidence behavior by making defaults a no-op transform into the existing canonical distance model:
  - `DEFAULT_SIDE_TRIGGER_OPEN_POSE_DISTANCE = 1.2`
  - `DEFAULT_SIDE_TRIGGER_PULLED_POSE_DISTANCE = 0`
  - `MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN = 0.05`
- Export:
  - `defaultSideTriggerCalibration`
  - `SIDE_TRIGGER_CALIBRATION_SLIDER_METADATA`
  - `coerceSideTriggerCalibrationValue`
  - `updateSideTriggerCalibrationValue`
  - `sideTriggerCalibrationStatusFor`
- Coercion must prevent open and pulled distances from collapsing into divide-by-zero. Prefer clamping and minimum span enforcement over adding a new runtime error state.

**Test plan**

- Unit: default side calibration equals constants.
- Unit: slider metadata covers open and pulled pose distances exactly once.
- Unit: coercion preserves `openPose.normalizedThumbDistance > pulledPose.normalizedThumbDistance + MIN_SIDE_TRIGGER_CALIBRATION_DISTANCE_SPAN`.
- Type contract: `SideTriggerTelemetry` carries calibration status and values.

**Dependencies**

- M4: side trigger evidence and telemetry.
- M6: fusion consumes only `TriggerInputFrame`; no fusion shape change.
- M7: runtime uses defaults on the game page.

### 3. Apply front calibration in aim projection path

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/front-aim/frontAimProjection.ts`
- Modify: `src/features/front-aim/mapFrontHandToAimInput.ts`
- Modify: `src/features/front-aim/createFrontAimMapper.ts`
- Add/modify tests:
  - `tests/unit/features/front-aim/frontAimProjection.test.ts`
  - `tests/unit/features/front-aim/mapFrontHandToAimInput.test.ts`
  - `tests/unit/features/front-aim/createFrontAimMapper.test.ts`

**Implementation notes**

- Mapper API decision: pass calibration as an update context field, not baked into `createFrontAimMapper()`.
- Update shape:
  - `FrontAimMapperUpdate.calibration: FrontAimCalibration`
- Apply calibration before viewport projection and before `mirrorX`.
- Math:
  - Let raw normalized fingertip be `p`.
  - Let bounds be `{ leftX, rightX, topY, bottomY }`.
  - `boundedX = (p.x - leftX) / (rightX - leftX)`
  - `boundedY = (p.y - topY) / (bottomY - topY)`
  - Let calibrated center in bounded space be:
    - `centerInBoundsX = (center.x - leftX) / (rightX - leftX)`
    - `centerInBoundsY = (center.y - topY) / (bottomY - topY)`
  - Apply center offset:
    - `calibratedX = boundedX + (0.5 - centerInBoundsX)`
    - `calibratedY = boundedY + (0.5 - centerInBoundsY)`
  - Clamp calibrated point to `[0, 1]`.
  - Pass calibrated normalized point to existing cover projection.
- Do not apply calibration in renderer or workbench overlay. The renderer receives already calibrated `AimInputFrame`.

**Test plan**

- Unit: default calibration is a no-op for center and corner points.
- Unit: center offset shifts projected normalized coordinates as expected.
- Unit: corner bounds expand/compress input range and clamp out-of-range output.
- Unit: `mirrorX` still applies after calibration, not before.
- Unit: mapper resets smoothing on source change but calibration is supplied per update and not stored as hidden mapper creation state.

**Dependencies**

- M5: current projection and front mapper behavior.
- M6: calibrated `AimInputFrame` still pairs normally.
- M7: game runtime gets calibrated aim through normal mapper output.

### 4. Apply side calibration in trigger evidence path

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/side-trigger/sideTriggerEvidence.ts`
- Modify: `src/features/side-trigger/createSideTriggerMapper.ts`
- Modify tests:
  - `tests/unit/features/side-trigger/sideTriggerEvidence.test.ts`
  - `tests/unit/features/side-trigger/createSideTriggerMapper.test.ts`
  - `tests/unit/features/side-trigger/sideTriggerStateMachine.test.ts` only if assertions depend on evidence thresholds

**Implementation notes**

- Mapper API decision: pass calibration as an update context field beside tuning:
  - `SideTriggerMapperUpdate.calibration: SideTriggerCalibration`
- `extractSideTriggerEvidence(detection, calibration)` should:
  - compute raw normalized thumb distance exactly as today;
  - transform raw distance into canonical distance using open/pulled calibration:
    - `canonical = DEFAULT_PULLED + ((raw - pulledObserved) / (openObserved - pulledObserved)) * (DEFAULT_OPEN - DEFAULT_PULLED)`
  - run the existing pull/release scalar logic against canonical distance.
- With default calibration, evidence must match current M4 behavior.
- Preserve the M4 split between `!poseUsable` and low evidence. Calibration changes must not collapse view-quality rejection into threshold failure.
- Preserve cooldown and loss recovery behavior; calibration changes affect next evidence scalar only, not FSM reset.

**Test plan**

- Unit: default side calibration keeps existing open/pulled evidence tests passing.
- Unit: calibrated pulled pose maps the observed pulled distance closer to `pullEvidenceScalar = 1`.
- Unit: calibrated open pose maps observed open distance closer to `releaseEvidenceScalar = 1`.
- Unit: world-landmarks unavailable still returns explicit unavailable evidence and does not fabricate calibration values.
- Unit: `createSideTriggerMapper.update()` requires and forwards calibration to evidence extraction.

**Dependencies**

- M4: world-landmark side trigger evidence, FSM, tuning thresholds.
- M6: `TriggerInputFrame` remains unchanged for fusion.
- M7: game runtime remains production-clean.

### 5. Extend lane telemetry without changing fusion frame shape

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/shared/types/aim.ts`
- Modify: `src/shared/types/trigger.ts`
- Modify: `src/features/front-aim/frontAimTelemetry.ts`
- Modify: `src/features/side-trigger/createSideTriggerMapper.ts`
- Modify tests:
  - `tests/unit/features/front-aim/frontAimTelemetry.test.ts`
  - `tests/unit/features/side-trigger/createSideTriggerMapper.test.ts`
  - `tests/unit/features/diagnostic-workbench/renderFrontAimPanel.test.ts`
  - `tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts`

**Implementation notes**

- Add telemetry fields:
  - `FrontAimTelemetry.calibrationStatus`
  - `FrontAimTelemetry.calibration`
  - `SideTriggerTelemetry.calibrationStatus`
  - `SideTriggerTelemetry.calibration`
- Keep `AimInputFrame`, `TriggerInputFrame`, and `FusedGameInputFrame` free of calibration metadata unless a test proves a boundary need. Current recommendation: do not add calibration fields to frame contracts.
- `telemetryFromAimFrame()` must accept calibration diagnostics for both available and unavailable telemetry.
- Side telemetry should report calibration values even when trigger frame is unavailable, as long as mapper telemetry exists.
- Rendering undefined telemetry must display `"unavailable"` and must not coerce missing numeric values to `0`.

**Test plan**

- Unit: front telemetry available includes calibration values.
- Unit: front telemetry unavailable includes calibration values and explicit lost reason.
- Unit: side telemetry includes calibration values while preserving last reject reason.
- Type: `FusedGameInputFrame` samples remain unchanged.

**Dependencies**

- M5: front telemetry discriminated union.
- M4: side telemetry shape.
- M6: fusion telemetry remains lane-agnostic.

### 6. Add diagnostic workbench calibration controls

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/diagnostic-workbench/renderFrontAimCalibrationControls.ts`
- Create: `src/features/diagnostic-workbench/renderSideTriggerCalibrationControls.ts`
- Modify: `src/features/diagnostic-workbench/renderWorkbench.ts`
- Add tests:
  - `tests/unit/features/diagnostic-workbench/renderFrontAimCalibrationControls.test.ts`
  - `tests/unit/features/diagnostic-workbench/renderSideTriggerCalibrationControls.test.ts`
- Modify tests:
  - `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
  - `tests/e2e/diagnostic.smoke.spec.ts`

**Implementation notes**

- Follow the M4/M6 slider HTML pattern:
  - `label.wb-tuning-control`
  - constant name text
  - display name text
  - `<input type="range">`
  - `<output>`
  - reset button
- Suggested data attributes:
  - `data-front-aim-calibration="centerX"`
  - `data-side-trigger-calibration="openPoseDistance"`
- Suggested reset actions:
  - `data-wb-action="resetFrontAimCalibration"`
  - `data-wb-action="resetSideTriggerCalibration"`
- Keep existing side trigger tuning and fusion tuning controls unchanged.
- Place calibration controls under diagnostic workbench only, after lane panels and before or near existing tuning panels.
- User-facing copy should state session-only behavior:
  - `診断ワークベンチ専用の session-only calibration です。`

**Test plan**

- Unit: each slider renders the named constant, current value, data attribute, and output id.
- Unit: reset buttons are present.
- E2E: `diagnostic.html` shows calibration constant names and reset controls after preview starts.
- E2E: `index.html` does not show calibration controls.

**Dependencies**

- M4/M6: existing slider metadata and renderer patterns.
- M3/M5: diagnostic workbench renders lane panels without owning lane correctness.

### 7. Wire live calibration state through `liveLandmarkInspection.ts`

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify: `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify tests:
  - `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

**Implementation notes**

- Extend `WorkbenchInspectionState`:
  - `frontAimCalibration`
  - `sideTriggerCalibration`
- Initial state uses `defaultFrontAimCalibration` and `defaultSideTriggerCalibration`.
- Add methods:
  - `setFrontAimCalibration(key, value)`
  - `resetFrontAimCalibration()`
  - `setSideTriggerCalibration(key, value)`
  - `resetSideTriggerCalibration()`
- Frame consistency rule:
  - capture calibration/tuning/fusion context snapshot at the beginning of each `processFrame` before `await tracker.detect(...)`;
  - pass that snapshot into mapper/fusion calls;
  - slider changes then affect the next frame, not an in-flight frame.
- Re-selection/source reset rule:
  - `resetTrackingState()` should reset lane runtime state;
  - calibration should reset to defaults when leaving preview/reselecting streams, matching the plan statement that camera re-selection resets calibration status;
  - existing side/fusion tuning may continue to preserve its current behavior unless M8 deliberately changes it.
- Avoid stale snapshot class of bug from M6: use one snapshot for mapper output and the corresponding fusion update in the same frame.

**Test plan**

- Unit: front calibration update affects the next front aim frame.
- Unit: side calibration update affects the next side trigger evidence frame.
- Unit: slider change during an in-flight detection does not change that frame; it changes the following frame.
- Unit: reset calibration button restores named defaults.
- Unit: leaving preview/reselecting clears calibration to defaults and clears lane snapshots.
- Unit: existing side trigger tuning and fusion tuning tests still pass.

**Dependencies**

- M3: tracker lifecycle and async cleanup.
- M4/M6: live tuning state pattern.
- M6 lesson: stale snapshot avoidance.
- M7: no game page workbench import.

### 8. Wire DOM event handling in `diagnostic-main.ts`

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/diagnostic-main.ts`
- Modify tests if present or add integration coverage:
  - `tests/integration/diagnosticSideTriggerWorkbench.test.ts`
  - `tests/integration/diagnosticFusionWorkbench.test.ts` only if shared handler helpers are introduced
  - `tests/e2e/diagnostic.smoke.spec.ts`

**Implementation notes**

- Add click cases:
  - `resetFrontAimCalibration`
  - `resetSideTriggerCalibration`
- Add input handlers:
  - `target.dataset["frontAimCalibration"]`
  - `target.dataset["sideTriggerCalibration"]`
- Keep existing `data-side-trigger-tuning` and `data-fusion-tuning` paths unchanged.
- Use typed parameter casts consistent with current code.
- After reset, call `render()` so slider DOM reflects default values.

**Test plan**

- E2E: changing a calibration slider keeps the workbench running.
- E2E: reset button returns output text to default value.
- Regression: side trigger and fusion sliders still render and still accept input.

**Dependencies**

- M4/M6: current `diagnostic-main.ts` event routing.
- M7: no changes to `src/main.ts` or game entry.

### 9. Render calibration telemetry in lane panels

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/diagnostic-workbench/renderFrontAimPanel.ts`
- Modify: `src/features/diagnostic-workbench/renderSideTriggerPanel.ts`
- Modify tests:
  - `tests/unit/features/diagnostic-workbench/renderFrontAimPanel.test.ts`
  - `tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts`

**Implementation notes**

- Front panel should show:
  - calibration status
  - center x/y
  - corner left/right/top/bottom
- Side panel should show:
  - calibration status
  - open pose normalized thumb distance
  - pulled pose normalized thumb distance
- If telemetry is undefined, display `"unavailable"`, not `0`.
- If telemetry exists and values are default, display actual default numbers.
- Use `escapeHTML` and existing formatting helpers; avoid raw template injection.

**Test plan**

- Unit: available front telemetry renders calibration fields.
- Unit: unavailable front telemetry still renders calibration values if telemetry exists.
- Unit: undefined front telemetry renders `"unavailable"`.
- Unit: side telemetry renders open/pulled values.
- Unit: HTML-special-char escaping tests remain valid; add regex assertions with proper escaping where needed.

**Dependencies**

- M5: front aim panel shape.
- M4: side trigger panel shape.
- Prior PR lesson: telemetry undefined means unavailable, not numeric fallback.

### 10. Pass default calibration through game runtime without adding game UI

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/app/balloonGameRuntime.ts`
- Modify tests:
  - `tests/integration/balloonGameRuntime.test.ts`
  - `tests/unit/app/balloonGamePage.test.ts` only if startup expectations need adjustment
  - `tests/integration/importBoundaries.test.ts`

**Implementation notes**

- Game page must remain production-clean.
- `balloonGameRuntime.ts` should pass:
  - `defaultFrontAimCalibration` to `frontAimMapper.update(...)`
  - `defaultSideTriggerCalibration` to `sideTriggerMapper.update(...)`
- Do not add game-page calibration UI.
- Do not import `diagnostic-workbench` from app or gameplay.
- Retry/reset:
  - existing `frontAimMapper.reset()`, `sideTriggerMapper.reset()`, `inputFusionMapper.resetAll()` remain;
  - calibration is default-only in game runtime, so retry should not preserve any mutable calibration.
- Verification rule:
  - if calibration is applied inside lane mappers, `FusedGameInputFrame.aim` and `FusedGameInputFrame.trigger` reflect calibrated output automatically;
  - fusion does not need to know calibration exists.

**Test plan**

- Integration: runtime still starts front and side tracking with default calibration.
- Integration: injected detection with non-default test calibration can be verified through mapper-level tests; runtime only verifies default wiring unless exposing runtime calibration injection is explicitly approved.
- Import boundary: `index.html` and app files do not contain calibration control selectors or diagnostic imports.
- E2E home smoke: no calibration UI appears on game page.

**Dependencies**

- M7: game runtime and fused gameplay path.
- M6: fusion contract.
- Boundary: game page reads only `FusedGameInputFrame`.

### 11. Add integration and boundary coverage for calibrated output flow

**Scope:** `~≤2h`

**Files to modify**

- Add/modify:
  - `tests/integration/diagnosticSideTriggerWorkbench.test.ts`
  - `tests/integration/diagnosticFusionWorkbench.test.ts`
  - `tests/integration/importBoundaries.test.ts`
  - optional: `tests/replay/fusedGameplaySequenceReplay.test.ts` only if calibration changes replay assumptions

**Implementation notes**

- Add a diagnostic integration test proving:
  - front calibration changes rendered telemetry and mapped aim output;
  - side calibration changes evidence telemetry;
  - fusion frame uses calibrated lane frame without a fusion contract change.
- Add boundary checks:
  - `index.html` does not contain `data-front-aim-calibration`
  - `index.html` does not contain `data-side-trigger-calibration`
  - `index.html` does not contain calibration constant names
  - app/gameplay still does not import `diagnostic-workbench`
- Avoid broad replay churn. Only update replays if default calibration no-op still changes serialized expectations, which should not happen.

**Test plan**

- Integration: calibrated front aim changes `aimPointNormalized`.
- Integration: calibrated side pose changes `pullEvidenceScalar` / `releaseEvidenceScalar`.
- Integration: `FusedGameInputFrame` still has the same top-level keys.
- Boundary: diagnostic selectors absent from game page.

**Dependencies**

- M4/M5: lane mapper outputs.
- M6: fusion shape and timestamp policy.
- M7: game page cleanliness.

### 12. Quality gates and final verification

**Scope:** `~≤2h`

**Files to modify**

- None unless failures identify scoped fixes.

**Commands**

- After contract and mapper changes are green locally:
  - `npm run test -- tests/unit/features/front-aim tests/unit/features/side-trigger tests/unit/features/diagnostic-workbench`
- After workbench wiring and integration coverage:
  - `npm run test -- tests/integration`
- Before final implementation handoff / PR:
  - `npm run check`
- Because browser entry points and diagnostic/game pages are touched:
  - `npm run test:e2e`

**Expected outcome**

- `npm run check` passes lint, typecheck, unit/integration/replay tests, and knip.
- `npm run test:e2e` passes diagnostic and home smoke paths.
- If `npm run test:e2e` fails for environment/browser install reasons, record the exact failure and whether unit/integration gates passed.

**Dependencies**

- All M3-M7 contracts remain intact.
- Knip must see new modules through exports/imports; avoid dead exported constants.

## 3. Risk register

- **Calibration applied twice:** Apply calibration only in lane mapper/evidence path. Do not reapply in renderer, overlay, fusion, or gameplay. Tests should assert renderer displays telemetry values but does not transform coordinates.
- **Calibration state not reset on retry/reselect:** Workbench reselect should reset lane calibration to defaults. Game runtime retry uses defaults only and resets mappers/fusion as today.
- **Slider mid-frame mutation:** Capture calibration/tuning snapshot before async detection awaits. Use the same snapshot for mapper and fusion in that frame. Slider changes apply next frame.
- **Game page displaying unnormalized aim:** Game page must read only `FusedGameInputFrame`; calibrated aim coordinates are produced by front mapper before fusion.
- **Named-default collision:** `defaultFrontAimCalibration` and `defaultSideTriggerCalibration` must be built from the named constants. Tests must use `toBe` for primitive defaults.
- **Telemetry undefined:** Panels must render `"unavailable"` for missing telemetry. Do not default missing calibration telemetry to `0`.
- **Session-only vs persistent confusion:** UI copy and comments should say session-only. No storage API use.
- **Side calibration invalid span:** Coerce open/pulled distance sliders so denominator never reaches zero. Do not let NaN enter evidence scalars.
- **Fusion contract creep:** Do not add calibration metadata to `FusedGameInputFrame` unless a concrete consumer requires it. Current plan needs lane telemetry only.
- **Review friction from status rename:** Existing `SideTriggerCalibrationStatus` uses `"uncalibrated" | "liveTuning"`. M8 should deliberately migrate to `"default" | "liveTuning"` or justify retaining `"uncalibrated"`; tests must lock the chosen wording.
- **HTML selector leakage:** New `data-front-aim-calibration` / `data-side-trigger-calibration` selectors must never appear in `index.html`.
- **Knip unused exports:** New metadata/constants must be imported by renderers/tests or exported through `index.ts` intentionally.

## 4. Quality gate sequence

Use the canonical command sequence in section 12, "Quality gates and final verification".

## 5. Boundaries reminder

- Calibration UI lives only in `diagnostic.html` / `src/features/diagnostic-workbench/`.
- No calibration UI on the game page.
- Game page reads only `FusedGameInputFrame`.
- Calibration output flows through existing lane mapper -> fusion -> gameplay path.
- Session-only only:
  - no `localStorage`
  - no `IndexedDB`
  - no cookies
  - no server persistence
  - no URL params
- Diagnostic workbench behavior changes are additive: add calibration controls; do not rename or remove existing side trigger tuning and fusion tuning controls.
- Preserve lane invariant:
  - front = aim
  - side = trigger
  - fusion = pairing/shot edge consumption only

## 6. M7 + earlier coordination notes

M8 likely touches these overlap files:

- `src/features/diagnostic-workbench/renderTuningControls.ts`
  - M4 side-trigger tuning surface. Avoid mixing calibration sliders into this file unless the resulting file stays readable. More likely review-friendly path: add separate calibration renderers.
- `src/features/diagnostic-workbench/renderFusionTuningControls.ts`
  - M6 fusion tuning. Ideally untouched except shared layout if necessary.
- `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
  - Highest review-friction file. It owns async tracking, tuning snapshots, mapper calls, fusion updates, resets, and DOM updates. Keep changes small and add focused tests.
- `src/features/side-trigger/sideTriggerConfig.ts`
  - M4 tuning config. Calibration should go in `sideTriggerCalibration.ts`, not overload this file.
- `src/features/input-fusion/fusionConfig.ts`
  - M6 timing config. Should not need M8 changes.
- `src/features/front-aim/` internals
  - `frontAimProjection.ts`, `mapFrontHandToAimInput.ts`, `createFrontAimMapper.ts`, `frontAimTelemetry.ts`, new `frontAimCalibration.ts`.
  - Most likely front-lane review question: whether axis-aligned corner bounds are enough versus full 4-corner perspective calibration.
- `src/features/side-trigger/` internals
  - `sideTriggerEvidence.ts`, `createSideTriggerMapper.ts`, new `sideTriggerCalibration.ts`.
  - Most likely side-lane review question: whether calibration should transform normalized thumb distance or final evidence scalar. Recommended: transform normalized distance, then keep current scalar thresholds.
- `src/app/balloonGameRuntime.ts`
  - Touch only to pass default calibration into lane mappers and preserve retry reset behavior. No UI.
- `src/app/balloonGamePage.ts`
  - Should not need changes unless tests require explicit cleanliness assertions.
- `tests/integration/importBoundaries.test.ts`
  - Add calibration selector/constant absence checks for `index.html`.
- `tests/e2e/home.smoke.spec.ts`
  - Add absence checks for calibration controls.
- `tests/e2e/diagnostic.smoke.spec.ts`
  - Add presence checks for calibration controls.

Most likely review friction:

- `liveLandmarkInspection.ts`, because async frame processing can accidentally reuse stale state or mutate mid-frame.
- `sideTriggerEvidence.ts`, because calibration math can unintentionally change existing default behavior.
- `frontAimProjection.ts`, because center/corner semantics must be clearly documented and not applied twice.
- `balloonGameRuntime.ts`, because game page must remain production-clean.

## 7. Persistence policy

M8 scope is session-only.

- No `localStorage`.
- No URL params.
- No cookies.
- No IndexedDB.
- No server persistence.
- No persistence through generated files or config writes from the browser.

If future persistence is desired, create or update a spec first. That spec must define storage location, invalidation rules when camera device/stream changes, privacy implications, reset UX, and how persisted calibration is distinguished from live tuning telemetry.
