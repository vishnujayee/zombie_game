# CLAUDE.md — WARD 13

First-person retro horror zombie shooter. One level. Plain JS + Canvas raycaster. Runs by double-clicking `index.html`.

## Read first (every session)
1. This file: rules + checkpoint status.
2. `docs/superpowers/specs/2026-11-12-ward13-design.md`: **what** to build (numbers, level flow).
3. `docs/ARCHITECTURE.md`: **how** it's built (modules, contracts, events, pipeline).
4. `docs/superpowers/plans/2026-11-12-ward13.md`: the step-by-step plan. Resume at the first unchecked step.

Find the current position quickly: `grep -n "CLAUDE:" CLAUDE.md`

## Hard rules (do not break)
- **No ES modules, no bundler, no runtime deps.** Classic `<script>` tags only; everything hangs off `window.W13`.
- **No `fetch`/XHR at runtime.** It breaks on `file://`. Audio goes through `HTMLAudioElement`; art is generated into canvases.
- **Assets:** only CC0 (or self-generated). Every file goes in `assets/sfx/CREDITS.md` with source + license. Every sound ID must have a procedural fallback.
- **All tuning numbers live in `js/config.js`.** No magic numbers in logic.
- **One job per file.** If a file passes ~400 lines, split it.
- **Every module has `reset()`.** Event listeners are registered once at boot, never inside `reset()`.
- **Zero console errors** at all times. Warnings only for asset fallbacks.
- **Original content only.** No names, maps, sprites or music copied from existing games.
- Keep the game loop wrapped in try/catch → pause overlay on error.

## Git
- Branch: `claude/funny-thompson-f6u2zo`.
- **Do not commit unless the user explicitly asks.** (User instruction, 2026-11-12.)

## Quality gate (run after every milestone)
1. `node tests/validate-map.js` passes (once it exists).
2. `node tests/e2e.js` passes: zero console errors, state transitions OK (once it exists).
3. Take a screenshot (deviceScaleFactor 1 for self-check) and look at it: is it dark, readable, retro?
4. Update the checkpoint below: tick it, add a one-line note, set `CLAUDE:CURRENT`.

## Run
- Play: open `index.html` in Chrome/Firefox. Debug: `index.html?debug=1` (G god, N skip wave, C noclip).
- Tests: `node tests/validate-map.js` · `node tests/e2e.js` (uses the preinstalled Playwright; do NOT run `playwright install`).

## Checkpoints
<!-- CLAUDE:CURRENT M0 -->
<!-- Tick boxes and append a short note when a milestone passes its quality gate. -->

- [x] <!-- CLAUDE:CHECKPOINT M0 --> **M0 Planning**: spec, architecture doc, CLAUDE.md written. Plan: `docs/superpowers/plans/2026-11-12-ward13.md` (12 tasks).
- [ ] <!-- CLAUDE:CHECKPOINT M1 --> **M1 Engine skeleton**: index.html, config/util/events, game loop + state machine, input + pointer lock, raycaster with flat-colour walls on a test map.
- [ ] <!-- CLAUDE:CHECKPOINT M2 --> **M2 Map & textures**: full 32×32 Ward 13 map, zones/doors, procedural wall textures, distance darkness, flicker lights, map validator test.
- [ ] <!-- CLAUDE:CHECKPOINT M3 --> **M3 Player & weapons**: collision, pistol + shotgun view-models, hitscan, reload, ammo, pickups.
- [ ] <!-- CLAUDE:CHECKPOINT M4 --> **M4 Enemies**: sprites + anims, AI state machine, LOS, steering, Shambler/Runner/Bloater, damage both ways.
- [ ] <!-- CLAUDE:CHECKPOINT M5 --> **M5 Waves & boss**: wave director script, scripted doors, The Stitched with phase 2, exit gate, stuck-enemy safety net.
- [ ] <!-- CLAUDE:CHECKPOINT M6 --> **M6 Audio**: CC0 files + CREDITS.md, procedural fallbacks for every ID, positional audio, ambience, heartbeat.
- [ ] <!-- CLAUDE:CHECKPOINT M7 --> **M7 Effects & HUD**: scanlines, grain, vignette, flash, shake, low-health, bitmap-font HUD, messages.
- [ ] <!-- CLAUDE:CHECKPOINT M8 --> **M8 Screens & polish**: title/pause/dead/victory, stats, opening scare, difficulty tuning pass, README.
- [ ] <!-- CLAUDE:CHECKPOINT M9 --> **M9 Verification**: full e2e playthrough via debug hooks, death/restart test, screenshots of each zone delivered to user.

## Decisions log
- 2026-11-12: Chose a first-person raycaster (option B) over top-down. Mixed assets (procedural art + CC0 sounds with procedural fallback). Pistol + shotgun. 5–8 min, medium. Setting: abandoned asylum "Ward 13". Boss: "The Stitched".
- 2026-11-12: User asked for no commits; checkpoints tracked with `<!-- CLAUDE:... -->` tags in this file.

## Notes for future sessions
<!-- CLAUDE:NOTES -->
- (empty)
