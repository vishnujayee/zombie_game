'use strict';
const assert = require('assert');
const { load, stubTextures } = require('./harness');

const FILES = ['config.js', 'util.js', 'events.js', 'map.js', 'input.js', 'audio.js', 'player.js', 'weapons.js', 'enemies.js', 'waves.js', 'raycaster.js', 'game.js'];
function mk() {
  const W = load(FILES, { inject: { Textures: stubTextures() } });
  W.Game.boot();
  W.Game.setState('PLAYING');
  return W;
}
const sim = (W, secs, dt = 0.05) => { for (let t = 0; t < secs - 1e-9; t += dt) { W.Player.update(dt, { forward: 0, strafe: 0, turn: 0 }); W.Enemies.update(dt, W.Player); W.Waves.update(dt, W.Player); } };
const at = (W, x, y) => { W.Player.x = x; W.Player.y = y; };
const killTag = (W, tag) => W.Enemies.list.filter(e => e.waveTag === tag && e.state !== 'dead').forEach(e => W.Enemies.damage(e, 1e6));

test('full script order', () => {
  const W = mk(); W.Game.debug.god = true;
  let victory = 0; W.Events.on('level:victory', () => victory++);
  sim(W, 0.2);
  assert.strictEqual(W.Waves.waveIndex, -1);
  at(W, 6.5, 19.5); sim(W, 0.1);
  assert.strictEqual(W.Waves.waveIndex, 0);
  sim(W, 12);
  assert.strictEqual(W.Enemies.list.filter(e => e.waveTag === 0).length, 8);
  assert.strictEqual(W.Map.doors['1'].open, false);
  killTag(W, 0); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['1'].open, true);
  const sg = W.Map.pickups.find(p => p.kind === 'shotgun');
  at(W, sg.x, sg.y); sim(W, 0.1);
  assert.strictEqual(W.Waves.waveIndex, 1);
  sim(W, 14);
  assert.strictEqual(W.Enemies.list.filter(e => e.waveTag === 1).length, 9);
  killTag(W, 1); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['2'].open, true);
  at(W, 25.5, 5.5); sim(W, 0.1);
  assert.strictEqual(W.Waves.waveIndex, 2);
  sim(W, 12);
  assert.strictEqual(W.Enemies.list.filter(e => e.waveTag === 2).length, 8);
  killTag(W, 2); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['T'].open, true);
  at(W, 14.5, 8.5); sim(W, 0.1);
  assert.strictEqual(W.Waves.waveIndex, 3);
  assert.ok(W.Enemies.list.some(e => e.type === 'boss'));
  assert.strictEqual(W.Map.doors['T'].open, false);
  killTag(W, 'boss'); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['T'].open, true);
  assert.strictEqual(W.Map.doors['X'].locked, false);
  assert.strictEqual(W.Waves.exitOpen, true);
  at(W, 14.5, 12.5); sim(W, 0.1); sim(W, 0.1);
  assert.strictEqual(victory, 1);
});

function toTheatre(W) {
  W.Game.debug.god = true;
  at(W, 6.5, 19.5); sim(W, 0.1); W.Waves.debugSkip(); sim(W, 0.1);
  const sg = W.Map.pickups.find(p => p.kind === 'shotgun'); at(W, sg.x, sg.y); sim(W, 0.1); W.Waves.debugSkip(); sim(W, 0.1);
  at(W, 25.5, 5.5); sim(W, 0.1); W.Waves.debugSkip(); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['T'].open, true);
}

test('theatre locks only when player clear of door', () => {
  const W = mk(); toTheatre(W);
  at(W, 17.6, 5.5); sim(W, 0.1);           // in theatre zone but box overlaps the door tile margin
  assert.strictEqual(W.Map.doors['T'].open, true);
  assert.ok(!W.Enemies.list.some(e => e.type === 'boss'));
  at(W, 17.3, 5.5); sim(W, 0.1);
  assert.strictEqual(W.Map.doors['T'].open, false);
  assert.ok(W.Enemies.list.some(e => e.type === 'boss'));
});

test('spawns not visible to player', () => {
  const W = mk(); W.Game.debug.god = true;
  at(W, 6.5, 19.5);
  const seen = [];
  W.Events.on('enemy:spawned', d => seen.push(W.Map.hasLOS(W.Player.x, W.Player.y, d.enemy.x, d.enemy.y)));
  sim(W, 1.5);
  assert.ok(seen.length >= 1);
  // at least some spawn points must be hidden; every spawn must be hidden when any hidden point exists
  assert.ok(seen.every(v => v === false), JSON.stringify(seen));
});

test('stuck enemy teleported after 20 s', () => {
  const W = mk(); W.Game.debug.god = true;
  at(W, 6.5, 19.5); sim(W, 0.1); sim(W, 10);
  const e = W.Enemies.list.find(x => x.state !== 'dead');
  e.stuckTime = 21; e.x = 1.5; e.y = 2.5;
  W.Waves.update(0.05, W.Player);
  assert.ok(!(e.x === 1.5 && e.y === 2.5), 'teleported');
  assert.strictEqual(e.stuckTime, 0);
});

test('ammo mercy drop', () => {
  const W = mk(); W.Game.debug.god = true;
  at(W, 6.5, 19.5); sim(W, 0.1); sim(W, 2);
  const P = W.Player;
  P.weapons.pistol.mag = 0; P.weapons.pistol.reserve = 0;
  const before = W.Map.pickups.length;
  for (let t = 0; t < 4.9 - 1e-9; t += 0.05) W.Waves.update(0.05, P);
  assert.strictEqual(W.Map.pickups.length, before);
  for (let t = 0; t < 0.2; t += 0.05) W.Waves.update(0.05, P);
  assert.strictEqual(W.Map.pickups.length, before + 1);
  const m = W.Map.pickups[W.Map.pickups.length - 1];
  assert.strictEqual(m.kind, 'ammo_pistol');
  assert.ok(!W.Map.isSolid(m.x, m.y));
  assert.ok(Math.hypot(m.x - P.x, m.y - P.y) < 3);
});

test('restart resets all state and listeners', () => {
  const W = mk(); W.Game.debug.god = true;
  at(W, 6.5, 19.5); sim(W, 0.1); W.Waves.debugSkip(); sim(W, 0.1);
  const sg = W.Map.pickups.find(p => p.kind === 'shotgun'); at(W, sg.x, sg.y); sim(W, 3);
  W.Player.hp = 40;
  W.Game.restart();
  const P = W.Player, M = W.Map;
  assert.strictEqual(P.hp, 100);
  assert.strictEqual(P.weapons.pistol.mag, 12); assert.strictEqual(P.weapons.pistol.reserve, 24);
  assert.strictEqual(P.weapons.shotgun.owned, false);
  for (const id of ['1', '2', 'T']) assert.strictEqual(M.doors[id].open, false, id);
  assert.strictEqual(M.doors['X'].locked, true);
  assert.strictEqual(W.Enemies.list.length, 0);
  assert.strictEqual(W.Waves.waveIndex, -1);
  assert.strictEqual(M.pickups.find(p => p.kind === 'shotgun').taken, false);
  W.Audio.init();
  let calls = 0; const orig = W.Audio.play;
  W.Audio.play = function () { calls++; return orig.apply(this, arguments); };
  W.Events.emit('shot', { weapon: 'pistol', x: P.x, y: P.y });
  assert.strictEqual(calls, 1);
});
