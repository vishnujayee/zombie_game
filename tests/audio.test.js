'use strict';
const assert = require('assert');
const { load } = require('./harness');

const IDS = ['pistol', 'shotgun', 'pump', 'reload', 'empty', 'zombie_groan_1', 'zombie_groan_2', 'zombie_groan_3',
  'runner_screech', 'bloater_burst', 'boss_roar', 'boss_hit', 'player_hurt', 'player_death', 'footstep',
  'pickup', 'door', 'ambience', 'heartbeat'];

function erroringAudio() {
  return function () {
    const listeners = {};
    const el = {
      volume: 1, src: '',
      addEventListener(n, fn) { (listeners[n] = listeners[n] || []).push(fn); if (n === 'error') setImmediate(() => fn({})); },
      play() { return Promise.resolve(); }, pause() {}, cloneNode() { return el; }, load() {},
    };
    return el;
  };
}

const audio = (opts) => load(['config.js', 'util.js', 'events.js', 'audio.js'], opts);

test('every spec sound id has a procedural recipe', () => {
  const W13 = audio();
  for (const id of IDS) assert.strictEqual(typeof W13.Audio.Procedural[id], 'function', 'missing recipe ' + id);
});

test('procedural recipes run without throwing on a stub context', () => {
  const W13 = audio();
  W13.Audio._strict = true;
  W13.Audio.init();
  for (const id of IDS) W13.Audio.play(id, { x: 2, y: 3 });
  W13.Audio.startAmbience();
  W13.Audio.stopAmbience();
});

test('play before init is a safe no-op', () => {
  const W13 = audio();
  W13.Audio.play('pistol');
  W13.Audio.loop('ambience');
  W13.Audio.setHeartbeat(0.5);
});

test('missing file falls back with one warn', async () => {
  const W13 = audio({ Audio: erroringAudio() });
  W13.Audio.FILES.pistol = 'assets/sfx/does_not_exist.ogg';
  W13.Audio.preload();
  W13.Audio.preload();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.strictEqual(W13.Audio.usingFallback('pistol'), true);
  const warns = W13.__sandbox.__warnings.filter(w => w.includes('pistol'));
  assert.strictEqual(warns.length, 1);
});

test('id without a file uses fallback', () => {
  const W13 = audio();
  delete W13.Audio.FILES.heartbeat;
  assert.strictEqual(W13.Audio.usingFallback('heartbeat'), true);
});

// Map axes: x right, y down. Angle 0 faces +x; positive angleDiff = clockwise on screen = listener's right.
test('pan right when source is to the right', () => {
  const W13 = audio();
  // Listener at origin facing +x (angle 0). A source at +y (down) is to the listener's right.
  const right = W13.Audio._spatial({ x: 0, y: 0, angle: 0 }, { x: 0, y: 3 });
  const left = W13.Audio._spatial({ x: 0, y: 0, angle: 0 }, { x: 0, y: -3 });
  const ahead = W13.Audio._spatial({ x: 0, y: 0, angle: 0 }, { x: 3, y: 0 });
  assert.ok(right.pan > 0.9, 'right pan ' + right.pan);
  assert.ok(left.pan < -0.9, 'left pan ' + left.pan);
  assert.ok(Math.abs(ahead.pan) < 1e-6);
});

test('gain decreases with distance', () => {
  const W13 = audio();
  const L = { x: 0, y: 0, angle: 0 };
  const near = W13.Audio._spatial(L, { x: 1, y: 0 }).gain;
  const far = W13.Audio._spatial(L, { x: 8, y: 0 }).gain;
  assert.ok(Math.abs(near - 1 / (1 + 0.35)) < 1e-9);
  assert.ok(far < near);
});

test('init twice subscribes once', () => {
  const W13 = audio();
  W13.Audio.init();
  W13.Audio.init();
  let calls = 0;
  const orig = W13.Audio.play;
  W13.Audio.play = function () { calls++; return orig.apply(this, arguments); };
  W13.Events.emit('shot', { weapon: 'pistol', x: 1, y: 1 });
  assert.strictEqual(calls, 1);
});

test('toggleMute flips and reset turns heartbeat off', () => {
  const W13 = audio();
  W13.Audio.init();
  assert.strictEqual(W13.Audio.toggleMute(), true);
  assert.strictEqual(W13.Audio.toggleMute(), false);
  W13.Audio.setHeartbeat(0.8);
  assert.ok(W13.Audio._heartbeatRate() > 0);
  W13.Audio.reset();
  assert.strictEqual(W13.Audio._heartbeatRate(), 0);
});

test('review: unmute restores looping file volume', () => {
  const els = [];
  const Stub = function (src) { const el = { src, volume: 1, loop: false, listeners: {}, addEventListener(n, f) { this.listeners[n] = f; }, play() { return Promise.resolve(); }, pause() {}, cloneNode() { const c = new Stub(src); return c; } }; els.push(el); setTimeout(() => el.listeners.canplaythrough && el.listeners.canplaythrough(), 0); return el; };
  const W13 = load(['config.js', 'util.js', 'events.js', 'audio.js'], { Audio: Stub });
  W13.Audio.preload(); W13.Audio.init();
  return new Promise((res, rej) => setTimeout(() => { try {
    W13.Audio.startAmbience();
    const amb = els.filter(e => e.loop)[0];
    assert.ok(amb, 'ambience element looping');
    const v = amb.volume;
    assert.ok(v > 0);
    W13.Audio.toggleMute();
    assert.strictEqual(amb.volume, 0);
    W13.Audio.toggleMute();
    assert.ok(Math.abs(amb.volume - v) < 1e-9, `restored ${amb.volume} vs ${v}`);
    res();
  } catch (e) { rej(e); } }, 20));
});
