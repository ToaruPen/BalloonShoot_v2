# BalloonShoot_v2 Two-Camera Implementation Plan
作成日: 2026-04-15
> **For agentic workers:** This is a design-granularity implementation plan. Do not treat it as a code-level task list; preserve the lane boundaries, type contracts, UX order, timestamp policy, telemetry, and milestone order when deriving implementation tasks.
**Goal:** `front camera = aim`、`side camera = trigger`、`fusion lane = game input synthesis` の 3 lane を最初から分離し、`index.html` の game page と `diagnostic.html` の診断ワークベンチを別 entry point として段階的に実装できる状態にする。
**Architecture:** `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` の `Vite + TypeScript + Canvas 2D + MediaPipe Hand Landmarker` 方針を継承する。v1 の単眼入力統合は reference 扱いにし、`capture / tracking / mapping / fusion / gameplay` の依存方向を共有型で固定する。Vite は game page と diagnostic workbench の 2 entry を持ち、両者は lane module を共有するが互いを import しない。
**Evidence:** 既存の `HandDetection` は `rawFrame` と `filteredFrame` を持つ tracker 境界として再利用候補である（`src/shared/types/hand.ts:49`）。既存の `GameInputFrame` は crosshair と trigger を単眼 mapper でまとめるため、v2 ではそのまま再利用しない（`src/features/input-mapping/mapHandToGameInput.ts:22`）。`src/features/` は app shell から独立した feature module、`src/shared/types/` は共有契約の置き場である（`src/features/AGENTS.md`, `src/shared/types/AGENTS.md`）。
---
## 1. Goals & Non-Goals
### Goals
- v2 の正式な実装入口を、2 カメラ前提の設計として固定する。
- front camera は照準だけを担当し、発射判定を持たない。
- side camera は trigger 状態機械だけを担当し、照準座標を持たない。
- fusion lane は timestamp 付き `AimInputFrame` と `TriggerInputFrame` を束ねる。
- gameplay は `FusedGameInputFrame` だけを読む。
- `index.html` は production-clean な game page とし、score/time HUD、countdown、result screen、foundation design で承認済みの camera background だけを表示する。
- `diagnostic.html` は独立した diagnostic workbench とし、画面上の日本語表記では「診断ワークベンチ」と呼ぶ。
- shared types を早期に決め、front / side / fusion / gameplay の依存方向を固定する。
- camera permission、device selection、confirmation、re-selection の UX 順序を固定する。
- `requestVideoFrameCallback` 由来の timestamp を使い、近い時刻だけを融合する。
- 近い時刻で融合できない場合の degrade policy を最初から明示する。
- side trigger は debounce / hysteresis / dwell を持つ状態機械として設計する。
- lane ごとの telemetry を分け、front / side / fusion のどこが悪いかを診断ワークベンチで切り分ける。
- PoC 開発中の threshold tuning は診断ワークベンチで実施し、game page は統合体験の確認にだけ開く。
- milestone はすべて merge 可能で、単独で画面上の demo が成立する順序にする。
### Non-Goals
- stereo reconstruction、厳密な外部キャリブレーション、3D 復元は行わない。
- face / eye / head tracking、物体認識モデルは追加しない。
- React、Phaser、外部サーバー、保存機能、認証機能は導入しない。
- v1 の single-camera trigger 改善計画を v2 の正式仕様として扱わない。
- single camera を front と side の両方として再利用する mode は作らない。
- game page 上に development-time inspection surface、threshold slider、landmark wireframe、inspection panel を置かない。
- 診断ワークベンチ専用の detection format は作らない。
- TypeScript 実装、関数分解、テスト本文はこの文書では扱わない。
### Superseded Assumptions
- v1 は「front-facing camera で aim と thumb trigger を同時に見る」前提だった。
- v2 はその前提を破棄し、役割分離を最優先にする。
- gameplay canvas 上に development-time inspection surface を重ねる前提は破棄し、診断と tuning は dedicated page に移す。
- foundation design は tech stack、品質ゲート、PoC 方針として継承する。
- foundation design 以外の v1 specs / plans / handovers は historical reference として扱う。
---
## 2. Lane Architecture
### Layers
- `capture`: browser camera stream、video element、frame timing を扱う。
- `tracking`: MediaPipe Hand Landmarker を camera lane ごとに実行する。
- `mapping`: landmarks を lane-specific input に変換する。
- `fusion`: timestamp 付き aim / trigger frame を束ねる。
- `gameplay`: fused input を使って balloons、score、combo、timer を更新する。
### Flow
```text
front camera -> capture -> tracking -> front aim mapping -> AimInputFrame
                                                               \
                                                                -> fusion -> FusedGameInputFrame -> gameplay
                                                               /
side camera  -> capture -> tracking -> side trigger FSM -> TriggerInputFrame
```
### Application Entry Points
- `index.html`
  - production-clean game page。
  - imports shared lane wiring, input fusion, gameplay loop, and rendering needed for play。
  - does not import `src/features/diagnostic-workbench/`。
  - no development overlays、threshold sliders、landmark wireframes、timestamp inspector。
