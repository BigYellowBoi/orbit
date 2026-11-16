// v1.110: PLAYWRIGHT=/path/to/playwright node test/v1110.js (after tools/build.sh)
// Update-list batch: Healthspan zones 4-5 floor, d/m/yy birth date, header back chevron and titles on sub-screens,
// activity tiles in past logs, (i) sheets in place of inline explanations, one set of WHOOP colours. Synthetic data only.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');
  const e = await p.evaluate(() => ({ z0: hsImpact('z45', 0), z1: hsImpact('z45', 1), z30: hsImpact('z45', 30), d1: parseDMY('19/9/26'), d2: parseDMY('3.2.1995'), d3: parseDMY('31/2/90'), d4: parseDMY('1990-01-01'), d5: parseDMY('5/6/99') }));
  ok(Math.abs(e.z0 - 0.2466 * Math.log(18.51)) < 1e-9 && e.z0 === e.z1, 'zones 4-5 floored at 1 min/week: +' + e.z0.toFixed(3));
  ok(e.z30 < 0, 'over the target still lowers the age');
  ok(e.d1 === '2026-09-19' && e.d2 === '1995-02-03' && e.d3 === null && e.d4 === null && e.d5 === '1999-06-05', 'parseDMY: ' + JSON.stringify(e));
  await p.evaluate(() => { const t = today();
    for (let i = 40; i >= 0; i--) { const d = addDays(t, -i); STATE.d[d] = { rec: 60, hrv: 110, rhr: 46, rr: 14.5, spo2: 97, skt: 33.8, sp: 80, slp: 440, str: 9, acts: [{ n: 'Weightlifting', t: '09:00', min: 60, str: 8.1, kcal: 300, ahr: 100, mhr: 160, z: [50, 20, 10, 5, 0] }] }; }
    const y = addDays(t, -1), w = newWorkout(y, sessionFor(y)); w.ex.forEach(x => x.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.fin = true; STATE.w[y] = w;
    bump(); go('history'); });
  const hdr = () => p.evaluate(() => ({ back: !$('#hback').hidden, title: $('#hday').hidden ? '' : $('#hday').textContent }));
  ok(!(await hdr()).back, 'History: no back chevron');
  await p.evaluate(() => { ui.logDate = addDays(today(), -1); go('log'); });
  let h = await hdr(); const want = await p.evaluate(() => { const y = addDays(today(), -1); return fmtDow(y) + ' ' + fmtDate(y); });
  ok(h.back && h.title === want, 'past log: chevron and the day in the header: ' + JSON.stringify(h));
  ok(!(await p.$('#view .link[data-tab="history"]')), 'past log: no ‹ History link');
  ok((await p.$$('#view .hero .act')).length === 1 && !(await p.$('#view .whoopact')), 'past log: activity tiles, no chips');
  await p.click('#hback'); ok(await p.evaluate(() => ui.tab) === 'history', 'chevron goes back to History');
  await p.evaluate(() => go('friends')); h = await hdr(); ok(h.back && h.title === 'Friends', 'Friends title');
  await p.evaluate(() => go('injuries')); h = await hdr(); ok(h.back && h.title === 'Injuries', 'Injuries title');
  await p.click('#hback'); ok(await p.evaluate(() => ui.tab) === 'today', 'Injuries back to Today');
  await p.evaluate(() => navOpen('health', { d: today() })); h = await hdr(); ok(h.title === 'Health monitor' && !(await p.$('#view .wtitle')) && !(await p.$('#view .hmhow')), 'Health monitor: title in the header, ranges note behind (i)');
  await p.click('#view .hmsum .winfo'); await p.waitForTimeout(300); ok(/How ranges work/.test(await p.$eval('#wsheet h3', x => x.textContent)), '(i) opens the sheet');
  await p.evaluate(() => closeSheet(true));
  await p.evaluate(() => navOpen('activity', { d: today(), i: 0 })); h = await hdr(); ok(h.title === 'Weightlifting', 'Activity: name in the header');
  await p.evaluate(() => go('strength')); ok(!(await p.$('#view details.info')) && (await p.$$('#view .winfo')).length >= 3, 'Strength: no About toggles, (i) buttons instead');
  const c = await p.evaluate(() => { const a = document.createElement('i'), b2 = document.createElement('i'); a.style.color = 'var(--good)'; b2.style.color = 'var(--wc-green)'; document.body.append(a, b2); const r = [getComputedStyle(a).color, getComputedStyle(b2).color]; a.remove(); b2.remove(); return r; });
  ok(c[0] === c[1], '--good is WHOOP green: ' + c.join(' / '));
  await p.evaluate(() => { const t = today(); STATE.w[t] = { date: t, s: '_rest', rest: true, fin: true, ex: [] }; bump(); go('today'); });
  ok(/Rest day/i.test(await p.$eval('.myday', x => x.textContent)), 'My day shows on a rest day');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
