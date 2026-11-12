// W13.Player — position, movement + collision, health, inventory, pickups, zones.
window.W13 = window.W13 || {};
W13.Player = (function () {
  const P = {
    x: 0, y: 0, angle: 0, hp: 100, dead: false, zone: null, current: 'pistol',
    weapons: null, stats: null, moving: false, walkPhase: 0,
    init, reset, update, damage, heal, addAmmo, totalAmmo,
  };
  let stepAcc = 0;
  const god = () => !!(W13.Game && W13.Game.debug && W13.Game.debug.god);
  const noclip = () => !!(W13.Game && W13.Game.debug && W13.Game.debug.noclip);

  function init() { /* no subscriptions needed */ }

  function reset() {
    const C = W13.Config, M = W13.Map;
    P.x = M.start.x; P.y = M.start.y; P.angle = M.start.angle;
    P.hp = C.player.hp; P.dead = false; P.zone = null; P.current = 'pistol';
    P.weapons = {
      pistol: { owned: true, mag: C.weapons.pistol.mag, reserve: C.weapons.pistol.startReserve },
      shotgun: { owned: false, mag: 0, reserve: 0 },
    };
    P.stats = { shots: 0, hits: 0, kills: 0, time: 0 };
    P.moving = false; P.walkPhase = 0; stepAcc = 0;
  }

  function blocked(x, y) {
    if (noclip()) return false;
    const r = W13.Config.player.radius, M = W13.Map;
    return M.isSolid(x - r, y - r) || M.isSolid(x + r, y - r) || M.isSolid(x - r, y + r) || M.isSolid(x + r, y + r);
  }

  function update(dt, input) {
    if (P.dead) return;
    const C = W13.Config.player, M = W13.Map;
    // turning
    let turn = (input.turn || 0) * C.keyTurn * dt;
    if (W13.Input && W13.Input.consumeMouseDX) turn += W13.Input.consumeMouseDX() * C.mouseSens;
    P.angle = W13.Util.normAngle(P.angle + turn);
    // movement
    let f = input.forward || 0, s = input.strafe || 0;
    const len = Math.hypot(f, s);
    P.moving = len > 0;
    if (len > 0) {
      f /= len; s /= len;
      const speed = (input.run ? C.runSpeed : C.walkSpeed) * dt;
      const ca = Math.cos(P.angle), sa = Math.sin(P.angle);
      const dx = (ca * f - sa * s) * speed;
      const dy = (sa * f + ca * s) * speed;
      if (!blocked(P.x + dx, P.y)) P.x += dx;
      if (!blocked(P.x, P.y + dy)) P.y += dy;
      P.walkPhase += speed * 3.2;
      stepAcc += speed;
      if (stepAcc > (input.run ? 0.75 : 0.6)) { stepAcc = 0; W13.Events.emit('footstep', { x: P.x, y: P.y }); }
    }
    // auto doors (and the exit gate once unlocked)
    for (const id in M.doors) {
      const d = M.doors[id];
      if (d.open || d.locked) continue;
      if (d.ch !== 'D' && d.ch !== 'X') continue;
      if (Math.hypot(d.x + 0.5 - P.x, d.y + 0.5 - P.y) < C.doorOpenDist) M.openDoor(id);
    }
    // pickups
    for (const p of M.pickups) {
      if (p.taken || Math.hypot(p.x - P.x, p.y - P.y) > C.pickupDist) continue;
      take(p);
    }
    // zones
    const z = M.zoneAt(P.x, P.y);
    if (z && z !== P.zone) { P.zone = z; W13.Events.emit('zone:enter', { zone: z }); }
  }

  function take(p) {
    const K = W13.Config.pickups;
    let amount = 0;
    switch (p.kind) {
      case 'health':
        if (P.hp >= W13.Config.player.hp) return;
        amount = heal(K.health); break;
      case 'ammo_pistol': amount = K.ammo_pistol; addAmmo('pistol', amount); break;
      case 'ammo_shells': amount = K.ammo_shells; addAmmo('shotgun', amount); break;
      case 'shotgun': {
        const sg = P.weapons.shotgun;
        sg.owned = true; sg.mag = K.shotgun.mag; sg.reserve += K.shotgun.reserve;
        P.current = 'shotgun'; amount = 1; break;
      }
      default: return;
    }
    p.taken = true;
    W13.Events.emit('pickup', { kind: p.kind, amount, x: p.x, y: p.y });
  }

  function damage(n, fromX, fromY) {
    if (P.dead || god() || n <= 0) return;
    P.hp = Math.max(0, P.hp - n);
    const fromAngle = Math.atan2(fromY - P.y, fromX - P.x);
    W13.Events.emit('player:hurt', { amount: n, fromAngle });
    if (P.hp <= 0) { P.dead = true; W13.Events.emit('player:died', {}); }
  }
  function heal(n) { const before = P.hp; P.hp = Math.min(W13.Config.player.hp, P.hp + n); return P.hp - before; }
  function addAmmo(type, n) { P.weapons[type].reserve += n; }
  function totalAmmo() {
    const w = P.weapons; let t = w.pistol.mag + w.pistol.reserve;
    if (w.shotgun.owned) t += w.shotgun.mag + w.shotgun.reserve;
    return t;
  }

  return P;
})();
