// W13.Input — keyboard, mouse look (pointer lock), clicks.
window.W13 = window.W13 || {};
W13.Input = (function () {
  const keys = {};
  let mouseDX = 0;
  let canvas = null;
  const keyHandlers = [];
  const clickHandlers = [];
  const lockHandlers = [];
  const state = { forward: 0, strafe: 0, turn: 0, fire: false, reload: false, run: false, use: false, weapon: null };

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
    document.addEventListener('mousemove', e => { if (api.locked) mouseDX += e.movementX || 0; });
    canvas.addEventListener('mousedown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      clickHandlers.forEach(fn => fn());
      state.fire = true;
    });
    document.addEventListener('mouseup', e => { if (e.button === undefined || e.button === 0) state.fire = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault && e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      api.locked = document.pointerLockElement === canvas;
      lockHandlers.forEach(fn => fn(api.locked));
    });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; recompute(); state.fire = false; });
  }

  function requestLock() {
    try {
      if (canvas && canvas.requestPointerLock) {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* pointer lock unavailable: keyboard turning still works */ }
  }
  function consumeMouseDX() { const d = mouseDX; mouseDX = 0; return d; }
  function consumeWeapon() { const w = state.weapon; state.weapon = null; return w; }
  function reset() { for (const k in keys) keys[k] = false; recompute(); state.fire = false; state.weapon = null; mouseDX = 0; }

  const api = {
    state, locked: false, init, reset, requestLock, consumeMouseDX, consumeWeapon,
    onKey: fn => keyHandlers.push(fn), onClick: fn => clickHandlers.push(fn), onLockChange: fn => lockHandlers.push(fn),
    _press(code, down) { keys[code] = down; recompute(); }, // test/debug helper
  };
  return api;
})();
