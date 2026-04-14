# Codex Remote Setup

This repository has been prepared so Codex can pick up project context reliably in remote or cloud-based workflows.

## Included in the repository

- `AGENTS.md` at the repository root so Codex can load project instructions automatically.
- `README.md` for a short human-facing summary.
- A project memo under `docs/notes/` describing the intended game and proposed technical stack.

## Current project state

- The repository is still in planning and design.
- Source code for the game has not been added yet.
- The current recommendation is a local-first web stack using TypeScript, MediaPipe Hand Landmarker, and Canvas 2D.

## Typical remote workflow

1. Open the repository from Codex Web or another Codex remote surface backed by GitHub.
2. Confirm Codex sees `AGENTS.md` and the project memo before asking it to make changes.
3. Keep requirement changes in `docs/` until the spec is stable.
4. Start implementation only after the design is explicitly approved.

## Manual steps that may still be required outside the repo

- Connect the GitHub repository in Codex settings if it has not been connected yet.
- Enable any repository-specific Codex features from the Codex UI if desired.
- If using pull request review, turn on GitHub review access for this repository in Codex settings.
