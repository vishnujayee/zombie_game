// End-to-end test: headless Chromium on file://index.html. Prints "E2E OK" on success.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.E2E_OUT || path.join(ROOT, 'tests', 'screenshots');
const DSF = Number(process.env.E2E_DSF || 1);
const URL = 'file://' + path.join(ROOT, 'index.html');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: DSF });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const shot = async name => page.screenshot({ path: path.join(OUT, name + '.png') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const waitFor = async (fn, arg, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(fn, arg)) return true; await wait(100); }
    return false;
  };
  const scenario = process.argv[2] || 'full';
  try {
    await page.goto(URL + (scenario === 'smoke' ? '' : '?debug=1'));
    await wait(1200);
    await shot('01-title');
    assert(await ev(() => W13.Game.state) === 'TITLE', 'starts on TITLE');
    await page.mouse.click(480, 300);
    await wait(1200);
    assert(await ev(() => W13.Game.state) === 'PLAYING', 'click → PLAYING');
    await shot('02-reception');

    if (scenario !== 'smoke') {
      await ev(() => { W13.Game.debug.god = true; });
      // Wave 1 (lobby)
      await ev(() => W13.Game.debug.teleport('lobby'));
      assert(await waitFor(() => W13.Waves.waveIndex === 0), 'lobby starts wave 0');
      await wait(2500);
      await shot('03-lobby-wave1');
      await ev(() => W13.Game.debug.skipWave());
      assert(await waitFor(() => W13.Map.doors['1'].open), 'door 1 opens after wave 0');
      // Shotgun → wave 2
      await ev(() => { const s = W13.Map.pickups.find(p => p.kind === 'shotgun'); W13.Game.debug.teleportTo(s.x, s.y); });
      assert(await waitFor(() => W13.Waves.waveIndex === 1), 'shotgun starts wave 1');
      assert(await ev(() => W13.Player.weapons.shotgun.owned), 'shotgun owned');
      await ev(() => W13.Game.debug.teleport('east'));
      await wait(2500);
      await shot('04-east-wave2');
      await ev(() => W13.Game.debug.skipWave());
      assert(await waitFor(() => W13.Map.doors['2'].open), 'door 2 opens after wave 1');
      // Morgue → wave 3
      await ev(() => W13.Game.debug.teleport('morgue'));
      assert(await waitFor(() => W13.Waves.waveIndex === 2), 'morgue starts wave 2');
      await wait(2500);
      await shot('05-morgue-wave3');
      await ev(() => W13.Game.debug.skipWave());
      assert(await waitFor(() => W13.Map.doors['T'].open), 'theatre door opens after wave 2');
      // Boss
      await ev(() => { W13.Game.debug.teleportTo(15.5, 5.5); W13.Player.angle = Math.PI; });
      assert(await waitFor(() => W13.Waves.waveIndex === 3 && W13.Enemies.list.some(e => e.type === 'boss')), 'boss spawned');
      assert(await ev(() => !W13.Map.doors['T'].open), 'theatre locked');
      await ev(() => { const b = W13.Enemies.list.find(e => e.type === 'boss'); W13.Enemies.damage(b, 800); W13.Player.angle = Math.atan2(b.y - W13.Player.y, b.x - W13.Player.x); });
      await wait(1500);
      await shot('06-theatre-boss-phase2');
      await ev(() => W13.Game.debug.killAll());
      assert(await waitFor(() => W13.Waves.exitOpen), 'exit opens after boss');
      await ev(() => W13.Game.debug.teleport('exit'));
      assert(await waitFor(() => W13.Game.state === 'VICTORY'), 'reaches VICTORY');
      await wait(1200);
      await shot('07-victory');
      // Restart → death → restart
      await page.mouse.click(480, 300);
      assert(await waitFor(() => W13.Game.state === 'PLAYING'), 'victory click restarts');
      await ev(() => W13.Game.debug.forceDeath());
      assert(await waitFor(() => W13.Game.state === 'DEAD'), 'forced death → DEAD');
      await wait(1500);
      await shot('08-dead');
      await page.mouse.click(480, 300);
      assert(await waitFor(() => W13.Game.state === 'PLAYING'), 'dead click restarts');
      assert(await ev(() => W13.Player.hp === 100 && W13.Waves.waveIndex === -1), 'restart resets hp/wave');
    }
    assert(errors.length === 0, 'console errors:\n' + errors.join('\n'));
    console.log('E2E OK (' + scenario + ')');
  } catch (e) {
    await shot('zz-failure').catch(() => {});
    console.log('E2E FAIL: ' + e.message);
    if (errors.length) console.log('console errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
