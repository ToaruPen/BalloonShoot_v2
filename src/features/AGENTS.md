# AGENTS.md

## WHY

- `src/features/` contains reusable feature modules that should remain independent from app shell concerns.

## WHAT

- `camera/`: webcam lifecycle
- `hand-tracking/`: MediaPipe adapter
- `input-mapping/`: pose, trigger, smoothing, and crosshair mapping
- `gameplay/`: balloons, score, combo, timer, and difficulty
- `rendering/`: Canvas-only drawing
- `audio/`: BGM and sound effect playback
- `debug/`: runtime tuning and diagnostics

## HOW

- Prefer pure logic for gameplay and input mapping.
- Keep browser adapters thin.
- Avoid importing from `src/app/`.
