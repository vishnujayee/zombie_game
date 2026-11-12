// W13.Textures — procedural pixel art: wall textures, sprites, weapon view-models, bitmap font.
// Everything is drawn into typed arrays (no canvas) with seeded RNG, so output is deterministic.
window.W13 = window.W13 || {};
W13.Textures = (function () {
  'use strict';
  const U = W13.Util;
  const S = 64;
  const TAU = Math.PI * 2;
  const C = {
    black: [11, 11, 13], green: [90, 107, 47], yellow: [184, 162, 74], rust: [122, 59, 30],
    blood: [138, 15, 15], darkBlood: [66, 5, 7], bone: [207, 198, 168], steel: [100, 104, 108],
    hand: [176, 136, 108], sleeve: [48, 54, 38], gun: [60, 62, 68], wood: [112, 70, 38],
  };

  // ---------------------------------------------------------------- image buffer
  function Img(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.a = new Uint8Array(n);
  }
  Img.prototype.idx = function (x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  };
  Img.prototype.set = function (x, y, c, k) {
    const i = this.idx(x, y); if (i < 0) return;
    if (k === undefined) k = 1;
    this.r[i] = c[0] * k; this.g[i] = c[1] * k; this.b[i] = c[2] * k; this.a[i] = 1;
  };
  Img.prototype.mix = function (x, y, c, t, onlyOpaque) {
    const i = this.idx(x, y); if (i < 0) return;
    if (onlyOpaque && !this.a[i]) return;
    if (!this.a[i]) { this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2]; this.a[i] = 1; return; }
    this.r[i] += (c[0] - this.r[i]) * t; this.g[i] += (c[1] - this.g[i]) * t; this.b[i] += (c[2] - this.b[i]) * t;
  };
  Img.prototype.mul = function (x, y, k) {
    const i = this.idx(x, y); if (i < 0 || !this.a[i]) return;
    this.r[i] *= k; this.g[i] *= k; this.b[i] *= k;
  };
  Img.prototype.opaque = function (x, y) { const i = this.idx(x, y); return i >= 0 && this.a[i] === 1; };
  Img.prototype.pack = function () {
    const out = new Uint32Array(this.w * this.h);
    const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    for (let i = 0; i < out.length; i++) if (this.a[i]) out[i] = U.rgba(cl(this.r[i]), cl(this.g[i]), cl(this.b[i]), 255);
    return out;
  };

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------------------------------------------------------------- noise (tileable at 64)
  function noiseFn(rand, cells) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const cs = S / cells, m = v => ((v % cells) + cells) % cells;
    return function (x, y) {
      const fx = x / cs, fy = y / cs, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[m(y0) * cells + m(x0)], b = g[m(y0) * cells + m(x0 + 1)];
      const c = g[m(y0 + 1) * cells + m(x0)], d = g[m(y0 + 1) * cells + m(x0 + 1)];
      return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
    };
  }
  function fbm(rand) {
    const n1 = noiseFn(rand, 4), n2 = noiseFn(rand, 8), n3 = noiseFn(rand, 16), n4 = noiseFn(rand, 32);
    return (x, y) => n1(x, y) * 0.5 + n2(x, y) * 0.25 + n3(x, y) * 0.15 + n4(x, y) * 0.1;
  }

  // ---------------------------------------------------------------- bitmap font 5x7
  const GLYPH_SRC = {
    A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
    D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
    G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
    J: '..###...#....#....#....##..#..##...', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
    M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.',
    P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
    S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
    V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
    Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
    0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
    3: '####.....#....#.###.....#....#####.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
    6: '.###.#....#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
    9: '.###.#...##...#.####....#....#.###.',
    '.': '..........................##...##..', ':': '......##...##.........##...##......', '/': '....#....#...#...#...#...#....#....',
    '!': '..#....#....#....#....#.........#..', '-': '................###................', '%': '##..###..#...#...#...#...#..###..##',
    '?': '.###.#...#....#...#...#.........#..', ',': '.....................##....#...#...', "'": '..#....#...#.......................',
    ' ': '.'.repeat(35),
  };
  const font = {};
  Object.keys(GLYPH_SRC).forEach(k => {
    const s = GLYPH_SRC[k].padEnd(35, '.');
    const rows = [];
    for (let r = 0; r < 7; r++) rows.push(s.slice(r * 5, r * 5 + 5));
    font[k] = rows;
  });
  function eachGlyphPixel(text, x, y, scale, cb) {
    text = String(text).toUpperCase();
    for (let n = 0; n < text.length; n++) {
      const g = font[text[n]] || font[' '];
      const gx = x + n * 6 * scale;
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) cb(gx + c * scale + sx, y + r * scale + sy);
      }
    }
  }
  function drawText(target, text, x, y, color, scale) {
    scale = scale || 1;
    const { buf, w, h } = target;
    eachGlyphPixel(text, Math.round(x), Math.round(y), scale, (px, py) => {
      if (px >= 0 && py >= 0 && px < w && py < h) buf[py * w + px] = color;
    });
  }
  const textWidth = (text, scale) => String(text).length * 6 * (scale || 1);

  // ---------------------------------------------------------------- drawing primitives
  function ellipse(img, cx, cy, rx, ry, c, rand, rot, flat, only) {
    rot = rot || 0;
    const cr = Math.cos(-rot), sr = Math.sin(-rot), R = Math.max(rx, ry) + 1;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const nx = (dx * cr - dy * sr) / rx, ny = (dx * sr + dy * cr) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      if (only && !img.opaque(x, y)) continue;
      let k = 1;
      if (!flat) k = (0.95 - 0.26 * nx - 0.2 * ny) * (1 - 0.32 * d * d);
      img.set(x, y, c, k * (0.94 + rand() * 0.12));
    }
  }
  function capsule(img, x0, y0, x1, y1, r0, r1, c, rand, flat, only) {
    const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1e-6, L = Math.sqrt(L2);
    const R = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.max(y0, y1) + R; y++) {
      for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.max(x0, x1) + R; x++) {
        const px = x + 0.5 - x0, py = y + 0.5 - y0;
        const t = U.clamp((px * vx + py * vy) / L2, 0, 1);
        const r = U.lerp(r0, r1, t);
        const qx = px - vx * t, qy = py - vy * t, d = Math.hypot(qx, qy);
        if (d > r) continue;
        if (only && !img.opaque(x, y)) continue;
        let k = 1;
        if (!flat) {
          const s = ((px * -vy + py * vx) / L) / r; // signed perpendicular, -1..1
          const nx = s * (-vy / L), ny = s * (vx / L);
          k = 0.9 + 0.26 * (-nx * 0.8 - ny * 0.6) - 0.3 * s * s;
        }
        img.set(x, y, c, k * (0.94 + rand() * 0.12));
      }
    }
  }
  function line(img, x0, y0, x1, y1, c, only, t) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = U.lerp(x0, x1, i / n), y = U.lerp(y0, y1, i / n);
      if (only && !img.opaque(x, y)) continue;
      if (t !== undefined) img.mix(x, y, c, t, only); else img.set(x, y, c);
    }
  }
  function poly(img, pts, c, rand, shade) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      if (!inside) continue;
      const k = shade ? shade((px - x0) / (x1 - x0 || 1), (py - y0) / (y1 - y0 || 1)) : 1;
      img.set(x, y, c, k * (0.95 + rand() * 0.1));
    }
  }
  function rect(img, x0, y0, x1, y1, c, k) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img.set(x, y, c, k); }
  function blob(img, cx, cy, r, c, t, only) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) img.mix(x, y, c, t, only);
    }
  }
  function outline(img, c) {
    const add = [], w = img.w, h = img.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (img.a[y * w + x]) continue;
      if (img.opaque(x - 1, y) || img.opaque(x + 1, y) || img.opaque(x, y - 1) || img.opaque(x, y + 1)) add.push(x, y);
    }
    for (let i = 0; i < add.length; i += 2) img.set(add[i], add[i + 1], c);
  }
  const bloodCol = rand => [62 + rand() * 80, 3 + rand() * 10, 5 + rand() * 8];

  // ---------------------------------------------------------------- walls
  function fillWall(img, rand, fn) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) img.set(x, y, ...fn(x, y)); }
  function crack(img, rand, len) {
    let x = rand() * S, y = rand() * S, a = rand() * TAU;
    for (let i = 0; i < len; i++) { img.mul(x, y, 0.45); img.mul(x + 1, y, 0.85); a += (rand() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a); }
  }
  function bevel(img, x0, y0, x1, y1, hi, lo) {
    for (let x = x0; x <= x1; x++) { img.mul(x, y0, hi); img.mul(x, y1, lo); }
    for (let y = y0; y <= y1; y++) { img.mul(x0, y, hi); img.mul(x1, y, lo); }
  }
  function bloodSplash(img, rand, cx, cy, w, h, drips) {
    for (let i = 0; i < 60; i++) blob(img, cx + (rand() - 0.5) * w, cy + (rand() - 0.5) * h, 0.6 + rand() * 1.8, bloodCol(rand), 0.55 + rand() * 0.35);
    for (let i = 0; i < drips; i++) {
      const x = Math.floor(cx + (rand() - 0.5) * w * 0.9), len = 5 + rand() * 26, col = bloodCol(rand);
      const y0 = cy + (rand() - 0.2) * h * 0.4, wide = rand() < 0.4;
      for (let y = y0; y < y0 + len; y++) { img.mix(x, y, col, 0.88); if (wide && y < y0 + len * 0.6) img.mix(x + 1, y, col, 0.7); }
      blob(img, x + 0.5, y0 + len, 1.3, col, 0.9);
    }
  }
  function stamp(img, text, x, y, c, scale, t) { eachGlyphPixel(text, x, y, scale, (px, py) => img.mix(px, py, c, t)); }

  const WALLS = {
    TILE(img, rand) {
      const n = fbm(rand), tv = [];
      for (let i = 0; i < 16; i++) tv.push(0.86 + rand() * 0.18);
      fillWall(img, rand, (x, y) => {
        const lx = x & 15, ly = y & 15, t = tv[(y >> 4) * 4 + (x >> 4)];
        let c = [150 * t, 148 * t, 126 * t], k = 0.7 + 0.42 * n(x, y) - (y / S) * 0.2;
        if (lx === 0 || ly === 0) { c = [56, 56, 46]; k = 0.8 + 0.3 * n(x, y); }
        else if (lx === 1 || ly === 1) k *= 1.12;
        else if (lx === 15 || ly === 15) k *= 0.8;
        return [c, k * (0.93 + rand() * 0.14)];
      });
      // two chipped tiles exposing dark mortar
      for (let i = 0; i < 2; i++) {
        const tx = (Math.floor(rand() * 4) << 4) + 2, ty = (Math.floor(rand() * 4) << 4) + 2, r = 3 + rand() * 4;
        for (let y = 0; y < r; y++) for (let x = 0; x < r - y; x++) img.set(tx + x, ty + y, [48, 46, 40], 0.8 + rand() * 0.3);
      }
      for (let i = 0; i < 3; i++) crack(img, rand, 14 + rand() * 12);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (n(x + 9, y + 31) > 0.62) img.mix(x, y, [70, 74, 40], (n(x + 9, y + 31) - 0.62) * 1.6);
    },
    TILE_BLOOD(img, rand) {
      WALLS.TILE(img, rand);
      bloodSplash(img, rand, 30, 24, 40, 14, 10);
      // smeared hand-drag streaks
      for (let s = 0; s < 4; s++) {
        const y = 30 + s * 3 + rand() * 2, col = bloodCol(rand);
        for (let x = 6 + rand() * 6; x < 50 + rand() * 10; x++) img.mix(x, y + Math.sin(x * 0.2) * 1.5, col, 0.6 + rand() * 0.3);
      }
    },
    CONCRETE(img, rand) {
      const n = fbm(rand), streak = noiseFn(rand, 16), mold = fbm(rand);
      fillWall(img, rand, (x, y) => {
        let k = 0.6 + 0.48 * n(x, y);
        const s = streak(x, 0);
        if (s > 0.55) k *= 1 - (s - 0.55) * 1.3 * (1 - y / 90);
        if (y === 0 || y === 32 || x === 0) k *= 0.45;
        if (y === 1 || y === 33 || x === 1) k *= 1.15;
        return [[96, 98, 88], k * (0.92 + rand() * 0.16)];
      });
      for (let y = 34; y < S; y++) for (let x = 0; x < S; x++) {
        const m = mold(x, y); if (m > 0.5) img.mix(x, y, C.green, Math.min(0.75, (m - 0.5) * 2.4 * (y - 34) / 30));
      }
      for (let i = 0; i < 4; i++) { const x = 4 + rand() * 56, y = 4 + rand() * 56; rect(img, x | 0, y | 0, (x | 0) + 1, (y | 0) + 1, [26, 26, 24]); }
      for (let i = 0; i < 2; i++) crack(img, rand, 20);
    },
    PADDED(img, rand) {
      const n = fbm(rand);
      fillWall(img, rand, (x, y) => {
        const u = (x + y) & 31, v = (x - y + 64) & 31;
        const d = Math.max(Math.abs(u - 16), Math.abs(v - 16)) / 16;
        let k = 1.04 - 0.42 * d * d - (u > 16 ? 0.07 : 0) + (v < 16 ? 0.03 : 0);
        if (u === 0 || v === 0) k = 0.55;
        k *= 0.78 + 0.32 * n(x, y);
        return [[178, 164, 126], k * (0.95 + rand() * 0.1)];
      });
      for (let by = 0; by <= S; by += 16) for (let bx = 0; bx <= S; bx += 16) {
        if ((bx + by) % 32 === 0) blob(img, bx, by, 1.6, [60, 52, 40], 0.9);
      }
      for (let i = 0; i < 5; i++) blob(img, rand() * S, rand() * S, 2 + rand() * 5, [96, 70, 36], 0.35);
      const sx = 34 + rand() * 10, sy = 18 + rand() * 10; // fingernail scratches
      for (let i = 0; i < 4; i++) line(img, sx + i * 2.5, sy, sx + i * 2.5 + 6, sy + 18, [70, 40, 30], false, 0.75);
      bloodSplash(img, rand, sx + 6, sy + 20, 8, 3, 2);
    },
    MORGUE(img, rand) {
      const n = fbm(rand);
      fillWall(img, () => 0, (x, y) => [[28, 29, 31], 1]);
      const cols = [[2, 30], [34, 62]], rows = [[2, 19], [23, 40], [44, 61]];
      cols.forEach(([x0, x1], ci) => rows.forEach(([y0, y1], ri) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const brushed = 0.9 + 0.1 * Math.sin(y * 2.7 + rand() * 0.6);
          img.set(x, y, C.steel, (0.7 + 0.45 * n(x, y)) * brushed * (0.95 + rand() * 0.1));
        }
        bevel(img, x0, y0, x1, y1, 1.35, 0.55);
        const hy = Math.floor((y0 + y1) / 2) + 2;
        rect(img, x0 + 8, hy, x1 - 8, hy + 1, [190, 192, 186]);
        for (let x = x0 + 8; x <= x1 - 8; x++) img.mul(x, hy + 2, 0.5);
        rect(img, x0 + 3, y0 + 3, x0 + 9, y0 + 6, C.bone, 0.85);
        line(img, x0 + 4, y0 + 4, x0 + 8, y0 + 4, [60, 60, 60]);
        for (let i = 0; i < 3; i++) { // rust streaks under the handle
          const x = x0 + 8 + rand() * (x1 - x0 - 16), len = 3 + rand() * (y1 - hy);
          for (let y = hy + 2; y < hy + 2 + len; y++) img.mix(x, y, C.rust, 0.55 * (1 - (y - hy) / (len + 2)));
        }
        if (ci === 1 && ri === 1) for (let x = x0; x <= x1; x++) { img.set(x, y0, [8, 8, 8]); img.set(x, y0 + 1, [14, 14, 14]); }
      }));
      bloodSplash(img, rand, 46, 34, 6, 3, 3);
    },
    METAL_DOOR(img, rand) {
      const n = fbm(rand), rustN = fbm(rand);
      fillWall(img, rand, (x, y) => [[86, 84, 80], (0.66 + 0.45 * n(x, y)) * (0.94 + rand() * 0.12)]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const r = rustN(x, y); if (r > 0.5) img.mix(x, y, C.rust, Math.min(0.85, (r - 0.5) * 2.6));
      }
      bevel(img, 0, 0, 63, 63, 0.4, 0.4); bevel(img, 1, 1, 62, 62, 0.6, 0.6); bevel(img, 3, 3, 60, 60, 1.3, 0.6);
      [20, 44].forEach(by => { for (let x = 4; x < 60; x++) { img.mul(x, by, 1.3); img.mul(x, by + 1, 1.1); img.mul(x, by + 3, 0.55); } });
      for (let i = 0; i < 8; i++) for (const [rx, ry] of [[6 + i * 7.2, 6], [6 + i * 7.2, 57], [6, 6 + i * 7.2], [57, 6 + i * 7.2]]) {
        img.set(rx, ry, [170, 166, 150]); img.set(rx + 1, ry + 1, [30, 28, 26]); img.set(rx + 1, ry, [120, 116, 104]);
      }
      rect(img, 24, 9, 40, 13, [12, 12, 14]); bevel(img, 23, 8, 41, 14, 0.6, 1.4);
      stamp(img, '13', 17, 25, [190, 170, 90], 3, 0.55);
      for (let i = 0; i < 6; i++) { const x = rand() * 50 + 6, y = rand() * 50 + 6; line(img, x, y, x + 4 + rand() * 6, y + rand() * 3, [150, 146, 136], false, 0.5); }
    },
    THEATRE_DOOR(img, rand) {
      const n = fbm(rand);
      fillWall(img, rand, (x, y) => {
        const chip = n(x * 1.7, y * 1.7) > 0.66;
        return [chip ? [90, 88, 84] : [100, 114, 98], (0.68 + 0.4 * n(x, y)) * (0.94 + rand() * 0.12)];
      });
      for (let y = 0; y < S; y++) { img.set(31, y, [10, 10, 10]); img.set(32, y, [18, 18, 18]); img.mul(30, y, 0.7); img.mul(33, y, 1.2); }
      for (let y = 0; y < 4; y++) for (let x = 0; x < S; x++) img.set(x, y, [210, 34, 24], 0.75 + 0.25 * (y / 4) + rand() * 0.1);
      for (let y = 4; y < 12; y++) for (let x = 0; x < S; x++) img.mix(x, y, [180, 20, 14], 0.4 * (1 - (y - 4) / 8));
      [16, 48].forEach(cx => {
        for (let y = 14; y < 32; y++) for (let x = cx - 8; x < cx + 8; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 22);
          if (d < 6) img.set(x, y, [24, 10, 12], 0.8 + (d < 3 && x < cx ? 0.6 : 0) + rand() * 0.2);
          else if (d < 7.4) img.set(x, y, [150, 150, 140], d < 6.7 ? 1.1 : 0.6);
        }
        img.mix(cx - 2, 20, [255, 90, 80], 0.8); img.mix(cx - 1, 19, [255, 120, 110], 0.6);
        rect(img, cx - 9, 50, cx + 9, 61, [110, 112, 112], 0.9); bevel(img, cx - 9, 50, cx + 9, 61, 1.3, 0.6);
        rect(img, cx - 3, 36, cx + 3, 44, [150, 150, 146]); bevel(img, cx - 3, 36, cx + 3, 44, 1.2, 0.6);
      });
      bloodSplash(img, rand, 44, 38, 10, 6, 6);
    },
    EXIT_GATE(img, rand) { gate(img, rand, false); },
    EXIT_GATE_OPEN(img, rand) { gate(img, rand, true); },
  };
  function gate(img, rand, open) {
    const n = fbm(rand);
    fillWall(img, rand, (x, y) => [[20, 24, 22], 0.6 + 0.8 * n(x, y)]);
    for (let y = 12; y < S; y++) for (let x = 0; x < S; x++) img.mix(x, y, [36, 44, 40], 0.25 * n(x + 20, y) * (y / S));
    for (let bx = 4; bx < S; bx += 8) for (let y = 10; y < S; y++) for (let x = bx - 1; x <= bx + 1; x++) {
      const s = x - bx;
      img.set(x, y, n(x, y * 2) > 0.55 ? [110, 58, 32] : [74, 72, 68], 1.05 - 0.25 * s - 0.2 * s * s + rand() * 0.08);
    }
    [11, 55].forEach(by => { for (let x = 0; x < S; x++) { img.set(x, by, [84, 80, 74], 1.2); img.set(x, by + 1, [70, 68, 62]); img.set(x, by + 2, [40, 38, 34]); } });
    rect(img, 0, 0, 63, 9, [26, 24, 22]);
    if (open) {
      rect(img, 18, 1, 45, 8, [16, 70, 26]);
      for (let y = 0; y < 13; y++) for (let x = 12; x < 52; x++) img.mix(x, y, [60, 200, 90], 0.18 * (1 - Math.abs(x - 32) / 22));
      stamp(img, 'EXIT', 21, 2, [150, 255, 160], 1, 1);
      for (let y = 30; y < 50; y += 3) { blob(img, 34 + Math.sin(y) * 1.5, y, 1.4, [120, 116, 108], 1); } // broken chain hanging
    } else {
      rect(img, 18, 1, 45, 8, [60, 14, 14]);
      stamp(img, 'EXIT', 21, 2, [120, 40, 36], 1, 1);
      for (let x = 16; x < 48; x += 3) blob(img, x, 32 + Math.sin(x * 0.5) * 1.5, 1.4, [124, 120, 110], 1);
      rect(img, 28, 33, 36, 42, [150, 112, 50]); bevel(img, 28, 33, 36, 42, 1.3, 0.55);
      for (let a = 0; a < Math.PI; a += 0.15) img.set(32 + Math.cos(a) * 3, 33 - Math.sin(a) * 4, [170, 170, 160]);
      img.set(32, 37, [20, 16, 10]); img.set(32, 38, [20, 16, 10]);
    }
  }

  // ---------------------------------------------------------------- enemy sprites
  const ENEMY = {
    shambler: { skin: [132, 146, 112], cloth: [98, 118, 112], torsoRx: 9, hipY: 39, shoulderY: 20, headR: 6, headY: 12, legR: 3, armR: 2.6, tilt: 0.25, headDx: 2, gown: true, hair: true },
    runner: { skin: [158, 140, 102], cloth: [74, 58, 52], legC: [52, 52, 64], torsoRx: 7, hipY: 37, shoulderY: 19, headR: 5.5, headY: 11, legR: 2.7, armR: 2.3, tilt: -0.12, headDx: -1, runner: true, hair: true },
    bloater: { skin: [98, 120, 58], torsoRx: 16, hipY: 45, shoulderY: 22, headR: 5, headY: 16, legR: 4.4, armR: 3.4, tilt: 0.1, headDx: 1, belly: true },
    boss: { skin: [168, 136, 128], skin2: [126, 138, 112], torsoRx: 17, hipY: 41, shoulderY: 15, headR: 5.5, headY: 10, legR: 5, armR: 4, tilt: -0.2, headDx: -2, boss: true },
  };
  const ANIM_FRAMES = { walk: 4, attack: 2, hurt: 1, death: 4 };
  const shadeC = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function stitches(P, x0, y0, x1, y1) {
    P.push({ t: 'l', x0, y0, x1, y1, c: [70, 8, 10], only: true });
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let d = 1; d < len; d += 3) {
      const x = U.lerp(x0, x1, d / len), y = U.lerp(y0, y1, d / len);
      P.push({ t: 'l', x0: x - nx * 1.5, y0: y - ny * 1.5, x1: x + nx * 1.5, y1: y + ny * 1.5, c: [196, 40, 36], only: true });
    }
  }

  function enemyPrims(s, anim, frame, rand) {
    const P = [], cx = 32;
    const ph = anim === 'walk' ? (frame * Math.PI) / 2 : 0;
    const attack = anim === 'attack' ? frame : -1, hurt = anim === 'hurt';
    const swing = Math.sin(ph), by = -Math.abs(Math.cos(ph)) * 1 + (anim === 'walk' ? 1 : 0);
    const legC = s.legC || shadeC(s.skin, 0.8), skinD = shadeC(s.skin, 0.7);
    const sy0 = s.shoulderY + by, hy = s.hipY + by;
    // legs
    for (const side of [-1, 1]) {
      const lift = Math.max(0, swing * side) * 2.5, sw = swing * side * 2.5;
      const hipX = cx + side * s.torsoRx * 0.45, footX = cx + side * (s.torsoRx * 0.45 + 1.5) + sw;
      const kx = (hipX + footX) / 2 + side, ky = (hy + 61) / 2 - lift * 0.5;
      P.push({ t: 'c', x0: hipX, y0: hy, x1: kx, y1: ky, r0: s.legR, r1: s.legR * 0.9, c: legC });
      P.push({ t: 'c', x0: kx, y0: ky, x1: footX, y1: 60.5 - lift, r0: s.legR * 0.9, r1: s.legR * 0.75, c: legC });
      P.push({ t: 'e', x: footX + side, y: 62.2 - lift, rx: s.legR + 1.2, ry: 1.9, c: s.runner ? [40, 34, 30] : skinD });
    }
    // torso
    const tcy = (sy0 + hy) / 2, tRy = (hy - sy0) / 2 + 3;
    if (s.gown) for (let i = 0; i < 7; i++) {
      const x = cx - s.torsoRx + 1.5 + (i * (2 * s.torsoRx - 3)) / 6, len = 4 + rand() * 8;
      P.push({ t: 'c', x0: x, y0: hy - 2, x1: x + (rand() - 0.5) * 2, y1: hy + len, r0: 2, r1: 1.2, c: shadeC(s.cloth, 0.85) });
    }
    P.push({ t: 'e', x: cx, y: tcy, rx: s.torsoRx, ry: tRy, c: s.cloth || s.skin });
    if (s.gown) for (let i = 0; i < 3; i++) P.push({ t: 'e', x: cx + (rand() - 0.5) * 12, y: tcy + (rand() - 0.3) * 10, rx: 1.5 + rand() * 2.5, ry: 2 + rand() * 3, c: bloodCol(rand), only: true });
    if (s.runner) {
      P.push({ t: 'e', x: cx + 2, y: tcy + 3, rx: 3, ry: 5, c: s.skin, only: true });
      P.push({ t: 'l', x0: cx - 1, y0: tcy, x1: cx + 4, y1: tcy + 1, c: [60, 10, 10], only: true });
      P.push({ t: 'l', x0: cx - 1, y0: tcy + 3, x1: cx + 4, y1: tcy + 4, c: [60, 10, 10], only: true });
    }
    if (s.belly) {
      P.push({ t: 'e', x: cx, y: tcy + 4, rx: s.torsoRx - 4, ry: tRy - 5, c: [128, 146, 74], only: true });
      for (let i = 0; i < 4; i++) { const x = cx + (rand() - 0.5) * 20, y = tcy + (rand() - 0.5) * 14; P.push({ t: 'l', x0: x, y0: y, x1: x + (rand() - 0.5) * 8, y1: y + rand() * 6, c: [50, 66, 28], only: true }); }
      for (let i = 0; i < 9; i++) {
        const a = rand() * TAU, r = rand() * 0.8, x = cx + Math.cos(a) * r * s.torsoRx, y = tcy + Math.sin(a) * r * tRy, br = 1.3 + rand() * 1.4;
        P.push({ t: 'e', x, y, rx: br, ry: br, c: [176, 168, 66], only: true });
        P.push({ t: 'p', x: x - 0.5, y: y - 0.5, c: [236, 226, 140], only: true });
      }
    }
    if (s.boss) {
      P.push({ t: 'e', x: cx + 7, y: tcy + 3, rx: 10, ry: 11, c: s.skin2, only: true });
      P.push({ t: 'e', x: cx - 8, y: tcy - 5, rx: 6, ry: 5, c: [150, 104, 100], only: true });
      stitches(P, cx - 2, sy0 + 2, cx + 1, hy - 1);
      stitches(P, cx - s.torsoRx + 3, tcy + 4, cx + s.torsoRx - 3, tcy + 2);
      stitches(P, cx - 13, tcy - 9, cx - 3, tcy - 1);
      for (let i = 0; i < 3; i++) P.push({ t: 'l', x0: cx - 6 + i * 2, y0: tcy - 2, x1: cx - 8 + i * 2, y1: tcy + 4, c: [210, 196, 170], only: true }); // exposed ribs
    }
    // arms
    for (const side of [-1, 1]) {
      const sx = cx + side * (s.torsoRx - 1), sy = sy0 + 3;
      let r = s.armR, hr = s.armR + 1.3, claw = 3;
      if (s.boss) { r = side > 0 ? 5.5 : 2.6; hr = side > 0 ? 6.5 : 3; claw = side > 0 ? 5 : 2; }
      let ex, ey, hx, hy2;
      if (attack === 0) { ex = sx + side * 6; ey = sy - 4; hx = sx + side * 4; hy2 = sy - 14; }
      else if (attack === 1) { ex = sx + side * 6; ey = sy + 6; hx = cx + side * 6; hy2 = sy + 9; }
      else if (hurt) { ex = sx + side * 8; ey = sy - 1; hx = sx + side * 11; hy2 = sy - 8; }
      else if (s.runner) { ex = sx + side * 5; ey = sy + 7 - swing * side * 2; hx = sx + side * 3; hy2 = sy + 2 - swing * side * 2; hr += 0.8; }
      else { ex = sx + side * 4; ey = sy + 9; hx = sx + side * 5; hy2 = sy + 18 + swing * side * 2; }
      if (s.boss && side > 0 && attack < 0 && !hurt) { ex = sx + 7; ey = sy + 12; hx = sx + 6; hy2 = sy + 27; }
      const armC = s.runner ? s.skin : s.boss && side > 0 ? s.skin2 : s.skin;
      P.push({ t: 'c', x0: sx, y0: sy, x1: ex, y1: ey, r0: r, r1: r * 0.9, c: armC });
      P.push({ t: 'c', x0: ex, y0: ey, x1: hx, y1: hy2, r0: r * 0.9, r1: r * 0.75, c: armC });
      if (s.boss && side > 0) stitches(P, sx, sy + 1, ex, ey);
      P.push({ t: 'e', x: hx, y: hy2, rx: hr, ry: hr, c: shadeC(armC, 0.9) });
      const dl = Math.hypot(hx - ex, hy2 - ey) || 1, dx = (hx - ex) / dl, dy = (hy2 - ey) / dl;
      for (let f = -1; f <= 1; f++) {
        const fx = hx + dx * hr * 0.7 + -dy * f * hr * 0.6, fy = hy2 + dy * hr * 0.7 + dx * f * hr * 0.6;
        P.push({ t: 'l', x0: fx, y0: fy, x1: fx + dx * claw, y1: fy + dy * claw, c: [58, 48, 38] });
      }
    }
    // head
    const hx = cx + s.headDx + (hurt ? -2 : 0), hyc = s.headY + by + (hurt ? -1 : 0), hr = s.headR;
    P.push({ t: 'e', x: hx, y: hyc, rx: hr, ry: hr * 1.12, c: s.skin, rot: s.tilt });
    if (s.hair) for (let i = 0; i < 5; i++) { const x = hx - hr + 1.5 + i * (hr * 2 - 3) / 4; P.push({ t: 'l', x0: x, y0: hyc - hr * 1.05, x1: x + (rand() - 0.5) * 3, y1: hyc - hr * 0.3 + rand() * 3, c: [30, 26, 22] }); }
    for (const side of [-1, 1]) P.push({ t: 'e', x: hx + side * 2.3, y: hyc - 0.5, rx: 1.7, ry: 1.4, c: [24, 18, 16], only: true, flat: true });
    if (s.boss) {
      P.push({ t: 'p', x: hx - 2.3, y: hyc - 0.6, c: [255, 50, 30], only: true });
      stitches(P, hx + 0.5, hyc - hr, hx + 3.5, hyc + hr * 0.8);
    } else for (const side of [-1, 1]) P.push({ t: 'p', x: hx + side * 2.3, y: hyc - 0.6, c: [236, 214, 120], only: true });
    P.push({ t: 'l', x0: hx - 2.2, y0: hyc + 3.4, x1: hx + 2.2, y1: hyc + 3.1, c: [30, 6, 6], only: true });
    P.push({ t: 'p', x: hx - 1, y: hyc + 2.8, c: C.bone, only: true });
    P.push({ t: 'p', x: hx + 1, y: hyc + 2.8, c: C.bone, only: true });
    P.push({ t: 'l', x0: hx + 1.2, y0: hyc + 4, x1: hx + 1.2, y1: hyc + 7, c: [120, 10, 10] });
    return P;
  }

  function drawPrims(img, prims, rand, T) {
    for (const p of prims) {
      if (p.t === 'e') { const a = T.pt(p.x, p.y); ellipse(img, a[0], a[1], p.rx, p.ry * T.sy, p.c, rand, (p.rot || 0) + T.a, p.flat, p.only); }
      else if (p.t === 'c') { const a = T.pt(p.x0, p.y0), b = T.pt(p.x1, p.y1); capsule(img, a[0], a[1], b[0], b[1], p.r0, p.r1, p.c, rand, p.flat, p.only); }
      else if (p.t === 'l') { const a = T.pt(p.x0, p.y0), b = T.pt(p.x1, p.y1); line(img, a[0], a[1], b[0], b[1], p.c, p.only); }
      else if (p.t === 'p') { const a = T.pt(p.x, p.y); if (!p.only || img.opaque(a[0], a[1])) img.set(a[0], a[1], p.c); }
    }
  }
  function makeT(a, ox, sy) {
    const ca = Math.cos(a), sa = Math.sin(a);
    return { a, sy, pt(x, y) { const dx = x - 32, dy = y - 63; const X = 32 + dx * ca - dy * sa + ox; const Y = 63 - (63 - (63 + dx * sa + dy * ca)) * sy; return [X, Y]; } };
  }
  function buildEnemy(type, anim, frame) {
    const rand = U.rng(hash(type + anim + frame) ^ 0x5eed);
    const s = ENEMY[type], img = new Img(S, S);
    let T = makeT(0, 0, 1);
    if (anim === 'death') {
      const a = [0.22, 0.72, 1.2, Math.PI / 2][frame];
      if (frame >= 2) ellipse(img, 32, 61.8, 9 + frame * 5, 1.8 + frame * 0.4, C.darkBlood, rand, 0, true);
      T = makeT(a, -Math.sin(a) * 26, frame === 3 ? 0.5 : 1);
    }
    drawPrims(img, enemyPrims(s, anim, frame, rand), rand, T);
    outline(img, C.black);
    if (anim === 'hurt') for (let i = 0; i < S * S; i++) if (img.a[i]) { img.r[i] += (255 - img.r[i]) * 0.4; img.g[i] += (232 - img.g[i]) * 0.4; img.b[i] += (222 - img.b[i]) * 0.4; }
    return { w: S, h: S, px: img.pack() };
  }

  // ---------------------------------------------------------------- pickups & misc sprites
  const MISC = {
    pickup_health(img, rand) {
      poly(img, [[21, 47], [43, 47], [43, 62], [21, 62]], [196, 190, 172], rand, (u, v) => (v < 0.2 ? 1.15 : 1 - u * 0.25));
      rect(img, 28, 44, 36, 46, [40, 40, 40]);
      rect(img, 30, 50, 34, 60, [170, 20, 20]); rect(img, 25, 53, 39, 57, [170, 20, 20]);
      blob(img, 40, 60, 2, C.darkBlood, 0.7);
    },
    pickup_ammo(img, rand) {
      for (let i = 0; i < 5; i++) { ellipse(img, 25 + i * 3.5, 49, 1.4, 2.4, [206, 164, 64], rand); img.set(25 + i * 3.5, 47, [180, 110, 60]); }
      poly(img, [[22, 50], [42, 50], [42, 62], [22, 62]], [82, 88, 48], rand, (u, v) => (v < 0.15 ? 1.2 : 1 - u * 0.3));
      rect(img, 22, 55, 42, 56, C.yellow, 0.9);
    },
    pickup_shells(img, rand) {
      for (let i = 0; i < 4; i++) {
        const x = 24 + i * 5;
        capsule(img, x, 51, x, 59, 2.1, 2.1, [156, 26, 20], rand);
        rect(img, x - 2, 59, x + 2, 62, [204, 162, 70], 1);
      }
    },
    pickup_shotgun(img, rand) {
      capsule(img, 10, 55, 44, 53.5, 1.5, 1.5, C.gun, rand);
      capsule(img, 12, 57.5, 38, 56.5, 1.2, 1.2, [40, 40, 44], rand);
      capsule(img, 22, 57, 32, 56.5, 2.6, 2.6, C.wood, rand);
      poly(img, [[42, 52], [48, 51.5], [48, 59], [42, 59]], [44, 44, 48], rand);
      poly(img, [[47, 53], [58, 54], [60, 62], [49, 61]], C.wood, rand, (u, v) => 1.1 - v * 0.4);
    },
    bile(img, rand) {
      ellipse(img, 32, 34, 6, 5, [150, 172, 40], rand);
      for (let i = 0; i < 4; i++) { const x = 28 + rand() * 8; capsule(img, x, 36, x + (rand() - 0.5) * 2, 41 + rand() * 4, 1.4, 0.6, [128, 150, 30], rand); }
      for (let i = 0; i < 5; i++) blob(img, 26 + rand() * 12, 30 + rand() * 8, 0.9, [210, 230, 90], 0.9, true);
      for (let i = 0; i < 3; i++) blob(img, 29 + rand() * 6, 32 + rand() * 4, 1, [70, 84, 18], 0.8, true);
    },
    corpse_splat(img, rand) {
      ellipse(img, 32, 61.5, 15, 2.4, C.darkBlood, rand, 0, true);
      ellipse(img, 30, 61.5, 9, 1.5, [104, 8, 10], rand, 0, true);
      for (let i = 0; i < 14; i++) blob(img, 32 + (rand() - 0.5) * 40, 60 + rand() * 3.5, 0.6 + rand(), bloodCol(rand), 1);
      for (let i = 0; i < 4; i++) img.set(24 + rand() * 16, 61 + rand() * 2, C.bone);
    },
  };
  function buildMisc(name) {
    const rand = U.rng(hash(name) ^ 0xabc), img = new Img(S, S);
    MISC[name](img, rand);
    if (name !== 'corpse_splat') outline(img, C.black);
    return { w: S, h: S, px: img.pack() };
  }

  // ---------------------------------------------------------------- weapon view-models (96x80)
  const WW = 96, WH = 80;
  function muzzleFlash(img, cx, cy, r, rand) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + rand() * 0.4, l = r * (1 + rand() * 1.1);
      capsule(img, cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.8, 2.6, 0.4, [255, 170, 60], rand, true);
    }
    ellipse(img, cx, cy, r * 0.8, r * 0.7, [255, 220, 120], rand, 0, true);
    ellipse(img, cx, cy, r * 0.4, r * 0.35, [255, 252, 230], rand, 0, true);
  }
  function handPoly(img, pts, rand, knuckles) {
    poly(img, pts, C.hand, rand, (u, v) => 1.12 - u * 0.3 - v * 0.15);
    (knuckles || []).forEach(k => line(img, k[0], k[1], k[2], k[3], [96, 66, 50]));
  }
  function pistolAt(img, ox, oy, rand, flash) {
    const P = pts => pts.map(p => [p[0] + ox, p[1] + oy]);
    poly(img, P([[16, 80], [42, 80], [40, 68], [24, 64]]), C.sleeve, rand, (u, v) => 0.75 + v * 0.35);
    poly(img, P([[54, 80], [82, 80], [72, 64], [58, 66]]), C.sleeve, rand, (u, v) => 0.75 + v * 0.35);
    handPoly(img, P([[26, 64], [40, 56], [44, 60], [44, 80], [24, 80]]), rand);
    poly(img, P([[40, 14], [56, 14], [60, 50], [36, 50]]), C.gun, rand, (u, v) => 1.2 - u * 0.5);
    poly(img, P([[41, 14], [55, 14], [55.6, 20], [40.4, 20]]), [110, 114, 122], rand);
    rect(img, 40 + ox, 11 + oy, 42 + ox, 14 + oy, [26, 26, 28]); rect(img, 54 + ox, 11 + oy, 56 + ox, 14 + oy, [26, 26, 28]);
    rect(img, 47 + ox, 12 + oy, 49 + ox, 14 + oy, [220, 214, 170]);
    rect(img, 50 + ox, 26 + oy, 55 + ox, 32 + oy, [16, 16, 18]);
    for (let y = 38; y <= 46; y += 2) line(img, 38 + ox, y + oy, 58 + ox, y + oy, [32, 32, 36]);
    poly(img, P([[38, 50], [58, 50], [58, 56], [38, 56]]), [40, 40, 46], rand);
    handPoly(img, P([[36, 55], [58, 54], [64, 62], [62, 80], [38, 80], [34, 66]]), rand,
      [[37 + ox, 60 + oy, 52 + ox, 60 + oy], [37 + ox, 65 + oy, 52 + ox, 65 + oy], [38 + ox, 70 + oy, 52 + ox, 70 + oy]]);
    capsule(img, 40 + ox, 55 + oy, 54 + ox, 52 + oy, 2.4, 2.1, shadeC(C.hand, 1.08), rand);
    if (flash) muzzleFlash(img, 48 + ox, 7 + oy, 8, rand);
  }
  function shotgunAt(img, ox, oy, rand, flash, pumpBack, shell) {
    const P = pts => pts.map(p => [p[0] + ox, p[1] + oy]);
    poly(img, P([[14, 80], [40, 80], [38, 56], [24, 52]]), C.sleeve, rand, (u, v) => 0.75 + v * 0.35);
    poly(img, P([[56, 80], [86, 80], [76, 62], [58, 64]]), C.sleeve, rand, (u, v) => 0.75 + v * 0.35);
    poly(img, P([[39, 74], [57, 74], [51.5, 6], [44.5, 6]]), [38, 38, 44], rand, (u, v) => 1.15 - u * 0.45);
    poly(img, P([[42, 72], [51, 72], [49.5, 6], [45.5, 6]]), C.gun, rand, (u, v) => 1.25 - u * 0.45);
    line(img, 47.5 + ox, 7 + oy, 46.5 + ox, 70 + oy, [140, 144, 150]);
    rect(img, 46 + ox, 4 + oy, 49 + ox, 6 + oy, [210, 204, 170]);
    const py = pumpBack ? 10 : 0;
    poly(img, P([[38, 30 + py], [58, 30 + py], [60, 48 + py], [36, 48 + py]]), C.wood, rand, (u, v) => 1.2 - u * 0.45);
    for (let y = 33; y < 47; y += 3) line(img, 39 + ox, y + py + oy, 58 + ox, y + py + oy, [66, 38, 18]);
    poly(img, P([[32, 62], [64, 62], [68, 80], [28, 80]]), [34, 34, 38], rand, (u, v) => 1.15 - u * 0.45);
    handPoly(img, P([[26, 36 + py], [40, 33 + py], [46, 40 + py], [42, 50 + py], [26, 50 + py]]), rand,
      [[34 + ox, 38 + py + oy, 44 + ox, 38 + py + oy], [34 + ox, 42 + py + oy, 44 + ox, 42 + py + oy], [34 + ox, 46 + py + oy, 43 + ox, 46 + py + oy]]);
    handPoly(img, P([[54, 64], [70, 62], [76, 72], [74, 80], [54, 80]]), rand, [[56 + ox, 68 + oy, 66 + ox, 67 + oy]]);
    if (shell) {
      capsule(img, 28 + ox, 60 + oy, 36 + ox, 55 + oy, 2.4, 2.4, [160, 28, 22], rand);
      rect(img, 26 + ox, 60 + oy, 29 + ox, 63 + oy, [204, 162, 70]);
      handPoly(img, P([[20, 62], [32, 60], [34, 72], [20, 74]]), rand);
    }
    if (flash) muzzleFlash(img, 48 + ox, 5 + oy, 11, rand);
  }
  function buildWeapon(name, frame) {
    const rand = U.rng(hash(name + frame) ^ 0x77), img = new Img(WW, WH);
    if (name === 'pistol') {
      if (frame === 'fire') pistolAt(img, 0, -2, rand, true);
      else if (frame === 'reload1') { pistolAt(img, -10, 18, rand, false); rect(img, 60, 66, 64, 76, [30, 30, 34]); }
      else if (frame === 'reload2') pistolAt(img, -6, 10, rand, false);
      else pistolAt(img, 0, 0, rand, false);
    } else {
      if (frame === 'fire') shotgunAt(img, 0, -3, rand, true, false, false);
      else if (frame === 'reload1') shotgunAt(img, 0, 2, rand, false, true, false);
      else if (frame === 'reload2') shotgunAt(img, 8, 12, rand, false, false, true);
      else shotgunAt(img, 0, 0, rand, false, false, false);
    }
    outline(img, C.black);
    return { w: WW, h: WH, px: img.pack() };
  }

  // ---------------------------------------------------------------- cache & API
  let cache = null;
  function init() {
    cache = { walls: {}, sprites: {}, weapons: {} };
    Object.keys(WALLS).forEach(id => {
      const img = new Img(S, S);
      WALLS[id](img, U.rng(hash(id) ^ 0x1313));
      cache.walls[id] = img.pack();
    });
    Object.keys(ENEMY).forEach(type => Object.keys(ANIM_FRAMES).forEach(anim => {
      for (let f = 0; f < ANIM_FRAMES[anim]; f++) cache.sprites[type + ':' + anim + ':' + f] = buildEnemy(type, anim, f);
    }));
    Object.keys(MISC).forEach(k => { cache.sprites[k] = buildMisc(k); });
    ['pistol', 'shotgun'].forEach(n => ['idle', 'fire', 'reload1', 'reload2'].forEach(f => { cache.weapons[n + ':' + f] = buildWeapon(n, f); }));
  }
  const ensure = () => { if (!cache) init(); };
  function wall(id) { ensure(); return cache.walls[id] || cache.walls.CONCRETE; }
  function sprite(type, anim, frame) {
    ensure();
    if (!ENEMY[type]) return cache.sprites[type] || null;
    const n = ANIM_FRAMES[anim] ? anim : 'walk';
    const f = ((frame | 0) % ANIM_FRAMES[n] + ANIM_FRAMES[n]) % ANIM_FRAMES[n];
    return cache.sprites[type + ':' + n + ':' + f];
  }
  function weapon(name, frame) { ensure(); return cache.weapons[name + ':' + frame] || cache.weapons[name + ':idle']; }

  return { init, wall, sprite, weapon, font, drawText, textWidth, ANIM_FRAMES, WALL_IDS: Object.keys(WALLS) };
})();
