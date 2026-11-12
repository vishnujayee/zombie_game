// W13.Map — Ward 13 level grid, doors, zones, spawns, pickups, lights, ray casting.
window.W13 = window.W13 || {};
W13.Map = (function () {
  // Legend: . floor, S start, # tile, B blood tile, C concrete, P padded, M morgue,
  // D auto door, 1/2 scripted doors, T theatre door, X exit gate.
  const GRID = [
    'CCCCCCCCCC#########MMMMMMMMMMMMM',
    'CCCCCCCCCC#########............M',
    'C..C......#.......#............M',
    'C..C......#.......#..M..M..M...M',
    'C..C......#..B.B..#..M..M..M...M',
    'C..1......#.......T............M',
    'C..C......#.......#............M',
    'C..C......#..B.B..#..M..M..M...M',
    'C..CCCCCCC#.......#............M',
    'C..CCCCCCC#.......#............M',
    'C..CCCCCCC##CCXCCC#MMMMMMMMM...M',
    'C..CCCCCCCCCC....C#########C...C',
    'C..CCCCCCCCCC....C#########C...C',
    'C..CCCCCCCCCC....C#########C...C',
    'C..CCCCCCCCCCCCCCC#########C...C',
    '#...........###############C...C',
    '#...........###############C...C',
    '#...........BBBBBBBBBBBBBBBC...C',
    '#...#...#...BBBBBBBBBBBBBBBC...C',
    '#...........B..............C...C',
    '#...........D..............2...C',
    '#...#...#...B..............C...C',
    '#...........BPPDPPPPDPPPPDPCCCCC',
    '#...........BP....P....P...P####',
    '#...........BP....P....P...P####',
    '####D#######BP....P....P...P####',
    '#.......####BP....P....P...P####',
    '#.......####BP....P....P...P####',
    '#...S...####BP....P....P...P####',
    '#.......####BP....P....P...P####',
    '#.......####BPPPPPPPPPPPPPPP####',
    '############BBBBBBBBBBBBBBBB####',
  ];
  const W = 32, H = 32;
  const WALLS = '#BCPM';
  const DOORS = 'D12TX';
  const TEX = { '#': 'TILE', B: 'TILE_BLOOD', C: 'CONCRETE', P: 'PADDED', M: 'MORGUE', D: 'METAL_DOOR', 1: 'METAL_DOOR', 2: 'METAL_DOOR', T: 'THEATRE_DOOR' };

  const ZONES = {
    reception: { x0: 1, y0: 26, x1: 7, y1: 30 },
    lobby: { x0: 1, y0: 15, x1: 11, y1: 24 },
    west: { x0: 1, y0: 2, x1: 2, y1: 14 },
    supply: { x0: 4, y0: 2, x1: 9, y1: 7 },
    east: { x0: 13, y0: 19, x1: 26, y1: 29 },
    stairs: { x0: 28, y0: 10, x1: 30, y1: 21 },
    morgue: { x0: 19, y0: 1, x1: 30, y1: 9 },
    theatre: { x0: 11, y0: 2, x1: 17, y1: 9 },
    exit: { x0: 13, y0: 11, x1: 16, y1: 13 },
  };
  const p = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
  const SPAWNS = [
    [p(1, 3), p(2, 7), p(10, 15), p(10, 23), p(1, 16), p(6, 15)],
    [p(15, 27), p(20, 27), p(25, 27), p(16, 24), p(21, 24), p(25, 24), p(25, 19), p(25, 21)],
    [p(19, 1), p(22, 8), p(26, 1), p(30, 2), p(23, 5), p(19, 6)],
  ];
  const BOSS_SPAWN = p(14, 2);
  const PICKUPS = [
    ['shotgun', 7, 4], ['ammo_shells', 8, 6],
    ['health', 2, 12], ['health', 10, 19], ['health', 14, 20], ['health', 29, 15], ['health', 29, 7], ['health', 5, 6],
    ['ammo_pistol', 6, 27], ['ammo_pistol', 1, 9], ['ammo_pistol', 6, 23], ['ammo_pistol', 2, 16],
    ['ammo_shells', 16, 28], ['ammo_pistol', 21, 28], ['ammo_shells', 29, 12], ['ammo_shells', 20, 8],
  ];
  const LIGHTS = [
    [4, 27, true], [6, 19, false], [1, 8, true], [6, 4, false], [16, 20, true], [23, 20, false],
    [20, 26, true], [29, 16, true], [25, 5, true], [14, 5, false, true], [14, 12, false],
  ];
  const LIGHT_R = 2.6;

  let grid = GRID.slice();
  const doors = {};
  const pickups = [];
  const lights = LIGHTS.map(([x, y, flicker, boss]) => ({ x: x + 0.5, y: y + 0.5, flicker: !!flicker, boss: !!boss }));
  // per-tile light contributions [steady, flicker]
  const lightSteady = new Float32Array(W * H);
  const lightFlicker = new Float32Array(W * H);
  let doorAt = {};

  function computeLights() {
    const max = (W13.Config && W13.Config.light.tileLightMax) || 0.4;
    lightSteady.fill(0); lightFlicker.fill(0);
    for (const L of lights) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y);
        if (d >= LIGHT_R) continue;
        const v = max * (1 - d / LIGHT_R);
        if (L.flicker) lightFlicker[y * W + x] += v; else lightSteady[y * W + x] += v;
      }
    }
  }

  function load() {
    grid = GRID.slice();
    for (const k in doors) delete doors[k];
    doorAt = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (DOORS.indexOf(c) < 0) continue;
      const id = c === 'D' ? 'D@' + x + ',' + y : c;
      doors[id] = { id, x, y, ch: c, open: false, locked: c !== 'D' };
      doorAt[x + ',' + y] = doors[id];
    }
    pickups.length = 0;
    for (const [kind, x, y] of PICKUPS) pickups.push({ kind, x: x + 0.5, y: y + 0.5, taken: false });
    computeLights();
    for (let y = 0; y < H; y++) { const i = grid[y].indexOf('S'); if (i >= 0) { api.start = { x: i + 0.5, y: y + 0.5, angle: -Math.PI / 2 }; } }
  }

  function tileAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return '#';
    return grid[y][x];
  }
  function doorAtTile(x, y) { return doorAt[Math.floor(x) + ',' + Math.floor(y)] || null; }
  function isSolid(x, y) {
    const c = tileAt(x, y);
    if (c === '.' || c === 'S') return false;
    if (DOORS.indexOf(c) >= 0) return !doorAtTile(x, y).open;
    return true;
  }
  function wallTex(x, y) {
    const c = tileAt(x, y);
    if (c === 'X') return doorAtTile(x, y).locked ? 'EXIT_GATE' : 'EXIT_GATE_OPEN';
    return TEX[c] || 'TILE';
  }
  function openDoor(id) { const d = doors[id]; if (!d || d.open) return; d.open = true; d.locked = false; if (W13.Events) W13.Events.emit('door:open', { id, x: d.x + 0.5, y: d.y + 0.5 }); }
  function lockDoor(id) { const d = doors[id]; if (!d) return; d.open = false; d.locked = true; if (W13.Events) W13.Events.emit('door:lock', { id, x: d.x + 0.5, y: d.y + 0.5 }); }
  function unlockDoor(id) { const d = doors[id]; if (d) d.locked = false; }

  function zoneAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    for (const id in ZONES) { const z = ZONES[id]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return id; }
    return null;
  }

  function flickerFactor(t, seed) {
    const step = Math.floor(t * 14 + seed * 7);
    const h = Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453;
    const r = h - Math.floor(h);
    return r < 0.12 ? 0.1 : r < 0.2 ? 0.55 : 1;
  }
  function tileLight(x, y, t) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const i = y * W + x;
    return lightSteady[i] + lightFlicker[i] * flickerFactor(t || 0, (x * 7 + y * 3) % 5);
  }

  // DDA ray cast. Distance is Euclidean along the ray.
  function castRay(ox, oy, angle, maxDist) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let mapX = Math.floor(ox), mapY = Math.floor(oy);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let stepX, stepY, sideX, sideY;
    if (dx < 0) { stepX = -1; sideX = (ox - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - ox) * ddx; }
    if (dy < 0) { stepY = -1; sideY = (oy - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - oy) * ddy; }
    let side = 0, dist = 0;
    for (let i = 0; i < 128; i++) {
      if (sideX < sideY) { dist = sideX; sideX += ddx; mapX += stepX; side = 0; }
      else { dist = sideY; sideY += ddy; mapY += stepY; side = 1; }
      if (dist > maxDist) return { dist: maxDist, tile: null, side, texX: 0, mapX, mapY };
      if (isSolid(mapX, mapY)) {
        let wallX = side === 0 ? oy + dist * dy : ox + dist * dx;
        wallX -= Math.floor(wallX);
        if ((side === 0 && dx < 0) || (side === 1 && dy > 0)) wallX = 1 - wallX;
        return { dist, tile: tileAt(mapX, mapY), side, texX: wallX, mapX, mapY };
      }
    }
    return { dist: maxDist, tile: null, side, texX: 0, mapX, mapY };
  }

  function hasLOS(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1e-6) return true;
    return castRay(ax, ay, Math.atan2(by - ay, bx - ax), d).dist >= d - 1e-9;
  }

  const api = {
    W, H, WALLS, DOORS, zones: ZONES, spawns: SPAWNS, bossSpawn: BOSS_SPAWN,
    doors, pickups, lights, start: { x: 4.5, y: 28.5, angle: -Math.PI / 2 },
    get grid() { return grid; },
    load, reset: load, tileAt, isSolid, wallTex, doorAtTile, openDoor, lockDoor, unlockDoor,
    zoneAt, tileLight, castRay, hasLOS,
  };
  return api;
})();