- `diagnostic.html`
  - diagnostic workbench page。
  - name choice: `diagnostic.html` is explicit, readable, and matches the internal diagnostic workbench name。
  - independent Vite entry that reuses capture、tracking、mapping、fusion lanes。
  - wires lanes to inspection UI instead of the gameplay loop。
  - renders raw/filtered landmark overlays、side world-landmark readout、timestamp pairing monitor、trigger phase、named threshold sliders。
- Neither page imports the other.
- Both pages share feature modules through explicit lane contracts and telemetry payloads.
### Directory Boundaries
- `index.html`
  - game entry point for production-clean play flow.
  - no diagnostic workbench UI.
- `diagnostic.html`
  - diagnostic workbench entry point for lane observation and tuning.
  - no gameplay scoring loop.
- `src/features/camera/`
  - camera permission、device enumeration、deviceId-pinned capture、track stop/restart、video attachment
- `src/features/hand-tracking/`
  - MediaPipe adapter、raw/filtered `HandDetection` production、tracker lifecycle
  - no aim semantics、no trigger semantics
- `src/features/front-aim/`
  - front detection to aim mapping、aim smoothing、front calibration、front telemetry
  - no trigger phase、no shot decision
- `src/features/side-trigger/`
  - side trigger evidence、trigger state machine、dwell/cooldown accounting、side telemetry
  - no crosshair coordinate
- `src/features/input-fusion/`
  - timestamp buffers、nearest-timestamp pairing、degrade policy、fusion telemetry
  - no landmark math、no browser capture
- `src/features/gameplay/`
  - balloons、score、combo、timer、difficulty、hit detection
  - consumes only `FusedGameInputFrame`
- `src/features/rendering/`
  - Canvas 2D drawing、video background、game HUD drawing
  - no input inference
- `src/features/diagnostic-workbench/`
  - diagnostic workbench UI、per-lane telemetry display、tuning controls、calibration status
  - descriptive name because v2 diagnostics are a dedicated page, not an in-game debug layer
  - observes lanes but does not own lane correctness
- `src/shared/types/`
  - lane input/output contracts and shared discriminated unions
### Directional Dependencies
- `camera` depends on browser APIs only.
- `hand-tracking` depends on camera frames and MediaPipe only.
- `front-aim` depends on front `HandDetection` and shared math/types.
- `side-trigger` depends on side `HandDetection` and shared math/types.
- `input-fusion` depends on `AimInputFrame` and `TriggerInputFrame`.
- `gameplay` depends only on `FusedGameInputFrame`.
- `diagnostic-workbench` may read telemetry and detection payloads from all lanes, but lanes must not depend on `diagnostic-workbench`.
- `index.html` may wire gameplay and lane modules, but must not depend on `diagnostic.html` or `diagnostic-workbench`.
- `diagnostic.html` may wire lane modules and diagnostic UI, but must not depend on `index.html` or gameplay screens.
- `app` wires screens and lifecycle; it must stay thin.
### Invariants
- `front-aim` must not import from `side-trigger`.
- `side-trigger` must not import from `front-aim`.
- `gameplay` must not import from `camera`, `hand-tracking`, `front-aim`, or `side-trigger`.
- gameplay page code must not import from `src/features/diagnostic-workbench/`.
- `input-fusion` must not inspect MediaPipe landmarks.
- diagnostic workbench must not create a separate detection schema.
- Every lane payload crossing a module boundary carries timestamp metadata.
- Unavailable states are explicit union values, not inferred from missing optional fields.
- A side trigger edge can be consumed into at most one gameplay shot.
---
## 3. Shared Type Contracts
### Naming Principle
- Camera-role detection types include role: `FrontHandDetection`, `SideHandDetection`.
- Lane semantic output types describe gameplay meaning: `AimInputFrame`, `TriggerInputFrame`.
- The gameplay-facing final input is `FusedGameInputFrame`.
- `Detection` means tracker-derived landmark evidence.
- `Frame` means a lane output at one observed time.
### Reused v1 Types
- Reuse `HandFrame` for landmark payload shape because it already carries image dimensions, handedness, normalized landmarks, and optional world landmarks (`src/shared/types/hand.ts:30`).
- Reuse `HandDetection` semantics as the inner tracker payload because it separates raw and filtered frames (`src/shared/types/hand.ts:49`).
- Do not reuse v1 `GameInputFrame` as-is because it combines aim, trigger, shot, and runtime in a single-camera mapper (`src/features/input-mapping/mapHandToGameInput.ts:22`).
### Supporting Types
- `CameraLaneRole`
  - values: `frontAim`, `sideTrigger`
  - reason: logs, telemetry, and errors must identify which physical role failed.
