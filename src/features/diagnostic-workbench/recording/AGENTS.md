# AGENTS.md

## WHY

- `recording/` owns diagnostic workbench capture output for calibration iteration.

## WHAT

- Session coordination for telemetry JSON and WebM video capture
- File System Access API writes into a user-picked directory
- Pure helpers for telemetry frame assembly and JSON rotation

## HOW

- Keep recording workbench-level; never import this directory from game pages or lane modules.
- Do not persist directory handles outside the current workbench session.
- Treat video streams as start-time captures; telemetry follows the live diagnostic frame subscription.
