// Finished exercises fold (v1.76): PLAYWRIGHT=/path/to/playwright node test/v176.js (after tools/build.sh)
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
  const shut = i => p.$eval(`#ex${i}`, e => e.classList.contains('shut'));
  const n = i => p.evaluate(i => STATE.w[today()].ex[i].sets.length, i);
  const fillAll = async (i, skipLast) => { const k = await n(i); for (let j = 0; j < k - (skipLast ? 1 : 0); j++) { await p.fill(`#w${i}_${j}`, '20'); await p.fill(`#r${i}_${j}`, '8'); await p.locator(`#r${i}_${j}`).blur(); } return k; };

  // 1. the last reps of an exercise fold it once the field is left
  const k0 = await fillAll(0, true);
  ok(!(await shut(0)), 'open while a set is still empty');
  await p.fill(`#w0_${k0 - 1}`, '20'); await p.fill(`#r0_${k0 - 1}`, '8');
  ok(!(await shut(0)), 'not folded while the last reps are still being typed');
  await p.locator(`#r0_${k0 - 1}`).blur(); await p.waitForTimeout(50);
  ok(await shut(0), 'folds once the last reps are in');
  ok(/20 kg × 8/.test(await p.$eval('#ex0 .ex-sum small', e => e.textContent)), 'folded line shows the sets');
  ok(!(await shut(1)), 'the next exercise stays open');

  // 2. moving straight into the next card's field folds the finished one and keeps that field focused
  const k1 = await fillAll(1, true);
  await p.fill(`#w1_${k1 - 1}`, '20'); await p.fill(`#r1_${k1 - 1}`, '8');
  await p.focus('#w2_0'); await p.waitForTimeout(50);
  ok(await shut(1), 'folds when focus moves on to the next exercise');
  ok(await p.evaluate(() => document.activeElement?.id) === 'w2_0', 'the next field keeps focus');

  // 3. open by tap stays open through edits; fold button folds it
  await p.tap('#ex0 [data-act="exopen"]');
  ok(!(await shut(0)) && !!(await p.$('#ex0 [data-act="exfold"]')), 'tap opens it, with a fold button');
  await p.fill('#r0_0', '9'); await p.locator('#r0_0').blur(); await p.waitForTimeout(50);
  ok(!(await shut(0)), 'an opened card stays open while edited');
  await p.tap('#ex0 [data-act="exfold"]');
  ok(await shut(0), 'fold button folds it');

  // 4. steppers wait a moment so a second tap can land
  await p.locator('#w2_0').blur();
  const k2 = await fillAll(2, true), last = `#ex2 [data-act="step"][data-s="${k2 - 1}"][data-k="r"][data-d="1"]`;
  await p.fill(`#w2_${k2 - 1}`, '20'); await p.locator(`#w2_${k2 - 1}`).blur();
  await p.tap(last); await p.waitForTimeout(300);
  ok(!(await shut(2)), 'a stepper tap does not fold straight away');
  await p.tap(last); await p.waitForTimeout(1800);
  ok(await shut(2), 'folds after the pause');

  // 5. Done shows once all filled; the next-set button skips folded cards
  await p.evaluate(() => { for (const e of STATE.w[today()].ex) for (const s of e.sets) { s.w = s.w ?? 20; s.r = s.r || 8; s.done = true; } saveW(today()); render(true); });
  ok(await p.locator('.card.ex').count() === await p.locator('.card.ex.shut').count(), 'every finished exercise is folded after a render');
  ok(!!(await p.$('[data-act="logdone"]')), 'Done is offered');

  // 6. a past log being edited starts open
  await p.evaluate(() => { const d = addDays(today(), -3); STATE.w[d] = { date: d, s: 'pull', fin: true, ex: ['tbar', 'pulldown'].map(id => ({ id, sets: [{ w: 20, r: 8, done: true }, { w: 20, r: 8, done: true }] })) }; saveW(d); ui.logDate = d; go('log'); });
  await p.tap('[data-act="logedit"]');
  ok(!(await p.$('.card.ex.shut')) && !!(await p.$('.set .in')), 'past log edit starts open');
  await p.tap('#ex0 [data-act="exfold"]');
  ok(await shut(0), 'and can be folded');

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
