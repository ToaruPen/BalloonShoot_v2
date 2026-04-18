# M6 Implementation-Granularity Task Decomposition

**Milestone:** Issue #6, Fusion Pairing in Diagnostic Workbench  
**Goal:** `AimInputFrame` と `TriggerInputFrame` の timestamp buffer を `src/features/input-fusion/` で pairing し、`FusedGameInputFrame` / fusion telemetry / fusion tuning を `diagnostic.html` の診断ワークベンチだけに表示する。  
**Boundary:** M6 は診断ワークベンチ上の fusion lane 検証まで。風船、スコア、ゲーム canvas 上の fusion 表示、production game page への fusion wiring は M7 以降。

---

## 1. Pre-flight checks

M6 開始前に post-M5 `main` で以下を確認する。

1. Repository state
   - `HEAD` は post-M4 `11e6584` 以降、かつ M5 が merge 済みであること。
   - この調査時点では作業ツリーに untracked `docs/superpowers/plans/2026-04-18-m5-implementation-decomposition.md` があり、`origin/claude/m5-followup` はローカル ref / GitHub branch search ともに見つからなかった。
   - M6 実装開始時に通常ネットワークが使える環境で再確認する:
     - `git fetch --prune origin`
     - `git log --oneline origin/claude/m5-followup -- src` if branch exists
   - branch が存在する場合は、M5 coordination notes の対象ファイルを rebase / merge 前に必ず読む。

2. M3/M4/M5 contracts
   - M3:
     - `src/shared/types/camera.ts`
       - `FrameTimestamp`
       - `TimestampSource`
       - `LaneHealthStatus`
       - `CameraLaneRole`
     - `src/shared/types/hand.ts`
       - `FrontHandDetection`
       - `SideHandDetection`
       - `HandDetection`
       - `HandFrame`
   - M4:
     - `src/shared/types/trigger.ts`
       - `TriggerInputFrame`
       - `TriggerEdge`
       - `TriggerAvailability`
       - `SideTriggerTelemetry`
     - `src/features/side-trigger/`
       - FSM, tuning constants, slider metadata, telemetry shape
   - M5:
     - `src/shared/types/aim.ts`
       - `AimInputFrame`
       - `AimAvailability`
       - `FrontAimTelemetry`
     - `src/features/front-aim/`
       - `createFrontAimMapper`
       - front aim telemetry assembly
     - `WorkbenchInspectionState` includes:
       - `frontAimFrame: AimInputFrame | undefined`
       - `frontAimTelemetry: FrontAimTelemetry | undefined`

3. Diagnostic workbench baseline
   - `/diagnostic.html` still shows:
     - front / side camera previews
     - raw / filtered landmark overlays
     - front aim telemetry from M5
     - side world landmarks from M4
     - side trigger phase / evidence / dwell / cooldown
     - side trigger threshold sliders
   - Default inspection state and `createLiveLandmarkInspection().getState()` still match.

4. Game page production-clean baseline
   - M5 should already have replaced the placeholder game page.
   - `index.html` and `src/main.ts` must not import:
     - `src/features/diagnostic-workbench/`
     - `src/features/input-fusion/`
   - `/` must not show:
     - landmark overlays
     - diagnostic panels
     - threshold sliders
     - side-trigger or fusion telemetry
   - M6 must preserve this. Production fusion wiring is M7 territory.

5. Baseline quality gates
   - Run before starting M6 implementation:
     - `npm run check`
     - `npm run test:e2e`
   - If `knip` fails because M5 exported unused contracts, fix M5 contract usage before starting M6. Do not add M6 exports that are only test-consumed and unused by diagnostic wiring.

---

## 2. Numbered implementation steps

### 1. Add the input-fusion module boundary and shared fusion contract

**Scope:** Establish the M6 boundary and compile-time contracts before behavior.

**Files to create / modify:**
- Create `src/features/input-fusion/AGENTS.md`
- Create `src/features/input-fusion/CLAUDE.md` as sibling symlink to `AGENTS.md`
- Create `src/features/input-fusion/index.ts`
- Create `src/shared/types/fusion.ts`
- Modify `src/shared/types/AGENTS.md` only if a short note is needed for fusion contracts
- Add `tests/unit/features/input-fusion/typeContract.test.ts`

**Implementation notes:**
- `src/features/input-fusion/AGENTS.md` must be English.
- The module owns pairing only:
  - no landmark math
  - no browser capture
  - no MediaPipe tracker usage
  - no rendering
  - no gameplay scoring
- `src/shared/types/fusion.ts` should define:
  - `FusionMode`
    - `"pairedFrontAndSide"`
    - `"frontOnlyAim"`
    - `"sideOnlyTriggerDiagnostic"`
    - `"noUsableInput"`
  - `FusionRejectReason`
    - `"none"`
    - `"frontMissing"`
    - `"sideMissing"`
    - `"timestampGapTooLarge"`
    - `"frontStale"`
    - `"sideStale"`
    - `"laneFailed"`
  - `FusionSourceSummary`
    - lane role
    - frame timestamp
    - frame age
    - lane health
    - availability summary
    - missing / stale reason
  - `FusedGameInputFrame`
    - `fusionTimestampMs`
    - `fusionMode`
    - `timeDeltaBetweenLanesMs`
    - `aim`
    - `trigger`
    - `shotFired`
    - `inputConfidence`
    - `frontSource`
    - `sideSource`
    - `fusionRejectReason`
  - `FusionTelemetry`
    - `mode`
    - `timeDeltaBetweenLanesMs`
    - `maxPairDeltaMs`
    - `maxFrameAgeMs`
    - `frontBufferFrameCount`
    - `sideBufferFrameCount`
    - `frontLatestAgeMs`
    - `sideLatestAgeMs`
    - `inputConfidence`
    - `shotFired`
    - `rejectReason`
    - `lastPairedFrontTimestampMs`
    - `lastPairedSideTimestampMs`
    - `timestampSourceSummary`
    - `shotEdgeConsumed`
