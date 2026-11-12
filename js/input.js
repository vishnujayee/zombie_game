// W13.Input — keyboard, mouse look (pointer lock), clicks.
window.W13 = window.W13 || {};
W13.Input = (function () {
  const keys = {};
  let mouseDX = 0;
  let skipNextMove = false;
  let lockErrors = 0;
  let everLocked = false;
  const MAX_MOVE = 300; // px per event
  let canvas = null;
  const keyHandlers = [];
  const clickHandlers = [];
  const lockHandlers = [];
  const state = { forward: 0, strafe: 0, turn: 0, fire: false, firePressed: false, reload: false, run: false, use: false, weapon: null };

  function recompute() {
    state.forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    state.strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    state.turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    state.run = !!(keys.ShiftLeft || keys.ShiftRight);
    state.reload = !!keys.KeyR;
    state.use = !!keys.KeyE;
  }

  function init(c) {
    canvas = c;
    document.addEventListener('keydown', e => {
      if (!keys[e.code]) {
        if (e.code === 'Digit1') state.weapon = 1;
        if (e.code === 'Digit2') state.weapon = 2;
        keyHandlers.forEach(fn => fn(e.code));
      }
      keys[e.code] = true;
      recompute();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault && e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; recompute(); });
    document.addEventListener('mousemove', e => {
      if (!api.locked && !api.lockUnavailable) return;
      const dx = e.movementX || 0;
      if (skipNextMove) { skipNextMove = false; return; } // Chrome sends a bogus re-centre delta right after locking
      if (Math.abs(dx) > MAX_MOVE) return;                 // drop implausible single-event spikes
      mouseDX += dx;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      let consumed = false;
      clickHandlers.forEach(fn => { if (fn()) consumed = true; });
      if (!consumed) { state.fire = true; state.firePressed = true; } // menu clicks never become a trigger pull
    });
    document.addEventListener('mouseup', e => { if (e.button === undefined || e.button === 0) state.fire = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault && e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      api.locked = document.pointerLockElement === canvas;
      skipNextMove = api.locked;
      if (api.locked) { lockErrors = 0; everLocked = true; api.lockUnavailable = false; }
      lockHandlers.forEach(fn => fn(api.locked));
    });
    // After repeated refusals (e.g. some browsers on file://) fall back to unlocked mouse look.
    document.addEventListener('pointerlockerror', lockRefused);
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; recompute(); state.fire = false; });
  }

  function requestLock() {
    // Some embeds (sandboxed iframes) ignore the request without any event: treat no answer as a refusal.
    setTimeout(() => { if (!api.locked && document.pointerLockElement !== canvas) lockRefused(); }, api.lockTimeoutMs);
    try {
      if (canvas && canvas.requestPointerLock) {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* pointer lock unavailable: keyboard turning still works */ }
  }
  // Never locked this session → the embed/browser doesn't allow it: fall back immediately.
  // Locked before → tolerate transient refusals (Chrome blocks re-lock for ~1 s after Esc).
  function lockRefused() { if (!everLocked || ++lockErrors >= 3) api.lockUnavailable = true; }
  function consumeMouseDX() { const d = mouseDX; mouseDX = 0; return d; }
  function consumeWeapon() { const w = state.weapon; state.weapon = null; return w; }
  function reset() { for (const k in keys) keys[k] = false; recompute(); state.fire = false; state.firePressed = false; state.weapon = null; mouseDX = 0; }

  const api = {
    state, locked: false, lockUnavailable: false, lockTimeoutMs: 1500, init, reset, requestLock, consumeMouseDX, consumeWeapon,
    onKey: fn => keyHandlers.push(fn), onClick: fn => clickHandlers.push(fn), onLockChange: fn => lockHandlers.push(fn),
    _press(code, down) { keys[code] = down; recompute(); }, // test/debug helper
  };
  return api;
})();
