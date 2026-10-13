/* ============================================================
   ROTATION — the split runs as a sequence, not a calendar.
   The next session follows the last one logged; a skipped day just waits.
   ============================================================ */
function lastWorkoutBefore(date) {
  let best = null;
  for (const w of Object.values(STATE.w)) if (w.date < date && sessDef(w.s) && (!best || w.date > best.date)) best = w;
  return best;
}
function nextAfter(sid) { const o = order(); if (!o.length) return null; const i = o.indexOf(sid); return i < 0 ? o[0] : o[(i + 1) % o.length]; }
function sessionFor(date) {
  if (STATE.w[date] && sessDef(STATE.w[date].s)) return STATE.w[date].s;
  const ov = S().rotOverride, last = lastWorkoutBefore(date);
  if (ov && sessDef(ov.id) && ov.from <= date && (!last || last.date < ov.from)) return ov.id;
  let s = last ? nextAfter(last.s) : order()[0];
  // A rest slot in the rotation is used up by any day with no session logged (or one marked as rest).
  // A missed training slot just waits.
  if (last) for (let d = addDays(last.date, 1); d < date; d = addDays(d, 1)) { if (STATE.w[d] && !STATE.w[d].rest) continue; if (isRestSlot(s)) s = nextAfter(s); }
  return s;
}
function isRestSlot(id) { return !!sessDef(id)?.rest; }
function trainIds() { return order().filter(id => !isRestSlot(id)); }
function nextTraining(id) { const o = order(); if (!o.length) return null; let s = id; for (let i = 0; i <= o.length; i++) { if (s && !isRestSlot(s)) return s; s = nextAfter(s); } return trainIds()[0] || null; }
function upcoming(n) { // [{date, s, done}] starting today; assumes you train every day from here
  const out = [], t = today(), rec = STATE.w[t];
  let s = rec ? (sessDef(rec.s) ? rec.s : '_rest') : sessionFor(t);
  out.push({ date: t, s, done: !!rec });
  s = rec ? sessionFor(addDays(t, 1)) : nextAfter(s);
  for (let i = 1, d = addDays(t, 1); i < n; i++, d = addDays(d, 1)) { out.push({ date: d, s, done: false }); s = nextAfter(s); }
  return out;
}
function slotName(id) { return id === '_rest' ? 'Rest' : sessDef(id)?.name || ''; }
function rotationCount() { // completed full rotations (training sessions only)
  const n = trainIds().length; if (!n) return 0;
  const k = Object.values(STATE.w).filter(w => sessDef(w.s) && !w.rest).length; return Math.floor(k / n);
}

/* ============================================================
   LIFT HISTORY, e1RM, PRs, MAINTENANCE STATUS
   ============================================================ */
