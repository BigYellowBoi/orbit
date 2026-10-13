// Tests worker/orbit-sync.js in Node with a fake WHOOP API, a fake GitHub contents API and an in-memory KV.
// Synthetic data only. Run: node test/worker.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-worker-'));
fs.copyFileSync(path.join(here, '../worker/orbit-sync.js'), path.join(tmp, 'w.mjs'));
const W = (await import(path.join(tmp, 'w.mjs'))).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

/* ---------- fake KV ---------- */
const kv = new Map(); let kvPuts = 0;
const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kvPuts++; kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
const env = { ORBIT_KV: KV, WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'csecret', GH_REPO: 'me/orbit-data', GH_TOKEN: 'ghtok', SYNC_KEY: 'k3y', TZ_OFFSET: '+10:00', BACKFILL_FROM: '2026-05' };

/* ---------- synthetic WHOOP data (local time +10:00) ---------- */
const OFF = 600, dstr = d => d.toISOString().slice(0, 10);
const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return dstr(d); };
const utc = (date, hm) => new Date(Date.parse(date + 'T' + hm + ':00Z') - OFF * 60000).toISOString(); // local → UTC
const today = dstr(new Date(Date.now() + OFF * 60000));
const H = { sleep: [], rec: [], cycle: [], wo: [] };
let n = 0;
for (let d = '2026-04-20'; d <= today; d = addD(d, 1)) {
  n++; const prev = addD(d, -1), sid = 'S' + d, cid = 1000 + n;
  const sleepEnd = d === today ? utc(d, '06:30') : utc(d, '06:30');
  H.sleep.push({ id: sid, cycle_id: cid, start: utc(prev, '22:30'), end: sleepEnd, timezone_offset: '+10:00', nap: false, score_state: 'SCORED',
    score: { stage_summary: { total_in_bed_time_milli: 8 * 36e5, total_awake_time_milli: 30 * 6e4, total_light_sleep_time_milli: 4 * 36e5, total_slow_wave_sleep_time_milli: 90 * 6e4, total_rem_sleep_time_milli: 2 * 36e5 },
      sleep_needed: { baseline_milli: 8 * 36e5, need_from_sleep_debt_milli: 20 * 6e4, need_from_recent_strain_milli: 10 * 6e4, need_from_recent_nap_milli: 0 },
      respiratory_rate: 15.234, sleep_performance_percentage: 90, sleep_consistency_percentage: 80, sleep_efficiency_percentage: 93.45 } });
  if (n % 7 === 0) H.sleep.push({ id: 'N' + d, start: utc(d, '14:00'), end: utc(d, '14:30'), timezone_offset: '+10:00', nap: true, score_state: 'SCORED', score: { stage_summary: {} } });
  H.cycle.push({ id: cid, start: utc(prev, '22:30'), end: utc(d, '22:30'), timezone_offset: '+10:00', score_state: 'SCORED', score: { strain: 12.345, kilojoule: 10460 }, step_count: 8000 + n });
  H.rec.push({ cycle_id: cid, sleep_id: sid, created_at: utc(d, '06:40'), score_state: 'SCORED', score: { recovery_score: 50 + (n % 40), resting_heart_rate: 52, hrv_rmssd_milli: 61.27, spo2_percentage: 96.4, skin_temp_celsius: 33.71 } });
  if (n % 2 === 0) H.wo.push({ id: 'W' + d, start: utc(d, '17:00'), end: utc(d, '17:45'), timezone_offset: '+10:00', sport_name: 'functional-fitness', score_state: 'SCORED',
    score: { strain: 9.87, kilojoule: 1255, average_heart_rate: 130, max_heart_rate: 170, zone_durations: { zone_zero_milli: 0, zone_one_milli: 9 * 6e4, zone_two_milli: 18 * 6e4, zone_three_milli: 9 * 6e4, zone_four_milli: 9 * 6e4, zone_five_milli: 0 } } });
}

