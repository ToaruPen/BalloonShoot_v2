# Arcade Polish Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current temporary-looking game presentation with the approved Arcade Celebration direction: generated cohesive balloon/UI assets, contained Canvas crosshair, shot/hit animation, polished HUD/result UI, and cleaner audio handling.

**Architecture:** Keep gameplay, camera, input fusion, scoring, and session timing unchanged. Add visual identity through the existing rendering, HUD, CSS, audio, and static asset boundaries. Canvas owns moving gameplay feedback; generated PNGs provide balloon and UI sticker assets.

**Tech Stack:** Vanilla TypeScript, Canvas 2D, Vite static assets, Vitest, Playwright, built-in `image_gen` skill with chroma-key removal for transparent PNGs.

---

## Scope And Constraints

- Do not change hand tracking, front aim, side trigger, input fusion, scoring, or game session duration.
- Do not use emoji in UI, generated assets, or copy.
- Do not introduce React, Phaser, an icon library, or a design system package.
- Do not commit unless the user explicitly asks.
- Keep `AGENTS.md` / `CLAUDE.md` files as-is unless a scoped instruction becomes stale during implementation.

## File Map

- Create `src/features/rendering/arcadeTheme.ts`: shared palette, reticle sizing, and effect durations.
- Create `src/features/rendering/arcadeEffects.ts`: pure effect timing and deterministic hit-pop particle helpers.
- Modify `src/features/rendering/drawGameFrame.ts`: draw final crosshair, shot shrink, hit ring, shards, and floating score.
- Modify `src/app/balloonGameRuntime.ts`: store timed shot/hit visual effects and pass `frameNowMs` into rendering.
- Modify `src/app/gameHud.ts`: emit arcade HUD/result markup with stable classes and no emoji.
- Modify `src/styles/app.css`: style HUD/result with approved palette, hard shadows, and readable layout.
- Modify `src/features/audio/createAudioController.ts`: add named volume constants and BGM ducking methods.
- Modify `src/app/loadBalloonSpritesAdapter.ts`: point to generated arcade balloon assets when ready.
- Add generated source assets under `src/assets/images/arcade/`.
- Add runtime assets under `public/images/arcade/` and `public/images/balloons/arcade/`.
- Update tests under `tests/unit/features/rendering/`, `tests/unit/app/`, `tests/unit/features/audio/`, and `tests/integration/`.

## Task 1: Generate And Place Cohesive Image Assets

**Files:**
- Create: `src/assets/images/arcade/balloons/normal-candy-source.png`
- Create: `src/assets/images/arcade/balloons/normal-mint-source.png`
- Create: `src/assets/images/arcade/balloons/small-alert-source.png`
- Create: `src/assets/images/arcade/ui/star-badge-source.png`
- Create: `src/assets/images/arcade/ui/hit-spark-source.png`
- Create: `src/assets/images/arcade/ui/confetti-ribbon-source.png`
- Create: `public/images/balloons/arcade/normal-candy.png`
- Create: `public/images/balloons/arcade/normal-mint.png`
- Create: `public/images/balloons/arcade/small-alert.png`
- Create: `public/images/arcade/ui/star-badge.png`
- Create: `public/images/arcade/ui/hit-spark.png`
- Create: `public/images/arcade/ui/confetti-ribbon.png`

- [ ] **Step 1: Generate the normal candy balloon source**

Use the built-in `image_gen` skill with this prompt:

```text
Use case: stylized-concept
Asset type: game sprite source, transparent background needed after chroma-key removal
Primary request: a single child-friendly arcade balloon sprite for BalloonShoot_v2
Subject: one vertical oval balloon with a tiny tied knot and short string stub
Style/medium: polished 2D sticker illustration, thick ink outline, hard offset shadow, clean arcade toy feel
Composition/framing: centered single object, full object visible, generous padding
Color palette: main fill #ff5a8a, outline #1a1430, highlight #fff5e1, shadow uses #1a1430 only
Constraints: perfectly flat solid #00ff00 chroma-key background; no text; no emoji; no face; no extra balloons; no icon-library style; no gradient background; no floor shadow; no watermark
Avoid: photorealism, glossy 3D plastic, neon glow, purple-pink generic gradient, soft blurred drop shadow
```

- [ ] **Step 2: Generate the normal mint balloon source**

Use the same prompt as Step 1, changing `main fill #ff5a8a` to `main fill #00d1b2`.

