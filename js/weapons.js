// W13.Weapons — pistol & shotgun: fire timing, ammo, reload, hitscan, view-model.
window.W13 = window.W13 || {};
W13.Weapons = (function () {
  const state = { name: 'pistol', cooldown: 0, reloading: false, reloadT: 0, frame: 'idle', recoil: 0, flashT: 0, frameT: 0, emptyT: 0 };
  const cfg = n => W13.Config.weapons[n];

  function init() { /* no subscriptions */ }
  function reset() {
    state.name = 'pistol'; state.cooldown = 0; state.reloading = false; state.reloadT = 0;
    state.frame = 'idle'; state.recoil = 0; state.flashT = 0; state.frameT = 0; state.emptyT = 0;
  }

  function switchTo(name, P) {
    P = P || W13.Player;
    if (!P.weapons[name] || !P.weapons[name].owned || P.current === name) return false;
    P.current = name;
    sync(P);
    return true;
  }
  function sync(P) {
    if (state.name !== P.current) { state.name = P.current; state.reloading = false; state.cooldown = Math.max(state.cooldown, 0.25); }
  }

  function startReload(P) {
    const w = P.weapons[state.name], c = cfg(state.name);
    if (state.reloading || w.reserve <= 0 || w.mag >= c.mag) return false;
    state.reloading = true;
    state.reloadT = state.name === 'shotgun' ? c.reloadPerShell : c.reload;
    W13.Events.emit('weapon:reload', { weapon: state.name });
    return true;
  }

  function update(dt, input, P) {
    if (!P || P.dead) return;
    sync(P); // external weapon change (e.g. shotgun pickup) starts the switch delay first
    state.cooldown -= dt; state.flashT -= dt; state.emptyT -= dt;
    state.recoil = Math.max(0, state.recoil - cfg('recoilDecay') * dt);
    state.frameT += dt;
    // weapon selection
    let sel = input.weapon;
    if (W13.Input && W13.Input.consumeWeapon) sel = W13.Input.consumeWeapon() || sel;
    if (sel === 1) switchTo('pistol', P);
    if (sel === 2) switchTo('shotgun', P);
    sync(P);
    const w = P.weapons[state.name], c = cfg(state.name);
    // a click latched between frames counts as one trigger pull
    let fire = !!input.fire;
    if (input.firePressed && state.cooldown <= 0) { fire = true; input.firePressed = false; }
    // reloading
    if (state.reloading) {
      if (state.name === 'shotgun' && fire && w.mag > 0) {
        state.reloading = false; // firing interrupts a shell-by-shell reload
      } else {
        state.reloadT -= dt;
        if (state.reloadT <= 0) {
          if (state.name === 'shotgun') {
            w.mag++; w.reserve--;
            if (w.mag < c.mag && w.reserve > 0) state.reloadT += c.reloadPerShell; else state.reloading = false;
          } else {
            const n = Math.min(c.mag - w.mag, w.reserve);
            w.mag += n; w.reserve -= n; state.reloading = false;
          }
        }
      }
    }
    if (input.reload && !state.reloading) startReload(P);
    // firing
    if (fire && !state.reloading && state.cooldown <= 0) {
      if (w.mag > 0) {
        fireOnce(P);
        state.cooldown = c.interval;
        if (w.mag === 0 && w.reserve > 0) startReload(P);
      } else if (w.reserve > 0) {
        startReload(P);
      } else if (state.emptyT <= 0) {
        state.emptyT = 0.4;
        W13.Events.emit('weapon:empty', { weapon: state.name });
      }
    }
    // frame selection
    if (state.flashT > 0) state.frame = 'fire';
    else if (state.reloading) state.frame = Math.floor(state.frameT * 6) % 2 ? 'reload2' : 'reload1';
    else state.frame = 'idle';
  }

  function fireOnce(P) {
    const name = state.name, c = cfg(name), w = P.weapons[name];
    const M = W13.Map, E = W13.Enemies, deg = Math.PI / 180;
    w.mag--;
    P.stats.shots++;
    const dmgBy = new Map();
    const hits = [];
    for (let i = 0; i < c.pellets; i++) {
      const a = P.angle + (Math.random() * 2 - 1) * c.spread * deg;
      const wall = M.castRay(P.x, P.y, a, c.range).dist;
      const h = E && E.hitTest ? E.hitTest(P.x, P.y, a, Math.min(wall, c.range)) : null;
      if (!h || !(h.dist < wall) || h.dist > c.range) continue;
      let dmg = c.damage;
      if (h.dist > c.falloffStart) dmg *= Math.max(c.falloffMin, 1 - (h.dist - c.falloffStart) / c.falloffSpan);
      dmgBy.set(h.enemy, (dmgBy.get(h.enemy) || 0) + dmg);
      hits.push({ enemy: h.enemy, dist: h.dist, damage: dmg });
    }
    if (hits.length) P.stats.hits++;
    dmgBy.forEach((d, e) => E.damage(e, Math.round(d)));
    state.flashT = cfg('flashTime') || 0.08;
    state.recoil = W13.Config.weapons.recoilPx;
    state.frameT = 0;
    W13.Events.emit('shot', { weapon: name, x: P.x, y: P.y });
    return hits;
  }

  function drawViewModel(buf) {
    const P = W13.Player, T = W13.Textures;
    if (!P || !T || !T.weapon) return;
    const img = T.weapon(state.name, state.frame);
    const ph = P.walkPhase || 0;
    const bobX = P.moving ? Math.sin(ph) * 3 : 0;
    const bobY = P.moving ? Math.abs(Math.cos(ph)) * 2 : 0;
    const reloadDip = state.reloading ? 10 : 0;
    const light = 0.62 + (state.flashT > 0 ? 0.38 : 0) + W13.Map.tileLight(P.x, P.y, W13.Game ? W13.Game.time : 0) * 0.5;
    W13.Raycaster.drawViewModel(buf, img, bobX, bobY + reloadDip, state.recoil, Math.min(1, light));
  }

  return { state, init, reset, update, switchTo, fireOnce, drawViewModel };
})();
