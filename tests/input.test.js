'use strict';
const assert = require('assert');
const { load } = require('./harness');

function mk() {
  const W = load(['config.js', 'util.js', 'events.js', 'input.js']);
  const doc = W.__sandbox.document;
  const canvas = doc.getElementById('screen');
  W.Input.init(canvas);
  doc.pointerLockElement = canvas;
  doc.dispatch('pointerlockchange');
  return { W, doc };
}

test('first mousemove after pointer lock is ignored (Chrome re-centre spike)', () => {
  const { W, doc } = mk();
  doc.dispatch('mousemove', { movementX: -480 });
  assert.strictEqual(W.Input.consumeMouseDX(), 0);
  doc.dispatch('mousemove', { movementX: 12 });
  assert.strictEqual(W.Input.consumeMouseDX(), 12);
});

test('implausible single mousemove spikes are dropped', () => {
  const { W, doc } = mk();
  doc.dispatch('mousemove', { movementX: 5 }); // swallowed as first event
  doc.dispatch('mousemove', { movementX: 20 });
  doc.dispatch('mousemove', { movementX: 900 });
  doc.dispatch('mousemove', { movementX: -15 });
  assert.strictEqual(W.Input.consumeMouseDX(), 5);
});

test('no mouse look while not locked', () => {
  const { W, doc } = mk();
  doc.pointerLockElement = null; doc.dispatch('pointerlockchange');
  doc.dispatch('mousemove', { movementX: 30 });
  assert.strictEqual(W.Input.consumeMouseDX(), 0);
});

test('pointer lock requests that are silently ignored count as refusals', async () => {
  const W = load(['config.js', 'util.js', 'events.js', 'input.js']);
  const doc = W.__sandbox.document;
  const canvas = doc.getElementById('screen');
  W.Input.init(canvas);
  W.Input.lockTimeoutMs = 30;
  for (let i = 0; i < 3; i++) { W.Input.requestLock(); await new Promise(r => setTimeout(r, 50)); }
  assert.strictEqual(W.Input.lockUnavailable, true);
});

test('one refusal is enough when pointer lock never worked this session', () => {
  const W = load(['config.js', 'util.js', 'events.js', 'input.js']);
  const doc = W.__sandbox.document;
  W.Input.init(doc.getElementById('screen'));
  doc.dispatch('pointerlockerror');
  assert.strictEqual(W.Input.lockUnavailable, true);
});

test('after a successful lock, a single refusal (Chrome Esc cooldown) does not disable it', () => {
  const W = load(['config.js', 'util.js', 'events.js', 'input.js']);
  const doc = W.__sandbox.document, c = doc.getElementById('screen');
  W.Input.init(c);
  doc.pointerLockElement = c; doc.dispatch('pointerlockchange');
  doc.pointerLockElement = null; doc.dispatch('pointerlockchange');
  doc.dispatch('pointerlockerror');
  assert.strictEqual(W.Input.lockUnavailable, false);
});
