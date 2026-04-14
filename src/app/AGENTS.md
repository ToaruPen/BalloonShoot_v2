# AGENTS.md

## WHY

- `src/app/` coordinates the browser-facing app flow without owning domain logic.

## WHAT

- `bootstrap/`: app wiring
- `screens/`: overlay HTML rendering
- `state/`: screen state and transitions

## HOW

- Keep screen transitions explicit.
- Avoid placing gameplay rules or MediaPipe-specific logic here.
- Use deeper scoped files for folder-specific context.
