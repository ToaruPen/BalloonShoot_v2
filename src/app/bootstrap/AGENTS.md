# AGENTS.md

## WHY

- `src/app/bootstrap/` wires the app together at startup.

## WHAT

- Startup composition for camera, tracking, rendering, audio, debug, and state

## HOW

- Keep composition code thin and fail fast on missing DOM or browser capabilities.
- Delegate feature logic to `src/features/`.
