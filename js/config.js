// W13.Config — every tuning number lives here (values from the design spec).
window.W13 = window.W13 || {};
W13.Config = {
  render: { w: 320, h: 200, fov: 66, hudH: 24 },
  maxDt: 0.05,
  light: { fogStart: 2.5, fogEnd: 9, ambient: 0.0, sideShade: 0.75, flashBoost: 0.55, tileLightMax: 0.4 },
  player: {
    hp: 100, walkSpeed: 2.6, runSpeed: 4.2, radius: 0.25,
    mouseSens: 0.0025, keyTurn: 2.5, doorOpenDist: 1.2, pickupDist: 0.5,
  },
  pickups: {
    health: 25, ammo_pistol: 12, ammo_shells: 6,
    shotgun: { mag: 6, reserve: 12 },
  },
  weapons: {
    pistol: { damage: 34, pellets: 1, spread: 0.5, interval: 0.28, mag: 12, startReserve: 24, reload: 1.1, range: 20, falloffStart: 99 },
    shotgun: { damage: 18, pellets: 7, spread: 6, interval: 0.9, mag: 6, startReserve: 12, reloadPerShell: 0.45, range: 10, falloffStart: 4, falloffSpan: 6, falloffMin: 0.3 },
    noiseRadius: 10, flashTime: 0.08, recoilPx: 6, recoilDecay: 30,
  },
  enemies: {
    shambler: { hp: 100, speed: 0.9, damage: 10, cooldown: 1.0, range: 0.8, scale: 1.0 },
    runner: { hp: 60, speed: 3.0, damage: 7, cooldown: 0.6, range: 0.8, scale: 0.95, windup: 0.5 },
    bloater: { hp: 200, speed: 0.6, damage: 15, cooldown: 1.2, range: 0.9, scale: 1.15, burstDamage: 30, burstRadius: 1.5 },
    boss: {
      hp: 1400, speed: 1.4, damage: 20, cooldown: 1.1, range: 1.2, scale: 1.6,
      phase2At: 0.5, chargeEvery: 3, chargeWindup: 0.7, chargeSpeed: 5, chargeDamage: 25, chargeStun: 1,
      bileEvery: 2.5, bileSpeed: 5, bileDamage: 12, bileTtl: 4,
    },
    sightRange: 8, hurtStagger: 0.15, separation: 0.5, radius: 0.3, animFps: 6,
  },
  // Wave composition (spec §3): 8, 9, 8 = 25 regular zombies.
  waves: [
    ['shambler', 'shambler', 'shambler', 'shambler', 'shambler', 'shambler', 'shambler', 'shambler'],
    ['shambler', 'runner', 'shambler', 'shambler', 'runner', 'shambler', 'shambler', 'runner', 'shambler'],
    ['shambler', 'runner', 'bloater', 'shambler', 'shambler', 'runner', 'bloater', 'shambler'],
  ],
  spawnStagger: [0.6, 1.2],
  stuckTeleportSecs: 20,
  mercyAmmo: { delay: 5, amount: 12 },
  theatreLockClearance: 0.6,
  effects: { flashSecs: 0.25, shakePx: 4, shakeSecs: 0.2, vignetteEdge: 0.35, grain: 12, scanline: 0.8, lowHp: 30 },
  audio: { falloff: 0.35, poolSize: 6, master: 0.8 },
};
