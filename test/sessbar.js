// Session bar count (v1.51): PLAYWRIGHT=/path/to/playwright node test/sessbar.js (after tools/build.sh)
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');
  await p.evaluate(() => { S().rotOverride = { id: 'push2', from: today() }; render(true); });
  await p.tap('[data-act="start"]');
  const bar = () => p.$eval('.sess-top .t small', e => e.textContent.match(/(\d+) \/ (\d+) sets/).slice(1).map(Number));
  const total = () => p.evaluate(() => STATE.w[today()].ex.reduce((a, e) => a + e.sets.filter(s => s.t !== 'w').length, 0));
  ok((await bar())[0] === 0 && (await bar())[1] === await total(), 'starts at 0 / all sets ' + await bar());
  for (const v of ['40', '8']) await p.fill(v === '40' ? '#w0_0' : '#r0_0', v); await p.locator('#r0_0').blur();
  ok((await bar())[0] === 1 && (await bar())[1] === await total(), 'after one set: 1 / total ' + await bar());
  await p.fill('#w0_1', '38'); await p.fill('#r0_1', '8'); await p.locator('#r0_1').blur();
  ok((await bar()).join() === `2,${await total()}`, 'after two sets ' + await bar());
  const t0 = await total(); await p.tap('#ex1 [data-act="addset"]');
  ok((await bar()).join() === `2,${t0 + 1}`, '+ Set raises the total ' + await bar());
  await p.tap('#ex0 [data-act="exopen"]'); // v1.76: both sets filled, so it folded
  await p.tap('#ex0 [data-act="addwarm"]');
  ok((await bar()).join() === `2,${t0 + 1}`, 'a warm-up does not count ' + await bar());
  await p.tap('[data-act="pickopen"]'); await p.tap('.picklist [data-act="addexid"]');
  ok((await bar())[1] > t0 + 1 && (await bar())[1] === await total(), '+ Exercise raises the total ' + await bar());
  // v1.52: a best corrected below the best loses its purple
  await p.evaluate(() => { const w = STATE.w[today()]; S().ex[w.ex[2].id].base = { w: 10, r: 10 }; bump(); render(true); });
  await p.fill('#w2_0', '10'); await p.fill('#r2_0', '12'); await p.locator('#r2_0').blur();
  ok(await p.$eval('#row2_0', e => e.classList.contains('pr')), '10 × 12 over a 10 × 10 best is marked');
  await p.fill('#r2_0', '9'); await p.locator('#r2_0').blur();
  ok(!(await p.$eval('#row2_0', e => e.classList.contains('pr'))), 'corrected to 10 × 9 it is not');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
