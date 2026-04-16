# AGENTS.md

## WHY

- `src/features/diagnostic-workbench/` owns the diagnostic workbench UI reached through `diagnostic.html`.

## WHAT

- Camera device selection, role assignment, and live preview
- Per-lane telemetry display and tuning controls
- Landmark overlays, timestamp pairing monitor, trigger evidence panels

## HOW

- Observe lanes but do not own lane correctness.
- Do not introduce workbench-only detection formats.
- Do not import from `src/app/` or gameplay modules.
- Lanes must not depend on this module.