function doneSets(ex) { return (ex.sets || []).filter(s => s.done && s.r > 0); }
function lastFor(exId, before) {
  let best = null;
  for (const w of Object.values(STATE.w)) {
    if (w.date >= before) continue;
    const e = (w.ex || []).find(x => x.id === exId && doneSets(x).length);
    if (e && (!best || w.date > best.date)) best = { date: w.date, sets: doneSets(e) };
  }
  return best;
}
function e1rm(s) { if (!s || !(s.r > 0)) return 0; const w = s.w || 0; if (w <= 0) return 0; return w * (1 + Math.min(s.r, 15) / 30); }
function setScore(exId, s) { return exDef(exId).u === 'bw' ? (s.r || 0) + (s.w || 0) / 2.5 : e1rm(s); }
function maxScore(exId) { const b = exDef(exId).base; return b && b.r > 0 ? setScore(exId, b) : 0; }
function bestBefore(exId, before) { // best score on dates strictly before, including the stated max
  let b = maxScore(exId);
  for (const w of Object.values(STATE.w)) if (w.date < before) for (const e of w.ex || []) if (e.id === exId) for (const s of doneSets(e)) b = Math.max(b, setScore(exId, s));
  return b;
}
function bestSet(exId, before = '9999') { // best before a date: stated max or any logged set
  let best = exDef(exId).base && exDef(exId).base.r > 0 ? exDef(exId).base : null, sc = best ? setScore(exId, best) : 0;
  for (const w of Object.values(STATE.w)) if (w.date < before) for (const e of w.ex || []) if (e.id === exId) for (const s of doneSets(e)) { const v = setScore(exId, s); if (v > sc) { sc = v; best = s; } }
  return best;
}
function records(exId) { // heaviest set and best e1RM set, from logs plus the stated max
  const b = exDef(exId).base, cands = [];
  if (b && b.r > 0) cands.push({ s: b, date: null });
  for (const w of Object.values(STATE.w)) for (const e of w.ex || []) if (e.id === exId) for (const s of doneSets(e)) cands.push({ s, date: w.date });
  if (!cands.length) return null;
  const heavy = cands.reduce((a, c) => ((c.s.w || 0) > (a.s.w || 0) || ((c.s.w || 0) === (a.s.w || 0) && c.s.r > a.s.r)) ? c : a);
  const best = cands.reduce((a, c) => setScore(exId, c.s) > setScore(exId, a.s) ? c : a);
  return { heavy, best, logged: cands.some(c => c.date) };
}
function hasRef(exId, before) { return maxScore(exId) > 0 || hasHistory(exId, before); }
function hasHistory(exId, before) { return Object.values(STATE.w).some(w => w.date < before && (w.ex || []).some(e => e.id === exId && doneSets(e).length)); }
function liftSeries(exId) {
  const out = [];
  for (const w of workoutsSorted()) for (const e of w.ex || []) if (e.id === exId) { const ds = doneSets(e); if (ds.length) out.push({ date: w.date, y: Math.max(...ds.map(s => setScore(exId, s))), top: ds.reduce((a, s) => setScore(exId, s) > setScore(exId, a) ? s : a, ds[0]) }); }
  return out;
}
function maintenance(exId) { // recent 28 days vs days 29–90: is strength holding?
  const t = today(), ser = liftSeries(exId);
  const rec = ser.filter(p => diffDays(p.date, t) <= 28), pri = ser.filter(p => { const a = diffDays(p.date, t); return a > 28 && a <= 90; });
  if (!rec.length) return { state: 'none', last: ser[ser.length - 1] || null };
  const r = Math.max(...rec.map(p => p.y)); if (!pri.length) return { state: 'new', r, last: ser[ser.length - 1] };
  const p = Math.max(...pri.map(x => x.y)); const ch = p > 0 ? (r / p - 1) * 100 : 0;
  return { state: ch > 2.5 ? 'up' : ch >= -2.5 ? 'hold' : ch >= -5 ? 'dip' : 'down', ch, r, p, last: ser[ser.length - 1] };
}
const MSTATE = { up: ['good', 'Up'], hold: ['good', 'Holding'], dip: ['warn', 'Dip'], down: ['bad', 'Down'], new: ['', 'New'], none: ['', 'No recent sets'] };
function fmtLoad(exId, w) {
  const u = exDef(exId).u;
  if (u === 'bw') return w ? `BW+${fmt(w, 2)}` : 'BW';
  if (u === 'plates') return `${fmt(w, 2)} pl`;
  return `${fmt(w, 2)}`;
}
function fmtSet(exId, s) { return exDef(exId).u === 'bw' && !s.w ? `${s.r}` : `${fmtLoad(exId, s.w)}×${s.r}`; }
function setsTxt(exId, sets) { // compress "48×6, 48×6, 48×6" to "48×6 ×3"
  const parts = sets.map(s => fmtSet(exId, s)); const out = [];
  for (const p of parts) { const l = out[out.length - 1]; if (l && l.p === p) l.n++; else out.push({ p, n: 1 }); }
  return out.map(o => o.n > 1 ? `${o.p} ×${o.n}` : o.p).join(', ');
}
function scoreTxt(exId, v) { const u = exDef(exId).u; return u === 'bw' ? `${fmt(v, 0)} reps` : u === 'plates' ? `${fmt(v, 2)} pl` : `${fmt(v, 1)} kg`; }

