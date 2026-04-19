# AGENTS.md

## WHY

- `tests/replay/` holds deterministic sequence replays: fixed synthetic inputs flow through real v2 code and assert concrete behavior so regressions cannot hide behind tautologies.

## WHAT

- OneEuro-filter sequence replay.
- Input-fusion timestamp pairing and degrade replay.
- Fused gameplay replay for deterministic shot consumption and scoring.

## HOW

- Use synthetic inputs, not recorded video. v1 finger-gun fixtures (`right-hand.mov` etc.) are deliberately not revived here.
- Keep replays fast and deterministic. Prefer fixed arrays of lane frames over random generation.
- Raise `testTimeout` in `vitest.replay.config.ts` only when real replays need it.

## Notes on opt-in local fixtures

`tests/replay/sideTriggerAdaptiveCalibration.replay.test.ts` reads an optional
local capture from `iterations/telemetry-...json` (gitignored). The capture
is deliberately **not committed** because of its size; the test uses
`it.skipIf` so CI passes without it while local runs that have the capture
exercise the regression gate. Drop the JSON at the path documented in the
test to enable it locally. Do not revive recorded video fixtures for this
replay.

## Future

- Synthetic frame sequences for `input-fusion` timestamp pairing / degrade modes and the `side-trigger` FSM arrive with their v2 lanes.
