# AGENTS.md

## WHY

- `src/features/` contains reusable feature modules that should remain independent from app shell concerns.

## WHAT

- `camera/`: webcam lifecycle (v2 two-camera capture lives here)
- `hand-tracking/`: MediaPipe adapter
- `gameplay/`: balloons, score, combo, timer, and difficulty
- `rendering/`: Canvas-only drawing
- `audio/`: BGM and sound effect playback
- `front-aim/`: front-camera aiming semantics
- `side-trigger/`: side-camera trigger judgment
- `input-fusion/`: timestamp pairing between aim and trigger lanes
- `diagnostic-workbench/`: diagnostic UI reached through `diagnostic.html`

## HOW

- Prefer pure logic for gameplay, lane mapping, trigger judgment, and input fusion.
- Keep browser adapters thin.
- Avoid importing from `src/app/`.
