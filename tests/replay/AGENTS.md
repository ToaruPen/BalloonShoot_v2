# AGENTS.md

## WHY

- `tests/replay/` holds deterministic replay tests for the v2 pipeline: timestamp pairing, fusion degrade modes, side trigger FSM transitions.

## WHAT

- Synthetic frame sequences for `input-fusion` and `side-trigger` once those lanes exist.
- A placeholder test keeps the `replay` CI gate green until v2 lanes provide real replay inputs.

## HOW

- Use synthetic inputs, not recorded video. v1 finger-gun fixtures (`right-hand.mov` etc.) are deliberately not revived here.
- Keep replays fast and deterministic. Prefer fixed arrays of lane frames over random generation.
