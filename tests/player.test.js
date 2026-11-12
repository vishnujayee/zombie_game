'use strict';
const assert = require('assert');
const { load } = require('./harness');

function mk() {
  const W = load(['config.js', 'util.js', 'events.js', 'map.js', 'player.js']);
  W.Map.load(); W.Player.init(); W.Player.reset();
  return W;
}
const inp = (o = {}) => Object.assign({ forward: 0, strafe: 0, turn: 0, run: false }, o);
const run = (P, secs, input) => { for (let t = 0; t < secs - 1e-9; t += 0.01) P.update(0.01, input); };

test('walks forward at walk speed', () => {
  const { Player: P } = mk();
  P.x = 2.5; P.y = 16.5; P.angle = 0;
  run(P, 1, inp({ forward: 1 }));
  assert.ok(Math.abs(P.x - 5.1) < 0.01, 'x=' + P.x);
});

test('runs at run speed', () => {
  const { Player: P } = mk();
  P.x = 2.5; P.y = 16.5; P.angle = 0;
  run(P, 1, inp({ forward: 1, run: true }));
  assert.ok(Math.abs(P.x - 6.7) < 0.01, 'x=' + P.x);
});

test('slides along wall', () => {
  const { Player: P } = mk();
  // lobby north wall is row 14 (solid at x>=3). Move diagonally north-east into it.
  P.x = 5.5; P.y = 15.4; P.angle = -Math.PI / 4;
  run(P, 0.5, inp({ forward: 1 }));
  assert.ok(P.x > 6.3, 'kept east motion x=' + P.x);
  assert.ok(P.y >= 15 + 0.25 - 1e-9, 'did not enter wall y=' + P.y);
});

test('never enters solid', () => {
  const W = mk(); const P = W.Player, M = W.Map;
  const r = W.Util.rng(7);
  P.x = 6.5; P.y = 19.5;
  for (let i = 0; i < 2000; i++) {
    P.angle = r() * Math.PI * 2;
    P.update(0.02, inp({ forward: 1, run: true, strafe: r() < 0.5 ? -1 : 1 }));
    const R = 0.25;
    for (const [cx, cy] of [[-R, -R], [R, -R], [-R, R], [R, R]]) assert.ok(!M.isSolid(P.x + cx, P.y + cy), `in wall at ${P.x},${P.y}`);
  }
});

function pickupAt(W, kind) { const M = W.Map; return M.pickups.find(p => p.kind === kind && !p.taken); }

test('health pickup heals and caps at 100', () => {
  const W = mk(); const P = W.Player;
  P.hp = 90;
  const h = pickupAt(W, 'health');
  P.x = h.x; P.y = h.y; P.update(0.01, inp());
  assert.strictEqual(P.hp, 100); assert.strictEqual(h.taken, true);
});

test('health pickup skipped at full hp', () => {
  const W = mk(); const P = W.Player;
  const h = pickupAt(W, 'health');
  P.x = h.x; P.y = h.y; P.update(0.01, inp());
  assert.strictEqual(h.taken, false);
});

test('shotgun pickup grants and switches', () => {
  const W = mk(); const P = W.Player;
  const got = [];
  W.Events.on('pickup', d => got.push(d.kind));
  const s = pickupAt(W, 'shotgun');
  P.x = s.x; P.y = s.y; P.update(0.01, inp());
  assert.strictEqual(P.weapons.shotgun.owned, true);
  assert.strictEqual(P.weapons.shotgun.mag, 6);
  assert.strictEqual(P.weapons.shotgun.reserve, 12);
  assert.strictEqual(P.current, 'shotgun');
  assert.strictEqual(got[0], 'shotgun');
});

test('zone:enter emitted once per zone change', () => {
  const W = mk(); const P = W.Player;
  const z = [];
  W.Events.on('zone:enter', d => z.push(d.zone));
  P.update(0.01, inp()); P.update(0.01, inp());
  P.x = 6.5; P.y = 19.5; P.update(0.01, inp()); P.update(0.01, inp());
  assert.strictEqual(JSON.stringify(z), '["reception","lobby"]');
});

test('player:died emitted exactly once', () => {
  const W = mk(); const P = W.Player;
  let n = 0; W.Events.on('player:died', () => n++);
  P.damage(60, P.x + 1, P.y); P.damage(60, P.x + 1, P.y); P.damage(60, P.x + 1, P.y);
  assert.strictEqual(n, 1); assert.ok(P.dead);
});

test('auto door opens on approach, scripted door does not', () => {
  const W = mk(); const P = W.Player, M = W.Map;
  const d = M.doors['D@4,25'];
  P.x = 4.5; P.y = 26.6; P.update(0.01, inp());
  assert.strictEqual(d.open, true);
  P.x = 2.5; P.y = 5.5; P.update(0.01, inp());
  assert.strictEqual(M.doors['1'].open, false);
});
