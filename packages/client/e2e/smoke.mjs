// E2E smoke test: serves the production build, boots the game in headless Chromium (WebGL2 via
// SwiftShader), drives real input and asserts on authoritative state exposed by Game.inspect().
// Usage: npm run build && npm run e2e   (screenshots land in e2e-output/)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(process.argv[2] ?? 'packages/client/dist');
const outDir = resolve('e2e-output');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/info') return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"online":false}');
  const p = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!p.startsWith(root)) return void res.writeHead(403).end();
  try {
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
await mkdir(outDir, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures.push(msg);
};

async function session(cls, query, shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?autostart=1&class=${cls}&name=Teste${query}`);
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().tick > 30, null, { timeout: 90000 });
  const s0 = await page.evaluate(() => window.__etherfall.inspect());
  check(s0.me !== null, `[${cls}] player spawned (tick ${s0.tick})`);
  await page.screenshot({ path: join(outDir, `${shots}-spawn.png`) });

  // Movement through real keyboard input.
  await page.mouse.move(900, 360);
  // hold for a fixed number of server ticks (wall time varies a lot under software GL)
  const tHold = await page.evaluate(() => window.__etherfall.inspect().tick);
  await page.keyboard.down('KeyD');
  await page.waitForFunction((t) => window.__etherfall.inspect().tick >= t + 27, tHold, { timeout: 20000 });
  await page.keyboard.up('KeyD');
  const s1 = await page.evaluate(() => window.__etherfall.inspect());
  check(s1.me.x > s0.me.x + 1, `[${cls}] moves with WASD (Δx=${(s1.me.x - s0.me.x).toFixed(2)})`);

  // Attack consumes stamina (server-validated).
  await page.mouse.click(900, 360);
  // stamina drops on the attack's first tick; regen waits 600 ms, so poll briefly (software GL is slow)
  await page.waitForFunction((st) => window.__etherfall.inspect().me.stamina < st, s1.me.stamina, { timeout: 4000 }).catch(() => {});
  const s2 = await page.evaluate(() => window.__etherfall.inspect());
  check(s2.me.stamina < s1.me.stamina, `[${cls}] light attack spends stamina (${s1.me.stamina.toFixed(0)} → ${s2.me.stamina.toFixed(0)})`);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `${shots}-combat.png`) });

  // Dodge
  await page.keyboard.down('KeyS');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(1200);
  const s3 = await page.evaluate(() => window.__etherfall.inspect());
  check(s3.grid3d.cols > 100 && s3.grid3d.rows > 40, `[${cls}] 3D ASCII grid ${s3.grid3d.cols}×${s3.grid3d.rows} (effects layer ${s3.stats.instances} instances)`);
  check(s3.fps > 0, `[${cls}] render loop running (${s3.fps} fps in software GL)`);
  check(errors.length === 0, `[${cls}] no console/page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await page.close();
}

await session('vanguard', '', 'vanguard');
await session('arcanist', '&day=0.34', 'arcanist-night');
await session('vanguard', '&preset=cinematic&day=0.84', 'cinematic-noon');
await session('vanguard', '&preset=mono', 'mono');
await session('healer', '&rain=1', 'healer-rain');
await session('ranger', '', 'ranger');
await session('warlock', '&day=0.34', 'warlock-night');

// Castle crypt portal: standing on it and pressing F moves you into the dungeon.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?autostart=1&class=healer&name=Teste`);
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().tick > 30, null, { timeout: 90000 });
  const target = await page.evaluate(() => {
    const g = window.__etherfall;
    const sim = g.transport.room.sim;
    const me = sim.entities.get(g.transport.playerId);
    const p = sim.world.portals[0];
    me.pos.x = me.prevPos.x = p.x;
    me.pos.y = me.prevPos.y = p.y;
    return { x: p.toX, y: p.toY };
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  // software GL can stall for seconds after a teleport (new area, shader compiles): poll instead of sleeping
  await page.waitForFunction((t) => { const m = window.__etherfall.inspect().me; return m && Math.hypot(m.x - t.x, m.y - t.y) < 2; }, target, { timeout: 12000 }).catch(() => {});
  const s = await page.evaluate(() => window.__etherfall.inspect());
  check(Math.hypot(s.me.x - target.x, s.me.y - target.y) < 2, `[portal] F on the crypt portal enters the dungeon (${s.me.x.toFixed(1)}, ${s.me.y.toFixed(1)})`);
  await page.screenshot({ path: join(outDir, 'crypt.png') });
  check(errors.length === 0, `[portal] no page errors${errors.length ? ': ' + errors[0] : ''}`);
  await page.close();
}

// 0.6: seven playable classes on the title screen
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${port}/`);
  const n = await page.locator('.class-card').count();
  check(n === 7, `[0.6] title screen lists 7 classes (${n})`);
  await page.click('.class-card[data-class=rogue]');
  await page.screenshot({ path: join(outDir, 'title.png') });
  await page.close();
}

// 0.5: 3D actors, sitting at a bonfire, talents + subclass through the real UI.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?autostart=1&class=vanguard&name=Teste&rain=0`);
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().tick > 30, null, { timeout: 90000 });
  const s0 = await page.evaluate(() => window.__etherfall.inspect());
  check(s0.actors3d > 0, `[0.5] 3D actor layer renders rigs (${s0.actors3d})`);
  await page.evaluate(() => {
    const g = window.__etherfall;
    const sim = g.transport.room.sim;
    const me = sim.entities.get(g.transport.playerId);
    const b = sim.world.props.filter((p) => p.kind === 'bonfire').sort((a, c) => Math.hypot(a.x - me.pos.x, a.y - me.pos.y) - Math.hypot(c.x - me.pos.x, c.y - me.pos.y))[0];
    me.pos.x = me.prevPos.x = b.x + 1.7;
    me.pos.y = me.prevPos.y = b.y + 0.4;
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__etherfall.inspect().me?.action === 'sit', null, { timeout: 12000 }).catch(() => {});
  const s1 = await page.evaluate(() => window.__etherfall.inspect());
  check(s1.me.action === 'sit', `[0.5] F at a bonfire sits on a log (action ${s1.me.action})`);
  await page.screenshot({ path: join(outDir, 'sit.png') });
  await page.evaluate(() => {
    const g = window.__etherfall;
    const sim = g.transport.room.sim;
    const me = sim.entities.get(g.transport.playerId);
    while (me.level < 10) sim.grantXp(me, 2000, 'test');
  });
  await page.keyboard.press('KeyK');
  await page.waitForSelector('#talent-vg\\.b1:not([disabled])', { timeout: 5000 });
  await page.click('#talent-vg\\.b1');
  await page.click('#subclass-paladin');
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => {
    const g = window.__etherfall;
    const me = g.transport.room.sim.entities.get(g.transport.playerId);
    return { rank: me.talents['vg.b1'] ?? 0, sub: me.subclass };
  });
  check(t.rank === 1 && t.sub === 'paladin', `[0.5] talent panel allocates a talent and picks a subclass (rank ${t.rank}, ${t.sub})`);
  await page.screenshot({ path: join(outDir, 'talents.png') });
  check(errors.length === 0, `[0.5] no page errors${errors.length ? ': ' + errors[0] : ''}`);
  await page.close();
}

