'use strict';
const assert = require('assert');
const { load } = require('./harness');

function mk(hitDist) {
  const enemy = { taken: 0, hits: 0 };
  const Enemies = {
    hitTest: () => (hitDist == null ? null : { enemy, dist: hitDist }), // ignores maxDist on purpose
    damage(e, n) { e.taken += n; e.hits++; },
    list: [],
  };
  const W = load(['config.js', 'util.js', 'events.js', 'map.js', 'player.js', 'weapons.js'], { inject: { Enemies } });
  W.Map.load(); W.Player.reset(); W.Weapons.init(); W.Weapons.reset();
  W.Player.x = 2.5; W.Player.y = 16.5; W.Player.angle = 0; // lobby, facing east, wall 9.5 away
  return { W, P: W.Player, Wp: W.Weapons, enemy };
}
const inp = (o = {}) => Object.assign({ fire: false, reload: false }, o);
const run = (Wp, P, secs, input) => { for (let t = 0; t < secs - 1e-9; t += 0.01) Wp.update(0.01, input, P); };

test('pistol fires at interval', () => {
  const { W, P, Wp } = mk(null);
  let shots = 0; W.Events.on('shot', () => shots++);
  run(Wp, P, 1, inp({ fire: true }));
  assert.strictEqual(shots, 4);
});

test('mag empties then auto reloads from reserve', () => {
  const { P, Wp } = mk(null);
  run(Wp, P, 3.2, inp({ fire: true }));
  assert.strictEqual(P.weapons.pistol.mag, 0);
  run(Wp, P, 1.2, inp());
  assert.strictEqual(P.weapons.pistol.mag, 12);
  assert.strictEqual(P.weapons.pistol.reserve, 12);
});

test('empty with no reserve emits weapon:empty and does not fire', () => {
  const { W, P, Wp } = mk(null);
  P.weapons.pistol.mag = 0; P.weapons.pistol.reserve = 0;
  let shots = 0, empty = 0;
  W.Events.on('shot', () => shots++); W.Events.on('weapon:empty', () => empty++);
  run(Wp, P, 0.5, inp({ fire: true }));
  assert.strictEqual(shots, 0); assert.ok(empty >= 1);
});

test('shotgun deals 7x18 at point blank', () => {
  const { P, Wp, enemy } = mk(1);
  P.weapons.shotgun = { owned: true, mag: 6, reserve: 12 }; P.current = 'shotgun';
  Wp.update(0.3, inp(), P); // weapon switch delay
  Wp.update(0.01, inp({ fire: true }), P);
  assert.strictEqual(enemy.taken, 126);
});

test('shotgun falloff at 7 tiles', () => {
  const { P, Wp, enemy } = mk(7);
  P.weapons.shotgun = { owned: true, mag: 6, reserve: 12 }; P.current = 'shotgun';
  Wp.update(0.3, inp(), P); // weapon switch delay
  Wp.update(0.01, inp({ fire: true }), P);
  assert.strictEqual(enemy.taken, 63);
});

test('hitscan blocked by wall', () => {
  const { P, Wp, enemy } = mk(6);
  P.x = 8.5; P.y = 16.5; P.angle = 0; // wall at x=12 → 3.5 away; enemy "at" 6
  Wp.update(0.01, inp({ fire: true }), P);
  assert.strictEqual(enemy.taken, 0);
});

test('stats.shots and stats.hits increment', () => {
  const { P, Wp } = mk(2);
  Wp.update(0.01, inp({ fire: true }), P);
  assert.strictEqual(P.stats.shots, 1); assert.strictEqual(P.stats.hits, 1);
});

test('shotgun reload is per shell and firing interrupts it', () => {
  const { P, Wp } = mk(null);
  P.weapons.shotgun = { owned: true, mag: 2, reserve: 12 }; P.current = 'shotgun';
  run(Wp, P, 0.05, inp({ reload: true }));
  run(Wp, P, 0.9, inp());
  assert.strictEqual(P.weapons.shotgun.mag, 4);
  run(Wp, P, 0.05, inp({ fire: true }));
  assert.strictEqual(P.weapons.shotgun.mag, 3);
  assert.strictEqual(Wp.state.reloading, false);
});

test('cannot switch to shotgun until owned', () => {
  const { P, Wp } = mk(null);
  Wp.switchTo('shotgun', P);
  assert.strictEqual(P.current, 'pistol');
  P.weapons.shotgun.owned = true;
  Wp.switchTo('shotgun', P);
  assert.strictEqual(P.current, 'shotgun');
});