- `TimestampSource`
  - values: `requestVideoFrameCallbackCaptureTime`, `requestVideoFrameCallbackExpectedDisplayTime`, `performanceNowAtCallback`
  - reason: fusion confidence depends on timestamp provenance.
- `LaneHealthStatus`
  - values: `notStarted`, `waitingForPermission`, `waitingForDeviceSelection`, `capturing`, `tracking`, `stalled`, `captureLost`, `failed`
  - reason: diagnostic workbench and degrade policy need explicit lane state.
- `FrameTimestamp`
  - `frameTimestampMs`: monotonic timestamp used for fusion; milliseconds.
  - `timestampSource`: source used to compute `frameTimestampMs`.
  - `presentedFrames`: browser frame counter when available; count.
  - `receivedAtPerformanceMs`: callback receipt time; milliseconds.
  - reason: pairing and diagnostics need the same timestamp vocabulary.
### `FrontHandDetection`
- `laneRole`: fixed `frontAim`; prevents side detection misuse.
- `deviceId`: opaque browser camera id; confirms deviceId-pinned capture.
- `streamId`: active MediaStream identity; distinguishes old/new streams during re-selection.
- `timestamp`: `FrameTimestamp`; used for fusion.
- `rawFrame`: `HandFrame`; unfiltered landmarks for diagnostics.
- `filteredFrame`: `HandFrame`; smoothed landmarks for aim mapping.
- `handPresenceConfidence`: `0..1`; front tracking reliability.
- `trackingQuality`: `good`, `uncertain`, `lost`; explicit aim usability.
### `SideHandDetection`
- `laneRole`: fixed `sideTrigger`; prevents front detection misuse.
- `deviceId`: opaque browser camera id; confirms deviceId-pinned capture.
- `streamId`: active MediaStream identity; distinguishes old/new streams during re-selection.
- `timestamp`: `FrameTimestamp`; used for fusion.
- `rawFrame`: `HandFrame`; preferred for fast trigger evidence.
- `filteredFrame`: `HandFrame`; useful for stable posture and diagnostic overlay comparison.
- `handPresenceConfidence`: `0..1`; side tracking reliability.
- `sideViewQuality`: `good`, `frontLike`, `tooOccluded`, `lost`; separates camera-angle failure from threshold failure.
### `AimInputFrame`
- `laneRole`: fixed `frontAim`; fusion validates source role.
- `timestamp`: `FrameTimestamp`; pairable with trigger frame.
- `aimAvailability`: `available`, `estimatedFromRecentFrame`, `unavailable`; distinguishes live and degraded aim.
- `aimPointViewport`: `{ x, y }` in CSS pixels, clamped to gameplay viewport.
- `aimPointNormalized`: `x: 0..1`, `y: 0..1`; resolution-independent diagnostics and future layout support.
- `aimSmoothingState`: `coldStart`, `tracking`, `recoveringAfterLoss`; explains lag or snap behavior.
- `frontHandDetected`: boolean; hand presence is not inferred from aim absence.
- `frontTrackingConfidence`: `0..1`; contributes to fused confidence.
- `sourceFrameSize`: `{ width, height }` in pixels; explains projection.
### `TriggerInputFrame`
- `laneRole`: fixed `sideTrigger`; fusion validates source role.
- `timestamp`: `FrameTimestamp`; pairable with aim frame.
- `triggerAvailability`: `available`, `holdingPreviousState`, `unavailable`; describes whether side trigger can be trusted.
- `sideTriggerPhase`: named phase from section 6.
- `triggerEdge`: `none`, `pullStarted`, `shotCommitted`, `releaseConfirmed`.
- `triggerPulled`: boolean; held state separate from edge event.
- `shotCandidateConfidence`: `0..1`; tuning scalar separate from phase.
- `sideHandDetected`: boolean; hand loss is not release.
- `sideViewQuality`: `good`, `frontLike`, `tooOccluded`, `lost`.
- `dwellFrameCounts`: named frame counters for pull/release dwell and cooldown.
### `FusedGameInputFrame`
- `fusionTimestampMs`: fused input time; milliseconds.
- `fusionMode`: `pairedFrontAndSide`, `frontOnlyAim`, `sideOnlyTriggerDiagnostic`, `noUsableInput`.
- `timeDeltaBetweenLanesMs`: absolute timestamp gap; milliseconds; present only for paired frames.
- `aim`: available aim point or explicit unavailable state.
- `trigger`: committed shot edge plus trigger availability.
- `shotFired`: one-frame gameplay edge.
- `inputConfidence`: `0..1`; combined input reliability.
- `frontSource`: source frame summary or missing reason.
- `sideSource`: source frame summary or missing reason.
- `fusionRejectReason`: `none`, `frontMissing`, `sideMissing`, `timestampGapTooLarge`, `frontStale`, `sideStale`, `laneFailed`.
### Diagnostic Workbench Type Boundary
- The diagnostic workbench does not require new shared types.
- It consumes existing detection types, lane semantic frames, and telemetry payloads.
- It renders `FrontHandDetection` and `SideHandDetection` raw/filtered landmark data directly.
- It renders optional world landmarks from the reused `HandFrame` payload; absence is shown as unavailable, not converted into another format.
- It renders `AimInputFrame`, `TriggerInputFrame`, `FusedGameInputFrame`, and per-lane telemetry without mutating them.
- It must not introduce a workbench-only detection format or adapter that gameplay could accidentally consume.
---
## 4. Capture / Permission / Device-Selection UX
### Game Page Screen Flow
1. `CameraPermissionScreen`
2. `CameraDeviceSelectionScreen`
3. `CameraRoleConfirmationScreen`
4. `TwoCameraPreviewScreen`
5. `CalibrationAndStartScreen`
6. `CountdownScreen`
7. `PlayScreen`
8. `ResultScreen`
### Required Ordering
- Permission comes before `enumerateDevices()`.
- Reason: browsers may hide or degrade device labels before permission.
- Device labels are necessary for humans to assign front and side roles.
- After permission, enumerate video input devices and show labels when available.
- The user must assign distinct devices to `frontAim` and `sideTrigger` for full two-camera gameplay.
- Confirmation opens both streams and shows live previews side-by-side before calibration.
### Selection Rules
- Full gameplay requires two distinct video input devices.
- The same `deviceId` must not be assigned to both roles.
- Role confirmation must allow swap because labels can be unclear.
- Re-selection must be available before play and from the diagnostic workbench during setup.
- Re-selection stops the affected stream, clears that lane’s timestamp buffer, and resets that lane’s runtime state.
### Permission Denial
- State: `cameraPermissionDenied`.
- Full gameplay is disabled.
- Device selection is not shown.
- Error text must include cause, impact, reproduction, and next action:
  - cause: browser camera permission was denied.
  - impact: front and side capture cannot start.
  - reproduction: reload and deny camera permission.
  - next action: allow camera permission in browser site settings and retry.