- [ ] **Step 3: Generate the small alert balloon source**

Use the same prompt as Step 1, changing:

```text
Subject: one smaller vertical oval balloon with a tiny tied knot and short string stub
Color palette: main fill #ffb400, outline #1a1430, highlight #fff5e1, shadow uses #1a1430 only
```

- [ ] **Step 4: Generate the star badge source**

Use the built-in `image_gen` skill with this prompt:

```text
Use case: stylized-concept
Asset type: result screen sticker asset, transparent background needed after chroma-key removal
Primary request: one chunky five-point star badge for a child-friendly arcade result screen
Style/medium: polished 2D sticker illustration, thick ink outline, hard offset shadow
Composition/framing: centered single star, full object visible, generous padding
Color palette: fill #ffb400, inner highlight #fff5e1, outline #1a1430, shadow #1a1430
Constraints: perfectly flat solid #00ff00 chroma-key background; no text; no emoji; no face; no extra icons; no watermark
Avoid: realistic metal, emoji star, generic app icon, soft glow, rainbow colors
```

- [ ] **Step 5: Generate the hit spark source**

Use this prompt:

```text
Use case: stylized-concept
Asset type: hit feedback sticker asset, transparent background needed after chroma-key removal
Primary request: one compact four-point arcade spark burst
Style/medium: polished 2D sticker illustration, thick ink outline, hard offset shadow
Composition/framing: centered single spark, full object visible, generous padding
Color palette: fill #c8ff3a, small accent #fff5e1, outline #1a1430, shadow #1a1430
Constraints: perfectly flat solid #ff00ff chroma-key background; no text; no emoji; no face; no extra icons; no watermark; do not use #ff00ff anywhere in the spark
Avoid: lightning bolt icon, neon glow, rainbow particles, generic vector icon
```

- [ ] **Step 6: Generate the confetti ribbon source**

Use this prompt:

```text
Use case: stylized-concept
Asset type: result screen and high-combo confetti asset, transparent background needed after chroma-key removal
Primary request: one short curled paper ribbon confetti piece
Style/medium: polished 2D sticker illustration, thick ink outline, hard offset shadow
Composition/framing: centered single ribbon, full object visible, generous padding
Color palette: fill #40c7ff, secondary stripe #fff5e1, outline #1a1430, shadow #1a1430
Constraints: perfectly flat solid #00ff00 chroma-key background; no text; no emoji; no extra pieces; no watermark
Avoid: random confetti field, photoreal paper, soft blurred shadow, rainbow colors
```

- [ ] **Step 7: Remove chroma-key backgrounds and copy runtime PNGs**

For each generated source image, copy the selected source into its exact `src/assets/images/arcade/balloons/` or `src/assets/images/arcade/ui/` source path. Use `#00ff00` chroma key for all assets except `hit-spark-source.png`; use `#ff00ff` for hit spark because its fill is lime green. Then run:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input src/assets/images/arcade/balloons/normal-candy-source.png \
  --out public/images/balloons/arcade/normal-candy.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

Repeat with the matching source/output pairs for `normal-mint`, `small-alert`, `star-badge`, `hit-spark`, and `confetti-ribbon`. If the hit spark leaves a magenta fringe after the default command, re-run only that asset with `--edge-contract 1`.

- [ ] **Step 8: Validate generated files**

Run:

```bash
file public/images/balloons/arcade/*.png public/images/arcade/ui/*.png
```

Expected: every file reports `PNG image data` and includes alpha-capable color data such as `RGBA` or `gray+alpha`.

Run:

```bash
node -e "const fs=require('fs'); for (const p of ['public/images/balloons/arcade/normal-candy.png','public/images/balloons/arcade/normal-mint.png','public/images/balloons/arcade/small-alert.png','public/images/arcade/ui/star-badge.png','public/images/arcade/ui/hit-spark.png','public/images/arcade/ui/confetti-ribbon.png']) { if (!fs.existsSync(p)) throw new Error('missing '+p); console.log(p); }"
```

Expected: all six paths print without error.

## Task 2: Add Arcade Theme And Effect Timing Helpers

**Files:**
- Create: `src/features/rendering/arcadeTheme.ts`
- Create: `src/features/rendering/arcadeEffects.ts`
- Test: `tests/unit/features/rendering/arcadeEffects.test.ts`

- [ ] **Step 1: Write failing tests for effect timing**