/* ============================================================
   SUGGESTED LOAD AND REPS (the Aim)
   Strength and size hold on far less volume than it took to build them,
   provided the sets stay heavy and close to failure (Bickel et al., 2011;
   Spiering et al., 2021). So each lift gets a load and rep target that sits
   a set number of reps short of failure at your current strength:
   - current strength: median e1RM of the top set from your last 3 sessions
     of that lift in the past 90 days (the stated max if none)
   - target reps: middle of the rep range, then load = e1RM / (1 + (reps + RIR) / 30)
     (Epley solved for load, with reps in reserve added), rounded down to the
     lift's weight step, and reps re-fitted to that rounded load.
   ============================================================ */
function exStep(exId) { // smallest load change on the equipment
  const d = exDef(exId); if (d.inc > 0) return d.inc;
  if (d.u === 'plates') return 0.25; // a 5 kg plate per side
  if (d.u === 'bw') return 2.5;
  if (/dumbbell/i.test(d.note || '') || /dumbbell/i.test(d.name)) return 2;
  if (/cable/i.test(d.name)) return 1.25;
  return 2.5;
}
function exRir(exId) { const d = exDef(exId); return d.rir != null ? d.rir : (d.rest || 90) >= 150 ? 2 : 1; } // heavy compounds 2 short of failure, the rest 1
/* Logged working sets are done short of failure (the Aim leaves the lift's reps in reserve), so their reps
   count with that reserve added. Otherwise following the Aim exactly would read as a slightly weaker lift
   and nudge every later Aim down. The stated max was an all-out set, so it counts as is. */
function refScore(exId, s, rir) { return exDef(exId).u === 'bw' ? (s.r || 0) + rir + (s.w || 0) / 2.5 : e1rm({ w: s.w, r: (s.r || 0) + rir }); }
function strengthRef(exId, before) { // current strength: median of the top sets from the last 3 sessions in 90 days
  const tops = [], from = addDays(before, -90), rir = exRir(exId);
  for (const w of workoutsSorted()) if (w.date < before && w.date >= from) for (const e of w.ex || []) if (e.id === exId) { const ds = doneSets(e); if (ds.length) tops.push({ date: w.date, s: ds.reduce((a, s) => setScore(exId, s) > setScore(exId, a) ? s : a, ds[0]) }); }
  const last = tops.slice(-3);
  if (last.length) { const v = last.map(t => refScore(exId, t.s, rir)).sort((a, b) => a - b); return { v: v[Math.floor((v.length - 1) / 2)], n: last.length, top: last[last.length - 1].s }; }
  const b = exDef(exId).base; return b && b.r > 0 ? { v: refScore(exId, b, 0), n: 0, top: b } : null;
}
function fitLoad(exId, e, startW) { // load × reps leaving the lift's reserve at strength e; stays on the last load while it fits (double progression)
  const d = exDef(exId), rir = exRir(exId);
  if (d.u === 'bw') { const add = startW || 0; return { w: add, r: Math.max(1, Math.floor(e - add / 2.5 + 1e-6) - rir), rir }; }
  const step = exStep(exId), mid = Math.round((d.lo + d.hi) / 2), repsAt = w => Math.floor(30 * (e / w - 1) + 1e-6) - rir;
  let w = startW > 0 ? startW : Math.floor(e / (1 + (mid + rir) / 30) / step + 1e-6) * step; if (!(w > 0) || !(e > 0)) return null;
  let r = repsAt(w);
  while (r < d.lo && w - step > 0) { w -= step; r = repsAt(w); } // too heavy for the range now: come down
  while (r > d.hi && repsAt(w + step) >= d.lo) { w += step; r = repsAt(w); } // top of the range passed: step up
  if (r > d.hi) r = Math.min(r, d.hi + 2); // the next jump doesn't fit the range yet (2 kg dumbbells): a rep or two over first
  return { w: +w.toFixed(3), r: Math.max(1, r), rir };
}
function holdTarget(exId, before) { // maintenance: hold current strength
  const ref = strengthRef(exId, before); return ref ? fitLoad(exId, ref.v, ref.n ? ref.top.w : null) : null;
}
/* Overload: target strength climbs from where you were when you switched (S().growFrom) by the weekly rate,
   so small weekly gains add up instead of rounding away. It never asks for more than 5% above what your logged
   sets show (about a rep and a half), and pushes on from there if you get ahead of plan. */
