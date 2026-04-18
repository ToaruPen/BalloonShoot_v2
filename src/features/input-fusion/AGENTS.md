# AGENTS.md

## WHY

- `src/features/input-fusion/` owns timestamp pairing between front aim frames and side trigger frames for M6+.

## WHAT

- Retain recent `AimInputFrame` and `TriggerInputFrame` snapshots.
- Pair frames by nearest `FrameTimestamp.frameTimestampMs`.
- Produce `FusedGameInputFrame` diagnostics and one-shot trigger edge consumption.

## HOW

- Keep this module browser-free and rendering-free.
- Do not import camera capture, hand tracking, diagnostic workbench, rendering, gameplay, or app shell modules.
- Use existing front aim and side trigger frame contracts; do not inspect landmarks here.
