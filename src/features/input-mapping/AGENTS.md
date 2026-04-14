# AGENTS.md

## WHY

- `src/features/input-mapping/` turns tracked hands into game input.

## WHAT

- Loose gun-pose checks
- Thumb-trigger state evaluation
- Crosshair smoothing and mapping
- Shot event generation

## HOW

- Keep logic deterministic and unit-testable.
- Normalize for hand size instead of relying on raw pixel thresholds.