function growStrength(exId, before) {
  const rate = S().progRate ?? 0.005, cur = strengthRef(exId, before); if (!cur) return null;
  const from = S().growFrom && S().growFrom <= before ? S().growFrom : before, base = strengthRef(exId, from) || cur;
  const plan = base.v * (1 + rate) ** Math.max(1, Math.floor(diffDays(from, before) / 7) + 1);
  return { e: Math.min(Math.max(plan, cur.v * (1 + rate)), cur.v * 1.05), cur };
}
function suggest(exId, before) { // the Aim shown on Today and in the log: { w, r, rir } or null
  if (S().suggest === false) return null;
  if (S().goal !== 'grow') return holdTarget(exId, before);
  const g = growStrength(exId, before); return g ? fitLoad(exId, g.e, g.cur.n ? g.cur.top.w : null) : null;
}
/* PROGRESSION PLAN (Plan tab): the overload track week by week from today, at the lift's reps in reserve.
   Reps climb at a fixed load until the top of the range, then the load steps up and reps drop back. */
function progression(exId, weeks, rate, before = today()) {
  const ref = strengthRef(exId, before); if (!ref) return null;
  const e1 = S().goal === 'grow' ? growStrength(exId, before).e : ref.v * (1 + rate), out = [];
  let w = ref.n ? ref.top.w : null;
  for (let k = 1; k <= weeks; k++) { const e = e1 * (1 + rate) ** (k - 1), p = fitLoad(exId, e, w); if (!p) return null; w = p.w; out.push({ k, ...p, g: e / ref.v - 1 }); }
  return out;
}
function suggestTxt(exId, sg) { const u = exDef(exId).u, w = fmt(sg.w, 2); return u === 'bw' ? (sg.w ? `BW+${w} × ${sg.r}` : `${sg.r} reps`) : `${w} ${u === 'plates' ? 'pl' : 'kg'} × ${sg.r}`; }

/* ============================================================
   WORKOUTS
   ============================================================ */
