# M9: Live Trial Hardening 実装粒度タスク分解

## 1. Pre-flight checks

M9 は M8 完了後の `main` から開始する。開始前に次を確認する。

- `git rev-parse HEAD` が post-M7 `1fa082a` 以降、かつ M8 が merge 済みであること。今回確認時点の HEAD は `1fa082a54ebc90f982f5c66bc705a43a4abd1c14`。
- `gh issue view 9` が `M9: Live Trial Hardening` を指し、目的が「device 抜き差し / track 終了の可視化、再選択、degrade 明示」であること。
- `src/shared/types/camera.ts` の実際の `LaneHealthStatus` は次の 8 variants:
  - `notStarted`
  - `waitingForPermission`
  - `waitingForDeviceSelection`
  - `capturing`
  - `tracking`
  - `stalled`
  - `captureLost`
  - `failed`
- `src/features/input-fusion/createInputFusionMapper.ts` は既に `failed | stalled | captureLost` を `laneFailed` として扱う。M9 はこの contract を壊さず、`captureLost` に入った瞬間に `updateAimUnavailable()` / `updateTriggerUnavailable()` で stale buffer を掃除する。
- 現状 `src/` に `onended` / `devicechange` handler は実装されていない。M9 は `MediaStreamTrack` の `ended` event と `navigator.mediaDevices.devicechange` を初めて配線する。
- `src/features/camera/createDevicePinnedStream.ts` は `DevicePinnedStream` と `stop()` だけを返す。M9 では track ended listener を attach/detach できるよう、stream から tracks を読む helper を camera feature に置く。
- `src/features/diagnostic-workbench/DiagnosticWorkbench.ts` は `requestGeneration` / `openGeneration` で async race を抑制している。M9 の device refresh / reselect はこの generation guard を再利用する。
- `src/features/diagnostic-workbench/liveLandmarkInspection.ts` は lane health を持つが、track ended を検知しない。M9 では lane-local cleanup、fusion unavailable update、health `captureLost` をここに追加する。
- `src/app/balloonGameRuntime.ts` は M7 R3 で round-3 lane resource release を持ち、`MAX_CONSECUTIVE_FRAME_ERRORS` 到達時に該当 lane の stream/tracker を解放する。M9 は track ended でも同じ lesson を再利用する。
- `src/app/balloonGameRuntime.ts` の HUD degrade message は `fusionRejectReason === "laneFailed"` に対して現在 `"カメラが失敗しました。リトライしてください"` を表示する。M9 では source lane health が `captureLost` の場合だけ `"カメラが切断されました"` を優先表示する。
- `src/app/balloonGamePage.ts` は start 前の device dropdown を持つが、running 中の devicechange / reselect UX はない。M9 は production-clean な再選択経路だけ追加する。
- M8 coordination check:
  - この作業ツリーでは `claude/m8-followup` ローカル branch は存在するが、tracked `src/tests/docs` diff は `1fa082a..claude/m8-followup` で空。
  - `origin/claude/m8-followup` はこの checkout では存在しなかった。
  - `docs/superpowers/plans/2026-04-18-m8-implementation-decomposition.md` は未追跡ファイルとして存在する。
- M8 contradiction to resolve before implementation:
  - M8 decomposition says workbench reselect resets calibration to defaults.
  - M9 request says reconnecting the same lane should not reset session-scoped calibration.
  - M9 implementation should not start until post-M8 `main` confirms the final calibration policy. Recommended M9 policy: preserve calibration across same-lane reconnect/reselect within the session; reset only on explicit calibration reset or role swap if the lane role changes.

## 2. Numbered implementation steps

