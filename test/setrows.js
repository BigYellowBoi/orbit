// Set rows (v1.40): PLAYWRIGHT=/path/to/playwright node test/setrows.js (after tools/build.sh)
// Removing a warm-up and the Workout duration label.
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

  /* ---------- iPhone: warm-up remove, label ---------- */
  {
    const { p, errs } = await open(b, { ...devices['iPhone 13 Pro Max'] });
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

    // the v1.40 keyboard bar is gone (iOS has its own field arrows)
    await p.tap('#w0_1'); await p.waitForTimeout(50);
    ok(!(await p.$('#kbar')), 'no keyboard bar on a focused set field');
    await p.screenshot({ path: path.resolve(__dirname, '../dist/setrows_phone.png') });
    ok(!errs.length, 'no page errors on the phone: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- desktop mouse: warm-up remove works by click ---------- */
  {
    const { p, errs } = await open(b, { viewport: { width: 1280, height: 900 } });
    await p.click('[data-act="start"]');
    const n0 = (await sets(p, 0)).length;
    await p.click('#ex0 [data-act="addwarm"]'); await p.click('#ex0 .rmw');
    ok((await sets(p, 0)).length === n0, 'click removes a warm-up on desktop');
    ok(!errs.length, 'no page errors on desktop: ' + errs.join(' | '));
    await p.close();
  }

  /* ---------- v1.44: More closes after Remove last set and Swap; default sets; search clear keeps the keyboard down ---------- */
  {
    const { p, errs } = await open(b, { ...devices['iPhone 13 Pro Max'] });
    await p.tap('[data-act="start"]');
    await p.evaluate(() => { const e = STATE.w[today()].ex[0]; e.sets.push({ w: null, r: null, done: false }); render(true); });
    const n0 = (await sets(p, 0)).length;
    await p.tap('#ex0 [data-act="exmore"]'); await p.tap('#ex0 [data-act="remset"]');
    ok((await sets(p, 0)).length === n0 - 1 && !(await p.$('.ex-more')), 'Remove last set removes it and closes More');
    await p.tap('#ex1 [data-act="exmore"]');
    const opt = await p.$$eval('#swap1 option', o => o.map(x => x.value).filter(Boolean)[0]);
    await p.evaluate(() => { const f = INP.swapex; window._sw = 0; INP.swapex = el => { window._sw++; f(el); }; });
    await p.evaluate(v => { const s = document.querySelector('#swap1'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, opt); // iOS fires input on the pick, change later
    ok(await p.evaluate(() => STATE.w[today()].ex[1].id) === opt && !(await p.$('.ex-more')), 'Swap acts on the pick and closes More');
    ok(await p.evaluate(() => window._sw) === 1, 'swapped once, not twice');

    // default sets in the exercise editor: sessions on the old default follow it, + Exercise uses it
    const id = 'spider';
    await p.evaluate(() => { delete STATE.w[today()]; bump(); go('plan'); });
    await p.evaluate(id => { ui.planTab = 'exercises'; ui.editEx = id; render(true); }, id);
    ok(!!(await p.$('#xe_sets')), 'editor has Default sets');
    await p.fill('#xe_sets', '3'); await p.tap('[data-act="saveex"]');
    ok(await p.evaluate(id => S().ex[id].sets, id) === 3, 'default sets saved');
    ok(await p.evaluate(id => Object.values(S().prog.sessions).flatMap(s => s.items).filter(it => it.ex === id).every(it => it.sets === 3), id), 'sessions using it now plan 3 sets');
    await p.evaluate(() => { S().rotOverride = { id: 'push1', from: today() }; go('today'); });
    await p.tap('[data-act="start"]'); await p.tap('[data-act="pickopen"]');
    await p.evaluate(id => ACT.addexid({ dataset: { id } }), id);
    ok(await p.evaluate(id => STATE.w[today()].ex.find(e => e.id === id)?.sets.length, id) === 3, '+ Exercise adds it with 3 sets');

    // v1.45: a session's count is the exercise's count: change it in Sessions and every session and the editor follow; a log changes only its own day
    await p.evaluate(() => { go('plan'); ui.planTab = 'sessions'; ui.openSess = new Set(order()); render(true); });
    const inp = await p.evaluate(id => { const sid = order().find(s => sessDef(s)?.items.some(it => it.ex === id)), j = sessDef(sid).items.findIndex(it => it.ex === id); return `[data-in="isets"][data-id="${sid}"][data-j="${j}"]`; }, id);
    await p.fill(inp, '4'); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(150);
    ok(await p.evaluate(id => S().ex[id].sets, id) === 4, 'changing it in Sessions changes the exercise\'s count');
    ok(await p.evaluate(id => Object.values(S().prog.sessions).flatMap(s => s.items).filter(it => it.ex === id).every(it => it.sets === 4), id), 'every session with it shows 4');
    await p.evaluate(id => { ui.planTab = 'exercises'; ui.editEx = id; render(true); }, id);
    ok(await p.inputValue('#xe_sets') === '4', 'the editor shows the same 4');
    await p.evaluate(() => { ui.editEx = null; S().rotOverride = { id: order().find(s => sessDef(s)?.items.some(it => it.ex === 'spider')), from: today() }; delete STATE.w[today()]; bump(); go('today'); });
    await p.tap('[data-act="start"]');
    const li = await p.evaluate(() => STATE.w[today()].ex.findIndex(e => e.id === 'spider'));
    ok(await p.evaluate(li => STATE.w[today()].ex[li].sets.length, li) === 4, 'a new log starts with 4');
    await p.tap(`#ex${li} [data-act="addset"]`);
    ok(await p.evaluate(li => STATE.w[today()].ex[li].sets.length, li) === 5 && await p.evaluate(() => S().ex.spider.sets) === 4, '+ Set in the log changes that day only');

    // Plan's exercise search: × clears without bringing the keyboard up
    await p.evaluate(() => { go('plan'); ui.planTab = 'exercises'; render(true); });
    await p.tap('#exq'); await p.keyboard.type('curl'); await p.evaluate(() => document.activeElement.blur());
    await p.tap('#exqx');
    ok(await p.inputValue('#exq') === '' && await p.evaluate(() => document.activeElement?.id !== 'exq'), '× clears the search and leaves the keyboard down');
    await p.tap('#exq'); await p.keyboard.type('row'); await p.tap('#exqx');
    ok(await p.inputValue('#exq') === '' && await p.evaluate(() => document.activeElement?.id !== 'exq'), '× while typing also puts the keyboard away');
    await p.tap('#exq'); ok(await p.evaluate(() => document.activeElement?.id === 'exq'), 'tapping the box still brings it up');
    ok(!errs.length, 'no page errors: ' + errs.join(' | '));
    await p.close();
  }

  await b.close();
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
