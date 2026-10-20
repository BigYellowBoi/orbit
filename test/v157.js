// v1.57: PLAYWRIGHT=/path/to/playwright node test/v157.js (after tools/build.sh)
// Today's folded exercise list, injuries (form, log card, pain check, swap), removing an exercise note, exercise dropdowns
// grouped by muscle, alcohol mornings in Recovery the morning after, and a friend's Recomp Logbook file.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ ...devices['iPhone 13 Pro Max'], timezoneId: 'Australia/Brisbane' }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof STATE === 'object' && typeof render === 'function');
  await p.evaluate(() => { S().rotOverride = { id: 'push2', from: today() }; render(true); });

  // 1. Today: the list is folded, past and coming days show it open
  ok(await p.locator('#view .hero .exlist').count() === 0 && await p.locator('.exsum').count() === 1, 'Today: exercises folded behind a toggle');
  await p.click('.exsum'); ok(await p.locator('#view .hero .exlist li').count() >= 7, 'Today: tap opens the list');
  await p.click('.exsum'); ok(await p.locator('#view .hero .exlist').count() === 0, 'Today: tap again folds it');
  await p.evaluate(() => { ui.dayOff = 1; render(true); }); ok(await p.locator('#view .hero .exlist li').count() > 0, 'tomorrow: list open');
  await p.evaluate(() => { ui.dayOff = 0; render(true); });

  // 2. injury: log a painful right shoulder from Today
  await p.click('text=Log an injury'); await p.waitForSelector('.sevb');
  await p.click('.chip[data-k="area"][data-v="shoulder"]'); await p.click('.chip[data-k="side"][data-v="right"]'); await p.click('.sevb[data-v="painful"]');
  ok(await p.locator('.injfx .injtag.light').count() > 3, 'form previews lighter lifts');
  await p.click('[data-act="injsave"]');
  const inj = await p.evaluate(() => Object.values(S().inj || {})[0]);
  ok(inj && inj.area === 'shoulder' && inj.side === 'right' && inj.sev === 'painful', 'injury saved in settings');
  ok(await p.evaluate(() => ui.tab) === 'today' && await p.locator('.injbanner').count() === 1, 'back on Today with the injury banner');
  ok(/adjusted for injury/.test(await p.locator('.exsum').innerText()), 'folded list says how many lifts are adjusted');

  // log the session: shoulder press card shows the injury note, a lighter Aim and the pain check
  await p.click('[data-act="start"]'); await p.waitForSelector('.card.ex');
  const i = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'shoulder_press'));
  const card = p.locator(`#ex${i}`);
  ok(await card.locator('.injnote.light').count() === 1, 'shoulder press: injury note');
  ok(/% for the injury/.test(await card.locator('.aim').innerText()), 'shoulder press: Aim says it is lighter');
  await card.locator('[data-act="expain"][data-v="5"]').click();
  ok(await p.evaluate(i => STATE.w[today()].ex[i].pain, i) === 5, 'pain 4–5 saved on the exercise');
  const legI = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'pushdown'));
  ok(await p.locator(`#ex${legI} .injnote`).count() === 0, 'pushdowns: no injury note');

  // 3. note: add one by mistake, then remove it
  await p.locator(`#ex${legI} [data-act="exnote"]`).click();
  await p.fill(`#xn${legI}`, 'oops'); await p.locator(`#ex${legI} [data-act="exnoterem"]`).click();
  ok(await p.evaluate(i => STATE.w[today()].ex[i].note, legI) === undefined && await p.locator(`#xn${legI}`).count() === 0, 'Remove note clears it and closes the box');
  await p.locator(`#ex${legI} [data-act="exnote"]`).click(); await p.locator(`#ex${legI} [data-act="exnoterem"]`).click();
  ok(await p.locator(`#xn${legI}`).count() === 0, 'Remove note closes an empty box too');

  // 4. dropdowns grouped by muscle: Swap lists the lift's own muscle first
  await p.locator(`#ex${legI} [data-act="exmore"]`).click();
  const groups = await p.locator(`#swap${legI} optgroup`).evaluateAll(gs => gs.map(g => g.label));
  const ord = ['Chest', 'Back', 'Front delts', 'Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
  ok(groups.length >= 5 && !groups.includes('Everything else') && groups.every((g, k) => !k || ord.indexOf(g) > ord.indexOf(groups[k - 1])), `swap grouped by muscle (${groups.join(', ')})`);
  ok(await p.evaluate(() => /^<optgroup label="Back">/.test(exOpts(['incline_db', 'tbar', 'pulldown'], null, 'back'))), 'swap puts the lift\'s own muscle first');
  await p.evaluate(() => { go('strength'); });
  ok((await p.locator('#liftpick optgroup').count()) >= 5, 'Strength Lift dropdown grouped by muscle');

  // can't load it: skip with gentler swaps
  await p.evaluate(() => { const id = Object.keys(S().inj)[0]; S().inj[id].sev = 'noload'; saveSettings(); go('today'); });
  const sk = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'lat_raise'));
  ok(await p.locator(`#ex${sk} .injnote.skip`).count() === 1 && await p.locator(`#ex${sk} .aim`).count() === 0, 'cannot load it: skip note, no Aim');

  // v1.58: daily check on the Today card, step down, then heal
  await p.evaluate(() => { const id = Object.keys(S().inj)[0]; S().inj[id].sev = 'painful'; saveSettings(); go('today'); });
  await p.click('.injbanner [data-act="injday"][data-v="0"]');
  ok(await p.evaluate(() => Object.values(S().inj)[0].log[today()]) === 0, 'daily check saved');
  await p.click('[data-act="injstep"]'); ok(await p.evaluate(() => Object.values(S().inj)[0].sev) === 'niggle', 'stepped down to a niggle');
  ok((await p.locator('.injbanner').boundingBox()).height < 130, 'injury card is compact');
  // heal it from the Injuries screen
  await p.evaluate(() => go('injuries')); await p.click('[data-act="injheal"]');
  ok(await p.evaluate(() => Object.values(S().inj)[0].end) === await p.evaluate(() => today()), 'healed today');
  ok(await p.locator('text=Hurting again').count() === 1, 'healed list');
  await p.evaluate(() => { const w = STATE.w[today()]; delete STATE.w[today()]; saveW(today()); go('today'); globalThis._w = w; }); ok(await p.locator('#view [data-act="go"][data-tab="injuries"]').count() === 1, 'healed: Injuries link at the bottom of Today');

  // 5. alcohol: mornings after a drink are left out of Recovery the morning after
  const rows = await p.evaluate(() => {
    const t = today(); for (let k = 2; k <= 30; k += 2) { const d = addDays(t, -k), m = addDays(d, 1); STATE.w[d] = { date: d, s: k % 4 ? 'push1' : 'pull', ex: [{ id: 'crunch', sets: [{ w: 60, r: 12, done: true }] }] }; STATE.d[m] = { rec: k <= 10 ? 30 : 80, alc: k <= 10 }; }
    bump(); return recoveryAfter(); });
  ok(rows.every(r => r.avg === 80) && rows.reduce((a, r) => a + r.alc, 0) === 5, 'alcohol mornings out of the averages, counted apart');
  await p.evaluate(() => go('body'));
  ok(await p.locator('.alcrow').count() === 1, 'Body card shows After alcohol on its own row');

  // 6. friend: his Recomp Logbook export, loaded from a file; nothing but workouts is kept
  const t0 = Date.parse('2026-10-19T07:05:00+10:00');
  const exp = { app: 'recomp-logbook', version: 1, settings: { name: 'Dylan', startDate: '2026-09-01', profile: { weight: 89 } },
    checkins: [{ date: '2026-10-19', weight: 88.4 }], intake: [{ date: '2026-10-19', kcal: 2500 }], photos: [], injuries: [],
    workouts: [
      { id: '2026-10-19_A', date: '2026-10-19', session: 'A', week: 7, done: true, startedAt: t0, finishedAt: t0 + 3720e3, durationSec: 3720, sessionRpe: 7, notes: 'private',
        exercises: [{ key: 'bench', sets: [{ w: 80, r: 8, done: true }, { w: 80, r: 7, done: true }, { w: 80, r: null, done: false }] }, { key: 'lat_raise', u: 'pin', sets: [{ w: 5, r: 15, done: true }] }, { key: 'plank', sets: [{ r: 30, done: true }] }], cardio: {} },
      { id: '2026-10-18_Z2', date: '2026-10-18', session: 'Z2', done: true, startedAt: t0 - 864e5, durationSec: 2940, exercises: [], cardio: { min: 45, hr: 131, dist: 6.1 } },
      { id: '2026-10-17_C', date: '2026-10-17', session: 'C', done: false, exercises: [{ key: 'deadlift', sets: [{ w: 140, r: null, done: false }] }], cardio: {} },
    ] };
  const f = path.join(os.tmpdir(), 'dylan-recomp.json'); fs.writeFileSync(f, JSON.stringify(exp));
  await p.evaluate(() => go('history')); await p.click('[data-tab="friends"].link');
  ok(await p.locator('#frurl').count() === 1, 'Friends: setup card first');
  await p.setInputFiles('input[data-in="frfile"]', f); await p.waitForSelector('.frrow');
  const cache = await p.evaluate(() => JSON.parse(localStorage.getItem('orbit-friends-v1')));
  const c = Object.values(cache)[0], txt = JSON.stringify(cache);
  ok(c.sessions.length === 2, 'two sessions kept; the untouched one is dropped');
  ok(!/88\.4|2500|private|profile|checkins/.test(txt), 'no weight, food, notes or profile stored');
  ok(await p.evaluate(() => Object.values(S().friends)[0].name) === 'Dylan', 'name taken from his file');
  const row = await p.locator('.frrow').first().innerText();
  ok(/Upper Push/.test(row) && /1 h 02/.test(row) && /4 sets/.test(row) && /7:05/.test(row), `row shows session, start, duration, sets (${row.replace(/\n/g, ' | ')})`);
  await p.locator('.frrow').first().click();
  const det = await p.locator('.frdet').innerText();
  ok(/Barbell Flat Bench Press/.test(det) && /80 kg × 8/.test(det) && /pin 5 × 15/.test(det) && /30 s/.test(det), 'details: names and sets in his units');
  ok(/45 min/.test(await p.locator('.frrow').nth(1).innerText()), 'cardio session shows its minutes');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close();
  console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