- Treat M4’s compound edge `"pullStarted+shotCommitted"` as a shot-commit edge in addition to `"shotCommitted"`.

**Test plan:**
- `tests/unit/features/input-fusion/typeContract.test.ts`
  - compiles a valid `FusedGameInputFrame`
  - compiles a valid `FusionTelemetry`
  - uses M5 `AimInputFrame`
  - uses M4 `TriggerInputFrame`
  - verifies literal lane roles remain `frontAim`, `sideTrigger`, and fusion output does not mutate them
- Run:
  - `npx vitest run tests/unit/features/input-fusion/typeContract.test.ts`
  - `npm run typecheck`
  - `npm run knip`

**Dependency on contracts:**
- M3: `FrameTimestamp`, `LaneHealthStatus`
- M4: `TriggerInputFrame`, `TriggerEdge`, `TriggerAvailability`
- M5: `AimInputFrame`, `AimAvailability`

---

### 2. Add fusion constants, tuning shape, and slider metadata

**Scope:** Match the M4 side-trigger tuning pattern with named fusion constants and diagnostic-only tuning metadata.

**Files to create / modify:**
- Create `src/features/input-fusion/fusionConstants.ts`
- Create `src/features/input-fusion/fusionConfig.ts`
- Modify `src/features/input-fusion/index.ts`
- Add `tests/unit/features/input-fusion/fusionConfig.test.ts`

**Implementation notes:**
- Add named defaults:
  - `FUSION_MAX_PAIR_DELTA_MS`
  - `FUSION_MAX_FRAME_AGE_MS`
  - `FUSION_RECENT_FRAME_RETENTION_WINDOW_MS`
- Add `FusionTuning`:
  - `maxPairDeltaMs`
  - `maxFrameAgeMs`
  - `recentFrameRetentionWindowMs`
- Add `fusionSliderMetadata` using the same pattern as `sideTriggerSliderMetadata`:
  - `key`
  - `constantName`
  - `displayName`
  - `min`
  - `max`
  - `step`
  - `defaultValue`
  - `numericKind`
- Add `coerceFusionTuningValue`.
- Keep tuning in the diagnostic workbench only during M6. Do not persist values.

**Test plan:**
- `fusionConfig.test.ts`
  - defaults mirror named constants
  - slider metadata includes all three tuning keys
  - coercion clamps values
  - coercion rounds millisecond integer sliders if numeric kind is integer
  - metadata uses concrete constant names for workbench display
- Run:
  - `npx vitest run tests/unit/features/input-fusion/fusionConfig.test.ts`
  - `npm run typecheck`
  - `npm run knip`

**Dependency on contracts:**
- M3: none directly, but constants are interpreted against `FrameTimestamp.frameTimestampMs`
- M4/M5: none directly

---

### 3. Implement pure timestamp pairing and buffer retention

**Scope:** Build deterministic frame buffering and nearest-timestamp pair selection with synthetic frame inputs.

**Files to create / modify:**
- Create `src/features/input-fusion/pairFusionFrames.ts`
- Create `src/features/input-fusion/fusionFrameBuffers.ts`
- Modify `src/features/input-fusion/index.ts`
- Add `tests/unit/features/input-fusion/pairFusionFrames.test.ts`
- Add `tests/unit/features/input-fusion/fusionFrameBuffers.test.ts`

**Implementation notes:**
- Buffers are owned by fusion:
  - front buffer stores `AimInputFrame`
  - side buffer stores `TriggerInputFrame`
- Buffers are keyed and sorted by `timestamp.frameTimestampMs`.
- Retention uses `FUSION_RECENT_FRAME_RETENTION_WINDOW_MS` from tuning.
- Pairing policy:
  - when an aim frame arrives, search side buffer for nearest timestamp
  - when a trigger frame arrives, search front buffer for nearest timestamp
  - accept only when absolute delta is `<= maxPairDeltaMs`
  - when candidates tie, choose the newest frame
- Staleness is not a pairing concern in this step. Step 4 applies frame-age policy.
- Do not use callback order, `Date.now()`, or a new timestamp source.

**Test plan:**
- `pairFusionFrames.test.ts`
  - picks nearest side frame for an incoming aim frame
  - picks nearest front frame for an incoming trigger frame
  - rejects when delta exceeds `maxPairDeltaMs`
  - tie chooses newest candidate
  - delta is absolute milliseconds from `FrameTimestamp.frameTimestampMs`
- `fusionFrameBuffers.test.ts`
  - stores frames without mutating them
  - prunes old front frames by retention window
  - prunes old side frames by retention window
  - clears front buffer independently
  - clears side buffer independently
