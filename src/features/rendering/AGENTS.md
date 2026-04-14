# AGENTS.md

## WHY

- `src/features/rendering/` draws the current game state.

## WHAT

- Canvas 2D frame drawing
- Crosshair, balloons, and simple effects

## HOW

- Treat rendering as a view layer only.
- Do not embed score rules, tracking decisions, or browser setup here.
