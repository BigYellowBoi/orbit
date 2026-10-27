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
  ok(/years (younger|older)|same as your age/i.test(r.t) && /Pace of Aging/.test(r.t) && /Zones 1-3/.test(r.t), 'card shows years, Pace and the metrics');
  ok(r.cur && r.cur.pace < 0.6553, 'more steps in the last 30 days slows the pace ' + r.cur?.pace);
  ok(await p.evaluate(() => document.querySelectorAll('.hsr').length === 8 && document.querySelectorAll('.hsb-t > i').length === 80 && document.querySelectorAll('.hspace-s i').length === 41), 'eight range bars and the Pace scale (v1.74)');
  ok(await p.evaluate(() => !document.querySelector('#vo2in')), 'VO2 entry hidden until the VO2 row is opened');
  await p.click('[data-act="hsrow"][data-m="vo2"]'); await p.waitForTimeout(100);
  await p.click('[data-act="hsrow"][data-m="steps"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => /30 Day avg\./.test(document.querySelector('.hsr.open').textContent) && !!document.querySelector('[data-act="hstrend"][data-m="stp"]')), 'open row shows both averages and a trend link');
  await p.screenshot({ path: process.env.SHOT || '/tmp/hs.png', fullPage: true });
  const nav = await p.evaluate(() => { const a = document.querySelector('.hsnav b').textContent; document.querySelector('[data-act="hsweek"][data-d="1"]').click(); return [a, document.querySelector('.hsnav b').textContent]; });
  ok(nav[0] !== nav[1], 'week arrows step back ' + nav.join(' / '));
  await p.click('[data-act="hstrend"][data-m="stp"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => ui.metric === 'stp' && ui.per === '6M'), 'View trend opens Steps over 6 months');
  await p.evaluate(() => { ui.hsOff = 0; render(true); });
  await p.fill('#vo2in', '54.3'); await p.click('[data-act="vo2add"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => S().vo2[today()]?.v === 54.3 && S().vo2[today()].src === 'whoop'), 'VO2 saved to synced settings with its source');
  ok(await p.evaluate(() => /Last 54\.3 · /.test(document.querySelector('#vo2in').closest('.hsvo2').textContent) && !document.querySelector('[data-in="fvo2"], [data-act="vo2rem"]')), 'one VO2 row with the last value, no list or import');
  await p.fill('#vo2in', '55'); await p.click('[data-act="vo2add"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => Object.keys(S().vo2).length === 1 && S().vo2[today()].v === 55), 'a second entry the same day replaces it');
  ok(await p.evaluate(() => (CARD_KEYS.body || []).includes('healthspan')), 'Healthspan is a reorderable Body card');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
