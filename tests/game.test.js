'use strict';
const assert = require('assert');
const { load, stubTextures } = require('./harness');

function mk(extra = {}) {
  const W = load(['config.js', 'util.js', 'events.js', 'map.js', 'input.js', 'raycaster.js', 'game.js'],
    { inject: Object.assign({ Textures: stubTextures() }, extra) });
  W.Game.boot();
  return W;
}

test('dt clamped to 0.05', () => {
  const seen = [];
  const W = mk({ Player: { reset() {}, update(dt) { seen.push(dt); }, x: 4.5, y: 28.5, angle: 0, hp: 100 } });
  W.Game.setState('PLAYING');
  W.Game.tick(1000);
  W.Game.tick(3000);
  assert.ok(seen.length >= 1);
  assert.strictEqual(seen[seen.length - 1], 0.05);
});

test('visibility hidden pauses', () => {
  const W = mk();
  W.Game.setState('PLAYING');
  const doc = W.__sandbox.document;
  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.strictEqual(W.Game.state, 'PAUSED');
});

test('loop error pauses with message', () => {
  let boom = true;
  const W = mk({ Player: { reset() {}, update() { if (boom) throw new Error('kaboom'); }, x: 4.5, y: 28.5, angle: 0, hp: 100 } });
  const errs = [];
  W.__sandbox.console.error = (...a) => errs.push(a.join(' '));
  W.Game.setState('PLAYING');
  W.Game.tick(1000); W.Game.tick(1016);
  assert.strictEqual(W.Game.state, 'PAUSED');
  assert.ok(/kaboom/i.test(W.Game.errorMessage));
  W.Game.tick(1032); // must not throw
  assert.strictEqual(errs.length, 1);
});

test('raycaster fills zBuffer', () => {
  const W = mk();
  const buf = new Uint32Array(320 * 200);
  W.Raycaster.render(buf, { x: W.Map.start.x, y: W.Map.start.y, angle: W.Map.start.angle }, [], { flash: 0, t: 0, bossRed: 0 });
  for (let i = 0; i < 320; i++) assert.ok(isFinite(W.Raycaster.zBuffer[i]) && W.Raycaster.zBuffer[i] > 0, 'col ' + i);
  assert.ok(buf.some(v => v !== 0));
});

// ---- Task 11: screens, scare, stats ----
const FULL = ['config.js', 'util.js', 'events.js', 'map.js', 'input.js', 'audio.js', 'player.js', 'weapons.js', 'enemies.js', 'waves.js', 'raycaster.js', 'effects.js', 'hud.js', 'game.js'];
function full() {
  const W = load(FULL, { inject: { Textures: stubTextures() } });
  W.Game.boot();
  return W;
}
const click = W => W.__sandbox.document.getElementById('screen').dispatch('mousedown', { button: 0 });

test('click on TITLE starts PLAYING', () => {
  const W = full();
  assert.strictEqual(W.Game.state, 'TITLE');
  click(W);
  assert.strictEqual(W.Game.state, 'PLAYING');
});

test('click on DEAD restarts to PLAYING with hp 100', () => {
  const W = full(); click(W);
  W.Game.debug.forceDeath();
  assert.strictEqual(W.Game.state, 'DEAD');
  click(W); // too early: ignored
  assert.strictEqual(W.Game.state, 'DEAD');
  for (let i = 0; i < 20; i++) W.Game.step(0.05);
  click(W);
  assert.strictEqual(W.Game.state, 'PLAYING');
  assert.strictEqual(W.Player.hp, 100);
});

test('click on VICTORY restarts', () => {
  const W = full(); click(W);
  W.Events.emit('level:victory', {});
  assert.strictEqual(W.Game.state, 'VICTORY');
  for (let i = 0; i < 20; i++) W.Game.step(0.05);
  click(W);
  assert.strictEqual(W.Game.state, 'PLAYING');
  assert.strictEqual(W.Waves.waveIndex, -1);
});

test('accuracy computed as hits/shots, 0 when no shots', () => {
  const W = full();
  assert.strictEqual(W.Hud.accuracy({ shots: 0, hits: 0 }), 0);
  assert.strictEqual(W.Hud.accuracy({ shots: 8, hits: 6 }), 75);
});

test('scare actor removed after 5.5 s and never damages', () => {
  const W = full(); click(W);
  let shown = false;
  for (let t = 0; t < 6; t += 0.05) { W.Game.step(0.05); if (W.Game.scare.active) shown = true; }
  assert.ok(shown, 'scare appeared');
  assert.strictEqual(W.Game.scare.active, false);
  assert.strictEqual(W.Game.scare.done, true);
  assert.strictEqual(W.Player.hp, 100);
  assert.strictEqual(W.Enemies.list.length, 0);
});

test('Escape pauses, click resumes', () => {
  const W = full(); click(W);
  W.__sandbox.document.dispatch('keydown', { code: 'Escape' });
  assert.strictEqual(W.Game.state, 'PAUSED');
  click(W);
  assert.strictEqual(W.Game.state, 'PLAYING');
});

test('menu click does not fire a shot', () => {
  const W = full(); click(W);
  for (let i = 0; i < 5; i++) W.Game.step(0.05);
  assert.strictEqual(W.Player.stats.shots, 0);
});

test('review: ambience restarts after restart()', () => {
  const W = full(); click(W);
  let n = 0; const orig = W.Audio.startAmbience;
  W.Audio.startAmbience = function () { n++; return orig.apply(this, arguments); };
  W.Game.debug.forceDeath();
  for (let i = 0; i < 20; i++) W.Game.step(0.05);
  click(W);
  assert.strictEqual(W.Game.state, 'PLAYING');
  assert.ok(n >= 1, 'startAmbience called on restart');
});

test('review: click while playing without pointer lock re-requests lock instead of firing', () => {
  const W = full(); click(W);
  const canvas = W.__sandbox.document.getElementById('screen');
  let req = 0; canvas.requestPointerLock = () => { req++; };
  assert.strictEqual(W.Input.locked, false);
  click(W);
  for (let i = 0; i < 3; i++) W.Game.step(0.05);
  assert.strictEqual(req, 1);
  assert.strictEqual(W.Player.stats.shots, 0);
});

test('review: after repeated pointer-lock errors, clicks fire and mouse look works unlocked', () => {
  const W = full(); click(W);
  const doc = W.__sandbox.document;
  for (let i = 0; i < 3; i++) doc.dispatch('pointerlockerror');
  W.__sandbox.document.dispatch('mouseup', { button: 0 });
  click(W);
  for (let i = 0; i < 3; i++) W.Game.step(0.05);
  assert.ok(W.Player.stats.shots >= 1);
  doc.dispatch('mousemove', { movementX: 40 });
  assert.strictEqual(W.Input.consumeMouseDX(), 40);
});

test('review: heartbeat stops when paused', () => {
  const W = full(); click(W);
  let last = null; const orig = W.Audio.setHeartbeat;
  W.Audio.setHeartbeat = function (r) { last = r; return orig.apply(this, arguments); };
  W.Player.hp = 10; W.Game.step(0.05);
  assert.ok(last > 0);
  W.__sandbox.document.dispatch('keydown', { code: 'Escape' });
  assert.strictEqual(last, 0);
});
