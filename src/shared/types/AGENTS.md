# AGENTS.md

## WHY

- `src/shared/types/` defines contracts shared across modules.

## WHAT

- Tracking frame types
- App and gameplay payload types shared across boundaries

## HOW

- Keep types local to the actual boundaries that need them.
- Prefer precise unions over nullable loose shapes.
