// Done card Aims line (v1.70): PLAYWRIGHT=/path/to/playwright node test/v170.js (after tools/build.sh)
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');
  const r = await p.evaluate(() => {
    S().rotOverride = { id: 'push2', from: today() }; render(true);
    document.querySelector('[data-act="start"]').click();
    const w = STATE.w[today()], e = w.ex[0];
    S().ex[e.id].base = { w: 60, r: 8 }; S().ex[e.id].u = 'kg'; bump();
    for (const x of w.ex.slice(1)) x.sets = []; // one exercise only
    const a0 = rowAim(e, 0, w.date, aimIn(w, 0)), a1 = rowAim(e, 1, w.date, aimIn(w, 0));
    e.sets = [{ w: a0.w + 2.5, r: a0.r - 1, done: true }, { w: a1.w, r: a1.r - 2, done: true }, { w: 20, r: 10, t: 'w', done: true }];
    const m = aimsMet(w);
    w.fin = true; ui.editToday = false; bump(); render(true);
    return { m, txt: [...document.querySelectorAll('.hero p.small')].map(x => x.textContent).join(' | '), name: exDef(e.id).name };
  });
  ok(r.m.n === 2 && r.m.met === 1 && r.m.short.length === 1 && r.m.short[0].k === 2, 'heavier with one rep fewer meets, two reps short does not, warm-up ignored ' + JSON.stringify(r.m));
  ok(r.txt.includes(`Aims: 1 of 2 sets met · 1 short (${r.name} set 2)`), 'Done card line: ' + r.txt);
  ok(!/tonnage/.test(r.txt), 'no tonnage comparison');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
