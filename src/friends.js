/* ============================================================
   FRIENDS (v1.57): a friend's workouts and session times, read-only.
   A friend shares a JSON file at a link (a raw GitHub file, a Gist, anything with open CORS) or sends the file itself.
   Orbit reads three shapes: the Recomp Logbook backup (Export JSON), that app's browser copy, and an Orbit backup.
   Only workouts and timing are kept: session, date, start and end, duration, exercises and sets, cardio minutes and
   distance. Check-ins, weight, food, photos, injuries and notes in the file are dropped on read and never stored.
   The links live in settings (so every device has them); the parsed sessions are cached on this device only.
   ============================================================ */
const FR_KEY = 'orbit-friends-v1';
const FR = { cache: null, busy: {} };
/* Recomp Logbook exercise names (kind: k load in kg or pins, b body weight plus kg, r reps only, t seconds, T seconds with
   a plate, c load and metres) and session names, so his keys read as names. Unknown keys are shown tidied up. */
const FR_EX = { bench: ['Barbell Flat Bench Press', 'k'], ohp_db: ['Seated Dumbbell Overhead Press', 'k'], ohp_seat_bb: ['Seated Barbell Overhead Press', 'k'], ohp_stand: ['Standing Barbell Overhead Press', 'k'], incline_db: ['Incline Dumbbell Press (30°)', 'k'], lat_raise: ['Cable Lateral Raise', 'k'], pec_fly: ['Pec Deck / Cable Fly', 'k'], oh_tri: ['Overhead Cable Tricep Extension', 'k'], plank: ['Plank', 't'], dead_bug: ['Dead Bug', 'r'], lh_fly: ['Low-to-High Cable Fly', 'k'], pushdown: ['Tricep Pushdown (rope)', 'k'], skull: ['Skull Crusher (EZ bar)', 'k'], ab_wheel: ['Ab Wheel Rollout', 'r'], db_fly: ['Dumbbell Fly (flat bench)', 'k'], cgbp: ['Close-Grip Bench Press', 'k'], w_plank: ['Weighted Plank', 'T'], squat: ['Barbell Back Squat', 'k'], rdl: ['Romanian Deadlift', 'k'], leg_press: ['Leg Press', 'k'], lying_curl: ['Lying Leg Curl', 'k'], lunge: ['Walking Lunges', 'k'], seat_calf: ['Seated Calf Raise', 'k'], knee_raise: ['Hanging Knee Raise', 'r'], seat_curl: ['Seated Leg Curl', 'k'], bss: ['Bulgarian Split Squat', 'k'], stand_calf: ['Standing Calf Raise', 'k'], pull_through: ['Cable Pull-Through', 'k'], hip_thrust: ['Barbell Hip Thrust', 'k'], hack: ['Hack Squat Machine', 'k'], nordic: ['Nordic Hamstring Curl', 'r'], deadlift: ['Conventional Deadlift', 'k'], pulldown: ['Lat Pulldown (wide, overhand)', 'k'], row_v: ['Seated Cable Row (V-bar)', 'k'], cs_row: ['Chest-Supported DB Row', 'k'], face_pull: ['Face Pull (rope)', 'k'], db_curl: ['Dumbbell Curl (alternating)', 'k'], hammer: ['Hammer Curl', 'k'], pallof: ['Pallof Press', 'k'], pullup: ['Weighted Pull-Up / Assisted', 'b'], row_wide: ['Seated Cable Row (wide, pronated)', 'k'], sa_row: ['Single-Arm Dumbbell Row', 'k'], rear_delt: ['Rear Delt Fly', 'k'], ez_curl: ['EZ Bar Curl', 'k'], hang_leg: ['Hanging Leg Raise', 'r'], bb_row: ['Barbell Bent-Over Row', 'k'], pullover: ['Cable Pullover (straight arm)', 'k'], spider: ['Spider Curl (incline bench)', 'k'], rev_curl: ['Reverse Curl (EZ bar)', 'k'], carry: ['Suitcase Carry', 'c'], floor_press: ['DB Floor Press', 'k'], machine_chest: ['Machine Chest Press', 'k'], landmine_press: ['Half-Kneeling Landmine Press', 'k'], neutral_pulldown: ['Neutral-Grip Lat Pulldown', 'k'], trap_bar: ['Trap Bar Deadlift (high handles)', 'k'], box_squat: ['Box Squat (above parallel)', 'k'], glute_bridge: ['Barbell Glute Bridge', 'k'] };
const FR_SESS = { A: 'Upper Push', B: 'Lower Body', C: 'Upper Pull + Core', COND: 'Conditioning', Z2: 'Zone 2 + Mobility', AR: 'Active recovery', WALK: 'Walk + Mobility', THR: 'Tempo / Threshold', EZS: 'Easy + Strides + Core', LONG: 'Long Easy', INT: 'Intervals' };
const FR_LIFT = new Set(['A', 'B', 'C']);
function frCache() { if (!FR.cache) { try { FR.cache = JSON.parse(localStorage.getItem(FR_KEY) || '{}') || {}; } catch (e) { FR.cache = {}; } } return FR.cache; }
function frStore() { try { localStorage.setItem(FR_KEY, JSON.stringify(FR.cache || {})); } catch (e) { } }
function friendList() { return Object.entries(S().friends || {}).map(([id, f]) => ({ id, ...f })).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
function rawUrl(u) { // a github.com file page works too: it becomes the raw file
  const s = String(u || '').trim(), m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(s);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : s;
}
const frDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const frNum = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tidy = k => String(k || '').replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
function frSet(kind, s, pin) { // one set as text, in his units
  const w = frNum(s.w), r = frNum(s.r); if (!(r > 0)) return null;
  if (kind === 'r') return `${r} reps`;
  if (kind === 't') return `${r} s`;
  if (kind === 'T') return `${w ? fmt(w, 2) + ' kg × ' : ''}${r} s`;
  if (kind === 'c') return `${w != null ? fmt(w, 2) + ' kg × ' : ''}${r} m`;
  if (kind === 'b') return `${w > 0 ? `BW+${fmt(w, 2)}` : w < 0 ? `BW${fmt(w, 2)}` : 'BW'} × ${r}`;
  return w == null ? `${r} reps` : pin ? `pin ${fmt(w, 1)} × ${r}` : `${fmt(w, 2)} kg × ${r}`;
}
/* Session length: his app's own timer (durationSec, or finish minus start); minutes typed for cardio otherwise. */
function frRecomp(list, name) {
  const out = [];
  for (const w of list) {
    if (!w || !frDate(w.date)) continue;
    const ex = (Array.isArray(w.exercises) ? w.exercises : []).filter(e => e && !e.skipped).map(e => {
      const def = FR_EX[e.key] || [tidy(e.key), 'k'], sets = (e.sets || []).filter(s => s && s.done).map(s => frSet(def[1], s, e.u === 'pin')).filter(Boolean);
      return sets.length ? [def[0] + (e.swapFor ? ' (swap)' : ''), sets] : null; }).filter(Boolean);
    const c = w.cardio || {}, cardio = [frNum(c.tt) ? `5 km in ${Math.floor(c.tt / 60)}:${pad(Math.round(c.tt % 60))}` : frNum(c.min) ? `${fmt(c.min, 0)} min` : '', frNum(c.dist) ? `${fmt(c.dist, 2)} km` : '', frNum(c.hr) ? `${fmt(c.hr, 0)} bpm avg` : ''].filter(Boolean).join(' · ');
    if (!w.done && !ex.length && !cardio) continue; // opened and never used
    const s = frNum(w.startedAt), f = frNum(w.finishedAt), dur = frNum(w.durationSec) ?? (s && f && f > s ? Math.round((f - s) / 1000) : frNum(c.min) ? c.min * 60 : null);
    out.push({ d: w.date, n: c.test ? 'Time trial' : FR_SESS[w.session] || tidy(w.session), lift: FR_LIFT.has(w.session), s, e: w.done ? f : null, dur, open: !w.done, sets: sum(ex.map(x => x[1].length)), ex, c: cardio, rpe: frNum(w.sessionRpe) });
  }
  return { name, sessions: out };
}
function frOrbit(o) { // a friend on Orbit: names from his own exercise list, durations from WHOOP or minutes typed
  const exd = o.settings?.ex || {}, ses = o.settings?.prog?.sessions || {}, days = o.days || {}, out = [];
  for (const [d, w] of Object.entries(o.workouts || {})) {
    if (!frDate(d) || !w || w.rest) continue;
    const ex = (w.ex || []).map(e => { const x = exd[e.id] || {}, sets = (e.sets || []).filter(s => s && s.done && s.r > 0 && s.t !== 'w').map(s => x.u === 'bw' ? `${s.w ? `BW+${fmt(s.w, 2)}` : 'BW'} × ${s.r}` : s.w == null ? `${s.r} reps` : `${fmt(s.w, 2)} ${x.u === 'plates' ? 'pl' : 'kg'} × ${s.r}`);
      return sets.length ? [x.name || tidy(e.id), sets] : null; }).filter(Boolean);
    const acts = (days[d]?.acts || []).filter(a => LIFT_RE.test(a.n || '')), wm = acts.length ? sum(acts.map(a => a.min || 0)) : null;
    const t0 = /^\d{1,2}:\d{2}/.test(acts[0]?.t || '') ? new Date(`${d}T${acts[0].t.slice(0, 5).padStart(5, '0')}:00`).getTime() : null;
    if (!ex.length && !w.cardio?.done) continue;
    out.push({ d, n: ses[w.s]?.name || w.sName || tidy(w.s), lift: ex.length > 0, s: t0, e: null, dur: wm ? wm * 60 : w.durMin ? w.durMin * 60 : null, open: false, sets: sum(ex.map(x => x[1].length)), ex, c: w.cardio?.done ? `${w.cardio.name || 'Cardio'} · ${fmt(w.cardio.min || 0, 0)} min` : '', rpe: null });
  }
  return { name: '', sessions: out };
}
function frParse(o) {
  if (!o || typeof o !== 'object') throw new Error('That file isn’t JSON from a training log.');
  if (o.app === 'orbit') return frOrbit(o);
  const name = typeof o.settings?.name === 'string' ? o.settings.name.slice(0, 30) : '';
  if (Array.isArray(o.workouts)) return frRecomp(o.workouts, name); // Recomp Logbook: Export JSON
  if (o.workouts && typeof o.workouts === 'object') return frRecomp(Object.values(o.workouts), name); // its browser copy
  throw new Error('No workouts found in that file.');
}
function frKeep(id, parsed) { // what is stored on this device: the parsed sessions only, newest first
  const sessions = parsed.sessions.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.s || 0) - (a.s || 0))).slice(0, 400);
  frCache()[id] = { at: Date.now(), name: parsed.name, sessions }; frStore();
  const f = S().friends?.[id]; if (f && !f.name && parsed.name) { f.name = parsed.name; saveSettings(); }
}
async function frFetch(id, quiet) {
  const f = S().friends?.[id]; if (!f?.url || FR.busy[id]) return;
  FR.busy[id] = 1; if (ui.tab === 'friends') render();
  try {
    const u = rawUrl(f.url), r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'The file wasn’t found at that link. A private repo can’t be read this way.' : `The link answered ${r.status}.`);
    frKeep(id, frParse(await r.json()));
    delete frCache()[id].err; frStore();
  } catch (e) {
    const c = frCache()[id] = { ...(frCache()[id] || {}), err: e instanceof SyntaxError ? 'That link isn’t a JSON file.' : /fetch|network|load/i.test(e.message) && !/answered/.test(e.message) ? 'Couldn’t reach that link. It needs to be a public raw file (raw.githubusercontent.com or a Gist).' : e.message, errAt: Date.now() }; frStore();
    if (!quiet) toast(esc(c.err), 'bad');
  } finally { delete FR.busy[id]; if (ui.tab === 'friends') render(); }
}
function frStale() { for (const f of friendList()) { const c = frCache()[f.id]; if (f.url && (!c || Date.now() - (c.at || 0) > 10 * 60e3) && !(c?.errAt && Date.now() - c.errAt < 60e3)) frFetch(f.id, true); } }
const frClock = ms => ms ? new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, (m, a) => a.toLowerCase() + 'm') : '';
function frAgo(ms) { const m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; }