function prefill(exId, n, date) {
  const last = lastFor(exId, date), out = []; // first time: blank, since the stated numbers are maxes, not working sets
  for (let i = 0; i < n; i++) {
    const src = last ? last.sets[Math.min(i, last.sets.length - 1)] : null;
    out.push({ w: null, r: null, pw: src ? (src.w ?? null) : null, pr: src ? (src.r ?? null) : null, done: false }); // last time's numbers show as hints, not values
  }
  return out;
}
function normSets(w) { // older sessions stored pre-filled numbers as values; unlogged ones become hints
  for (const e of w.ex || []) for (const s of e.sets) if (!s.done && !('pw' in s)) { s.pw = s.w ?? null; s.pr = s.r ?? null; s.w = null; s.r = null; }
}
function setFromInputs(s, wv, rv, u, hintW) { // a row counts as soon as it has reps; blank weight takes the hint
  s.r = rv > 0 ? rv : null;
  s.w = wv != null ? wv : null;
  if (s.r && s.w == null) s.w = hintW != null ? hintW : s.pw != null ? s.pw : (u === 'bw' ? 0 : null);
  s.done = !!s.r;
}
function newWorkout(date, sid) {
  const sd = sessDef(sid);
  return {
    date, s: sid, sName: sd?.name || sid, startedAt: null, finishedAt: null, dur: null,
    ex: (sd?.items || []).filter(it => S().ex[it.ex]).map(it => ({ id: it.ex, sets: prefill(it.ex, it.sets, date) })),
    cardio: { name: S().cardio.name, min: S().cardio.min, lvl: null, done: false }, note: '',
  };
}
function newWorkoutAuto(date, sid) { const w = newWorkout(date, sid); autoCardio(w); return w; }
function restRecord(date) { // a rest day: fills a planned rest slot if one is due, otherwise the rotation waits
  const next = sessionFor(date), s = isRestSlot(next) ? next : '_rest';
  return { date, s, sName: 'Rest day', rest: true, startedAt: null, finishedAt: null, dur: null, ex: [], cardio: { name: S().cardio.name, min: S().cardio.min, lvl: null, done: false }, note: '' };
}
function wStats(w) {
  let sets = 0, kg = 0; const pk = S().plateKg || 20;
  for (const e of w.ex || []) for (const s of doneSets(e)) { sets++; const u = exDef(e.id).u; const load = u === 'plates' ? (s.w || 0) * 2 * pk : (s.w || 0); kg += load * s.r; }
  return { sets, kg, cardio: w.cardio?.done ? (w.cardio.min || 0) : 0 };
}
function prsIn(w) { // sets in this workout that beat everything before its date
  const out = [];
  for (const e of w.ex || []) {
    if (!hasRef(e.id, w.date)) continue;
    const prev = bestBefore(e.id, w.date); let run = prev;
    for (const s of doneSets(e)) { const sc = setScore(e.id, s); if (sc > run + 1e-9) { run = sc; out.push({ id: e.id, s }); } }
  }
  return out;
}
function whoopActs(date, re) { return (STATE.d[date]?.acts || []).filter(a => re.test(a.n)); }
const LIFT_RE = /weight|strength|lift|function/i;
function whoopLiftMin(date) { const a = whoopActs(date, LIFT_RE); return a.length ? sum(a.map(x => x.min || 0)) : null; }
const CARDIO_RE = { Stairmaster: /stair|climb/i, Treadmill: /tread|run|walk/i };
function whoopCardio(date, name) { // WHOOP activities matching a cardio type
  const mins = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const liftEnd = Math.max(-1, ...whoopActs(date, LIFT_RE).map(a => mins(a.t) != null ? mins(a.t) + (a.min || 0) : -1));
  const re = CARDIO_RE[name] || /cardio/i;
  // after-lifting window: starts within 20 min of WHOOP's lifting entry ending. With no lifting entry, only named Stairmaster/treadmill activities count.
  const near = a => liftEnd >= 0 && mins(a.t) != null && mins(a.t) >= liftEnd - 10 && mins(a.t) <= liftEnd + 20;
  return (STATE.d[date]?.acts || []).filter(a => re.test(a.n) && (liftEnd >= 0 ? near(a) : /stair|climb|tread/i.test(a.n)));
}
function autoCardio(w) { // fill cardio from WHOOP unless you've set it yourself; returns true if it changed
  if (!w || w.cardioOff) return false; // WHOOP has the final say over hand-entered cardio; only removing cardio opts out
  const cur = w.cardio?.name || S().cardio.name, order = [cur, ...Object.keys(CARDIO_RE).filter(n => n !== cur)];
  for (const name of order) {
    const acts = whoopCardio(w.date, name), min = Math.round(sum(acts.map(a => a.min || 0)));
    if (!min) continue;
    const next = { name, min, lvl: w.cardio?.lvl ?? null, done: true, src: 'whoop' };
    if (JSON.stringify(next) === JSON.stringify(w.cardio)) return false;
    w.cardio = next; return true;
  }
  return false;
}
function sessDur(w) { const m = whoopLiftMin(w.date); return m != null ? m * 60 : w.durMin ? w.durMin * 60 : (w.dur || null); } // seconds; WHOOP first, then minutes entered by hand, then old timer logs

/* ============================================================
   VOLUME — direct working sets per muscle group
   ============================================================ */
