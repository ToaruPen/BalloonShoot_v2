# Firing Stability Investigation Kickoff

Date: 2026-04-11 (revised — narrowed scope)
Requested by: SankenBisha
Owner for this session: Codex (advisor mode, read-only)

This document is both a durable handoff and a prompt for `codex exec`. The task has two sides:

1. **Verify or refute a specific hypothesis** that Claude has formed from a code read and a first round of web research, and
2. **Review the existing design** (current specs, plans, and the code on two branches) to say whether the design is sound, or whether it needs replacement.

> **Governing constraint from the user (2026-04-11, revised):** "I don't want to lose UX quality, I don't want a large implementation volume. I want to make this work with the stack we already have. Is MediaPipe Hand Landmarker alone fundamentally insufficient for this use case, or are we just not using it correctly? Investigate that first." The bar for 'more code / more deps / more UX friction' is very high; anything that violates it must be justified with hard evidence.

## The problem, in the user's words

- PR #34 replaced the **thumb-hammer trigger** with an **index-curl trigger**.
- On the curl build (current branch `feat/issue-32-index-curl-trigger`, parked as draft PR #34) the user reports:
  - Crosshair tracking of the index fingertip got worse.
  - Firing barely succeeds at all.
  - Once tracking is lost, recovery is hard.
  - Subjectively not intuitive — curling the index finger fights with aiming the same finger.
- The user also tested the pre-existing **thumb-hammer** build on `main`. Firing is unstable there too, just differently.
- Net: both implementations fail to give a reliable "aim and fire" loop for children on a webcam.
- Previous stabilization attempts `#24` (thumb geometry), `#29` (live trigger stabilize), `#31` (intent inference redesign), `#32` (curl rewrite) all failed to make the experience reliable. This is why we are asking for a **root-cause triage**, not another incremental fix.

## Claude's preliminary hypothesis (to verify or refute)

Claude has done a code read of both implementations (curl on the current branch, thumb on `main`) and a first web-research pass on MediaPipe stability practice in 2026. The preliminary hypothesis, ranked by confidence, is below. Codex should treat every claim here as a hypothesis to test, not as ground truth. If the research or the design review contradicts any of this, **say so plainly.**

### H1 — High confidence. The root cause is that we never filter the raw MediaPipe landmark stream.

- Raw `HandLandmarker.detectForVideo()` output jitters every frame from pixel quantization, ISO noise, and model uncertainty. This is documented and well known in the MediaPipe community.
- The de-facto fix in serious interactive hand-tracking UIs in 2026 appears to be a **OneEuro filter** applied per-landmark before any downstream logic. Google's own MediaPipe internal calculators include a OneEuro implementation (`mediapipe/util/filtering/one_euro_filter.cc`), and multiple community references use it for post-processing HandLandmarker output. There are small portable ports in ~50 LoC with zero dependencies.
- Community starting parameters seen in sources: `min_cutoff ≈ 1.0`, `beta ≈ 0.007`. Adaptive behaviour: aggressive smoothing when stationary, minimal smoothing during fast motion — the exact shape an aim-and-fire loop needs.
- In our current pipeline, raw landmarks flow straight into `createHandEvidence` → `mapHandToGameInput` → `shotIntentStateMachine`, and the state machine compensates for noise with frame-count hysteresis downstream. This is **inverted**: we are using a state-machine layer to paper over perception noise that should be killed upstream. The long history of stabilization attempts (`#24`, `#29`, `#31`, `#32`) is evidence of that inversion: each iteration kept adding state-machine gates instead of filtering the source.
- **If H1 is right, the single highest-leverage fix is inserting a OneEuro pass at the `createMediaPipeHandTracker` → `buildHandEvidence` seam — ~50 LoC, no new deps, no UX change, no new screens.**

### H2 — Medium confidence. Once landmarks are filtered, most state machine complexity becomes unnecessary.

- `shotIntentStateMachine`'s 6 phases, grace frames, tracking-recovery resets, `hasSeenStableOpen` gating, multi-frame confirmation counters, and crosshair lock/release dance look like cumulative noise compensation, not irreducible domain logic.
- With a clean filtered input, we can probably collapse the state machine significantly, move timing from frame counts to ms, and let the thumb-hammer contract (the spec's authoritative input) actually work as the original design intended.
- H2 is a second-step consequence of H1, not a standalone claim. Confirm H1 empirically before touching the state machine.

### H3 — Low confidence, flagged with 3 specific risks. GestureRecognizer swap is tempting but probably does not fit.

Claude's first instinct was to propose swapping `HandLandmarker` for **MediaPipe Gesture Recognizer** (same `@mediapipe/tasks-vision` package, returns the 21 landmarks plus classified gestures `None / Closed_Fist / Open_Palm / Pointing_Up / Thumb_Up / Thumb_Down / Victory / ILoveYou`). At first this looked like a clean "use the right MediaPipe primitive" fix. An independent review surfaced three specific risks that demote this to a secondary option:

1. **`Closed_Fist` is the curl problem again, worse.** Firing via a fist-close closes ALL fingers including the aiming index, so the crosshair becomes undefined *exactly* during the fire gesture — the same fundamental conflict the user already reported on the curl build, amplified.
2. **`Pointing_Up` is likely orientation-locked.** The name and Google's canonical gesture set suggest "index pointing upward in the image frame." A forward-aimed finger-gun may not register as `Pointing_Up` at all. **This is unverified by Claude.** If it is in fact orientation-locked, the GestureRecognizer path collapses for the gun-pose use case and there is no built-in gesture we can use.
3. **GestureRecognizer is a black box.** The internal logic of the 8 built-in gestures is not tunable (only the detection confidence threshold is). Custom gestures require Model Maker with training data, which contradicts the "minimal implementation" constraint. The PoC explicitly wants debug sliders for live threshold adjustment — GestureRecognizer can't offer that.

**Codex should empirically verify risk (2)** — does `Pointing_Up` fire for a forward-aimed index finger, or is it orientation-locked — because if it is orientation-locked, H3 is effectively dead. If it is NOT orientation-locked, H3 reopens and becomes worth a second look as a fallback.

## What Codex is asked to do

### Task A — Independent research on the hypothesis

Use `WebFetch` / `WebSearch`, and prefer primary sources (Google MediaPipe docs, google-ai-edge/mediapipe GitHub issues, peer-reviewed papers) over StackOverflow answers. Cite URLs with dates for every empirical claim.

1. **Verify or refute H1.** Is OneEuro (or comparable) filtering of MediaPipe landmark output actually the de-facto practice in 2026 for interactive UI? Are there reference implementations in JavaScript/TypeScript that target hand tracking specifically? What `min_cutoff` and `beta` values do serious projects use, and do they vary by sample rate? Are there known failure modes (latency penalty, over-smoothing on intentional fast motion, z-axis quirks)? Does MediaPipe Hand Landmarker v0.10.34 (our pin) expose any built-in smoothing option that we are missing, or do we have to do it downstream?
2. **Verify or refute H3 risk (2) specifically.** Does `GestureRecognizer`'s `Pointing_Up` fire for a forward-aimed index finger, or does it require a literal upward orientation? Pull Google's canonical definition of the gesture if it exists. If no canonical definition is published, say that and describe a small, disposable probe we could run live to test it.
3. **Check for obvious alternatives Claude missed.** Is there a stable MediaPipe-native technique for "finger-gun gesture → trigger" that Claude's hypothesis doesn't cover (angle-based joint-bend detection, frame-rate-aware debounce, per-landmark visibility scores, something else)? Cite any credible examples. If nothing beats H1, say so plainly.
4. **Confirm the stack floor.** Is raw MediaPipe Hand Landmarker v0.10.34 fundamentally inadequate for stable aim-and-fire on children's hands, independent of whether we filter it? If yes, which specific limitation shows up (small-hand training data gap, z-axis instability documented by Google, per-landmark confidence absence, anything else)? If no, confirm that filtering + minor tuning is the correct strategy for this PoC.

### Task B — Review the existing design

Read these in order and form an independent opinion:

1. `docs/superpowers/specs/2026-04-08-poc-foundation-design.md` — authoritative PoC design; names thumb-hammer as the input contract.
2. `docs/superpowers/specs/2026-04-11-index-curl-trigger-design.md` — the curl rewrite design.
3. `docs/superpowers/plans/2026-04-08-poc-implementation.md` — base implementation plan (large; target `input-mapping` / `trigger` sections specifically).
4. `docs/superpowers/plans/2026-04-09-thumb-trigger-geometry-fix.md` — prior thumb stabilization attempt.
5. `docs/superpowers/plans/2026-04-11-index-curl-trigger-implementation.md` — curl implementation plan.
6. The actual code on both branches — curl on the current checkout; thumb on `main` via `git show main:<path>` (see "Reading `main`" below).

Answer these design-review questions explicitly:

1. Is the original PoC design (`2026-04-08-poc-foundation-design.md`) still sound given current practice, or does it omit the perception-layer filter as a first-class concern that it should have included?
2. Was the curl rewrite (`2026-04-11-index-curl-trigger-design.md`) justified by evidence, or did it treat a symptom (noisy trigger) with the wrong fix (changing trigger semantics instead of filtering the input)?
3. Where in the existing design and code do **complexity drivers** live that wouldn't need to exist with a filtered signal? Point at specific files and line ranges.
4. Is there anything structural in `shotIntentStateMachine`, `createHandEvidence`, or `mapHandToGameInput` that would obstruct dropping in a OneEuro filter at the perception seam, or is the seam already clean enough?

### Task C — Produce a minimal change proposal

Based on A + B, produce **one recommended path plus one fallback**. For each:

- Which hypothesis it validates or replaces.
- Which **specific files** it touches and which it deletes. Target a **net-zero or net-negative** line delta if possible.
- What it costs in approximate lines and in new dependencies. **Target: zero new dependencies.**
- What it buys — which specific user-reported failure it eliminates (poor crosshair tracking, firing not working, recovery after tracking loss, or all three).
- A concrete interaction contract for the player — what the hand physically does to aim and to fire.
- A **falsifiable empirical test** the user can run in Chrome within a few minutes to decide whether the change actually worked.

### Task D — Challenge Claude

If Codex disagrees with any part of Claude's hypothesis or observations, say so explicitly with evidence. Specifically:

1. Is Claude wrong that OneEuro is the highest-leverage fix? If so, what is?
2. Is Claude wrong about the 3 risks flagged for GestureRecognizer? If `Pointing_Up` actually fires for a forward-aimed index (i.e. risk 2 is false), H3 reopens as a fallback.
3. Are the code-read breadcrumbs in the "Observations" section below accurate, or wrong?
4. Is there a much simpler answer Claude didn't see?

Do not be diplomatic. The user wants the sharpest possible independent opinion, not a rubber stamp.

## Current state of the repo

- Working branch: `feat/issue-32-index-curl-trigger` (parked as draft PR #34). Code is fully migrated to index-curl:
  - `src/features/input-mapping/evaluateIndexCurl.ts`
  - `src/features/input-mapping/shotIntentStateMachine.ts` (curl-based phases)
  - `src/features/input-mapping/evaluateGunPose.ts` (3-finger-fold only; index extension moved out)
  - `src/features/input-mapping/createHandEvidence.ts`
  - `src/features/input-mapping/mapHandToGameInput.ts`
  - `src/features/hand-tracking/createMediaPipeHandTracker.ts`
  - Config in `src/shared/config/gameConfig.ts` (curl thresholds, not thumb thresholds)
  - `evaluateThumbTrigger.ts` has been **removed** on this branch (commit `c677589`).
- `main` still carries the thumb-hammer implementation at the same paths with different contents.
- A parallel branch `codex/thumb-trigger-live-debug` also exists.

## Reading `main` without switching branches

Do not `git checkout`. Use `git show`:

```bash
git show main:src/features/input-mapping/evaluateThumbTrigger.ts
git show main:src/features/input-mapping/shotIntentStateMachine.ts
git show main:src/features/input-mapping/mapHandToGameInput.ts
git show main:src/features/input-mapping/evaluateGunPose.ts
git show main:src/features/input-mapping/createHandEvidence.ts
git show main:src/shared/config/gameConfig.ts
git show main:src/features/hand-tracking/createMediaPipeHandTracker.ts
```

List more with `git ls-tree main src/features/input-mapping/`.

## Commit history worth skimming

```
318c354 fix(input-mapping): release lock when armed curl is aborted back to extended
2bc3771 refactor(input-mapping): simplify pass — clean up runtime ownership
19e731b test(e2e): insert partial bridge frame into issue-30 curl sequences
001b305 chore(input-mapping): clean up knip findings and reduce classify complexity
c677589 chore(input-mapping): remove legacy thumb trigger module and tests
85cd34c feat(debug): replace thumb sliders with curl telemetry and ratio history
802e903 feat(input-mapping): switch shot intent state machine to curl model
f8d2400 fix(input-mapping): preserve gun-pose hysteresis contract for finger wobble
e97736e refactor(input-mapping): narrow gun-pose to three-finger fold check
fd1d450 fix(input-mapping): correct partial confidence formula
f9818fa fix(input-mapping): enforce hysteresis gap on partial → extended
87a3975 feat(input-mapping): add evaluateIndexCurl 3-state measurement
1576e12 refactor(config): replace thumb trigger thresholds with index curl thresholds
d451c12 feat(hand-tracking): expose indexPip and indexDip landmarks
917f9e0 feat(input-mapping): redesign finger-gun intent inference (#31)
0feb709 [codex] Align crosshair mapping with mirrored crop (#28)
15661b9 fix: stabilize live trigger input (#29)
d04fe1d [codex] Improve thumb trigger geometry for #22 (#24)
```

## Observations from a code read — breadcrumbs, not conclusions

These are things that caught Claude's eye while reading the current curl build and the thumb build on `main`. Treat them as hypotheses. Verify or reject each one against the actual files and, where possible, empirical traces.

### Thumb-hammer build (`main`)

1. **Trigger geometry is fragile.** `measureThumbPull` projects `(thumbTip - thumbIp)` onto the `(indexMcp - thumbIp)` axis and normalizes by `handScale = hypot(indexMcp - wrist)`. Both the projection axis and the normalization denominator are built from jittery landmarks. Small wrist jitter warps the axis direction and the hand-scale denominator on every frame.
2. **Hysteresis gap is extremely small.** `INPUT_TRIGGER_PULL_THRESHOLD = 0.18`, `INPUT_TRIGGER_RELEASE_THRESHOLD = 0.1` gives an 8% band, and `HYSTERESIS_GAP = 0.01` (1% of hand scale) in `normalizeTriggerTuning` is so tight that landmark noise can ride right over it.
3. **Gun pose uses an absolute y-axis check.** `evaluateGunPose` on main requires `indexTip.y < indexMcp.y` AND ≥2 of (middle/ring/pinky) folded below `indexMcp.y + handScale * 0.25`. A tilted hand (child holding the laptop on their lap, finger pointing sideways, camera angled down) can fail `indexExtended` even though the gesture is fine.
4. **`hasSeenStableOpen` adds an extra gate.** After any pose loss reset, the state machine needs a stable-open frame streak before `ready` can be reached. Combined with tight frame-count timing, any MediaPipe hiccup forces the user to re-enter the full `idle → ready → armed → fired` chain.
5. **Frame-based timing with no FPS compensation.** `TRIGGER_CONFIRMATION_FRAMES = 2` and `TRIGGER_RELEASE_FRAMES = 2` assume 30 fps; at 15 fps the required hold time silently doubles.

### Index-curl build (current branch)

1. **`zAssistWeight` is declared but never used.** `evaluateIndexCurl.ts` normalizes it in `normalizeTuning` yet `classify` only consumes `ratio`. The z-delta assist the design doc hints at is not actually wired in.
2. **`computeRatio` is a raw 2D distance ratio.** Curling the index finger makes the tip move toward the palm, and MediaPipe's `indexTip` landmark becomes noisier the more the finger is tucked because less finger silhouette is visible. The curl measurement lives exactly where the landmark is least reliable.
3. **Crosshair snap-lock fights tracking recovery.** On `extended → partial` transition `mapHandToGameInput` freezes `lockedCrosshair`. If MediaPipe noise pushes a genuinely-extended frame into `partial` for one frame, the crosshair snaps to a stale position — matching the user's "tracking feels worse on curl" report.
4. **Gun-pose confidence shape is subtly capped.** `measureGunPose` returns `min(rawConfidence, FIRE_ENTRY - ε)` when not detected — a 1-folded-finger frame contributes confidence just under the entry threshold, creating a narrow "armed but not re-armable" band.
5. **Curl state needs 2 consecutive `curled` frames to fire, but `partial` transitions are 1 frame.** Every false `partial` detection imposes a full extended-confirmation round-trip to clear.
6. **Tracking recovery still resets everything.** `withTrackingLossReset` zeros counters, so after a single dropped frame the user is back to needing stable-extended before they can even start arming.

### Cross-cutting concerns

1. **Single point of perception.** `createMediaPipeHandTracker` runs `detectForVideo` per frame with no temporal smoothing, no Kalman/OneEuro filter, no per-landmark confidence propagation. Every decision downstream is computed from raw MediaPipe output.
2. **All logic is frame-based.** Nothing in `shotIntentStateMachine` uses `frameAtMs`. Timing is always "N consecutive frames," which silently couples interaction quality to variable frame rate.
3. **Pose and intent are entangled.** `shotIntentStateMachine` owns `gunPoseActive`, tracking recovery, curl/trigger confirmation, crosshair lock, and reject reasons — all six phases × multiple reset helpers. Any new signal would have to land in the middle of this tangle.
4. **Crosshair smoothing alpha is fixed at `0.28`.** Roughly a 6-frame (200 ms at 30 fps) time constant — reasonable for aiming, but the same smoothing applies during the fire window, when either zero smoothing or a hard freeze is actually wanted.

## Constraints on improvement proposals

Hard constraints (2026-04-11 revised):

- **Stay on the current stack.** `@mediapipe/tasks-vision` is installed; no new ML runtimes, no TFJS, no new JS libraries unless there is overwhelming evidence the stack floor is hit.
- **Minimal implementation volume.** Net code delta should be small. Deleting code to offset new code is welcome.
- **Do not degrade UX.** No visible pre-game calibration wizard. No extra steps between the user wanting to play and the game running. No new on-screen UI unless it replaces something existing.
- **Keep debug tunability.** The debug panel must keep sliders for threshold adjustment during live play with children. Anything that removes tunability must be justified.

Soft constraints:

- Prefer fixes in the perception layer over fixes in the state machine.
- Prefer deleting code over adding code when the two are equivalent.
- Prefer empirically-testable fixes the user can try in Chrome in under a minute.

Off the table unless this investigation proves the stack floor is hit:

- ML gesture recognizers (`fingerpose`, custom MLP, Model Maker custom gestures).
- Visible pre-game calibration wizards.
- Multi-hand support.
- Any hardware assumption beyond a standard laptop webcam.

## Deliverables from Codex

1. **Task A report** with sourced verdicts on H1 / H2 / H3 and the stack-floor question.
2. **Task B design review** with answers to all four design-review questions and specific file references.
3. **Task C change proposal** — one recommended + one fallback — with interaction contract, files touched/deleted, approximate line delta, and a falsifiable empirical test.
4. **Task D challenge list** — all the places Codex disagrees with Claude, with evidence.

All text output. **Do not edit any files in this pass.** A subsequent session will take Codex's output and drive writing the plan via `superpowers:writing-plans`, then execution via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

## Suggested invocation

Claude will run this in the background per the `/codex` skill guidance:

```bash
codex exec \
  -s read-only \
  -c 'approval_policy="never"' \
  -c 'model_reasoning_effort="high"' \
  --json \
  "Read docs/superpowers/handovers/2026-04-11-firing-stability-investigation-kickoff.md end-to-end and produce Tasks A / B / C / D exactly as described. Read-only diagnosis + design review — do not edit any files. Use WebSearch/WebFetch freely and cite sources with URLs for every empirical claim. Be direct and challenge Claude's hypothesis if the evidence disagrees." </dev/null
```