### One Device Only
- State: `singleCameraAvailable`.
- Full two-camera gameplay is disabled.
- Front-only aim diagnosis may run on the diagnostic workbench.
- Side trigger diagnosis is unavailable.
- The UI must state that one camera cannot validate the v2 trigger design.
- The app must not reuse one camera as both front and side lanes.
### `OverconstrainedError`
- State: `cameraConstraintFailed`.
- Cause: selected capture constraints are unsupported by the device.
- Impact: affected lane cannot start capture.
- Reproduction: choose the same camera with current settings.
- Next action: re-select a camera or retry with default PoC constraints.
- Defaults should avoid exact width, height, frame rate, or facing mode constraints unless the user explicitly selected a device.
- Failure is lane-scoped; the other lane remains observable.
### Re-Selection Mid-Session
- Re-selection pauses gameplay input consumption.
- Affected stream is stopped before a replacement stream starts.
- Front re-selection resets aim smoothing and front calibration status.
- Side re-selection resets trigger phase and side calibration status.
- Fusion emits lane restarting/failure status until fresh timestamped frames arrive.
- The app never silently switches to another camera.
---
## 5. Timestamp Handling and Fusion
### Timestamp Production
- Each capture lane owns a video element and schedules `requestVideoFrameCallback`.
- The callback records frame timing before tracking starts.
- Tracking output is associated with the timing record of the analyzed video frame.
- Mapping output copies the same timestamp into `AimInputFrame` or `TriggerInputFrame`.
- Callback order across cameras is not synchronization.
### Timestamp Source Policy
- Preferred source: `requestVideoFrameCallback` capture time.
- Degraded source: expected display time when capture time is unavailable.
- Lowest-confidence source: callback receipt time.
- The chosen value is written to `frameTimestampMs`.
- The selected source is always carried as `timestampSource`.
- Fusion confidence is lower for degraded timestamp sources.
### Buffers
- Fusion owns `frontAimFrameBuffer` and `sideTriggerFrameBuffer`.
- Buffers are keyed by `frameTimestampMs`.
- Buffers retain frames inside `FUSION_RECENT_FRAME_RETENTION_WINDOW_MS`.
- Lane restart clears only that lane’s buffer.
- Fusion does not mutate lane frames after buffering.
### Pairing Policy
- On each new aim or trigger frame, fusion searches the opposite buffer for the nearest timestamp.
- A pair is accepted only when absolute delta is within `FUSION_MAX_PAIR_DELTA_MS`.
- `FUSION_MAX_PAIR_DELTA_MS` is a named tuning constant; live trials decide its value.
- If candidates tie, the newest pair wins.
- In `pairedFrontAndSide`, a `shotCommitted` edge is consumed once and cannot produce repeated `shotFired` events.
### Degrade Policy
- `pairedFrontAndSide`
  - front aim and side trigger are both available.
  - timestamp delta is within `FUSION_MAX_PAIR_DELTA_MS`.
  - `shotFired` can be true only in this mode.