### 1. Add a camera-track ended observer helper

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/camera/observeTrackEnded.ts`
- Modify: `src/features/camera/AGENTS.md` only if a narrower lifecycle note is needed; likely no change.
- Add tests: `tests/unit/features/camera/observeTrackEnded.test.ts`

**Implementation notes**

- Add a small camera-feature helper, not a new architecture layer.
- API shape:
  - `observeTrackEnded(stream, callback): { stop(): void }`
  - attach to every `video` track from `stream.getVideoTracks()` when present; fallback to `stream.getTracks().filter(track.kind === "video")`.
  - use `addEventListener("ended", handler)` / `removeEventListener("ended", handler)` instead of overwriting `track.onended`, so retry/reselect cannot clobber another listener.
  - callback receives a compact payload:
    - `trackId`
    - `readyState`
    - optional `label`
- Make `stop()` idempotent.
- Do not call `MediaStreamTrack.stop()` from this helper. It observes only.

**Test plan**

- Unit: fake `MediaStreamTrack` fires `ended` and invokes callback once.
- Unit: `stop()` removes listeners and prevents later callback.
- Unit: repeated `stop()` is safe.
- Unit: multiple video tracks attach and detach independently.
- Unit: non-video tracks are ignored.
- Use key/value assertions for payload fields, not broad snapshot equality.

**Dependencies on M3-M8 contracts**

- M3/M7 stream lifecycle: stream ownership remains with workbench/runtime callers.
- M6/M7 cleanup lesson: helper only reports track end; lane owner performs tracker/stream release.
- M8: no calibration dependency.

### 2. Convert track end into lane-local `captureLost` in the diagnostic live inspection

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Modify tests: `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

**Implementation notes**

- Extend `LaneTrackingOptions` with the active `MediaStream`.
- In `startLaneTracking()`, call `observeTrackEnded(options.stream, onTrackEnded)`.
- On track end:
  - guard with the existing `stopped` flag;
  - set lane health to `captureLost`;
  - cancel pending `requestVideoFrameCallback` / timeout;
  - cleanup the lane tracker exactly once;
  - clear lane detection/frame/telemetry snapshots for the affected lane;
  - call `inputFusionMapper.updateAimUnavailable()` or `updateTriggerUnavailable()` with a fresh synthetic timestamp from `performance.now()`;
  - keep the other lane running.
- Do not leave `frontDetection` or `sideDetection` from the dead stream visible.
- Do not reset side trigger tuning or fusion tuning.
- If M8 is merged, do not reset same-lane calibration on track end.

**Test plan**

- Unit: fake front stream track ending sets `frontLaneHealth` to `captureLost`.
- Unit: front track end clears front detection/aim telemetry and produces a fusion frame whose `frontSource.laneHealth` is `captureLost`.
- Unit: side track end clears side trigger frame/telemetry, resets shot consumption via `updateTriggerUnavailable()`, and leaves front aim available if fresh.
- Unit: tracker cleanup and video-frame callback cancellation happen once.
- Unit: track end after `destroy()` is ignored.
- Unit: retry/reselect after capture loss does not reuse stale snapshots.
- Use fake `MediaStreamTrack` rather than trying to trigger real browser unplug behavior.

**Dependencies on M3-M8 contracts**

- M3: `liveLandmarkInspection.ts` owns per-frame tracker lifecycle.
- M4: side trigger loss must not synthesize release or shot.
- M5: front loss must go through unavailable aim semantics.
- M6: use `updateAimUnavailable()` / `updateTriggerUnavailable()` to clear fusion buffers.
- M8: preserve session-scoped calibration if final M8 policy says same-lane reconnect preserves it.

