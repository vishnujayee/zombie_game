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
