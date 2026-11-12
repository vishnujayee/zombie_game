// W13.Hud — status bar, wave/boss text, crosshair, messages and full-screen state overlays.
// Everything is drawn into the 320x200 pixel buffer with the bitmap font, so it stays crisp.
window.W13 = window.W13 || {};
W13.Hud = (function () {
  const rgba = (r, g, b) => W13.Util.rgba(r, g, b);
  const COL = {
    blood: rgba(170, 18, 18), bone: rgba(207, 198, 168), yellow: rgba(184, 162, 74), green: rgba(110, 160, 60),
    dim: rgba(120, 110, 95), black: rgba(8, 8, 10), rust: rgba(58, 26, 14), white: rgba(235, 230, 215),
  };
  let msgText = null, msgT = 0, msgDur = 3;
  let fps = 0, fpsAcc = 0, fpsN = 0;

  function init() {
    W13.Events.on('message', d => message(d.text, d.secs));
  }
  function reset() { msgText = null; msgT = 0; }
  function message(text, secs) { msgText = text; msgDur = secs || 3; msgT = msgDur; }
  function activeMessage() { return msgT > 0 ? msgText : null; }
  function update(dt) {
    msgT = Math.max(0, msgT - dt);
    if (dt > 0) { fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; } }
  }

  // ---- buffer helpers ----
  function rect(t, x, y, w, h, c) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(t.w, (x + w) | 0), y1 = Math.min(t.h, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) t.buf.fill(c, yy * t.w + x0, yy * t.w + x1);
  }
  function shade(t, k, tint) {   // darken whole screen, optional red tint
    const b = t.buf;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      let r = (c & 255) * k, g = ((c >>> 8) & 255) * k, bl = ((c >>> 16) & 255) * k;
      if (tint) { r = r + (150 - r) * tint; g *= 1 - tint; bl *= 1 - tint; }
      b[i] = (0xff000000 | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
    }
  }
  function text(t, s, x, y, c, scale) { W13.Textures.drawText(t, s, x | 0, y | 0, c, scale || 1); }
  function centered(t, s, y, c, scale) {
    const w = W13.Textures.textWidth(s, scale || 1);
    // shadow for legibility
    text(t, s, (t.w - w) / 2 + 1, y + 1, COL.black, scale);
    text(t, s, (t.w - w) / 2, y, c, scale);
  }
  function bar(t, x, y, w, h, frac, fg, bg) {
    rect(t, x - 1, y - 1, w + 2, h + 2, COL.black);
    rect(t, x, y, w, h, bg);
    rect(t, x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h, fg);
  }

  // ---- in-game HUD ----
  function drawHud(t) {
    const P = W13.Player, Wp = W13.Weapons, Wv = W13.Waves, G = W13.Game;
    if (!P || !P.weapons) return;
    const vh = t.h - W13.Config.render.hudH;
    // bottom bar
    for (let y = vh; y < t.h; y++) {
      const k = (y - vh) / (t.h - vh);
      rect(t, 0, y, t.w, 1, rgba(46 - 20 * k, 20 - 8 * k, 12 - 5 * k));
    }
    rect(t, 0, vh, t.w, 1, rgba(90, 40, 20));
    // health
    const hpCol = P.hp > 60 ? COL.bone : P.hp > 30 ? COL.yellow : COL.blood;
    text(t, 'HP', 6, vh + 4, COL.dim, 1);
    text(t, String(P.hp), 20, vh + 4, hpCol, 2);
    bar(t, 6, vh + 18, 60, 3, P.hp / W13.Config.player.hp, COL.blood, rgba(30, 8, 8));
    // weapon + ammo
    const name = P.current, w = P.weapons[name];
    const label = name === 'shotgun' ? 'SHOTGUN' : 'PISTOL';
    text(t, label, 130, vh + 4, COL.dim, 1);
    const reloading = Wp && Wp.state && Wp.state.reloading;
    text(t, reloading ? 'RELOADING' : (P.weapons.shotgun.owned ? '1 PISTOL  2 SHOTGUN' : ''), 112, vh + 15, rgba(90, 80, 70), 1);
    const ammo = w.mag + '/' + w.reserve;
    const aw = W13.Textures.textWidth(ammo, 2);
    text(t, ammo, t.w - aw - 6, vh + 4, w.mag === 0 ? COL.blood : COL.bone, 2);
    text(t, 'AMMO', t.w - 30, vh + 17, COL.dim, 1);
    // crosshair
    const cx = t.w >> 1, cy = vh >> 1, cc = rgba(200, 190, 160);
    rect(t, cx - 4, cy, 3, 1, cc); rect(t, cx + 2, cy, 3, 1, cc); rect(t, cx, cy - 4, 1, 3, cc); rect(t, cx, cy + 2, 1, 3, cc);
    // wave / boss
    if (Wv && Wv.waveIndex >= 0) {
      if (Wv.waveIndex === 3) {
        const boss = W13.Enemies && W13.Enemies.list.find(e => e.type === 'boss');
        if (boss && boss.state !== 'dead') {
          centered(t, 'THE STITCHED', 6, COL.blood, 1);
          bar(t, 100, 16, 120, 4, boss.hp / boss.maxHp, rgba(150, 10, 10), rgba(30, 6, 6));
        }
      } else {
        const left = Wv.remaining();
        if (left > 0) centered(t, 'WAVE ' + (Wv.waveIndex + 1) + ' - ' + left + ' LEFT', 6, COL.bone, 1);
      }
    }
    if (W13.Input && !W13.Input.locked && !W13.Input.lockUnavailable && G && G.state === 'PLAYING') centered(t, 'CLICK TO AIM', 60, COL.yellow, 1);
    // message
    if (msgT > 0 && msgText) {
      const a = Math.min(1, msgT / 0.6);
      const c = rgba(207 * a + 20 * (1 - a), 198 * a, 168 * a);
      centered(t, msgText, 40, c, 1);
    }
    if (G && G.debugOn) {
      text(t, fps + ' FPS', 4, 4, COL.green, 1);
      if (G.debug.god) text(t, 'GOD', 4, 12, COL.yellow, 1);
      if (G.debug.noclip) text(t, 'NOCLIP', 4, 20, COL.yellow, 1);
    }
  }

  // ---- screens ----
  function drawTitle(t, time) {
    shade(t, 0.45, 0.15);
    const on = Math.sin(time * 9) > -0.6 || Math.sin(time * 2.3) > 0.4;
    const logoC = on ? COL.blood : rgba(60, 8, 8);
    centered(t, 'WARD 13', 38, logoC, 5);
    centered(t, 'THE DEAD ARE AWAKE', 82, COL.dim, 1);
    if (Math.floor(time * 1.6) % 2 === 0) centered(t, 'CLICK TO ENTER', 104, COL.bone, 2);
    const lines = ['WASD MOVE   MOUSE LOOK   CLICK FIRE', 'R RELOAD   1/2 WEAPON   SHIFT RUN', 'ESC PAUSE   M MUTE'];
    lines.forEach((l, i) => centered(t, l, 140 + i * 11, rgba(140, 130, 110), 1));
  }
  function drawPaused(t) {
    shade(t, 0.5, 0);
    const G = W13.Game;
    if (G && G.errorMessage) {
      centered(t, G.errorMessage, 80, COL.blood, 1);
      centered(t, 'CLICK TO RESTART', 100, COL.bone, 1);
    } else {
      centered(t, 'PAUSED', 70, COL.bone, 3);
      centered(t, 'CLICK TO RESUME', 104, COL.dim, 1);
    }
  }
  function drawDead(t, st) {
    const k = Math.min(1, st / 1.0);
    shade(t, 1 - 0.6 * k, 0.55 * k);
    if (st > 0.4) centered(t, 'YOU DIED', 64, rgba(200, 20, 20), 4);
    if (st > 0.8) centered(t, 'CLICK TO RESTART', 112, COL.bone, 1);
  }
  function drawVictory(t, st) {
    const P = W13.Player;
    shade(t, Math.max(0.25, 1 - st), 0);
    centered(t, 'YOU ESCAPED', 40, COL.green, 3);
    if (!P || !P.stats) return;
    const s = P.stats;
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    const acc = accuracy(s);
    centered(t, 'TIME ' + mm + ':' + (ss < 10 ? '0' : '') + ss, 84, COL.bone, 1);
    centered(t, 'KILLS ' + s.kills, 96, COL.bone, 1);
    centered(t, 'ACCURACY ' + acc + '%', 108, COL.bone, 1);
    if (st > 0.8) centered(t, 'CLICK TO PLAY AGAIN', 136, COL.dim, 1);
  }

  function accuracy(s) { return s && s.shots ? Math.round((s.hits / s.shots) * 100) : 0; }

  function render(t, state) {
    const G = W13.Game || {};
    const st = G.stateTime || 0, time = G.time || 0;
    state = state || G.state;
    if (state === 'TITLE') return drawTitle(t, time);
    drawHud(t);
    if (state === 'PAUSED') drawPaused(t);
    else if (state === 'DEAD') drawDead(t, st);
    else if (state === 'VICTORY') drawVictory(t, st);
  }

  return { init, reset, update, message, activeMessage, render, accuracy, COL };
})();