- Run:
  - `npx vitest run tests/unit/features/input-fusion/pairFusionFrames.test.ts tests/unit/features/input-fusion/fusionFrameBuffers.test.ts`
  - `npm run typecheck`

**Dependency on contracts:**
- M3: `FrameTimestamp.frameTimestampMs`
- M4: `TriggerInputFrame.timestamp`
- M5: `AimInputFrame.timestamp`

---

### 4. Implement the stateful fusion mapper and shot-edge consumption

**Scope:** Produce `FusedGameInputFrame` from buffered aim / trigger frames, including degrade modes and one-shot edge consumption.

**Files to create / modify:**
- Create `src/features/input-fusion/createInputFusionMapper.ts`
- Create `src/features/input-fusion/shotEdgeConsumption.ts`
- Modify `src/features/input-fusion/index.ts`
- Add `tests/unit/features/input-fusion/createInputFusionMapper.test.ts`
- Add `tests/unit/features/input-fusion/shotEdgeConsumption.test.ts`

**Implementation notes:**
- Public mapper shape should be small and browser-free:
  - `updateAimFrame(frame: AimInputFrame, context): FusionMapperResult`
  - `updateTriggerFrame(frame: TriggerInputFrame, context): FusionMapperResult`
  - `resetFrontLane(): void`
  - `resetSideLane(): void`
  - `resetAll(): void`
- `context` should accept lane health and tuning, for example:
  - `frontLaneHealth`
  - `sideLaneHealth`
  - `tuning`
- Current fusion clock:
  - use the incoming frame’s `timestamp.frameTimestampMs`
  - derive buffer ages relative to that value
  - do not introduce `performance.now()` or `Date.now()`
- Degrade policy:
  - `pairedFrontAndSide`
    - accepted pair within delta
    - front aim is not unavailable
    - side trigger frame is present and not stale
    - `shotFired` can be true only here
  - `frontOnlyAim`
    - front aim usable, side missing / stale / failed / too far
    - crosshair information can be surfaced in fused frame
    - `shotFired` is false
  - `sideOnlyTriggerDiagnostic`
    - side trigger present, front missing / stale / failed / too far
    - trigger telemetry remains visible
    - shot-commit edge is not consumed in this mode
    - `shotFired` is false
  - `noUsableInput`
    - neither lane contributes usable live input
    - `shotFired` is false
- Shot edge consumption:
  - treat `triggerEdge === "shotCommitted"` and edge strings containing `"shotCommitted"` as commit edges.
  - consume only after an accepted `pairedFrontAndSide` frame.
  - never consume in `sideOnlyTriggerDiagnostic`.
  - held trigger frames must not repeat `shotFired`.
  - key consumption by side frame timestamp fields and edge, e.g. `frameTimestampMs`, `presentedFrames`, `receivedAtPerformanceMs`, `triggerEdge`.
  - clear side consumption keys on `resetSideLane()` / `resetAll()`.
- Confidence:
  - start with a simple deterministic rule:
    - front confidence from `AimInputFrame.frontTrackingConfidence`
    - side confidence from `TriggerInputFrame.shotCandidateConfidence`
    - paired confidence as `Math.min(front, side)`
    - degrade modes lower confidence or use the contributing lane only
  - keep confidence formula pure and covered by tests.

**Test plan:**
- `createInputFusionMapper.test.ts`
  - emits `pairedFrontAndSide` when timestamps are close
  - emits `frontOnlyAim` when side is missing
  - emits `sideOnlyTriggerDiagnostic` when front is missing
  - emits `noUsableInput` when both lanes are unavailable or stale
  - rejects with `timestampGapTooLarge`
  - rejects stale front with `frontStale`
  - rejects stale side with `sideStale`
  - rejects failed lane with `laneFailed`
  - preserves `AimInputFrame.timestamp` and `TriggerInputFrame.timestamp`
  - uses incoming frame timestamp as fusion clock
- `shotEdgeConsumption.test.ts`
  - `shotCommitted` fires once for one accepted pair
  - `pullStarted+shotCommitted` fires once for one accepted pair
  - repeated pairing with the same side edge does not fire again
  - side-only diagnostic does not consume the edge
  - reset side lane allows a new stream’s future edge to fire
- Run:
  - `npx vitest run tests/unit/features/input-fusion/createInputFusionMapper.test.ts tests/unit/features/input-fusion/shotEdgeConsumption.test.ts`
  - `npm run typecheck`
  - `npm run knip`

**Dependency on contracts:**
- M3: `FrameTimestamp`, `LaneHealthStatus`
- M4: `TriggerInputFrame.triggerEdge`, `TriggerAvailability`, dwell/cooldown semantics from side-trigger FSM
- M5: `AimInputFrame.aimAvailability`, `frontTrackingConfidence`

---

### 5. Assemble fusion telemetry and diagnostic rendering primitives

**Scope:** Make fusion output readable using M4 diagnostic display conventions.

**Files to create / modify:**
- Create `src/features/input-fusion/fusionTelemetry.ts`
- Create `src/features/diagnostic-workbench/diagnosticValueFormat.ts`
- Create `src/features/diagnostic-workbench/renderFusionPanel.ts`
- Modify `src/features/diagnostic-workbench/renderSideTriggerPanel.ts` only if extracting `formatScalarOrUnavailable` from that file
- Add `tests/unit/features/input-fusion/fusionTelemetry.test.ts`
- Add `tests/unit/features/diagnostic-workbench/diagnosticValueFormat.test.ts`
- Add `tests/unit/features/diagnostic-workbench/renderFusionPanel.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts` only to preserve behavior after extraction

