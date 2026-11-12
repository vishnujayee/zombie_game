// Map validator. CLI: node tests/validate-map.js → "MAP OK" or errors (exit 1).
'use strict';

function validate(W13) {
  const M = W13.Map;
  const errs = [];
  if (M.W !== 32 || M.H !== 32 || M.grid.length !== 32) errs.push('map must be 32x32');
  M.grid.forEach((row, y) => { if (row.length !== 32) errs.push(`row ${y} has length ${row.length}`); });
  if (errs.length) return errs;
  for (let i = 0; i < 32; i++) {
    for (const [x, y] of [[i, 0], [i, 31], [0, i], [31, i]]) {
      const c = M.grid[y][x];
      if (!M.WALLS.includes(c)) errs.push(`border not closed at ${x},${y} ('${c}')`);
    }
  }
  let starts = 0;
  M.grid.forEach(r => { for (const c of r) if (c === 'S') starts++; });
  if (starts !== 1) errs.push(`expected exactly one S, found ${starts}`);
  const isFloor = (x, y) => { const c = M.grid[Math.floor(y)] && M.grid[Math.floor(y)][Math.floor(x)]; return c === '.' || c === 'S'; };
  const pts = [];
  M.spawns.forEach((w, i) => w.forEach(p => pts.push(['spawn' + i, p])));
  pts.push(['bossSpawn', M.bossSpawn]);
  M.pickups.forEach(p => pts.push(['pickup:' + p.kind, p]));
  M.lights.forEach(p => pts.push(['light', p]));
  for (const [n, p] of pts) if (!isFloor(p.x, p.y)) errs.push(`${n} at ${p.x},${p.y} is not on floor`);
  M.spawns.forEach((w, i) => { if (w.length < 4) errs.push(`wave ${i} needs >=4 spawn points`); });
  if (!M.pickups.some(p => p.kind === 'shotgun')) errs.push('no shotgun pickup');
  // BFS from start, doors passable
  const seen = new Set();
  const q = [[Math.floor(M.start.x), Math.floor(M.start.y)]];
  const pass = (x, y) => { const c = M.grid[y][x]; return c === '.' || c === 'S' || M.DOORS.includes(c); };
  while (q.length) {
    const [x, y] = q.shift();
    const k = x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 32 && ny < 32 && pass(nx, ny)) q.push([nx, ny]);
    }
  }
  for (const [id, z] of Object.entries(M.zones)) {
    let reach = false;
    for (let y = z.y0; y <= z.y1 && !reach; y++) for (let x = z.x0; x <= z.x1; x++) if (seen.has(x + ',' + y)) { reach = true; break; }
    if (!reach) errs.push(`zone ${id} unreachable`);
  }
  for (const [n, p] of pts) if (!seen.has(Math.floor(p.x) + ',' + Math.floor(p.y))) errs.push(`${n} at ${p.x},${p.y} unreachable`);
  return errs;
}

module.exports = { validate };

if (require.main === module) {
  const { load } = require('./harness');
  const W = load(['config.js', 'util.js', 'events.js', 'map.js']);
  W.Map.load();
  const errs = validate(W);
  if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
  console.log('MAP OK');
}
