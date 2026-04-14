# 2026-04-09 Handover: UI/backend split for Slice 5 (#9) and Slice 6 (#10)

## Context

Slice 4 (#8) landed. The remaining implementation work for the PoC is Slice 5 (#9)
browser integration and Slice 6 (#10) hardening. For this session the work is
split between two agents:

- **Claude (UI)** owns every user-visible surface.
- **Codex (backend)** owns adapters, data flow, assets, and non-visual tests.

This handover records the split, the interface contracts, and the branch layout
so both agents can work in parallel without stepping on each other.

## Deviations from the approved plan

The implementation plan at `docs/superpowers/plans/2026-04-08-poc-implementation.md`
Task 5 defines `createCameraController(video: HTMLVideoElement)` which mutates
the video element directly. This session takes a cleaner boundary:

- `createCameraController` no longer knows about the DOM.
- It exposes `requestStream(): Promise<MediaStream>` and `stop(): void`.
- The UI layer mounts the stream onto the `<video>` element it owns.

All other Task 5 interfaces (`gameConfig`, `createMediaPipeHandTracker`,
`createAudioController`, `createDebugPanel`, `DebugValues`) remain as specified
in the plan unless a contract below overrides them.

## Branch layout (Option A: parallel worktrees)

| Worktree branch                          | Owner  | Scope                                                                                                                    |
| ---                                      | ---    | ---                                                                                                                      |
| `codex/issue-9-backend-adapters`         | Codex  | gameConfig, camera/hand-tracking/audio adapters, asset vendoring, data-flow wiring in `startApp.ts`                      |
| `claude/issue-9-ui-debug-and-shell`      | Claude | Debug panel (`createDebugPanel.ts` + test), CSS for `.camera-feed`/`.debug-panel`, shell DOM wiring in `startApp.ts`     |
| `codex/issue-10-smoke-and-ci`            | Codex  | Playwright smoke spec, CI workflow extension for Chromium, AGENTS audit                                                  |

- Codex's `#9` PR lands first. Claude rebases `claude/issue-9-ui-debug-and-shell`
  onto it and resolves `startApp.ts` conflicts by taking both edits.
- `#10` is independent of both `#9` branches and can land any time once #8 is in
  `main` (it already is).

## Contracts

### `src/shared/config/gameConfig.ts` (Codex)

Unchanged from plan:

```ts
export const gameConfig = {
  camera: { width: 640, height: 480 },
  input: {
    smoothingAlpha: 0.28,
    triggerPullThreshold: 0.45,
    triggerReleaseThreshold: 0.25
  }
} as const;
```

### `src/features/camera/createCameraController.ts` (Codex)

Changed to return a stream instead of touching DOM:

```ts
export interface CameraController {
  requestStream(): Promise<MediaStream>;
  stop(): void;
}

export const createCameraController: () => CameraController;
```

- `requestStream` calls `navigator.mediaDevices.getUserMedia` with the plan's
  640x480 user-facing constraints.
- `stop` must cancel every active track.
- Calling `requestStream` twice without `stop` should reuse the existing stream.

### `src/features/hand-tracking/createMediaPipeHandTracker.ts` (Codex)

Unchanged from plan. Returns a `HandLandmarker` loaded from
`/models/hand_landmarker.task`.

### `src/features/audio/createAudioController.ts` (Codex)

Unchanged from plan. Methods: `startBgm`, `stopBgm`, `playShot`, `playHit`,
`playTimeout`, `playResult`.

### `src/features/debug/createDebugPanel.ts` (Claude)

Contract updated to match the current implementation. Types:

```ts
export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

export interface DebugInputElement {
  dataset: { debug?: string };
  value: string;
  addEventListener(type: "input", listener: () => void): void;
}

export interface DebugPanel {
  values: DebugValues;
  render(): string;
  bind(inputs: Iterable<DebugInputElement>): void;
}

export const createDebugPanel: (initial: DebugValues) => DebugPanel;
```

- Initial values come from `gameConfig.input`.
- `bind` accepts the iterable of `[data-debug]` inputs selected by the caller and
  wires `input` listeners to mutate `values` in place.
- The exposed `values` object is the single source of truth consumed by the
  hand-tracker/input-mapping pipeline on the codex side.

### `startApp.ts` coordination

Both agents edit `src/app/bootstrap/startApp.ts`. To minimize conflicts:

1. Claude lands the **shell DOM structure** first on its branch: adds
   `<video class="camera-feed" playsinline muted>`, `<div id="debug-root">`,
   mounts the debug panel via `debugPanel.render()` + `debugPanel.bind()`, and
   adds placeholder imports typed against the contracts above.
2. Codex edits its branch to add adapter creation, `camera.requestStream()` +
   assignment into `video.srcObject`, tracker subscription loop, audio hooks,
   and timeout/retry flow.
3. On rebase, both edits are kept. Claude performs the rebase.

### Scoped CSS additions (Claude)

New rules only, added to `src/styles/app.css`:

- `.camera-feed` — covers the underlay, mirrored horizontally, `object-fit: cover`.
- `.debug-panel` — fixed corner drawer (top-right or bottom-left), semi-transparent,
  compact `label` + `input[type=range]` rows.
- `.debug-panel input[type=range]` — consistent width, small padding.

### Asset vendoring (Codex)

Codex must source the files under a license compatible with local testing:

- `public/models/hand_landmarker.task`
- `public/audio/bgm.mp3`
- `public/audio/shot.mp3`
- `public/audio/hit.mp3`
- `public/audio/time-up.mp3`
- `public/audio/result.mp3`

If licensed assets are not available, commit zero-byte placeholders and note the
missing asset in the PR description so a human can drop the final file in.

## #10 (Codex)

- `tests/e2e/app.smoke.spec.ts` must boot the dev server, navigate to `/`, click
  the `カメラを準備` button, and assert the `スタート` button appears. It does
  **not** need real camera access; stubbing `navigator.mediaDevices.getUserMedia`
  via `page.addInitScript` is acceptable.
- Extend `.github/workflows/ci.yml` with an `e2e` job that installs Playwright
  browsers (`npx playwright install --with-deps chromium`) and runs
  `npm run test:e2e`.
- Run the AGENTS audit: every `AGENTS.md` must be English and have a sibling
  `CLAUDE.md` symlink in the same directory.

## Definition of done

- `#9` UI PR: debug panel renders and binds; camera `<video>` slot exists;
  shell DOM structure updated; new CSS passes lint; debug panel unit test passes.
- `#9` backend PR: all three adapters exist with the contracts above; data flow
  wired in `startApp.ts`; `npm run check` and `npm run build` green;
  `createDebugPanel.test.ts` passes against the Claude-owned file.
- `#10` PR: Playwright smoke spec green locally (`npm run test:e2e`); CI workflow
  extended; AGENTS audit script reports clean.
- All three PRs land into `main`. Tracker issue #11 is updated with the split.
