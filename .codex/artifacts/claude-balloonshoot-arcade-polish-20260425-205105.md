# Claude consultation: BalloonShoot arcade polish

## Original user task

User selected visual direction B (Arcade Celebration) and requested consulting Claude to avoid rough AI-slop UI for layout and design.

## Final prompt sent to Claude CLI

```text
We are polishing a Chrome-first browser PoC game called BalloonShoot_v2 for after-school daycare use. Current architecture: Vanilla TypeScript + Canvas 2D, camera video as background, HUD overlay, balloon sprites, audio controller for BGM/shot/hit/time-up/result. The user selected visual direction B: "Arcade Celebration". Constraint: avoid AI-slop / rough mass-produced UI. We need a focused design recommendation before implementation.

Please advise as a product/UI designer and pragmatic frontend reviewer. Output concrete guidance for:
1. Overall visual style for a child-friendly but polished arcade feel.
2. In-game HUD layout and typography hierarchy.
3. Hit/shot visual effects that feel satisfying but not chaotic.
4. Result screen layout and copy/score presentation.
5. Audio direction for shot, hit, time-up, result music, and BGM mixing.
6. Things to avoid that would make it look like crude AI-generated UI.
7. A first implementation slice that is small and testable in this existing codebase.

Keep the answer specific to this app. Do not suggest adding React/Phaser or a design system. Keep it concise but actionable.
```

## Claude output (raw)

Here's the concrete design direction for "Arcade Celebration", tuned to your existing Vanilla TS + Canvas 2D + camera-BG stack.

## 1. Overall visual style

Pick one distinctive lane and commit. Recommended: **"Showa kids' festival meets 80s arcade marquee"** — chunky stamp/badge shapes, paper-cut silhouettes, halftone dot texture, small confetti ribbons drifting in idle.

- Palette (4 fixed tokens, no random hues):
  - `--ink: #1a1430` (near-black w/ violet tint, all text)
  - `--cream: #fff5e1` (card backgrounds)
  - `--candy: #ff5a8a` (primary accent — score, stars)
  - `--lime: #c8ff3a` (secondary accent — timer / good)
  - `--alert: #ffb400` (only for last 5 sec)
- Camera video must always be readable as game arena → apply a permanent `radial-gradient` vignette + 8% noise texture overlay so HUD elements have something to sit on.
- All HUD chrome uses **rounded chunky shapes** (12–16px radius) with a 3–4px solid `--ink` outline and a 6px offset hard shadow (no soft blur). Sticker / risograph feel, not glassmorphism.

## 2. HUD layout & typography

- Fonts (Google Fonts, both Japanese-capable, both un-AI-slop):
  - Display: **DotGothic16** or **Reggae One** for score/timer numbers
  - UI body: **M PLUS Rounded 1c** at 600 weight
  - **Forbidden**: Inter, Roboto, system-ui, any monospace.
- Layout (asymmetric on purpose, not corner-mirrored):
  - Top-left: **score badge** — tilted ~-4°, pink stamp with cream "SCORE" label (M PLUS, 14px, tracking +0.1em) and 56px display number under it.
  - Top-center: **timer disc** — circular ring gauge, 96px diameter, lime arc emptying clockwise, big numeric in center. Switches to `--alert` + 1px-amplitude pulse during last 5 seconds (no full-screen flash).
  - Bottom-right (only when relevant): combo / streak chip, slides in from edge.
- HUD never hugs the safe edges — leave 24px breathing room from viewport. Numbers use `font-variant-numeric: tabular-nums` so they don't jitter on count-up.

## 3. Hit / shot VFX (satisfying, not chaotic)

Shot (every trigger):
- Muzzle/crosshair: snap-shrink the reticle 1.0 → 0.7 → 1.0 over 120ms. No screen flash.
- Sub-100ms vignette pulse only — keeps focus on the world.

Hit (balloon pop):
- 3 layered, time-staggered pieces, all on Canvas:
  1. **Vector shards** — 5–7 chunky polygons of the balloon color, fly outward with gravity, fade in 600ms.
  2. **Star ring** — single concentric ring, 0 → 80px, stroke 4px `--ink`, 280ms ease-out, then erased.
  3. **Confetti** — 8 ribbons (not dots), random hue from palette, rotate while falling, 900ms life.
- Floating score `+10`: M PLUS bold, scales 0.8→1.15→1.0, drifts up 24px, 700ms total. Always above the pop, single shadow.
- **No screen shake on every hit.** Reserve shake for combo ≥ 5 (1px, 80ms). Daycare-safe.