function planWeekly(prog) { // sets per week if one session is trained every day
  const o = prog.order.filter(id => prog.sessions[id]); const out = {}; if (!o.length) return out;
  for (const id of o) for (const it of prog.sessions[id].items) { const g = exDef(it.ex).g; out[g] = (out[g] || 0) + it.sets; }
  for (const g in out) out[g] = out[g] * 7 / o.length;
  return out;
}
function doneByGroup(from, to) {
  const out = {};
  for (const w of Object.values(STATE.w)) if (w.date >= from && w.date <= to) for (const e of w.ex || []) { const n = doneSets(e).length; if (n) { const g = exDef(e.id).g; out[g] = (out[g] || 0) + n; } }
  return out;
}

/* ============================================================
   DAILY METRICS (WHOOP + MacroFactor)
   d[date] = { rec, hrv, rhr, slp (min asleep), sp (sleep perf %), str (day strain), kb (kcal burned),
               wt (scale kg), tw (trend kg), kcal, p, c, f, exp (expenditure), kT, pT, acts:[...] }
   ============================================================ */
function dayVal(date, k) {
  const v = STATE.d[date]?.[k]; if (v != null) return v;
  if (k === 'tw' || k === 'exp') { const x = derived()[k][date]; return x == null ? null : x; }
  return null;
}
function latestWith(k, onOrBefore = today()) {
  let best = null; for (const date in STATE.d) if (date <= onOrBefore && STATE.d[date][k] != null && (!best || date > best)) best = date;
  if (k === 'tw' || k === 'exp') for (const date in derived()[k]) if (date <= onOrBefore && (!best || date > best)) best = date;
  return best;
}
const stepsOf = d => dayVal(d, 'stp') ?? dayVal(d, 'stpi'); // WHOOP's count first, the iPhone's when WHOOP has none
/* Trend weight and expenditure for days MacroFactor's export doesn't cover (Apple Health only carries intake and scale
   weight). Trend: scale weight smoothed 10% per weigh-in, carrying on from MacroFactor's trend wherever one exists, shown
   up to 7 days past the last weigh-in. Expenditure: average intake over the 28 days before, minus the change in trend
   weight over them (7700 kcal per kg); needs at least 21 logged days. MacroFactor's own numbers always win. */
let DER = { key: null };
function derived() {
  const key = STATE.v + ':' + Object.keys(STATE.d).length; if (DER.key === key) return DER;
  const tw = {}, exp = {}, t0 = today(), D = STATE.d;
  const ds = Object.keys(D).filter(d => d <= t0 && (D[d].wt != null || D[d].tw != null || D[d].kcal != null)).sort();
  if (ds.length) {
    let t = null, lastW = null;
    for (let d = ds[0]; d <= t0; d = addDays(d, 1)) {
      const x = D[d] || {};
      if (x.tw != null) t = x.tw; else if (x.wt != null) t = t == null ? x.wt : t + 0.1 * (x.wt - t);
      if (x.wt != null || x.tw != null) lastW = d;
      if (x.tw == null && t != null && diffDays(lastW, d) <= 7) tw[d] = Math.round(t * 100) / 100;
    }
    const twv = d => D[d]?.tw ?? tw[d];
    for (let d = addDays(ds[0], 28); d <= t0; d = addDays(d, 1)) {
      if (D[d]?.exp != null) continue;
      const a = addDays(d, -28), b = addDays(d, -1), wa = twv(a), wb = twv(b); if (wa == null || wb == null) continue;
      const k = []; for (let i = 1; i <= 28; i++) { const v = D[addDays(d, -i)]?.kcal; if (v != null) k.push(v); }
      if (k.length < 21) continue;
      exp[d] = Math.round((mean(k) - (wb - wa) * 7700 / 27) / 10) * 10;
    }
  }
  return DER = { key, tw, exp };
}
function avgOver(k, end, days, excludeEnd) {
  const v = []; for (let i = excludeEnd ? 1 : 0; i < days + (excludeEnd ? 1 : 0); i++) { const x = dayVal(addDays(end, -i), k); if (x != null) v.push(x); }
  return v.length ? { avg: mean(v), n: v.length } : null;
}
/* HRV normal range (Plews et al., 2013): 7-day rolling mean of ln(RMSSD) compared with the
   previous 60 days' mean ± 0.5 SD (the smallest worthwhile change). Shown back in ms. */
