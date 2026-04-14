# AGENTS.md

## WHY

- `src/features/hand-tracking/` adapts MediaPipe Hand Landmarker to the PoC.

## WHAT

- MediaPipe initialization
- Model loading
- Per-frame landmark extraction

## HOW

- Keep this folder focused on external SDK integration.
- Convert SDK outputs into stable local types before passing them onward.
