# WARD 13

A first-person retro horror zombie shooter. One level, finished and playable in a desktop browser.

You wake up in Ward 13, an abandoned asylum. The power flickers and the patients have turned. Survive three waves, kill **The Stitched**, and escape through the gate.

## Play

Open `index.html` in Chrome, Edge or Firefox (double-click it). There's nothing to install and no build step. Click the screen to start; the mouse is captured for aiming.

| Control | Action |
|---|---|
| W A S D / arrow keys | Move / turn |
| Mouse | Look |
| Left click | Fire |
| R | Reload |
| 1 / 2 | Pistol / shotgun |
| Shift | Run |
| Esc | Pause |
| M | Mute |

**Debug mode:** open `index.html?debug=1` for an FPS counter and these keys: G god mode, N skip wave, C noclip.

## Level flow

1. Reception → lobby: **Wave 1** (shamblers)
2. Supply room: grab the **shotgun**, which starts **Wave 2** (runners join in)
3. Stairwell → morgue: **Wave 3** (bloaters, which burst when killed)
4. Operating theatre: boss **The Stitched**, who gets a charge attack and bile spit at half health
5. The gate opens. Run.

## Tech

Plain JavaScript and an HTML5 Canvas software raycaster at 320×200, with no dependencies. All art is procedural pixel art generated at startup. Sounds are original OGG files in `assets/sfx/` (rebuild them with `node assets/sfx/generate.js`), and every sound also has a Web Audio fallback made in code. See `docs/ARCHITECTURE.md`.

## Tests

```bash
node tests/run.js           # unit/logic tests
node tests/validate-map.js  # level validation
node tests/e2e.js           # headless full playthrough (uses preinstalled Playwright)
```

## Credits

All content is original. Sound credits are in `assets/sfx/CREDITS.md`.
