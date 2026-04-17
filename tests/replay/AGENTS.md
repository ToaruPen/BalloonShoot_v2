# AGENTS.md

## WHY

- `tests/replay/` holds deterministic replay tests for the v2 pipeline: timestamp pairing, fusion degrade modes, side trigger FSM transitions.

## WHAT

- A deterministic OneEuro-filter sequence replay that feeds a fixed sample stream through `createOneEuroFilter` and asserts stable smoothing behavior.

## HOW

- Use synthetic inputs, not recorded video. v1 finger-gun fixtures (`right-hand.mov` etc.) are deliberately not revived here.
- Keep replays fast and deterministic. Prefer fixed arrays of lane frames over random generation.
- Raise `testTimeout` in `vitest.replay.config.ts` only when real replays need it.

## Future

- Synthetic frame sequences for `input-fusion` and `side-trigger` arrive with the v2 lanes.