Create `tests/unit/features/rendering/arcadeEffects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  activeHitPopEffects,
  createHitPopEffect,
  crosshairScaleForShot
} from "../../../../src/features/rendering/arcadeEffects";

describe("arcade effects", () => {
  it("shrinks the crosshair briefly after a shot", () => {
    const shot = { x: 100, y: 120, startedAtMs: 1_000 };

    expect(crosshairScaleForShot(shot, 1_000)).toBe(1);
    expect(crosshairScaleForShot(shot, 1_060)).toBeCloseTo(0.72);
    expect(crosshairScaleForShot(shot, 1_120)).toBe(1);
    expect(crosshairScaleForShot(undefined, 1_060)).toBe(1);
  });

  it("creates deterministic hit particles and prunes expired effects", () => {
    const effect = createHitPopEffect({
      x: 160,
      y: 180,
      points: 3,
      color: "#ff5a8a",
      startedAtMs: 2_000
    });

    expect(effect.shards).toHaveLength(6);
    expect(effect.scoreLabel).toBe("+3");
    expect(activeHitPopEffects([effect], 2_899)).toHaveLength(1);
    expect(activeHitPopEffects([effect], 2_901)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts
```

Expected: FAIL because `arcadeEffects.ts` does not exist.

- [ ] **Step 3: Add theme tokens**

Create `src/features/rendering/arcadeTheme.ts`:

```ts
export const arcadePalette = {
  ink: "#1a1430",
  cream: "#fff5e1",
  candy: "#ff5a8a",
  lime: "#c8ff3a",
  sky: "#40c7ff",
  mint: "#00d1b2",
  alert: "#ffb400"
} as const;

export const arcadeCrosshair = {
  radius: 24,
  ringWidth: 5,
  outlineWidth: 4,
  lineHalfLength: 21,
  lineWidth: 4,
  shadowOffset: 5
} as const;

export const arcadeEffects = {
  shotShrinkMs: 120,
  hitLifetimeMs: 900,
  hitRingMs: 280,
  floatingScoreMs: 700
} as const;
```

- [ ] **Step 4: Add pure effect helpers**

Create `src/features/rendering/arcadeEffects.ts`:

```ts
import { arcadeEffects } from "./arcadeTheme";

export interface TimedPointEffect {
  readonly x: number;
  readonly y: number;
  readonly startedAtMs: number;
}

export interface HitShard {
  readonly dx: number;
  readonly dy: number;
  readonly rotationDeg: number;
  readonly color: string;
}

export interface HitPopEffect extends TimedPointEffect {
  readonly points: number;
  readonly scoreLabel: string;
  readonly color: string;
  readonly shards: readonly HitShard[];
}

const shardPattern = [
  { dx: -70, dy: -54, rotationDeg: -28 },
  { dx: 46, dy: -68, rotationDeg: 34 },
  { dx: 18, dy: 62, rotationDeg: 18 },
  { dx: -42, dy: 46, rotationDeg: -78 },
  { dx: 74, dy: 28, rotationDeg: 92 },
  { dx: -8, dy: -82, rotationDeg: 12 }
] as const;

export const crosshairScaleForShot = (
  shot: TimedPointEffect | undefined,
  nowMs: number
): number => {
  if (shot === undefined) {
    return 1;
  }

  const ageMs = nowMs - shot.startedAtMs;
  if (ageMs < 0 || ageMs >= arcadeEffects.shotShrinkMs) {
    return 1;
  }

  const half = arcadeEffects.shotShrinkMs / 2;
  const progress = ageMs <= half ? ageMs / half : (arcadeEffects.shotShrinkMs - ageMs) / half;
  return 1 - 0.28 * progress;
};

export const createHitPopEffect = ({
  x,
  y,
  points,
  color,
  startedAtMs
}: {
  readonly x: number;
  readonly y: number;
  readonly points: number;
  readonly color: string;
  readonly startedAtMs: number;
}): HitPopEffect => ({
  x,
  y,
  points,
  color,
  startedAtMs,
  scoreLabel: `+${String(points)}`,
  shards: shardPattern.map((shard, index) => ({
    ...shard,
    color: index % 2 === 0 ? color : "#c8ff3a"
  }))
});

export const activeHitPopEffects = (
  effects: readonly HitPopEffect[],
  nowMs: number
): HitPopEffect[] =>
  effects.filter((effect) => nowMs - effect.startedAtMs <= arcadeEffects.hitLifetimeMs);
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npx vitest run tests/unit/features/rendering/arcadeEffects.test.ts
```