### 3. Convert track end into lane-local `captureLost` in game runtime

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/app/balloonGameRuntime.ts`
- Modify tests: `tests/integration/balloonGameRuntime.test.ts`

**Implementation notes**

- After `openStream(deviceId)` succeeds in `startLane()`, attach `observeTrackEnded(stream.stream, onTrackEnded)`.
- Treat track end as a lane failure caused by capture loss, not a tracker failure:
  - set the affected `frontLaneHealth` / `sideLaneHealth` to `captureLost`;
  - call `updateUnavailable(timestamp)` immediately;
  - call the existing lane resource release path;
  - remove that lane’s stop function from `laneStops`;
  - remove stream/tracker from arrays;
  - cleanup tracker exactly once.
- Keep the opposite lane running.
- Do not auto-select another camera. M9 must not silently switch hardware.
- Ensure manual `stopCameraTracking()`, `retry()`, and `destroy()` detach track-ended listeners before releasing streams.
- Track end should not increment `consecutiveFrameErrors`; it is capture loss, not frame processing failure.

**Test plan**

- Integration: front track ended sets fusion context `frontLaneHealth: "captureLost"` and latest fused frame rejects with `laneFailed`.
- Integration: side track ended sets `sideLaneHealth: "captureLost"` and no shot can fire after loss.
- Integration: front track ended stops only front stream/tracker and leaves side stream/tracker active.
- Integration: `retry()` after capture loss starts new front and side trackers once.
- Integration: `destroy()` after capture loss does not double-stop streams or double-clean trackers.
- Integration: duplicate ended events from the same fake track do not double cleanup.
- Keep `toBe` for primitive health/reject-reason assertions.

**Dependencies on M3-M8 contracts**

- M6: fusion uses explicit lane health.
- M7 R2/R3: retry and lane resource release are existing runtime seams.
- M8: if runtime passes default calibration after M8, retry keeps default-only game calibration behavior.

### 4. Add devicechange event wiring and refresh device lists without auto-opening streams

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/camera/observeDeviceChange.ts`
- Modify: `src/features/diagnostic-workbench/DiagnosticWorkbench.ts`
- Modify: `src/diagnostic-main.ts`
- Modify tests:
  - `tests/unit/features/camera/observeDeviceChange.test.ts`
  - `tests/unit/features/diagnostic-workbench/DiagnosticWorkbench.test.ts`
  - `tests/e2e/diagnostic.smoke.spec.ts`

**Implementation notes**

- Add `observeDeviceChange(callback): { stop(): void }`.
  - use `navigator.mediaDevices.addEventListener("devicechange", callback)` when available;
  - fallback to preserving/restoring `navigator.mediaDevices.ondevicechange` if needed;
  - idempotent cleanup.
- Add a workbench method such as `refreshDevicesFromDeviceChange(): Promise<void>`.
- Refresh behavior:
  - if screen is `permission`, do nothing until permission is granted;
  - if screen is `deviceSelection`, `singleCamera`, `cameraNotFound`, or `enumerationFailed`, re-enumerate and update screen based on count;
  - if screen is `previewing`, re-enumerate `devices` and update labels/options, but do not stop active streams and do not auto-open replacements;
  - if selected device disappears while previewing, keep preview screen and rely on `track ended -> captureLost` for lane health.
- Use `requestGeneration` / `openGeneration` or a new `deviceRefreshGeneration` to prevent stale enumeration overwrites.
- Do not spin up trackers from `devicechange`.

**Test plan**

- Unit: fake devicechange calls workbench refresh once.
- Unit: selection screen updates from one camera to two cameras and moves from `singleCamera` to `deviceSelection`.
- Unit: previewing devicechange updates `devices` but does not call `createDevicePinnedStream`.
- Unit: older enumerate result resolving after a newer devicechange is ignored.
- E2E: in `diagnostic.html`, fake `navigator.mediaDevices` dispatches `devicechange`; dropdown reflects new camera list after clicking reselect.
- E2E should remain smoke-level; detailed race behavior stays in unit tests.

**Dependencies on M3-M8 contracts**

- M1/M3: permission precedes `enumerateDevices()`.
- M3/M4: workbench owns device selection UX.
- M8: calibration controls remain unchanged; devicechange is additive.

### 5. Surface capture-lost health in diagnostic workbench UI

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/features/diagnostic-workbench/renderWorkbench.ts`
- Modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts` if extra state is needed.
- Modify tests:
  - `tests/unit/features/diagnostic-workbench/renderWorkbench.test.ts`
  - `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`

**Implementation notes**

- Add a lane-health display helper inside diagnostic workbench, for example:
  - `tracking -> "tracking"`
  - `capturing -> "capturing"`
  - `captureLost -> "カメラが切断されました"`
  - `failed -> "カメラ処理に失敗しました"`
  - `stalled -> "カメラ入力が停止しています"`