/* ---------- the screen ---------- */
function vFriends() {
  const fl = friendList(), t = today();
  let h = `<button class="link" data-act="go" data-tab="history" style="align-self:flex-start">‹ History</button>
    <div class="page-h"><div><div class="eyebrow">Workouts and session times</div><h1>Friends</h1></div>${fl.length && !ui.frAdd ? '<button class="btn sm ghost" data-act="fradd">Add</button>' : ''}</div>`;
  if (!fl.length || ui.frAdd) h += frAddHTML(!fl.length);
  if (!fl.length) return h;
  const cur = fl.find(f => f.id === ui.fr) || fl[0], c = frCache()[cur.id], busy = !!FR.busy[cur.id];
  if (fl.length > 1) h += `<div class="chips">${fl.map(f => `<button class="chip ${f.id === cur.id ? 'on' : ''}" data-act="frpick" data-id="${f.id}">${esc(f.name || 'Friend')}</button>`).join('')}</div>`;
  const status = busy ? 'Updating…' : c?.at ? `Updated ${frAgo(c.at)}` : cur.url ? 'Not loaded yet' : 'Loaded from a file';
  h += `<div class="sec-h"><span class="eyebrow">${esc(cur.name || 'Friend')} · ${esc(status)}</span><span>${cur.url ? `<button class="link" data-act="frrefresh" data-id="${cur.id}" ${busy ? 'disabled' : ''}>Refresh</button>` : ''}</span></div>`;
  if (c?.err) h += `<p class="warnnote small">${esc(c.err)}</p>`;
  const ss = c?.sessions || [];
  if (!ss.length) return h + `<section class="card"><p class="small dim">${busy ? 'Loading his sessions.' : 'No sessions to show yet.'}</p></section>` + frManageHTML(cur);
  const m30 = ss.filter(x => x.d > addDays(t, -30)), lifts = m30.filter(x => x.lift && x.dur), starts = m30.filter(x => x.s).map(x => { const d = new Date(x.s); return d.getHours() * 60 + d.getMinutes(); });
  const med = a => a.length ? median(a) : null, st = med(starts), lastD = ss[0].d;
  h += `<section class="card"><div class="card-h"><h2>Last 30 days</h2><span class="eyebrow">last trained ${esc(lastD === t ? 'today' : lastD === addDays(t, -1) ? 'yesterday' : fmtD(lastD))}</span></div>
    <div class="stats">${stat(m30.length, '', 'sessions')}${stat(lifts.length ? fmtDur(med(lifts.map(x => x.dur))) : '–', '', 'typical lift session')}${stat(st != null ? frClock(new Date(2000, 0, 1, Math.floor(st / 60), Math.round(st % 60)).getTime()) : '–', '', 'usual start')}</div></section>`;
  const n = ui.frAll ? ss.length : Math.min(ss.length, 30); let wk = null, open = false;
  for (const x of ss.slice(0, n)) {
    const ws = weekStart(x.d);
    if (ws !== wk) { if (open) h += '</div>'; wk = ws; open = true; h += `<div class="sec-h"><span class="eyebrow">Week of ${esc(fmtD(ws))}</span><span class="xs muted">${ss.filter(y => weekStart(y.d) === ws).length} sessions</span></div><div class="hist">`; }
    const key = x.d + '|' + x.n + '|' + (x.s || ''), on = ui.frOpen === key, time = x.s ? `${frClock(x.s)}${x.e ? ` – ${frClock(x.e)}` : ''}` : '';
    const meta = [time, x.dur ? fmtDur(x.dur) : '', x.sets ? `${x.sets} sets` : '', x.lift ? '' : x.c].filter(Boolean).join(' · ');
    h += `<button class="hrow frrow" data-act="fropen" data-k="${esc(key)}" aria-expanded="${on}"><span class="hdate"><b>${esc(fmtDow(x.d))}</b><small>${esc(fmtDate(x.d))}</small></span><span class="hmain"><b>${esc(x.n)}${x.open ? ' <span class="pill warn">In progress</span>' : ''}</b><small>${esc(meta || 'No details')}</small></span><span class="chev">${ICON.down}</span></button>`;
    if (on) h += `<section class="card flat frdet">${x.ex.length ? `<ul class="exlist ro">${x.ex.map(([nm, sets]) => `<li><span>${esc(nm)}</span><span class="rx">${sets.map((v, i) => `<span class="rs"><i>${i + 1}</i><span>${esc(v)}</span></span>`).join('')}</span></li>`).join('')}</ul>` : ''}${x.c ? `<p class="small dim">${esc(x.c)}</p>` : ''}${x.rpe ? `<p class="xs muted">Felt ${x.rpe}/10</p>` : ''}</section>`;
  }
  if (open) h += '</div>';
  if (ss.length > 30) h += `<button class="link" data-act="frall" style="align-self:flex-start">${ui.frAll ? 'Show the last 30' : `Show all ${ss.length}`}</button>`;
  return h + frManageHTML(cur);
}
function frAddHTML(first) {
  return `<section class="card"><div class="card-h"><h2>${first ? 'See a friend’s workouts' : 'Add a friend'}</h2>${first ? '' : '<button class="link dim" data-act="fradd">Cancel</button>'}</div>
    <p class="small dim">He exports his log as JSON (Recomp Logbook: Data and settings, Export JSON) and puts the file in a public GitHub repo or Gist. Paste the link to that file. Orbit only keeps his sessions, times, sets and cardio; nothing else in the file is stored.</p>
    <label class="fl">Name<input class="in" id="frname" maxlength="30" autocomplete="off" placeholder="e.g. Dylan"></label>
    <label class="fl">Link to his file<input class="in" id="frurl" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://raw.githubusercontent.com/…/backup.json"></label>
    <div class="btnrow" style="justify-content:space-between"><label class="btn sm ghost filebtn">Or open a file<input type="file" class="vh" accept=".json,application/json" data-in="frfile"></label><button class="btn" data-act="frsave">Add friend</button></div></section>`;
}
function frManageHTML(f) {
  const editing = ui.frEdit === f.id;
  return `<section class="card flat"><div class="card-h"><h2>${esc(f.name || 'Friend')}</h2><button class="link dim" data-act="fredit" data-id="${f.id}">${editing ? 'Close' : 'Edit'}</button></div>
    ${editing ? `<label class="fl">Name<input class="in" id="frename" maxlength="30" value="${esc(f.name || '')}"></label>
      <label class="fl">Link to his file<input class="in" id="freurl" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(f.url || '')}" placeholder="Leave blank to load files by hand"></label>
      <div class="btnrow" style="justify-content:space-between"><label class="btn sm ghost filebtn">Load a file<input type="file" class="vh" accept=".json,application/json" data-in="frfile" data-id="${f.id}"></label><button class="btn sm" data-act="frupd" data-id="${f.id}">Save</button></div>
      <button class="link danger" data-act="frdel" data-id="${f.id}" style="align-self:flex-start">${ui.confirm === 'frdel' + f.id ? 'Tap again to remove' : 'Remove friend'}</button>`
      : `<p class="xs muted">${f.url ? `Reads ${esc(rawUrl(f.url).replace(/^https?:\/\//, '').slice(0, 64))}${rawUrl(f.url).length > 72 ? '…' : ''}` : 'Loaded from a file on this device.'}</p>`}</section>`;
}
