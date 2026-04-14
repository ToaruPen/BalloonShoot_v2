# AGENTS.md

## WHY

- `src/features/gameplay/` contains the core game rules.

## WHAT

- Balloon spawning and movement
- Timer, score, combo, and multiplier logic
- Hit detection and difficulty scaling

## HOW

- Keep rules pure and easy to test.
- Avoid rendering or browser concerns in this folder.