/* ---------- fake fetch ---------- */
let tokens = { access: null, refresh: null }, tokN = 0, calls = 0, ghFail409 = 0;
const repo = {}; let shaN = 0;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (u, opt = {}) => {
  calls++; const url = new URL(u), m = opt.method || 'GET';
  if (url.host === 'api.prod.whoop.com') {
    if (url.pathname === '/oauth/oauth2/token') {
      const b = new URLSearchParams(opt.body.toString());
      if (b.get('client_secret') !== 'csecret') return J({ error: 'invalid_client' }, 401);
      if (b.get('grant_type') === 'authorization_code' && b.get('code') !== 'good') return J({ error: 'invalid_grant' }, 400);
      if (b.get('grant_type') === 'refresh_token' && b.get('refresh_token') !== tokens.refresh) return J({ error: 'invalid_grant', error_description: 'refresh token used' }, 400);
      tokN++; tokens = { access: 'A' + tokN, refresh: 'R' + tokN };
      return J({ access_token: tokens.access, refresh_token: tokens.refresh, expires_in: 3600 });
    }
    if (opt.headers?.authorization !== 'Bearer ' + tokens.access) return J({}, 401);
    const src = { '/developer/v2/activity/sleep': H.sleep, '/developer/v2/recovery': H.rec, '/developer/v2/cycle': H.cycle, '/developer/v2/activity/workout': H.wo }[url.pathname];
    if (!src) return J({}, 404);
    const s = url.searchParams.get('start'), e = url.searchParams.get('end'), lim = +url.searchParams.get('limit'), off = +(url.searchParams.get('nextToken') || 0);
    if (lim > 25) return J({ error: 'limit' }, 400);
    const key = r => r.start || r.created_at;
    const all = src.filter(r => key(r) >= s && key(r) < e).sort((a, b) => key(b) < key(a) ? -1 : 1);
    const page = all.slice(off, off + lim);
    return J({ records: page, next_token: off + lim < all.length ? String(off + lim) : null });
  }
  if (url.host === 'api.github.com') {
    if (opt.headers?.authorization !== 'Bearer ghtok') return J({}, 401);
    const p = decodeURIComponent(url.pathname.replace('/repos/me/orbit-data/contents/', ''));
    if (m === 'GET') { const f = repo[p]; return f ? J({ sha: f.sha, content: Buffer.from(f.text).toString('base64').replace(/(.{60})/g, '$1\n') }) : J({ message: 'Not Found' }, 404); }
    if (m === 'PUT') {
      const b = JSON.parse(opt.body);
      if (ghFail409 > 0) { ghFail409--; repo[p] = { sha: 'x' + (++shaN), text: repo[p] ? repo[p].text : '{"items":{}}' }; return J({ message: 'conflict' }, 409); }
      if ((repo[p] && repo[p].sha) !== b.sha && !(repo[p] == null && b.sha == null)) return J({ message: 'sha mismatch' }, 409);
      repo[p] = { sha: 's' + (++shaN), text: Buffer.from(b.content, 'base64').toString('utf8') };
      return J({ content: { sha: repo[p].sha } }, repo[p] ? 200 : 201);
    }
  }
  throw new Error('unexpected fetch ' + u);
};
const month = ym => repo[`orbit/dy/${ym}.json`] ? JSON.parse(repo[`orbit/dy/${ym}.json`].text).items : {};
const day = d => month(d.slice(0, 7))[d] || {};
const req = (p, opt) => W.fetch(new Request('https://orbit-sync.me.workers.dev' + p, opt), env, ctx);
const waits = []; const ctx = { waitUntil: p => waits.push(p) };
const settle = async () => { while (waits.length) await waits.shift(); };
const cron = async () => { calls = 0; const c = { waitUntil: p => waits.push(p) }; await W.scheduled({}, env, c); await settle(); return calls; };