**Implementation notes:**
- Reuse M4 display semantics:
  - scalar formatting with three decimals
  - `unavailable` text for missing values
  - key/value pair rendering assertions in tests
  - escaped text via `escapeHTML`
- `diagnosticValueFormat.ts` should export:
  - `formatScalar`
  - `formatScalarOrUnavailable`
  - optionally `renderDiagnosticValue(label, value)`
- `renderFusionPanel` should show:
  - fusion mode
  - timestamp delta
  - max pair delta
  - max frame age
  - front buffer count
  - side buffer count
  - front latest age
  - side latest age
  - input confidence
  - shot fired
  - shot edge consumed
  - reject reason
  - last paired front timestamp
  - last paired side timestamp
  - timestamp source summary
- Missing values must display as `unavailable`, not blank or `undefined`.

**Test plan:**
- `fusionTelemetry.test.ts`
  - telemetry mirrors the latest fused frame
  - buffer counts and ages are included
  - `timestampSourceSummary` distinguishes captureTime / expectedDisplayTime / callback receipt sources
  - missing last-pair timestamps remain undefined for renderer to show unavailable
- `diagnosticValueFormat.test.ts`
  - formats scalar values to three decimals
  - formats undefined as `unavailable`
  - escapes labels and values
- `renderFusionPanel.test.ts`
  - renders unavailable state before fusion telemetry exists
  - renders `pairedFrontAndSide`
  - renders `timestampGapTooLarge`
  - renders `shotFired: true`
  - escapes all text
  - uses key/value pair assertions, not only loose `toContain`
- Run:
  - `npx vitest run tests/unit/features/input-fusion/fusionTelemetry.test.ts tests/unit/features/diagnostic-workbench/diagnosticValueFormat.test.ts tests/unit/features/diagnostic-workbench/renderFusionPanel.test.ts`
  - `npm run typecheck`

**Dependency on contracts:**
- M3: `TimestampSource`, `FrameTimestamp`
- M4: side trigger telemetry display pattern
- M5: front aim telemetry display pattern, if M5 already extracted similar formatting

---

### 6. Extend WorkbenchInspectionState and render the Fusion panel

**Scope:** Add fusion snapshots to the diagnostic workbench static render path.

**Files to create / modify:**
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/styles/diagnostic.css`
- Modify `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
- Add or modify `tests/unit/features/diagnostic-workbench/defaultInspectionState.test.ts` if post-M5 introduced a separate default-state test

**Implementation notes:**
- Extend `WorkbenchInspectionState` additively:
  - `fusionFrame: FusedGameInputFrame | undefined`
  - `fusionTelemetry: FusionTelemetry | undefined`
  - `fusionTuning: FusionTuning`
- Preserve all M4 fields:
  - `sideTriggerFrame`
  - `sideTriggerTelemetry`
  - `sideTriggerTuning`
- Preserve all M5 fields:
  - `frontAimFrame`
  - `frontAimTelemetry`
- Default state must match `createLiveLandmarkInspection().getState()`.
- Render `renderFusionPanel(inspection.fusionFrame, inspection.fusionTelemetry)` below the front/side preview grid and above tuning controls, or in a dedicated Fusion section within the previewing screen.
- Do not render fusion panel on `/`.
- Do not add a canvas overlay for fusion.

**Test plan:**
- `renderWorkbench.test.ts`
  - previewing mode includes `id="wb-fusion-panel"`
  - fusion unavailable state renders before any paired frames
  - M4 side trigger panel still renders
  - M5 front aim panel still renders
  - default render state equals live initial state for all inspection defaults
  - no raw `deviceId` is rendered
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts tests/unit/features/diagnostic-workbench/renderFusionPanel.test.ts`
  - `npm run typecheck`

**Dependency on contracts:**
- M3: `LaneHealthStatus`
- M4: existing `WorkbenchInspectionState` side trigger fields
- M5: existing `WorkbenchInspectionState` front aim fields
- M6: `FusedGameInputFrame`, `FusionTelemetry`, `FusionTuning`

---

### 7. Wire live front aim and side trigger frames into fusion in diagnostic inspection

**Scope:** Feed live M5 `AimInputFrame` and M4 `TriggerInputFrame` into the fusion mapper and patch the diagnostic DOM.

**Files to create / modify:**
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
- Add `tests/integration/diagnosticFusionWorkbench.test.ts`

**Implementation notes:**
- Instantiate one fusion mapper alongside:
  - front aim mapper from M5
  - side trigger mapper from M4
- On front lane update:
  - M5 front aim mapper produces `frontAimFrame`
  - pass `frontAimFrame` to `inputFusion.updateAimFrame`
  - update `fusionFrame` and `fusionTelemetry`
- On side lane update:
  - M4 side trigger mapper produces `sideTriggerFrame`
  - pass `sideTriggerFrame` to `inputFusion.updateTriggerFrame`
  - update `fusionFrame` and `fusionTelemetry`
- Preserve lifecycle safeguards:
  - MediaPipe tracker cleanup
  - async guard after stop/destroy
  - stale video element detection after re-render
  - reset on reselect/swap/stream change
- Reset policy:
  - front stream replacement clears front aim state and fusion front buffer only
  - side stream replacement clears side trigger state and fusion side buffer / shot consumption keys
  - leaving preview resets fusion snapshots but preserves current tuning
  - full destroy resets all runtime state
- `updateDom()` must patch:
  - front aim panel from M5
  - side trigger panel from M4
  - fusion panel from M6
  - no full video element rebuild per frame

**Test plan:**
- Extend `liveLandmarkInspection.test.ts`:
  - front aim + side trigger close timestamps produce `fusionFrame.fusionMode === "pairedFrontAndSide"`
  - timestamp gap produces `fusionRejectReason === "timestampGapTooLarge"`
  - side `shotCommitted` produces `shotFired === true` once
  - a repeated frame with the same side edge does not fire again
  - side-only shot edge is not consumed until an accepted pair exists
  - reselect clears affected fusion buffer and shot consumption keys
  - stale detection results after stop do not write `fusionFrame`
  - tracker cleanup tests still pass
  - stale video element re-render test still restarts tracking
- `diagnosticFusionWorkbench.test.ts`
  - scripted `AimInputFrame` / `TriggerInputFrame` sequence renders paired mode
  - scripted large delta renders reject reason
  - scripted shot commit renders `shotFired`
  - side trigger slider behavior remains unaffected
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts tests/integration/diagnosticFusionWorkbench.test.ts`
  - `npm run typecheck`

