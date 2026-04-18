# AGENTS.md

## WHY

- `tests/unit/features/input-fusion/` verifies pure input fusion pairing, buffering, telemetry, and shot-edge consumption.

## WHAT

- Shared fusion type contract samples.
- Timestamp pairing and retention behavior.
- Stateful mapper degradation and one-shot trigger edge handling.

## HOW

- Use synthetic `AimInputFrame` and `TriggerInputFrame` fixtures.
- Assert frame timestamps, lane roles, and reject reasons explicitly.
- Keep browser and DOM wiring tests outside this directory.
