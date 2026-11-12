// W13.Audio — sound files (HTMLAudioElement) with a procedural Web Audio fallback for every id.
// No fetch/XHR: works from file://.
// Map axes: x right, y down. Angle 0 faces +x, angles grow clockwise on screen, so a
// positive angleDiff(listenerAngle, sourceAngle) means the source is on the listener's RIGHT.
window.W13 = window.W13 || {};
W13.Audio = (function () {
  const U = W13.Util;
  const cfg = () => W13.Config.audio;

  const IDS = ['pistol', 'shotgun', 'pump', 'reload', 'empty', 'zombie_groan_1', 'zombie_groan_2', 'zombie_groan_3',
    'runner_screech', 'bloater_burst', 'boss_roar', 'boss_hit', 'player_hurt', 'player_death', 'footstep',
    'pickup', 'door', 'ambience', 'heartbeat'];

  const FILES = {};
  IDS.forEach(id => { FILES[id] = 'assets/sfx/' + id + '.ogg'; });

  let ctx = null, master = null, noiseBuf = null, brownBuf = null;
  let subscribed = false, muted = false;
  const status = {};      // id -> 'loading' | 'ok' | 'fallback'
  const warned = {};
  const pools = {};       // id -> [HTMLAudioElement]
  const loops = {};       // id -> { stop() }
  const listener = { x: 0, y: 0, angle: 0 };
  let hbRate = 0, hbTimer = null;

  // ---------- helpers ----------
  function spatial(L, pos) {
    if (!pos) return { gain: 1, pan: 0 };
    const dx = pos.x - L.x, dy = pos.y - L.y;
    const d = Math.hypot(dx, dy);
    const gain = 1 / (1 + d * W13.Config.audio.falloff);
    if (d < 1e-6) return { gain, pan: 0 };
    const pan = U.clamp(Math.sin(U.angleDiff(L.angle, Math.atan2(dy, dx))), -1, 1);
    return { gain, pan };
  }

  function makeNoise(seconds, brown) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = U.rng(brown ? 7 : 13);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  function noise(dest, t0, dur, opts) {
    const src = ctx.createBufferSource();
    src.buffer = opts && opts.brown ? brownBuf : noiseBuf;
    src.loop = true;
    src.connect(dest);
    src.start(t0);
    if (dur != null) src.stop(t0 + dur);
    return src;
  }
  function osc(type, freq, dest, t0, dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(dest);
    o.start(t0);
    if (dur != null) o.stop(t0 + dur);
    return o;
  }
  function gain(dest, v) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  function env(dest, t0, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    g.connect(dest);
    return g;
  }
  function filter(type, freq, q, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q == null ? 1 : q;
    f.connect(dest);
    return f;
  }
  function drive(dest, amount) {
    if (!ctx.createWaveShaper) return dest;
    const ws = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount); }
    ws.curve = curve;
    ws.connect(dest);
    return ws;
  }

  function gunshot(dest, t, big) {
    const len = big ? 0.55 : 0.28;
    noise(env(filter('lowpass', big ? 2600 : 4200, 0.7, dest), t, big ? 1.0 : 0.8, 0.002, len), t, len + 0.05);
    const o = osc('sine', big ? 95 : 140, env(dest, t, big ? 1.0 : 0.7, 0.003, big ? 0.3 : 0.15), t, 0.4);
    o.frequency.exponentialRampToValueAtTime(big ? 38 : 50, t + (big ? 0.25 : 0.12));
  }
  function click(dest, t, freq, v) {
    noise(env(filter('bandpass', freq, 6, dest), t, v, 0.001, 0.035), t, 0.06);
  }
  function groan(dest, t, seed, len) {
    const r = U.rng(seed);
    const f0 = 70 + r() * 40;
    const out = env(filter('lowpass', 650 + r() * 300, 2, drive(dest, 2.2)), t, 0.55, 0.25, len);
    const lfo = osc('sine', 4 + r() * 3, gain(out, 0), t, len + 0.3);
    [0, 7, -9].forEach(det => {
      const o = osc('sawtooth', f0, out, t, len + 0.3);
      o.detune.value = det + r() * 6;
      o.frequency.linearRampToValueAtTime(f0 * (0.75 + r() * 0.2), t + len);
      if (lfo) lfo.connect(gain(o.frequency, 6));
    });
    noise(env(filter('bandpass', 500, 1.5, dest), t, 0.12, 0.2, len), t, len + 0.3);
  }

  // ---------- procedural recipes (ctx, dest, opts) ----------
  const Procedural = {
    pistol: (c, d) => gunshot(d, c.currentTime, false),
    shotgun: (c, d) => gunshot(d, c.currentTime, true),
    pump: (c, d) => { const t = c.currentTime; click(d, t, 1800, 0.7); click(d, t + 0.05, 900, 0.5); click(d, t + 0.2, 1400, 0.8); },
    reload: (c, d) => { const t = c.currentTime; click(d, t, 2200, 0.5); click(d, t + 0.25, 1500, 0.6); click(d, t + 0.6, 2600, 0.7); },
    empty: (c, d) => click(d, c.currentTime, 3000, 0.4),
    zombie_groan_1: (c, d) => groan(d, c.currentTime, 101, 1.3),
    zombie_groan_2: (c, d) => groan(d, c.currentTime, 202, 1.6),
    zombie_groan_3: (c, d) => groan(d, c.currentTime, 303, 1.0),
    runner_screech: (c, d) => {
      const t = c.currentTime;
      const bp = filter('bandpass', 900, 8, drive(d, 3));
      bp.frequency.exponentialRampToValueAtTime(3600, t + 0.7);
      noise(env(bp, t, 1.0, 0.05, 0.8), t, 0.9);
      const o = osc('sawtooth', 600, env(filter('lowpass', 2500, 1, d), t, 0.25, 0.05, 0.7), t, 0.9);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
    },
    bloater_burst: (c, d) => {
      const t = c.currentTime;
      const o = osc('sine', 70, env(d, t, 1.0, 0.005, 0.4), t, 0.5);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
      const g = env(filter('lowpass', 900, 3, d), t, 0.9, 0.01, 0.7);
      const am = osc('square', 22, gain(g.gain, 0.4), t, 0.8);
      noise(g, t, 0.8);
      return am;
    },
    boss_roar: (c, d) => {
      const t = c.currentTime, len = 2.0;
      const lp = filter('lowpass', 400, 4, drive(d, 5));
      lp.frequency.linearRampToValueAtTime(1300, t + 0.6);
      lp.frequency.linearRampToValueAtTime(350, t + len);
      const out = env(lp, t, 0.7, 0.3, len);
      [45, 46.5, 22.5, 60].forEach(f => {
        const o = osc('sawtooth', f, out, t, len + 0.4);
        o.frequency.linearRampToValueAtTime(f * 0.7, t + len);
      });
      noise(env(filter('bandpass', 350, 1, d), t, 0.3, 0.3, len), t, len + 0.4);
    },
    boss_hit: (c, d) => {
      const t = c.currentTime;
      const o = osc('sine', 90, env(d, t, 0.9, 0.003, 0.25), t, 0.3);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      noise(env(filter('lowpass', 1200, 1, d), t, 0.5, 0.002, 0.15), t, 0.2);
    },
    player_hurt: (c, d) => {
      const t = c.currentTime;
      const o = osc('sawtooth', 190, env(filter('bandpass', 750, 3, d), t, 0.9, 0.01, 0.28), t, 0.35);
      o.frequency.exponentialRampToValueAtTime(115, t + 0.3);
    },
    player_death: (c, d) => {
      const t = c.currentTime;
      const o = osc('sawtooth', 210, env(filter('bandpass', 650, 2.5, drive(d, 2)), t, 0.9, 0.02, 1.4), t, 1.5);
      o.frequency.exponentialRampToValueAtTime(65, t + 1.4);
      noise(env(filter('lowpass', 500, 1, d), t, 0.3, 0.05, 1.2), t, 1.4);
    },
    footstep: (c, d) => { const t = c.currentTime; noise(env(filter('lowpass', 380, 1, d), t, 0.5, 0.004, 0.09), t, 0.12); },
    pickup: (c, d) => {
      const t = c.currentTime;
      osc('square', 440, env(filter('lowpass', 2000, 1, d), t, 0.25, 0.005, 0.12), t, 0.15);
      osc('square', 660, env(filter('lowpass', 2000, 1, d), t + 0.1, 0.25, 0.005, 0.18), t + 0.1, 0.25);
    },
    door: (c, d) => {
      const t = c.currentTime;
      const o = osc('sawtooth', 140, env(filter('bandpass', 1400, 9, d), t, 0.35, 0.1, 0.8), t, 1.0);
      o.frequency.linearRampToValueAtTime(95, t + 0.5);
      o.frequency.linearRampToValueAtTime(160, t + 0.9);
      const th = osc('sine', 60, env(d, t + 0.85, 0.8, 0.005, 0.25), t + 0.85, 0.3);
      th.frequency.exponentialRampToValueAtTime(35, t + 1.05);
    },
    ambience: (c, d, opts) => {
      const t = c.currentTime;
      const out = gain(d, 0);
      out.gain.linearRampToValueAtTime(0.5, t + 3);
      const lp = filter('lowpass', 220, 2, out);
      const lfo = osc('sine', 0.07, gain(lp.frequency, 120), t);
      const n = noise(lp, t, null, { brown: true });
      const o1 = osc('sine', 55, gain(out, 0.12), t);
      const o2 = osc('sine', 58.3, gain(out, 0.1), t);
      const nodes = [lfo, n, o1, o2];
      if (!(opts && opts.loop)) nodes.forEach(x => x.stop(t + 12));
      return { stop() { nodes.forEach(x => { try { x.stop(); } catch (e) { /* already stopped */ } }); } };
    },
    heartbeat: (c, d) => {
      const t = c.currentTime;
      [0, 0.22].forEach((off, i) => {
        const o = osc('sine', i ? 50 : 58, env(d, t + off, i ? 0.6 : 0.9, 0.01, 0.16), t + off, 0.25);
        o.frequency.exponentialRampToValueAtTime(32, t + off + 0.15);
      });
    },
  };

  // ---------- file playback ----------
  const useWebAudioForFiles = () => ctx && window.location && /^https?:/.test(window.location.protocol || '');

  function markFallback(id) {
    status[id] = 'fallback';
    if (!warned[id]) { warned[id] = true; console.warn('[audio] using procedural fallback for "' + id + '"'); }
  }

  function preload() {
    for (const id of IDS) {
      const src = FILES[id];
      if (!src || status[id]) continue;
      try {
        status[id] = 'loading';
        const el = new Audio(src);
        el.preload = 'auto';
        el.addEventListener('canplaythrough', () => { if (status[id] === 'loading') status[id] = 'ok'; });
        el.addEventListener('error', () => markFallback(id));
        pools[id] = [el];
      } catch (e) { markFallback(id); }
    }
  }

  function usingFallback(id) { return !FILES[id] || status[id] !== 'ok' && status[id] !== 'loading'; }

  function pooledElement(id) {
    const pool = pools[id];
    if (!pool || !pool.length) return null;
    for (const el of pool) if (el.paused || el.ended) return el;
    if (pool.length < cfg().poolSize) { const c = pool[0].cloneNode(true); pool.push(c); return c; }
    const el = pool.shift(); pool.push(el); return el;
  }

  function playFile(id, sp, vol, loop) {
    const el = pooledElement(id);
    if (!el) return null;
    try {
      el.loop = !!loop;
      if (useWebAudioForFiles()) {
        if (!el.__chain) {
          const src = ctx.createMediaElementSource(el);
          const g = ctx.createGain(), p = ctx.createStereoPanner();
          src.connect(g); g.connect(p); p.connect(master);
          el.__chain = { g, p };
        }
        el.__chain.g.gain.value = sp.gain * vol;
        el.__chain.p.pan.value = sp.pan;
        el.volume = 1;
      } else {
        el.__vol = U.clamp(sp.gain * vol * cfg().master, 0, 1);
        el.volume = muted ? 0 : el.__vol;
      }
      el.currentTime = 0;
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {});
      return { stop() { try { el.pause(); el.loop = false; } catch (e) { /* ignore */ } } };
    } catch (e) { return null; }
  }

  function playProcedural(id, sp, vol, loop) {
    const recipe = Procedural[id];
    if (!recipe) return null;
    const g = ctx.createGain();
    g.gain.value = sp.gain * vol;
    let dest = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      g.connect(p); p.connect(master);
    } else g.connect(master);
    const h = recipe(ctx, dest, { loop });
    return h && h.stop ? h : null;
  }

  // ---------- public ----------
  function play(id, pos, vol) {
    if (!ctx) return null;
    try {
      const sp = spatial(listener, pos);
      const v = vol == null ? 1 : vol;
      if (!usingFallback(id)) return playFile(id, sp, v, false);
      return playProcedural(id, sp, v, false);
    } catch (e) { if (api._strict) throw e; return null; }
  }

  function loop(id, vol) {
    if (!ctx || loops[id]) return;
    try {
      const sp = { gain: 1, pan: 0 };
      const v = vol == null ? 1 : vol;
      loops[id] = (!usingFallback(id) ? playFile(id, sp, v, true) : playProcedural(id, sp, v, true)) || { stop() {} };
    } catch (e) { /* never throw */ }
  }
  function stop(id) { if (loops[id]) { loops[id].stop(); delete loops[id]; } }

  function scheduleHeartbeat() {
    if (hbTimer) { clearTimeout(hbTimer); hbTimer = null; }
    if (!ctx || hbRate <= 0) return;
    play('heartbeat', null, 0.5 + hbRate * 0.5);
    const interval = U.lerp(1.1, 0.42, U.clamp(hbRate, 0, 1));
    hbTimer = setTimeout(scheduleHeartbeat, interval * 1000);
  }
  function setHeartbeat(rate) {
    const r = U.clamp(rate || 0, 0, 1);
    const wasOff = hbRate <= 0;
    hbRate = r;
    if (r <= 0) { if (hbTimer) clearTimeout(hbTimer); hbTimer = null; return; }
    if (wasOff) scheduleHeartbeat();
  }

  function subscribe() {
    if (subscribed) return;
    subscribed = true;
    const E = W13.Events, A = api;
    const at = o => (o && o.x != null ? { x: o.x, y: o.y } : null);
    E.on('shot', d => A.play(d && d.weapon === 'shotgun' ? 'shotgun' : 'pistol', null, 0.9));
    E.on('enemy:hurt', d => { if (d && d.enemy && d.enemy.type === 'boss') A.play('boss_hit', at(d.enemy)); });
    E.on('enemy:died', d => {
      const e = d && d.enemy;
      if (e && e.type === 'bloater') A.play('bloater_burst', at(e));
      else A.play('zombie_groan_' + (1 + Math.floor(Math.random() * 3)), at(e), 0.9);
    });
    E.on('player:hurt', () => A.play('player_hurt'));
    E.on('player:died', () => A.play('player_death'));
    E.on('pickup', d => A.play(d && d.kind === 'shotgun' ? 'pump' : 'pickup'));
    E.on('door:open', d => {
      const door = d && W13.Map && W13.Map.doors && W13.Map.doors[d.id];
      A.play('door', door ? { x: door.x + 0.5, y: door.y + 0.5 } : null);
    });
    E.on('wave:start', () => A.play('zombie_groan_1', null, 0.35));
    E.on('boss:phase', () => A.play('boss_roar'));
    E.on('boss:roar', d => A.play('boss_roar', d && at(d.enemy)));
    E.on('weapon:empty', () => A.play('empty'));
    E.on('weapon:reload', () => A.play('reload'));
    E.on('runner:screech', d => A.play('runner_screech', d && at(d.enemy)));
    E.on('enemy:groan', d => A.play('zombie_groan_' + (1 + Math.floor(Math.random() * 3)), d && at(d.enemy), 0.8));
    E.on('footstep', () => A.play('footstep', null, 0.35));
  }

  function init() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : cfg().master;
        if (ctx.createDynamicsCompressor) {
          const comp = ctx.createDynamicsCompressor();
          master.connect(comp); comp.connect(ctx.destination);
        } else master.connect(ctx.destination);
        noiseBuf = makeNoise(2, false);
        brownBuf = makeNoise(4, true);
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      subscribe();
      if (hbRate > 0 && !hbTimer) scheduleHeartbeat();
    } catch (e) { console.warn('[audio] init failed: ' + e.message); }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : cfg().master;
    for (const id in pools) for (const el of pools[id]) if (!el.__chain) el.volume = muted ? 0 : (el.__vol == null ? el.volume : el.__vol);
    return muted;
  }

  function setListener(x, y, angle) { listener.x = x; listener.y = y; listener.angle = angle; }
  function startAmbience() { loop('ambience', 0.6); }
  function stopAmbience() { stop('ambience'); }
  function reset() {
    Object.keys(loops).forEach(stop);
    setHeartbeat(0);
  }

  const api = {
    IDS, FILES, Procedural,
    preload, init, play, loop, stop, setListener, toggleMute, setHeartbeat, usingFallback,
    startAmbience, stopAmbience, reset,
    get muted() { return muted; },
    _strict: false,
    _spatial: spatial,
    _heartbeatRate: () => hbRate,
  };
  return api;
})();
