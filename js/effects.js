// W13.Effects — post-processing on the 320x200 buffer: flash, low-health desaturation,
// vignette, scanlines, film grain, screen shake, boss red flicker.
window.W13 = window.W13 || {};
W13.Effects = (function () {
  let flashT = 0, flashDur = 1, flashRGB = [0, 0, 0], flashAmt = 0.45;
  let shakeT = 0, shakePx = 0;
  let low = 0, beat = 0, time = 0;
  let bossPhase2 = false;
  let grain = true;
  let mult = null, mw = 0, mh = 0;
  const noise = new Int8Array(4096);

  function init() {
    const E = W13.Config.effects;
    const r = W13.Util.rng(1313);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.round((r() * 2 - 1) * E.grain);
    W13.Events.on('player:hurt', d => {
      flash([170, 0, 0], E.flashSecs, Math.min(0.6, 0.25 + d.amount / 40));
      shake(E.shakePx + d.amount / 6, E.shakeSecs);
    });
    W13.Events.on('boss:phase', () => { bossPhase2 = true; shake(5, 0.6); });
    W13.Events.on('boss:slam', () => shake(6, 0.3));
    W13.Events.on('pickup', () => flash([200, 190, 120], 0.15, 0.2));
    W13.Events.on('enemy:died', d => { if (d.enemy.type === 'bloater') flash([80, 140, 20], 0.2, 0.25); });
    W13.Events.on('level:exitOpen', () => flash([40, 160, 60], 0.4, 0.25));
  }
  function reset() { flashT = 0; shakeT = 0; low = 0; beat = 0; bossPhase2 = false; }
  function setGrain(on) { grain = !!on; }

  function flash(rgb, secs, amt) { flashRGB = rgb; flashDur = secs; flashT = secs; flashAmt = amt === undefined ? 0.45 : amt; }
  function shake(px, secs) { if (px >= shakePx || shakeT <= 0) { shakePx = px; } shakeT = Math.max(shakeT, secs); }
  function setLowHealth(t) { low = W13.Util.clamp(t, 0, 1); }

  function update(dt) {
    time += dt;
    flashT = Math.max(0, flashT - dt);
    shakeT = Math.max(0, shakeT - dt);
    const P = W13.Player, lim = W13.Config.effects.lowHp;
    const playing = !W13.Game || W13.Game.state === 'PLAYING';
    if (P && !P.dead && P.hp < lim) setLowHealth((lim - P.hp) / lim); else setLowHealth(0);
    const bpm = 60 + (P ? Math.max(0, lim - P.hp) * 2 : 0);
    beat += dt * bpm / 60;
    if (W13.Audio && W13.Audio.setHeartbeat) W13.Audio.setHeartbeat(playing ? low : 0);
  }

  function offset() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    const k = shakePx * Math.min(1, shakeT / 0.15);
    return { x: Math.round((Math.random() * 2 - 1) * k), y: Math.round((Math.random() * 2 - 1) * k) };
  }

  function bossRed(P) {
    if (!bossPhase2 || !P || P.zone !== 'theatre') return 0;
    const flick = Math.sin(time * 23) > 0.85 ? 0.15 : 0;
    return 0.2 + 0.12 * Math.sin(time * 5) + flick;
  }

  function buildMult(w, h) {
    const E = W13.Config.effects;
    mult = new Float32Array(w * h); mw = w; mh = h;
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      const t = W13.Util.clamp((r - 0.35) / 0.65, 0, 1);
      let m = 1 - (1 - E.vignetteEdge) * Math.pow(t, 1.4);
      if (y & 1) m *= E.scanline;
      mult[y * w + x] = m;
    }
  }

  function apply(buf, w, h) {
    if (!mult || mw !== w || mh !== h) buildMult(w, h);
    const fa = flashT > 0 ? flashAmt * (flashT / flashDur) : 0;
    const fr = flashRGB[0], fg = flashRGB[1], fb = flashRGB[2];
    const pulse = 0.75 + 0.25 * Math.max(0, Math.sin(beat * Math.PI * 2));
    const ds = low > 0 ? Math.min(0.85, 0.7 * low * pulse + 0.15) : 0;
    const redPulse = low > 0 ? 0.12 * low * pulse : 0;
    const off = grain ? (Math.random() * 4096) | 0 : 0;
    for (let i = 0, n = w * h; i < n; i++) {
      const c = buf[i];
      let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
      if (fa > 0) { r += (fr - r) * fa; g += (fg - g) * fa; b += (fb - b) * fa; }
      if (ds > 0) {
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        r += (l - r) * ds; g += (l - g) * ds; b += (l - b) * ds;
        r += (140 - r) * redPulse;
      }
      const m = mult[i];
      r *= m; g *= m; b *= m;
      if (grain) { const nz = noise[(i + off) & 4095]; r += nz; g += nz; b += nz; }
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      buf[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  return { init, reset, update, apply, flash, shake, offset, setLowHealth, setGrain, bossRed, get low() { return low; } };
})();
