// v1.81: PLAYWRIGHT=/path/to/playwright node test/v181.js (after tools/build.sh)
// Today redesign: rings and tiles, Health monitor ranges and in-range counts, the Sleep / Recovery / Strain / Activity
// detail screens, the logged Today tiles, sleepOptimal, the alcohol check, and the back stack with scroll restore.
// Synthetic data only (the repo is public).
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof render === 'function');
  const y = () => p.evaluate(() => scrollY0()), tab = t => p.dispatchEvent(`.tabs [data-tab="${t}"]`, 'pointerdown');
  // 45 nights of WHOOP-like fields
  await p.evaluate(() => {
    let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647, t = today();
    for (let i = 45; i >= 0; i--) { const d = addDays(t, -i), on = 22 * 60 + Math.round(rnd() * 90), slp = 420 + Math.round(rnd() * 60);
      STATE.d[d] = { rec: 40 + Math.round(rnd() * 50), hrv: 100 + rnd() * 30, rhr: 44 + Math.round(rnd() * 4), rr: 14 + Math.round(rnd() * 10) / 10, spo2: 96 + Math.round(rnd() * 20) / 10, skt: 33.5 + Math.round(rnd() * 6) / 10,
        sp: 75 + Math.round(rnd() * 15), sc: 70 + Math.round(rnd() * 20), se: 90 + Math.round(rnd() * 6), slp, bed: slp + 40, aw: 40, lt: slp - 220, deep: 100, rem: 120, sn: 590, sd: 80, str: 8 + Math.round(rnd() * 100) / 10, stp: 8000 + Math.round(rnd() * 4000), kb: 2800,
        on: `${pad(Math.floor(on / 60) % 24)}:${pad(on % 60)}`, off: `${pad(Math.floor((on + slp + 40) / 60) % 24)}:${pad((on + slp + 40) % 60)}` }; }
    STATE.d[t].acts = [{ n: 'Weightlifting', t: '09:24', min: 68, str: 8.3, kcal: 377, ahr: 106, mhr: 170, z: [60, 10, 5, 2, 0] }, { n: 'Stairmaster', t: '10:36', min: 30, str: 13.1, kcal: 430, ahr: 153, mhr: 172, z: [7, 9, 33, 51, 0] }];
    STATE.d[t].rr = 25; // way out of range
    bump(); go('today');
  });
  // rings and tiles
  const rings = await p.$$eval('.wrings .wring', es => es.map(e => e.getAttribute('aria-label')));
  ok(rings.length === 3 && /^Sleep \d+%/.test(rings[0]) && /^Recovery \d+%/.test(rings[1]) && /^Strain [\d.]+ of 21/.test(rings[2]), 'three rings with values: ' + rings.join(' | '));
  ok(await p.$eval('.wtile .st', e => e.textContent) === '1 out of range', 'Health monitor tile counts the out-of-range metric');
  ok(/asleep/.test(await p.$eval('[data-s="sleep"].wtile', e => e.textContent)), 'Last night tile shows time asleep');
  ok(!(await p.$('.rcard .ring')) && (await p.$$('.rcard .rc3 > div')).length === 3 && (await p.$$('.rcard .rt3 > div')).length === 3, 'Recovery card: no ring, 3 columns, 3 tiles');
  // ranges (engine)
  const rg = await p.evaluate(() => { const t = today(), r = healthRange(t, 'hrv'), c = inRangeCount(t); delete STATE.d[t].spo2; const c2 = inRangeCount(t); STATE.d[t].spo2 = 97; return { r, c, c2, few: healthRange(addDays(t, -40), 'rhr') }; });
  ok(rg.r && rg.r.lo < rg.r.mean && rg.r.hi > rg.r.mean && rg.r.n === 30, 'healthRange: band around the 30-night mean');
  ok(rg.c.of === 5 && rg.c.n === 4 && rg.c.out[0] === 'rr', 'inRangeCount: 4 of 5, respiratory out');
  ok(rg.c2.of === 4, 'a missing metric counts out of those present');
  ok(rg.few === null, 'fewer than 14 nights: no range');
  ok(await p.evaluate(() => { const t = today(), keep = STATE.d[t].rhr; for (let i = 1; i <= 30; i++) STATE.d[addDays(t, -i)].rhr = 45; const r = healthRange(t, 'rhr'); STATE.d[t].rhr = keep; return r.hi - r.lo >= 1 - 1e-9; }), 'band never narrower than the display rounding');
  // sleepOptimal: midpoint weighting and span = sn − sd
  const so = await p.evaluate(() => { const t = addDays(today(), 100); for (let i = 1; i <= 7; i++) STATE.d[addDays(t, -i)] = { on: '23:00', off: '07:00' }; STATE.d[t] = { sn: 600, sd: 80 }; const o = sleepOptimal(t); STATE.d[addDays(t, -1)] = { on: '00:00', off: '08:00' }; const o2 = sleepOptimal(t); for (let i = 0; i <= 7; i++) delete STATE.d[addDays(t, -i)]; return { o, o2 }; });
  ok(Math.abs(so.o.mid - 180) < 1e-6 && so.o.span === 520 && Math.abs(so.o.bed + 80) < 1e-6 && Math.abs(so.o.wake - 440) < 1e-6, 'sleepOptimal: 3 am midpoint, span sn − sd');
  ok(so.o2.mid > 180 && so.o2.mid < 240, 'the latest night weighs most (half-life 2): ' + so.o2.mid.toFixed(1));
  const cs = await p.evaluate(() => { const t = addDays(today(), 200); for (let i = 0; i < 4; i++) STATE.d[addDays(t, -i)] = { on: '23:00', off: '07:00', aw: 0 }; const a = sleepCons(t); STATE.d[t] = { on: '01:00', off: '09:00', aw: 0 }; const b = sleepCons(t); STATE.d[addDays(t, -4)] = { on: '20:00', off: '04:00' }; const c = sleepCons(t); delete STATE.d[addDays(t, -2)].on; const d = sleepCons(t); for (let i = 0; i <= 4; i++) delete STATE.d[addDays(t, -i)]; return { a, b, c, d }; });
  ok(cs.a === 100 && Math.abs(cs.b - (200 * (1 - 240 / 1440) - 100)) <= 1 && cs.c === cs.b && cs.d === null, 'sleepCons: identical nights 100, a 2 h shift lowers it, only the last 4 nights count, a gap gives none: ' + JSON.stringify(cs));
  // detail screens render
  for (const s of ['sleep', 'recovery', 'strain', 'health']) { await p.evaluate(s => navOpen(s, { d: today() }), s); ok((await p.$$('#view .wcard, #view .hmt')).length >= 3, s + ' screen renders'); }
  await p.evaluate(() => navOpen('sleep', { d: today() }));
  ok((await p.$$('#view .wstage')).length === 4 && (await p.$$('#view .wtrack > s')).length === 4, 'Sleep: 4 stages with typical ranges');
  ok(await p.$$eval('#cons path[stroke-dasharray]', es => es.length) === 2, 'Sleep consistency: optimal bed and wake contours');
  ok((await p.$$('#view .wsvg')).length === 9, 'Sleep: consistency chart and 8 weekly charts');
  await p.click('[data-act="winfo"][data-k="cons"]'); ok(!!(await p.$('.winfo-t')), '(i) opens a one-line explanation');
  // Done hero: activity tiles
  await p.evaluate(() => { go('today'); const t = today(), w = newWorkout(t, sessionFor(t)); w.ex.forEach(e => e.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.fin = true; w.cardio = { name: 'Stairmaster', min: 30, done: true, src: 'whoop' }; STATE.w[t] = w; bump(); render(true); });
  const tiles = await p.$$eval('.hero .act', es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(tiles.length === 2 && /WEIGHTLIFTING|Weightlifting/i.test(tiles[0]) && /Stairmaster/i.test(tiles[1]), 'Done hero: lifting and cardio tiles: ' + tiles.join(' | '));
  ok(!(await p.$('.hero .stats')), 'sessStats row replaced on the Done hero');
  ok((await p.$$('.wrings .wring')).length === 3, 'rings stay above My day after logging');
  await p.evaluate(() => { const w = STATE.w[today()]; w.cardio = { name: 'Treadmill', min: 20, done: true }; STATE.d[today()].acts = STATE.d[today()].acts.slice(0, 1); render(true); });
  ok(/No strain/.test(await p.$eval('.hero .acts', e => e.textContent)), 'hand-typed cardio: grey tile, No strain');
  await p.evaluate(() => { STATE.d[today()].acts.push({ n: 'Stairmaster', t: '10:36', min: 30, str: 13.1, kcal: 430, ahr: 153, mhr: 172, z: [7, 9, 33, 51, 0] }); render(true); });
  // navigation: 3 levels, each scroll restored
  await p.evaluate(() => { go('today'); scrollToY(150); }); await p.waitForTimeout(80); const y1 = await y();
  await p.$eval('.wring[data-s="strain"]', e => e.click()); await p.waitForTimeout(80); ok(await y() === 0 && await p.evaluate(() => ui.tab) === 'strain', 'ring opens Strain at the top');
  await p.evaluate(() => scrollToY(500)); await p.waitForTimeout(80); const y2 = await y();
  await p.$eval('#view .acts .act', e => e.click()); await p.waitForTimeout(80); ok(await p.evaluate(() => ui.tab) === 'activity', 'activity tile opens Activity detail');
  ok(await p.$eval('#hback', e => e.getAttribute('aria-label')) === 'Back to Strain', 'back link names the screen underneath');
  await p.evaluate(() => scrollToY(250)); await p.waitForTimeout(80); const y3 = await y();
  await p.$eval('#view .wcard .wch .wlab', e => e.click()); await p.waitForTimeout(80);
  ok(await p.evaluate(() => ui.tab === 'trend' && ui.metric === 'zall' && ui.per === 'W'), 'zones card opens the Trend screen on zall, period W');
  ok(/Weightlifting/.test(await p.$eval('#hback', e => e.getAttribute('aria-label'))), 'back link: ‹ Weightlifting');
  await p.click('#hback'); await p.waitForTimeout(120); ok(await p.evaluate(() => ui.tab) === 'activity' && Math.abs(await y() - y3) <= 1, `back to Activity at the same place (${await y()} vs ${y3})`);
  await p.click('#hback'); await p.waitForTimeout(120); ok(await p.evaluate(() => ui.tab) === 'strain' && Math.abs(await y() - y2) <= 1, `back to Strain at the same place (${await y()} vs ${y2})`);
  await p.click('#hback'); await p.waitForTimeout(120); ok(await p.evaluate(() => ui.tab) === 'today' && Math.abs(await y() - y1) <= 1, `back to Today at the same place (${await y()} vs ${y1})`);
  // background render keeps the place
  await p.click('.wring[data-s="sleep"]'); await p.evaluate(() => scrollToY(700)); await p.waitForTimeout(80); const yb = await y();
  await p.evaluate(() => { STATE.d[today()].sp = 61; bump(); render(); }); await p.waitForTimeout(80);
  ok(Math.abs(await y() - yb) <= 2, `a background render keeps the position (${await y()} vs ${yb})`);
  // Settings returns to the same place
  await p.click('#gear'); await p.waitForTimeout(80); await p.click('#gear'); await p.waitForTimeout(120);
  ok(await p.evaluate(() => ui.tab === 'sleep' && ui.nav.length === 1) && Math.abs(await y() - yb) <= 2, `Settings returns to Sleep at the same place (${await y()} vs ${yb})`);
  // Today tab clears the stack; another tab clears it too
  await tab('today'); await p.waitForTimeout(80); ok(await p.evaluate(() => ui.tab === 'today' && !ui.nav.length) && await y() === 0, 'Today tab clears the stack, top of Today');
  await p.click('.wring[data-s="recovery"]'); await tab('body'); await tab('today'); await p.waitForTimeout(80);
  ok(await p.evaluate(() => ui.tab === 'today' && !ui.nav.length), 'another tab clears the stack; Today lands on Today');
  // past day: detail screens show that day, back returns to it
  await p.evaluate(() => { ui.dayOff = -3; render(true); });
  await p.click('.wring[data-s="recovery"]'); ok(await p.evaluate(() => ui.np.d === addDays(today(), -3)), 'detail opened from a past day shows that day');
  await p.click('#hback'); ok(await p.evaluate(() => ui.tab === 'today' && ui.dayOff === -3), 'back returns to that day on Today');
  // Health monitor: a night in Last 7 nights changes the day without a stack entry; a tile opens its Trend
  await p.evaluate(() => { go('today'); }); await p.click('.wtile[data-s="health"]'); const n0 = await p.evaluate(() => ui.nav.length);
  await p.click('.hm7 button:first-child'); ok(await p.evaluate(() => ui.np.d === addDays(today(), -6) && ui.nav.length) === n0 || await p.evaluate(() => ui.np.d === addDays(today(), -6)), 'Last 7 nights: that night, no new stack entry');
  ok(await p.evaluate(() => ui.nav.length) === n0, 'stack unchanged');
  await p.click('.hmt'); ok(await p.evaluate(() => ui.tab === 'trend' && ui.metric === 'rr'), 'metric tile opens its Trend');
  // alcohol check
  await p.evaluate(() => { go('today'); delete STATE.w[today()]; const t = today(); delete STATE.d[t].alc; STATE.d[t].off = '00:01'; render(true); });
  ok(!!(await p.$('section.alc')), 'Alcohol card shows on Today after wake');
  await p.click('section.alc [data-v="0"]');
  ok(await p.evaluate(() => STATE.d[today()].alc === false && STATE.d[today()].alcSrc === 'me') && !(await p.$('section.alc')), 'answering No stores false and the card leaves Today');
  const ac = await p.evaluate(() => { const t = today(); let yes = 0; for (let i = 1; i <= 8; i++) { setAlc(addDays(t, -i), i % 2 === 0); } for (const k of [3, 4]) STATE.w[addDays(t, -k)] = { date: addDays(t, -k), s: 'pull', ex: [{ id: 'tbar', sets: [{ w: 20, r: 8, done: true }] }], fin: true }; bump();
    return { card: !!alcoholCard(), ra: recoveryAfter().find(r => r.k === 'Pull') }; });
  ok(ac.card, 'alcoholCard counts Orbit answers');
  ok(ac.ra && ac.ra.alc === 1 && ac.ra.n === 1, 'recoveryAfter leaves out the morning after a Yes');
  const imp = await p.evaluate(() => { const t = today(); applyImport({ src: 'whoop', days: { [t]: { alc: true, rec: 50 } } }); return STATE.d[t].alc; });
  ok(imp === false, 'a WHOOP journal import does not overwrite an Orbit answer');
  await p.evaluate(() => { ui.dayOff = -5; render(true); }); ok(!!(await p.$('.alcrow')), 'a past day shows the alcohol row');
  await p.click('.alcrow'); await p.click('section.alc [data-v="1"]'); ok(await p.evaluate(() => STATE.d[addDays(today(), -5)].alc === true), "a past day's answer can be changed");
  // missing sp: empty ring
  await p.evaluate(() => { ui.dayOff = 0; delete STATE.d[today()].sp; render(true); });
  ok(/no data/.test(await p.$eval('.wring[data-s="sleep"]', e => e.getAttribute('aria-label'))) && /–/.test(await p.$eval('.wring[data-s="sleep"] .wr b', e => e.textContent)), 'missing sp: empty ring with –');
  // fonts
  ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Figtree') && getComputedStyle(document.querySelector('.brand')).fontFamily.includes('Geist')), 'Figtree body, Geist logo');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
