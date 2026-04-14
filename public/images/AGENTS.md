# AGENTS.md

## WHY

- `public/images/` stores runtime-served image files for the PoC.

## WHAT

- Balloon textures and image frames that browser code can reference directly

## HOW

- Keep only runtime-ready image files here.
- Use stable, descriptive filenames because rendering code may hardcode paths.
- Keep source-stage originals and archives in `src/assets/images/`.