/* ---------- 1. sign-in ---------- */
console.log('sign-in');
ok((await req('/auth')).status === 403, '/auth without key is refused');
let r = await req('/auth?key=k3y'); const loc = new URL(r.headers.get('location'));
ok(r.status === 302 && loc.origin + loc.pathname === 'https://api.prod.whoop.com/oauth/oauth2/auth', '/auth redirects to WHOOP');
ok(loc.searchParams.get('scope').split(' ').includes('offline') && loc.searchParams.get('redirect_uri') === 'https://orbit-sync.me.workers.dev/callback', 'asks for offline scope with the /callback redirect');
const state = loc.searchParams.get('state'); ok(state.length >= 8, 'state is at least 8 characters');
r = await req('/callback?code=good&state=nope'); ok(r.status === 400, 'unknown state is refused');
r = await req('/callback?error=access_denied&error_description=User%20said%20no'); ok(r.status === 400 && (await r.text()).includes('User said no'), 'WHOOP error is shown');
// existing app data in the repo must survive
repo['orbit/dy/' + today.slice(0, 7) + '.json'] = { sha: 's0', text: JSON.stringify({ items: { [addD(today, -1)]: { alc: true, kcal: 2400, rec: 1 } } }) };
calls = 0; r = await req(`/callback?code=good&state=${state}`); ok(r.status === 200, 'callback succeeds'); await settle();
ok(JSON.parse(kv.get('tok')).refresh === tokens.refresh, 'tokens stored');
ok(!kv.has('state:' + state), 'state used once');
const y = addD(today, -1), yd = day(y);
ok(yd.rec != null && yd.hrv === 61.3 && yd.rhr === 52 && yd.spo2 === 96.4 && yd.skt === 33.7, 'recovery fields for yesterday');
ok(yd.slp === 450 && yd.deep === 90 && yd.rem === 120 && yd.lt === 240 && yd.aw === 30 && yd.bed === 480 && yd.sn === 510 && yd.sd === 20, 'sleep durations in minutes');
ok(yd.sp === 90 && yd.se === 93.5 && yd.sc === 80 && yd.rr === 15.2 && yd.on === '22:30' && yd.off === '06:30', 'sleep scores and times');
ok(yd.str === 12.3 && yd.kb === 2500 && typeof yd.stp === 'number', 'strain, energy and steps');
ok(yd.alc === true && yd.kcal === 2400, 'app fields on that day kept');
ok(yd.rec !== 1, 'WHOOP value replaces the old one');
const wd = [today, y, addD(today, -2), addD(today, -3)].find(d => day(d).acts);
const a = day(wd).acts[0];
ok(a && a.n === 'Functional Fitness' && a.t === '17:00' && a.min === 45 && a.kcal === 300 && a.ahr === 130 && a.z.join() === '20,40,20,20,0', 'workout mapped with zones as % of time');
ok(!Object.values(month(today.slice(0, 7))).some(x => x.slp === 0), 'naps skipped');
ok(calls <= 45, `first run used ${calls} requests (≤45)`);

/* ---------- 2. history backfill ---------- */
console.log('backfill');
let runs = 0, maxCalls = 0;
while (!JSON.parse(kv.get('status')).bf.done && runs < 20) { maxCalls = Math.max(maxCalls, await cron()); runs++; }
const st = JSON.parse(kv.get('status'));
ok(st.bf.done && !st.lastError, `history complete after ${runs} runs, no errors`);
ok(maxCalls <= 45, `busiest run used ${maxCalls} requests (≤45)`);
let missing = []; for (let d = '2026-05-01'; d <= today; d = addD(d, 1)) if (day(d).rec == null || day(d).stp == null) missing.push(d);
ok(!missing.length, 'every day since May has recovery and steps' + (missing.length ? ' (missing ' + missing.slice(0, 5) + ')' : ''));
ok(day('2026-05-01').slp === 450 && day('2026-05-01').rec != null, 'month boundary: sleep that started in April lands on 1 May');
ok(!repo['orbit/dy/2026-04.json'], 'the month before the backfill start is left alone');

/* ---------- 3. idle runs ---------- */
console.log('idle');
kvPuts = 0; const c0 = await cron(); ok(c0 === 1 && kvPuts === 0, 'nothing new: one WHOOP look at today, no GitHub calls, no KV writes');

