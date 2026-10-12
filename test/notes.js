const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route('https://fonts.**', r => r.abort());
  await p.goto('file://' + require('path').resolve(__dirname, '../dist/artifact.html'));
  await p.evaluate(() => { const d = addDays(today(), -4); const w = newWorkout(d, 'pull'); w.ex.forEach(e => e.sets.forEach(s => { s.w = 40; s.r = 8; s.done = true; })); w.note = 'Grip went first on rows, use straps next time'; w.ex[0].note = 'T-bar: chest pad at notch 3'; STATE.w[d] = w; S().rotOverride = { id: 'pull', from: today() }; render(true); });
  await p.click('[data-act="start"]');
  console.log('last note banner:', (await p.textContent('.lastnote')).replace(/\s+/g, ' '));
  console.log('ex last note:', await p.textContent('#ex0 .ex-lastnote'));
  await p.click('#ex1 [data-act="exnote"]'); await p.keyboard.type('Pulldown: thumbless grip'); await p.click('body');
  await p.fill('#wnote', 'Good session, lower back fine'); await p.click('body');
  await p.screenshot({ path: require('path').resolve(__dirname, '../dist/n_log.png') });
  await p.click('.tabs [data-tab="history"]'); console.log('history row:', (await p.textContent('.hrow')).replace(/\s+/g, ' '));
  await p.click('[data-act="histview"][data-v="notes"]');
  console.log('chips:', (await p.textContent('.chips')).replace(/\s+/g, ' '));
  await p.click('[data-act="notenew"]'); await p.selectOption('#ng', 'quads'); await p.fill('#nt', 'Hack squat: feet high and narrow'); await p.click('[data-act="noteadd"]');
  // edit a session-derived note in the list
  await p.click('[data-act="notefilter"][data-v="back"]');
  const k = await p.getAttribute('[data-act="noteedit"]', 'data-k'); await p.click('[data-act="noteedit"]');
  const ta = await p.$('.notes textarea'); await ta.fill('EDITED IN LIST'); await p.click('[data-act="notesave"]');
  console.log('edited key', k, '| workout note unchanged:', await p.evaluate(() => Object.values(STATE.w).map(w => w.note).filter(Boolean)), '| list shows:', (await p.textContent('.notes')).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('[data-act="notefilter"][data-v="all"]'); await p.screenshot({ path: require('path').resolve(__dirname, '../dist/n_notes.png'), fullPage: true });
  console.log('errors', errs); await b.close();
})();
