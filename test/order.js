// Exercise order in the UI (v1.43): PLAYWRIGHT=/path/to/playwright node test/order.js (after tools/build.sh)
// The log's order note and Aim, dragging a card changes the Aim, the Strength card, the stated-max slot field.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof STATE === 'object' && typeof render === 'function');
  // made-up history: spider curls first at 20 kg, then second (after preacher curls) at 18.4 kg
  await p.evaluate(() => {
    const t = today(), sd = sessDef('pull');
    sd.items = [{ ex: 'preacher', sets: 2 }, { ex: 'spider', sets: 2 }, { ex: 'pulldown', sets: 2 }, { ex: 'seated_row', sets: 2 }];
    const top = (w, r) => [{ w, r, done: true }, { w: w - 2, r, done: true }], W = { preacher: 30, pulldown: 60, seated_row: 60 };
    const log = (d, ids, sp) => { STATE.w[d] = { date: d, s: 'pull', fin: true, ex: ids.map(id => ({ id, sets: top(id === 'spider' ? sp : W[id], 10) })) }; };
    for (let i = 14; i >= 6; i--) log(addDays(t, -7 * i), ['spider', 'preacher', 'pulldown', 'seated_row'], 20);
    for (let i = 5; i >= 1; i--) log(addDays(t, -7 * i), ['preacher', 'spider', 'pulldown', 'seated_row'], 18.4);
    S().rotOverride = { id: 'pull', from: t }; bump(); render(true);
  });
  await p.tap('[data-act="start"]');
  const aim = i => p.evaluate(i => { const w = STATE.w[today()], a = aimIn(w, i); return refScore(w.ex[i].id, a, exRir(w.ex[i].id), null); }, i);
  const spider = () => p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'spider'));
  ok(await spider() === 1, 'spider curls start in their usual 2nd slot');
  ok(!(await p.$('#ex1 .ex-order')), 'no order note in the usual slot');
  const usual = await aim(1);
  // drag spider curls to the top
  const g = await (await p.$('#ex1 .grip')).boundingBox(), t0 = await (await p.$('#ex0')).boundingBox();
  const cdp = await p.context().newCDPSession(p), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await p.evaluate(() => scroller().scrollBy(0, document.querySelector('#ex0').getBoundingClientRect().top - 200)); await p.waitForTimeout(100);
  const g2 = await (await p.$('#ex1 .grip')).boundingBox(), top0 = (await (await p.$('#ex0')).boundingBox()).y;
  await touch('touchStart', [{ x: g2.x + 18, y: g2.y + 20, id: 1 }]);
  for (let k = 1; k <= 10; k++) await touch('touchMove', [{ x: g2.x + 18, y: g2.y + 20 + (top0 + 5 - g2.y - 20) * k / 10, id: 1 }]);
  await touch('touchEnd', []); await p.waitForTimeout(300);
  ok(await spider() === 0, 'dragged to first');
  const first = await aim(0);
  ok(first > usual * 1.03, `first today: the Aim goes up (${(first / usual * 100 - 100).toFixed(1)}%)`);
  const note = await p.textContent('#ex0 .ex-order').catch(() => '');
  ok(/1st today, usually 2nd · Aim \+\d+% for that/.test(note), 'order note: ' + note);
  ok(!/—/.test(note), 'no em dash in the note');
  await p.screenshot({ path: path.resolve(__dirname, '../dist/order_log.png') });
  // the placeholder follows the moved Aim
  const ph = await p.getAttribute('#w0_0', 'placeholder');
  ok(ph === String(await p.evaluate(() => fmt(aimIn(STATE.w[today()], 0).w, 2).replace(/,/g, ''))), 'set placeholder shows the moved Aim: ' + ph);

  // Strength card
  await p.evaluate(() => { const w = STATE.w[today()]; delete STATE.w[today()]; bump(); go('strength'); });
  const card = await p.evaluate(() => [...document.querySelectorAll('#view .card')].find(c => /Exercise order/.test(c.textContent))?.textContent.replace(/\s+/g, ' '));
  ok(!!card && /Spider curls/.test(card) && /1 move/.test(card), 'Strength shows the Exercise order card: ' + (card || '').slice(0, 160));
  ok(card && !/—/.test(card), 'no em dash on the card');

  // exercise editor: where the stated max was set
  await p.evaluate(() => { go('plan'); ui.planTab = 'exercises'; ui.editEx = 'spider'; render(true); });
  ok(!!(await p.$('#xe_bpos')), 'editor has the max position field');
  await p.fill('#xe_br', '8'); await p.fill('#xe_bw', '20'); await p.fill('#xe_bpos', '1'); await p.tap('[data-act="saveex"]');
  ok(await p.evaluate(() => S().ex.spider.bpos) === 1, 'saved: max set as exercise 1');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close();
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
