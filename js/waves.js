// W13.Waves — the level script: waves, scripted doors, boss, exit, and anti-soft-lock safety nets.
window.W13 = window.W13 || {};
W13.Waves = (function () {
  const S = {
    stepIndex: 0, waveIndex: -1, exitOpen: false,
    init, reset, update, remaining, debugSkip,
  };
  let queue = [];          // [{type, tag, delay}]
  let spawnT = 0;
  let spawned = {};        // tag -> count spawned
  let bossSpawned = false;
  let mercyT = 0;
  let victorySent = false;

  const msg = (text, secs) => W13.Events.emit('message', { text, secs: secs || 3 });

  // Linear level script (ARCH §9).
  const STEPS = [
    { cond: P => P.zone === 'lobby', act: () => startWave(0) },
    { cond: () => cleared(0), act: () => { W13.Map.openDoor('1'); msg('THE SUPPLY ROOM IS OPEN'); } },
    { cond: P => P.weapons.shotgun.owned, act: () => startWave(1) },
    { cond: () => cleared(1), act: () => { W13.Map.openDoor('2'); msg('THE STAIRWELL IS OPEN'); } },
    { cond: P => P.zone === 'morgue', act: () => startWave(2) },
    { cond: () => cleared(2), act: () => { W13.Map.openDoor('T'); msg('SOMETHING WAITS IN THE THEATRE'); } },
    { cond: P => P.zone === 'theatre' && clearOfDoor(P, 'T'), act: startBoss },
    { cond: () => bossSpawned && W13.Enemies.aliveCount('boss') === 0, act: bossDown },
    { cond: P => P.zone === 'exit', act: victory },
  ];

  function init() { /* level script reads state directly; no subscriptions needed */ }
  function reset() {
    S.stepIndex = 0; S.waveIndex = -1; S.exitOpen = false;
    queue = []; spawnT = 0; spawned = {}; bossSpawned = false; mercyT = 0; victorySent = false;
  }

  function clearOfDoor(P, id) {
    const d = W13.Map.doors[id];
    const need = 0.5 + W13.Config.theatreLockClearance; // Chebyshev distance from the door tile centre
    return Math.max(Math.abs(P.x - (d.x + 0.5)), Math.abs(P.y - (d.y + 0.5))) >= need;
  }
  function cleared(tag) {
    const size = W13.Config.waves[tag].length;
    return !queue.some(q => q.tag === tag) && (spawned[tag] || 0) >= size && W13.Enemies.aliveCount(tag) === 0;
  }

  function startWave(i) {
    S.waveIndex = i;
    const [a, b] = W13.Config.spawnStagger;
    queue = W13.Config.waves[i].map((type, k) => ({ type, tag: i, delay: k === 0 ? 0.3 : a + Math.random() * (b - a) }));
    spawnT = 0;
    W13.Events.emit('wave:start', { index: i });
    msg('WAVE ' + (i + 1));
  }

  function pickSpawn(points, P) {
    const M = W13.Map;
    const hidden = points.filter(p => !M.hasLOS(P.x, P.y, p.x, p.y) && Math.hypot(p.x - P.x, p.y - P.y) > 2.5);
    const pool = hidden.length ? hidden : points.slice().sort((p, q) => Math.hypot(q.x - P.x, q.y - P.y) - Math.hypot(p.x - P.x, p.y - P.y)).slice(0, 1);
    const base = pool[Math.floor(Math.random() * pool.length)];
    // small jitter so stacked spawns don't overlap exactly
    for (let k = 0; k < 6; k++) {
      const x = base.x + (Math.random() - 0.5) * 0.4, y = base.y + (Math.random() - 0.5) * 0.4;
      const free = !M.isSolid(x - 0.3, y - 0.3) && !M.isSolid(x + 0.3, y - 0.3) && !M.isSolid(x - 0.3, y + 0.3) && !M.isSolid(x + 0.3, y + 0.3);
      if (free && (!hidden.length || !M.hasLOS(P.x, P.y, x, y))) return { x, y }; // jitter must stay out of sight
    }
    return { x: base.x, y: base.y };
  }

  function spawnOne(q, P) {
    const pt = pickSpawn(W13.Map.spawns[q.tag], P);
    const e = W13.Enemies.spawn(q.type, pt.x, pt.y, { alerted: true, waveTag: q.tag });
    spawned[q.tag] = (spawned[q.tag] || 0) + 1;
    W13.Events.emit('enemy:spawned', { enemy: e });
  }

  function startBoss() {
    const M = W13.Map;
    M.lockDoor('T');
    S.waveIndex = 3;
    const b = M.bossSpawn;
    const e = W13.Enemies.spawn('boss', b.x, b.y, { alerted: true, waveTag: 'boss' });
    bossSpawned = true;
    W13.Events.emit('enemy:spawned', { enemy: e });
    W13.Events.emit('boss:start', { enemy: e });
    W13.Events.emit('boss:roar', { enemy: e });
    msg('THE STITCHED', 4);
  }
  function bossDown() {
    const M = W13.Map;
    M.openDoor('T');
    M.unlockDoor('X');
    S.exitOpen = true;
    W13.Events.emit('level:exitOpen', {});
    msg('THE GATE IS OPEN. RUN.', 4);
  }
  function victory() {
    if (victorySent) return;
    victorySent = true;
    W13.Events.emit('level:victory', {});
  }

  function update(dt, P) {
    if (!P) return;
    // spawn queue
    if (queue.length) {
      spawnT += dt;
      while (queue.length && spawnT >= queue[0].delay) { spawnT -= queue[0].delay; spawnOne(queue.shift(), P); }
    }
    // script
    const step = STEPS[S.stepIndex];
    if (step && step.cond(P)) { S.stepIndex++; step.act(P); }
    safety(dt, P);
  }

  function safety(dt, P) {
    const M = W13.Map, E = W13.Enemies;
    // stuck enemies → nearest hidden spawn point to the player
    for (const e of E.list) {
      if (e.state === 'dead' || e.type === 'boss' || e.stuckTime <= W13.Config.stuckTeleportSecs) continue;
      const all = [].concat(...M.spawns);
      const hidden = all.filter(p => !M.hasLOS(P.x, P.y, p.x, p.y) && Math.hypot(p.x - P.x, p.y - P.y) > 2.5);
      const pool = hidden.length ? hidden : all;
      pool.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
      e.x = pool[0].x; e.y = pool[0].y; e.stuckTime = 0; e.checkT = 0; e.lastX = e.x; e.lastY = e.y;
    }
    // mercy ammo
    const fighting = queue.length > 0 || E.aliveCount() > 0;
    if (fighting && P.totalAmmo() === 0 && !M.pickups.some(p => p.mercy && !p.taken)) {
      mercyT += dt;
      if (mercyT >= W13.Config.mercyAmmo.delay - 1e-9) {
        mercyT = 0;
        const spot = floorNear(P.x + Math.cos(P.angle) * 1.5, P.y + Math.sin(P.angle) * 1.5, P);
        M.pickups.push({ kind: 'ammo_pistol', x: spot.x, y: spot.y, taken: false, mercy: true });
        msg('SOMETHING RATTLES NEARBY...');
      }
    } else mercyT = 0;
  }

  function floorNear(x, y, P) {
    const M = W13.Map;
    let best = { x: P.x, y: P.y }, bd = 1e9;
    for (let ty = Math.floor(y) - 3; ty <= Math.floor(y) + 3; ty++) for (let tx = Math.floor(x) - 3; tx <= Math.floor(x) + 3; tx++) {
      if (M.isSolid(tx, ty)) continue;
      const cx = tx + 0.5, cy = ty + 0.5;
      if (!M.hasLOS(P.x, P.y, cx, cy)) continue;
      const d = Math.hypot(cx - x, cy - y) + (Math.hypot(cx - P.x, cy - P.y) < 0.8 ? 5 : 0);
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
    return best;
  }

  function remaining() {
    if (S.waveIndex < 0) return 0;
    const tag = S.waveIndex === 3 ? 'boss' : S.waveIndex;
    return queue.filter(q => q.tag === tag).length + W13.Enemies.aliveCount(tag);
  }

  // Debug: finish the current wave instantly.
  function debugSkip() {
    if (S.waveIndex < 0) return;
    const tag = S.waveIndex === 3 ? 'boss' : S.waveIndex;
    const P = W13.Player;
    while (queue.length) spawnOne(queue.shift(), P);
    W13.Enemies.list.filter(e => e.waveTag === tag && e.state !== 'dead').forEach(e => W13.Enemies.damage(e, 1e6));
  }

  return S;
})();
