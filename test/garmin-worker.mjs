// Tests the Garmin part of worker/orbit-sync.js with a fake Garmin Personal API, fake GitHub and in-memory KV.
// Synthetic data only. Run: node test/garmin-worker.mjs
import fs from 'fs'; import os from 'os'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-garmin-'));
fs.copyFileSync(path.join(here, '../worker/orbit-sync.js'), path.join(tmp, 'w.mjs'));
const W = (await import(path.join(tmp, 'w.mjs'))).default;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const kv = new Map(); const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
const env = { ORBIT_KV: KV, GH_REPO: 'me/orbit-data', GH_TOKEN: 'ghtok', SYNC_KEY: 'k3y', TZ_OFFSET: '+10:00', GARMIN_PERSONAL_API_KEY: ' gkey ' };
const today = new Date(Date.now() + 600 * 60000).toISOString().slice(0, 10);
const jwt = exp => 'h.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.s';
let block = false, tokCalls = 0, garminCalls = 0, ghPuts = 0, rhr = 43, acts = [{ activityId: 7, activityName: 'Strength' }], badTok = false;
const repo = {}; let shaN = 0;
const J = (o, s = 200) => new Response(o === undefined ? '' : JSON.stringify(o), { status: s });
globalThis.fetch = async (u, opt = {}) => {
  const url = new URL(u), m = opt.method || 'GET', h = opt.headers || {};
  if (url.host === 'personal.connectapi.garmin.com') {
    if (url.pathname.endsWith('/personal-api-key/token')) { tokCalls++; return h.authorization === 'ApiKey gkey' && m === 'POST' ? new Response(jwt(Date.now() / 1000 + 86400)) : J({}, 401); }
    garminCalls++;
    if (block) return J({ message: 'Forbidden' }, 403);
    if (badTok || !String(h.authorization).startsWith('Bearer h.')) return J({ msg: 'no' }, 401);
    const p = url.pathname;
    if (p === '/usersummary-service/v2/dailysummaries') return J({ data: [{ calendarDate: url.searchParams.get('startDate'), heartRate: { restingValue: rhr } }] });
    if (p === '/activitylist-service/activities/search/activities') return J(url.searchParams.get('startDate') === today ? acts : []);
    if (p.startsWith('/activity-service/activity/')) return J({ activityId: +p.split('/').pop(), z: 1, a: 2 });
    if (p.startsWith('/hrv-service/')) return J(undefined); // empty body → null
    if (p.startsWith('/weight-service/')) return J({ err: 1 }, 500);
    return J({ ok: 1, path: p });
  }
  if (url.host === 'api.github.com') {
    const fp = decodeURIComponent(url.pathname.replace('/repos/me/orbit-data/contents/', ''));
    if (m === 'GET') return repo[fp] ? J({ sha: repo[fp].sha, content: Buffer.from(repo[fp].c).toString('base64') }) : J({}, 404);
    if (m === 'PUT') { ghPuts++; const b = JSON.parse(opt.body); if (repo[fp] && b.sha !== repo[fp].sha) return J({}, 409); repo[fp] = { sha: 's' + (++shaN), c: Buffer.from(b.content, 'base64').toString() }; return J({}, 201); }
  }
  throw new Error('unexpected ' + u);
};

console.log('first run');
let r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(r.ok, 'run ok: ' + JSON.stringify(r));
ok(r.wrote.length === 3 && r.wrote[0] === today, 'forced run writes today first, then 2 earlier days');
const f = repo[`orbit/garmin/raw/${today}.json`]; const day = JSON.parse(f.c);
ok(JSON.stringify(Object.keys(day)) === JSON.stringify(['activities', 'activity_details', 'body_battery', 'heart_rate', 'hrv', 'sleep', 'spo2', 'stress', 'summary', 'weight']), 'same top-level keys as garmin_sync.py, sorted');
ok(day.hrv === null && day.weight._error && day.weight._error.startsWith('500 GET'), 'empty body is null, failing endpoint is _error');
ok(day.activity_details.length === 1 && JSON.stringify(Object.keys(day.activity_details[0])) === '["a","activityId","z"]', 'activity details fetched, nested keys sorted');
ok(f.c.includes('\n "activities"'), 'indent 1 like the Python');
ok(r.requests < 45, 'within the request budget (' + r.requests + ')');
ok(tokCalls === 1, 'one token exchange');

console.log('quiet run');
const puts0 = ghPuts; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(r.ok && r.wrote.length === 0 && ghPuts === puts0, 'nothing changed: no GitHub writes');
ok(tokCalls === 1, 'token reused from KV');

console.log('change today');
rhr = 41; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(JSON.stringify(r.wrote) === JSON.stringify([today, (() => { const d = new Date(today + 'T00:00:00Z'); return d; })() && r.wrote[1]].filter(Boolean)) || r.wrote.includes(today), 'changed days rewritten');
ok(JSON.parse(repo[`orbit/garmin/raw/${today}.json`].c).summary.data[0].heartRate.restingValue === 41, 'new value in the file');

console.log('scheduled routing');
let ran = []; const ctx = { waitUntil(p) { ran.push(p); } };
const gs0 = kv.get('garmin');
await W.scheduled({ cron: '*/10 * * * *', scheduledTime: Date.parse(today + 'T01:20:00Z') }, env, ctx); await Promise.all(ran);
ok(kv.get('garmin') !== gs0, 'second cron runs Garmin');
ran = []; await W.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, env, ctx); const res = await Promise.all(ran);
ok(res[0] && res[0].msg === 'WHOOP not connected', 'the */5 cron still runs WHOOP');

console.log('token rejected');
badTok = true; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(!r.ok && /token rejected/.test(r.error), 'reported');
badTok = false; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(r.ok && tokCalls === 2, 'fresh token next run');

console.log('all calls refused');
block = true; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(!r.ok && /403/.test(r.error) && r.errors && r.errors[today], 'refused calls are reported, not taken as empty days: ' + r.error.slice(0, 80));
block = false; r = await (await W.fetch(new Request('https://w/garmin?key=k3y'), env, { waitUntil() { } })).json();
ok(r.ok && !r.error, 'clears once calls work again');

console.log('status');
const s = await (await W.fetch(new Request('https://w/status.json'), env, {})).json();
ok(s.garmin && s.garmin.checkedAt && s.garmin.error === null, 'status.json has garmin');
const pg = await (await W.fetch(new Request('https://w/'), env, {})).text();
ok(pg.includes('Garmin: <b>checked'), 'status page line');
ok((await W.fetch(new Request('https://w/garmin'), env, {})).status === 403, '/garmin needs the key');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