**Dependency on contracts:**
- M3: `FrameTimestamp` from `requestVideoFrameCallback` path
- M4: `createSideTriggerMapper`, `TriggerInputFrame`
- M5: `createFrontAimMapper`, `AimInputFrame`
- M6: `createInputFusionMapper`

---

### 8. Add diagnostic-only fusion tuning controls

**Scope:** Expose fusion thresholds in `diagnostic.html` using named sliders, without touching the game page.

**Files to create / modify:**
- Create `src/features/diagnostic-workbench/renderFusionTuningControls.ts`
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify `src/diagnostic-main.ts`
- Modify `src/styles/diagnostic.css`
- Add `tests/unit/features/diagnostic-workbench/renderFusionTuningControls.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
- Modify `tests/e2e/diagnostic.smoke.spec.ts`

**Implementation notes:**
- Render slider controls for:
  - `FUSION_MAX_PAIR_DELTA_MS`
  - `FUSION_MAX_FRAME_AGE_MS`
  - `FUSION_RECENT_FRAME_RETENTION_WINDOW_MS`
- Use data attributes separate from side trigger:
  - `data-fusion-tuning="maxPairDeltaMs"`
  - `data-fusion-tuning="maxFrameAgeMs"`
  - `data-fusion-tuning="recentFrameRetentionWindowMs"`
- Add reset action:
  - `data-wb-action="resetFusionTuning"`
- `diagnostic-main.ts` should extend existing event handling:
  - do not create a second diagnostic event system
  - keep side trigger tuning handler intact
  - add fusion tuning branch for inputs with `data-fusion-tuning`
- Changing fusion tuning should affect subsequent fusion mapper updates.
- Tuning controls remain under `diagnostic.html` only.

**Test plan:**
- `renderFusionTuningControls.test.ts`
  - renders all named constants
  - renders expected data attributes
  - escapes labels
  - renders default values
- `liveLandmarkInspection.test.ts`
  - changing `maxPairDeltaMs` changes pair acceptance on subsequent frames
  - reset restores default fusion tuning
  - leaving preview preserves tuning but clears runtime snapshots
- `diagnostic.smoke.spec.ts`
  - `/diagnostic.html` shows fusion panel
  - `/diagnostic.html` shows fusion tuning constant names
  - existing side trigger slider smoke checks still pass
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderFusionTuningControls.test.ts tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - `npm run test:e2e`

**Dependency on contracts:**
- M3: none directly
- M4: existing side trigger tuning UI pattern
- M5: any front aim tuning UI added by M5 must be preserved
- M6: `FusionTuning`, `fusionSliderMetadata`, `coerceFusionTuningValue`

---

### 9. Strengthen import-boundary and production-clean regression guards

**Scope:** Prevent M6 diagnostic fusion from leaking into the game page before M7.

**Files to create / modify:**
- Modify `tests/integration/importBoundaries.test.ts`
- Modify `tests/e2e/home.smoke.spec.ts`
- Optionally modify `eslint.config.mjs` only if the existing boundary tooling already supports the rule cleanly

**Implementation notes:**
- Extend import boundary guards:
  - `src/main.ts` must not import `diagnostic-workbench`
  - `src/main.ts` must not import `input-fusion`
  - `src/app/**` game page files must not import `diagnostic-workbench`
  - `src/app/**` game page files must not import `input-fusion`
  - `src/features/input-fusion/**` must not import:
    - `diagnostic-workbench`
    - `hand-tracking`
    - `camera`
    - `rendering`
    - `gameplay`
    - `src/app`
  - `src/features/front-aim/**` still must not import `side-trigger`, `input-fusion`, `gameplay`, or `diagnostic-workbench`
  - `src/features/side-trigger/**` still must not import `front-aim`, `input-fusion`, `gameplay`, `rendering`, or `diagnostic-workbench`
- Extend `/` E2E absence assertions:
  - no `FUSION_MAX_PAIR_DELTA_MS`
  - no `data-fusion-tuning`
  - no `wb-fusion-panel`
  - no `pairedFrontAndSide`
  - no `timestampGapTooLarge`
  - no side-trigger tuning labels
  - no landmark overlay IDs

**Test plan:**
- `importBoundaries.test.ts`
  - deterministic static scan for forbidden imports
  - keep expected offenders as `[]`, not loose truthy assertions
- `home.smoke.spec.ts`
  - production game page remains clean after M6
- Run:
  - `npx vitest run tests/integration/importBoundaries.test.ts`
  - `npm run test:e2e`
  - `npm run lint`
  - `npm run typecheck`

**Dependency on contracts:**
- M4/M5 boundary tests must be extended, not duplicated.
- M6 `input-fusion` boundary is diagnostic-consumed only until M7.

---

### 10. Add replay coverage for fusion timing sequences

**Scope:** Pin down fusion correctness across multi-frame synthetic sequences outside DOM wiring.

**Files to create / modify:**
- Add `tests/replay/inputFusionSequenceReplay.test.ts`
- Modify `tests/replay/AGENTS.md` only if the future note should become current guidance

**Implementation notes:**
- Use synthetic `AimInputFrame` and `TriggerInputFrame` arrays.
- Do not use recorded videos.
- Cover realistic timing patterns:
  - front 60fps / side 30fps
  - side trigger commit between front frames
  - brief side stall
  - front stall
  - large timestamp drift
  - side-only shot commit later paired with a close front frame
- Keep deterministic fixed arrays.

**Test plan:**
- `inputFusionSequenceReplay.test.ts`
  - accepted pairs stay within configured max delta
  - stale lanes degrade instead of pairing
  - one shot commit produces exactly one `shotFired`
  - unpaired side-only shot commit remains unconsumed until accepted pair or pruning
  - pruned shot commit can no longer fire
- Run:
  - `npm run test:replay`
  - `npm run check`

**Dependency on contracts:**
- M3: timestamp semantics
- M4: shot edge semantics
- M5: aim availability semantics
- M6: fusion mapper public API

---

### 11. Final M6 acceptance pass

**Scope:** Verify M6 is diagnostic fusion only and ready for M7 gameplay wiring later.

**Files to create / modify:**
- No new source files expected.
- Only adjust tests if acceptance gaps are found.

**Acceptance checklist:**
- `src/features/input-fusion/` exists and owns pairing only.
- `FusedGameInputFrame` exists in shared types and is generated by fusion mapper.
- Pairing uses `FrameTimestamp.frameTimestampMs`.
- No new timestamp source is introduced.
- Timestamp delta is shown in diagnostic workbench.
- Front and side buffer ages are shown in diagnostic workbench.
- Buffer counts are shown in diagnostic workbench.
- `shotCommitted` / `pullStarted+shotCommitted` edge consumption is one-shot.
- Side-only diagnostic commit does not consume the shot edge.
- Fusion reject reasons are explicit.
- Fusion tuning sliders exist only on `diagnostic.html`.
- Existing M4 side trigger sliders still work.
- Existing M5 front aim telemetry still works.
- Game page remains production-clean.
- `index.html` / `src/main.ts` do not import `diagnostic-workbench`.
- `index.html` / `src/main.ts` do not import `input-fusion`.
- No balloons / score / hit detection are added.

**Test plan:**
- Full gates:
  - `npm run check`
  - `npm run test:e2e`
- Manual live-camera probe:
  - open `/diagnostic.html`
  - assign front and side cameras
  - verify front aim telemetry updates
  - verify side trigger telemetry updates
  - pull trigger while moving front aim
  - verify fusion mode changes to `pairedFrontAndSide` when timestamps are close
  - verify timestamp delta and buffer ages update
  - verify `shotFired` appears once for one committed edge
  - increase `FUSION_MAX_PAIR_DELTA_MS` and observe more pair acceptance
  - decrease `FUSION_MAX_PAIR_DELTA_MS` and observe `timestampGapTooLarge`
  - open `/`
  - verify no fusion panel, no fusion sliders, no landmark overlays, no diagnostic UI

**Dependency on contracts:**
- Requires all M3/M4/M5 contracts.
- M6 must not require M7 gameplay contracts.

---

## 3. Risk register

1. Timestamp drift between cameras
   - Risk: front and side streams may have different cadence or skew, causing unfair aim/shot pairing.
   - Early probe: `pairFusionFrames.test.ts` and `inputFusionSequenceReplay.test.ts` with front 60fps / side 30fps and shifted timestamps.
   - Live probe: diagnostic panel records timestamp delta distribution while moving/triggering for 30 seconds.
   - Decision rule: keep `FUSION_MAX_PAIR_DELTA_MS` conservative until live deltas prove a larger value feels fair.

2. Frame age threshold too strict or too loose
   - Risk: strict age drops usable input; loose age pairs stale aim with fresh trigger.
   - Early probe: unit tests for `frontStale` and `sideStale`.
   - Live probe: pause/cover one camera and verify degradation within threshold.
   - Decision rule: stale frames cannot emit `shotFired`.

3. Shot edge double-consumption
   - Risk: one side `shotCommitted` pairs with multiple front frames and fires multiple shots.
   - Early probe: `shotEdgeConsumption.test.ts` repeats the same side edge across multiple accepted front updates.
   - Decision rule: consumption key must be side-frame based and cleared only on side reset/all reset.

4. Side-only shot edge lost too early
   - Risk: side commit happens just before a close front frame; if consumed in side-only diagnostic mode, the eventual valid pair cannot fire.
   - Early probe: replay where side commit arrives first, front frame arrives within delta afterward.
   - Decision rule: side-only diagnostic never consumes shot edge.

5. Degrade policy ambiguity when one lane is semantically unavailable
   - Risk: timestamp pairing succeeds, but aim or trigger availability is unavailable.
   - Early probe: mapper tests with `aimAvailability: "unavailable"` and `triggerAvailability: "unavailable"`.
   - Decision rule: pairing diagnostics may show source frames, but `shotFired` stays false unless paired mode and usable trigger edge are both present.

6. Lane restart contamination
   - Risk: old stream frames remain in fusion buffer after reselect/swap and pair with new lane frames.
   - Early probe: `liveLandmarkInspection.test.ts` stream replacement clears only affected lane buffer.
   - Decision rule: front reset clears front buffer; side reset clears side buffer and shot consumption keys.

7. Timestamp source confidence
   - Risk: callback receipt fallback timestamps look pairable but are less reliable.
   - Early probe: telemetry test with mixed `timestampSource`.
   - Live probe: workbench displays source summary for each lane.
   - Decision rule: do not hide timestamp source; lower confidence or flag source summary when not captureTime.

8. Default-state mismatch
   - Risk: static render default and live initial state diverge, causing undefined display or test flakiness.
   - Early probe: render test compares `renderWorkbenchHTML(...omitted inspection...)` and `createLiveLandmarkInspection().getState()`.
   - Decision rule: add M6 fields to both defaults in the same step.

9. Telemetry undefined display
   - Risk: workbench shows `undefined`, blank strings, or `NaN`.
   - Early probe: `renderFusionPanel.test.ts` asserts `unavailable` for missing scalar/timestamp values.
   - Decision rule: diagnostic renderer owns display fallback; fusion types keep missing values explicit.

10. `knip` unused export failures
   - Risk: M6 adds shared fusion types before diagnostic wiring consumes them.
   - Early probe: run `npm run knip` after Steps 1, 4, and 8.
   - Decision rule: every exported type/function must be used by implementation or tests plus real diagnostic wiring.

11. Async stale writes in workbench
   - Risk: in-flight tracker result writes stale aim/trigger/fusion state after destroy/reselect.
   - Early probe: extend existing stale-detect tests to assert `fusionFrame` remains undefined after destroy.
   - Decision rule: reuse M3/M4/M5 stopped guards; do not bypass `setInspection` lifecycle.

12. Stale video element after re-render
   - Risk: tracking continues on removed video elements and feeds fusion with stale frames.
   - Early probe: preserve existing stale video re-render test and add fusion state expectations.
   - Decision rule: active tracking key must include stream identity and element identity.

13. Game page contamination
   - Risk: diagnostic fusion imports leak into production page before M7.
   - Early probe: import-boundary tests and `/` E2E absence checks.
   - Decision rule: M6 acceptance fails if `src/main.ts` or game app files import `input-fusion`.

14. M5 merge conflict in shared workbench files
   - Risk: M5 and M6 both modify workbench state, live inspection, render, diagnostics tests, and tuning controls.
   - Early probe: inspect post-M5 diff before editing; rerun all render/live tests after merge.
   - Decision rule: append fusion state; never replace M5 front aim or M4 side trigger state wholesale.

15. Markdown lint MD029 / plan handoff hygiene
   - Risk: future saved task docs fail lint on ordered lists.
   - Early probe: if this decomposition is copied into a repo doc, run `npm run format:check` or markdown lint if configured.
   - Decision rule: use sequential ordered list numbering in committed Markdown.

---

## 4. Quality gate sequence

1. Before M6 implementation
   - `npm run check`
   - `npm run test:e2e`

2. After Steps 1-2
   - `npx vitest run tests/unit/features/input-fusion/typeContract.test.ts tests/unit/features/input-fusion/fusionConfig.test.ts`
   - `npm run typecheck`
   - `npm run knip`

3. After Steps 3-4
   - `npx vitest run tests/unit/features/input-fusion`
   - `npm run typecheck`
   - `npm run knip`

4. After Steps 5-6
   - `npx vitest run tests/unit/features/input-fusion/fusionTelemetry.test.ts tests/unit/features/diagnostic-workbench/diagnosticValueFormat.test.ts tests/unit/features/diagnostic-workbench/renderFusionPanel.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
   - `npm run check`

5. After Steps 7-8
   - `npx vitest run tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts tests/integration/diagnosticFusionWorkbench.test.ts tests/unit/features/diagnostic-workbench/renderFusionTuningControls.test.ts`
   - `npm run test:e2e`
   - `npm run check`

6. After Steps 9-10
   - `npx vitest run tests/integration/importBoundaries.test.ts`
   - `npm run test:replay`
   - `npm run check`
   - `npm run test:e2e`

7. Final acceptance
   - `npm run check`
   - `npm run test:e2e`
   - Manual live-camera diagnostic probe on `/diagnostic.html`
   - Manual production-clean smoke probe on `/`

---

## 5. Boundaries reminder

- Lane invariant:
  - front = aim
  - side = trigger
  - fusion = pairing only
- No balloons in M6.
- No scoring in M6.
- No hit detection in M6.
- No fusion rendering on the game canvas.
- No fusion telemetry on `/`.
- No fusion threshold sliders on `/`.
- Fusion telemetry and fusion threshold sliders live only in `diagnostic.html`.
- `src/features/input-fusion/` must not do landmark math.
- `src/features/input-fusion/` must not open cameras or own browser capture.
- `src/features/input-fusion/` must not import `src/features/diagnostic-workbench/`.
- `src/features/input-fusion/` must not import `src/features/gameplay/`.
- `index.html` / `src/main.ts` must not import `src/features/diagnostic-workbench/`.
- `index.html` / `src/main.ts` must not import `src/features/input-fusion/` until M7 explicitly wires the production fusion path.
- M6 may produce `FusedGameInputFrame`, but gameplay must not consume it yet.
- `requestVideoFrameCallback`-derived `FrameTimestamp` remains the timestamp source. Do not introduce `Date.now()`, `performance.now()`, or callback order as a fusion timestamp.

---

## 6. M5 coordination notes

Files and symbols both M5 and M6 are likely to touch. Rebase carefully and preserve both lanes.

1. `src/features/diagnostic-workbench/renderWorkbench.ts`
   - M4 owns side trigger fields and side trigger panel.
   - M5 adds front aim fields and front aim panel.
   - M6 adds fusion fields and fusion panel.
   - Merge rule: preserve existing interface fields and append M6 fields. Do not replace `WorkbenchInspectionState` wholesale.

2. `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
   - M4 wires side trigger mapper, telemetry, tuning, reset behavior.
   - M5 wires front aim mapper, telemetry, game/diagnostic projection assumptions, reset behavior.
   - M6 wires input fusion mapper and buffer reset behavior.
   - Merge rule: keep M3 cleanup/race/stale-video guards, M4 side-trigger state, and M5 front-aim state. Add fusion as a parallel lane consumer.

3. `src/diagnostic-main.ts`
   - M4 adds side trigger tuning input handling.
   - M5 may add front aim tuning input handling if front tuning exists.
   - M6 adds fusion tuning input handling and reset action.
   - Merge rule: extend the existing click/input handler. Do not create a second diagnostic event system.

4. `src/features/diagnostic-workbench/renderTuningControls.ts`
   - M4 owns side trigger sliders.
   - M5 may touch this if front aim tuning exists.
   - M6 should prefer a separate `renderFusionTuningControls.ts` unless post-M5 has already centralized tuning panels.
   - Merge rule: no tuning controls on `index.html`.

5. `src/styles/diagnostic.css`
   - M4 styles side world landmarks, side trigger panel, tuning controls.
   - M5 styles front aim telemetry.
   - M6 styles fusion panel and fusion tuning controls.
   - Merge rule: reuse panel/grid/value classes where possible; avoid one-off style systems.

6. `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
   - M4 asserts side trigger rendering.
   - M5 asserts front aim rendering.
   - M6 asserts fusion rendering.
   - Merge rule: keep all preview-mode expectations in one fixture where practical.

7. `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
   - M4 adds side trigger mapper/tuning/reset tests.
   - M5 adds front aim mapper/reset/stale-write tests.
   - M6 adds fusion pairing/shot consumption/reset tests.
   - Merge rule: preserve existing cleanup, async race guard, stale detection write, and stale video element tests.

8. `tests/e2e/diagnostic.smoke.spec.ts`
   - M4 adds side trigger panel and slider smoke checks.
   - M5 adds front aim telemetry smoke checks.
   - M6 adds fusion panel and fusion tuning smoke checks.
   - Merge rule: all diagnostic checks stay on `/diagnostic.html`.

9. `tests/e2e/home.smoke.spec.ts`
   - M5 changes this from placeholder to production-clean game page checks.
   - M6 extends absence checks for fusion telemetry/sliders.
   - Merge rule: `/` remains clean; do not add diagnostic links or fusion labels.

10. `tests/integration/importBoundaries.test.ts`
   - M4 creates side-trigger leakage guards.
   - M5 extends front-aim and game-page cleanliness guards.
   - M6 extends input-fusion diagnostic-only guards.
   - Merge rule: one shared static scanner file is preferable to duplicate scanners.

11. `src/shared/types/aim.ts`
   - M5 owns `AimInputFrame`.
   - M6 consumes it.
   - Merge rule: do not change M5 aim contract unless post-M5 implementation proves a concrete incompatibility.

12. `src/shared/types/trigger.ts`
   - M4 owns `TriggerInputFrame`.
   - M6 consumes it.
   - Merge rule: handle current M4 `TriggerEdge` union, including `"pullStarted+shotCommitted"`.

13. `src/shared/types/fusion.ts`
   - M6 owns this new file.
   - Future M7 will consume it from gameplay.
   - Merge rule: keep it gameplay-ready but diagnostic-consumed in M6 to satisfy `knip`.

14. `src/features/front-aim/`
   - M5 owns front aim mapping and telemetry.
   - M6 should not modify front aim math unless pairing exposes a contract bug.
   - Merge rule: fusion reads `AimInputFrame`; it does not inspect front landmarks.

15. `src/features/side-trigger/`
   - M4 owns trigger evidence and FSM.
   - M6 should not modify side trigger math/FSM unless shot edge semantics are incorrect.
   - Merge rule: fusion reads `TriggerInputFrame`; it does not inspect side landmarks.
