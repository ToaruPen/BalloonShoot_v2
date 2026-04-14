# AGENTS.md

## WHY

- `public/` contains static files served directly by Vite.

## WHAT

- `audio/`: runtime sound files
- `models/`: runtime ML models

## HOW

- Put only runtime-served assets here.
- Keep filenames stable because browser code may reference them directly.
