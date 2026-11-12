'use strict';
const assert = require('assert');
const { load } = require('./harness');

const core = () => load(['config.js', 'util.js', 'events.js']);

test('config matches spec', () => {
  const { Config: C } = core();
  assert.strictEqual(C.weapons.pistol.damage, 34);
  assert.strictEqual(C.weapons.shotgun.pellets, 7);
  assert.strictEqual(C.weapons.shotgun.damage, 18);
  assert.strictEqual(C.enemies.shambler.hp, 100);
  assert.strictEqual(C.enemies.runner.hp, 60);
  assert.strictEqual(C.enemies.bloater.hp, 200);
  assert.strictEqual(C.enemies.boss.hp, 1400);
  assert.strictEqual(C.player.walkSpeed, 2.6);
  assert.strictEqual(C.player.runSpeed, 4.2);
  assert.strictEqual(C.player.radius, 0.25);
  assert.strictEqual(JSON.stringify(C.waves.map(w => w.length)), "[8,9,8]");
});

test('rng deterministic', () => {
  const { Util } = core();
  const a = Util.rng(42), b = Util.rng(42);
  for (let i = 0; i < 5; i++) {
    const x = a();
    assert.strictEqual(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('angleDiff wraps', () => {
  const { Util } = core();
  assert.ok(Math.abs(Util.angleDiff(3.1, -3.1) - 0.0832) < 1e-3);
});

test('events emit', () => {
  const { Events } = core();
  let got = null;
  Events.on('x', d => { got = d; });
  Events.emit('x', 5);
  assert.strictEqual(got, 5);
  got = null;
  Events.clear();
  Events.emit('x', 6);
  assert.strictEqual(got, null);
});
