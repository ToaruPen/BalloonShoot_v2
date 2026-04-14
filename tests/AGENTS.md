# AGENTS.md

## WHY

- `tests/` verifies the PoC with fast logic tests first and browser checks second.

## WHAT

- `unit/`: pure logic coverage
- `integration/`: reducer and seam coverage
- `e2e/`: Chromium smoke coverage

## HOW

- Prefer deterministic tests.
- Mock edges instead of hiding failures behind fallbacks.