Expected: PASS.

## Task 3: Draw Final Crosshair And Hit Effects

**Files:**
- Modify: `src/features/rendering/drawGameFrame.ts`
- Modify: `tests/unit/features/rendering/drawGameFrame.test.ts`

- [ ] **Step 1: Update rendering tests for contained crosshair**

In `tests/unit/features/rendering/drawGameFrame.test.ts`, expand the mock context with `save`, `restore`, `translate`, `scale`, `fillRect`, `strokeRect`, `fillText`, and `font`/`textAlign` fields:

```ts
save: () => operations.push("save"),
restore: () => operations.push("restore"),
translate: (x: number, y: number) => operations.push(`translate:${String(x)},${String(y)}`),
scale: (x: number, y: number) => operations.push(`scale:${String(x)},${String(y)}`),
fillRect: (x: number, y: number, w: number, h: number) =>
  operations.push(`fillRect:${String(x)},${String(y)},${String(w)},${String(h)}`),
strokeRect: (x: number, y: number, w: number, h: number) =>
  operations.push(`strokeRect:${String(x)},${String(y)},${String(w)},${String(h)}`),
fillText: (text: string, x: number, y: number) =>
  operations.push(`fillText:${text},${String(x)},${String(y)}`),
font: "",
textAlign: "start",
textBaseline: "alphabetic",
globalAlpha: 1
```

Change the first test expectation from:

```ts
expect(operations).toContain("arc:200,180,24");
```

to:

```ts
expect(operations).toContain("translate:200,180");
expect(operations).toContain("arc:0,0,24");
expect(operations).toContain("move:-21,0");
expect(operations).toContain("line:21,0");
expect(operations).toContain("move:0,-21");
expect(operations).toContain("line:0,21");
expect(operations).not.toContain("arc:0,0,4");
```

- [ ] **Step 2: Add a test for timed hit effects**

Append this test:

```ts
it("draws arcade hit rings, shards, and floating score labels", () => {
  const operations: string[] = [];
  const ctx = createMockContext(operations);

  drawGameFrame(ctx, {
    balloons: [],
    crosshair: { x: 200, y: 180 },
    frameNowMs: 1_100,
    shotEffect: { x: 200, y: 180, startedAtMs: 1_050 },
    hitEffects: [
      {
        x: 200,
        y: 180,
        startedAtMs: 1_000,
        points: 3,
        scoreLabel: "+3",
        color: "#ff5a8a",
        shards: [{ dx: -70, dy: -54, rotationDeg: -28, color: "#ff5a8a" }]
      }
    ]
  });

  expect(operations).toContain("scale:0.7666666666666666,0.7666666666666666");
  expect(operations).toContain("fillText:+3,242,98");
  expect(operations.some((op) => op.startsWith("fillRect:"))).toBe(true);
});
```

- [ ] **Step 3: Run rendering tests and confirm they fail**

Run:

```bash
npx vitest run tests/unit/features/rendering/drawGameFrame.test.ts
```

Expected: FAIL because `drawGameFrame` still draws the old crosshair and does not accept timed hit effects.

- [ ] **Step 4: Update draw state types**

In `src/features/rendering/drawGameFrame.ts`, replace the existing `shotEffect` / `hitEffect` point fields with timed `shotEffect` and `hitEffects`. Remove the old singular `hitEffect` type from `DrawState`:

```ts
import {
  crosshairScaleForShot,
  type HitPopEffect,
  type TimedPointEffect
} from "./arcadeEffects";
import { arcadeCrosshair, arcadePalette } from "./arcadeTheme";

interface DrawState {
  balloons: Balloon[];
  crosshair?: { x: number; y: number } | undefined;
  shotEffect?: TimedPointEffect | undefined;
  hitEffects?: readonly HitPopEffect[] | undefined;
  balloonSprites?: BalloonSprites | undefined;
  balloonFrameIndex?: number | undefined;
  frameNowMs?: number | undefined;
}
```

- [ ] **Step 5: Add contained crosshair drawing**

Add helper:

