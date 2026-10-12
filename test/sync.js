const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const B = require('path').resolve(__dirname, '..');
const MOCK = seed => `(() => {
  const store = new Map(Object.entries(${JSON.stringify(seed || {})}));
  const subs = [];
  const snapDoc = p => ({ id: p.split('/').pop(), exists: store.has(p), data: () => store.get(p), metadata: { hasPendingWrites: false, fromCache: false } });
  const notify = () => setTimeout(() => subs.forEach(s => s()), 30);
  const db = {
    doc: p => ({ set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); notify(); }, delete: async () => { store.delete(p); notify(); },
      onSnapshot: (n) => { const f = () => n(snapDoc(p)); subs.push(f); setTimeout(f, 20); return () => {}; } }),
    collection: c => { const q = { limit: () => q, onSnapshot: (n) => { const f = () => { const docs = [...store.keys()].filter(k => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1).map(snapDoc); n({ docs, size: docs.length, empty: !docs.length, metadata: { hasPendingWrites: false } }); }; subs.push(f); setTimeout(f, 40); return () => {}; } }; return q; },
  };
  window.__store = store;
  window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u1' } : null };
})();`;
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  // session 1: fresh, log a session, check cloud docs
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(MOCK({}));
  await page.route('https://fonts.**', r => r.abort());
  await page.goto('file://' + B + '/dist/artifact.html'); await page.waitForTimeout(400);
  console.log('sync label:', await page.evaluate(() => Cloud.ready));
  await page.click('[data-act="start"]'); await page.fill('#r0_0', '8'); await page.click('body');
  await page.waitForTimeout(1500);
  const dump = await page.evaluate(() => Object.fromEntries(window.__store));
  console.log('cloud docs:', Object.keys(dump));
  // external change: another device deletes today's workout month → should vanish locally
  // session 2: new browser profile (empty localStorage), same cloud
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(MOCK(dump));
  await page.route('https://fonts.**', r => r.abort());
  await page.goto('file://' + B + '/dist/artifact.html'); await page.waitForTimeout(600);
  console.log('session2 workouts:', await page.evaluate(() => Object.keys(STATE.w)), 'sync:', await page.evaluate(() => Cloud.ready));
  console.log('session2 today hero:', (await page.textContent('.hero')).replace(/\s+/g, ' ').slice(0, 80));
  // edit settings → saved to cloud
  await page.evaluate(() => { S().cardio.min = 25; saveSettings(); });
  await page.waitForTimeout(1200);
  console.log('cloud cardio min:', await page.evaluate(() => window.__store.get('data/users/u1/settings').cardio.min));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
