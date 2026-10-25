// v1.64: PLAYWRIGHT=/path/to/playwright node test/v164.js (after tools/build.sh)
// Swipe a set row to delete it (iPhone touch), Strength trend lands on the chart, no cardio cell once cardio is removed
// (back if WHOOP brings it in later), session colours, rep maxes and exercise order cards.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13 Pro Max'] }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof render === 'function');
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (sel, dx) => { await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(50); const r = await p.locator(sel).boundingBox(), x = r.x + r.width * 0.6, y = r.y + 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / 8, y }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(250); };
  // history to look at: a week of Pull with cardio, and a past Legs day
  await p.evaluate(() => { for (let k = 21; k >= 3; k -= 3) { const d = addDays(today(), -k), s = ['push1', 'pull', 'push2', 'legs'][(k / 3) % 4]; STATE.w[d] = { date: d, s, ex: sessDef(s).items.map((it, q) => ({ id: it.ex, sets: [{ w: 20 + q, r: 9, done: true }, { w: 20 + q, r: 8, done: true }] })) }; } bump(); S().rotOverride = { id: 'pull', from: today() }; render(true); });
  await p.click('[data-act="start"]'); await p.waitForSelector('.card.ex');
  const n0 = await p.evaluate(() => STATE.w[today()].ex[1].sets.length);
  await swipe('#row1_1', -140); ok(await p.locator('.swr.open').count() === 1, 'swipe left opens the row on Delete');
  await swipe('#row1_1', 120); ok(await p.locator('.swr.open').count() === 0, 'swipe right closes it');
  await swipe('#row1_1', -140); await p.click('.swr.open .setdel'); ok(await p.evaluate(() => STATE.w[today()].ex[1].sets.length) === n0 - 1, 'Delete removes that set');
  await swipe('#row1_0', -140); await p.tap('#ex2 h3'); ok(await p.locator('.swr.open').count() === 0 && await p.evaluate(() => ui.exHist) == null, 'a tap elsewhere only closes the row');
  await p.waitForTimeout(450); await p.tap('#w2_0'); ok(await p.evaluate(() => document.activeElement?.id) === 'w2_0', 'a plain tap still focuses a field');
  // cardio and duration folded; removing cardio drops it from the summary
  ok(await p.locator('#cmin').count() === 0 && /Cardio and duration/.test(await p.locator('[data-act="extras"]').innerText()), 'cardio folded by default');
  await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(100); await p.click('[data-act="extras"]'); await p.click('[data-act="cardiorem"]');
  await p.fill('#r0_0', '9'); await p.evaluate(() => { for (const e of STATE.w[today()].ex) for (const s of e.sets) { s.w = s.w ?? 20; s.r = s.r || 8; s.done = true; } saveW(today()); render(true); }); // v1.67: Done needs every set filled
  await p.click('[data-act="logdone"]'); await p.waitForSelector('.hero.just, .hero');
  ok(await p.locator('.hero .stats .stat').count() === 2, 'summary: sets and duration only');
  await p.evaluate(() => { STATE.d[today()] = { acts: [{ n: 'Stairmaster', t: '18:30', min: 24 }] }; bump(); sweepCardio(); render(true); });
  ok(await p.locator('.hero .stats .stat').count() === 3 && /24/.test(await p.locator('.hero .stats').innerText()), 'WHOOP cardio after removal: it comes back');
  // Strength trend from a log card lands on the chart, wherever it is in the card order
  await p.evaluate(() => { go('strength'); go('today'); S().layout = { ...(S().layout || {}), strength: [...CARD_KEYS.strength.filter(k => k !== 'chart'), 'chart'] }; ui.editToday = true; render(true); });
  await p.click('#ex0 [data-act="exhist"]'); await p.click('#ex0 [data-act="liftgo"]'); await p.waitForTimeout(150);
  const [top, bot] = await p.evaluate(() => { const r = $('#liftchart').getBoundingClientRect(); return [r.top - $('.top').getBoundingClientRect().bottom, $('.tabs').getBoundingClientRect().top - r.bottom]; });
  ok(top >= 0 && (top < 40 || bot >= 0), `chart card in view (${Math.round(top)}px from the header, ${Math.round(bot)}px above the tabs)`);
  // colours, rep maxes, exercise order
  await p.evaluate(() => go('history'));
  const cols = await p.evaluate(() => [...document.querySelectorAll('.calk span')].map(s => s.textContent + '=' + s.querySelector('i').style.background));
  ok(cols.some(c => /^Push 1=rgb\(255, 90, 110\)/.test(c)) && cols.some(c => /^Pull=rgb\(61, 220, 132\)/.test(c)) && cols.some(c => /^Push 2=rgb\(74, 163, 255\)/.test(c)) && cols.some(c => /^Legs=rgb\(238, 240, 244\)/.test(c)), 'session colours: ' + cols.join(', '));
  await p.evaluate(() => go('strength'));
  const rm = await p.locator('table.repmax').innerText(); ok(/^REPS\s+BEST\s+ESTIMATE/i.test(rm) && /\n1\t/.test(rm), 'rep maxes: Reps, Best, Estimate from 1 rep: ' + rm.slice(0, 80));
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
