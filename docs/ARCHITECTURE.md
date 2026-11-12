# WARD 13 — Architecture, System Design & Technology

This document explains **how the game is built and why**. The *what* (gameplay numbers, level flow) lives in `docs/superpowers/specs/2026-11-12-ward13-design.md`. Progress and working rules live in `CLAUDE.md`.

---

## 1. Technology choices

| Concern | Choice | Why |
|---|---|---|
| Platform | Desktop web browser | Zero install; runs anywhere with Chrome/Firefox/Edge. |
| Rendering | HTML5 Canvas 2D, software raycaster writing into an `ImageData` pixel buffer | Authentic 90s look, full pixel control, no GPU/WebGL quirks. 320×200 = 64k pixels — trivially fast in JS. |
| Language | Plain JavaScript (ES2020), **classic `<script>` tags** | ES modules are blocked on `file://` in Chromium. Classic scripts let the user double-click `index.html`. |
| Module pattern | One global namespace `window.W13`; each file attaches one sub-object (`W13.Raycaster`, `W13.Audio`…) | Module boundaries without a bundler. Load order is explicit in `index.html`. |
| Audio | `HTMLAudioElement` for CC0 files + Web Audio API for procedural fallback, panning and ambience | `HTMLAudioElement` loads from `file://`; `fetch` + `decodeAudioData` does not. |
| Art | Procedurally generated pixel art (textures + sprites) painted into offscreen canvases at startup | No missing-image risk, consistent style, tiny repo, deterministic (seeded RNG). |
| Dependencies | **None at runtime.** Dev-only: preinstalled Playwright for tests | Nothing to install, nothing to break. |
| Build | None | Edit → refresh. |

---

## 2. High-level system diagram

```
                ┌────────────────────────── index.html ──────────────────────────┐
                │  <canvas id="screen">  + script tags in dependency order        │
                └───────────────────────────────┬────────────────────────────────┘
                                                │
                                        ┌───────▼───────┐
                                        │   game.js     │  state machine + main loop
                                        │  (W13.Game)   │  requestAnimationFrame
                                        └───────┬───────┘
          ┌──────────────┬──────────────┬───────┼────────┬──────────────┬─────────────┐
          ▼              ▼              ▼       ▼        ▼              ▼             ▼
     input.js       player.js      waves.js  enemies.js weapons.js   audio.js     hud.js
   (keys/mouse)  (move/collide/  (director, (AI, anim, (hitscan,    (files +     (2D overlay
                   health)        triggers)  damage)    reload)      fallback)    text/bars)
          │              │              │       │        │              ▲             │
          └──────────────┴───────┬──────┴───────┴────────┘              │ events      │
                                 ▼                                       │             │
                            map.js  ◄── grid, doors, zones, spawns       │             │
                                 │                                       │             │
                                 ▼                                       │             │
                          raycaster.js ◄── textures.js (sprite/texture atlas)          │
                                 │                                                     │
                                 ▼                                                     ▼
                            effects.js  (post-processing on the frame buffer)  ──►  canvas
```

**Data flows one way per frame:** input → simulation (player, weapons, enemies, waves) → render (raycaster → effects → HUD). Simulation never reads render state except the per-frame wall z-buffer used for hitscan *visibility* (and that is recomputed from the map, not the screen).

---

## 3. Script load order & namespace

```html
<script src="js/config.js"></script>    <!-- W13.Config  (constants only) -->
<script src="js/util.js"></script>      <!-- W13.Util    (rng, math, clamp, lerp) -->
<script src="js/events.js"></script>    <!-- W13.Events  (tiny pub/sub) -->
<script src="js/map.js"></script>       <!-- W13.Map -->
<script src="js/textures.js"></script>  <!-- W13.Textures -->
<script src="js/input.js"></script>     <!-- W13.Input -->
<script src="js/audio.js"></script>     <!-- W13.Audio -->
<script src="js/player.js"></script>    <!-- W13.Player -->
<script src="js/weapons.js"></script>   <!-- W13.Weapons -->
<script src="js/enemies.js"></script>   <!-- W13.Enemies -->
<script src="js/waves.js"></script>     <!-- W13.Waves -->
<script src="js/raycaster.js"></script> <!-- W13.Raycaster -->
<script src="js/effects.js"></script>   <!-- W13.Effects -->
<script src="js/hud.js"></script>       <!-- W13.Hud -->
<script src="js/game.js"></script>      <!-- W13.Game — boots on DOMContentLoaded -->
```

Rule: a file may only reference modules loaded **above** it at load time; at call time anything on `W13` is fair game.

---

## 4. Module contracts

