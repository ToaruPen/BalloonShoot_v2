# AGENTS.md

## WHY

- `tests/unit/` covers pure logic that should run fast and often.

## WHAT

- Gameplay rules
- Input mapping and trigger logic
- Small shared helpers

## HOW

- Keep tests focused and deterministic.
- Favor direct domain assertions over UI-heavy setup.
