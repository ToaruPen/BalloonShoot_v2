# AGENTS.md

## WHY

- `src/features/side-trigger/` owns side-camera trigger evidence and state transitions.

## WHAT

- Convert `SideHandDetection` into `TriggerInputFrame`.
- Extract pull/release evidence from side-lane landmarks.
- Maintain trigger phase, dwell, loss recovery, and cooldown state.

## HOW

- Do not import from `front-aim`, `input-fusion`, `gameplay`, `rendering`, or `diagnostic-workbench`.
- Keep geometry and FSM logic pure and deterministic.
- Treat threshold defaults as provisional and expose tuning through named constants.
