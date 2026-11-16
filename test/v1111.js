// v1.111: PLAYWRIGHT=/path/to/playwright node test/v1111.js (after tools/build.sh)
// A blank Today ring pops when its first value arrives (background render); alcohol buttons read Yes, No. Synthetic data only.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForFunction(() => typeof render === 'function');
  await p.evaluate(() => { const t = today(); STATE.d[t] = { off: '00:01' }; bump(); go('today'); render(true); });
  ok(await p.evaluate(() => [...document.querySelectorAll('#view .alc-b button')].map(b => b.textContent).join(',')) === 'Yes,No', 'alcohol: Yes left, No right');
  await p.evaluate(() => { STATE.d[today()].rec = 72; bump(); render(); });
  const r = await p.evaluate(() => [...document.querySelectorAll('#view .wring')].map(b => b.dataset.live + ':' + b.classList.contains('pop')));
  ok(r.join() === 'ring-sleep:false,ring-recovery:true,ring-strain:false', 'only the ring that got data pops: ' + r);
  await p.evaluate(() => { STATE.d[today()].rec = 80; bump(); render(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { STATE.d[today()].rec = 81; bump(); render(); });
  ok(!(await p.evaluate(() => $('#view .wring[data-live="ring-recovery"]').classList.contains('pop'))), 'a ring that already had a value does not pop');
  await p.evaluate(() => { STATE.d[today()].sp = 90; bump(); render(); });
  await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/pop.png', clip: { x: 0, y: 0, width: 428, height: 260 } });
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