/* ---------- 3b. every run looks at today's steps and strain ---------- */
console.log('today refresh');
const ago = m => { const s = JSON.parse(kv.get('status')); s.todayAt = Date.now() - m * 60e3; kv.set('status', JSON.stringify(s)); };
const tc = H.cycle.find(c => c.end === utc(today, '22:30')); tc.step_count = 4321; tc.score.strain = 6.78;
const cq = await cron(); ok(day(today).stp === 4321 && day(today).str === 6.8, `today's steps and strain refreshed (${cq} requests)`);
ok(cq <= 4, 'refresh is cheap (one WHOOP list, one GitHub read and write)');
ok(day(today).rec != null && day(today).slp != null, "today's other fields kept");
kvPuts = 0; const cq2 = await cron(); ok(cq2 === 1 && kvPuts === 0, 'unchanged steps: one WHOOP call, no GitHub calls, no KV writes');
tc.step_count = 4400; const cq3 = await cron(); ok(cq3 <= 4 && day(today).stp === 4400, 'next run (5 min later) picks up new steps');
ago(26); kvPuts = 0; await cron(); ok(kvPuts === 1 && Date.now() - JSON.parse(kv.get('status')).todayAt < 5e3, 'status refreshed every 25 min even with nothing new');
// budget: one WHOOP call per 5-minute run all day, plus full syncs, stays far inside 10,000 a day
ok(288 * 1 + 8 * 8 + 30 * 8 < 10000, 'daily WHOOP calls ~600 worst case vs 10,000 limit');

/* ---------- 4. webhook ---------- */
console.log('webhook');
const body = JSON.stringify({ user_id: 1, id: 'x', type: 'recovery.updated', trace_id: 't' }), ts = String(Date.now());
const sig = crypto.createHmac('sha256', 'csecret').update(ts + body).digest('base64');
r = await req('/webhook', { method: 'POST', body, headers: { 'x-whoop-signature': 'AAAA', 'x-whoop-signature-timestamp': ts } }); ok(r.status === 401, 'bad signature refused');
H.rec.find(x => x.sleep_id === 'S' + y).score.recovery_score = 99;
const delW = H.wo.find(w => w.id === 'W' + wd); H.wo = H.wo.filter(w => w !== delW);
calls = 0; r = await req('/webhook', { method: 'POST', body, headers: { 'x-whoop-signature': sig, 'x-whoop-signature-timestamp': ts } });
ok(r.status === 200 && waits.length === 1, 'good signature: answers WHOOP at once and syncs in the background');
await settle(); const c1 = calls; ok(c1 > 0 && c1 <= 45 && !kv.has('dirty'), `notification sync ran straight away (${c1} requests) and cleared the retry flag`);
ok(day(y).rec === 99, 'changed recovery picked up');
ok(!day(wd).acts, 'deleted workout removed');

/* ---------- 5. token rotation ---------- */
console.log('tokens');
const t = JSON.parse(kv.get('tok')); t.exp = Date.now() - 1; kv.set('tok', JSON.stringify(t)); const oldR = t.refresh;
r = await req('/sync?key=k3y'); const rj = await r.json();
ok(rj.ok && JSON.parse(kv.get('tok')).refresh !== oldR && JSON.parse(kv.get('tok')).refresh === tokens.refresh, 'expired access token refreshed, new refresh token saved');
const t2 = JSON.parse(kv.get('tok')); t2.access = 'stale'; kv.set('tok', JSON.stringify(t2));
r = await req('/sync?key=k3y'); ok((await r.json()).ok, 'rejected access token (401) triggers one refresh and carries on');
tokens.refresh = 'revoked'; const t3 = JSON.parse(kv.get('tok')); t3.exp = 0; kv.set('tok', JSON.stringify(t3));
r = await req('/sync?key=k3y'); const e3 = await r.json();
ok(!e3.ok && /reconnect/.test(e3.error) && JSON.parse(kv.get('status')).lastError, 'revoked sign-in reported on the status page');
ok((await (await req('/')).text()).includes('reconnect'), 'status page shows the problem');
// reconnect
r = await req('/auth?key=k3y'); const s2 = new URL(r.headers.get('location')).searchParams.get('state');
r = await req(`/callback?code=good&state=${s2}`); await settle(); ok(r.status === 200 && !JSON.parse(kv.get('status')).lastError, 'reconnecting clears it');
ok(!JSON.parse(kv.get('status')).bf.done, 'reconnect restarts history (harmless: rewrites only what changed)');
while (!JSON.parse(kv.get('status')).bf.done) await cron();
// renewals: the 5-minute run renews 15 min early; a notification sync with 10 min left doesn't renew (no race with the cron)
const setExp = ms => { const x = JSON.parse(kv.get('tok')); x.exp = Date.now() + ms; kv.set('tok', JSON.stringify(x)); return x.refresh; };
let rBefore = setExp(10 * 60e3);
await req('/webhook', { method: 'POST', body, headers: { 'x-whoop-signature': crypto.createHmac('sha256', 'csecret').update(ts + body).digest('base64'), 'x-whoop-signature-timestamp': ts } }); await settle();
ok(JSON.parse(kv.get('tok')).refresh === rBefore, 'notification sync with 10 min left on the token leaves renewal to the scheduled run');
await cron(); ok(JSON.parse(kv.get('tok')).refresh !== rBefore, 'scheduled run renews it 15 min early');

