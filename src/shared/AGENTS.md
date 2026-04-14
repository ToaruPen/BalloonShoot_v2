# AGENTS.md

## WHY

- `src/shared/` holds small reusable building blocks used across the PoC.

## WHAT

- `math/`: numeric helpers
- `browser/`: small browser utilities
- `config/`: immutable defaults
- `types/`: shared contracts

## HOW

- Keep files focused and dependency-light.
- Do not import from `src/app/` or feature internals.
