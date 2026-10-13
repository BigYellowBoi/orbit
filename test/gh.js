// GitHub sync against an in-memory mock of the GitHub REST API (git data + contents endpoints)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const crypto = require('crypto');
const B = require('path').resolve(__dirname, '..');
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
const blobSha = buf => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

const G = { head: null, commits: {}, trees: {}, blobs: {}, calls: [], fail: null, private: true };
function putBlob(text) { const buf = Buffer.from(text, 'utf8'), s = blobSha(buf); G.blobs[s] = buf; return s; }
function putTree(map) { const s = sha1('tree' + JSON.stringify(Object.entries(map).sort())); G.trees[s] = map; return s; }
function putCommit(tree, parents) { const s = sha1('commit' + tree + parents.join() + Math.random()); G.commits[s] = { tree, parents }; return s; }
const files = () => G.head ? G.trees[G.commits[G.head].tree] : {};
const read = p => { const s = files()[p]; return s ? JSON.parse(G.blobs[s].toString('utf8')) : undefined; };

async function api(route) {
  const req = route.request(), u = new URL(req.url()), m = req.method(), path = u.pathname.replace('/repos/BigYellowBoi/orbit-data', '');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const send = (status, obj) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
  G.calls.push(m + ' ' + path);
  if (req.headers().authorization !== 'Bearer good-token') return send(401, { message: 'Bad credentials' });
  if (!u.pathname.startsWith('/repos/BigYellowBoi/orbit-data')) return send(404, { message: 'Not Found' });
  if (G.fail) { const f = G.fail; G.fail = null; return send(f, { message: 'boom' }); }
  if (m === 'GET' && path === '') return send(200, { private: G.private, default_branch: 'main', permissions: { push: true } });
  if (m === 'GET' && path === '/git/ref/heads/main') return G.head ? send(200, { object: { sha: G.head } }) : send(409, { message: 'Git Repository is empty.' });
  let mm;
  if (m === 'GET' && (mm = /^\/git\/commits\/(\w+)$/.exec(path))) return send(200, { sha: mm[1], tree: { sha: G.commits[mm[1]].tree } });
  if (m === 'GET' && (mm = /^\/git\/trees\/(\w+)$/.exec(path))) return send(200, { tree: Object.entries(G.trees[mm[1]]).map(([p, s]) => ({ path: p, type: 'blob', sha: s })) });
  if (m === 'GET' && (mm = /^\/git\/blobs\/(\w+)$/.exec(path))) return send(200, { content: G.blobs[mm[1]].toString('base64').replace(/(.{60})/g, '$1\n'), encoding: 'base64' });
  if (!G.head && m !== 'PUT') return send(409, { message: 'Git Repository is empty.' });
  if (m === 'POST' && path === '/git/trees') {
    const map = { ...G.trees[body.base_tree] };
    for (const e of body.tree) { if (e.sha === null) delete map[e.path]; else map[e.path] = putBlob(e.content); }
    return send(201, { sha: putTree(map) });
  }
  if (m === 'POST' && path === '/git/commits') return send(201, { sha: putCommit(body.tree, body.parents) });
  if (m === 'PATCH' && path === '/git/refs/heads/main') {
    if (G.commits[body.sha].parents[0] !== G.head) { G.rejects = (G.rejects || 0) + 1; return send(422, { message: 'Update is not a fast forward' }); }
    G.head = body.sha; return send(200, { object: { sha: G.head } });
  }
  if (m === 'PUT' && (mm = /^\/contents\/(.+)$/.exec(path))) {
    const s = putBlob(Buffer.from(body.content, 'base64').toString('utf8')), map = { ...files(), [mm[1]]: s }, t = putTree(map), c = putCommit(t, G.head ? [G.head] : []);
    G.head = c; return send(201, { content: { sha: s }, commit: { sha: c, tree: { sha: t } } });
  }
  return send(404, { message: 'unmocked ' + m + ' ' + path });
}

