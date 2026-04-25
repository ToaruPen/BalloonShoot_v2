# AGENTS.md

## WHY

- `src/app/` coordinates the browser-facing app flow without owning domain logic.

## WHAT

- `balloonGamePage.ts`: screen rendering, camera permission flow, and camera selection.
- `balloonGameRuntime.ts`: runtime orchestration for cameras, tracking, fusion, gameplay, rendering, HUD, and audio.
- `gameHud.ts`: HUD and result-panel HTML rendering.
- `loadBalloonSpritesAdapter.ts`: browser image loading for runtime balloon sprites.

## HOW

- Keep screen transitions explicit.
- Avoid placing gameplay rules or MediaPipe-specific logic here.
- Keep reusable logic in `src/features/` or `src/shared/`.
