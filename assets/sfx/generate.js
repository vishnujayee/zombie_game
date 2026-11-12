#!/usr/bin/env node
// Generates the original WARD 13 sound effects (self-made, CC0) as OGG files.
// Usage: node assets/sfx/generate.js   (needs ffmpeg with libvorbis on PATH)
// Pure offline DSP: noise, oscillators, RBJ biquads, Schroeder reverb, tanh drive.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SR = 44100;
const OUT = __dirname;

// ---------- primitives ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buf = secs => new Float32Array(Math.floor(secs * SR));
const T = i => i / SR;

function biquad(type, freqFn, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, i) => {
    const f = Math.min(typeof freqFn === 'function' ? freqFn(T(i)) : freqFn, SR * 0.45);
    const w = 2 * Math.PI * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bandpass (0 dB peak)
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function oscFn(type) {
  let ph = 0;
  return f => {
    ph += f / SR; ph -= Math.floor(ph);
    if (type === 'sin') return Math.sin(2 * Math.PI * ph);
    if (type === 'saw') return 2 * ph - 1;
    if (type === 'sq') return ph < 0.5 ? 1 : -1;
    return 1 - 4 * Math.abs(ph - 0.5); // tri
  };
}
// attack-decay envelope (exponential decay with time constant tau)
const ad = (t, a, tau) => (t < a ? t / a : Math.exp(-(t - a) / tau));
function reverb(x, mix, size) {
  const combs = [1557, 1617, 1491, 1422].map(n => ({ d: new Float32Array(Math.floor(n * size)), i: 0 }));
  const aps = [225, 556].map(n => ({ d: new Float32Array(n), i: 0 }));
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) { const y = c.d[c.i]; c.d[c.i] = x[n] + y * 0.82; c.i = (c.i + 1) % c.d.length; s += y; }
    s *= 0.25;
    for (const a of aps) { const y = a.d[a.i]; const v = s + y * 0.5; a.d[a.i] = v; a.i = (a.i + 1) % a.d.length; s = y - v * 0.5; }
    out[n] = x[n] * (1 - mix) + s * mix;
  }
  return out;
}
function normalize(x, peak = 0.9) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  // 5 ms fade-out to avoid clicks
  const f = Math.floor(0.005 * SR);
  for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
  return x;
}
function mix(...parts) {
  const len = Math.max(...parts.map(p => p.length));
  const o = new Float32Array(len);
  for (const p of parts) for (let i = 0; i < p.length; i++) o[i] += p[i];
  return o;
}
function delayed(x, secs) { const o = new Float32Array(x.length + Math.floor(secs * SR)); o.set(x, Math.floor(secs * SR)); return o; }

