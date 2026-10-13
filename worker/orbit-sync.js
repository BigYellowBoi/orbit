/* ============================================================
   ORBIT SYNC: a Cloudflare Worker that keeps Orbit's day data filled in automatically.
   WHOOP API v2 → orbit-data repo (orbit/dy/YYYY-MM.json), and Apple Health numbers posted by
   an iPhone Shortcut → the same files. Orbit's GitHub sync then picks them up like any other change.

   Routes
     GET  /                 status page (no secrets shown)
     GET  /auth?key=…       connect WHOOP (key = SYNC_KEY), redirects to WHOOP's consent page
     GET  /callback         WHOOP sends you back here; tokens are stored in KV, history backfill starts
     POST /webhook          WHOOP event (signature checked); marks data as changed for the next run
     GET  /sync?key=…       run a sync now
     GET  /backfill?key=…&from=YYYY-MM   redo the history backfill from a month
     POST /health?key=…     Apple Health numbers from the Shortcut (see worker/README.md)
   Cron (every 10 min): sync the last 3 days when WHOOP reported a change or 3 h have passed; in between, refresh
   today's steps and strain every 30 min (WHOOP has no webhook for those); otherwise fill in history a month or two at a time.

   Settings (Cloudflare → Worker → Settings)
     Variables: WHOOP_CLIENT_ID, GH_REPO (e.g. BigYellowBoi/orbit-data), optional GH_BRANCH (main),
                TZ_OFFSET (+10:00), BACKFILL_FROM (2024-11)
     Secrets:   WHOOP_CLIENT_SECRET, GH_TOKEN (fine-grained, orbit-data only, Contents read/write), SYNC_KEY
     KV binding: ORBIT_KV
   The free plan allows 50 outside requests per run, so every run counts its requests and stops early.
   ============================================================ */
const WHOOP = 'https://api.prod.whoop.com', SCOPES = 'offline read:recovery read:cycles read:sleep read:workout';
const BUDGET = 45;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), key = url.searchParams.get('key'), authed = env.SYNC_KEY && key === env.SYNC_KEY;
    try {
      if (url.pathname === '/' && req.method === 'GET') return statusPage(env);
      if (url.pathname === '/auth' && req.method === 'GET') { if (!authed) return text('Add ?key= with your SYNC_KEY.', 403); return startAuth(env, url); }
      if (url.pathname === '/callback' && req.method === 'GET') return finishAuth(env, url, ctx);
      if (url.pathname === '/webhook' && req.method === 'POST') return webhook(env, req);
      if (url.pathname === '/sync' && req.method === 'GET') { if (!authed) return text('Forbidden', 403); const r = await run(env, { force: true }); return json(r); }
      if (url.pathname === '/backfill' && req.method === 'GET') {
        if (!authed) return text('Forbidden', 403);
        const st = await getJ(env, 'status') || {}, from = /^\d{4}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : (env.BACKFILL_FROM || '2024-11');
        st.bf = { next: from, done: false }; await putJ(env, 'status', st); return text(`History backfill restarts from ${from}; it runs a month or two every 10 minutes.`);
      }
      if (url.pathname === '/health' && req.method === 'POST') { if (!authed) return text('Forbidden', 403); return health(env, req); }
      return text('Not found', 404);
    } catch (e) { return text('Error: ' + (e.message || e), 500); }
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(run(env, {})); },
};