- `frontOnlyAim`
  - front aim is available; side trigger is missing, stale, failed, or too far away.
  - crosshair may continue moving.
  - full scoring shots are disabled by default.
  - purpose is aim tuning and front capture diagnosis.
- `sideOnlyTriggerDiagnostic`
  - side trigger is available; front aim is missing, stale, failed, or too far away.
  - trigger phases and edges remain visible in diagnostic workbench telemetry.
  - `shotCommitted` is not consumed as a gameplay edge in this mode.
  - no gameplay shot is fired because aim is unavailable.
- `noUsableInput`
  - neither lane has usable input.
  - crosshair is hidden or explicitly unavailable.
  - shot events are not emitted.
### Staleness
- A frame is stale when its age exceeds `FUSION_MAX_FRAME_AGE_MS`.
- Stale front frames cannot drive live aim in full gameplay.
- Stale side frames cannot emit shots.
- Staleness compares one lane frame to current fusion time.
- Pair delta compares two lane frames to each other.
### Fusion Invariants
- No side-only frame may fabricate aim.
- No front-only frame may fabricate trigger.
- Missing data is represented by explicit status and reject reason.
- Pairing uses selected frame timestamps, not callback receipt order.
- Fusion remains unit-testable with synthetic timestamped frame sequences.
---
## 6. Side Trigger State Machine
### Scope
- The state machine lives in `src/features/side-trigger/`.
- It consumes side-view hand evidence and side hand presence.
- It emits `TriggerInputFrame`.
- It does not know front aim, balloons, score, combo, or hit detection.
### Phases
- `SideTriggerNoHand`
  - no usable side hand is detected.
  - pull/release candidates are cleared.
- `SideTriggerPoseSearching`
  - a hand is visible, but side-view posture is not suitable yet.
  - no trigger edge can be emitted.
- `SideTriggerOpenReady`
  - side-view quality is acceptable.
  - trigger is released and ready for a pull candidate.
- `SideTriggerPullCandidate`
  - pull evidence crossed the enter threshold.
  - pull dwell is accumulating.
  - no shot is emitted yet.
- `SideTriggerPulledLatched`
  - pull dwell completed.
  - `shotCommitted` emitted once on entry.
  - held trigger does not repeat.
- `SideTriggerReleaseCandidate`
  - release evidence crossed the enter threshold.
  - release dwell is accumulating.
  - not re-armed yet.
- `SideTriggerCooldown`
  - release has been confirmed, but shot cooldown is active.
  - prevents rapid double-fire from jitter.
- `SideTriggerRecoveringAfterLoss`
  - tracking was briefly lost.
  - reacquisition within grace may return to the previous stable phase.