// ---------- recipes ----------
function gunshot(big, seed) {
  const r = rng(seed), len = big ? 1.4 : 0.9;
  const x = buf(len), lp = biquad('lp', t => (big ? 3200 : 5200) * Math.exp(-t * 6) + 300, 0.7);
  const thump = oscFn('sin');
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const n = lp(r() * 2 - 1, i) * ad(t, 0.001, big ? 0.09 : 0.05);
    const f = (big ? 38 : 50) + (big ? 70 : 100) * Math.exp(-t * 25);
    const th = thump(f) * ad(t, 0.002, big ? 0.12 : 0.06);
    const crack = (r() * 2 - 1) * ad(t, 0.0005, 0.006);
    x[i] = Math.tanh((n * 1.4 + th * 1.2 + crack * 0.6) * 1.8);
  }
  return normalize(reverb(x, big ? 0.35 : 0.28, 1.0));
}
function clicks(spec, seed) {
  const r = rng(seed);
  const len = Math.max(...spec.map(s => s[0])) + 0.25;
  const x = buf(len);
  for (const [at, freq, v] of spec) {
    const bp = biquad('bp', freq, 5), bp2 = biquad('bp', freq * 2.7, 9);
    const s = Math.floor(at * SR);
    for (let i = 0; i < 0.12 * SR && s + i < x.length; i++) {
      const t = T(i), e = ad(t, 0.0005, 0.012);
      const n = r() * 2 - 1;
      x[s + i] += (bp(n, i) * 2.2 + bp2(n, i) * 1.2) * e * v;
    }
  }
  return normalize(reverb(x, 0.12, 0.5), 0.8);
}
function groan(seed, len, pitch) {
  const r = rng(seed), x = buf(len + 0.6);
  const f0 = pitch || 70 + r() * 40;
  const oscs = [0, 0.011, -0.014].map(() => oscFn('saw'));
  const dets = [1, 1.011, 0.986];
  const formant1 = biquad('bp', 520 + r() * 200, 3), formant2 = biquad('bp', 1100 + r() * 300, 5);
  const lp = biquad('lp', t => 900 + 400 * Math.sin(t * 3.1), 1.2);
  const breath = biquad('bp', 700, 1.2);
  const wob = 4 + r() * 3, drift = r() * 6;
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const env = t < 0.3 ? t / 0.3 : t < len ? 1 - 0.3 * ((t - 0.3) / len) : Math.max(0, 0.7 - (t - len) * 2);
    const f = f0 * (1 - 0.22 * (t / len)) * (1 + 0.035 * Math.sin(2 * Math.PI * wob * t) + 0.02 * Math.sin(drift + t * 1.7));
    let s = 0;
    for (let k = 0; k < 3; k++) s += oscs[k](f * dets[k]);
    s /= 3;
    // irregular glottal "rattle"
    s *= 0.75 + 0.25 * Math.sin(2 * Math.PI * (17 + 6 * Math.sin(t * 2)) * t);
    const v = formant1(s, i) * 1.6 + formant2(s, i) * 0.8 + lp(s, i) * 0.6;
    const b = breath(r() * 2 - 1, i) * 0.25;
    x[i] = Math.tanh((v + b) * 2.2) * env;
  }
  return normalize(reverb(x, 0.3, 1.1));
}
function screech() {
  const r = rng(9), len = 1.0, x = buf(len + 0.4);
  const bp = biquad('bp', t => 900 * Math.pow(4, Math.min(t / 0.7, 1)), 7);
  const o = oscFn('saw'), lp = biquad('lp', 3000, 1);
  for (let i = 0; i < x.length; i++) {
    const t = T(i), e = ad(t, 0.04, 0.35);
    const f = 600 * Math.pow(2.4, Math.min(t / 0.6, 1)) * (1 + 0.04 * Math.sin(t * 60));
    x[i] = Math.tanh((bp(r() * 2 - 1, i) * 3 + lp(o(f), i) * 0.5) * 2.5) * e;
  }
  return normalize(reverb(x, 0.25, 0.9));
}
function burst() {
  const r = rng(4), x = buf(1.3);
  const lp = biquad('lp', t => 1400 * Math.exp(-t * 3) + 200, 3), o = oscFn('sin');
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const gurgle = 0.6 + 0.4 * Math.sin(2 * Math.PI * (22 + 10 * Math.sin(t * 9)) * t);
    const n = lp(r() * 2 - 1, i) * ad(t, 0.005, 0.25) * gurgle;
    const th = o(30 + 50 * Math.exp(-t * 12)) * ad(t, 0.003, 0.15);
    x[i] = Math.tanh((n * 2 + th * 1.5) * 1.5);
  }
  return normalize(reverb(x, 0.25, 0.8));
}
function roar() {
  const r = rng(77), len = 2.3, x = buf(len + 0.8);
  const fs = [45, 46.4, 22.6, 61].map(() => oscFn('saw'));
  const base = [45, 46.4, 22.6, 61];
  const lp = biquad('lp', t => 350 + 1100 * Math.sin(Math.PI * Math.min(t / len, 1)), 3);
  const breath = biquad('bp', 380, 1);
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const env = t < 0.35 ? t / 0.35 : t < len ? 1 : Math.max(0, 1 - (t - len) * 2.5);
    const bend = 1 - 0.3 * Math.min(t / len, 1) + 0.03 * Math.sin(t * 37);
    let s = 0;
    for (let k = 0; k < 4; k++) s += fs[k](base[k] * bend);
    s = lp(s / 4, i) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 11 * t));
    x[i] = Math.tanh((s * 5 + breath(r() * 2 - 1, i) * 0.6)) * env;
  }
  return normalize(reverb(x, 0.4, 1.3));
}
function bossHit() {
  const r = rng(5), x = buf(0.6), o = oscFn('sin'), lp = biquad('lp', 1300, 1);
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    x[i] = Math.tanh(o(40 + 60 * Math.exp(-t * 18)) * ad(t, 0.002, 0.1) * 1.5 + lp(r() * 2 - 1, i) * ad(t, 0.001, 0.05));
  }
  return normalize(reverb(x, 0.2, 0.7));
}
function grunt(seed, len, f0, f1) {
  const r = rng(seed), x = buf(len + 0.5), o = oscFn('saw');
  const f1b = biquad('bp', 720, 3), f2b = biquad('bp', 1250, 5);
  for (let i = 0; i < x.length; i++) {
    const t = T(i), k = Math.min(t / len, 1);
    const env = t < 0.02 ? t / 0.02 : Math.max(0, 1 - Math.pow(k, 1.5)) * (t < len ? 1 : 0);
    const s = o(f0 * Math.pow(f1 / f0, k) * (1 + 0.02 * (r() - 0.5)));
    x[i] = Math.tanh((f1b(s, i) * 1.5 + f2b(s, i)) * 2.5) * env;
  }
  return normalize(reverb(x, 0.3, 0.9));
}
function footstep() {
  const r = rng(3), x = buf(0.25), lp = biquad('lp', 420, 1);
  for (let i = 0; i < x.length; i++) x[i] = lp(r() * 2 - 1, i) * ad(T(i), 0.004, 0.035);
  return normalize(x, 0.7);
}
function pickup() {
  const x = buf(0.45), o = oscFn('sq'), lp = biquad('lp', 2200, 1);
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const f = t < 0.1 ? 440 : 660;
    const e = t < 0.1 ? ad(t, 0.004, 0.05) : ad(t - 0.1, 0.004, 0.08);
    x[i] = lp(o(f), i) * e * 0.5;
  }
  return normalize(reverb(x, 0.25, 0.6), 0.6);
}
function door() {
  const r = rng(6), x = buf(1.6), o = oscFn('saw');
  const bp = biquad('bp', 1400, 9), bp2 = biquad('bp', 2300, 12), lpT = biquad('lp', 300, 1), th = oscFn('sin');
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    const creakE = t < 0.95 ? Math.min(t / 0.1, 1) * (0.6 + 0.4 * Math.sin(t * 23)) : 0;
    const f = 120 + 40 * Math.sin(t * 5) + 15 * (r() - 0.5);
    const creak = (bp(o(f), i) * 2 + bp2(o(f), i)) * creakE * 0.6;
    const ct = t - 0.9;
    const clunk = ct > 0 ? (th(35 + 30 * Math.exp(-ct * 15)) * 1.2 + lpT(r() * 2 - 1, i)) * ad(ct, 0.002, 0.09) : 0;
    x[i] = Math.tanh(creak + clunk);
  }
  return normalize(reverb(x, 0.3, 1.0));
}
function ambience() {
  const len = 16, x = buf(len), r = rng(21);
  const o1 = oscFn('sin'), o2 = oscFn('sin'), o3 = oscFn('tri');
  const lp = biquad('lp', t => 160 + 90 * Math.sin(2 * Math.PI * t / len * 2), 1.5);
  const wind = biquad('bp', t => 500 + 250 * Math.sin(2 * Math.PI * t / len * 3), 4);
  let brown = 0;
  for (let i = 0; i < x.length; i++) {
    const t = T(i);
    brown = (brown + 0.02 * (r() * 2 - 1)) / 1.02;
    const ph = 2 * Math.PI * t / len; // periodic over the loop → seamless
    const drone = o1(55) * 0.25 + o2(58.3) * 0.2 + o3(27.5) * 0.15 * (0.5 + 0.5 * Math.sin(ph * 4));
    const w = wind(r() * 2 - 1, i) * 0.12 * (0.5 + 0.5 * Math.sin(ph * 3 + 1));
    x[i] = lp(brown * 3.5, i) * 0.9 + drone * (0.7 + 0.3 * Math.sin(ph)) + w;
  }
  // crossfade tail into head for a seamless loop
  const xf = Math.floor(1.0 * SR);
  for (let i = 0; i < xf; i++) {
    const a = i / xf;
    x[i] = x[i] * a + x[x.length - xf + i] * (1 - a);
  }
  const out = x.subarray(0, x.length - xf);
  let m = 0; for (const v of out) m = Math.max(m, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] *= 0.7 / m;
  return out;
}
function heartbeat() {
  const x = buf(0.6);
  const o1 = oscFn('sin'), o2 = oscFn('sin');
  for (let i = 0; i < x.length; i++) {
    const t = T(i), t2 = t - 0.22;
    const a = o1(32 + 30 * Math.exp(-t * 20)) * ad(t, 0.008, 0.06);
    const b = t2 > 0 ? o2(30 + 22 * Math.exp(-t2 * 20)) * ad(t2, 0.008, 0.07) * 0.7 : 0;
    x[i] = Math.tanh((a + b) * 1.6);
  }
  return normalize(x, 0.85);
}

