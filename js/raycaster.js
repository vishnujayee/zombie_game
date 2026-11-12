// W13.Raycaster — software renderer: floor/ceiling, textured walls, sprites, view-model.
window.W13 = window.W13 || {};
W13.Raycaster = (function () {
  let W = 320, H = 200, VH = 176, HALF = 88;
  let angOff, cosOff, proj;
  let zBuffer = new Float32Array(320);
  let ceilRow, floorRow;
  const TEX = 64;

  function shadePx(c, l, rTint) {
    if (l <= 0) return 0xff000000;
    let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
    r = r * l; g = g * l; b = b * l;
    if (rTint > 0) { r = r + (255 - r) * 0.15 * rTint; g *= 1 - 0.6 * rTint; b *= 1 - 0.6 * rTint; }
    return (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
  }

  function init(w, h) {
    const C = W13.Config;
    W = w; H = h; VH = h - C.render.hudH; HALF = VH >> 1;
    const half = (C.render.fov * Math.PI / 180) / 2;
    proj = (W / 2) / Math.tan(half);
    angOff = new Float32Array(W); cosOff = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      angOff[x] = Math.atan(((2 * (x + 0.5)) / W - 1) * Math.tan(half));
      cosOff[x] = Math.cos(angOff[x]);
    }
    zBuffer = new Float32Array(W);
    api.zBuffer = zBuffer;
    // Ceiling: grimy green-grey fading to black at horizon. Floor: dark rust-brown.
    ceilRow = new Uint32Array(HALF); floorRow = new Uint32Array(VH - HALF);
    for (let y = 0; y < HALF; y++) {
      const t = Math.pow(1 - y / HALF, 2.2);
      ceilRow[y] = W13.Util.rgba(30 * t + 4, 34 * t + 4, 28 * t + 5);
    }
    for (let y = 0; y < VH - HALF; y++) {
      const t = Math.pow(y / (VH - HALF), 1.8);
      floorRow[y] = W13.Util.rgba(52 * t + 5, 36 * t + 4, 28 * t + 4);
    }
  }

  function fog(d) {
    const L = W13.Config.light;
    const v = 1 - (d - L.fogStart) / (L.fogEnd - L.fogStart);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function render(buf, cam, sprites, lc) {
    const M = W13.Map, L = W13.Config.light;
    const flash = lc.flash || 0, t = lc.t || 0, red = lc.bossRed || 0;
    // floor & ceiling (with muzzle-flash lift and red tint)
    for (let y = 0; y < VH; y++) {
      const base = y < HALF ? ceilRow[y] : floorRow[y - HALF];
      const nearness = y < HALF ? 1 - y / HALF : (y - HALF) / (VH - HALF);
      const c = (flash > 0 || red > 0) ? shadePx(base, 1 + flash * nearness * 2.5, red * nearness) : base;
      buf.fill(c, y * W, y * W + W);
    }
    for (let x = 0; x < W; x++) {
      const a = cam.angle + angOff[x];
      const hit = M.castRay(cam.x, cam.y, a, 32);
      const perp = Math.max(0.0001, hit.dist * cosOff[x]);
      zBuffer[x] = perp;
      if (!hit.tile) continue;
      const tex = W13.Textures.wall(M.wallTex(hit.mapX, hit.mapY));
      // light from the tile just in front of the wall
      const fx = cam.x + Math.cos(a) * (hit.dist - 0.05), fy = cam.y + Math.sin(a) * (hit.dist - 0.05);
      let l = fog(perp) * (hit.side ? L.sideShade : 1) + L.ambient + M.tileLight(fx, fy, t) + flash * fog(perp * 0.6) * L.flashBoost;
      if (l > 1.15) l = 1.15;
      const lineH = proj / perp;
      const top = HALF - lineH / 2;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH, Math.ceil(top + lineH));
      const tx = Math.min(TEX - 1, (hit.texX * TEX) | 0);
      const step = TEX / lineH;
      let tpos = (y0 - top) * step;
      for (let y = y0; y < y1; y++) {
        const ty = (tpos | 0) & (TEX - 1); tpos += step;
        buf[y * W + x] = shadePx(tex[ty * TEX + tx], l, red);
      }
    }
    if (sprites && sprites.length) renderSprites(buf, cam, sprites, lc);
  }

  // Sprites: [{x, y, img:{w,h,px}, scale, tint, lift, bright}] — billboarded, anchored to floor.
  function renderSprites(buf, cam, sprites, lc) {
    const M = W13.Map, flash = lc.flash || 0, red = lc.bossRed || 0, t = lc.t || 0;
    const ca = Math.cos(cam.angle), sa = Math.sin(cam.angle);
    const list = [];
    for (const s of sprites) {
      const dx = s.x - cam.x, dy = s.y - cam.y;
      const depth = dx * ca + dy * sa;          // forward distance
      if (depth < 0.15) continue;
      const lateral = -dx * sa + dy * ca;       // right is positive
      list.push({ s, depth, lateral });
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const { s, depth, lateral } of list) {
      const img = s.img; if (!img) continue;
      const scale = s.scale || 1;
      const sx = W / 2 + (lateral / depth) * proj;
      const hgt = (proj / depth) * scale;        // on-screen height for a 1-tile-tall sprite × scale
      const wid = hgt * (img.w / img.h);
      const floorY = HALF + (proj / depth) * 0.5; // where the floor is at this depth
      const top = floorY - hgt - (s.lift || 0) * (proj / depth);
      const left = sx - wid / 2;
      const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W, Math.ceil(left + wid));
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH, Math.ceil(top + hgt));
      if (x0 >= x1 || y0 >= y1) continue;
      let l = s.bright ? 1 : fog(depth) + M.tileLight(s.x, s.y, t) + flash * fog(depth * 0.6) * 0.55;
      if (s.minLight && depth < W13.Config.light.fogEnd && l < s.minLight) l = s.minLight;
      if (l > 1.15) l = 1.15;
      const tint = s.tint || 0;
      for (let x = x0; x < x1; x++) {
        if (depth >= zBuffer[x]) continue;
        const tx = Math.min(img.w - 1, (((x - left) / wid) * img.w) | 0);
        for (let y = y0; y < y1; y++) {
          const ty = Math.min(img.h - 1, (((y - top) / hgt) * img.h) | 0);
          const c = img.px[ty * img.w + tx];
          if ((c >>> 24) < 128) continue;
          let px = shadePx(c, l, red);
          if (tint > 0) {
            const r = px & 255, g = (px >>> 8) & 255, b = (px >>> 16) & 255;
            px = (0xff000000 | ((b + (255 - b) * tint) << 16) | ((g + (255 - g) * tint) << 8) | (r + (255 - r) * tint)) >>> 0;
          }
          buf[y * W + x] = px;
        }
      }
    }
  }

  // Weapon view-model at bottom centre of the 3D view.
  function drawViewModel(buf, img, bobX, bobY, recoil, light) {
    if (!img) return;
    const x0 = Math.round(W / 2 - img.w / 2 + 28 + bobX);
    const y0 = Math.round(VH - img.h + 6 + bobY + recoil);
    const l = light === undefined ? 1 : light;
    for (let y = 0; y < img.h; y++) {
      const py = y0 + y; if (py < 0 || py >= VH) continue;
      for (let x = 0; x < img.w; x++) {
        const px = x0 + x; if (px < 0 || px >= W) continue;
        const c = img.px[y * img.w + x];
        if ((c >>> 24) < 128) continue;
        buf[py * W + px] = l === 1 ? c : shadePx(c, l, 0);
      }
    }
  }

  const api = { init, render, drawViewModel, zBuffer, get viewH() { return VH; } };
  return api;
})();
