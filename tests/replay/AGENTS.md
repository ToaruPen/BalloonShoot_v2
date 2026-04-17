# AGENTS.md

## WHY

- `tests/replay/` holds deterministic sequence replays: fixed synthetic inputs flow through real v2 code and assert concrete behavior so regressions cannot hide behind tautologies.

## WHAT

- A OneEuro-filter sequence replay that feeds a fixed sample stream through `createOneEuroFilter` and pins down smoothing (step transition stays between the two input levels, rises monotonically, and never snaps to the raw level).

## HOW

- Use synthetic inputs, not recorded video. v1 finger-gun fixtures (`right-hand.mov` etc.) are deliberately not revived here.
- Keep replays fast and deterministic. Prefer fixed arrays of lane frames over random generation.
- Raise `testTimeout` in `vitest.replay.config.ts` only when real replays need it.

## Future

- Synthetic frame sequences for `input-fusion` timestamp pairing / degrade modes and the `side-trigger` FSM arrive with their v2 lanes.