- Keep raw health available in the text, but add user-facing Japanese for live trial operators.
- In previewing state, keep the existing `再選択` button visible.
- Do not add debug-only overlay to the game page.
- Do not remove existing tuning/calibration controls.

**Test plan**

- Unit: `captureLost` renders `"カメラが切断されました"`.
- Unit: health HTML escapes text and does not expose raw `deviceId`.
- Unit: previewing with one lane `captureLost` still renders fusion panel and reselect button.
- Unit: undefined telemetry fields still render `"unavailable"` in lane panels.

**Dependencies on M3-M8 contracts**

- M3: workbench observes lanes but does not own correctness.
- M6: fusion telemetry remains visible during degraded states.
- M8: calibration telemetry remains visible if available; no reset from render path.

### 6. Make fusion loss entry explicit and lock `captureLost -> laneFailed` behavior

**Scope:** `~≤2h`

**Files to modify**

- Modify: `tests/unit/features/input-fusion/createInputFusionMapper.test.ts`
- Modify: `tests/unit/features/input-fusion/typeContract.test.ts` only if coverage is missing.
- Modify: `src/features/input-fusion/createInputFusionMapper.ts` only if tests expose a gap.

**Implementation notes**

- Current implementation already treats `captureLost` as failed via `isFailed()`.
- Add regression tests so future refactors cannot drop this.
- Tests should cover both:
  - front health `captureLost` with latest side frame present;
  - side health `captureLost` with latest front frame present.
- Assert:
  - `fusionRejectReason === "laneFailed"`;
  - affected source `laneHealth === "captureLost"`;
  - affected source `rejectReason === "laneFailed"`;
  - `fusionMode` does not pair front/side while a lane is capture-lost.
- Do not add a new `FusionRejectReason` for `captureLost`; M9 requirement says `LaneHealthStatus` reflects real device state, while fusion reject reason remains explicit and stable.

**Test plan**

- Unit: `updateAimUnavailable(timestamp, { frontLaneHealth: "captureLost" })` clears front buffer and returns `laneFailed`.
- Unit: `updateTriggerUnavailable(timestamp, { sideLaneHealth: "captureLost" })` clears side buffer and resets shot consumption.
- Replay: only update replay fixtures if existing replay assumptions break; expected no replay churn.

**Dependencies on M3-M8 contracts**

- M6 R5: unavailable lane updates are the buffer-clearing seam.
- M7: gameplay consumes only `FusedGameInputFrame`.
- M8: calibration metadata must not enter fusion frame shape.

### 7. Add production-clean game HUD copy for `captureLost`

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/app/balloonGameRuntime.ts`
- Modify: `src/app/gameHud.ts` only if an action button is added in step 8.
- Modify tests:
  - `tests/integration/balloonGameRuntime.test.ts`
  - `tests/unit/app/gameHud.test.ts`

**Implementation notes**

- Keep game page production-clean.
- Do not expose `fusionRejectReason`, raw lane health, device ids, timestamps, or debug terminology.
- Update `statusMessageForFusedFrame()`:
  - if `frame.fusionRejectReason === "laneFailed"` and either `frontSource.laneHealth` or `sideSource.laneHealth` is `captureLost`, return `"カメラが切断されました"`;
  - otherwise keep existing generic lane failure copy.
- Preserve existing messages for `frontMissing`, `sideMissing`, stale, and timestamp gap.
- Do not add diagnostic panels or threshold text.

**Test plan**

- Unit/integration: fused frame with `frontSource.laneHealth: "captureLost"` renders `"カメラが切断されました"`.
- Unit/integration: fused frame with `sideSource.laneHealth: "captureLost"` renders same concise message.
- Unit: generic `failed` still renders `"カメラが失敗しました。リトライしてください"` or the post-M9 chosen generic copy.
- Unit: game HUD output does not contain `captureLost`, `laneFailed`, or `fusionRejectReason`.
- E2E home smoke: no diagnostic selectors or debug labels appear.

**Dependencies on M3-M8 contracts**

- M7 R3: HUD already reads fused degraded state.
- M6: lane health is available through `frontSource` / `sideSource`.
- M8: no calibration UI on game page.

### 8. Add a game-page reselect path after capture loss

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/app/gameHud.ts`
- Modify: `src/app/balloonGameRuntime.ts`
- Modify: `src/app/balloonGamePage.ts`
- Modify tests:
  - `tests/unit/app/gameHud.test.ts`
  - `tests/unit/app/balloonGamePage.test.ts`
  - `tests/integration/balloonGameRuntime.test.ts`
  - `tests/e2e/home.smoke.spec.ts`

