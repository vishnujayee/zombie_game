'use strict';
const assert = require('assert');
const { load } = require('./harness');

const mk = () => { const W = load(['config.js', 'util.js', 'events.js', 'map.js']); W.Map.load(); return W; };

test('map is 32x32 with closed border', () => {
  const { Map: M } = mk();
  assert.strictEqual(M.W, 32); assert.strictEqual(M.H, 32);
  for (let i = 0; i < 32; i++) {
    assert.ok(M.isSolid(i, 0) && M.isSolid(i, 31) && M.isSolid(0, i) && M.isSolid(31, i));
  }
  assert.ok(M.isSolid(-1, 5) && M.isSolid(40, 5));
});

test('exactly one start', () => {
  const { Map: M } = mk();
  let n = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (M.tileAt(x, y) === 'S') n++;
  assert.strictEqual(n, 1);
  assert.ok(!M.isSolid(Math.floor(M.start.x), Math.floor(M.start.y)));
});

test('castRay straight east', () => {
  const { Map: M } = mk();
  const sx = M.start.x, sy = M.start.y;
  let tx = Math.floor(sx);
  while (!M.isSolid(tx + 1, Math.floor(sy))) tx++;
  const expected = (tx + 1) - sx;
  const hit = M.castRay(sx, sy, 0, 50);
  assert.ok(Math.abs(hit.dist - expected) < 1e-6, `got ${hit.dist} want ${expected}`);
  assert.strictEqual(hit.side, 0);
});

test('castRay hits closed door, passes open door', () => {
  const { Map: M } = mk();
  const d = M.doors['1'];
  // stand two tiles west of the door, look east
  const ox = d.x - 0.5, oy = d.y + 0.5;
  assert.ok(!M.isSolid(Math.floor(ox), Math.floor(oy)));
  const a = M.castRay(ox, oy, 0, 50);
  assert.strictEqual(a.tile, '1');
  M.openDoor('1');
  const b = M.castRay(ox, oy, 0, 50);
  assert.ok(b.dist > a.dist + 0.9);
});

test('hasLOS blocked by wall', () => {
  const { Map: M } = mk();
  const d = M.doors['1'];
  // door 1 closed: west side vs east side
  assert.strictEqual(M.hasLOS(d.x - 0.5, d.y + 0.5, d.x + 1.5, d.y + 0.5), false);
  // same lobby: two points in the reception room
  assert.strictEqual(M.hasLOS(M.start.x, M.start.y, M.start.x + 1, M.start.y), true);
});

test('validator passes', () => {
  const W = mk();
  const errs = require('./validate-map.js').validate(W);
  assert.strictEqual(errs.length, 0, errs.join('\n'));
});

test('load() resets doors and pickups', () => {
  const { Map: M } = mk();
  M.openDoor('1'); M.pickups[0].taken = true; M.pickups.push({ kind: 'ammo_pistol', x: 1, y: 1, taken: false });
  const n = M.pickups.length;
  M.load();
  assert.strictEqual(M.doors['1'].open, false);
  assert.strictEqual(M.pickups[0].taken, false);
  assert.strictEqual(M.pickups.length, n - 1);
});