/* ---------- small helpers ---------- */
const text = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json' } });
const html = s => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const getJ = async (env, k) => { const v = await env.ORBIT_KV.get(k); return v ? JSON.parse(v) : null; };
const putJ = (env, k, v, opt) => env.ORBIT_KV.put(k, JSON.stringify(v), opt);
const pad = n => String(n).padStart(2, '0');
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
const mins = ms => ms == null ? null : Math.round(ms / 60000);
function offMin(off, env) { const m = /^([+-])(\d{2}):?(\d{2})$/.exec(off || env.TZ_OFFSET || '+10:00'); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 600; }
function local(iso, off, env) { const d = new Date(Date.parse(iso) + offMin(off, env) * 60000), s = d.toISOString(); return { date: s.slice(0, 10), hm: s.slice(11, 16), h: d.getUTCHours() }; }
function addDays(date, n) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function localMidnightISO(date, env) { return new Date(Date.parse(date + 'T00:00:00Z') - offMin(null, env) * 60000).toISOString(); }
function todayLocal(env) { return local(new Date().toISOString(), null, env).date; }
const clean = o => { for (const k in o) if (o[k] == null || Number.isNaN(o[k])) delete o[k]; return o; };
function b64enc(str) { const by = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(b) { const bin = atob(b.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }

/* ---------- request budget (Cloudflare free plan: 50 outside requests per run) ---------- */
function budget() { let used = 0; return { take() { if (++used > BUDGET) throw new Error('request budget used up'); }, left: () => BUDGET - used, get used() { return used; } }; }

/* ---------- WHOOP sign-in ---------- */
function redirectUri(url) { return `${url.origin}/callback`; }
async function startAuth(env, url) {
  const state = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.ORBIT_KV.put('state:' + state, '1', { expirationTtl: 900 });
  const q = new URLSearchParams({ client_id: env.WHOOP_CLIENT_ID, redirect_uri: redirectUri(url), response_type: 'code', scope: SCOPES, state });
  return Response.redirect(`${WHOOP}/oauth/oauth2/auth?${q}`, 302);
}
async function finishAuth(env, url, ctx) {
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (url.searchParams.get('error')) return text('WHOOP said: ' + (url.searchParams.get('error_description') || url.searchParams.get('error')), 400);
  if (!code || !state || !(await env.ORBIT_KV.get('state:' + state))) return text('This sign-in link has expired. Open /auth?key=… again.', 400);
  await env.ORBIT_KV.delete('state:' + state);
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(url), client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET });
  const r = await fetch(`${WHOOP}/oauth/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return text('Token exchange failed: ' + (j.error_description || j.error || r.status), 400);
  if (!j.refresh_token) return text('WHOOP did not return a refresh token. Make sure the app has the "offline" scope ticked.', 400);
  await putJ(env, 'tok', { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  const st = await getJ(env, 'status') || {};
  st.connectedAt = Date.now(); st.lastSync = null; st.bf = { next: env.BACKFILL_FROM || '2024-11', done: false }; st.lastError = null;
  await putJ(env, 'status', st);
  ctx.waitUntil(run(env, { force: true }));
  return html(page('WHOOP connected', `<p>Orbit now syncs WHOOP automatically. The last few days are syncing now; your history fills in over the next few hours.</p><p><a href="/">Status</a></p>`));
}
async function refreshTok(env, t, b) {
  b.take();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET, scope: 'offline' });
  const r = await fetch(`${WHOOP}/oauth/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const now = await getJ(env, 'tok'); // another run may have just rotated it: use theirs
    if (now && now.refresh !== t.refresh) return now;
    throw new Error('WHOOP sign-in expired (' + (j.error_description || j.error || r.status) + '). Open /auth?key=… to reconnect.');
  }
  const n = { access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  await putJ(env, 'tok', n); return n; // WHOOP rotates the refresh token on every use, so the new one is saved straight away
}
async function accessToken(env, b, force) {
  let t = await getJ(env, 'tok'); if (!t) throw new Error('WHOOP is not connected yet');
  if (force || Date.now() > t.exp - 300e3) t = await refreshTok(env, t, b);
  return t.access;
}
async function whoopList(env, b, path, start, end) {
  const out = []; let next = null, tok = await accessToken(env, b), retried = false;
  do {
    const q = new URLSearchParams({ limit: '25', start, end }); if (next) q.set('nextToken', next);
    b.take();
    const r = await fetch(`${WHOOP}/developer${path}?${q}`, { headers: { authorization: 'Bearer ' + tok } });
    if (r.status === 401 && !retried) { retried = true; tok = await accessToken(env, b, true); continue; }
    if (!r.ok) throw new Error(`WHOOP ${path}: ${r.status}`);
    const j = await r.json(); out.push(...(j.records || [])); next = j.next_token || null;
  } while (next);
  return out;
}

/* ---------- WHOOP → Orbit day fields (same keys the CSV import uses) ---------- */
const title = s => String(s || 'Activity').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
async function pullWhoop(env, b, from, to) { // local dates [from, to)
  // Sleeps, cycles and recoveries start the evening before the day they belong to, so those are fetched from 36 h earlier;
  // anything that lands outside [from, to) is dropped (the neighbouring run owns it).
  const start = localMidnightISO(from, env), early = new Date(Date.parse(start) - 36 * 3600e3).toISOString(), end = localMidnightISO(to, env);
  const [sleeps, recs, cycles, wos] = [await whoopList(env, b, '/v2/activity/sleep', early, end), await whoopList(env, b, '/v2/recovery', early, end), await whoopList(env, b, '/v2/cycle', early, end), await whoopList(env, b, '/v2/activity/workout', start, end)];
  const days = {}, D = d => days[d] || (days[d] = {}), sleepDate = {}, cycleDate = {};
  for (const s of sleeps) {
    if (s.nap || s.score_state !== 'SCORED' || !s.score) continue;
    const e = local(s.end, s.timezone_offset, env), st = local(s.start, s.timezone_offset, env), ss = s.score.stage_summary || {}, n = s.score.sleep_needed || {};
    sleepDate[s.id] = e.date;
    const asleep = (ss.total_light_sleep_time_milli || 0) + (ss.total_slow_wave_sleep_time_milli || 0) + (ss.total_rem_sleep_time_milli || 0);
    const need = ['baseline_milli', 'need_from_sleep_debt_milli', 'need_from_recent_strain_milli', 'need_from_recent_nap_milli'].reduce((a, k) => a + (n[k] || 0), 0);
    Object.assign(D(e.date), clean({ slp: mins(asleep), deep: mins(ss.total_slow_wave_sleep_time_milli), rem: mins(ss.total_rem_sleep_time_milli), lt: mins(ss.total_light_sleep_time_milli),
      aw: mins(ss.total_awake_time_milli), bed: mins(ss.total_in_bed_time_milli), sn: need ? mins(need) : null, sd: mins(n.need_from_sleep_debt_milli),
      sp: s.score.sleep_performance_percentage, se: r1(s.score.sleep_efficiency_percentage), sc: s.score.sleep_consistency_percentage, rr: r1(s.score.respiratory_rate), on: st.hm, off: e.hm }));
  }
  for (const c of cycles) {
    const st = local(c.start, c.timezone_offset, env), date = st.h >= 15 ? addDays(st.date, 1) : st.date; // a cycle starts at sleep onset; it belongs to the day you wake up
    cycleDate[c.id] = date;
    if (c.score_state === 'SCORED' && c.score) Object.assign(D(date), clean({ str: r1(c.score.strain), kb: c.score.kilojoule != null ? Math.round(c.score.kilojoule / 4.184) : null }));
    if (typeof c.step_count === 'number') D(date).stp = c.step_count;
  }
  for (const r of recs) {
    if (r.score_state !== 'SCORED' || !r.score) continue;
    const date = sleepDate[r.sleep_id] || cycleDate[r.cycle_id]; if (!date) continue;
    Object.assign(D(date), clean({ rec: r.score.recovery_score, hrv: r1(r.score.hrv_rmssd_milli), rhr: r.score.resting_heart_rate, spo2: r1(r.score.spo2_percentage), skt: r1(r.score.skin_temp_celsius) }));
  }
  const acts = {};
  for (const w of wos) {
    if (w.score_state !== 'SCORED' || !w.score) continue;
    const st = local(w.start, w.timezone_offset, env), dur = Date.parse(w.end) - Date.parse(w.start), z = w.score.zone_durations || {};
    const a = clean({ id: w.id, n: title(w.sport_name), t: st.hm, min: r1(dur / 60000), str: r1(w.score.strain), kcal: w.score.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null, ahr: w.score.average_heart_rate, mhr: w.score.max_heart_rate });
    if (dur > 0) a.z = ['zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].map(k => r1((z[k] || 0) / dur * 100));
    (acts[st.date] = acts[st.date] || []).push(a);
  }
  for (const d in days) if (d < from || d >= to) delete days[d];
  for (const d in acts) if (d < from || d >= to) delete acts[d];
  return { days, acts };
}

/* ---------- orbit-data repo ---------- */
async function ghReq(env, b, method, path, body) {
  b.take();
  return fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, { method, headers: { authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'orbit-sync', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function writeMonth(env, b, ym, mutate, msg) { // read, change, write back; a concurrent commit (409/422) means read again
  const path = `orbit/dy/${ym}.json`, branch = env.GH_BRANCH || 'main';
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await ghReq(env, b, 'GET', `/contents/${path}?ref=${branch}`);
    let sha, data = { items: {} };
    if (g.status === 200) { const j = await g.json(); sha = j.sha; try { data = JSON.parse(b64dec(j.content)); } catch (e) { } data.items = data.items || {}; }
    else if (g.status !== 404) throw new Error('GitHub read ' + g.status + (g.status === 401 || g.status === 403 ? ' (check GH_TOKEN can read and write orbit-data)' : ''));
    const before = JSON.stringify(data.items); mutate(data.items);
    if (JSON.stringify(data.items) === before) return false;
    const p = await ghReq(env, b, 'PUT', `/contents/${path}`, { message: msg, content: b64enc(JSON.stringify({ items: data.items })), branch, ...(sha ? { sha } : {}) });
    if (p.ok) return true;
    if (p.status !== 409 && p.status !== 422) throw new Error('GitHub write ' + p.status);
  }
  throw new Error('GitHub kept changing under us; will retry next run');
}
async function saveDays(env, b, days, acts, covered, msg) {
  const months = new Set([...Object.keys(days), ...covered].map(d => d.slice(0, 7)));
  let wrote = 0;
  for (const ym of [...months].sort()) {
    const ok = await writeMonth(env, b, ym, items => {
      for (const d in days) if (d.slice(0, 7) === ym) items[d] = { ...(items[d] || {}), ...days[d] };
      for (const d of covered) if (d.slice(0, 7) === ym) { // every workout of this day was fetched, so the day's list is replaced (keeps deletions in step)
        const list = (acts[d] || []).sort((a, x) => a.t < x.t ? -1 : 1);
        if (list.length) items[d] = { ...(items[d] || {}), acts: list }; else if (items[d]?.acts) { delete items[d].acts; if (!Object.keys(items[d]).length) delete items[d]; }
      }
    }, msg);
    if (ok) wrote++;
  }
  return wrote;
}

/* ---------- runs ---------- */
async function syncRecent(env, b) {
  const t = todayLocal(env), from = addDays(t, -3);
  const { days, acts } = await pullWhoop(env, b, from, addDays(t, 1));
  const covered = []; for (let d = from; d <= t; d = addDays(d, 1)) covered.push(d);
  return saveDays(env, b, days, acts, covered, `WHOOP sync ${t}`);
}
async function pollToday(env, b, st) { // today's cycle: steps and strain grow all day and WHOOP sends no event for them
  const t = todayLocal(env), cycles = await whoopList(env, b, '/v2/cycle', new Date(Date.parse(localMidnightISO(t, env)) - 36 * 3600e3).toISOString(), new Date().toISOString());
  let vals = null;
  for (const c of cycles) {
    const st0 = local(c.start, c.timezone_offset, env), date = st0.h >= 15 ? addDays(st0.date, 1) : st0.date; if (date !== t) continue;
    vals = clean({ stp: typeof c.step_count === 'number' ? c.step_count : null, str: c.score_state === 'SCORED' && c.score ? r1(c.score.strain) : null, kb: c.score_state === 'SCORED' && c.score?.kilojoule != null ? Math.round(c.score.kilojoule / 4.184) : null });
  }
  if (!vals || !Object.keys(vals).length) return false;
  const key = JSON.stringify([t, vals]); if (st.today === key) return false; // unchanged since the last look: no GitHub calls
  await writeMonth(env, b, t.slice(0, 7), items => { items[t] = { ...(items[t] || {}), ...vals }; }, `WHOOP today ${t}`);
  st.today = key; return true;
}
async function backfillStep(env, b, st) {
  let done = 0;
  while (st.bf && !st.bf.done && b.left() > 22) { // one month needs roughly 8 WHOOP requests and 2 GitHub ones
    const ym = st.bf.next, first = ym + '-01', nextYm = (() => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; })();
    const lastDay = addDays(nextYm + '-01', -1), today = todayLocal(env);
    if (first > today) { st.bf.done = true; break; }
    const { days, acts } = await pullWhoop(env, b, first, nextYm + '-01');
    const covered = []; for (let d = first; d <= lastDay && d <= today; d = addDays(d, 1)) covered.push(d);
    await saveDays(env, b, days, acts, covered, `WHOOP history ${ym}`);
    st.bf.next = nextYm; done++;
    if (nextYm + '-01' > today) st.bf.done = true;
  }
  return done;
}
async function run(env, { force }) {
  const st = await getJ(env, 'status') || {}, b = budget();
  if (!(await env.ORBIT_KV.get('tok'))) return { ok: false, msg: 'WHOOP not connected' };
  const dirty = await env.ORBIT_KV.get('dirty'), due = force || dirty || !st.lastSync || Date.now() - st.lastSync > 3 * 3600e3;
  const quick = !due && Date.now() - (st.todayAt || 0) > 29 * 60e3; // 30-min look at today's steps and strain
  const out = { ok: true };
  try {
    if (due) { out.wrote = await syncRecent(env, b); st.lastSync = st.todayAt = Date.now(); st.today = null; if (dirty) await env.ORBIT_KV.delete('dirty'); }
    else if (quick) { out.today = await pollToday(env, b, st); st.todayAt = Date.now(); }
    if (st.bf && !st.bf.done && b.left() > 22) out.months = await backfillStep(env, b, st);
    if (!due && !quick && !out.months) return { ok: true, idle: true }; // nothing done: don't spend a KV write
    st.lastError = null;
  } catch (e) { st.lastError = String(e.message || e); st.errAt = Date.now(); out.ok = false; out.error = st.lastError; }
  out.requests = b.used; await putJ(env, 'status', st); return out;
}

/* ---------- WHOOP webhook: verify, then let the next run pick it up ---------- */
async function webhook(env, req) {
  const raw = await req.text(), sig = req.headers.get('x-whoop-signature'), ts = req.headers.get('x-whoop-signature-timestamp');
  if (!sig || !ts) return text('missing signature', 401);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WHOOP_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(ts + raw)));
  const want = btoa(String.fromCharCode(...mac));
  if (want !== sig) return text('bad signature', 401);
  await env.ORBIT_KV.put('dirty', '1');
  return text('ok');
}

/* ---------- Apple Health (from the iPhone Shortcut) ---------- */
const num = s => s.trim() === '' ? NaN : Number(s.replace(/[,\s]|kcal|kJ|kg|dB(ASPL)?|steps?|min/gi, '')); // Shortcuts may send "9,421" or "95.6 kg"
function headphones(raw) { // "level,start,end" per sample (ISO dates) → time-weighted energy average in dB and minutes listened
  const rows = (Array.isArray(raw) ? raw : String(raw).split(/[\n|;]+/)).map(x => String(x).split(',').map(t => t.trim()));
  let e = 0, sec = 0;
  for (const [v, a, b] of rows) { const L = Number(v), d = (Date.parse(b) - Date.parse(a)) / 1000; if (!Number.isFinite(L) || !(d > 0) || d > 86400) continue; e += d * 10 ** (L / 10); sec += d; }
  return sec >= 60 ? { hp: 10 * Math.log10(e / sec), hpm: sec / 60 } : {};
}
const HEALTH_KEYS = { kcal: 0, p: 0, c: 0, f: 0, wt: 2, stpi: 0, hp: 1, hpm: 0 }; // key → decimals kept
async function health(env, req) {
  let body; try { body = await req.json(); } catch (e) { return text('Send JSON', 400); }
  const days = {}, put = (date, o) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const kj = typeof o.kj === 'string' ? num(o.kj) : o.kj; // Health in kilojoules: converted here
    if (o.kcal == null && Number.isFinite(kj)) o = { ...o, kcal: kj / 4.184 };
    if (o.hp == null && o.hpraw) o = { ...o, ...headphones(o.hpraw) };
    for (const k in HEALTH_KEYS) { const v = typeof o[k] === 'string' ? num(o[k]) : o[k]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) { const p = 10 ** HEALTH_KEYS[k]; (days[date] = days[date] || {})[k] = Math.round(v * p) / p; } }
  };
  if (body && body.days && typeof body.days === 'object') for (const d in body.days) put(d, body.days[d] || {});
  else put(String(body.date || todayLocal(env)).slice(0, 10), body || {});
  if (!Object.keys(days).length) return text('No recognised values. Keys: ' + Object.keys(HEALTH_KEYS).join(', ') + ', kj, hpraw', 400);
  const b = budget(); await saveDays(env, b, days, {}, [], 'Apple Health ' + Object.keys(days).sort().pop());
  return json({ ok: true, days: Object.keys(days).length });
}

/* ---------- status page ---------- */
const ago = t => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
function page(h1, body) { return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit sync</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0a0c0f;color:#e8ebef;margin:0;padding:28px 20px;max-width:560px}h1{font-size:22px;margin:0 0 12px}a{color:#b388ff}p,li{color:#a5adb8}b{color:#e8ebef}</style><h1>${h1}</h1>${body}`; }
async function statusPage(env) {
  const st = await getJ(env, 'status') || {}, conn = !!(await env.ORBIT_KV.get('tok'));
  return html(page('Orbit sync', `<ul><li>WHOOP: <b>${conn ? 'connected' : 'not connected'}</b></li><li>Last sync: <b>${ago(st.lastSync)}</b></li>
    <li>History: <b>${!st.bf ? 'not started' : st.bf.done ? 'complete' : 'filling in, next ' + st.bf.next}</b></li>
    ${st.lastError ? `<li>Last problem (${ago(st.errAt)}): <b>${st.lastError.replace(/</g, '&lt;')}</b></li>` : ''}</ul>`));
}
