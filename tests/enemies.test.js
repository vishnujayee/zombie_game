'use strict';
const assert = require('assert');
const { load, stubTextures } = require('./harness');

function mk() {
  const W = load(['config.js', 'util.js', 'events.js', 'map.js', 'player.js', 'enemies.js'], { inject: { Textures: stubTextures() } });
  W.Map.load(); W.Player.reset(); W.Enemies.init(); W.Enemies.reset();
  return W;
}
const run = (W, secs, dt = 0.01) => { for (let t = 0; t < secs - 1e-9; t += dt) W.Enemies.update(dt, W.Player); };
const R = 0.3;
const inWall = (M, e) => [[-R, -R], [R, -R], [-R, R], [R, R]].some(([a, b]) => M.isSolid(e.x + a, e.y + b));

test('shambler alerts on LOS and chases', () => {
  const W = mk(); const P = W.Player;
  P.x = 2.5; P.y = 16.5;
  const e = W.Enemies.spawn('shambler', 8.5, 16.5, {});
  const d0 = Math.hypot(e.x - P.x, e.y - P.y);
  run(W, 2);
  assert.notStrictEqual(e.state, 'idle');
  assert.ok(Math.hypot(e.x - P.x, e.y - P.y) < d0 - 1);
});

test('does not alert through wall', () => {
  const W = mk(); const P = W.Player;
  P.x = 2.5; P.y = 5.5;
  const e = W.Enemies.spawn('shambler', 5.5, 5.5, {});
  run(W, 2);
  assert.strictEqual(e.state, 'idle');
});

test('alerts on shot within 10 tiles', () => {
  const W = mk(); const P = W.Player;
  P.x = 2.5; P.y = 5.5;
  const e = W.Enemies.spawn('shambler', 5.5, 5.5, {});
  W.Events.emit('shot', { weapon: 'pistol', x: P.x, y: P.y });
  run(W, 0.1);
  assert.notStrictEqual(e.state, 'idle');
});

test('melee damages player on cooldown', () => {
  const W = mk(); const P = W.Player;
  P.x = 2.5; P.y = 16.5;
  W.Enemies.spawn('shambler', 3.2, 16.5, {});
  run(W, 2.1);
  assert.strictEqual(P.hp, 70);
});

test('pistol kills shambler in 3 hits, runner in 2', () => {
  const W = mk();
  const s = W.Enemies.spawn('shambler', 8.5, 16.5, {});
  W.Enemies.damage(s, 34); W.Enemies.damage(s, 34);
  assert.notStrictEqual(s.state, 'dead');
  W.Enemies.damage(s, 34);
  assert.strictEqual(s.state, 'dead');
  const r = W.Enemies.spawn('runner', 8.5, 17.5, {});
  W.Enemies.damage(r, 34); W.Enemies.damage(r, 34);
  assert.strictEqual(r.state, 'dead');
});

test('bloater burst damages nearby player 30 and nearby enemy', () => {
  const W = mk(); const P = W.Player;
  P.x = 2.5; P.y = 16.5;
  const b = W.Enemies.spawn('bloater', 3.5, 16.5, {});
  const s = W.Enemies.spawn('shambler', 4.3, 16.5, {});
  W.Enemies.damage(b, 200);
  assert.strictEqual(P.hp, 70);
  assert.strictEqual(s.hp, 70);
});

test('boss enters phase 2 below 700 hp and emits boss:phase once', () => {
  const W = mk();
  let n = 0; W.Events.on('boss:phase', () => n++);
  const b = W.Enemies.spawn('boss', 14.5, 2.5, {});
  W.Enemies.damage(b, 699);
  run(W, 0.05);
  assert.strictEqual(b.phase, 1);
  W.Enemies.damage(b, 2);
  run(W, 0.05);
  W.Enemies.damage(b, 10);
  run(W, 0.05);
  assert.strictEqual(b.phase, 2); assert.strictEqual(n, 1);
});

test('boss charge stops at wall', () => {
  const W = mk(); const P = W.Player; W.Game = { debug: { god: true } };
  P.x = 16.5; P.y = 8.5;
  const b = W.Enemies.spawn('boss', 12.5, 2.5, { alerted: true });
  W.Enemies.damage(b, 800);
  let charged = false;
  for (let t = 0; t < 8; t += 0.01) {
    W.Enemies.update(0.01, P);
    if (b.state === 'charge') charged = true;
    assert.ok(!inWall(W.Map, b), `boss in wall at ${b.x},${b.y}`);
  }
  assert.ok(charged, 'boss charged at least once');
});