```ts
const drawCrosshair = (
  ctx: CanvasRenderingContext2D,
  crosshair: { x: number; y: number },
  scale: number
): void => {
  ctx.save();
  ctx.translate(crosshair.x, crosshair.y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = arcadePalette.ink;
  ctx.lineWidth = arcadeCrosshair.outlineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, arcadeCrosshair.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = arcadePalette.cream;
  ctx.lineWidth = arcadeCrosshair.ringWidth;
  ctx.beginPath();
  ctx.arc(0, 0, arcadeCrosshair.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = arcadePalette.cream;
  ctx.lineWidth = arcadeCrosshair.lineWidth;
  ctx.beginPath();
  ctx.moveTo(-arcadeCrosshair.lineHalfLength, 0);
  ctx.lineTo(arcadeCrosshair.lineHalfLength, 0);
  ctx.moveTo(0, -arcadeCrosshair.lineHalfLength);
  ctx.lineTo(0, arcadeCrosshair.lineHalfLength);
  ctx.stroke();
  ctx.restore();
};
```

- [ ] **Step 6: Add hit effect drawing**

Add helper:

```ts
const drawHitEffects = (
  ctx: CanvasRenderingContext2D,
  effects: readonly HitPopEffect[],
  nowMs: number
): void => {
  for (const effect of effects) {
    const ageMs = Math.max(0, nowMs - effect.startedAtMs);
    const ringProgress = Math.min(1, ageMs / 280);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - ageMs / 900);
    ctx.strokeStyle = arcadePalette.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 20 + ringProgress * 58, 0, Math.PI * 2);
    ctx.stroke();

    for (const shard of effect.shards) {
      const shardProgress = Math.min(1, ageMs / 600);
      ctx.fillStyle = shard.color;
      ctx.strokeStyle = arcadePalette.ink;
      ctx.lineWidth = 3;
      const x = effect.x + shard.dx * shardProgress;
      const y = effect.y + shard.dy * shardProgress + 36 * shardProgress * shardProgress;
      ctx.fillRect(x - 8, y - 5, 16, 10);
      ctx.strokeRect(x - 8, y - 5, 16, 10);
    }

    ctx.font = "bold 24px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = arcadePalette.cream;
    ctx.strokeStyle = arcadePalette.ink;
    ctx.lineWidth = 4;
    ctx.fillText(effect.scoreLabel, effect.x + 42, effect.y - 82 - Math.min(24, ageMs / 20));
    ctx.restore();
  }
};
```

- [ ] **Step 7: Wire helpers into `drawGameFrame`**

At the end of `drawGameFrame`, before returning:

```ts
const frameNowMs = state.frameNowMs ?? 0;
drawHitEffects(ctx, state.hitEffects ?? [], frameNowMs);

if (state.crosshair !== undefined) {
  drawCrosshair(
    ctx,
    state.crosshair,
    crosshairScaleForShot(state.shotEffect, frameNowMs)
  );
}
```

Remove the old `shotEffect` and `hitEffect` ring drawing blocks.

- [ ] **Step 8: Run rendering tests**

Run:

```bash
npx vitest run tests/unit/features/rendering/drawGameFrame.test.ts tests/unit/features/rendering/arcadeEffects.test.ts
```

Expected: PASS.

## Task 4: Store Timed Effects In Runtime

**Files:**
- Modify: `src/app/balloonGameRuntime.ts`
- Modify: `tests/integration/balloonGameRuntime.test.ts`

- [ ] **Step 1: Update integration assertions for timed effects**

In `tests/integration/balloonGameRuntime.test.ts`, change the existing shot assertion near the repeated render ticks test from:

```ts
shotEffect: { x: 100, y: 100 }
```

to:

```ts
shotEffect: { x: 100, y: 100, startedAtMs: 4_000 }
```

and add:

```ts
hitEffects: [
  expect.objectContaining({
    x: 100,
    y: 100,
    points: 1,
    scoreLabel: "+1",
    startedAtMs: 4_000
  })
]
```

In countdown-shot tests, expect:

```ts
shotEffect: undefined,
hitEffects: []
```

- [ ] **Step 2: Run the targeted integration test and confirm it fails**

Run:

```bash
npx vitest run tests/integration/balloonGameRuntime.test.ts -t "processes one fused shot once"
```

Expected: FAIL because runtime still passes untimed point effects.

- [ ] **Step 3: Update runtime effect state**

In `src/app/balloonGameRuntime.ts`, import:

```ts
import {
  activeHitPopEffects,
  createHitPopEffect,
  type HitPopEffect,
  type TimedPointEffect
} from "../features/rendering/arcadeEffects";
import { arcadePalette } from "../features/rendering/arcadeTheme";
```