| Module | Owns | Public API (sketch) | Depends on |
|---|---|---|---|
| `Config` | All tuning numbers | `W13.Config.player.walkSpeed`, `.weapons.pistol.damage`, `.waves[...]` | — |
| `Util` | Seeded RNG, math | `rng(seed)`, `clamp`, `lerp`, `angleDiff`, `dist` | — |
| `Events` | Decoupled notifications | `on(name, fn)`, `emit(name, data)`, `clear()` | — |
| `Map` | Tile grid, doors, zones, spawn/pickup points | `load()`, `isSolid(x,y)`, `tileAt(x,y)`, `openDoor(id)`, `lockDoor(id)`, `zoneAt(x,y)`, `castRay(ox,oy,angle,maxDist)` → `{dist, tile, side, texX}` | Config |
| `Textures` | Procedural pixel art | `init()`, `wall(id)` → 64×64 `Uint32Array`, `sprite(type, frame)` → 64×64 RGBA w/ alpha, `weapon(name, frame)` | Util |
| `Input` | Raw input → intent | `init(canvas)`, `state` `{forward, strafe, turnDelta, fire, reload, run, use, weapon1, weapon2}`, `consumeMouse()` | — |
| `Audio` | All sound | `init()` (on user click), `play(id, {x,y})`, `loop(id)`, `stop(id)`, `setListener(x,y,angle)`, `mute()` | Config, Events |
| `Player` | Position, angle, HP, inventory | `reset()`, `update(dt, input)`, `damage(n, fromAngle)`, `heal(n)`, `addAmmo(type,n)` | Map, Config, Events |
| `Weapons` | Fire timing, ammo, hitscan | `update(dt, input, player)`, `fire()` → hit result, `switchTo(name)`, `current` (for view-model) | Map, Enemies, Audio, Events |
| `Enemies` | Enemy list, AI, anims, projectiles | `spawn(type, x, y, alerted)`, `update(dt, player)`, `hitTest(ox,oy,angle,maxDist)`, `damage(enemy, n)`, `aliveCount(tag)`, `list` | Map, Config, Audio, Events |
| `Waves` | Level script / director | `reset()`, `update(dt, player)`; listens to zone enters, pickups, enemy deaths; opens/locks doors; emits `wave:start`, `wave:clear`, `boss:start`, `level:exitOpen` | Map, Enemies, Events |
| `Raycaster` | World rendering | `render(buf, player, sprites, light)` writes into 320×200 `Uint32Array`; exposes `zBuffer` | Map, Textures |
| `Effects` | Post FX + transient feedback | `update(dt)`, `apply(buf, ctx)`, `flash(color, ms)`, `shake(amount, ms)`, `setLowHealth(t)` | Util |
| `Hud` | Overlay text/bars/messages | `render(ctx, player, waves)`, `message(text, secs)` | Config |
| `Game` | Lifecycle & loop | `boot()`, `setState(s)`, `restart()`; debug hooks `W13.Game.debug.*` | everything |

**Communication rule:** modules call *downward* (Weapons → Enemies) for direct queries, and use **Events** for "something happened" notifications that several systems care about (e.g. `enemy:died` → Waves counts it, Audio plays sound, Hud updates kills, Effects maybe splats).

### Core events

| Event | Payload | Typical listeners |
|---|---|---|
| `shot` | `{weapon, x, y}` | Enemies (noise alert), Audio, Effects (muzzle light) |
| `enemy:hurt` / `enemy:died` | `{enemy}` | Audio, Waves, Hud stats |
| `player:hurt` | `{amount, fromAngle}` | Effects (flash/shake), Audio |
| `player:died` | — | Game → `DEAD` |
| `pickup` | `{kind, amount}` | Audio, Hud message |
| `zone:enter` | `{zone}` | Waves |
| `door:open` / `door:lock` | `{id}` | Audio, Map |
| `wave:start` / `wave:clear` | `{index}` | Hud message, Audio stinger |
| `boss:phase` | `{phase}` | Effects (red flicker), Audio |
| `level:victory` | — | Game → `VICTORY` |

---

## 5. Main loop & state machine

```
            click                 Esc / pointer lost
  TITLE ───────────► PLAYING ◄──────────────────────► PAUSED
                      │   │
         player:died  │   │ level:victory
                      ▼   ▼
                    DEAD  VICTORY
                      │      │
                      └──┬───┘
                     click → restart() → PLAYING
```

Per frame (`requestAnimationFrame`):

```
dt = min((now - last)/1000, 0.05)
if state == PLAYING:
    Input.poll()
    Player.update(dt)        // movement + collision + pickups + zone detection
    Weapons.update(dt)       // firing, reload, hitscan
    Enemies.update(dt)       // AI, attacks, projectiles, anims
    Waves.update(dt)         // spawns, door logic
    Audio.setListener(player)
Effects.update(dt)
Raycaster.render(buffer)     // always render (title uses an attract-mode camera)
Effects.apply(buffer)        // grain, vignette, flash, desaturate → putImageData
Hud.render(ctx)              // vector text/bars on top (or screen overlays)
```

