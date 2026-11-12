// W13.Game — boot, state machine, main loop, debug hooks.
window.W13 = window.W13 || {};
W13.Game = (function () {
  const STATES = ['TITLE', 'PLAYING', 'PAUSED', 'DEAD', 'VICTORY'];
  let canvas, ctx, img, buf, last = null, booted = false, errorLogged = false;
  let time = 0;          // global time (seconds) for flicker/animation
  let stateTime = 0;     // seconds in current state
  let hadLock = false;
  const call = (mod, fn, ...args) => { const m = W13[mod]; return m && typeof m[fn] === 'function' ? m[fn](...args) : undefined; };
  const debugOn = /(^|[?&])debug=1/.test((window.location && window.location.search) || '');

  const api = {
    state: 'TITLE', errorMessage: '', debugOn,
    get time() { return time; }, get stateTime() { return stateTime; },
    boot, setState, restart, tick, step,
    debug: { god: false, noclip: false },
  };

  function setState(s) {
    if (STATES.indexOf(s) < 0) throw new Error('bad state ' + s);
    if (s === api.state) return;
    const prev = api.state;
    api.state = s;
    stateTime = 0;
    if (s !== 'PAUSED') api.errorMessage = '';
    if (s === 'PLAYING' && prev === 'TITLE') call('Audio', 'startAmbience');
    if (s === 'DEAD' || s === 'VICTORY') {
      try { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
      call('Audio', 'setHeartbeat', 0);
    }
    if (W13.Events) W13.Events.emit('state', { state: s, prev });
  }

  function restart() {
    ['Map', 'Player', 'Weapons', 'Enemies', 'Waves', 'Effects', 'Hud', 'Input', 'Audio'].forEach(m => call(m, 'reset'));
    api.debug.god = false; api.debug.noclip = false;
    resetScare(); scare.opened = false;
    api.errorMessage = '';
    errorLogged = false;
    setState('PLAYING');
    hadLock = false;
    call('Input', 'requestLock');
  }

  // Returns true when the click was used by a menu/screen (so it isn't also a shot).
  function onClick() {
    const s = api.state;
    if (s === 'TITLE') {
      call('Audio', 'init');
      call('Input', 'requestLock');
      setState('PLAYING');
      return true;
    }
    if (s === 'PAUSED') {
      if (api.errorMessage) { restart(); return true; }
      call('Audio', 'init');
      call('Input', 'requestLock');
      setState('PLAYING');
      return true;
    }
    if (s === 'DEAD' || s === 'VICTORY') {
      if (stateTime > 0.8) restart();
      return true;
    }
    return false;
  }

  function onKey(code) {
    if (code === 'Escape' && api.state === 'PLAYING') setState('PAUSED');
    if (code === 'KeyM') call('Audio', 'toggleMute');
    if (code === 'KeyP' && api.state === 'PLAYING') setState('PAUSED');
    if (!debugOn) return;
    if (code === 'KeyG') api.debug.god = !api.debug.god;
    if (code === 'KeyC') api.debug.noclip = !api.debug.noclip;
    if (code === 'KeyN') api.debug.skipWave();
  }

  function boot() {
    if (booted) return;
    booted = true;
    canvas = document.getElementById('screen');
    const C = W13.Config.render;
    canvas.width = C.w; canvas.height = C.h;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(C.w, C.h);
    buf = new Uint32Array(img.data.buffer);
    api.buffer = buf;
    call('Textures', 'init');
    call('Map', 'load');
    W13.Raycaster.init(C.w, C.h);
    call('Input', 'init', canvas);
    call('Input', 'onClick', onClick);
    call('Input', 'onKey', onKey);
    call('Input', 'onLockChange', locked => {
      if (locked) hadLock = true;
      else if (hadLock && api.state === 'PLAYING') setState('PAUSED');
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && api.state === 'PLAYING') setState('PAUSED'); });
    // one-time event subscriptions
    ['Audio:preload', 'Player:init', 'Weapons:init', 'Enemies:init', 'Waves:init', 'Effects:init', 'Hud:init'].forEach(s => { const [m, f] = s.split(':'); call(m, f); });
    if (W13.Events) {
      W13.Events.on('player:died', () => { if (api.state === 'PLAYING') setState('DEAD'); });
      W13.Events.on('level:victory', () => { if (api.state === 'PLAYING') setState('VICTORY'); });
    }
    ['Player', 'Weapons', 'Enemies', 'Waves', 'Effects', 'Hud'].forEach(m => call(m, 'reset'));
    api.state = 'TITLE';
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
  }

  function frame(now) {
    tick(now);
    requestAnimationFrame(frame);
  }

  function tick(now) {
    if (last === null) { last = now; step(0); return; }
    const dt = Math.min((now - last) / 1000, W13.Config.maxDt);
    last = now;
    step(dt);
  }

  // ---- pickups as billboards ----
  const PICKUP_IMG = { health: 'pickup_health', ammo_pistol: 'pickup_ammo', ammo_shells: 'pickup_shells', shotgun: 'pickup_shotgun' };
  function pickupSprites() {
    const out = [], T = W13.Textures;
    for (const p of W13.Map.pickups) {
      if (p.taken) continue;
      out.push({ x: p.x, y: p.y, img: T.sprite(PICKUP_IMG[p.kind]), scale: p.kind === 'shotgun' ? 0.6 : 0.42, lift: 0.04 + 0.04 * Math.sin(time * 3 + p.x), minLight: 0.35 });
    }
    return out;
  }

  // ---- opening scare: the reception door creaks open and a figure crosses the lobby, then is gone ----
  const scare = { t: 0, done: false, active: false };
  function resetScare() { scare.t = 0; scare.done = false; scare.active = false; }
  function updateScare(dt) {
    if (scare.done) return;
    scare.t += dt;
    if (scare.t >= 3.2 && !scare.opened) { scare.opened = true; W13.Map.openDoor('D@4,25'); }
    scare.active = scare.t >= 4 && scare.t < 5.5;
    if (scare.t >= 5.5) { scare.done = true; scare.active = false; call('Audio', 'play', 'zombie_groan_2', { x: 9.5, y: 21.5 }, 0.7); }
  }
  function scareSprite() {
    if (!scare.active) return null;
    const k = (scare.t - 4) / 1.5;
    return { x: 1.8 + k * 9, y: 21.5, img: W13.Textures.sprite('shambler', 'walk', Math.floor(scare.t * 6) % 4), scale: 1, scare: true };
  }
  api.scare = scare;

  function attractCam() {
    return { x: 6.5, y: 19.5, angle: time * 0.15 };
  }

  function step(dt) {
    try {
      time += dt; stateTime += dt;
      const playing = api.state === 'PLAYING';
      const P = W13.Player;
      if (playing) {
        const input = W13.Input ? W13.Input.state : {};
        call('Player', 'update', dt, input);
        call('Weapons', 'update', dt, input, P);
        call('Enemies', 'update', dt, P);
        call('Waves', 'update', dt, P);
        if (P) call('Audio', 'setListener', P.x, P.y, P.angle);
        if (P && P.stats) P.stats.time += dt;
      }
      if (playing) updateScare(dt);
      if (api.state !== 'PAUSED') call('Effects', 'update', dt);
      call('Hud', 'update', dt);
      render(dt);
    } catch (e) {
      if (!errorLogged) { errorLogged = true; console.error(e); }
      api.errorMessage = 'SOMETHING BROKE: ' + (e && e.message ? e.message : String(e)).toUpperCase().slice(0, 40);
      api.state = 'PAUSED';
    }
  }

  function render() {
    if (!buf) return;
    const P = W13.Player;
    const inWorld = api.state !== 'TITLE' && P && typeof P.x === 'number';
    const cam = inWorld ? { x: P.x, y: P.y, angle: P.angle } : attractCam();
    const sprites = [];
    if (inWorld) {
      const es = call('Enemies', 'spritesForRender'); if (es) sprites.push(...es);
      sprites.push(...pickupSprites());
      const sc = scareSprite(); if (sc) sprites.push(sc);
    }
    const W = W13.Weapons;
    const flash = W && W.state && W.state.flashT > 0 ? 1 : 0;
    const bossRed = W13.Effects && W13.Effects.bossRed ? W13.Effects.bossRed(P) : 0;
    W13.Raycaster.render(buf, cam, sprites, { flash, t: time, bossRed });
    if (inWorld && api.state !== 'DEAD') call('Weapons', 'drawViewModel', buf);
    const C = W13.Config.render;
    const target = { buf, w: C.w, h: C.h };
    call('Effects', 'apply', buf, C.w, C.h);
    call('Hud', 'render', target, api.state);
    let ox = 0, oy = 0;
    const off = call('Effects', 'offset');
    if (off) { ox = off.x; oy = off.y; }
    if (ox || oy) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.w, C.h); }
    ctx.putImageData(img, ox, oy);
  }

  // Debug hooks (always present for tests; keys only bound with ?debug=1).
  api.debug.skipWave = () => call('Waves', 'debugSkip');
  api.debug.killAll = () => { const E = W13.Enemies; if (E) E.list.filter(e => e.state !== 'dead').forEach(e => E.damage(e, 1e6)); };
  api.debug.teleport = zoneId => {
    const P = W13.Player, z = W13.Map.zones[zoneId];
    if (!P || !z) return false;
    // find the floor tile nearest the zone centre
    const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
    let best = null, bd = 1e9;
    for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
      if (W13.Map.isSolid(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    if (!best) return false;
    P.x = best.x; P.y = best.y;
    return true;
  };
  api.debug.teleportTo = (x, y) => { const P = W13.Player; if (P) { P.x = x; P.y = y; } };
  api.debug.forceDeath = () => { const P = W13.Player; if (P) { api.debug.god = false; P.damage(9999, P.x, P.y); } };

  if (typeof document !== 'undefined' && document.addEventListener && !window.__W13_NO_AUTOBOOT) {
    document.addEventListener('DOMContentLoaded', () => api.boot());
  }
  return api;
})();