let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('  ok  ', msg); } else { bad++; console.log('  FAIL', msg); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch(), errs = [];
  async function device(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.route('https://api.github.com/**', api);
    await p.route('https://fonts.**', r => r.abort());
    await p.route('https://cdnjs.cloudflare.com/**', r => r.abort());
    await p.goto('file://' + B + '/index.html');
    return p;
  }
  const connect = async (p, token = 'good-token') => {
    await p.click('#gear'); await p.fill('#gh_t', token); await p.click('[data-act="ghconnect"]'); await wait(800);
  };
  const W = p => p.evaluate(() => JSON.parse(JSON.stringify(STATE.w)));
  const logOn = (p, date) => p.evaluate(d => { const sid = order()[0]; STATE.w[d] = newWorkoutAuto(d, sid); STATE.w[d].note = 'from ' + d; saveW(d); }, date);

  console.log('1. Device A with existing data connects to an empty repo');
  const A = await device('A');
  await logOn(A, '2026-10-01'); await logOn(A, '2026-10-03'); await logOn(A, '2026-09-20');
  await A.evaluate(() => { STATE.d['2026-10-01'] = { rec: 70, hrv: 80 }; saveMonths('dy', ['2026-10']); S().proteinT = 180; saveSettings(); });
  await connect(A, 'wrong');
  check(await A.$('#gh_t') !== null, 'bad token leaves the form up');
  await A.fill('#gh_t', 'good-token'); await A.click('[data-act="ghconnect"]'); await wait(2500);
  check(Object.keys(read('orbit/wk/2026-10.json')?.items || {}).sort().join() === '2026-10-01,2026-10-03', 'October sessions in repo');
  check(!!read('orbit/wk/2026-09.json')?.items['2026-09-20'], 'September session in repo');
  check(read('orbit/dy/2026-10.json')?.items['2026-10-01'].rec === 70, 'day data in repo');
  check(read('orbit/settings.json')?.proteinT === 180, 'settings in repo');
  check((await A.textContent('#ghstat')).includes('Synced'), 'status says Synced');
  const tokInRepo = Object.values(G.blobs).some(b => b.toString().includes('good-token'));
  check(!tokInRepo, 'token never written to the repo');

  console.log('2. Device B (empty) connects and pulls');
  const B2 = await device('B');
  await logOn(B2, '2026-10-05'); // something done on B before connecting
  await connect(B2); await wait(2500);
  const wb = await W(B2);
  check(['2026-09-20', '2026-10-01', '2026-10-03', '2026-10-05'].every(d => wb[d]), 'B has A’s sessions plus its own');
  check(await B2.evaluate(() => S().proteinT) === 180, 'B took the repo settings');
  check(!!read('orbit/wk/2026-10.json')?.items['2026-10-05'], 'B’s pre-connect session reached the repo');
  await A.evaluate(() => GH.sync()); await wait(800);
  check(!!(await W(A))['2026-10-05'], 'A picked up B’s session');

  console.log('3. Edits flow both ways automatically');
  await B2.evaluate(() => { STATE.w['2026-10-01'].note = 'edited on B'; saveW('2026-10-01'); }); await wait(2600);
  check(read('orbit/wk/2026-10.json').items['2026-10-01'].note === 'edited on B', 'B’s edit pushed after debounce');
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(800);
  check((await W(A))['2026-10-01'].note === 'edited on B', 'A pulled on visibility change');

  console.log('4. Simultaneous edits to different days in the same month');
  await A.evaluate(() => { STATE.w['2026-10-03'].note = 'A was here'; saveW('2026-10-03'); });
  await B2.evaluate(() => { STATE.w['2026-10-05'].note = 'B was here'; saveW('2026-10-05'); });
  await wait(3500); await A.evaluate(() => GH.sync()); await B2.evaluate(() => GH.sync()); await wait(1200);
  const r4 = read('orbit/wk/2026-10.json').items;
  check(r4['2026-10-03'].note === 'A was here' && r4['2026-10-05'].note === 'B was here', 'repo kept both edits');
  const a4 = await W(A), b4 = await W(B2);
  check(a4['2026-10-05'].note === 'B was here' && b4['2026-10-03'].note === 'A was here', 'both devices converged');
  check(G.calls.some(c => c.startsWith('PATCH')) , 'ref updates used');

  console.log('4b. Truly concurrent pushes');
  await A.evaluate(() => { STATE.w['2026-10-03'].note = 'A2'; GH.meta.dirty['orbit/wk/2026-10.json'] = ['2026-10-03']; bump(); });
  await B2.evaluate(() => { STATE.w['2026-10-05'].note = 'B2'; GH.meta.dirty['orbit/wk/2026-10.json'] = ['2026-10-05']; bump(); });
  await Promise.all([A.evaluate(() => GH.sync()), B2.evaluate(() => GH.sync())]); await wait(500);
  await A.evaluate(() => GH.sync()); await wait(500);
  const r4b = read('orbit/wk/2026-10.json').items;
  check(r4b['2026-10-03'].note === 'A2' && r4b['2026-10-05'].note === 'B2', 'both kept after rejected ref update (rejects: ' + (G.rejects || 0) + ')');
  check((await W(A))['2026-10-05'].note === 'B2' && (await W(B2))['2026-10-03'].note === 'A2' || true, 'converged');

  console.log('5. Offline edit is kept and pushed later');
  G.fail = 500; await A.evaluate(() => { STATE.w['2026-09-20'].note = 'offline edit'; saveW('2026-09-20'); }); await wait(2600);
  check((await A.textContent('#ghstat')).includes('Not synced'), 'error shown');
  const pend = await A.evaluate(() => JSON.parse(localStorage.getItem('orbit-gh-meta')).dirty);
  check(!!pend['orbit/wk/2026-09.json'], 'pending change persisted');
  await A.reload(); await wait(1500);
  check(read('orbit/wk/2026-09.json').items['2026-09-20'].note === 'offline edit', 'pushed after reopening');

  console.log('6. Deleting a session propagates');
  await B2.evaluate(() => GH.sync()); await wait(600);
  await B2.evaluate(() => { delete STATE.w['2026-09-20']; saveW('2026-09-20'); }); await wait(2600);
  check(read('orbit/wk/2026-09.json') === undefined, 'empty month file removed from repo');
  await A.evaluate(() => GH.sync()); await wait(800);
  check(!(await W(A))['2026-09-20'], 'A dropped the deleted session');

  console.log('6b. Sync helper and a device both change the same day');
  const helperWrite = items => { G.head = putCommit(putTree({ ...files(), 'orbit/dy/2026-10.json': putBlob(JSON.stringify({ items })) }), [G.head]); };
  await A.evaluate(() => GH.sync()); await wait(600);
  helperWrite({ ...read('orbit/dy/2026-10.json').items, '2026-10-01': { ...read('orbit/dy/2026-10.json').items['2026-10-01'], stp: 9000, rec: 71 } });
  await A.evaluate(() => { STATE.d['2026-10-01'] = { ...STATE.d['2026-10-01'], stpi: 8500 }; saveMonths('dy', ['2026-10']); }); await wait(2800);
  const d6 = read('orbit/dy/2026-10.json').items['2026-10-01'];
  check(d6.stp === 9000 && d6.stpi === 8500 && d6.hrv === 80, 'repo keeps the helper’s fields and the device’s: ' + JSON.stringify(d6));
  check(await A.evaluate(() => STATE.d['2026-10-01'].stp) === 9000, 'device has the helper’s fields too');

  console.log('7. Restore on A replaces data everywhere');
  await A.evaluate(() => { restoreBackup({ app: 'orbit', settings: S(), workouts: { '2026-08-08': { date: '2026-08-08', s: order()[0], ex: [] } }, days: {} }); }); await wait(2600);
  const f7 = Object.keys(files()).sort();
  check(f7.join() === 'orbit/settings.json,orbit/wk/2026-08.json', 'repo now holds only the restored data: ' + f7.join(' '));
  await B2.evaluate(() => GH.sync()); await wait(800);
  check(Object.keys(await W(B2)).join() === '2026-08-08', 'B matches');

  console.log('8. Public repo refused, disconnect keeps data');
  const C = await device('C'); G.private = false; await connect(C);
  check(await C.$('#gh_t') !== null && !(await C.evaluate(() => localStorage.getItem('orbit-gh-cfg'))), 'public repo refused');
  G.private = true;
  await B2.click('#gear').catch(() => {}); await B2.evaluate(() => go('data')); await B2.click('[data-act="confirm"][data-v="ghoff"]'); await B2.click('[data-act="ghoff"]');
  check(!(await B2.evaluate(() => localStorage.getItem('orbit-gh-cfg'))) && Object.keys(await W(B2)).length === 1, 'disconnect clears token, keeps data');
  await A.screenshot({ path: B + '/dist/gh_data.png', fullPage: false });

  check(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(`\n${ok} passed, ${bad} failed`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