**Implementation notes**

- Add a production-clean action, not a debug overlay.
- Recommended UI:
  - when status is capture-lost, show message `"カメラが切断されました"` and a small button `"カメラを選び直す"` with `data-game-action="reselectCameras"`.
- `balloonGamePage.ts` should handle `reselectCameras`:
  - destroy current runtime;
  - re-enumerate video devices;
  - return to the existing device selection screen;
  - preserve previous `selectedFrontDeviceId` / `selectedSideDeviceId` if still present;
  - if a selected id no longer exists, choose a valid remaining default and show a concise selection error such as `"切断されたカメラを選び直してください。"`
- Starting from the dropdown should call existing `startRuntime(frontId, sideId)`, which creates a fresh runtime and restarts lane pipelines.
- Do not silently switch cameras on devicechange.
- Do not add one-camera fallback.

**Test plan**

- Unit: capture-lost HUD includes `"カメラを選び直す"` and no debug text.
- Unit: clicking `reselectCameras` destroys runtime and shows `カメラ選択`.
- Unit: if old device id is absent after enumeration, selection defaults to available distinct devices and shows concise copy.
- Unit: if fewer than two cameras remain, show existing two-camera-required error.
- E2E: fake camera list changes, trigger reselect button, dropdown reflects refreshed devices, game can start again with two distinct cameras.
- Keep real track unplug out of E2E; use mocks.

**Dependencies on M3-M8 contracts**

- M3/M4: device selection requires distinct devices.
- M7 R2: runtime `retry()` remains for result retry; reselect path can destroy/recreate runtime.
- M8: preserve same-lane calibration only in diagnostic workbench; game runtime remains default-only unless M8 introduces game calibration injection.

### 9. Verify retry path cleanup with track-ended listeners

**Scope:** `~≤2h`

**Files to modify**

- Modify: `src/app/balloonGameRuntime.ts` only if tests expose listener leaks.
- Modify tests: `tests/integration/balloonGameRuntime.test.ts`

**Implementation notes**

- `retry()` already does:
  - engine reset;
  - `stopCameraTracking()`;
  - mapper resets;
  - `inputFusionMapper.resetAll()`;
  - fresh `startCameraTracking()`.
- M9 must add assertions that retry also detaches track-ended observers and does not leave old stream listeners active.
- If implementation uses lane-local observer cleanup, call it inside the same cleanup path as callback cancellation and tracker cleanup.
- Avoid duplicate listener accumulation after repeated `retry()`.

**Test plan**

- Integration: start runtime, capture fake track listener count, call `retry()`, old fake track has zero ended listeners.
- Integration: ended event on old track after retry does not mutate the new runtime lane health.
- Integration: retry after one lane `captureLost` starts exactly two new streams and two new trackers.
- Integration: repeated retry does not increase listener count on active tracks beyond one per track.

**Dependencies on M3-M8 contracts**

- M7 R2/R3: retry and lane release are known seams.
- M6: reset all fusion buffers on retry.
- Prior PR lesson: lifecycle race on stream/tracker must be verified directly.

### 10. Add reconnect cooldown / error-budget policy without auto-restart loops

**Scope:** `~≤2h`

**Files to create / modify**

- Create: `src/features/camera/reconnectPolicy.ts`
- Modify: `src/features/diagnostic-workbench/DiagnosticWorkbench.ts`
- Modify: `src/app/balloonGamePage.ts` if manual reselect start clicks need throttling.
- Add tests:
  - `tests/unit/features/camera/reconnectPolicy.test.ts`
  - `tests/unit/features/diagnostic-workbench/DiagnosticWorkbench.test.ts`
  - `tests/unit/app/balloonGamePage.test.ts` if app path uses the policy.