test('enemies never inside solid', () => {
  const W = mk(); const P = W.Player; W.Game = { debug: { god: true } };
  P.x = 6.5; P.y = 19.5;
  const r = W.Util.rng(3);
  for (let i = 0; i < 10; i++) {
    let x, y;
    do { x = 1.5 + r() * 10; y = 15.5 + r() * 9; } while (inWall(W.Map, { x, y }));
    W.Enemies.spawn(i % 3 ? 'shambler' : 'runner', x, y, { alerted: true });
  }
  for (let i = 0; i < 600; i++) {
    W.Enemies.update(0.02, P);
    for (const e of W.Enemies.list) assert.ok(!inWall(W.Map, e), `${e.type} in wall at ${e.x},${e.y}`);
  }
});

test('enemy navigates through a doorway to reach the player', () => {
  const W = mk(); const P = W.Player; W.Game = { debug: { god: true } };
  // player in east hall, zombie in lobby; must path through the door at (12,20)
  W.Map.openDoor('D@12,20');
  P.x = 16.5; P.y = 20.5;
  const e = W.Enemies.spawn('runner', 6.5, 16.5, { alerted: true });
  run(W, 8, 0.02);
  assert.ok(Math.hypot(e.x - P.x, e.y - P.y) < 1.5, `stuck at ${e.x},${e.y}`);
});

test('aliveCount by waveTag', () => {
  const W = mk();
  const a = W.Enemies.spawn('shambler', 8.5, 16.5, { waveTag: 0 });
  W.Enemies.spawn('shambler', 8.5, 17.5, { waveTag: 0 });
  W.Enemies.spawn('runner', 8.5, 19.5, { waveTag: 1 });
  assert.strictEqual(W.Enemies.aliveCount(0), 2);
  W.Enemies.damage(a, 1000);
  assert.strictEqual(W.Enemies.aliveCount(0), 1);
  assert.strictEqual(W.Enemies.aliveCount(1), 1);
});

test('hitTest finds nearest enemy along ray', () => {
  const W = mk();
  const far = W.Enemies.spawn('shambler', 9.5, 16.5, {});
  const near = W.Enemies.spawn('shambler', 5.5, 16.5, {});
  const h = W.Enemies.hitTest(2.5, 16.5, 0, 20);
  assert.strictEqual(h.enemy, near);
  assert.ok(Math.abs(h.dist - 3) < 1e-6);
  assert.strictEqual(W.Enemies.hitTest(2.5, 16.5, Math.PI / 2, 20), null);
  void far;
});

test('zombies push open auto doors and path through them (patient rooms)', () => {
  const W = mk(); const P = W.Player; W.Game = { debug: { god: true } };
  P.x = 16.5; P.y = 20.5;                      // east hall
  const e = W.Enemies.spawn('shambler', 15.5, 27.5, { alerted: true }); // inside a patient room, door (15,22) closed
  assert.strictEqual(W.Map.doors['D@15,22'].open, false);
  run(W, 10, 0.02);
  assert.strictEqual(W.Map.doors['D@15,22'].open, true);
  assert.ok(Math.hypot(e.x - P.x, e.y - P.y) < 1.5, `stuck at ${e.x},${e.y}`);
});

test('zombies never open scripted or locked doors', () => {
  const W = mk(); const P = W.Player; W.Game = { debug: { god: true } };
  P.x = 2.5; P.y = 5.5;
  W.Enemies.spawn('shambler', 4.5, 5.5, { alerted: true }); // supply side of door 1
  run(W, 3, 0.02);
  assert.strictEqual(W.Map.doors['1'].open, false);
});

test('review: shot ray grazing a pillar does not hit an enemy hidden behind it', () => {
  const W = mk();
  const e = W.Enemies.spawn('shambler', 5.6, 18.08, {});
  assert.strictEqual(W.Map.hasLOS(1.5, 17.75, e.x, e.y), false);
  assert.strictEqual(W.Enemies.hitTest(1.5, 17.75, 0, 20), null);
});
