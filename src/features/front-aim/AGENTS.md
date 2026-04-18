# AGENTS.md

## WHY

- `src/features/front-aim/` owns front-camera aiming semantics for M5 and later fusion work.

## WHAT

- Convert `FrontHandDetection` into `AimInputFrame`.
- Project front-lane index fingertip landmarks into viewport coordinates.
- Maintain aim availability, smoothing/recovery state, and diagnostic telemetry.

## HOW

- Do not import from `side-trigger`, `input-fusion`, `gameplay`, `rendering`, or `diagnostic-workbench`.
- Keep projection and mapper logic pure and deterministic.
- Treat browser/video lifecycle as app or workbench responsibility.
