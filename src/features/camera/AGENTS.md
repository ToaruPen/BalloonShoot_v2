# AGENTS.md

## WHY

- `src/features/camera/` owns webcam access and lifecycle boundaries.

## WHAT

- Video device startup and shutdown
- Camera permission handling

## HOW

- Fail fast on unsupported browser APIs.
- Keep camera code separate from MediaPipe and gameplay logic.
