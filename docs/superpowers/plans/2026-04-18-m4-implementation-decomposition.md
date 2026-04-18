# M4 Implementation-Granularity Task Decomposition

**Milestone:** Issue #4, Side World-Landmark and Trigger Evidence Workbench
**Goal:** Prove whether side-camera-only trigger judgement is feasible by making `SideHandDetection -> TriggerInputFrame` observable and live-tunable in `diagnostic.html`.
**Boundary:** No balloon hit detection, no front/side gameplay pairing, no game canvas overlay, no threshold sliders on `index.html`.

## Pre-flight Checks

Before starting M4, verify all of the following on the post-M3 `main` branch, then create the M4 implementation branch from there.

1. M3 must be merged and passing.
   - `diagnostic.html` renders front and side camera feeds.
   - Raw/filtered landmark overlays render in the diagnostic workbench.
   - `index.html` and `diagnostic.html` remain separate Vite entry points.
   - Game page code must not import `src/features/diagnostic-workbench/`.

2. Required M3 type contracts must exist (verified against PR #15 / commit `5c93fea`).
   - `src/shared/types/camera.ts` exports `FrameTimestamp`:
     - `frameTimestampMs`
     - `timestampSource` (`"requestVideoFrameCallbackCaptureTime" | "requestVideoFrameCallbackExpectedDisplayTime" | "performanceNowAtCallback"`)
     - `presentedFrames` (`number | undefined`)
     - `receivedAtPerformanceMs`
   - `src/shared/types/camera.ts` exports `LaneHealthStatus` (`"notStarted" | "waitingForPermission" | "waitingForDeviceSelection" | "capturing" | "tracking" | "stalled" | "captureLost" | "failed"`).
   - `src/shared/types/camera.ts` exports `CameraLaneRole` (`"frontAim" | "sideTrigger"`).
   - `src/shared/types/hand.ts` exports:
     - `FrontHandDetection`
     - `SideHandDetection`
     - `HandDetection` (base with `rawFrame` / `filteredFrame`)
     - `HandFrame`, `HandLandmarkSet`, `Point3D`
   - `SideViewQuality` is currently an INLINE union on `SideHandDetection.sideViewQuality`. M4 step 1 should EXTRACT it as a named type (e.g. `export type SideViewQuality = "good" | "frontLike" | "tooOccluded" | "lost"`) and re-export from `src/shared/types/hand.ts` so trigger evidence / telemetry / tuning code can reference it by name. This is a small additive change to M3 types — keep it inside M4 step 1 to avoid scope creep on M3.
   - `SideHandDetection` includes (verified post-M3):
     - `laneRole: "sideTrigger"`
     - `deviceId`
     - `streamId`
     - `timestamp: FrameTimestamp`
     - `rawFrame`
     - `filteredFrame`
     - `handPresenceConfidence: number`
     - `sideViewQuality: "good" | "frontLike" | "tooOccluded" | "lost"`

3. World landmarks must be available through the existing hand frame shape.
   - `src/shared/types/hand.ts` keeps `HandFrame.worldLandmarks?: HandLandmarkSet`.
   - M4 must not introduce a workbench-only detection schema.

4. M3 diagnostic workbench surface (verified against PR #15):
   - `src/features/diagnostic-workbench/DiagnosticWorkbench.ts` — controller for camera permission / device assignment. Exposes `WorkbenchState` (camera + device state only, NO detection data) and methods: `getState`, `subscribe`, `requestPermission`, `assignDevices`, `swapRoles`, `reselect`, `destroy`.
   - `src/features/diagnostic-workbench/renderWorkbench.ts` — exports `WorkbenchInspectionState` (this is where detection data lives):
     - `frontDetection: FrontHandDetection | undefined`
     - `sideDetection: SideHandDetection | undefined`
     - `frontFrameTimestamp?: FrameTimestamp`
     - `sideFrameTimestamp?: FrameTimestamp`
     - `frontLaneHealth: LaneHealthStatus`
     - `sideLaneHealth: LaneHealthStatus`
   - `src/features/diagnostic-workbench/liveLandmarkInspection.ts` — per-frame updater that owns and patches `WorkbenchInspectionState`.
   - `src/features/diagnostic-workbench/landmarkOverlay.ts` — workbench-only canvas overlay helper.
   - `src/diagnostic-main.ts` wires camera, MediaPipe trackers, and inspection state into the workbench.
   - **M4 implication:** add side trigger fields to `WorkbenchInspectionState` (in `renderWorkbench.ts`), populate them from `liveLandmarkInspection.ts`, and render via a new `renderSideTriggerPanel.ts`. Live tuning controller state (sliders) can extend `DiagnosticWorkbench.ts` or live in a new controller — either is acceptable as long as workbench-only.
   - All workbench files remain workbench-only (no game page import).

6. Baseline quality gates must pass before coding.
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e`

## Numbered Implementation Steps

### 1. Add Side Trigger Module Boundary and Shared Trigger Contract

**Scope:** Establish the M4 source boundary before adding behavior.

**Files to create / modify:**
- Create `src/features/side-trigger/AGENTS.md`
- Create `src/features/side-trigger/CLAUDE.md` as sibling symlink
- Create `src/features/side-trigger/index.ts`
- Create `src/shared/types/trigger.ts`
- Modify `src/shared/types/AGENTS.md` only if the new trigger contract needs explicit mention

**Implementation notes:**
- `src/features/side-trigger/AGENTS.md` must be English.
- The side-trigger module consumes `SideHandDetection` and emits `TriggerInputFrame`.
- It must not import from `front-aim`, `input-fusion`, `gameplay`, `rendering`, or `diagnostic-workbench`.
- `src/shared/types/trigger.ts` should define the cross-module contract:
  - `SideTriggerPhase`
  - `TriggerEdge`
  - `TriggerInputFrame`
  - `SideTriggerDwellFrameCounts`
  - `SideTriggerTelemetry`
  - `SideTriggerRejectReason`
  - `SideTriggerCalibrationStatus`, initially `"uncalibrated" | "liveTuning"`

**Test plan:**
- Add `tests/unit/features/side-trigger/typeContract.test.ts`.
- The test should compile sample `TriggerInputFrame` objects with `timestamp: FrameTimestamp`.
- Add negative-style compile coverage through strict literal unions where practical.
- Run:
  - `npx vitest run tests/unit/features/side-trigger/typeContract.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- Required: `FrameTimestamp`.
- Optional: `LaneHealthStatus` is not needed in this step.
- Required: `SideViewQuality` from M3 if referenced by `SideTriggerTelemetry`.

### 2. Define Named Threshold Defaults and Live-Tuning Shape

**Scope:** Make every tunable M4 threshold a named constant and expose one runtime config shape.

**Files to create / modify:**
- Create `src/features/side-trigger/sideTriggerConstants.ts`
- Create `src/features/side-trigger/sideTriggerConfig.ts`
- Modify `src/features/side-trigger/index.ts`
- Add `tests/unit/features/side-trigger/sideTriggerConfig.test.ts`

**Implementation notes:**
- Export all names from the M4 plan exactly:
  - `SIDE_TRIGGER_PULL_ENTER_THRESHOLD`
  - `SIDE_TRIGGER_PULL_EXIT_THRESHOLD`
  - `SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD`
  - `SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD`
  - `SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES`
  - `SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES`
  - `SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES`
  - `SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES`
  - `SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES`
  - `SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT`
- Add `SideTriggerTuning` with those same field names or a direct one-to-one lower camelCase mapping plus slider metadata that preserves the exported constant names.
- Add slider metadata:
  - display name
  - min
  - max
  - step
  - defaultValue
  - numeric kind: `"ratio"` or `"frames"`
- Defaults can be conservative placeholders, but names must be final and visible in workbench labels.

**Test plan:**
- Verify every named constant appears in the slider metadata exactly once.
- Verify enter/exit hysteresis is valid:
  - pull enter > pull exit
  - release enter > release exit
- Verify dwell/cooldown values are positive integers.
- Run:
  - `npx vitest run tests/unit/features/side-trigger/sideTriggerConfig.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- No direct dependency on `FrameTimestamp`.
- No dependency on `LaneHealthStatus`.

### 3. Add Side World-Landmark Readout Rendering

**Scope:** Make side `worldLandmarks` observable before building trigger heuristics.

**Files to create / modify:**
- Create `src/features/diagnostic-workbench/renderWorldLandmarks.ts`
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/styles/diagnostic.css`
- Add `tests/unit/features/diagnostic-workbench/renderWorldLandmarks.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`

**Implementation notes:**
- Render world landmarks only in the diagnostic workbench side lane.
- Show explicit unavailable state when `sideDetection?.rawFrame.worldLandmarks` is absent.
- Render at least:
  - wrist
  - thumbIp
  - thumbTip
  - indexMcp
  - indexTip
- Include timestamp context near the readout:
  - `frameTimestampMs`
  - `timestampSource`
  - `presentedFrames`
- Format numeric coordinates consistently, e.g. `x/y/z` to 3 decimals.
- Do not mutate `SideHandDetection`.
- Do not create a diagnostic-only detection format.

**Test plan:**
- Unit test renders world landmark coordinates when present.
- Unit test renders explicit unavailable state when absent.
- Unit test escapes labels/text and does not expose raw `deviceId`.
- Unit test verifies timestamp fields render from `FrameTimestamp`.
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderWorldLandmarks.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- Required: `SideHandDetection.timestamp: FrameTimestamp`.
- Required: `HandFrame.worldLandmarks?: HandLandmarkSet`.
- Optional: `LaneHealthStatus` only if the surrounding side panel displays capture health.

### 4. Implement Pure Side Trigger Evidence Extraction

**Scope:** Convert one `SideHandDetection` into scalar evidence without state transitions.

**Files to create / modify:**
- Create `src/features/side-trigger/sideTriggerEvidence.ts`
- Modify `src/features/side-trigger/index.ts`
- Add `tests/unit/features/side-trigger/sideTriggerEvidence.test.ts`

**Implementation notes:**
- Input: `SideHandDetection`.
- Output: `SideTriggerEvidence` containing:
  - `sideHandDetected`
  - `sideViewQuality`
  - `pullEvidenceScalar`
  - `releaseEvidenceScalar`
  - `triggerPostureConfidence`
  - `shotCandidateConfidence`
  - `rejectReason`
  - `usedWorldLandmarks: boolean`
- Prefer `rawFrame.worldLandmarks` for side trigger evidence because trigger movement is transient.
- If world landmarks are unavailable, use a clearly marked 2D fallback only if useful for live probing; otherwise return low confidence with `rejectReason: "worldLandmarksUnavailable"`.
- Normalize distances by a hand reference length such as wrist-to-indexMcp or wrist-to-indexTip.
- Keep the geometry simple and explainable:
  - pull evidence should increase when thumb moves toward the pulled-trigger region.
  - release evidence should increase when thumb returns to open-trigger region.
  - posture confidence should reject `frontLike`, `tooOccluded`, and `lost` quality.
- Do not apply dwell, cooldown, or shot commitment here.

**Test plan:**
- Synthetic world-landmark open pose produces high release evidence and low pull evidence.
- Synthetic pulled pose produces high pull evidence and low release evidence.
- `sideViewQuality: "frontLike"` or `"tooOccluded"` lowers confidence or rejects commit.
- Missing world landmarks returns explicit unavailable evidence.
- Low hand confidence lowers `shotCandidateConfidence`.
- Run:
  - `npx vitest run tests/unit/features/side-trigger/sideTriggerEvidence.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- Required: `SideHandDetection`.
- Required: `FrameTimestamp` only indirectly, copied later by mapper.
- No dependency on `LaneHealthStatus`.

### 5. Implement Pure Trigger FSM

**Scope:** Make phase transitions deterministic and fully unit-tested.

**Files to create / modify:**
- Create `src/features/side-trigger/sideTriggerStateMachine.ts`
- Modify `src/shared/types/trigger.ts`
- Modify `src/features/side-trigger/index.ts`
- Add `tests/unit/features/side-trigger/sideTriggerStateMachine.test.ts`

**Implementation notes:**
- FSM phases:
  - `SideTriggerNoHand`
  - `SideTriggerPoseSearching`
  - `SideTriggerOpenReady`
  - `SideTriggerPullCandidate`
  - `SideTriggerPulledLatched`
  - `SideTriggerReleaseCandidate`
  - `SideTriggerCooldown`
  - `SideTriggerRecoveringAfterLoss`
- Edges:
  - `none`
  - `pullStarted`
  - `shotCommitted`
  - `releaseConfirmed`
- `shotCommitted` must emit exactly once on entry to `SideTriggerPulledLatched`.
- Loss of hand is not release.
- Dwell counters reset when evidence exits candidate range.
- Cooldown prevents repeated fire after release.
- Side-view quality failure prevents `shotCommitted` even when scalar evidence is high.
- The FSM should be pure:
  - input: previous FSM state, evidence, tuning
  - output: next FSM state, edge, counters, reject reason

**Test plan:**
- No hand -> `SideTriggerNoHand`.
- Hand visible but bad posture -> `SideTriggerPoseSearching`.
- Stable acceptable pose -> `SideTriggerOpenReady`.
- Pull enter threshold -> `SideTriggerPullCandidate` with `pullStarted`.
- Pull dwell completion -> `SideTriggerPulledLatched` with one `shotCommitted`.
- Holding pulled state does not repeat `shotCommitted`.
- Release enter + dwell -> `releaseConfirmed`, then cooldown.
- Cooldown completes -> `SideTriggerOpenReady`.
- Brief hand loss -> `SideTriggerRecoveringAfterLoss`.
- Excessive hand loss -> `SideTriggerNoHand`.
- Run:
  - `npx vitest run tests/unit/features/side-trigger/sideTriggerStateMachine.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- No direct dependency on `FrameTimestamp`; FSM uses frame counts.
- No dependency on `LaneHealthStatus`.

### 6. Add Stateful Side Trigger Mapper

**Scope:** Compose evidence extraction and FSM into `SideHandDetection -> TriggerInputFrame`.

**Files to create / modify:**
- Create `src/features/side-trigger/createSideTriggerMapper.ts`
- Optionally create `src/features/side-trigger/sideTriggerTelemetry.ts`
- Modify `src/features/side-trigger/index.ts`
- Add `tests/unit/features/side-trigger/createSideTriggerMapper.test.ts`
- Add `tests/unit/features/side-trigger/sideTriggerTelemetry.test.ts` if telemetry is split

**Implementation notes:**
- Input per update:
  - `SideHandDetection | undefined`
  - current `SideTriggerTuning`
- Output:
  - `TriggerInputFrame`
  - `SideTriggerTelemetry`
- `TriggerInputFrame` must include:
  - `laneRole: "sideTrigger"`
  - `timestamp: FrameTimestamp`
  - `triggerAvailability`
  - `sideTriggerPhase`
  - `triggerEdge`
  - `triggerPulled`
  - `shotCandidateConfidence`
  - `sideHandDetected`
  - `sideViewQuality`
  - `dwellFrameCounts`
- If detection is `undefined`, preserve the timestamp policy explicitly:
  - Either accept a separate latest side capture `FrameTimestamp`, or emit no new frame and expose telemetry as unavailable.
  - Do not fabricate `shotCommitted` on hand loss.
- Reset mapper state when `deviceId` or `streamId` changes.
- Mapper must not know front aim or fusion.

**Test plan:**
- Copies `FrameTimestamp` from `SideHandDetection` into `TriggerInputFrame`.
- Emits `triggerAvailability: "available"` only when evidence is usable.
- Emits `shotCommitted` once for a valid pull sequence.
- Emits no shot when side view quality is not acceptable.
- Resets phase on stream change.
- Exposes telemetry fields:
  - phase
  - edge
  - pull/release evidence
  - dwell counts
  - cooldown remaining
  - last reject reason
- Run:
  - `npx vitest run tests/unit/features/side-trigger/createSideTriggerMapper.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- Required: `FrameTimestamp`.
- Required: `SideHandDetection.deviceId` and `streamId`.
- Optional: `LaneHealthStatus` if mapper telemetry includes lane health; prefer keeping capture health in workbench/capture telemetry.

### 7. Add Workbench Trigger Evidence Panel

**Scope:** Render every M4 trigger evidence field in `diagnostic.html`.

**Files to create / modify:**
- Create `src/features/diagnostic-workbench/renderSideTriggerPanel.ts`
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts` (workbench live state — actual file from M3 / PR #15)
- Modify `src/styles/diagnostic.css`
- Add `tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

**Implementation notes:**
- The side trigger panel must render:
  - current phase
  - `triggerEdge`
  - `triggerPulled`
  - pull evidence scalar
  - release evidence scalar
  - posture confidence
  - shot candidate confidence
  - pull dwell
  - release dwell
  - cooldown remaining
  - `shotCommitted` evidence
  - last reject reason
- `shotCommitted` should be visually obvious in the workbench, but still only a diagnostic event.
- Display explicit unavailable states before the first side detection.
- Do not add anything to `index.html`.

**Test plan:**
- Renders all FSM phases from sample telemetry.
- Renders pull/release evidence numbers with stable formatting.
- Renders dwell and cooldown counts.
- Renders `shotCommitted` when the sample frame edge is `shotCommitted`.
- Renders unavailable state before side telemetry exists.
- DiagnosticWorkbench state stores and clears side trigger snapshots on reselect/destroy.
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderSideTriggerPanel.test.ts tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- Required: `FrameTimestamp` for displayed trigger frame timestamp.
- Optional: `LaneHealthStatus` for co-displaying side capture health.

### 8. Add Named Threshold Sliders to the Diagnostic Workbench

**Scope:** Make all side-trigger thresholds live-tunable in the workbench.

**Files to create / modify:**
- Create `src/features/diagnostic-workbench/renderTuningControls.ts`
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts` (workbench live state — actual file from M3 / PR #15)
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify `src/diagnostic-main.ts`
- Modify `src/styles/diagnostic.css`
- Add `tests/unit/features/diagnostic-workbench/renderTuningControls.test.ts`
- Modify `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

**Implementation notes:**
- Sliders must live only in `diagnostic.html`.
- Slider labels must use the named threshold constants from `sideTriggerConstants.ts`.
- Runtime tuning state should be owned by workbench state or a small workbench controller, but threshold interpretation remains in `side-trigger`.
- Slider updates must affect subsequent side-trigger mapper updates without page reload.
- Include reset-to-default action.
- Use numeric inputs or range sliders with visible current values.
- Never duplicate threshold names in workbench-only constants.

**Test plan:**
- Renders every named side trigger threshold slider.
- Changing a slider updates workbench tuning state.
- Reset restores defaults from `sideTriggerConfig.ts`.
- Slider values are passed to the side-trigger mapper in integration wiring tests.
- Verify no threshold sliders appear in `index.html` via E2E or import-boundary test.
- Run:
  - `npx vitest run tests/unit/features/diagnostic-workbench/renderTuningControls.test.ts tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - `npm run typecheck`

**M3 dependency:**
- No direct dependency on `FrameTimestamp`.
- No direct dependency on `LaneHealthStatus`.

### 9. Wire Side Trigger Mapper into `diagnostic-main.ts`

**Scope:** Connect live side detections to trigger frames, telemetry, panel rendering, and sliders.

**Files to create / modify:**
- Modify `src/diagnostic-main.ts`
- Modify `src/features/diagnostic-workbench/liveLandmarkInspection.ts` (workbench live state — actual file from M3 / PR #15)
- Modify `src/features/diagnostic-workbench/renderWorkbench.ts`
- Add `tests/integration/diagnosticSideTriggerWorkbench.test.ts`
- Add or modify `tests/e2e/diagnostic.side-trigger.spec.ts`

**Implementation notes:**
- Instantiate `createSideTriggerMapper()` in the diagnostic entry wiring.
- Feed it the latest `state.sideDetection` plus current side trigger tuning.
- Store or patch the resulting `TriggerInputFrame` and `SideTriggerTelemetry` into workbench state.
- Keep DOM patching lightweight; do not rebuild video elements on every trigger frame if M3 already avoids that.
- Sliders should change mapper behavior live.
- Re-selecting or swapping cameras must reset side trigger FSM state.
- The side trigger mapper must not feed gameplay or fusion in M4.

**Test plan:**
- Integration test with scripted `SideHandDetection` sequence:
  - open pose
  - pull candidate
  - dwell completion
  - `shotCommitted`
  - release
  - cooldown
- Integration test verifies slider changes alter commit behavior.
- Integration test verifies reselect clears trigger phase and telemetry.
- E2E smoke verifies after preview:
  - side trigger panel exists
  - side world-landmark readout section exists
  - named threshold sliders exist
  - no game canvas overlay is involved
- Run:
  - `npx vitest run tests/integration/diagnosticSideTriggerWorkbench.test.ts`
  - `npm run test:e2e`

**M3 dependency:**
- Required: `SideHandDetection` flowing through M3 diagnostic tracking.
- Required: `FrameTimestamp` on detections.
- Optional: `LaneHealthStatus` for side capture health display.

### 10. Add Import Boundary and Regression Guards

**Scope:** Prevent M4 from leaking diagnostic/trigger tuning into gameplay.

**Files to create / modify:**
- Create `tests/integration/importBoundaries.test.ts`, or extend an existing boundary test if M3 introduced one
- Optionally modify `eslint.config.mjs` only if an established boundary rule already exists and can be extended safely
- Modify `tests/e2e/home.smoke.spec.ts` only if it needs to assert absence of workbench controls

**Implementation notes:**
- Guard these invariants:
  - `src/main.ts` and game page code do not import `src/features/diagnostic-workbench/`.
  - `src/features/gameplay/` does not import `src/features/side-trigger/`.
  - `src/features/side-trigger/` does not import `src/features/diagnostic-workbench/`.
  - `src/features/side-trigger/` does not import `front-aim` or `input-fusion`.
  - `index.html` does not render threshold slider text.
- Prefer a simple deterministic test over a complex lint rule unless the repo already has import-boundary tooling.

**Test plan:**
- Boundary test scans static imports from source files.
- Home/game smoke confirms workbench-only slider labels are absent from `index.html`.
- Run:
  - `npx vitest run tests/integration/importBoundaries.test.ts`
  - `npm run test:e2e`

**M3 dependency:**
- No direct dependency on `FrameTimestamp`.
- No dependency on `LaneHealthStatus`.

### 11. Final M4 Acceptance Pass

**Scope:** Verify the implementation as a feasibility workbench, not gameplay.

**Files to create / modify:**
- No new source files expected.
- Update tests only if acceptance gaps are found.

**Acceptance checklist:**
- Diagnostic workbench shows side world-landmark readout.
- Diagnostic workbench shows explicit unavailable state when world landmarks are absent.
- Diagnostic workbench shows side trigger phase.
- Diagnostic workbench shows pull evidence.
- Diagnostic workbench shows release evidence.
- Diagnostic workbench shows dwell counters.
- Diagnostic workbench shows cooldown.
- Diagnostic workbench shows `shotCommitted` evidence.
- All side trigger thresholds are named constants.
- All side trigger thresholds are live-tunable in the diagnostic workbench.
- `shotCommitted` is emitted once per valid pull-latch sequence.
- Holding trigger does not repeat shots.
- Hand loss is not treated as release.
- Side-view quality failure blocks commit.
- No balloon hit detection is added.
- No trigger/aim gameplay pairing is added.
- No diagnostic overlay or slider appears on game page.

**Test plan:**
- Run full quality gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run test:e2e`
- Optional but recommended after the above:
  - `npm run check`
- Manual live-camera probe:
  - open `diagnostic.html`
  - assign two distinct cameras
  - verify side world landmarks appear or unavailable state is explicit
  - move thumb through open/pulled/released posture
  - tune sliders until phase transitions are visible
  - record whether side-only trigger judgement appears feasible

**M3 dependency:**
- Required: all M3 diagnostic tracking contracts.
- Required: `FrameTimestamp`.
- Optional but useful: `LaneHealthStatus` for interpreting capture stalls during live trials.

## Risk Register

Run the cheapest probes first.

1. **M3 contract mismatch**
   - Risk: M4 starts from a branch that lacks `FrameTimestamp`, `SideHandDetection`, or diagnostic `sideDetection`.
   - Probe: before coding, run `rg -n "FrameTimestamp|SideHandDetection|LaneHealthStatus" src/shared src/features`.
   - Decision: stop and reconcile with M3 if contracts are missing or renamed.

2. **World landmarks are absent in real MediaPipe output**
   - Risk: the tracker does not produce `worldLandmarks` in Chrome on target devices.
   - Probe: Step 3 world-landmark readout before FSM tuning.
   - Decision: if absent, keep explicit unavailable state and use the 2D fallback only as a provisional feasibility probe.

3. **Side-view quality classifier is too weak**
   - Risk: `sideViewQuality` from M3 is placeholder-like and cannot distinguish side view from front-like view.
   - Probe: Step 4 synthetic evidence tests plus first live side-camera trial.
   - Decision: adjust side-view quality inside `side-trigger` evidence only if M3 classifier is insufficient; do not change M3 detection schema unless required.

4. **Pull/release evidence does not separate cleanly**
   - Risk: thumb motion from side view is not separable enough for reliable thresholds.
   - Probe: Step 4 evidence scalar panel and Step 8 sliders.
   - Decision: collect live false positive/false negative examples before touching gameplay.

5. **Jitter creates repeated `shotCommitted` events**
   - Risk: noisy landmarks cause double firing.
   - Probe: Step 5 FSM unit tests and Step 9 scripted integration sequence.
   - Decision: tune dwell, hysteresis, and cooldown; keep `shotCommitted` single-entry-only.

6. **Hand loss is mistaken for release**
   - Risk: occlusion during pull re-arms the trigger incorrectly.
   - Probe: FSM tests for brief loss and excessive loss.
   - Decision: enforce `SideTriggerRecoveringAfterLoss` and no release on loss.

7. **Slider state causes unstable workbench rendering**
   - Risk: telemetry updates rebuild DOM and reset slider positions or video streams.
   - Probe: Step 8 unit tests and Step 9 E2E smoke after preview.
   - Decision: patch telemetry panels in place, following M3’s lightweight update pattern.

8. **Side trigger code leaks into gameplay too early**
   - Risk: M4 accidentally wires `shotCommitted` into balloon scoring.
   - Probe: Step 10 import-boundary test and home smoke.
   - Decision: reject any M4 diff that touches hit detection or fused gameplay input.

9. **Two MediaPipe lanes are too heavy**
   - Risk: side trigger latency or frame drops hide true feasibility.
   - Probe: use existing M3 capture telemetry to observe side frame age and stalls while tuning.
   - Decision: log as M6/M9 performance risk unless it prevents M4 observation entirely.

10. **Threshold defaults overfit adult hands**
   - Risk: values that work for developer hands fail for children.
   - Probe: keep all threshold names visible and live-tunable; document default values as provisional.
   - Decision: do not freeze defaults as final until live daycare-style trials.

## Quality Gate Sequence

1. **Before M4 branch work**
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e`

2. **After Steps 1-2**
   - `npm run typecheck`
   - `npx vitest run tests/unit/features/side-trigger/typeContract.test.ts tests/unit/features/side-trigger/sideTriggerConfig.test.ts`

3. **After Step 3**
   - `npx vitest run tests/unit/features/diagnostic-workbench/renderWorldLandmarks.test.ts tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
   - `npm run typecheck`

4. **After Steps 4-6**
   - `npx vitest run tests/unit/features/side-trigger`
   - `npm run typecheck`

5. **After Steps 7-8**
   - `npx vitest run tests/unit/features/diagnostic-workbench`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`

6. **After Step 9**
   - `npx vitest run tests/integration/diagnosticSideTriggerWorkbench.test.ts`
   - `npm run test:e2e`

7. **After Step 10 and before PR**
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e`
   - Optional final superset: `npm run check`

## Boundaries Reminder

- M4 is only the side-trigger feasibility workbench.
- Do not add balloon hit detection.
- Do not add aim/trigger gameplay pairing.
- Do not wire `shotCommitted` into scoring.
- Do not render landmark overlays on the game canvas.
- Do not put threshold sliders on `index.html`.
- Do not reuse one camera as both front and side lanes.
- Preserve lane invariant:
  - front = aim
  - side = trigger
  - fusion = later pairing
- The diagnostic workbench may observe side trigger telemetry, but lane correctness belongs in `src/features/side-trigger/`.
- `TriggerInputFrame` exists for future fusion, but M4 must not consume it in gameplay.
