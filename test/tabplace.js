// v1.60: PLAYWRIGHT=/path/to/playwright node test/tabplace.js (after tools/build.sh)
// Today's open log keeps its scroll place across tab switches; every other screen starts at the top.
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
  await p.evaluate(() => { S().rotOverride = { id: 'pull', from: today() }; render(true); }); await p.click('[data-act="start"]'); await p.waitForSelector('.card.ex');
  await p.evaluate(() => scrollToY(900)); await p.waitForTimeout(100); const y0 = await y(); ok(y0 > 800, 'scrolled down the log');
  await p.evaluate(() => { ui.exMore = 2; render(true); });
  await tab('history'); await p.waitForTimeout(100); ok(await y() === 0, 'History starts at the top');
  await p.evaluate(() => scrollToY(300)); await tab('strength'); await p.waitForTimeout(100); ok(await y() === 0, 'Strength starts at the top');
  await tab('today'); await p.waitForTimeout(150); ok(Math.abs(await y() - y0) <= 1, `back on the log at the same place (${await y()} vs ${y0})`);
  ok(await p.evaluate(() => ui.exMore) === 2, 'open More kept');
  await tab('today'); await p.waitForTimeout(100); ok(await y() === 0, 'tapping Today while on it goes to the top');
  await p.evaluate(() => scrollToY(600)); await p.click('#gear'); await p.waitForTimeout(100); await p.click('#gear'); await p.waitForTimeout(150);
  ok(Math.abs(await y() - 600) <= 1, 'Settings and back keeps the place');
  await p.click('[data-act="logdone"]'); await p.waitForTimeout(100); await p.evaluate(() => scrollToY(200));
  await tab('body'); await tab('today'); await p.waitForTimeout(100); ok(await y() === 0, 'finished log: Today starts at the top');
  await p.click('[data-act="start"]'); await p.waitForSelector('.card.ex');
  await p.evaluate(() => { const ta = document.querySelector('#wnote'); ta.focus(); ta.value = 'mid edit'; }); // typed, no change event
  await tab('history'); ok(await p.evaluate(() => STATE.w[today()].note) === 'mid edit', 'a field mid-typing is saved on a tab switch');
  await p.evaluate(() => { go('today'); const i = document.querySelector('#r0_1'); i.focus(); i.value = '7'; });
  await tab('plan'); ok(await p.evaluate(() => STATE.w[today()].ex[0].sets[1].r) === 7, 'a set mid-typing is saved on a tab switch');
  // v1.62: a past log mid edit
  await p.evaluate(() => { const d = addDays(today(), -3); STATE.w[d] = { date: d, s: 'pull', ex: ['tbar', 'pulldown', 'seated_row', 'pullover', 'preacher', 'spider', 'hammer'].map(id => ({ id, sets: [{ w: 20, r: 8, done: true }, { w: 20, r: 8, done: true }] })) }; saveW(d); ui.logDate = d; go('log'); });
  await p.click('[data-act="logedit"]'); await p.waitForSelector('.card.ex');
  await p.evaluate(() => scrollToY(1000)); await p.waitForTimeout(100);
  await p.evaluate(() => { const i = document.querySelector('#r2_0'); i.focus(); i.value = '11'; }); await p.waitForTimeout(50); const yp = await y(); // focusing can scroll the field into view
  await tab('strength'); ok(await p.evaluate(() => STATE.w[addDays(today(), -3)].ex[2].sets[0].r) === 11, 'past log: field mid-typing saved');
  await tab('history'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => ui.tab === 'log' && ui.logEdit === ui.logDate) && Math.abs(await y() - yp) <= 1, `History brings you back into the edit at the same place (${await y()} vs ${yp})`);
  await tab('history'); await p.waitForTimeout(100); ok(await p.evaluate(() => ui.tab) === 'history', 'History again from the log: the list');
  await tab('today'); await tab('history'); ok(await p.evaluate(() => ui.tab) === 'history', 'after that, History stays the list');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
