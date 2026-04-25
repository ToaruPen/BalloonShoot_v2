# AGENTS.md

## WHY

- `tests/` verifies the PoC with fast logic tests first and browser checks second.

## WHAT

- `unit/`: pure logic coverage
- `integration/`: app/runtime and cross-module seam coverage
- `e2e/`: Chromium smoke coverage

## HOW

- Prefer deterministic tests.
- Mock edges instead of hiding failures behind fallbacks.