// 0.7: online server — account, character, play, reconnect, offline browser save
{
  const dataDir = await mkdtemp(join(tmpdir(), 'ef-e2e-'));
  const port2 = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['packages/server/dist/server.mjs'], { env: { ...process.env, PORT: String(port2), HOST: '127.0.0.1', ETHERFALL_DATA: join(dataDir, 'accounts.json') }, stdio: 'pipe' });
  let srvOut = '';
  srv.stdout.on('data', (d) => (srvOut += d));
  srv.stderr.on('data', (d) => (srvOut += d));
  for (let i = 0; i < 50 && !srvOut.includes('localhost'); i++) await new Promise((r) => setTimeout(r, 100));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let framesSent = 0;
  let movingSent = 0;
  page.on('websocket', (ws) => ws.on('framesent', (f) => {
    framesSent++;
    if (String(f.payload).includes('"mx":1')) movingSent++;
  }));
  await page.goto(`http://127.0.0.1:${port2}/`);
  await page.waitForSelector('#mode-online', { timeout: 10000 });
  await page.fill('#lobby-user', 'tester');
  await page.fill('#lobby-pass', 'segredo123');
  await page.click('#lobby-register');
  await page.waitForSelector('#lobby-charname', { timeout: 10000 });
  await page.click('.class-card[data-class=warlock]');
  await page.fill('#lobby-charname', 'Morgana');
  await page.click('#lobby-create');
  await page.waitForSelector('button[data-char="Morgana"]', { timeout: 10000 });
  await page.screenshot({ path: join(outDir, 'online-lobby.png') });
  await page.click('button[data-char="Morgana"]');
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().me, null, { timeout: 90000 });
  await page.bringToFront(); // a background tab is throttled (and loses keyboard focus)
  await page.focus('#view');
  const a = await page.evaluate(() => window.__etherfall.inspect());
  check(a.me !== null && a.actors3d >= 1, `[online] logged in and playing as a warlock on the server (tick ${a.tick})`);
  // software GL stalls the page for seconds at a time: hold the key for a generous wall-clock span
  await page.mouse.move(900, 360);
  await page.keyboard.down('KeyD');
  await page.waitForFunction((x0) => window.__etherfall.inspect().me.x > x0 + 1, a.me.x, { timeout: 15000 }).catch(() => {});
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(800);
  const b = await page.evaluate(() => window.__etherfall.inspect());
  const dbg = await page.evaluate(() => ({ active: document.activeElement?.id, held: [...window.__etherfall.input.held].join(',') }));
  check(b.me.x > a.me.x + 0.8, `[online] moves through the server (Δx=${(b.me.x - a.me.x).toFixed(2)}, focus ${dbg.active}, held ${dbg.held}, frames ${framesSent}, moving ${movingSent}, ticks ${a.tick}->${b.tick})`);
  await page.keyboard.down('Digit2');
  await page.waitForTimeout(300);
  await page.keyboard.up('Digit2');
  await page.waitForFunction(() => (window.__etherfall.transport.latest?.entities ?? []).filter((e) => e.enemyId === 'imp').length === 2, null, { timeout: 15000 }).catch(() => {});
  const imps = await page.evaluate(() => (window.__etherfall.transport.latest?.entities ?? []).filter((e) => e.enemyId === 'imp' && e.team === 0).length);
  check(imps === 2, `[online] warlock summons 2 imps (${imps})`);
  await page.screenshot({ path: join(outDir, 'online-play.png') });
  // reload: log in again, the character is listed and resumes at the saved spot
  const bEnd = await page.evaluate(() => window.__etherfall.inspect());
  await page.goto(`http://127.0.0.1:${port2}/`);
  await page.waitForSelector('#lobby-user');
  await page.fill('#lobby-user', 'tester');
  await page.fill('#lobby-pass', 'segredo123');
  await page.click('#lobby-login');
  await page.waitForSelector('button[data-char="Morgana"]', { timeout: 10000 });
  await page.click('button[data-char="Morgana"]');
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().me, null, { timeout: 90000 });
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => window.__etherfall.inspect());
  check(Math.abs(c.me.x - bEnd.me.x) < 1.5, `[online] reconnect resumes the saved position (${c.me.x.toFixed(1)} vs ${bEnd.me.x.toFixed(1)})`);
  check(errors.length === 0, `[online] no page errors${errors.length ? ': ' + errors[0] : ''}`);
  await page.close();
  srv.kill('SIGINT');
  await new Promise((r) => srv.once('exit', r));
  check(/Salvando/.test(srvOut), '[online] server saves characters on shutdown');
}
{
  // offline: the character is kept in the browser and offered on the title screen
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/?autostart=1&class=rogue&name=Sombra`);
  await page.waitForFunction(() => window.__etherfall && window.__etherfall.inspect().tick > 30, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__etherfall;
    const me = g.transport.room.sim.entities.get(g.transport.playerId);
    g.transport.room.sim.grantXp(me, 400, 'test');
  });
  await page.waitForTimeout(300);
  await page.goto(`http://localhost:${port}/`);
  const label = await page.locator('.offline-saves .btn').first().textContent({ timeout: 10000 }).catch(() => '');
  check(/Sombra.*Nv [2-9]/.test(label ?? ''), `[offline] progress saved in the browser (${label})`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll E2E checks passed. Screenshots in e2e-output/');
