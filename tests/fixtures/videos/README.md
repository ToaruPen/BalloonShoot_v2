# Finger-gun gesture fixtures

Captured webcam recordings used as reproducible input for the finger-gun trigger pipeline (OneEuro filter → thumb-cosine → shot intent state machine). Record-once-iterate-forever: threshold / state-machine / filter changes can be replayed against the same landmark stream without needing the author to re-do the gesture.

## Files

| File | Hand | Duration | Frames | Pulls |
|---|---|---|---|---|
| `right-hand.mov` | Right | 21.87s | 656 @ 30fps | ~20 |
| `left-hand.mov` | Left | 22.70s | 681 @ 30fps | ~20 |

Both clips simulate realistic play: the hand is in motion (aim drift) while the thumb hammer executes the pull gesture, not a still studio pose.

Source: Photo Booth on macOS. Native resolution 1620×1080, 30fps, front-facing webcam. Mirrored as Photo Booth presents (left/right in the file names refer to the physical hand, not the on-screen side).

## Intended usage

1. A fixture extractor feeds each video into MediaPipe HandLandmarker and saves the per-frame landmark stream as JSON (`right-hand.landmarks.json`, `left-hand.landmarks.json`). The video itself is kept as the source of truth; the JSON is the fast replay format for vitest.
2. Unit/integration tests load the JSON, drive `createHandEvidence` → `mapHandToGameInput`, and assert the number of shots fired, phase transitions, and optional labeled pull indices.
3. Threshold and state-machine changes must not reduce the shot count without an explicit expected-value update.

### Commands

- `npm run test:replay` — run the replay regression suite against the current JSON fixtures
- `npm run bench:extract` — regenerate JSON fixtures using an already-running Vite dev server
- `npm run bench:refresh` — start a local Vite server, regenerate both fixture JSON files, then stop the server

## What this fixture IS and IS NOT

**IS**: a ground truth for signal-shape questions — "does the current pipeline turn a realistic thumb-hammer gesture into exactly one shot?". Universal characteristics like transient pulse width, raw-vs-filtered peak shaving behavior, and state-machine debouncing adequacy can be iterated against it with high confidence.

**IS NOT**: a ground truth for absolute threshold values. Cosine thresholds tuned against this data are biased to the author's hand, distance, lighting, and webcam. For production, thresholds should come from a per-session calibration phase rather than being baked in.

## Storage

The `.mov` files are ~33 MB each. See `.gitignore` / Git LFS configuration before committing — the binaries are deliberately kept out of regular git history to avoid repo bloat. Regenerate the JSON landmark stream from the source video whenever MediaPipe is updated.
