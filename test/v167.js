// v1.67: PLAYWRIGHT=/path/to/playwright node test/v167.js (after tools/build.sh)
// UPDATES.md batch: session notes filed once under General; tapping an exercise row opens its editor with Save in view;
// Volume shows this week with planned sets and a tappable breakdown; a log stays in progress until every set is filled
// and Done is pressed, and only finished sessions reach History.
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ ...devices['iPhone 13 Pro Max'] }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/^https?:/, r => r.abort());
  await p.goto(url); await p.waitForFunction(() => typeof render === 'function');
  const tab = t => p.dispatchEvent(`.tabs [data-tab="${t}"]`, 'pointerdown'), act = a => p.locator(`#view [data-act="${a}"]`);
  // history: an old Push 1 (before the release, no fin flag) with a session note, and a finished Pull this week
  const days = await p.evaluate(() => {
    const old = addDays(FIN_FROM, -3), mk = (d, s, extra) => { STATE.w[d] = { date: d, s, ex: sessDef(s).items.map(it => ({ id: it.ex, sets: [{ w: 20, r: 9, done: true }, { w: 20, r: 8, done: true }] })), ...extra }; };
    mk(old, 'push1', { note: 'Felt strong today' });
    const y = addDays(today(), -1); if (y >= weekStart(today())) mk(y, 'pull', { fin: true });
    bump(); S().rotOverride = { id: 'legs', from: today() }; saveSettings(); render(true); return { old, y };
  });

  /* 1. session note: once, under General, not under each muscle trained */
  await tab('history'); await p.click('[data-act="histview"][data-v="notes"]');
  const groupsWithNote = await p.$$eval('#view .sec', secs => secs.filter(s => /Felt strong today/.test(s.textContent)).map(s => s.querySelector('.eyebrow').textContent));
  ok(groupsWithNote.length === 1 && groupsWithNote[0] === 'General', `session note listed once, under General (${groupsWithNote.join(', ')})`);
  await p.click('[data-act="histview"][data-v="sessions"]');
  ok(await p.locator(`.hrow[data-d="${days.old}"]`).count() === 1, 'an old log with no fin flag still shows in History');

  /* 2 + 3. exercises list: tap the row, editor opens with Save fully on screen */
  await tab('plan'); await p.click('[data-act="plantab"][data-v="exercises"]');
  const row = p.locator('#exlist li.exrow').nth(8); await row.scrollIntoViewIfNeeded(); const name = await row.locator('span').first().innerText();
  await row.locator('.sub').click(); await p.waitForTimeout(500);
  ok(await p.locator('#exlist [data-edit] #xe_n').inputValue() === name, `tapping the row (not Edit) opens ${name}`);
  const inView = await p.evaluate(() => { const ed = document.querySelector('#exlist [data-edit]').getBoundingClientRect(), s = document.querySelector('#exlist [data-edit] [data-act="saveex"]').getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect().bottom, bot = document.querySelector('.tabs').getBoundingClientRect().top; return { box: ed.top >= top - 1 && ed.bottom <= bot + 1, save: s.top >= top && s.bottom <= bot, h: ed.height, room: bot - top }; });
  ok(inView.save, 'Save is on screen without scrolling');
  ok(inView.box || inView.h > inView.room, `the whole editor box is on screen when it fits (${Math.round(inView.h)} of ${Math.round(inView.room)}px)`);
  await p.click('#exlist [data-edit] [data-act="editex"]');

  /* 5. in progress until every set is filled and Done is pressed */
  await tab('today'); await p.click('[data-act="start"]'); await p.waitForSelector('.card.ex');
  ok(await p.locator('#logend').innerText() === 'Save' && await act('logdone').count() === 0, 'with empty sets the bottom button is Save, no Done');
  const sets = await p.evaluate(() => STATE.w[today()].ex.map((e, i) => e.sets.map((s, j) => `${i}_${j}`)).flat());
  for (const k of sets.slice(0, -1)) { await p.fill('#r' + k, '8'); }
  ok(await p.locator('#logend').innerText() === 'Save', 'one set still empty: still Save');
  await p.click('#logend'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !STATE.w[today()].fin) && await p.locator('.card.ex').count() > 0, 'Save keeps the session in progress, the log stays open');
  await tab('history'); ok(await p.locator(`.hrow[data-d="${await p.evaluate(() => today())}"]`).count() === 0, 'History hides the in-progress session');

  /* 4. Volume while in progress: ticked sets solid, unticked planned, caption, breakdown on tap */
  await tab('strength'); await p.waitForSelector('[data-card="volume"]');
  ok(await p.locator('[data-card="volume"] .legend .vk').count() === 3, 'legend: done, half credit, planned');
  ok(/^Planned: Today Legs/.test(await p.locator('.vcap').innerText()), `caption names the sessions assumed (${await p.locator('.vcap').innerText()})`);
  const quads = p.locator('.hbars.proj li[data-g="quads"]');
  ok(/done \+ 1 planned/.test(await quads.locator('.v').innerText()) || /done/.test(await quads.locator('.v').innerText()), `numbers beside the bar (${await quads.locator('.v').innerText()})`);
  ok(await p.locator('.hbars.proj .fill.plan').count() > 0, 'planned sets drawn outlined');
  ok(await p.locator('.hbars .tn-warn').count() === 0, 'no warning colour below the band');
  await quads.click(); await p.waitForTimeout(150);
  ok(await p.evaluate(() => ui.volG) === 'quads' && /Quads/.test(await p.locator('[data-card="volsrc"] .eyebrow').textContent()), 'tapping a bar opens its breakdown');
  ok(await p.locator('[data-card="volsrc"] tbody').count() === 1, 'only that muscle in the breakdown');
  await p.click('[data-card="volsrc"] [data-act="volg"][data-g=""]'); ok(await p.evaluate(() => ui.volG) === null, 'All muscles shows every muscle again');
  const dayCells = await p.$$eval('[data-card="volsrc"] td.dy', tds => tds.map(t => t.textContent));
  ok(dayCells.includes('Today') && dayCells.includes('Today, planned'), `breakdown names the day, done or planned (${[...new Set(dayCells)].join(' | ')})`);

  /* 5 continued: removing the empty set reaches Done; Done finishes it */
  await tab('today'); await p.waitForSelector('.card.ex');
  const last = sets[sets.length - 1].split('_').map(Number), lk = sets[sets.length - 1];
  await p.fill('#r' + lk, '8'); ok(await p.locator('#logend').innerText() === 'Done', 'filling the last set swaps Save for Done as you type');
  await p.fill('#r' + lk, ''); ok(await p.locator('#logend').innerText() === 'Save', 'emptying a set brings Save back');
  await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(80);
  await p.evaluate(([i]) => { const b = document.querySelector(`[data-act="exmore"][data-e="${i}"]`); b.click(); }, last); await p.waitForTimeout(80);
  await p.click(`[data-act="remset"][data-e="${last[0]}"]`); await p.waitForTimeout(100);
  ok(await p.locator('#logend').innerText() === 'Done', 'removing the empty set counts as filled: Done appears');
  await p.click('#logend'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => STATE.w[today()].fin === true), 'Done marks the session finished');
  await tab('history'); ok(await p.locator(`.hrow[data-d="${await p.evaluate(() => today())}"]`).count() === 1, 'after Done it shows in History');

  /* past days stay Save only */
  await p.click(`.hrow[data-d="${days.old}"]`); await p.click('[data-act="logedit"]'); await p.waitForTimeout(100);
  ok(await act('logdone').count() === 0 && await act('logsave').count() > 0, 'a past day opened from History is Save only');

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(`${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
})();
