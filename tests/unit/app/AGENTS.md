# AGENTS.md

## WHY

- `tests/unit/app/` verifies browser-facing app orchestration without real cameras.

## WHAT

- App shell rendering.
- Permission/device-selection flow.
- Runtime startup and cleanup wiring.

## HOW

- Use fake roots and dependency injection.
- Keep MediaPipe and camera lifecycle assertions in integration tests when possible.