The whole frame is wrapped in `try/catch`; the first exception is logged, the game switches to `PAUSED` and shows "Something broke — click to restart" instead of freezing silently.

---

## 6. Data model

### 6.1 Map format (`map.js`)

The level is a 32×32 array of strings — human-readable and diffable:

```
'################################',
'#S....#......#.....#...........#',
'#.....D......#.....D...........#',
...
```

| Char | Meaning |
|---|---|
| `.` | Floor |
| `#` `B` `C` `P` `M` | Walls: tile, bloody tile, concrete, padded cell, morgue drawers |
| `D` | Regular door (auto-open on approach) |
| `1` `2` `3` | Scripted doors (closed until wave N cleared) |
| `T` | Theatre door (opens after wave 3, locks behind player during boss) |
| `X` | Exit gate (locked until boss dies) |
| `S` | Player start (floor) |

Separate tables (same file) hold structured data by coordinates: `zones` (axis-aligned rectangles with ids `reception`, `lobby`, `supply`, `east`, `morgue`, `theatre`, `exit`), `spawns[waveIndex]` (points + enemy type), `pickups` (`health`, `ammo_pistol`, `ammo_shells`, `shotgun`), `lights` (flicker tiles).

### 6.2 Entities

```js
// enemy
{ id, type:'shambler'|'runner'|'bloater'|'boss', x, y, angle,
  hp, maxHp, state:'idle'|'alert'|'chase'|'attack'|'hurt'|'dead',
  stateTime, attackCooldown, animFrame, animTime, waveTag, phase }

// projectile (boss bile)
{ x, y, vx, vy, damage, ttl }

// pickup
{ kind, x, y, taken:false, bobPhase }

// player
{ x, y, angle, hp, weapons:{pistol:{mag,reserve}, shotgun:{owned,mag,reserve}},
  current:'pistol', stats:{shots, hits, kills, time} }
```

All mutable game state is reachable from `Player`, `Enemies.list`, `Map` door state, and `Waves` — so `Game.restart()` just calls each module's `reset()`.

---

## 7. Rendering pipeline (raycaster)

1. **Clear** buffer: ceiling gradient (top half) and floor gradient (bottom half), both darkening toward the horizon.
2. **Walls — DDA per column** (320 columns):
   - Ray direction = player dir + camera plane × `(2x/W − 1)`.
   - Step through grid cells (Digital Differential Analyzer) until a solid tile.
   - Perpendicular distance (fish-eye corrected) → wall slice height `H / dist`.
   - Texture column `texX` from exact hit position; sample 64 texels vertically with a fixed-point step.
   - Shade: `light = clamp(ambient + flash + tileLight(x,y) − dist·falloff, 0, 1)`; Y-side walls ×0.75 for depth cue.
   - Store `zBuffer[x] = dist`.
3. **Sprites** (enemies, corpses, pickups, projectiles): transform to camera space, cull behind player, sort far → near, draw columns where `transformY < zBuffer[col]`; alpha-tested; same distance shading; hurt flash tints white for 60 ms.
4. **Weapon view-model**: blit current weapon frame at bottom centre with bob/recoil offset; muzzle-flash frame on fire.
5. **Effects** (`effects.js`) on the same buffer: screen shake (offset at blit), red flash blend, low-health desaturate, vignette (precomputed multiplier map), grain (random noise ±), scanlines (every other row ×0.8).
6. `putImageData` to the 320×200 canvas; CSS scales it up pixelated.
7. **HUD** drawn with canvas 2D text/rects on top (pixel font: bitmap glyphs generated at startup to stay crisp).

Performance budget at 320×200: walls ~0.5 ms, sprites ~0.5 ms, effects ~1 ms — far under 16 ms.

---

## 8. AI design

Each enemy runs a tiny state machine; behaviour is data-driven from `Config.enemies[type]`.

```
IDLE ──(sees player ≤8 tiles OR hears shot)──► ALERT ──(windup)──► CHASE
CHASE ──(in attack range)──► ATTACK ──(cooldown)──► CHASE
any ──(damaged)──► HURT (0.15 s stagger, not for boss) ──► CHASE
any ──(hp ≤ 0)──► DEAD (death anim, corpse stays; bloater bursts)
```

- **Line of sight:** grid DDA from enemy to player; blocked by solid tiles/closed doors.
- **Steering:** move toward player; if the next position is solid, slide along the free axis; if both blocked, try ±45°; separation push from nearby enemies.
- **Boss:** extra phase layer. Phase 2 adds a timer-driven pattern: `walk → (roar + stop 0.7 s) → charge` and periodic bile projectile. Charge ends on wall hit (boss briefly stunned 1 s — reward window).

---

## 9. Wave director

`waves.js` is the **only** place that knows the level script. It is a linear list of steps:

```js
[
  { on:'zone:lobby',      do:['spawnWave:0'] },
  { on:'cleared:0',       do:['openDoor:1', 'msg:The supply room is open'] },
  { on:'pickup:shotgun',  do:['spawnWave:1'] },
  { on:'cleared:1',       do:['openDoor:2', 'msg:The stairwell is open'] },
  { on:'zone:morgue',     do:['spawnWave:2'] },
  { on:'cleared:2',       do:['openDoor:T', 'msg:Something waits in the theatre'] },
  { on:'zone:theatre',    do:['lockDoor:T', 'spawnBoss'] },
  { on:'cleared:boss',    do:['openDoor:T', 'unlockExit', 'msg:The gate is open. RUN.'] },
  { on:'zone:exit',       do:['victory'] },
]
```

Spawns within a wave are staggered (0.6–1.2 s apart) and only at spawn points the player cannot currently see (fallback: furthest point) to avoid pop-in. Safety net: if a wave enemy is stuck out of reach for > 20 s it is teleported to a valid spawn near the player — so the level can never soft-lock.

---

## 10. Audio system

```
Audio.play(id, pos)
   ├─ file loaded?  ── yes ─► clone HTMLAudioElement → MediaElementSource → Gain → StereoPanner → master
   └─ no ───────────────────► Procedural[id](ctx) → Gain → StereoPanner → master
```

- On startup, `Audio` creates one `Audio()` element per file and listens for `canplaythrough` / `error`. Errors mark the id as "fallback" with a single `console.warn`.
- Pool of clones per id (max 6) for overlapping gunshots/groans.
- Procedural recipes: gunshot = white-noise burst + low sine thump with fast exponential decay; groan = detuned sawtooth through low-pass with slow pitch wobble; screech = high bandpassed noise sweep; heartbeat = two low sine "lub-dub" pulses; ambience = brown noise + slow LFO-filtered drone.
- Volume falloff `gain = 1 / (1 + d·0.35)`; pan = `sin(angleDiff(listener, source))`.
- `AudioContext` created/resumed on the title-screen click to satisfy autoplay policy.

---

## 11. Error handling & resilience

| Risk | Mitigation |
|---|---|
| Opened via `file://` | No modules, no fetch; assets via `<audio>` / generated canvases. |
| Missing/blocked sound file | Procedural fallback + one `warn`. |
| Tab hidden / huge dt | `dt` clamp + auto-pause on `visibilitychange`. |
| Pointer lock refused/lost | Pause screen with "Click to resume". |
| Enemy stuck / unreachable | Stuck timer → teleport (see §9). |
| Player clips into wall | Radius collision per axis; spawn points validated by test. |
| Uncaught exception in loop | Caught → paused error overlay, restart possible. |
| Restart leaks state | Every module implements `reset()`; Events listeners registered once at boot, never in `reset()`. |

---

## 12. Testing & verification strategy

| Layer | Tool | What |
|---|---|---|
| Map validation | Node script `tests/validate-map.js` (loads `config.js` + `map.js` in a `vm` sandbox) | 32×32, closed border, exactly one `S`, all spawns/pickups on floor, BFS reachability of every zone (doors passable). |
| Pure logic | Node + `vm` (`tests/logic.test.js`) | Ray-cast distances on a tiny map, collision slide, damage/ammo math, wave director step transitions with stub Enemies. |
| End-to-end | Playwright `tests/e2e.js` (preinstalled Chromium, headless) | Load `file://` → zero console errors; click start; use `W13.Game.debug` to skip waves → assert `VICTORY`; force death → `DEAD` → restart resets; screenshots per stage. |
| Visual | Screenshots reviewed by a human/agent each milestone | Retro look, darkness, readable HUD. |

Debug hooks (only when `?debug=1`): `god`, `skipWave()`, `killAll()`, `noclip`, `teleport(zone)`, FPS overlay.

---

## 13. Extension points (future, not built now)

- More levels: `map.js` + `waves.js` script per level, selected by `Game`.
- New enemy: add `Config.enemies.<type>` + sprite recipe in `Textures` + optional behaviour hook.
- New weapon: `Config.weapons.<name>` + view-model sprite.
- Floor/ceiling texture casting if performance allows.

---

## 14. Glossary

- **Raycaster** — pseudo-3D renderer that casts one ray per screen column across a 2D grid; walls are vertical slices scaled by distance.
- **DDA** — Digital Differential Analyzer; steps a ray cell-by-cell through the grid without missing cells.
- **z-buffer** — per-column wall distance, used so sprites are hidden behind walls.
- **Hitscan** — instant-hit weapon resolved by a ray, no travelling bullet.
- **Billboard sprite** — 2D image always facing the camera.
- **CC0** — public-domain dedication; free to use without attribution (we credit anyway).