function hrvBand(date) {
  const ln = d => { const v = dayVal(d, 'hrv'); return v > 0 ? Math.log(v) : null; };
  const w7 = [], base = [];
  for (let i = 0; i < 7; i++) { const v = ln(addDays(date, -i)); if (v != null) w7.push(v); }
  for (let i = 7; i < 67; i++) { const v = ln(addDays(date, -i)); if (v != null) base.push(v); }
  if (w7.length < 4 || base.length < 20) return null;
  const m = mean(base), sd = Math.sqrt(sum(base.map(v => (v - m) ** 2)) / (base.length - 1)), r = mean(w7);
  return { roll: Math.exp(r), lo: Math.exp(m - .5 * sd), hi: Math.exp(m + .5 * sd), state: r < m - .5 * sd ? 'below' : r > m + .5 * sd ? 'above' : 'within' };
}
const HRV_STATE = { below: ['warn', 'Below normal'], within: ['good', 'Normal range'], above: ['', 'Above normal'] };
function weightRate(end = today(), days = 28) { // trend-weight change per week over the last `days`
  const d1 = latestWith('tw', end); if (!d1) return null;
  const d0 = latestWith('tw', addDays(d1, -days)); if (!d0 || diffDays(d0, d1) < 14) return null;
  const a = dayVal(d0, 'tw'), b = dayVal(d1, 'tw'), wk = (b - a) / diffDays(d0, d1) * 7;
  return { wk, pct: wk / b * 100, now: b, weeks: Math.round(diffDays(d0, d1) / 7) };
}
function weekRows(n) {
  const t = today(), rows = [];
  for (let k = 0; k < n; k++) {
    const ws = addDays(weekStart(t), -7 * k), we = addDays(ws, 6), end = we > t ? t : we;
    const days = []; for (let d = ws; d <= end; d = addDays(d, 1)) days.push(d);
    const wk = Object.values(STATE.w).filter(w => w.date >= ws && w.date <= end && !w.rest);
    const av = key => { const v = days.map(d => dayVal(d, key)).filter(x => x != null); return v.length ? mean(v) : null; };
    const twA = dayVal(latestWith('tw', addDays(ws, -1)) || '', 'tw'), twB = dayVal(latestWith('tw', end) || '', 'tw');
    rows.push({ ws, cur: we > t, sessions: wk.length, sets: sum(wk.map(w => wStats(w).sets)), cardio: sum(wk.map(w => wStats(w).cardio)),
      rec: av('rec'), hrv: av('hrv'), slp: av('slp'), kcal: av('kcal'), p: av('p'), tw: twB, dtw: twA != null && twB != null && latestWith('tw', end) >= ws ? twB - twA : null });
  }
  return rows;
}
function recTone(r) { return r == null ? '' : r >= 67 ? 'good' : r >= 34 ? 'warn' : 'bad'; }
function recWord(r) { return r == null ? '' : r >= 67 ? 'Green' : r >= 34 ? 'Yellow' : 'Red'; }
function recoveryAfter() { // mean next-morning recovery after each session type
  const by = {};
  for (const w of Object.values(STATE.w)) {
    const r = dayVal(addDays(w.date, 1), 'rec'); if (r == null) continue;
    const k = sessName(w); (by[k] = by[k] || []).push(r);
  }
  return Object.entries(by).map(([k, v]) => ({ k, avg: mean(v), n: v.length }));
}
function rangeStart() { return ui.range === 0 ? null : addDays(today(), -ui.range + 1); }
function datesWith(keys, from) {
  return Object.keys(STATE.d).filter(d => (!from || d >= from) && d <= today() && keys.some(k => STATE.d[d][k] != null)).sort();
}
