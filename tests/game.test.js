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
