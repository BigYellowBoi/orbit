// v1.70: PLAYWRIGHT=/path/to/playwright node test/swap.js (after tools/build.sh)
// Swap one coming day's session from Coming up: the rotation carries on from it (skipping what sat between),
// undo returns to the rotation, and rest / swap replace each other.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof render === 'function');
  const seq = () => p.evaluate(() => upcoming(6).map(u => u.s));
  const base = await seq(), o = await p.evaluate(() => trainIds());
  const d2 = await p.evaluate(() => addDays(today(), 2));
  // pick a session two steps ahead of what day 2 would be, so one session is skipped
  const tgt = o[(o.indexOf(base[2]) + 2) % o.length];
  await p.click(`.strip [data-act="strippick"][data-date="${d2}"]`);
  await p.click('.pickrow [data-act="swapopen"]');
  ok(await p.locator('.pickswap .chip').count() === o.length, 'Change shows every training session');
  await p.click(`.pickswap [data-act="swapsess"][data-id="${tgt}"]`);
  const after = await seq();
  ok(after[0] === base[0] && after[1] === base[1], 'days before the swap are unchanged');
  ok(after[2] === tgt, `day 2 is the swapped session (${after[2]})`);
  ok(after[3] === await p.evaluate(id => nextAfter(id), tgt), 'the rotation carries on from the swapped session');
  ok(await p.locator(`.strip [data-date="${d2}"].planned`).count() === 1, 'the swapped day is marked on the strip');
  // rest on that day replaces the swap
  await p.click(`.strip [data-act="strippick"][data-date="${d2}"]`);
  ok(/swapped/.test(await p.locator('.pickrow').innerText()), 'pick row says swapped');
  await p.click('.pickrow [data-act="reston"]');
  ok(!(await p.evaluate(d => S().sessSwap?.[d], d2)) && await p.evaluate(d => plannedRest(d), d2), 'planning rest drops the swap');
  // swap again replaces the rest; undo goes back to the rotation
  await p.click(`.strip [data-act="strippick"][data-date="${d2}"]`); await p.click('.pickrow [data-act="swapopen"]');
  await p.click(`.pickswap [data-act="swapsess"][data-id="${tgt}"]`);
  ok(!(await p.evaluate(d => plannedRest(d), d2)), 'swapping drops planned rest');
  await p.click(`.strip [data-act="strippick"][data-date="${d2}"]`); await p.click('.pickrow [data-act="swapoff"]');
  ok(JSON.stringify(await seq()) === JSON.stringify(base), 'Undo swap restores the rotation');
  // a swap for today shows on Today's hero, and logging uses it up
  const t2 = o.find(id => id !== base[0]);
  await p.evaluate(id => { S().sessSwap = { [today()]: id }; saveSettings(); render(true); }, t2);
  ok((await p.locator('#view .hero h1').first().innerText()) === await p.evaluate(id => sessDef(id).name, t2), "today's swap shows on Today");
  await p.click(`#view [data-act="start"][data-id="${t2}"]`);
  ok(!(await p.evaluate(() => S().sessSwap?.[today()])), 'starting the session uses the swap up');
  ok(!errs.length, 'no page errors: ' + errs.join('; '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
