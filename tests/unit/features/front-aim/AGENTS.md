# AGENTS.md

## WHY

- `tests/unit/features/front-aim/` verifies front aim mapping as fast deterministic logic.

## WHAT

- Type contracts for `AimInputFrame`.
- Projection math from front landmarks to viewport points.
- Stateful mapper recovery and telemetry behavior.

## HOW

- Prefer synthetic `FrontHandDetection` fixtures.
- Assert timestamp and lane-role contracts explicitly.
- Keep browser lifecycle tests outside this directory.