/* ---------- 6. GitHub conflict ---------- */
console.log('github');
H.rec.find(x => x.sleep_id === 'S' + y).score.recovery_score = 77;
ghFail409 = 1; r = await req('/sync?key=k3y'); ok((await r.json()).ok && day(y).rec === 77, 'a conflicting commit is re-read and retried');
ok((await req('/sync?key=nope')).status === 403, '/sync needs the key');

/* ---------- 7. Apple Health ---------- */
console.log('health');
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ date: y, kcal: '2650.4', p: 180.2, c: 250, f: 80, wt: 82.456, stpi: 9100, hp: 71.26, hpm: 95, junk: 5 }) });
ok(r.status === 200, 'single day accepted');
const h = day(y); ok(h.kcal === 2650 && h.p === 180 && h.wt === 82.46 && h.stpi === 9100 && h.hp === 71.3 && h.hpm === 95 && h.junk == null, 'values rounded, unknown keys ignored');
ok(h.rec === 77 && h.alc === true, 'WHOOP and app fields kept');
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ days: { '2026-06-01': { stpi: 5000 }, '2026-07-02': { kcal: 2000 } } }) });
ok(r.status === 200 && day('2026-06-01').stpi === 5000 && day('2026-07-02').kcal === 2000 && day('2026-06-01').rec != null, 'several days across months');
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ date: '2026-07-03', kj: '10,460', p: '', wt: 'abc', stpi: '9,421 steps', hp: '71.2 dBASPL' }) });
ok(r.status === 200 && day('2026-07-03').kcal === 2500 && day('2026-07-03').p == null && day('2026-07-03').wt == null && day('2026-07-03').stpi === 9421 && day('2026-07-03').hp === 71.2, 'kilojoules converted, blanks ignored');
const hpraw = '70,2026-07-04T08:00:00+10:00,2026-07-04T08:30:00+10:00\n80,2026-07-04T09:00:00+10:00,2026-07-04T09:30:00+10:00\nbad line';
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ date: '2026-07-04', hpraw }) });
ok(r.status === 200 && day('2026-07-04').hp === 77.4 && day('2026-07-04').hpm === 60, 'headphone samples → time-weighted 77.4 dB over 60 min');
ok((await req('/health?key=k3y', { method: 'POST', body: '{"x":1}' })).status === 400, 'nothing recognised → 400');
ok((await req('/health?key=bad', { method: 'POST', body: '{"kcal":1}' })).status === 403, '/health needs the key');
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ kcal: 1999 }) }); ok(r.status === 200 && day(today).kcal === 1999, 'no date → today');
// Health Auto Export (REST API automation, Summarize Data on, Time Grouping Day)
const hae = { data: { metrics: [
  { name: 'step_count', units: 'count', data: [{ qty: 9421, date: '2026-07-05 00:00:00 +1000', source: 'iPhone' }, { qty: 812, date: '2026-07-06 00:00:00 +1000' }] },
  { name: 'dietary_energy', units: 'kJ', data: [{ qty: 11566, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'protein', units: 'g', data: [{ qty: 196.8, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'carbohydrates', units: 'g', data: [{ qty: 250.2, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'total_fat', units: 'g', data: [{ qty: 110.4, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'weight_&_body_mass', units: 'kg', data: [{ qty: 95.6, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'headphone_audio_exposure', units: 'dBASPL', data: [{ qty: 81.94, date: '2026-07-05 00:00:00 +1000' }] },
  { name: 'heart_rate', units: 'count/min', data: [{ Min: 50, Avg: 60, Max: 120, date: '2026-07-05 00:00:00 +1000' }] },
] } };
r = await req('/health', { method: 'POST', headers: { 'x-sync-key': 'k3y' }, body: JSON.stringify(hae) });
const ha = day('2026-07-05');
ok(r.status === 200 && ha.stpi === 9421 && ha.kcal === 2764 && ha.p === 197 && ha.c === 250 && ha.f === 110 && ha.wt === 95.6 && ha.hp === 81.9 && ha.hpm == null && ha.hr == null && day('2026-07-06').stpi === 812, 'Health Auto Export daily summary: kJ → kcal, weight by its odd name, other metrics ignored');
// unsummarised samples: sums add up, last weight of the day wins, lb converted, headphone energy average
const raw = { data: { metrics: [
  { name: 'Step Count', units: 'count', data: [{ qty: 1200, date: '2026-07-07 08:00:00 +1000' }, { qty: 800, date: '2026-07-07 17:00:00 +1000' }] },
  { name: 'dietary_energy', units: 'kcal', data: [{ qty: 1000, date: '2026-07-07 12:00:00 +1000' }, { qty: 1500, date: '2026-07-07 19:00:00 +1000' }] },
  { name: 'weight_&_body_mass', units: 'lb', data: [{ qty: 210, date: '2026-07-07 07:30:00 +1000' }, { qty: 209, date: '2026-07-07 06:30:00 +1000' }] },
  { name: 'headphone_audio_exposure', units: 'dBASPL', data: [{ qty: 70, date: '2026-07-07 10:00:00 +1000' }, { qty: 80, date: '2026-07-07 11:00:00 +1000' }] },
] } };
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify(raw) });
const hr = day('2026-07-07');
ok(r.status === 200 && hr.stpi === 2000 && hr.kcal === 2500 && hr.wt === 95.25 && hr.hp === 77.4, 'Health Auto Export samples: summed, last weigh-in in lb converted, 77.4 dB');
r = await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ data: { metrics: [] } }) });
ok(r.status === 200 && (await r.json()).days === 0, 'Health Auto Export run with nothing new → 200, no commit');
ok((await req('/health', { method: 'POST', headers: { 'x-sync-key': 'nope' }, body: JSON.stringify(hae) })).status === 403, 'wrong header key → 403');
const before = repo['orbit/dy/' + y.slice(0, 7) + '.json'].sha;
await req('/health?key=k3y', { method: 'POST', body: JSON.stringify({ date: y, stpi: 9100 }) });
ok(repo['orbit/dy/' + y.slice(0, 7) + '.json'].sha === before, 'unchanged values make no commit');

/* ---------- 8. backfill restart ---------- */
r = await req('/backfill?key=k3y&from=2026-09'); ok(r.status === 200 && JSON.parse(kv.get('status')).bf.next === '2026-09', '/backfill restarts from a month');

console.log('status.json');
r = await req('/status.json'); const sj = await r.json();
ok(r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', 'status.json readable from the app, never cached');
ok(sj.whoop.connected === true && sj.whoop.checkedAt > Date.now() - 3600e3 && sj.health.at > Date.now() - 3600e3, 'status.json has WHOOP and Apple Health times');
ok(!JSON.stringify(sj).match(/k3y|ghtok|csecret|refresh|access/), 'status.json holds no secrets');
const st2 = JSON.parse(kv.get('status')); st2.lastError = 'GitHub read 401'; st2.errAt = Date.now(); kv.set('status', JSON.stringify(st2));
ok((await (await req('/status.json')).json()).whoop.error === 'GitHub read 401', 'status.json reports the last problem');

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
