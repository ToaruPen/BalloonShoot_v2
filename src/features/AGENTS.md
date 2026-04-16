# AGENTS.md

## WHY

- `src/features/` contains reusable feature modules that should remain independent from app shell concerns.

## WHAT

- `camera/`: webcam lifecycle (v2 two-camera capture lives here)
- `hand-tracking/`: MediaPipe adapter
- `gameplay/`: balloons, score, combo, timer, and difficulty
- `rendering/`: Canvas-only drawing
- `audio/`: BGM and sound effect playback

## HOW

- Prefer pure logic for gameplay and input mapping.
- Keep browser adapters thin.
- Avoid importing from `src/app/`.
- v2 lane modules (`front-aim/`, `side-trigger/`, `input-fusion/`, `diagnostic-workbench/`) are introduced incrementally per the v2 implementation plan.
