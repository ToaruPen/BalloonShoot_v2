# AGENTS.md

## WHY

- `BalloonShoot_v2` is a Chrome-first browser PoC for after-school daycare use.
- The current goal is to validate two-camera input: front-camera aiming plus side-camera trigger judgment for simple balloon gameplay on ordinary laptops.

## WHAT

- `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`: authoritative PoC design
- `docs/superpowers/plans/2026-04-08-poc-implementation.md`: implementation plan
- `docs/superpowers/handovers/2026-04-08-implementation-session-handoff.md`: latest session handoff
- `src/AGENTS.md`: source tree guidance
- `tests/AGENTS.md`: test tree guidance
- `docs/AGENTS.md`: docs tree guidance
- `public/AGENTS.md`: static asset guidance

## HOW

- Keep gameplay, input mapping, rendering, and browser adapters separate.
- Treat `lint`, `typecheck`, and `test` as blocking checks once the toolchain exists.
- Resolve review comments after the corresponding fix is implemented and verified.
- Create pull requests as ready for review by default; use draft only when explicitly requested.
- Write every `AGENTS.md` in English and add a sibling `CLAUDE.md` symlink in the same directory.
- Add more scoped guidance in the directory where the work happens instead of expanding this file.
