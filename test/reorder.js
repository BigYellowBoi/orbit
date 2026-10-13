// Exercise reorder inside a day's log (v1.39): PLAYWRIGHT=/path/to/playwright node test/reorder.js (after tools/build.sh)
// 1. iPhone (Chromium emulation, touch, Scroll box layout): today's log, a field mid-typing, a long drag that auto-scrolls.
// 2. Desktop (mouse): a past log opened from History.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };

async function open(b, opts) {
  const p = await b.newPage(opts), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:/, r => r.abort()); // no fonts, GitHub or helper
  await p.goto(url); await p.waitForFunction(() => typeof STATE === 'object' && typeof render === 'function');
  return { p, errs };
}
const order = (p, d) => p.evaluate(d => STATE.w[d || today()].ex.map(e => e.id), d);
const domOrder = p => p.$$eval('#view .exs > .card.ex', els => els.map(e => e.querySelector('h3').textContent));
const center = async (p, sel) => { await p.evaluate(sel => { const e = document.querySelector(sel), r = e.getBoundingClientRect(); scroller().scrollBy(0, r.top - innerHeight / 3); }, sel); await p.waitForTimeout(80); const r = await (await p.$(sel)).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };

(async () => {
  const b = await chromium.launch();

  /* ---------- 1. iPhone, touch, Scroll box ---------- */
  {
    const { p, errs } = await open(b, { ...devices['iPhone 13 Pro Max'], defaultBrowserType: undefined });
    ok(await p.evaluate(() => document.documentElement.classList.contains('sbox')), 'Scroll box layout is on');
    await p.evaluate(() => { S().rotOverride = { id: 'push1', from: today() }; render(true); });
    const planBefore = await p.evaluate(() => JSON.stringify(S().prog));
    await p.tap('[data-act="start"]');
    const ids = await order(p), n = ids.length;
    ok(n >= 3, `log has ${n} exercises`);
    ok(await p.$$eval('#view .exs .grip[data-grip="ex"]', g => g.length) === n, 'every exercise card has a drag handle');
    // first exercise: a warm-up, a ticked set and a note
    await p.evaluate(() => { const w = STATE.w[today()], e = w.ex[0]; e.sets.unshift({ w: 20, r: 10, done: true, t: 'w' }); e.sets[1].w = 60; e.sets[1].r = 8; e.sets[1].done = true; e.note = 'Seat at 4'; saveW(w.date); render(true); });
    const first = await p.evaluate(() => JSON.stringify(STATE.w[today()].ex[0]));
    // a set on the second exercise, mid-typing (focused, no blur, no change event yet)
    await p.tap('#w1_0'); await p.keyboard.type('47.5');
    ok(await p.evaluate(() => document.activeElement?.id) === 'w1_0', 'set field is focused mid-typing');
    // touch-drag the first card's handle down to the tab bar edge and hold, so the list auto-scrolls to the end
    const cdp = await p.context().newCDPSession(p), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const g = await center(p, '#ex0 .grip'), vh = (await p.viewportSize()).height;
    await touch('touchStart', [{ x: g.x, y: g.y, id: 1 }]);
    ok(await p.evaluate(() => document.activeElement?.id !== 'w1_0'), 'the field lets go as the drag starts');
    ok(await p.evaluate(() => STATE.w[today()].ex[1].sets[0].w) === 47.5, 'the typed weight was saved to the right exercise before anything moved');
    for (let y = g.y; y < vh - 40; y += 30) await touch('touchMove', [{ x: g.x, y, id: 1 }]);
    await touch('touchMove', [{ x: g.x, y: vh - 40, id: 1 }]);
    await p.waitForTimeout(2500); // finger held at the bottom edge
    ok(await p.evaluate(() => drag && drag.to) === n - 1, 'auto-scroll carried the drag to the last slot');
    await touch('touchEnd', []);
    await p.waitForTimeout(300);
    const after = await order(p);
    ok(after.join() === [...ids.slice(1), ids[0]].join(), 'first exercise is now last, the rest keep their order');
    ok(await p.evaluate(() => JSON.stringify(STATE.w[today()].ex.at(-1))) === first, 'sets, warm-up, ticks and note moved with it, unchanged');
    ok(await p.evaluate(() => STATE.w[today()].ex[0].sets[0].w) === 47.5, 'the typed set stayed on its exercise');
    ok((await domOrder(p)).length === n, 'nothing was deleted from the page');
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('rotation-logbook-v1')).w[today()].ex.map(e => e.id).join()) === after.join(), 'new order is saved');
    ok(await p.evaluate(() => JSON.stringify(S().prog)) === planBefore, 'the Plan is untouched');
    // next-set button: first empty set in the new order (the old second exercise, now first)
    await p.evaluate(() => { fabHid = false; renderFab(); });
    await p.tap('#nextset'); await p.waitForTimeout(700);
    ok(await p.evaluate(() => document.querySelector('.set.seek')?.id) === 'row0_0', 'next-set button goes to the first empty set in the new order (new first exercise)');
    // a short drag back up one slot with touch
    const before2 = await order(p);
    await p.evaluate(() => scroller().scrollTo(0, 0)); await p.waitForTimeout(100);
    const g2 = await center(p, '#ex1 .grip'), h0 = (await (await p.$('#ex0')).boundingBox()).height;
    await touch('touchStart', [{ x: g2.x, y: g2.y, id: 2 }]);
    for (let k = 1; k <= 8; k++) await touch('touchMove', [{ x: g2.x, y: g2.y - (h0 * 0.8) * k / 8, id: 2 }]);
    await touch('touchEnd', []); await p.waitForTimeout(300);
    ok((await order(p)).join() === [before2[1], before2[0], ...before2.slice(2)].join(), 'a short touch drag swaps neighbours');
    // a tap on the handle (no movement) changes nothing
    const before3 = await order(p), g3 = await center(p, '#ex0 .grip');
    await touch('touchStart', [{ x: g3.x, y: g3.y, id: 3 }]); await touch('touchEnd', []); await p.waitForTimeout(200);
    ok((await order(p)).join() === before3.join(), 'tapping a handle changes nothing');
    await p.screenshot({ path: path.resolve(__dirname, '../dist/reorder_phone.png') });
    ok(!errs.length, 'no page errors on the phone: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- 2. Desktop mouse, a past log from History ---------- */
  {
    const { p, errs } = await open(b, { viewport: { width: 1280, height: 900 } });
    const d = await p.evaluate(() => { const d = addDays(today(), -3), w = newWorkout(d, 'pull'); w.ex.forEach(e => e.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.fin = true; w.ex[2].note = 'straps'; STATE.w[d] = w; saveW(d); go('history'); return d; });
    await p.click(`[data-act="openlog"][data-d="${d}"]`);
    ok(await p.evaluate(() => ui.tab) === 'log', 'past log is open');
    const ids = await order(p, d), todayLog = await p.evaluate(() => !!STATE.w[today()]);
    // ex 2 has its history and More open: they follow it
    await p.click('#ex2 [data-act="exhist"]'); await p.click('#ex2 [data-act="exmore"]');
    await p.evaluate(() => scroller().scrollTo(0, 0));
    const g = await center(p, '#ex2 .grip'), t = await (await p.$('#ex0')).boundingBox();
    await p.mouse.move(g.x, g.y); await p.mouse.down();
    for (let k = 1; k <= 10; k++) await p.mouse.move(g.x, g.y + (t.y + 10 - g.y) * k / 10);
    await p.mouse.up(); await p.waitForTimeout(300);
    const after = await order(p, d);
    ok(after.join() === [ids[2], ids[0], ids[1], ...ids.slice(3)].join(), 'mouse drag moves the third exercise to the top of the past log');
    ok(await p.evaluate(d => STATE.w[d].ex[0].note, d) === 'straps', 'its note came with it');
    ok(await p.evaluate(() => [ui.exHist, ui.exMore].join()) === '0,0', 'its open history and More panel followed it');
    ok(await p.$('#ex0 .exhist') && await p.$('#ex0 .ex-more'), 'and are drawn on the moved card');
    ok(await p.evaluate(() => !!STATE.w[today()]) === todayLog, 'today is untouched');
    await p.screenshot({ path: path.resolve(__dirname, '../dist/reorder_desktop.png') });
    ok(!errs.length, 'no page errors on desktop: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- Plan's session drag still works with the shared drag code ---------- */
  {
    const { p, errs } = await open(b, { viewport: { width: 390, height: 844 } });
    await p.evaluate(() => { ui.planTab = 'sessions'; go('plan'); });
    const ids = await p.$$eval('#view .card.sess[data-dragitem]', e => e.map(x => x.dataset.id));
    const g = await center(p, `.card.sess[data-id="${ids[1]}"] .grip`), t = await (await p.$(`.card.sess[data-id="${ids[0]}"]`)).boundingBox();
    await p.mouse.move(g.x, g.y); await p.mouse.down();
    for (let k = 1; k <= 8; k++) await p.mouse.move(g.x, g.y + (t.y + 5 - g.y) * k / 8);
    await p.mouse.up(); await p.waitForTimeout(200);
    ok(await p.evaluate(() => S().prog.order.slice(0, 2).join()) === [ids[1], ids[0]].join(), 'Plan session drag still reorders sessions');
    ok(!errs.length, 'no page errors on Plan: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- 3. a single exercise has no handle ---------- */
  {
    const { p } = await open(b, { viewport: { width: 390, height: 844 } });
    await p.evaluate(() => { const w = newWorkout(today(), 'push1'); w.ex = w.ex.slice(0, 1); STATE.w[today()] = w; render(true); });
    ok(!(await p.$('#view .grip[data-grip="ex"]')), 'no handle when there is one exercise');
    await p.close();
  }

  await b.close();
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
