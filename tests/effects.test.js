'use strict';
const assert = require('assert');
const { load } = require('./harness');

function mk() {
  const W = load(['config.js', 'util.js', 'events.js', 'map.js', 'textures.js', 'player.js', 'effects.js', 'hud.js']);
  W.Map.load(); W.Player.reset(); W.Effects.init(); W.Effects.reset(); W.Hud.init(); W.Hud.reset();
  W.Effects.setGrain(false);
  return W;
}
const grey = () => new Uint32Array(320 * 200).fill(0xff808080);
const ch = (px, s) => (px >>> s) & 255;

test('vignette darkens corners more than centre', () => {
  const W = mk(); const b = grey();
  W.Effects.apply(b, 320, 200);
  const centre = b[100 * 320 + 160], corner = b[0];
  assert.ok(ch(corner, 0) < ch(centre, 0) * 0.6, `${ch(corner, 0)} vs ${ch(centre, 0)}`);
});

test('flash tints red then decays to none after its duration', () => {
  const W = mk();
  W.Effects.flash([200, 0, 0], 0.25);
  let b = grey(); W.Effects.apply(b, 320, 200);
  let p = b[100 * 320 + 161];
  assert.ok(ch(p, 0) > ch(p, 8) + 20, 'red tint');
  W.Effects.update(0.3);
  b = grey(); W.Effects.apply(b, 320, 200);
  p = b[100 * 320 + 161];
  assert.strictEqual(ch(p, 0), ch(p, 8));
});

test('desaturate only below 30 hp', () => {
  const W = mk();
  const red = () => new Uint32Array(320 * 200).fill(0xff0000c8);
  W.Player.hp = 50; W.Effects.update(0.01);
  let b = red(); W.Effects.apply(b, 320, 200);
  assert.strictEqual(ch(b[100 * 320 + 160], 8), 0);
  W.Player.hp = 10; W.Effects.update(0.01);
  b = red(); W.Effects.apply(b, 320, 200);
  assert.ok(ch(b[100 * 320 + 160], 8) > 10);
});

test('player:hurt triggers shake offset', () => {
  const W = mk();
  W.Events.emit('player:hurt', { amount: 10, fromAngle: 0 });
  let moved = false;
  for (let i = 0; i < 10; i++) { const o = W.Effects.offset(); if (o.x || o.y) moved = true; W.Effects.update(0.01); }
  assert.ok(moved);
  W.Effects.update(0.5);
  const o = W.Effects.offset(); assert.ok(o.x === 0 && o.y === 0);
});

test('hud message expires after 3 s', () => {
  const W = mk();
  W.Events.emit('message', { text: 'THE SUPPLY ROOM IS OPEN' });
  assert.strictEqual(W.Hud.activeMessage(), 'THE SUPPLY ROOM IS OPEN');
  W.Hud.update(2.9);
  assert.ok(W.Hud.activeMessage());
  W.Hud.update(0.2);
  assert.strictEqual(W.Hud.activeMessage(), null);
});

test('hud renders bar pixels for every state without throwing', () => {
  const W = mk();
  W.Game = { state: 'PLAYING', stateTime: 2, time: 2, errorMessage: '', debugOn: false };
  for (const s of ['TITLE', 'PLAYING', 'PAUSED', 'DEAD', 'VICTORY']) {
    W.Game.state = s;
    const b = new Uint32Array(320 * 200);
    W.Hud.render({ buf: b, w: 320, h: 200 }, s);
    assert.ok(b.some(v => v !== 0), s);
  }
});