## 4. Result screen

- Full-screen card on cream, 32px radius, 4px ink outline, sits on top of a frozen blurred snapshot of the camera frame (not pure black — keep continuity).
- Vertical rhythm, all left-aligned within a 480px column:
  1. Headline: **「ナイスシュート!」** (or 「おしい!」 below threshold) in Reggae One 64px.
  2. Score, count-up over 800ms with a soft tick every 50 points, ending on a small confetti burst.
  3. **Star rating** 1–3 chunky stickers, pop in sequentially at +120ms intervals with a tiny rotation overshoot.
  4. Single CTA: **「もういっかい」** — pink pill, 64px tall, ink outline + offset shadow. No secondary button.
- Copy is short, kana-heavy, second-person friendly. **Avoid English-only result words ("PERFECT!", "AMAZING!")** — feels generic / template.
- No share / leaderboard / stats table.

## 5. Audio direction

- **Shot**: muted cork-pop, ~80ms, slight random pitch ±3 semitones. Avoid anything gun-like (daycare context). Layer a soft "tok" wood click for tactility.
- **Hit**: two-layer — `pop` (low body, ~120Hz thump) + `ding` (mallet ~880Hz). Pitch the `ding` up by combo step (+1 semitone per combo, cap at +5).
- **Time-up**: descending C–A–F major-ish triad over 700ms with a final airy whistle tail. Warm, not alarm-like.
- **Result**: 1.2s major-chord stinger (3 notes, brass-ish), then BGM crossfades up.
- **BGM**: kid-friendly chiptune-ish loop, 90–110 BPM, in a major key, 16-bar loop minimum. Two BGM tracks: in-game (energetic) and result (calm). Crossfade 600ms.
- **Mixing**: SFX bus −6dB, BGM bus −18dB while in game, ducks BGM by an additional −6dB for 200ms on every hit (sidechain feel). All volumes in your `AudioController` as named tokens, never magic numbers.

## 6. AI-slop tells to avoid

- Inter / Roboto / system-ui anywhere.
- Purple→pink gradients, glassmorphic blurred panels, neon glow rings.
- Score rendered as plain `Score: 0` with default font in a corner.
- Emoji used as decoration (🎈🎯) in HUD or result.
- Evenly-spaced top-bar with score-left, timer-center, lives-right (the default everyone ships).
- Rainbow particle confetti — restrict to your 4-color palette.
- Material/Heroicons SVGs for any UI affordance.
- Soft drop shadows with 20px blur. Use **hard offset shadows** instead.
- Floating "+1" / "+10" in pure white, default sans, no outline — looks engine-default.
- Result screen with three stat rows ("Accuracy / Combo / Time") in a generic table.
- Particles that always emit upward and fade — give them gravity, rotation, and varied lifetimes.

## 7. First implementation slice (small, testable, no logic risk)

Goal: prove the visual identity end-to-end on one feedback loop without touching gameplay rules.

1. **Design tokens module** — `src/features/render/theme.ts` exporting the 4 color tokens, font stack constants, shadow offset, radius. Load Google Fonts (DotGothic16 + Reggae One + M PLUS Rounded 1c) in `index.html` with `font-display: swap`.
2. **Score badge component** — refactor the existing score readout into a `drawScoreBadge(ctx, score)` in the render layer using the tokens. Add tabular-nums, tilt, ink outline, hard shadow. Snapshot test with the replay harness.
3. **Hit-pop VFX module** — `src/features/render/effects/hitPop.ts` exposing `spawnHitPop(x,y,balloonColor)` that pushes shard + ring + confetti + floating-score particles into the existing render loop. Pure data → render; no coupling to hit detection beyond a single emit call.
4. **Audio ducking hook** — add `duckBgm(durationMs, amountDb)` to `AudioController`; call it from the same `spawnHitPop` site. One method, one test.
5. Wire `spawnHitPop` and `duckBgm` at the existing balloon-hit emission point — single call site, easy to revert.

This slice is ~5 files, no gameplay/state changes, visually + audibly verifiable on the next playtest, and locks in the aesthetic before HUD timer / result screen work begins.


## Concise summary

- Use a polished arcade layer: stable HUD, restrained palette, purposeful feedback, and clear result hierarchy.
- Favor short, layered hit feedback and balanced audio over constant decorative motion.
- First slice should touch HUD/result/effects/audio in small testable steps without new frameworks.

## Action items / next steps

- Fold Claude guidance into the design proposal for user approval.
- Keep implementation scoped to existing Canvas, HUD, CSS, and AudioController boundaries.
