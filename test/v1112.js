// v1.112: PLAYWRIGHT=/path/to/playwright node test/v1112.js (after tools/build.sh)
// Update list 24-27: title chevrons and session heroes, notes older than 14 days hidden in the log,
// pain check off after two Nones (saves 0, Ask again), the Aim kept on each logged set. Synthetic data only.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');

  // 24. chevrons on titles that open a screen; session heroes take the session colour
  await p.evaluate(() => { const t = today(); STATE.d[t] = { rec: 70, hrv: 80, rhr: 50, slp: 450, sp: 90, on: '22:30', off: '06:30' }; S().rotOverride = { id: 'legs', from: t }; bump(); go('today'); render(true); });
  ok(!!(await p.$('#view .rcard button.card-h.go[data-s="recovery"] .tchev')), 'Recovery card title opens Recovery, with a chevron');
  ok(await p.$$eval('#view .wtile .wlab .tchev', x => x.length) === 2, 'Health monitor and Last night labels have the chevron');
  ok(/--sc:\s*#eef0f4/i.test(await p.$eval('#view .hero.shero', e => e.getAttribute('style'))), 'Next up hero takes the Legs colour');
  await p.tap('#view .rcard button.card-h.go'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => ui.tab) === 'recovery', 'tapping the Recovery title opens Recovery');
  await p.evaluate(() => { go('today'); render(true); });

  // 25. notes: a note 20 days old doesn't show in the log, one 10 days old does
  const notes = await p.evaluate(() => {
    const t = today(), mk = (d, n) => { STATE.w[d] = { date: d, s: 'legs', note: n, fin: 1, ex: [{ id: 'hack', note: 'ex ' + n, sets: [{ w: 100, r: 8, done: true }] }] }; };
    mk(addDays(t, -20), 'old'); bump();
    const a = [lastSessionNote({ s: 'legs', date: t }), lastExerciseNote('hack', t)];
    mk(addDays(t, -10), 'recent'); bump();
    const c = [lastSessionNote({ s: 'legs', date: t })?.note, lastExerciseNote('hack', t)?.note];
    delete STATE.w[addDays(t, -20)]; delete STATE.w[addDays(t, -10)]; bump();
    return { a, c };
  });
  ok(notes.a[0] === null && notes.a[1] === null, 'notes older than 14 days are hidden');
  ok(notes.c[0] === 'recent' && notes.c[1] === 'ex recent', 'notes from the last 14 days show');

  // 26. pain check: two Nones in a row under the knee injury turn it off
  await p.evaluate(() => {
    const t = today(); S().inj = { k1: { id: 'k1', area: 'knee', side: 'right', sev: 'painful', start: addDays(t, -30), ex: {} } };
    for (const [d, pn] of [[-6, 0], [-3, 0]]) { const dd = addDays(t, d); STATE.w[dd] = { date: dd, s: 'legs', fin: 1, ex: [{ id: 'leg_ext', pain: pn, sets: [{ w: 60, r: 10, done: true }] }] }; }
    S().ex.leg_ext = S().ex.leg_ext || { name: 'Leg extension', g: 'quads', u: 'kg' };
    changed('settings', ''); bump(); render(true);
  });
  const off = await p.evaluate(() => painOff('leg_ext', injPlan('leg_ext'), today()));
  ok(off, 'painOff after two Nones');
  await p.evaluate(() => { const dd = addDays(today(), -3); delete STATE.w[dd].ex[0].pain; bump(); });
  ok(!(await p.evaluate(() => painOff('leg_ext', injPlan('leg_ext'), today()))), 'an unanswered session breaks the run');
  await p.evaluate(() => { STATE.w[addDays(today(), -3)].ex[0].pain = 0; bump(); });
  await p.tap('[data-act="start"]');
  await p.evaluate(() => { const w = STATE.w[today()]; if (!w.ex.some(e => e.id === 'leg_ext')) w.ex.unshift({ id: 'leg_ext', sets: [{ w: null, r: null, done: false }, { w: null, r: null, done: false }] }); bump(); render(true); });
  const i = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'leg_ext'));
  ok(!!(await p.$(`#ex${i} .painoff`)) && !(await p.$(`#ex${i} .painchk`)), 'card says not asking, no pain buttons');
  await p.fill(`#w${i}_0`, '60'); await p.fill(`#r${i}_0`, '10'); await p.locator(`#r${i}_0`).blur(); await p.waitForTimeout(50);
  const s0 = await p.evaluate(i => { const w = STATE.w[today()], e = w.ex[i]; return { pain: e.pain, s: e.sets[0], aim: rowAim(e, 0, w.date, aimIn(w, i)) }; }, i);
  ok(s0.pain === 0, 'skipped check saves 0: ' + s0.pain);

  // 27. the Aim shown is kept on the set
  ok(s0.aim && s0.s.aw === s0.aim.w && s0.s.ar === s0.aim.r && (s0.aim.rir == null || s0.s.arir === s0.aim.rir), 'set keeps the Aim: ' + JSON.stringify(s0.s) + ' vs ' + JSON.stringify(s0.aim));
  await p.fill(`#r${i}_0`, ''); await p.locator(`#r${i}_0`).blur(); await p.waitForTimeout(50);
  ok(await p.evaluate(i => !('aw' in STATE.w[today()].ex[i].sets[0]), i), 'emptied set drops the Aim');
  await p.fill(`#w${i}_0`, '60'); await p.fill(`#r${i}_0`, '10'); await p.locator(`#r${i}_0`).blur(); await p.waitForTimeout(50);

  // Ask again brings the check back and clears the auto 0
  await p.evaluate(i => { ui.exOpen.add(exKey(STATE.w[today()], STATE.w[today()].ex[i])); render(true); }, i);
  await p.tap(`#ex${i} [data-act="painask"]`);
  const back = await p.evaluate(i => ({ ask: S().inj.k1.ask?.leg_ext, pain: STATE.w[today()].ex[i].pain }), i);
  ok(back.ask === await p.evaluate(() => today()) && back.pain === undefined, 'Ask again records the date and clears the 0');
  ok(!!(await p.$(`#ex${i} .painchk`)), 'pain buttons are back');
  await p.tap(`#ex${i} .painchk [data-v="0"]`);
  ok(await p.evaluate(i => STATE.w[today()].ex[i].pain, i) === 0, 'None saves 0');

  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
