# WARD 13 — Sound credits

All sounds in this folder are **original, made for this project**. They are released under **CC0 1.0** (public domain dedication): https://creativecommons.org/publicdomain/zero/1.0/

They were synthesized offline with `assets/sfx/generate.js` (noise, oscillators, filters, reverb), then encoded to OGG Vorbis with ffmpeg. To regenerate: `node assets/sfx/generate.js`.

Why not third-party CC0 packs? During the build, the usual CC0 sources (kenney.nl, opengameart.org, freesound.org) were blocked by the build environment's network policy, and licences could not be checked at their source pages. So every sound was made in-house instead. If you add third-party CC0 files later, list them in the table with source URL, author and licence.

| Sound id | File | Source | Author | Licence |
|---|---|---|---|---|
| pistol | pistol.ogg | generate.js `gunshot(false)` | WARD 13 project | CC0 |
| shotgun | shotgun.ogg | generate.js `gunshot(true)` | WARD 13 project | CC0 |
| pump | pump.ogg | generate.js `clicks` | WARD 13 project | CC0 |
| reload | reload.ogg | generate.js `clicks` | WARD 13 project | CC0 |
| empty | empty.ogg | generate.js `clicks` | WARD 13 project | CC0 |
| zombie_groan_1..3 | zombie_groan_N.ogg | generate.js `groan` | WARD 13 project | CC0 |
| runner_screech | runner_screech.ogg | generate.js `screech` | WARD 13 project | CC0 |
| bloater_burst | bloater_burst.ogg | generate.js `burst` | WARD 13 project | CC0 |
| boss_roar | boss_roar.ogg | generate.js `roar` | WARD 13 project | CC0 |
| boss_hit | boss_hit.ogg | generate.js `bossHit` | WARD 13 project | CC0 |
| player_hurt | player_hurt.ogg | generate.js `grunt` | WARD 13 project | CC0 |
| player_death | player_death.ogg | generate.js `grunt` | WARD 13 project | CC0 |
| footstep | footstep.ogg | generate.js `footstep` | WARD 13 project | CC0 |
| pickup | pickup.ogg | generate.js `pickup` | WARD 13 project | CC0 |
| door | door.ogg | generate.js `door` | WARD 13 project | CC0 |
| ambience | ambience.ogg (15 s seamless loop) | generate.js `ambience` | WARD 13 project | CC0 |
| heartbeat | heartbeat.ogg | generate.js `heartbeat` | WARD 13 project | CC0 |

**Runtime fallback:** every id also has a live procedural recipe in `js/audio.js` (`W13.Audio.Procedural`). If a file is missing or fails to load, the game uses the recipe instead and logs one `console.warn`. The game never goes silent and never crashes because of audio.