Replace:

```ts
let shotEffect: { x: number; y: number } | undefined;
let hitEffect: { x: number; y: number } | undefined;
```

with:

```ts
let shotEffect: TimedPointEffect | undefined;
let hitEffects: HitPopEffect[] = [];
```

- [ ] **Step 4: Pass timed state into drawing**

In `renderCanvas`, pass:

```ts
renderFrame(context, {
  balloons: engine.balloons,
  crosshair,
  shotEffect,
  hitEffects,
  balloonSprites,
  balloonFrameIndex,
  frameNowMs
});
```

- [ ] **Step 5: Emit and prune effects**

Inside `tick`, replace the reset:

```ts
shotEffect = undefined;
hitEffect = undefined;
```

with:

```ts
hitEffects = activeHitPopEffects(hitEffects, frameNowMs);
```

When a shot starts:

```ts
shotEffect = { ...input.shot, startedAtMs: frameNowMs };
```

When a hit occurs:

```ts
hitEffects = [
  ...hitEffects,
  createHitPopEffect({
    x: input.shot.x,
    y: input.shot.y,
    points: shotResult.points,
    color: shotResult.size === "small" ? arcadePalette.alert : arcadePalette.candy,
    startedAtMs: frameNowMs
  })
];
```

In `retry`, replace `hitEffect = undefined` with:

```ts
hitEffects = [];
```

- [ ] **Step 6: Run targeted runtime tests**

Run:

```bash
npx vitest run tests/integration/balloonGameRuntime.test.ts -t "processes one fused shot once"
```

Expected: PASS.

Run:

```bash
npx vitest run tests/integration/balloonGameRuntime.test.ts -t "ignores a shot committed before countdown completes"
```

Expected: PASS.

## Task 5: Load Generated Balloon Assets

**Files:**
- Modify: `src/app/loadBalloonSpritesAdapter.ts`

- [ ] **Step 1: Update runtime sprite paths**

In `src/app/loadBalloonSpritesAdapter.ts`, replace `FRAME_PATHS` with:

```ts
const FRAME_PATHS = [
  "/images/balloons/arcade/normal-candy.png",
  "/images/balloons/arcade/normal-mint.png",
  "/images/balloons/arcade/small-alert.png"
] as const;
```

- [ ] **Step 2: Run import/type checks**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run a production build to verify static references compile**

Run:

```bash
npm run build
```

Expected: PASS.

## Task 6: Polish HUD And Result Markup

**Files:**
- Modify: `src/app/gameHud.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/app/gameHud.test.ts`

- [ ] **Step 1: Add HUD class assertions**

Update the first `gameHud.test.ts` test with:

```ts
expect(html).toContain('class="hud hud-arcade"');
expect(html).toContain('class="hud-score-badge"');
expect(html).toContain('class="hud-timer-disc"');
expect(html).toContain('class="hud-combo-chip"');
expect(html).toContain('class="hud-multiplier-chip"');
```

Update the result test with:

```ts
expect(html).toContain("ナイスシュート");
expect(html).toContain('class="result-score"');
expect(html).toContain('class="result-stars"');
expect(html).toContain("もういっかい");
expect(html).not.toContain("🎈");
expect(html).not.toContain("🎯");
```

- [ ] **Step 2: Run HUD tests and confirm failure**

Run:

```bash
npx vitest run tests/unit/app/gameHud.test.ts
```

Expected: FAIL because current markup uses generic `.hud` and `結果`.

- [ ] **Step 3: Update HUD markup**

In `src/app/gameHud.ts`, replace the current HUD return block with:

```ts
return `
  <div class="hud hud-arcade" aria-label="ゲーム情報">
    <div class="hud-score-badge">
      <span>SCORE</span>
      <strong>${String(score)}</strong>
    </div>
    <div class="hud-timer-disc">
      <span>残り</span>
      <strong>${String(secondsRemaining(timeRemainingMs))}</strong>
    </div>
    <div class="hud-combo-chip">
      <span>コンボ</span>
      <strong>${String(combo)}</strong>
    </div>
    <div class="hud-multiplier-chip">
      <span>倍率</span>
      <strong>x${String(multiplier)}</strong>
    </div>
  </div>
  ${status}
  ${countdown}
  ${resultHtml}
`;
```

Change `resultHtml` to:

