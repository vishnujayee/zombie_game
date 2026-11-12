// W13.Enemies — spawning, AI state machine, steering + flow-field pathing, animation, projectiles.
window.W13 = window.W13 || {};
W13.Enemies = (function () {
  const list = [];
  const projectiles = [];
  let nextId = 1;
  let flowT = 0;
  let flow = null;          // Int16Array distance field from the player's tile
  let flowFrom = -1;
  const ANIM = { walk: 4, attack: 2, hurt: 1, death: 4 };
  const cfg = t => W13.Config.enemies[t];
  const E = W13.Config ? W13.Config.enemies : null;

  function init() {
    W13.Events.on('shot', d => {
      const r = W13.Config.weapons.noiseRadius;
      for (const e of list) if (e.state === 'idle' && Math.hypot(e.x - d.x, e.y - d.y) <= r) alert(e);
    });
  }
  function reset() { list.length = 0; projectiles.length = 0; nextId = 1; flow = null; flowFrom = -1; flowT = 0; }

  function spawn(type, x, y, opts) {
    opts = opts || {};
    const c = cfg(type);
    const e = {
      id: nextId++, type, x, y, angle: 0, hp: c.hp, maxHp: c.hp, state: 'idle', stateTime: 0,
      attackCooldown: 0, anim: 'walk', animFrame: 0, animTime: 0, waveTag: opts.waveTag, phase: 1,
      hurtT: 0, flashT: 0, stuckTime: 0, checkT: 0, lastX: x, lastY: y,
      groanT: 2 + Math.random() * 6, chargeT: c.chargeEvery || 0, bileT: c.bileEvery || 0, dirX: 0, dirY: 0, chargeHit: false,
      moving: false, deadT: 0,
    };
    list.push(e);
    if (opts.alerted) alert(e);
    return e;
  }

  function alert(e) {
    if (e.state !== 'idle') return;
    if (e.type === 'runner') { setState(e, 'alert'); W13.Events.emit('runner:screech', { enemy: e }); }
    else setState(e, 'chase');
  }
  function setState(e, s) { e.state = s; e.stateTime = 0; }

  // ---- movement helpers ----
  function blocked(x, y, r) {
    const M = W13.Map;
    return M.isSolid(x - r, y - r) || M.isSolid(x + r, y - r) || M.isSolid(x - r, y + r) || M.isSolid(x + r, y + r);
  }
  // Returns true if any movement happened; sets e.hitWall when an axis was blocked.
  function tryMove(e, dx, dy) {
    const r = W13.Config.enemies.radius;
    let moved = false; e.hitWall = false;
    if (!blocked(e.x + dx, e.y, r)) { e.x += dx; moved = true; } else e.hitWall = true;
    if (!blocked(e.x, e.y + dy, r)) { e.y += dy; moved = true; } else e.hitWall = true;
    if (!moved) {
      const len = Math.hypot(dx, dy);
      for (const rot of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
        const a = Math.atan2(dy, dx) + rot;
        const nx = Math.cos(a) * len, ny = Math.sin(a) * len;
        if (!blocked(e.x + nx, e.y + ny, r)) { e.x += nx; e.y += ny; return true; }
      }
    }
    return moved;
  }

  function buildFlow(P) {
    const M = W13.Map, W = M.W, H = M.H;
    const px = Math.floor(P.x), py = Math.floor(P.y), start = py * W + px;
    if (flow && flowFrom === start && flowT > 0) return;
    flow = flow || new Int16Array(W * H);
    flow.fill(-1);
    flowFrom = start; flowT = 0.4;
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    flow[start] = 0; q[qt++] = start;
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, d = flow[i] + 1;
      const nb = [i - 1, i + 1, i - W, i + W];
      const ok = [x > 0, x < W - 1, y > 0, y < H - 1];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (!ok[k] || flow[j] >= 0 || M.isSolid(j % W, (j / W) | 0)) continue;
        flow[j] = d; q[qt++] = j;
      }
    }
  }
  // Direction to steer: straight at the player with LOS, else toward the best neighbouring tile.
  function steer(e, P) {
    const M = W13.Map;
    if (M.hasLOS(e.x, e.y, P.x, P.y) && clearPath(e, P)) return Math.atan2(P.y - e.y, P.x - e.x);
    if (!flow) return Math.atan2(P.y - e.y, P.x - e.x);
    const W = M.W, ex = Math.floor(e.x), ey = Math.floor(e.y);
    let best = null, bd = flow[ey * W + ex] >= 0 ? flow[ey * W + ex] : 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = ex + dx, ny = ey + dy;
      if (M.isSolid(nx, ny)) continue;
      if (dx && dy && (M.isSolid(ex + dx, ey) || M.isSolid(ex, ey + dy))) continue;
      const d = flow[ny * W + nx];
      if (d >= 0 && d < bd) { bd = d; best = [nx + 0.5, ny + 0.5]; }
    }
    if (!best) return Math.atan2(P.y - e.y, P.x - e.x);
    return Math.atan2(best[1] - e.y, best[0] - e.x);
  }
  // LOS for the body: check both shoulders so wide enemies don't grind on corners.
  function clearPath(e, P) {
    const M = W13.Map, a = Math.atan2(P.y - e.y, P.x - e.x), r = W13.Config.enemies.radius;
    const ox = -Math.sin(a) * r, oy = Math.cos(a) * r;
    return M.hasLOS(e.x + ox, e.y + oy, P.x + ox, P.y + oy) && M.hasLOS(e.x - ox, e.y - oy, P.x - ox, P.y - oy);
  }

  // ---- update ----
  function update(dt, P) {
    if (!P) return;
    flowT -= dt;
    if (list.some(e => e.state !== 'idle' && e.state !== 'dead')) buildFlow(P);
    for (const e of list) updateOne(e, dt, P);
    separate();
    updateProjectiles(dt, P);
  }

  function animate(e, dt) {
    e.animTime += dt;
    const fps = W13.Config.enemies.animFps;
    if (e.anim === 'death') { e.animFrame = Math.min(3, Math.floor(e.animTime * 8)); return; }
    if (e.anim === 'walk') { e.animFrame = e.moving ? Math.floor(e.animTime * fps * (e.type === 'runner' ? 2 : 1)) % 4 : 0; return; }
    e.animFrame = Math.min(ANIM[e.anim] - 1, Math.floor(e.animTime * 7));
  }
  function setAnim(e, a) { if (e.anim !== a) { e.anim = a; e.animTime = 0; e.animFrame = 0; } }

  function updateOne(e, dt, P) {
    const c = cfg(e.type), M = W13.Map;
    e.stateTime += dt; e.flashT -= dt; e.attackCooldown -= dt;
    e.moving = false;
    if (e.state === 'dead') { e.deadT += dt; animate(e, dt); return; }
    const dist = Math.hypot(P.x - e.x, P.y - e.y);
    e.angle = Math.atan2(P.y - e.y, P.x - e.x);
    // groans
    e.groanT -= dt;
    if (e.groanT <= 0) { e.groanT = 4 + Math.random() * 5; if (dist < 10) W13.Events.emit('enemy:groan', { enemy: e }); }
    if (P.dead) { setAnim(e, 'walk'); animate(e, dt); return; }

    if (e.state === 'idle') {
      if (dist <= W13.Config.enemies.sightRange && M.hasLOS(e.x, e.y, P.x, P.y)) alert(e);
    }
    if (e.state === 'alert') {
      if (e.stateTime >= (c.windup || 0)) setState(e, 'chase');
    }
    if (e.state === 'hurt') {
      if (e.stateTime >= W13.Config.enemies.hurtStagger) { setState(e, 'chase'); setAnim(e, 'walk'); }
    }
    if (e.type === 'boss') bossLogic(e, dt, P, dist);

    if (e.state === 'chase') {
      if (dist <= c.range) { setState(e, 'attack'); }
      else {
        const a = steer(e, P), sp = c.speed * dt;
        const step = Math.min(sp, Math.max(0, dist - c.range * 0.8));
        e.moving = tryMove(e, Math.cos(a) * step, Math.sin(a) * step);
        setAnim(e, 'walk');
      }
    }
    if (e.state === 'attack') {
      if (dist > c.range + 0.3) { setState(e, 'chase'); setAnim(e, 'walk'); }
      else if (e.attackCooldown <= 0) {
        e.attackCooldown = c.cooldown;
        setAnim(e, 'attack');
        P.damage(c.damage, e.x, e.y);
      } else if (e.anim === 'attack' && e.animTime > 0.35) setAnim(e, 'walk');
    }
    trackStuck(e, dt, dist);
    animate(e, dt);
  }

  function bossLogic(e, dt, P, dist) {
    const c = cfg('boss'), M = W13.Map;
    if (e.phase === 1 && e.hp < e.maxHp * c.phase2At) {
      e.phase = 2; e.chargeT = 1.0; e.bileT = 1.5;
      W13.Events.emit('boss:phase', { phase: 2, enemy: e });
    }
    if (e.phase !== 2) return;
    if (e.state === 'windup') {
      if (e.stateTime >= c.chargeWindup) {
        const a = Math.atan2(P.y - e.y, P.x - e.x);
        e.dirX = Math.cos(a); e.dirY = Math.sin(a); e.chargeHit = false;
        setState(e, 'charge');
      }
      return;
    }
    if (e.state === 'charge') {
      const sp = c.chargeSpeed * dt;
      const moved = tryMove(e, e.dirX * sp, e.dirY * sp);
      e.moving = true; setAnim(e, 'walk');
      if (!e.chargeHit && Math.hypot(P.x - e.x, P.y - e.y) < 0.9) { e.chargeHit = true; P.damage(c.chargeDamage, e.x, e.y); W13.Events.emit('boss:slam', { enemy: e }); }
      if (e.hitWall || !moved || e.stateTime > 2.5) { setState(e, 'stunned'); W13.Events.emit('boss:slam', { enemy: e }); }
      return;
    }
    if (e.state === 'stunned') {
      setAnim(e, 'hurt');
      if (e.stateTime >= c.chargeStun) { setState(e, 'chase'); setAnim(e, 'walk'); e.chargeT = c.chargeEvery; }
      return;
    }
    if (e.state === 'chase' || e.state === 'attack') {
      e.chargeT -= dt; e.bileT -= dt;
      const los = M.hasLOS(e.x, e.y, P.x, P.y);
      if (e.chargeT <= 0 && los && dist > 2) { setState(e, 'windup'); setAnim(e, 'attack'); W13.Events.emit('boss:roar', { enemy: e }); return; }
      if (e.chargeT <= 0) e.chargeT = 0.5;
      if (e.bileT <= 0 && los) {
        e.bileT = c.bileEvery;
        const a = Math.atan2(P.y - e.y, P.x - e.x);
        projectiles.push({ x: e.x + Math.cos(a) * 0.6, y: e.y + Math.sin(a) * 0.6, vx: Math.cos(a) * c.bileSpeed, vy: Math.sin(a) * c.bileSpeed, damage: c.bileDamage, ttl: c.bileTtl });
        W13.Events.emit('boss:spit', { enemy: e });
      }
    }
  }

  function trackStuck(e, dt, dist) {
    e.checkT += dt;
    if (e.state === 'attack') { e.stuckTime = 0; e.checkT = 0; e.lastX = e.x; e.lastY = e.y; return; }
    if (e.checkT >= 3) {
      const moved = Math.hypot(e.x - e.lastX, e.y - e.lastY);
      if (moved < 0.1 || dist > 12) e.stuckTime += e.checkT; else e.stuckTime = 0;
      e.checkT = 0; e.lastX = e.x; e.lastY = e.y;
    }
  }

  function separate() {
    const s = W13.Config.enemies.separation;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.state === 'dead') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (b.state === 'dead') continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = s * ((cfg(a.type).scale + cfg(b.type).scale) / 2);
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        tryMove(a, -nx * push, -ny * push);
        tryMove(b, nx * push, ny * push);
      }
    }
  }

  function updateProjectiles(dt, P) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.ttl -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ttl <= 0 || W13.Map.isSolid(p.x, p.y)) { projectiles.splice(i, 1); continue; }
      if (!P.dead && Math.hypot(P.x - p.x, P.y - p.y) < 0.4) { P.damage(p.damage, p.x - p.vx, p.y - p.vy); projectiles.splice(i, 1); }
    }
  }

  // ---- combat API ----
  function hitTest(ox, oy, angle, maxDist) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let best = null;
    for (const e of list) {
      if (e.state === 'dead') continue;
      const dx = e.x - ox, dy = e.y - oy;
      const along = dx * ca + dy * sa;
      if (along <= 0 || along > maxDist) continue;
      const lat = Math.abs(-dx * sa + dy * ca);
      if (lat > 0.35 * cfg(e.type).scale) continue;
      if (!best || along < best.dist) best = { enemy: e, dist: along };
    }
    return best;
  }

  function damage(e, n) {
    if (!e || e.state === 'dead' || n <= 0) return;
    e.hp -= n; e.flashT = 0.06;
    if (e.state === 'idle') alert(e);
    W13.Events.emit('enemy:hurt', { enemy: e, amount: n });
    if (e.hp <= 0) { kill(e); return; }
    if (e.type !== 'boss' && e.state !== 'alert') { setState(e, 'hurt'); setAnim(e, 'hurt'); }
  }

  function kill(e) {
    e.hp = 0; setState(e, 'dead'); setAnim(e, 'death');
    if (W13.Player && W13.Player.stats) W13.Player.stats.kills++;
    W13.Events.emit('enemy:died', { enemy: e });
    if (e.type === 'bloater') {
      const c = cfg('bloater'), P = W13.Player;
      if (P && Math.hypot(P.x - e.x, P.y - e.y) <= c.burstRadius) P.damage(c.burstDamage, e.x, e.y);
      for (const o of list) if (o !== e && o.state !== 'dead' && Math.hypot(o.x - e.x, o.y - e.y) <= c.burstRadius) damage(o, c.burstDamage);
    }
  }

  function aliveCount(tag) {
    let n = 0;
    for (const e of list) if (e.state !== 'dead' && (tag === undefined || e.waveTag === tag)) n++;
    return n;
  }

  function spritesForRender() {
    const T = W13.Textures, out = [];
    for (const e of list) {
      const img = T.sprite(e.type, e.anim, e.animFrame);
      out.push({ x: e.x, y: e.y, img, scale: cfg(e.type).scale, tint: e.flashT > 0 ? 0.6 : 0 });
    }
    for (const p of projectiles) out.push({ x: p.x, y: p.y, img: T.sprite('bile'), scale: 0.35, lift: 0.35, bright: true });
    return out;
  }

  void E;
  return { list, projectiles, init, reset, spawn, update, hitTest, damage, aliveCount, spritesForRender, alert };
})();
