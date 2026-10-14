// Read-only past logs and WHOOP strain/times in the stats (v1.46): PLAYWRIGHT=/path/to/playwright node test/pastlog.js (after tools/build.sh)
// SHOTS=dir saves screenshots.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const shot = (p, n) => process.env.SHOTS ? p.screenshot({ path: path.join(process.env.SHOTS, n + '.png'), fullPage: false }) : null;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof STATE === 'object' && typeof render === 'function');
  await p.evaluate(() => {
    const t = today(), y = addDays(t, -1);
    for (const d of [t, y]) STATE.d[d] = { ...(STATE.d[d] || {}), rec: 75, str: 16.1, acts: [{ n: 'Weightlifting', t: '07:49', min: 82, str: 11.5, ahr: 96, kcal: 294 }, { n: 'Stairmaster', t: '09:18', min: 30, str: 13, ahr: 140, kcal: 320 }] };
    for (const d of [t, y]) { const w = newWorkoutAuto(d, 'pull'); w.ex.forEach(e => e.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.note = 'Felt good'; autoCardio(w); w.fin = true; STATE.w[d] = w; saveW(d); }
    render(true);
  });

  /* Today's hero */
  const hero = await p.$$eval('.hero .stat', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  ok(/strain 11\.5 1 h 22 07:49 – 09:11 duration · WHOOP/.test(hero[1]), 'duration: strain above, start – end below ' + hero[1]);
  ok(/strain 13 30\s?min 09:18 – 09:48 Stairmaster/.test(hero[2]), 'cardio: strain above, times below ' + hero[2]);
  const tops = await p.$$eval('.hero .stat b', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  ok(new Set(tops).size === 1, 'big numbers stay level ' + tops);
  await shot(p, 'today');

  /* Past log opens read-only */
  const y = await p.evaluate(() => addDays(today(), -1));
  await p.evaluate(y => { ui.logDate = y; go('log'); }, y);
  ok(!(await p.$('#view input, #view textarea')), 'no fields in the read-only log');
  ok(!!(await p.$('[data-act="logedit"]')), 'Edit button shown');
  ok(!(await p.$('[data-act="delw1"]')), 'no delete in read-only');
  await shot(p, 'past-ro');
  await p.tap('[data-act="logedit"]');
  ok(!!(await p.$('.set .in')), 'Edit unlocks the set fields');
  ok(await p.$eval('.sess-top [data-act="logsave"]', e => e.textContent) === 'Save', 'Edit became Save');
  await shot(p, 'past-edit');
  await p.fill('#wnote', 'Changed');
  await p.tap('.sess-top [data-act="logsave"]');
  ok(await p.evaluate(y => STATE.w[y].note, y) === 'Changed', 'Save keeps the focused field');
  ok(!!(await p.$('[data-act="logedit"]')) && !(await p.$('#view input')), 'back to read-only after Save');
  ok(await p.evaluate(() => ui.tab) === 'log', 'Save stays on the log');

  /* leaving and coming back resets to read-only */
  await p.tap('[data-act="logedit"]'); await p.evaluate(() => go('history')); await p.evaluate(y => { ui.logDate = y; ACT.openlog({ dataset: { d: y } }); }, y);
  ok(!!(await p.$('[data-act="logedit"]')), 'reopening a past log is read-only again');

  /* starting a session on an empty past day stays editable as sets go in */
  const d2 = await p.evaluate(() => addDays(today(), -3));
  await p.evaluate(d2 => { delete STATE.w[d2]; ui.logDate = d2; go('log'); }, d2);
  await p.tap('[data-act="start"]');
  await p.evaluate(d2 => { const w = STATE.w[d2]; w.ex[0].sets[0].w = 50; w.ex[0].sets[0].r = 8; w.ex[0].sets[0].done = true; saveW(d2); render(true); }, d2);
  ok(!!(await p.$('.set .in')), 'a new past session stays editable after the first set');

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
