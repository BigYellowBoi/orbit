// Healthspan card (v1.72): PLAYWRIGHT=/path/to/playwright node test/v172.js (after tools/build.sh). Synthetic data only.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');
  const cal = await p.evaluate(() => { for (let i = 1; i <= 10; i++) STATE.d[addDays(today(), -i)] = { rec: 60, stp: 9000 }; bump(); go('body'); return document.querySelector('#view').textContent; });
  ok(/Healthspan/.test(cal) && /Needs 21 WHOOP recoveries/.test(cal), 'calibrating with too few recoveries');
  const r = await p.evaluate(() => {
    for (let i = 1; i <= 200; i++) STATE.d[addDays(today(), -i)] = { rec: 60, stp: 9000 + (i < 30 ? 1500 : 0), rhr: 45, sc: 70, slp: 450, acts: [{ n: 'Weightlifting', min: 60, z: [50, 20, 5, 5, 0] }] };
    bump(); render(true); const t = document.querySelector('#view').textContent; return { t, cur: healthspan().cur };
  });
  ok(/yrs younger/.test(r.t) && /Pace of Aging/.test(r.t) && /Zones 1-3/.test(r.t), 'card shows years, Pace and the metrics');
  ok(r.cur && r.cur.pace < 0.6553, 'more steps in the last 30 days slows the pace ' + r.cur?.pace);
  await p.fill('#vo2in', '54.3'); await p.click('[data-act="vo2add"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => S().vo2[today()]?.v === 54.3 && S().vo2[today()].src === 'whoop'), 'VO2 saved to synced settings with its source');
  const f = path.join(os.tmpdir(), 'orbit-vo2-test.csv'); fs.writeFileSync(f, 'date,vo2_whoop_estimate\n2026-01-06,53\n2026-01-13,54\nbad,1\n');
  await p.evaluate(() => document.querySelector('details.info:has([data-in="fvo2"])').open = true);
  await p.setInputFiles('[data-in="fvo2"]', f); await p.waitForTimeout(200);
  ok(await p.evaluate(() => Object.keys(S().vo2).length === 3 && S().vo2['2026-01-13'].v === 54), 'CSV import adds estimates, keeps entries');
  await p.click(`[data-act="vo2rem"][data-date="2026-01-13"]`); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !S().vo2['2026-01-13'] && Object.keys(S().vo2).length === 2), 'remove one entry');
  ok(await p.evaluate(() => (CARD_KEYS.body || []).includes('healthspan')), 'Healthspan is a reorderable Body card');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