```ts
const resultHtml =
  result === undefined
    ? ""
    : `
      <section class="result-panel result-panel-arcade" aria-label="結果">
        <p class="result-kicker">RESULT</p>
        <h2>ナイスシュート</h2>
        <div class="result-score">
          <span>スコア</span>
          <strong>${String(result.finalScore)}</strong>
        </div>
        <div class="result-stars" aria-label="スター評価">
          <span></span><span></span><span></span>
        </div>
        <div class="result-grid">
          ${renderHudItem("最大コンボ", String(result.bestCombo))}
        </div>
        <button class="screen-button result-retry-button" data-game-action="retry">もういっかい</button>
      </section>
    `;
```

- [ ] **Step 4: Update CSS**

In `src/styles/app.css`, add arcade tokens near `:root`:

```css
  --arcade-ink: #1a1430;
  --arcade-cream: #fff5e1;
  --arcade-candy: #ff5a8a;
  --arcade-lime: #c8ff3a;
  --arcade-alert: #ffb400;
```

Replace `.hud` styling with classes that preserve existing layout:

```css
.hud-arcade {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
  min-height: 2rem;
  color: var(--arcade-ink);
  font-weight: 900;
}

.hud-score-badge,
.hud-timer-disc,
.hud-combo-chip,
.hud-multiplier-chip {
  border: 4px solid var(--arcade-ink);
  background: var(--arcade-cream);
  box-shadow: 5px 5px 0 var(--arcade-ink);
  color: var(--arcade-ink);
}

.hud-score-badge {
  display: grid;
  gap: 0.1rem;
  min-width: 5rem;
  border-radius: 14px;
  padding: 0.55rem 0.75rem;
  background: var(--arcade-candy);
  color: var(--arcade-cream);
  transform: rotate(-3deg);
}

.hud-score-badge span,
.hud-timer-disc span,
.hud-combo-chip span,
.hud-multiplier-chip span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  opacity: 0.9;
}

.hud-score-badge strong {
  font-size: 2rem;
  line-height: 0.95;
}

.hud-timer-disc {
  display: grid;
  place-items: center;
  width: 5.25rem;
  height: 5.25rem;
  border-radius: 50%;
  background: var(--arcade-lime);
}

.hud-combo-chip,
.hud-multiplier-chip {
  display: inline-flex;
  gap: 0.4rem;
  align-items: baseline;
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
}
```

Add result styles:

```css
.result-panel-arcade {
  border: 4px solid var(--arcade-ink);
  background: var(--arcade-cream);
  color: var(--arcade-ink);
  box-shadow: 8px 8px 0 var(--arcade-ink);
}

.result-kicker {
  margin: 0;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.result-score {
  display: grid;
  justify-items: center;
}

.result-score span {
  font-weight: 900;
}

.result-score strong {
  font-size: 4rem;
  line-height: 1;
}

.result-stars {
  display: flex;
  gap: 0.45rem;
}

.result-stars span {
  width: 2rem;
  height: 2rem;
  background: var(--arcade-alert);
  clip-path: polygon(50% 0%, 62% 34%, 98% 34%, 68% 55%, 80% 92%, 50% 68%, 20% 92%, 32% 55%, 2% 34%, 38% 34%);
  filter: drop-shadow(3px 3px 0 var(--arcade-ink));
}
```

- [ ] **Step 5: Run HUD tests**

Run:

```bash
npx vitest run tests/unit/app/gameHud.test.ts
```

Expected: PASS.

## Task 7: Add Audio Volume Tokens And BGM Ducking

**Files:**
- Modify: `src/features/audio/createAudioController.ts`
- Modify: `tests/unit/features/audio/createAudioController.test.ts`
- Modify: `src/app/balloonGameRuntime.ts`

- [ ] **Step 1: Update audio fake and tests**

In `tests/unit/features/audio/createAudioController.test.ts`, extend `FakeAudioInstance` and `FakeAudio` with:

```ts
volume: number;
```

and in the fake class:

```ts
volume = 1;
```

Add this test:

```ts
it("uses named mix levels and can briefly duck bgm", async () => {
  const audio = createAudioController();
  const bgm = (globalThis as unknown as { __createdAudio: FakeAudioInstance[] }).__createdAudio[0];

  expect(bgm?.volume).toBe(0.13);
  audio.duckBgm(0.07);
  expect(bgm?.volume).toBe(0.07);
  audio.restoreBgmVolume();
  expect(bgm?.volume).toBe(0.13);
});
```

