// v1.79: offline service worker, CSP, self-hosted import libraries, restore confirmation, exercise delete guard, Today
// previews without Last. Serves the repo over http://localhost (a service worker needs a secure origin).
// PLAYWRIGHT=/path/to/playwright node test/v179.js (after tools/build.sh)
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html')); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(0);
  const base = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13 Pro Max'] }), p = await ctx.newPage(), errs = [], csp = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/Content.Security.Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  await ctx.route(/^https:\/\/(fonts\.|api\.github)/, r => r.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*' } }));
  await p.goto(base); await p.waitForFunction(() => typeof render === 'function');

  // CSP: the page's own scripts run, GitHub is reachable, an unknown host is refused
  ok(await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'CSP meta present');
  ok(await p.evaluate(() => fetch('https://api.github.com/zen').then(() => true, () => false)), 'CSP allows api.github.com');
  ok(await p.evaluate(() => fetch('https://evil.example.com/x').then(() => false, () => true)), 'CSP blocks other hosts');
  ok(await p.evaluate(() => new Promise(res => { const i = new Image(); i.onload = () => res(false); i.onerror = () => res(true); i.src = 'https://evil.example.com/p.gif'; })), 'CSP blocks image beacons');

  // vendor libraries load from this origin under the CSP, and an xlsx round-trips through the MacroFactor reader
  const mf = await p.evaluate(async () => {
    const XLSX = await loadLib('xlsx'), JSZip = await loadLib('jszip');
    const ws = XLSX.utils.aoa_to_sheet([['Date', 'Calories (kcal)', 'Protein (g)', 'Weight (kg)'], ['2026-11-01', 2600, 190, 92.1]]), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Nutrition');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), f = new File([buf], 'mf.xlsx');
    const z = new JSZip(); z.file('physiological_cycles.csv', 'Cycle start time,Recovery score %,Heart rate variability (ms),Wake onset\n2026-11-01 22:00:00,71,80,2026-11-02 06:00:00\n');
    const zf = new File([await z.generateAsync({ type: 'blob' })], 'whoop.zip', { type: 'application/zip' });
    const a = await readMfFiles([f]), w = await readWhoopFiles([zf]);
    return { src: [...document.scripts].map(s => s.src).filter(Boolean), kcal: a.days['2026-11-01']?.kcal, rec: w.days['2026-11-02']?.rec };
  });
  ok(mf.src.length === 2 && mf.src.every(s => s.startsWith(base + 'vendor/')), 'libraries load from vendor/: ' + mf.src.join(', '));
  ok(mf.kcal === 2600 && mf.rec === 71, 'MacroFactor xlsx and WHOOP zip still import');

  // Today: preview shows Aim and Best, never Last
  await p.evaluate(() => { const t = today(); order().forEach((sid, i) => { const d = addDays(t, -8 + i), w = newWorkout(d, sid); w.ex.forEach(e => e.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.fin = true; STATE.w[d] = w; }); bump(); ui.todayEx = true; go('today'); });
  const lt = await p.$$eval('.exlist .lt', es => es.map(e => e.textContent).join(' | '));
  ok(lt && !/Last/.test(lt) && /Best/.test(lt) && /Aim/.test(lt), 'Today preview: Aim and Best, no Last: ' + lt.slice(0, 120));

  // Delete exercise: not offered for a logged lift; two taps for an unlogged one not in the Plan
  await p.evaluate(() => { go('plan'); ui.planTab = 'exercises'; ui.editEx = 'incline_db'; S().prog.sessions.push1.items = S().prog.sessions.push1.items.filter(i => i.ex !== 'incline_db'); render(true); });
  ok(!(await p.$('[data-act="delex"]')) && /logged session/.test(await p.textContent('#view')), 'logged lift: no Delete, says why');
  await p.evaluate(() => { ui.editEx = 'seated_curl'; render(true); });
  await p.click('[data-act="delex"]');
  ok(await p.evaluate(() => !!S().ex.seated_curl) && /Tap again/.test(await p.textContent('[data-act="delex"]')), 'first tap only asks');
  await p.click('[data-act="delex"]');
  ok(await p.evaluate(() => !S().ex.seated_curl), 'second tap deletes an unlogged lift');

  // Restore: picking a file previews; nothing changes until Restore
  const before = await p.evaluate(() => { const t = today(); for (const n of [1, 3]) { const d = addDays(t, -n), w = newWorkout(d, 'pull'); w.ex[0].sets[0] = { w: 50, r: 8, done: true }; w.fin = true; STATE.w[d] = w; } bump(); return Object.keys(STATE.w).length; });
  const bk = await p.evaluate(() => { const o = JSON.parse(exportJson()); const t = today(); for (const k of Object.keys(o.workouts)) if (k > addDays(t, -2)) delete o.workouts[k]; o.exportedAt = addDays(t, -2) + 'T09:00:00Z'; return JSON.stringify(o); });
  await p.evaluate(() => go('data'));
  await p.setInputFiles('#f_backup', { name: 'orbit-backup.json', mimeType: 'application/json', buffer: Buffer.from(bk) });
  await p.waitForSelector('#restorebox');
  const box = await p.textContent('#restorebox');
  ok(/lose 1 session/.test(box), 'preview warns about sessions logged after the backup: ' + box.replace(/\s+/g, ' ').slice(0, 160));
  ok(await p.evaluate(() => Object.keys(STATE.w).length) === before, 'nothing changed before Restore');
  await p.click('[data-act="restorecancel"]');
  ok(!(await p.$('#restorebox')) && await p.evaluate(() => Object.keys(STATE.w).length) === before, 'Cancel keeps everything');
  await p.setInputFiles('#f_backup', { name: 'orbit-backup.json', mimeType: 'application/json', buffer: Buffer.from(bk) });
  await p.waitForSelector('#restorebox'); await p.click('[data-act="restoredo"]');
  ok(await p.evaluate(() => Object.keys(STATE.w).length) === before - 1, 'Restore applies the backup');
  await p.evaluate(() => go('data'));
  await p.setInputFiles('#f_backup', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await p.waitForTimeout(100);
  ok(!(await p.$('#restorebox')) && /isn’t an Orbit backup/.test(await p.textContent('#toast')), 'a non-backup file is refused before any preview');

  // Offline: register the worker (the page only does it on https), reload offline, the app still opens
  await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.reload(); await p.waitForFunction(() => typeof render === 'function');
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await p.evaluate(() => loadLib('jszip'));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForFunction(() => typeof render === 'function', null, { timeout: 8000 }).catch(() => { });
  ok(await p.evaluate(() => typeof render === 'function' && !!document.querySelector('#view h1')), 'opens offline from the cache');
  await p.goto(base + '?v=9.99').catch(() => { }); await p.waitForFunction(() => typeof render === 'function', null, { timeout: 8000 }).catch(() => { });
  ok(await p.evaluate(() => typeof render === 'function').catch(() => false), 'an update URL (?v=) also opens offline');
  ok(await p.evaluate(() => fetch('vendor/jszip-3.10.1.min.js').then(r => r.ok, () => false)), 'a library used before is cached');
  await ctx.setOffline(false);
  const keys = await p.evaluate(() => caches.keys());
  ok(keys.includes('orbit-' + (await p.evaluate(() => APP_VERSION))), 'cache named for this build: ' + keys.join(', '));

  // a tampered helper status.json can't put markup into the Traffic card (v1.79 audit)
  const inj = await p.evaluate(() => {
    const P = '"><img src=x onerror="window.__hx=1">';
    Helper.st = { whoop: { connected: true, checkedAt: Date.now() }, health: { at: Date.now() },
      usage: { day: 'd', whoop: P, whoopLimit: P, kv: 1, kvLimit: 10, gh: 1, runs: P, hooks: P, health: P, ghLeft: P, ghLimit: P, ghReset: P },
      net: { whoop: { n: 1, ms: P, up: P, down: P, at: 1 } }, log: [{ k: 'full', w: 'w', t: 1, rq: P, ch: 1 }] };
    Helper.at = Date.now();
    const out = Helper.traffic(); Helper.st = null;
    return { img: /<img/i.test(out), ok: /Traffic/.test(out) };
  });
  ok(!inj.img && inj.ok, 'helper status numbers cannot inject markup into Traffic');
  // a tampered friends cache can't inject through rpe
  const frInj = await p.evaluate(() => {
    localStorage.setItem('orbit-friends-v1', JSON.stringify({ f1: { at: Date.now(), name: 'F', sessions: [{ d: today(), n: 'S', lift: true, s: Date.now(), e: null, dur: 60, open: false, sets: 1, ex: [['E', ['20 kg × 8']]], c: '', rpe: '7<img src=x onerror=1>' }] } }));
    FR.cache = null; S().friends = { f1: { name: 'F' } }; ui.fr = 'f1'; ui.frOpen = today() + '|S|' + frCache().f1.sessions[0].s;
    go('friends'); const bad = !!document.querySelector('.frdet img'); S().friends = {}; go('today'); return bad;
  });
  ok(!frInj, 'friends cache rpe cannot inject markup');

  ok(!csp.filter(t => !/evil\.example/.test(t)).length, 'no CSP violations from the app itself: ' + csp.filter(t => !/evil\.example/.test(t)).slice(0, 3).join(' / '));
  ok(!errs.length, 'no page errors: ' + errs.slice(0, 3).join(' / '));
  console.log(`${passes} passed, ${fails} failed`);
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