**Implementation notes**

- M9 should not auto-reopen streams on `devicechange` or track end.
- Add a small deterministic policy to prevent repeated manual start attempts from spinning trackers:
  - named constants such as `CAMERA_RECONNECT_COOLDOWN_MS = 1_000` and `MAX_CAMERA_RECONNECT_ATTEMPTS = 3`;
  - `createReconnectBudget(nowMs)` with methods like `canAttempt(role)` / `recordFailure(role)` / `recordSuccess(role)`.
- Apply policy only where repeated user/device events can call stream open:
  - workbench `assignDevices()` / `swapRoles()`;
  - game page reselect start if M9 adds a direct reconnect button.
- After success, clear failure budget for that lane or pair.
- On cooldown block, do not start trackers; surface concise copy:
  - workbench: inline error with cause/impact/reproduction/next action if fitting existing error model;
  - game page: `"少し待ってからもう一度お試しください"`.

**Test plan**

- Unit: failures within cooldown block repeated open attempts.
- Unit: success clears budget.
- Unit: devicechange refresh never consumes reconnect budget.
- Unit: blocked attempt does not call `createDevicePinnedStream`.
- Unit: constants are named and tested with `toBe`.

**Dependencies on M3-M8 contracts**

- M3: no silent camera switching.
- M7: game page stays production-clean.
- Prior PR lessons: named threshold constants, deterministic rules over prompt-only behavior.

### 11. Preserve or replay M8 calibration across same-lane reconnect

**Scope:** `~≤2h`

**Files to modify after M8 lands**

- Likely modify: `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
- Likely modify: `src/features/diagnostic-workbench/renderWorkbench.ts`
- Likely modify: `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
- Possibly modify: M8-created calibration renderer tests.

**Implementation notes**

- This step depends on the final M8 implementation.
- If M8 creates session-scoped calibration state in `liveLandmarkInspection.ts`, M9 should preserve it across:
  - track ended;
  - same lane same role reselect;
  - same lane same role device reconnect where the user chooses the same device label/id again.
- Do reset calibration on:
  - explicit calibration reset button;
  - destroying the workbench;
  - role swap if calibration semantics are role-bound and the lane role changes.
- Do not persist calibration to storage.
- Important contradiction:
  - M8 decomposition currently says reselect resets lane calibration to defaults.
  - M9 requirement says same-lane reconnect should not reset session calibration.
  - Resolve this in spec/Issue discussion or in a small M8/M9 handoff note before code changes.
- USB re-enumeration caveat:
  - browser may return the same `deviceId` for a new physical connection, or a new `deviceId` for the same hardware;
  - treat preservation as lane-role/session-scoped, not as proof of physical identity.

**Test plan**

- Unit: front calibration changed, front track ended, user reselects front lane, calibration value remains.
- Unit: side calibration changed, side track ended, user reselects side lane, calibration value remains.
- Unit: explicit reset still restores defaults.
- Unit: role swap behavior matches final agreed policy.
- E2E: if M8 exposes calibration sliders, change slider, reselect same lane, value remains visible.

**Dependencies on M3-M8 contracts**

- M8: exact calibration state names and methods.
- M6: fusion frame remains calibration-free.
- M7: game page still does not expose calibration UI.

### 12. Add browser smoke coverage for live-trial hardening

**Scope:** `~≤2h`

**Files to modify**

- Modify: `tests/e2e/diagnostic.smoke.spec.ts`
- Modify: `tests/e2e/home.smoke.spec.ts`

**Implementation notes**

- Do not attempt real USB unplug in Playwright.
- Extend fake media devices with:
  - controllable `enumerateDevices()` result;
  - fake `MediaStream` containing fake video tracks where possible;
  - dispatchable `devicechange` event.
