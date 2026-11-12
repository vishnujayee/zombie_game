// Loads game scripts into a node:vm sandbox with minimal browser stubs.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function fakeCtx() {
  return {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, fillRect() {}, drawImage() {}, clearRect() {}, fillText() {},
    save() {}, restore() {}, translate() {}, scale() {},
    imageSmoothingEnabled: false, fillStyle: '', globalAlpha: 1, font: '',
  };
}

function fakeElement(tag) {
  const listeners = {};
  return {
    tagName: tag, style: {}, width: 0, height: 0, children: [],
    getContext: () => fakeCtx(),
    addEventListener(n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    removeEventListener() {},
    dispatch(n, e) { (listeners[n] || []).forEach(fn => fn(e || {})); },
    appendChild(c) { this.children.push(c); },
    requestPointerLock() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
  };
}

function fakeAudioCtx() {
  const node = () => ({
    connect() { return this; }, disconnect() {}, start() {}, stop() {},
    gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
    pan: { value: 0, setValueAtTime() {} },
    frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    Q: { value: 1 }, detune: { value: 0 }, type: '', buffer: null, loop: false, onended: null,
  });
  return function AudioContext() {
    return {
      currentTime: 0, sampleRate: 22050, state: 'running', destination: node(),
      resume() { return Promise.resolve(); },
      createGain: node, createOscillator: node, createBiquadFilter: node, createStereoPanner: node,
      createBufferSource: node, createMediaElementSource: node, createDynamicsCompressor: node,
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len }),
    };
  };
}

/** load(files, opts) -> W13. files are names relative to js/, e.g. 'config.js'. */
function load(files, opts = {}) {
  const docListeners = {};
  const winListeners = {};
  const elements = {};
  const document = {
    hidden: false, pointerLockElement: null,
    createElement: t => fakeElement(t),
    getElementById: id => (elements[id] = elements[id] || fakeElement('canvas')),
    body: fakeElement('body'),
    addEventListener(n, fn) { (docListeners[n] = docListeners[n] || []).push(fn); },
    removeEventListener() {},
    exitPointerLock() {},
    dispatch(n, e) { (docListeners[n] || []).forEach(fn => fn(e || {})); },
  };
  const warnings = [];
  const sandbox = {
    console: { log: console.log, error: console.error, warn: (...a) => warnings.push(a.join(' ')) },
    document,
    location: { search: opts.search || '' },
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    setTimeout, clearTimeout, Math, Date, JSON,
    Float32Array, Uint32Array, Uint8Array, Uint8ClampedArray, Int32Array, ArrayBuffer, Map, Set,
    Audio: opts.Audio || function () { return { addEventListener() {}, play() { return Promise.resolve(); }, pause() {}, cloneNode() { return this; }, volume: 1, src: '' }; },
    AudioContext: fakeAudioCtx(),
    addEventListener(n, fn) { (winListeners[n] = winListeners[n] || []).push(fn); },
    removeEventListener() {},
    innerWidth: 960, innerHeight: 600,
  };
  sandbox.window = sandbox;
  sandbox.__warnings = warnings;
  vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(code, sandbox, { filename: 'js/' + f });
  }
  const W13 = sandbox.W13;
  W13.__sandbox = sandbox;
  return W13;
}

const ALL = ['config.js', 'util.js', 'events.js', 'map.js', 'textures.js', 'input.js', 'audio.js',
  'player.js', 'weapons.js', 'enemies.js', 'waves.js', 'raycaster.js', 'effects.js', 'hud.js', 'game.js'];

module.exports = { load, ALL, ROOT };
