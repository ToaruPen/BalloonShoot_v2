# AGENTS.md

## WHY

- `src/` contains the runnable PoC code.

## WHAT

- `app/`: startup, screen orchestration, and UI shell
- `features/`: feature modules and browser adapters
- `shared/`: shared types, config, and helpers
- `assets/`: source-side asset placeholders
- `styles/`: global styles

## HOW

- Keep `app/` thin.
- Push reusable logic into `features/` or `shared/`.
- Check the nearest scoped `AGENTS.md` before changing a subdirectory.
