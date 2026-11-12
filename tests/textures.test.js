'use strict';
const assert = require('assert');
const { load } = require('./harness');

const tex = () => {
  const W13 = load(['config.js', 'util.js', 'textures.js']);
  W13.Textures.init();
  return W13;
};

const WALLS = ['TILE', 'TILE_BLOOD', 'CONCRETE', 'PADDED', 'MORGUE', 'METAL_DOOR', 'THEATRE_DOOR', 'EXIT_GATE', 'EXIT_GATE_OPEN'];
const ANIMS = { walk: 4, attack: 2, hurt: 1, death: 4 };
const opaqueRatio = px => { let n = 0; for (let i = 0; i < px.length; i++) if (px[i] >>> 24) n++; return n / px.length; };

test('every wall id returns 4096 pixels, all opaque', () => {
  const { Textures } = tex();
  for (const id of WALLS) {
    const w = Textures.wall(id);
    assert.ok(w, id);
    assert.strictEqual(w.length, 4096, id);
    for (let i = 0; i < w.length; i++) assert.strictEqual(w[i] >>> 24, 255, id + ' pixel ' + i);
  }
});

test('every enemy anim frame exists and has 15-85% opaque pixels', () => {
  const { Textures } = tex();
  for (const type of ['shambler', 'runner', 'bloater', 'boss']) {
    for (const anim of Object.keys(ANIMS)) {
      for (let f = 0; f < ANIMS[anim]; f++) {
        const s = Textures.sprite(type, anim, f);
        assert.ok(s && s.w === 64 && s.h === 64 && s.px.length === 4096, `${type} ${anim} ${f}`);
        const r = opaqueRatio(s.px);
        if (anim === 'death' && f === 3) assert.ok(r > 0.03, `${type} corpse ${r}`);
        else assert.ok(r >= 0.15 && r <= 0.85, `${type} ${anim} ${f} ratio ${r.toFixed(3)}`);
      }
    }
  }
});

test('enemy feet touch the bottom row', () => {
  const { Textures } = tex();
  for (const type of ['shambler', 'runner', 'bloater', 'boss']) {
    const s = Textures.sprite(type, 'walk', 0);
    let any = false;
    for (let x = 0; x < 64; x++) if (s.px[63 * 64 + x] >>> 24) any = true;
    assert.ok(any, type);
  }
});

test('pickups, bile, splat and weapon frames exist', () => {
  const { Textures } = tex();
  for (const k of ['pickup_health', 'pickup_ammo', 'pickup_shells', 'pickup_shotgun', 'bile', 'corpse_splat']) {
    const s = Textures.sprite(k);
    assert.ok(s && s.px.length === s.w * s.h && opaqueRatio(s.px) > 0.02, k);
  }
  for (const n of ['pistol', 'shotgun']) {
    for (const f of ['idle', 'fire', 'reload1', 'reload2']) {
      const w = Textures.weapon(n, f);
      assert.ok(w && w.px.length === w.w * w.h && opaqueRatio(w.px) > 0.05, n + ' ' + f);
    }
  }
});

test('deterministic', () => {
  const W13 = tex();
  const a = Array.from(W13.Textures.wall('TILE'));
  const b = Array.from(W13.Textures.sprite('shambler', 'walk', 1).px);
  W13.Textures.init();
  assert.strictEqual(JSON.stringify(Array.from(W13.Textures.wall('TILE'))), JSON.stringify(a));
  assert.strictEqual(JSON.stringify(Array.from(W13.Textures.sprite('shambler', 'walk', 1).px)), JSON.stringify(b));
});

test('font has glyphs for "WAVE 2 - 5 LEFT"', () => {
  const { Textures } = tex();
  for (const ch of 'WAVE 2 - 5 LEFT') assert.ok(Textures.font[ch], 'glyph ' + JSON.stringify(ch));
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:/!-% ') assert.ok(Textures.font[ch], ch);
});

test('drawText writes pixels into a buffer', () => {
  const { Textures, Util } = tex();
  const target = { buf: new Uint32Array(100 * 20), w: 100, h: 20 };
  const col = Util.rgba(200, 10, 10);
  Textures.drawText(target, 'HP 100', 2, 2, col, 1);
  let n = 0;
  for (let i = 0; i < target.buf.length; i++) if (target.buf[i] === col) n++;
  assert.ok(n > 20, 'pixels ' + n);
  assert.strictEqual(Textures.textWidth('AB', 1), 12);
  // clipping off-buffer must not throw
  Textures.drawText(target, 'CLIP', 95, 15, col, 2);
});