### Inputs
- `sideHandDetected`: boolean hand presence.
- `sideViewQuality`: `good`, `frontLike`, `tooOccluded`, `lost`.
- `pullEvidenceScalar`: normalized pull evidence.
- `releaseEvidenceScalar`: normalized release evidence.
- `triggerPostureConfidence`: normalized confidence.
- `frameTimestampMs`: timestamp for dwell/cooldown accounting.
- `previousPhase`: current phase before transition.
### Named Constants
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
Empirical live trials decide numeric values. Names are fixed early so telemetry, config, and tests speak the same language.
### Transition Rules
- Any phase -> `SideTriggerRecoveringAfterLoss` when hand disappears but grace remains.
- Any phase -> `SideTriggerNoHand` when hand loss exceeds `SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES`.
- `SideTriggerNoHand` -> `SideTriggerPoseSearching` when side hand appears.
- `SideTriggerPoseSearching` -> `SideTriggerOpenReady` after stable acceptable side-view posture.
- `SideTriggerOpenReady` -> `SideTriggerPullCandidate` when pull evidence crosses enter threshold.
- `SideTriggerPullCandidate` -> `SideTriggerOpenReady` when pull evidence falls below exit threshold before dwell completes.
- `SideTriggerPullCandidate` -> `SideTriggerPulledLatched` when pull dwell completes and confidence is sufficient.
- `SideTriggerPulledLatched` -> `SideTriggerReleaseCandidate` when release evidence crosses enter threshold.
- `SideTriggerReleaseCandidate` -> `SideTriggerPulledLatched` when release evidence falls below exit threshold before dwell completes.
- `SideTriggerReleaseCandidate` -> `SideTriggerCooldown` when release dwell completes.
- `SideTriggerCooldown` -> `SideTriggerOpenReady` when cooldown completes and side-view quality remains acceptable.
- `SideTriggerRecoveringAfterLoss` -> previous stable phase when reacquired within grace and evidence is consistent.
### Edge Invariants
- `pullStarted` is diagnostic by default.
- `shotCommitted` is emitted exactly once on entry to `SideTriggerPulledLatched`.
- `releaseConfirmed` re-arms future shots after cooldown.
- Loss of hand is not treated as release.
- Pull and release use separate thresholds.
- Dwell counters reset when evidence exits candidate range.
- Side-view quality failure prevents shot commit even when scalar evidence is high.
---
## 7. Per-Lane Telemetry & Diagnostic Workbench Surface
### Diagnostic Workbench Contract
- The diagnostic workbench UI lives under `src/features/diagnostic-workbench/`.
- The workbench is reached through `diagnostic.html`, not through `index.html`.
- The game page never renders workbench UI, landmark overlays, threshold sliders, timestamp inspectors, or trigger evidence panels.
- Lane modules provide telemetry payloads and detection payloads.
- Per-lane telemetry channels are the data interface the workbench consumes.
- The workbench renders telemetry, raw/filtered landmarks, optional world landmarks, and named tuning controls.
- The workbench does not own lane state and does not introduce its own detection format.
- Telemetry is not sent outside the browser.
- Raw full `deviceId` values are not displayed; labels or short hashes are used.
### Development Workflow
- During PoC development, live threshold tuning happens on `diagnostic.html`.
- Implementers should build the workbench path first when it makes threshold or timestamp work easier to validate with real hands.
- `index.html` is opened only to verify the integrated production-clean play experience.
- Threshold values promoted from workbench trials become named constants or configuration values in the lane modules, not workbench-only behavior.
### Workbench Observation Surfaces
- `Camera Feeds`: front and side live video feeds with lane labels and health.
- `Landmark Overlay`: raw and filtered 2D landmark overlays for front and side lanes, drawn only in the workbench.
- `World Landmark Readout`: optional 3D/world landmark display, especially for the side lane; unavailable source data is shown explicitly.
- `Timestamp Pairing`: latest front/side frame timestamps、delta、source、buffer ages、reject reason.
- `Trigger Evidence`: side trigger phase、pull/release evidence、dwell、cooldown、edge emission.
- `Threshold Tuning`: named sliders for front smoothing、side trigger thresholds、dwell constants、fusion timing constants.
### `frontAimTelemetry`
- `front.capture.healthStatus`
- `front.capture.deviceLabel`
- `front.capture.deviceIdHash`
- `front.capture.frameWidth`
- `front.capture.frameHeight`
- `front.capture.presentedFrames`
- `front.capture.timestampSource`
- `front.tracking.handDetected`
- `front.tracking.handPresenceConfidence`
- `front.tracking.trackingQuality`
- `front.mapping.aimAvailability`
- `front.mapping.aimPointViewport`
- `front.mapping.aimPointNormalized`
- `front.mapping.smoothingState`
- `front.mapping.calibrationStatus`
- `front.mapping.lastLostReason`
Purpose: camera failure、tracking failure、aim smoothing、front calibration、crosshair disappearance を切り分ける。
### `sideTriggerTelemetry`
- `side.capture.healthStatus`
- `side.capture.deviceLabel`
- `side.capture.deviceIdHash`
- `side.capture.presentedFrames`
- `side.capture.timestampSource`
- `side.tracking.handDetected`
- `side.tracking.handPresenceConfidence`
- `side.tracking.sideViewQuality`
- `side.trigger.phase`
- `side.trigger.triggerEdge`
- `side.trigger.triggerPulled`
- `side.trigger.pullEvidenceScalar`
- `side.trigger.releaseEvidenceScalar`
- `side.trigger.shotCandidateConfidence`
- `side.trigger.dwellFrameCounts`
- `side.trigger.cooldownFramesRemaining`
- `side.trigger.calibrationStatus`
- `side.trigger.lastRejectReason`
Purpose: threshold、dwell、cooldown、side-view quality、shot edge emission を切り分ける。
### `fusionTelemetry`
- `fusion.mode`
- `fusion.timeDeltaBetweenLanesMs`
- `fusion.maxPairDeltaMs`
- `fusion.frontBufferFrameCount`
- `fusion.sideBufferFrameCount`
- `fusion.frontLatestAgeMs`
- `fusion.sideLatestAgeMs`
- `fusion.inputConfidence`
- `fusion.shotFired`
- `fusion.rejectReason`
- `fusion.lastPairedFrontTimestampMs`
- `fusion.lastPairedSideTimestampMs`
- `fusion.timestampSourceSummary`
Purpose: lane failureとfusion failure、timestamp gap、buffer staleness、shot edge consumption を切り分ける。
### Workbench Sections
- `Camera Setup`: selected labels、lane health、swap/re-select。
- `Front Aim`: front preview、raw/filtered landmark overlay、aim point、smoothing、calibration、tracking status。
- `Side Trigger`: side preview、raw/filtered landmark overlay、world-landmark readout、phase、pull/release evidence、dwell、cooldown、reject reason。
- `Fusion`: mode、timestamp delta、buffer ages、shot fired、reject reason。
- `Tuning`: front smoothing、side trigger thresholds、dwell constants、fusion timing constants。
---
## 8. Test Strategy
### Front Aim Unit Tests
- front landmarks to viewport projection.
- viewport clamping.
- normalized aim point calculation.
- smoothing state transitions.
- lost-hand aim availability.
- front calibration transform.
- front telemetry assembly.
- Inputs are synthetic `FrontHandDetection`, `HandFrame`, viewport size, and timestamp metadata.
### Side Trigger Unit Tests
- side-view quality classification.
- pull/release evidence scalar calculation.
- phase transitions from `SideTriggerOpenReady` through pull, latch, release, cooldown.
- single `shotCommitted` edge on latch entry.
- loss grace and hard reset.
- confidence rejection.
- side telemetry assembly.
- Inputs are synthetic `SideHandDetection` and deterministic frame/timestamp sequences.
### Fusion Unit Tests
- nearest timestamp pairing.
- rejection when delta exceeds `FUSION_MAX_PAIR_DELTA_MS`.
- stale front and stale side rejection.
- front-only degrade.
- side-only diagnostic degrade.
- neither-lane degrade.
- single consumption of `shotCommitted`.
- fusion telemetry assembly.
- Inputs are synthetic `AimInputFrame` and `TriggerInputFrame`.
### Gameplay Boundary Tests
- gameplay consumes only `FusedGameInputFrame`.
- game page entry does not import `src/features/diagnostic-workbench/`.
- aim unavailable does not create hidden aim.
- `shotFired` edge triggers one hit-test pass.
- held trigger does not fire repeatedly.
- front-only diagnostic does not create scoring shots.
- no-usable-input pauses input consumption.
- Import-boundary guard starts as a plan-level reviewer convention and can become a lint rule once the repo has import boundary tooling.
### Diagnostic Workbench Unit Tests
- workbench renders camera health and selected labels from sample telemetry payloads.
- workbench renders frame counters、timestamp source、latest frame age、and timestamp deltas from sample telemetry payloads.
- workbench renders raw and filtered landmark overlays from sample `FrontHandDetection` and `SideHandDetection`.
- workbench renders side world-landmark readout when `HandFrame` world landmarks exist.
- workbench renders explicit unavailable state when world landmarks are absent.
- workbench renders trigger phase、pull/release evidence、dwell、cooldown、and trigger edge from sample side telemetry.
- workbench renders named threshold sliders without inventing workbench-only threshold names.
- workbench tests verify rendering only; lane correctness remains covered by lane unit tests.
### Integration Seams
- fake camera source producing frame timing events.
- fake hand tracker returning scripted front and side detections.
- app flow from permission to selection to preview.
- fusion wiring from two scripted lane streams to gameplay input.
- diagnostic workbench rendering from sample telemetry payloads.
- game page import boundary against workbench-only modules.
- re-selection clearing affected lane buffers.
### Live Camera Trial Only
- physical device pairing usability.
- actual side camera angle quality.
- trigger threshold values.
- dwell/cooldown values.
- fusion delta tolerance.
- frame stall behavior across real cameras.
- child hand size and posture variability.
- lighting/background effects.
- perceived latency and fairness.
### Future Verification Commands
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e` when browser flow is touched
These are blocking checks once implementation exists.
---
## 9. Incremental Milestones
### M1: Two Entry Points and Two Live Camera Feeds
- Demo: `index.html` opens the clean game setup flow; `diagnostic.html` opens the 診断ワークベンチ with front/side selection、two live previews、swap/re-select。
- Outcome: game page and diagnostic workbench are independent Vite entries, and two deviceId-pinned streams are visible on the workbench.
- Boundary: no MediaPipe, no gameplay scoring; neither page imports the other.
### M2: Timestamped Diagnostic Capture
- Demo: diagnostic workbench shows both feeds with frame counters、timestamp source、latest frame age、stall status。
- Outcome: each lane produces `FrameTimestamp` and capture telemetry for the workbench.
- Boundary: no hand tracking requirement; fusion can already be tested with synthetic frame timing.
### M3: Diagnostic Workbench Landmark Inspection
- Demo: diagnostic workbench shows two camera feeds with raw/filtered landmark overlays and timestamp readout.
- Outcome: `FrontHandDetection` and `SideHandDetection` are visible through the workbench without creating new detection formats.
- Boundary: no trigger FSM tuning、no gameplay fusion、no gameplay canvas overlays.
### M4: Side World-Landmark and Trigger Evidence Workbench
- Demo: diagnostic workbench shows side world-landmark readout, trigger phase, pull/release evidence, dwell, cooldown, and `shotCommitted` evidence.
- Outcome: `SideHandDetection` to `TriggerInputFrame` path exists, and named threshold sliders are available for live hand tuning.
- Boundary: no balloon hit detection, no trigger-to-aim pairing in gameplay.
### M5: Front Aim Workbench and Clean Game Crosshair
- Demo: diagnostic workbench shows front aim mapping telemetry while the game page can show the production crosshair without landmark overlays.
- Outcome: `FrontHandDetection` to `AimInputFrame` path exists and game rendering stays production-clean.
- Boundary: no side-triggered shots in gameplay, no workbench import from game page.
### M6: Fusion Pairing in Diagnostic Workbench
- Demo: diagnostic workbench shows fused mode、timestamp delta、buffer ages、shot edge consumption、reject reason。
- Outcome: `AimInputFrame` and `TriggerInputFrame` buffers produce `FusedGameInputFrame`, with threshold values tuned on the workbench before gameplay wiring depends on them.
- Boundary: balloons and score are not required; fusion inspection does not render on the game canvas.
### M7: Minimal Balloon Gameplay with Fused Input
- Demo: `index.html` shows 60-second play screen, balloons, front crosshair, side-triggered shots, score/time HUD, countdown, and result screen.
- Outcome: gameplay reads only `FusedGameInputFrame` and remains free of diagnostic overlays/sliders/wireframes.
- Boundary: full gameplay requires two usable lanes; diagnostic workbench remains available on `diagnostic.html`.
### M8: Calibration and Tuning Pass
- Demo: diagnostic workbench shows front center/corner calibration and side open/pulled calibration affecting live telemetry; game page verifies the integrated result afterward.
- Outcome: calibration state is per lane and named constants are exposed for live tuning in the workbench.
- Boundary: calibration is session-only unless a later spec approves persistence.
### M9: Live Trial Hardening
- Demo: device unplug/replug or track end is visible; re-selection works; degrade remains explicit.
- Outcome: real camera trial feedback can feed the next spec.
- Boundary: no expansion into stereo, extra sensors, or one-camera pseudo side mode.
---
## 10. Risks & Open Questions
### Threshold Risk
- Pull/release thresholds are known-unknown values.
- Side-view angle, hand size, lighting, and camera focal length affect them.
- Mitigation: named thresholds, telemetry, diagnostic workbench milestone before gameplay.
- Next spec needs live false-positive and false-negative examples.
### Latency Risk
- Two camera streams may deliver frames at different rates.
- MediaPipe inference may add uneven delay per lane.
- `requestVideoFrameCallback` is best-effort, not deterministic hardware sync.
- Mitigation: timestamp buffers, visible deltas, explicit `FUSION_MAX_PAIR_DELTA_MS`.
- Next spec needs measured delta distribution on ordinary laptops.
### Device Pairing Risk
- Users may choose wrong front/side devices.
- Browser labels may remain unclear.
- External webcams may appear/disappear mid-session.
- Mitigation: live confirmation, swap, re-selection, per-lane labels.
- Next spec needs observed setup friction.
### `OverconstrainedError` Risk
- Exact constraints can fail on common laptop or USB cameras.
- Mitigation: conservative defaults and lane-scoped constraint failure UI.
- Next spec should decide capture presets after real device trials.
### Side-View Quality Risk
- Side camera may not actually see a side profile.
- Mitigation: first-class `sideViewQuality` and diagnostic workbench milestone.
- Next spec needs examples of acceptable and unacceptable side placement.
### Fusion Fairness Risk
- A side trigger edge may pair with an aim point that feels too early or too late.
- Mitigation: reject large timestamp gaps and show the delta.
- Next spec needs playtest evidence for fair-feeling delta.
### Performance Risk
- Two Hand Landmarker lanes may be heavy.
- Mitigation: lane contracts stay separate so inference cadence can be tuned without collapsing architecture.
- Next spec needs measurements for simultaneous vs serialized tracking.
### Gameplay Policy Open Question
- Front-only aim diagnosis is useful on the workbench but does not validate v2 firing.
- Default policy: full scoring shots require paired front and side input.
- Next spec must decide whether aim-only training is a supported mode or workbench-only diagnostic.
### Calibration Scope Open Question
- Session-only calibration is sufficient for first PoC.
- Persistent calibration may help repeated daycare setup but adds storage and invalidation concerns.
- Next spec should decide persistence after live setup data exists.
### What Blocks the Next Spec
- measured front/side timestamp delta distribution.
- measured trigger false-positive and false-negative examples.
- observed two-camera setup success rate.
- accepted default values for trigger and fusion constants.
- minimum workbench fields needed for field tuning.
- whether two simultaneous Hand Landmarker instances are acceptable on target laptops.