- Diagnostic smoke:
  - permission -> selection -> preview still works;
  - dispatch `devicechange`;
  - click `再選択`;
  - dropdown shows refreshed device list.
- Home smoke:
  - game remains free of diagnostic selectors;
  - capture-lost reselect action is concise and production-facing if the test can drive fake fused state or fake track end;
  - no calibration selectors or debug constants appear.

**Test plan**

- E2E diagnostic: refreshed dropdown includes replugged camera label.
- E2E home: no `#wb-fusion-panel`, `[data-side-trigger-tuning]`, `[data-fusion-tuning]`, calibration selectors, or raw health strings.
- E2E home: reselect path returns to camera selection without page reload.

**Dependencies on M3-M8 contracts**

- M3: diagnostic entry remains separate.
- M7: home game flow and result retry still work.
- M8: calibration controls remain diagnostic-only.

### 13. Quality gates and final verification

**Scope:** `~≤2h`

**Files to modify**

- None unless failures identify scoped fixes.

**Commands**

- After camera helper work:
  - `npm run test -- tests/unit/features/camera`
- After diagnostic lifecycle work:
  - `npm run test -- tests/unit/features/diagnostic-workbench`
- After game runtime/page work:
  - `npm run test -- tests/integration/balloonGameRuntime.test.ts tests/unit/app`
- After fusion captureLost lock-in:
  - `npm run test -- tests/unit/features/input-fusion tests/replay`
- Before marking M9 complete:
  - `npm run check`
- Because M9 touches browser entry behavior:
  - `npm run test:e2e`

**Expected outcome**

- `npm run check` passes lint, typecheck, unit/integration/replay, and knip.
- `npm run test:e2e` passes diagnostic and home smoke.
- If Playwright/browser installation blocks e2e, record exact failure and the passing lower-level gates.

**Dependencies on M3-M8 contracts**

- All lane contracts remain explicit.
- Knip must see new helpers through real imports.
- No dead exported constants.

## 3. Risk register

- **Stream/tracker left dangling after `track.onended`:** Use the same cleanup discipline as M6 R1 / M7 R3. Track end must cancel frame callbacks, cleanup tracker, stop/remove stream references, and detach listeners once.
- **Duplicate `onended` listeners after retry:** Use `addEventListener` plus cleanup object. Tests must assert old fake tracks have zero listeners after `retry()` / `destroy()`.
- **Device dropdown refresh race with active stream:** `devicechange` should refresh `devices` only. It must not stop active streams or auto-open replacements while previewing/running.
- **Calibration wiped on reconnect:** M8 decomposition and M9 requirement conflict. Resolve policy first; recommended M9 behavior is same-lane session calibration preservation.
- **`captureLost` health never cleared after successful re-select:** Successful new lane start must set health `capturing -> tracking`, clear lane-lost snapshots, and clear fusion lane buffer through fresh frames.
- **`devicechange` during `retry()` mid-flight:** Generation guards must prevent double-start and stale enumeration/open results from winning.
- **Fusion pairing during reconnect window:** On loss entry, call `updateAimUnavailable()` / `updateTriggerUnavailable()` immediately so stale paired frames cannot survive the reconnect window.
- **Browser returns same `deviceId` for different hardware after USB re-enum:** Do not treat `deviceId` as physical identity proof. Keep copy and calibration semantics lane/session-scoped.
- **Stale video element after re-render:** Existing live inspection key includes stream ids and video elements. M9 must keep that check and restart tracking when DOM video elements are replaced.
- **Process-frame try/catch recovery regression:** Track end should be separate from detect/frame errors. Do not turn every transient bitmap failure into `captureLost`.
- **Cooldown accidentally blocks legitimate manual reselect:** Cooldown should block repeated failing opens, not passive dropdown refresh or explicit reset after success.
- **Game page becomes diagnostic:** Do not display raw `LaneHealthStatus`, timestamps, device IDs, threshold constants, or workbench panels.
- **Shot fires from stale side trigger after side loss:** `updateTriggerUnavailable()` must reset shot consumption.
- **M8 merge conflict in `liveLandmarkInspection.ts`:** M8 calibration snapshot handling and M9 capture-loss handling both touch per-frame state and reset paths. Keep changes small and tests focused.

