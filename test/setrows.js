// Set rows (v1.40): PLAYWRIGHT=/path/to/playwright node test/setrows.js (after tools/build.sh)
// Removing a warm-up, the Workout duration label, and the keyboard bar that steps through set fields on touch screens.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };

async function open(b, opts) {
  const p = await b.newPage(opts), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof STATE === 'object' && typeof render === 'function');
  await p.evaluate(() => { S().rotOverride = { id: 'push1', from: today() }; render(true); });
  return { p, errs };
}
const sets = (p, i) => p.evaluate(i => STATE.w[today()].ex[i].sets.map(s => (s.t || 'n') + ':' + (s.w ?? '') + 'x' + (s.r ?? '') + (s.done ? '+' : '')), i);
const active = p => p.evaluate(() => document.activeElement?.id || null);

(async () => {
  const b = await chromium.launch();

  /* ---------- iPhone: warm-up remove, label, keyboard bar ---------- */
  {
    const { p, errs } = await open(b, { ...devices['iPhone 13 Pro Max'] });
    ok(await p.evaluate(() => matchMedia('(pointer: coarse)').matches), 'emulated phone has a coarse pointer');
    await p.tap('[data-act="start"]');
    await p.evaluate(() => { const w = STATE.w[today()]; w.ex[0].sets[0].w = 60; w.ex[0].sets[0].r = 8; w.ex[0].sets[0].done = true; saveW(w.date); render(true); });
    const ex = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => document.querySelector(`#ex${STATE.w[today()].ex.indexOf(e)} [data-act="addwarm"]`)));
    ok(ex >= 0, 'an exercise offers + Warm-up');
    const before = await sets(p, ex);
    await p.tap(`#ex${ex} [data-act="addwarm"]`); await p.tap(`#ex${ex} [data-act="addwarm"]`);
    ok((await sets(p, ex)).filter(s => s.startsWith('w:')).length === 2, 'two warm-ups added at the top');
    ok(await p.$$eval(`#ex${ex} .set.warm .rmw`, b => b.length) === 2, 'each warm-up row has a remove button');
    ok(!(await p.$(`#ex${ex} .set:not(.warm) .rmw`)), 'working sets have no remove button');
    await p.tap(`#ex${ex} #row${ex}_1 .rmw`);
    ok((await sets(p, ex)).filter(s => s.startsWith('w:')).length === 1, 'tapping × removes that warm-up');
    await p.tap(`#ex${ex} #row${ex}_0 .rmw`);
    ok((await sets(p, ex)).join() === before.join(), 'removing both leaves the working sets exactly as they were');
    await p.waitForTimeout(800); ok(await p.evaluate(ex => JSON.parse(localStorage.getItem('rotation-logbook-v1')).w[today()].ex[ex].sets.length, ex) === before.length, 'removal is saved');

    ok(/Workout duration/.test(await p.textContent('#view')), 'duration reads Workout duration');

    // keyboard bar
    ok(!(await p.$('#kbar.on')), 'no bar without a focused field');
    await p.tap('#w0_1');
    ok(await p.isVisible('#kbar.on'), 'bar shows while a set field is focused');
    ok(await p.evaluate(() => { const f = document.querySelector('#nextset'); return !f || getComputedStyle(f).pointerEvents === 'none'; }), 'next-set button steps aside while the bar is up');
    await p.keyboard.type('62.5');
    await p.tap('#kbar [data-k="1"]');
    ok(await active(p) === 'r0_1', '› goes from weight to reps on the same set');
    ok(await p.evaluate(() => STATE.w[today()].ex[0].sets[1].w) === 62.5, 'the weight was kept');
    await p.keyboard.type('9');
    await p.tap('#kbar [data-k="1"]');
    const next = await active(p);
    ok(next && next !== 'r0_1' && /^w\d+_\d+$/.test(next), '› from reps goes on to the next weight field: ' + next);
    ok(await p.evaluate(() => { const s = STATE.w[today()].ex[0].sets[1]; return s.r === 9 && s.done; }), 'reps saved and the set ticked on the way');
    await p.tap('#kbar [data-k="-1"]');
    ok(await active(p) === 'r0_1', '‹ goes back');
    const box = await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(), k = document.querySelector('#kbar').getBoundingClientRect(); return [r.top, r.bottom, k.top]; });
    ok(box[1] <= box[2], 'the focused field sits above the bar');
    // walk to the very last field: › disabled there
    const n = await p.evaluate(() => document.querySelectorAll('#view .set:not(.hdr) .in').length);
    await p.evaluate(() => { const f = [...document.querySelectorAll('#view .set:not(.hdr) .in')]; f[f.length - 2].focus(); });
    await p.tap('#kbar [data-k="1"]');
    ok(await p.evaluate(() => { const f = [...document.querySelectorAll('#view .set:not(.hdr) .in')]; return document.activeElement === f[f.length - 1]; }), `› reaches the last of ${n} fields, across exercises`);
    ok(await p.evaluate(() => document.querySelector('#kbar [data-k="1"]').disabled), '› is off on the last field');
    await p.tap('#kbar .kd');
    ok(await active(p) == null || await p.evaluate(() => !document.activeElement.matches('.set .in')), 'Done closes the field');
    await p.waitForTimeout(80);
    ok(!(await p.$('#kbar.on')), 'bar hides after Done');
    // a non-set field (session notes) gets no bar
    await p.tap('#wnote'); await p.waitForTimeout(50);
    ok(!(await p.$('#kbar.on')), 'no bar on the notes field');
    await p.screenshot({ path: path.resolve(__dirname, '../dist/setrows_phone.png') });
    ok(!errs.length, 'no page errors on the phone: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- desktop mouse: no bar, warm-up remove works by click ---------- */
  {
    const { p, errs } = await open(b, { viewport: { width: 1280, height: 900 } });
    await p.click('[data-act="start"]');
    await p.click('#w0_0');
    ok(!(await p.$('#kbar.on')), 'no keyboard bar with a mouse');
    const n0 = (await sets(p, 0)).length;
    await p.click('#ex0 [data-act="addwarm"]'); await p.click('#ex0 .rmw');
    ok((await sets(p, 0)).length === n0, 'click removes a warm-up on desktop');
    ok(!errs.length, 'no page errors on desktop: ' + errs.join(' | '));
    await p.close();
  }

  await b.close();
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