- [ ] **Step 2: Run audio tests and confirm failure**

Run:

```bash
npx vitest run tests/unit/features/audio/createAudioController.test.ts
```

Expected: FAIL because `duckBgm` and `restoreBgmVolume` do not exist.

- [ ] **Step 3: Update audio controller**

In `src/features/audio/createAudioController.ts`, update interface:

```ts
export interface AudioController {
  startBgm(): Promise<void>;
  stopBgm(): void;
  playShot(): Promise<void>;
  playHit(): Promise<void>;
  playTimeout(): Promise<void>;
  playResult(): Promise<void>;
  duckBgm(volume: number): void;
  restoreBgmVolume(): void;
}
```

Add constants:

```ts
const audioMix = {
  bgmVolume: 0.13,
  duckedBgmVolume: 0.07,
  sfxVolume: 0.5
} as const;

const playOneShot = async (src: string): Promise<void> => {
  const audio = new Audio(src);
  audio.volume = audioMix.sfxVolume;
  await audio.play();
};
```

Inside `createAudioController` after BGM creation:

```ts
bgm.volume = audioMix.bgmVolume;
```

Add methods:

```ts
duckBgm(volume = audioMix.duckedBgmVolume): void {
  bgm.volume = volume;
},
restoreBgmVolume(): void {
  bgm.volume = audioMix.bgmVolume;
}
```

- [ ] **Step 4: Update runtime test audio factory**

In `tests/integration/balloonGameRuntime.test.ts`, update `createAudio` to include:

```ts
duckBgm: vi.fn(),
restoreBgmVolume: vi.fn()
```

- [ ] **Step 5: Duck BGM on hit**

In `src/app/balloonGameRuntime.ts`, after `play(() => audio.playHit());`, add:

```ts
audio.duckBgm(0.07);
window.setTimeout(() => {
  if (!stopped) {
    audio.restoreBgmVolume();
  }
}, 200);
```

- [ ] **Step 6: Run audio and runtime tests**

Run:

```bash
npx vitest run tests/unit/features/audio/createAudioController.test.ts tests/integration/balloonGameRuntime.test.ts
```

Expected: PASS.

## Task 8: Browser Verification And Visual Pass

**Files:**
- No code files unless verification shows a concrete issue.

- [ ] **Step 1: Run the core local checks**

Run:

```bash
npm run lint
npm run typecheck
npm run test
```

Expected: all commands exit 0.

- [ ] **Step 2: Run E2E smoke**

Run:

```bash
npm run test:e2e
```

Expected: Chromium smoke tests pass.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, typically `http://127.0.0.1:5173/`.

- [ ] **Step 4: Inspect in the in-app browser**

Open the Vite URL in the in-app browser and verify:

- Start screen still shows `BalloonShoot v2`.
- Camera selection flow still works with fake devices in tests.
- HUD uses the arcade badge layout and contains no emoji.
- Crosshair center is empty.
- Crosshair cross lines stay inside the ring.
- A shot produces a short reticle shrink.
- A hit produces hit ring, shard/floating-score feedback, and hit audio.
- Result panel makes final score the visual priority and uses `もういっかい`.

- [ ] **Step 5: Capture visual evidence**

Save at least one screenshot under an ignored path:

```text
test-results/arcade-polish-home.png
```

Do not commit the screenshot unless the user explicitly asks.

## Self-Review Checklist

- Spec coverage:
  - Generated cohesive assets: Task 1.
  - No emoji / no generic icons: Tasks 1 and 6.
  - Canvas crosshair with contained cross and no center dot: Tasks 2 and 3.
  - Shot shrink and hit feedback: Tasks 2, 3, and 4.
  - HUD/result polish: Task 6.
  - Audio direction and named volume tokens: Task 7.
  - Verification: Task 8.
- Incomplete-marker scan: this plan intentionally contains no `TBD`, `TODO`, or incomplete task markers.
- Type consistency:
  - `TimedPointEffect` contains `x`, `y`, `startedAtMs`.
  - `HitPopEffect` contains `x`, `y`, `startedAtMs`, `points`, `scoreLabel`, `color`, `shards`.
  - `drawGameFrame` receives `frameNowMs`, `shotEffect`, and `hitEffects`.
  - `AudioController` exposes `duckBgm` and `restoreBgmVolume`.