## 4. Quality gate sequence

1. During each Red/Green loop, run the focused Vitest file for the touched module.
2. After camera helpers and policies:
   - `npm run test -- tests/unit/features/camera`
3. After workbench lifecycle/devicechange:
   - `npm run test -- tests/unit/features/diagnostic-workbench`
4. After runtime/page reselect and HUD:
   - `npm run test -- tests/unit/app tests/integration/balloonGameRuntime.test.ts`
5. After fusion lock-in:
   - `npm run test -- tests/unit/features/input-fusion tests/replay`
6. Before completion:
   - `npm run check`
7. Because `diagnostic.html` and `index.html` behavior change:
   - `npm run test:e2e`

## 5. Boundaries reminder

- No stereo expansion.
- No IMU, depth, or other additional sensors.
- No one-camera pseudo-side mode.
- Preserve lane invariant:
  - front = aim
  - side = trigger
  - fusion = pairing / shot-edge consumption
- Game page remains production-clean:
  - concise user-facing degraded-state messages only;
  - no debug overlay;
  - no workbench panels;
  - no raw `captureLost` / `laneFailed` strings.
- Diagnostic workbench behavior is additive:
  - device-event visibility and capture-loss state are added;
  - existing tuning/calibration controls are not renamed or removed.
- No silent camera switching. Reconnect requires explicit user selection or retry.
- No persistent calibration in M9.

## 6. M8 coordination notes

M9 likely overlaps with M8 in these files:

- `src/features/diagnostic-workbench/liveLandmarkInspection.ts`
  - Highest merge risk. M8 adds calibration state and per-frame calibration snapshots; M9 adds track-ended loss entry, cleanup, and unavailable fusion updates.
- `src/features/diagnostic-workbench/renderWorkbench.ts`
  - M8 adds calibration controls/state; M9 adds capture-lost health copy and device-event visibility.
- `src/diagnostic-main.ts`
  - M8 adds calibration event handlers; M9 adds `devicechange` observer and possibly reselect/device refresh wiring.
- `src/app/balloonGameRuntime.ts`
  - M8 may pass default calibration into mappers; M9 adds track-ended observers, capture-lost HUD logic, and cleanup tests.
- `src/app/balloonGamePage.ts`
  - M9 adds production-clean reselect path; M8 should not add game calibration UI.
- `tests/unit/features/diagnostic-workbench/liveLandmarkInspection.test.ts`
  - Both M8 and M9 add async lifecycle tests. Expect merge conflicts.
- `tests/e2e/diagnostic.smoke.spec.ts`
  - M8 calibration controls and M9 devicechange/reselect refresh both extend the same smoke path.
- `tests/e2e/home.smoke.spec.ts`
  - M8 asserts calibration UI absence; M9 asserts capture-loss reselect UX and debug absence.
- `tests/integration/balloonGameRuntime.test.ts`
  - M8 default calibration wiring and M9 capture-loss/retry cleanup both touch runtime setup fakes.

Merge-risk flags:

- Decide calibration reset-vs-preserve before implementation.
- If M8 changes mapper update signatures, M9 runtime/workbench tasks must use the M8 signatures instead of post-M7 signatures.
- If M8 adds calibration state to `WorkbenchInspectionState`, M9 reset paths must preserve that state intentionally.
- If M8 creates new calibration renderers, M9 should not fold capture-loss UI into those files.

## 7. Out-of-scope for M9

- Stereo reconstruction or stereo calibration.
- Sensor fusion beyond the two existing camera lanes.
- Persistent calibration storage in `localStorage`, `IndexedDB`, cookies, server, config files, or URL params.
- Multi-user sessions.
- Camera permission denial flow beyond the existing single prompt retry path.
- Automatic camera failover to another detected device.
- One-camera fallback or pseudo-side mode.
- New gameplay mechanics, scoring changes, or Phaser migration.
- Debug/diagnostic overlays on the game page.