const SOUNDS = {
  pistol: () => gunshot(false, 11),
  shotgun: () => gunshot(true, 12),
  pump: () => clicks([[0, 1800, 1], [0.06, 900, 0.7], [0.22, 1400, 1.1]], 31),
  reload: () => clicks([[0, 2200, 0.8], [0.3, 1500, 1], [0.7, 2600, 1.1]], 32),
  empty: () => clicks([[0, 3000, 1]], 33),
  zombie_groan_1: () => groan(101, 1.3, 82),
  zombie_groan_2: () => groan(202, 1.7, 68),
  zombie_groan_3: () => groan(303, 1.0, 104),
  runner_screech: screech,
  bloater_burst: burst,
  boss_roar: roar,
  boss_hit: bossHit,
  player_hurt: () => grunt(41, 0.3, 200, 120),
  player_death: () => grunt(42, 1.4, 220, 62),
  footstep,
  pickup,
  door,
  ambience,
  heartbeat,
};

function wav(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}

if (require.main === module) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13sfx-'));
  for (const [id, fn] of Object.entries(SOUNDS)) {
    const w = path.join(tmp, id + '.wav');
    fs.writeFileSync(w, wav(fn()));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'libvorbis', '-q:a', '4', path.join(OUT, id + '.ogg')]);
    console.log('wrote ' + id + '.ogg');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

module.exports = { SOUNDS };
