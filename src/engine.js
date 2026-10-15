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
/* Planned rest days (S().restPlan, dates from today on): a one-off day off ahead. Like any unlogged day, it uses up a
   rotation rest slot if one is due; otherwise the rotation waits and the sessions after it move back a day. */
function plannedRest(date) { return (S().restPlan || []).includes(date); }
function upcoming(n) { // [{date, s, done, planned}] starting today; assumes you train every day from here except planned rest
  const out = [], t = today(), rec = STATE.w[t];
  let s = rec ? (sessDef(rec.s) ? rec.s : '_rest') : sessionFor(t);
  if (!rec && plannedRest(t) && !isRestSlot(s)) out.push({ date: t, s: '_rest', done: false, planned: true });
  else { out.push({ date: t, s, done: !!rec, planned: !rec && plannedRest(t) }); s = rec ? sessionFor(addDays(t, 1)) : nextAfter(s); }
  for (let i = 1, d = addDays(t, 1); i < n; i++, d = addDays(d, 1)) {
    if (plannedRest(d) && !isRestSlot(s)) { out.push({ date: d, s: '_rest', done: false, planned: true }); continue; }
    out.push({ date: d, s, done: false, planned: plannedRest(d) }); s = nextAfter(s);
  }
  return out;
}
function slotName(id) { return id === '_rest' ? 'Rest' : sessDef(id)?.name || ''; }
function rotationNo(date = today()) { // v1.53: which time through the split, ticking over on the day its first session is done (or due);
  const first = trainIds()[0]; if (!first) return 1; // sessions before the first one belong to an earlier rotation. A new split counts its own first session.
  let k = Object.values(STATE.w).filter(w => w.s === first && !w.rest && w.date <= date).length;
  if (!STATE.w[date] && sessionFor(date) === first) k++; // due today: the new rotation starts today
  return Math.max(1, k);
}

/* ============================================================
   LIFT HISTORY, e1RM, PRs, MAINTENANCE STATUS
   Every lookup goes through one index of logged sets per lift (lix), rebuilt only when the data
   changes (STATE.v, bumped on every save, import and sync) or the day turns over.
   ============================================================ */
function emptyW(w) { // a session started here (w.nw, set by Log) with nothing in it yet: no sets, cardio, notes or duration
  return !!w && !!w.nw && !w.rest && !(w.ex || []).some(e => (e.sets || []).some(s => s.done) || (e.note || '').trim()) && !w.cardio?.done && !(w.note || '').trim() && !w.durMin;
}
/* Working sets: done, with reps, not warm-ups. Sets carry an optional type t (v1.36): 'w' warm-up (left out of volume,
   bests, history and the Aim's set count), 'd' drop set (counts as a working set). */
function doneSets(ex) { return (ex.sets || []).filter(s => s.done && s.r > 0 && s.t !== 'w'); }
/* Warm-up ladder under a working weight: 1 to 3 sets, rising in load and falling in reps, rounded to the lift's step
   (a common scheme: about 50% x 8, 70% x 5, 85% x 3 before the top set). */
const WARM = { 1: [[0.6, 5]], 2: [[0.5, 8], [0.75, 4]], 3: [[0.45, 8], [0.65, 5], [0.85, 3]] };
function warmup(exId, top, n) {
  if (!(top > 0) || !n) return [];
  const st = exStep(exId), sch = WARM[Math.min(n, 3)];
  return Array.from({ length: n }, (_, k) => { const [f, r] = sch[Math.max(0, sch.length - n + k)] || sch[0]; return { w: Math.max(st, Math.round(top * f / st) * st), r, warm: true }; });
}
function aimIn(w, i) { return suggest(w.ex[i].id, w.date, ctxLog(w, i)); } // the Aim for exercise i where it sits in this log (v1.43)
function rowAim(e, j, date, sg = suggest(e.id, date)) { // the Aim for any row: warm-ups from the ladder, working sets by their working index
  const s = e.sets[j]; if (!sg) return null;
  if (s && s.t === 'w') { const ws = e.sets.filter(x => x.t === 'w'); return warmup(e.id, sg.w, ws.length)[ws.indexOf(s)] || null; }
  return setAim(e.id, date, e.sets.slice(0, j).filter(x => x.t !== 'w').length, sg);
}
let LIX = { key: null };
function lix() {
  const key = STATE.v + ':' + today(); if (LIX.key === key) return LIX;
  const by = {};
  for (const w of workoutsSorted()) (w.ex || []).forEach((e, i) => { const ds = doneSets(e); if (ds.length) (by[e.id] = by[e.id] || []).push({ date: w.date, sets: ds, ctx: ctxLog(w, i) }); }); // ctx: where it sat in that session (v1.43)
  return LIX = { key, by, ex: {}, bw: null };
}
function nBefore(list, before) { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].date < before) lo = m + 1; else hi = m; } return lo; } // entries dated before `before`
/* Bodyweight lifts can count body weight (exDef.bwf: the share of body weight moved, about 1 for pull-ups, 0.9 for dips):
   trend weight on or before the date, else the earliest on record. Lifts without a share, like the ab roller, or with no
   weight on record, score by reps (2.5 kg added = 1 rep). */
function bwShare(exId) { const d = exDef(exId); return d.u === 'bw' && d.bwf > 0 ? Math.min(d.bwf, 1) : 0; }
function bwAt(date) {
  const L = lix();
  if (!L.bw) { const m = { ...derived().tw }; for (const d in STATE.d) if (STATE.d[d].tw != null) m[d] = STATE.d[d].tw; const ds = Object.keys(m).sort(); L.bw = { ds, v: ds.map(d => m[d]) }; }
  const { ds, v } = L.bw; if (!ds.length) return null; if (!date || date < ds[0]) return v[0];
  let lo = 0, hi = ds.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ds[m] <= date) lo = m; else hi = m - 1; }
  return v[lo];
}
function bodyKg(exId, date) { const f = bwShare(exId); if (!f) return null; const b = bwAt(date); return b != null ? f * b : null; }
function bwScored(exId) { return bwShare(exId) > 0 && bwAt(null) != null; }
function e1rm(s) { if (!s || !(s.r > 0)) return 0; const w = s.w || 0; if (w <= 0) return 0; return w * (1 + Math.min(s.r, 15) / 30); }
function setScore(exId, s, date) { // one number to rank sets: e1RM, or reps for bodyweight lifts that don't count body weight
  if (exDef(exId).u !== 'bw') return e1rm(s);
  const B = bodyKg(exId, date); return B != null ? e1rm({ w: B + (s.w || 0), r: s.r }) : (s.r || 0) + (s.w || 0) / 2.5;
}
function maxScore(exId) { const b = exDef(exId).base; return b && b.r > 0 ? setScore(exId, b, null) : 0; }
function lixEx(exId) { // this lift's sessions in date order with their best set, plus the running best (stated max included)
  const L = lix(); if (L.ex[exId]) return L.ex[exId];
  const list = (L.by[exId] || []).map(x => { let top = x.sets[0], sc = setScore(exId, top, x.date); for (const s of x.sets) { const v = setScore(exId, s, x.date); if (v > sc) { sc = v; top = s; } } return { date: x.date, sets: x.sets, top, sc, ctx: x.ctx }; });
  const b = exDef(exId).base, chain = cur => list.map(x => (cur = bestStep(exId, cur, x.sets, x.date))); // running best after each session (v1.50)
  const best = chain(b && b.r > 0 ? { s: b, sc: maxScore(exId), date: null } : null), logged = chain(null);
  return L.ex[exId] = { list, best, logged, pre: best.map(r => r ? r.sc : 0) };
}
/* A best (v1.50, his rule): a higher estimated 1RM at the best's weight or heavier, so light high-rep sets never count.
   With nothing yet, the heaviest set starts it (most reps on ties). */
function beatsBest(exId, cur, s, date) { const sc = setScore(exId, s, date); return !cur || (sc > cur.sc + 1e-9 && (s.w || 0) >= (cur.s.w || 0) - 1e-9); }
function bestStep(exId, cur, sets, date) {
  if (!cur) { const h = sets.reduce((a, x) => !a || (x.w || 0) > (a.w || 0) || ((x.w || 0) === (a.w || 0) && x.r > a.r) ? x : a, null); return h ? { s: h, sc: setScore(exId, h, date), date } : null; }
  let nx = cur; for (const x of sets) { if (beatsBest(exId, cur, x, date) && setScore(exId, x, date) > nx.sc) nx = { s: x, sc: setScore(exId, x, date), date }; }
  return nx;
}
function bestRecBefore(exId, before) { const ix = lixEx(exId), i = nBefore(ix.list, before), b = exDef(exId).base; return i ? ix.best[i - 1] : b && b.r > 0 ? { s: b, sc: maxScore(exId), date: null } : null; }
function lastFor(exId, before) { // the last session of this lift before a date
  const { list } = lixEx(exId), i = nBefore(list, before); if (!i) return null;
  let j = i - 1; while (j > 0 && list[j - 1].date === list[i - 1].date) j--;
  return { date: list[j].date, sets: list[j].sets };
}
function bestBefore(exId, before) { const r = bestRecBefore(exId, before); return r ? r.sc : 0; } // best score on dates strictly before, including the stated max
function bestSet(exId, before = '9999') { // best before a date: stated max or any logged set
  const r = bestRecBefore(exId, before); return r ? r.s : null;
}
function records(exId) { // heaviest set and best e1RM set, from logs plus the stated max
  const b = exDef(exId).base, { list } = lixEx(exId), cands = [];
  if (b && b.r > 0) cands.push({ s: b, date: null });
  for (const x of list) for (const s of x.sets) cands.push({ s, date: x.date });
  if (!cands.length) return null;
  const heavy = cands.reduce((a, c) => ((c.s.w || 0) > (a.s.w || 0) || ((c.s.w || 0) === (a.s.w || 0) && c.s.r > a.s.r)) ? c : a);
  const r = bestRecBefore(exId, '9999'), best = r ? { s: r.s, date: r.date } : cands[0];
  return { heavy, best, logged: list.length > 0 };
}
function hasRef(exId, before) { return maxScore(exId) > 0 || hasHistory(exId, before); }
function hasHistory(exId, before) { return nBefore(lixEx(exId).list, before) > 0; }
function liftSeries(exId) { return lixEx(exId).list.map(x => ({ date: x.date, y: x.sc, top: x.top })); }
const median = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
function maintenance(exId) { // recent 28 days vs days 29–90: is strength holding? Medians of each session's best set, so one standout day doesn't decide it
  const t = today(), ser = lixEx(exId).list.map(x => ({ date: x.date, y: freshSc(exId, x), top: x.top })); // on the fresh scale, so a lift moved later in the session doesn't read as a drop (v1.43)
  const rec = ser.filter(p => diffDays(p.date, t) <= 28), pri = ser.filter(p => { const a = diffDays(p.date, t); return a > 28 && a <= 90; });
  if (!rec.length) return { state: 'none', last: ser[ser.length - 1] || null };
  const r = median(rec.map(p => p.y)); if (!pri.length) return { state: 'new', r, last: ser[ser.length - 1] };
  const p = median(pri.map(x => x.y)); const ch = p > 0 ? (r / p - 1) * 100 : 0;
  return { state: ch > 2.5 ? 'up' : ch >= -2.5 ? 'hold' : ch >= -5 ? 'dip' : 'down', ch, r, p, last: ser[ser.length - 1] };
}
const MSTATE = { up: ['good', 'Up'], hold: ['good', 'Holding'], dip: ['warn', 'Dip'], down: ['bad', 'Down'], new: ['', 'Too new'], none: ['', 'No recent sets'] };
function fmtLoad(exId, w) {
  const u = exDef(exId).u;
  if (u === 'bw') return w ? `BW+${fmt(w, 2)}` : 'BW';
  if (u === 'plates') return `${fmt(w, 2)} pl`;
  return `${fmt(w, 2)}`;
}
function fmtSet(exId, s) { // "44 kg × 7", "2.75 pl × 8", "BW+5 × 8", "12 reps" (v1.36: units and spaces everywhere)
  const u = exDef(exId).u; if (u === 'bw' && !s.w) return `${s.r} reps`;
  return `${fmtLoad(exId, s.w)}${u === 'kg' ? ' kg' : ''} × ${s.r}`;
}
function setsTxt(exId, sets) { // compress "48 kg × 6, 48 kg × 6" to "48 kg × 6 (2 sets)"
  const parts = sets.map(s => fmtSet(exId, s)); const out = [];
  for (const p of parts) { const l = out[out.length - 1]; if (l && l.p === p) l.n++; else out.push({ p, n: 1 }); }
  return out.map(o => o.n > 1 ? `${o.p} (${o.n} sets)` : o.p).join(', ');
}
function scoreTxt(exId, v) { const u = exDef(exId).u; return u === 'bw' && !bwScored(exId) ? `${fmt(v, 0)} reps` : u === 'bw' ? `${fmt(v, 1)} kg` : u === 'plates' ? `${fmt(v, 2)} pl` : `${fmt(v, 1)} kg`; }

/* ============================================================
   EXERCISE ORDER (v1.43)
   A lift done later in a session is weaker than the same lift done fresh: mostly from the sets before it that worked
   the same muscles, a little from everything before it (exercise order review: Simão et al., 2012, where a lift done
   after several sets for the same muscles lost a few reps). For each session of a lift, the log order gives
     L = working sets before it, each weighted by how much its exercise works this lift's muscles (0..1)
     G = all working sets before it
   and performance is modelled as fresh strength × exp(−kL·L − kG·G).
   The k's are learned from Louis's own sessions. Each lift runs a Kalman filter over its sessions with state
   [fresh strength (log), kL, kG]: fresh strength drifts as a random walk (~1% a week), each session observes
   log(strength) = fresh − kL·L − kG·G + noise. A lift that moved slots shows a step the drift can't explain, which is
   what teaches its kL. The filters start with no opinion on k; their evidence is then pooled: kG is shared by all lifts,
   each lift's kL is pulled toward the pooled mean (spread τ), and the pooled mean toward a research prior (~1.2% per
   overlapping set; systemic ~0.2% per set) until the data outweighs it. A lift that has never changed slot keeps the
   pooled value, which cancels out as long as it stays in that slot.
   Everything that feeds the Aim or the 4 wk badge is put on the fresh scale, and the Aim is set for where the lift
   sits today (the log order, or the Plan order before a session starts). The Plan order is his usual order.
   ============================================================ */
const ORD = { kL0: 0.012, sL: 0.008, kG0: 0.002, sG: 0.002, tau: 0.015, q: 0.01 ** 2 / 7, sig0: 0.04, kLmax: 0.06, kGmax: 0.01 };
function musc(exId) { // muscles a lift works: its group 1, groups it also works 0.5 ('other' says nothing about muscles)
  const d = exDef(exId), m = {}; if (d.g && d.g !== 'other') m[d.g] = 1;
  for (const g of d.g2 || SECONDARY[exId] || []) if (!m[g] && g !== 'other') m[g] = 0.5; return m;
}
function overlap(a, b) { // how much one set of a fatigues lift b, 0..1: shared muscles weighted by how much b relies on them
  if (a === b) return 1; const ma = musc(a), mb = musc(b); let dot = 0, bb = 0;
  for (const g in mb) { bb += mb[g] ** 2; dot += (ma[g] || 0) * mb[g]; } return bb ? Math.min(1, dot / bb) : 0;
}
function ctxFrom(ids, ns, i) { let L = 0, G = 0; for (let q = 0; q < i; q++) { const n = ns[q]; if (!n) continue; G += n; L += n * overlap(ids[q], ids[i]); } return { L, G }; }
const ZERO_CTX = { L: 0, G: 0 };
function ctxLog(w, i) { // where exercise i sits in a log: the working sets done before it, or still planned for exercises not reached yet
  const ex = w.ex || [], done = ex.map(e => doneSets(e).length), later = q => done.slice(q + 1).some(n => n > 0);
  return ctxFrom(ex.map(e => e.id), ex.map((e, q) => later(q) || done[q] >= e.sets.filter(s => s.t !== 'w').length ? done[q] : e.sets.filter(s => s.t !== 'w').length), i);
}
function ctxPlan(sid, exId, slot) { // the usual position: the Plan order of that session (slot: count only the first slot - 1 exercises, for a stated max)
  const items = (sessDef(sid)?.items || []).filter(it => S().ex[it.ex]); let i = items.findIndex(it => it.ex === exId); if (i < 0) return null;
  const ids = items.map(it => it.ex), ns = items.map(it => defSets(it.ex));
  if (slot != null) { const k = Math.max(0, Math.min(slot - 1, i)); ids.splice(k, 0, ids.splice(i, 1)[0]); ns.splice(k, 0, ns.splice(i, 1)[0]); i = k; }
  return ctxFrom(ids, ns, i);
}
function usualSid(exId, sid) { if (sid && sessDef(sid)?.items?.some(it => it.ex === exId)) return sid; return order().find(id => sessDef(id)?.items?.some(it => it.ex === exId)) || null; }
function usualCtx(exId, sid) { const s = usualSid(exId, sid); return (s && ctxPlan(s, exId)) || ZERO_CTX; }
function baseCtx(exId) { const d = exDef(exId); return d.bctx || baseCtxNow(exId); } // fixed when the max was entered (v1.44), so a later Plan reorder can't change what it means
const defSets = id => exDef(id).sets || 2; // an exercise's set count, the same in every session; a log can change its own day only (v1.45)
function snapBase(exId) { const d = S().ex[exId]; if (!d) return false; if (!(d.base && d.base.r > 0)) { const had = !!d.bctx; delete d.bctx; return had; } const c = baseCtxNow(exId); d.bctx = { L: +c.L.toFixed(3), G: +c.G.toFixed(3) }; return true; }
function baseCtxNow(exId) { const d = exDef(exId); if (!(d.bpos > 0)) return usualCtx(exId); if (d.bpos === 1) return ZERO_CTX; const s = usualSid(exId); return (s && ctxPlan(s, exId, d.bpos)) || ZERO_CTX; } // where the stated max was set
function inv2(M) { const d = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return Math.abs(d) < 1e-15 ? null : [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]]; }
function ordSig(by) { // session-to-session noise: spread of changes between consecutive sessions in the same slot
  const d = [], t = today(); for (const id in by) { const { list } = lixEx(id), rir = exRir(id); for (let i = 1; i < list.length; i++) { const a = list[i - 1], b = list[i];
    if (b.date >= t || a.ctx.L !== b.ctx.L || a.ctx.G !== b.ctx.G || diffDays(a.date, b.date) > 42) continue; const va = refScore(id, a.top, rir, a.date), vb = refScore(id, b.top, rir, b.date); if (va > 0 && vb > 0) d.push(Math.log(vb / va)); } }
  if (d.length < 8) return ORD.sig0; const m = median(d); return Math.min(0.1, Math.max(0.02, 1.4826 * median(d.map(x => Math.abs(x - m))) / Math.SQRT2));
}
function ordLift(id, sig) { // one lift's filter; returns its evidence on (kL, kG) with the filter's own wide prior taken back out
  const { list } = lixEx(id), rir = exRir(id); let s = [0, 0, 0], P = [[100, 0, 0], [0, 1, 0], [0, 0, 1]], prev = null, n = 0, chg = 0, lastL = null;
  for (const e of list) {
    if (e.date >= today()) break; // learns from finished days only, so today's sets don't move today's Aims
    const v = refScore(id, e.top, rir, e.date); if (!(v > 0)) continue;
    if (prev) P[0][0] += ORD.q * Math.max(1, diffDays(prev, e.date)); prev = e.date;
    const h = [1, -e.ctx.L, -e.ctx.G], Ph = P.map(r => r[0] * h[0] + r[1] * h[1] + r[2] * h[2]), S = h[0] * Ph[0] + h[1] * Ph[1] + h[2] * Ph[2] + sig * sig;
    const y = Math.log(v) - (h[0] * s[0] + h[1] * s[1] + h[2] * s[2]);
    if (n >= 3 && y * y / S > 16) continue; // a one-off (injury, mislogged set): don't let it teach the model
    const K = Ph.map(x => x / S); s = s.map((x, i) => x + K[i] * y); P = P.map((r, i) => r.map((x, j) => x - K[i] * Ph[j]));
    n++; if (lastL != null && Math.abs(e.ctx.L - lastL) > 0.25) chg++; lastL = e.ctx.L;
  }
  if (n < 2) return null;
  const V = inv2([[P[1][1], P[1][2]], [P[2][1], P[2][2]]]), mu = [s[1], s[2]]; if (!V) return null; // V: information on (kL, kG)
  const J = [[Math.max(0, V[0][0] - 1), V[0][1]], [V[1][0], Math.max(0, V[1][1] - 1)]], hv = [V[0][0] * mu[0] + V[0][1] * mu[1], V[1][0] * mu[0] + V[1][1] * mu[1]]; // minus the filter's N(0, 1) prior
  return { J, h: hv, n, chg };
}
function ordModel() {
  const X = lix(); if (X.ord) return X.ord;
  const sig = ordSig(X.by), lifts = {}; for (const id in X.by) { const r = ordLift(id, sig); if (r) lifts[id] = r; }
  const tau2 = ORD.tau ** 2, clampL = k => Math.max(0, Math.min(ORD.kLmax, k)); let m = ORD.kL0, g = ORD.kG0, ks = {};
  for (let it = 0; it < 8; it++) {
    ks = {}; let pm = 1 / ORD.sL ** 2, hm = ORD.kL0 / ORD.sL ** 2, pg = 1 / ORD.sG ** 2, hg = ORD.kG0 / ORD.sG ** 2;
    for (const id in lifts) { const { J, h } = lifts[id], hl = h[0] - J[0][1] * g; // this lift's evidence on kL with kG fixed
      ks[id] = clampL((hl + m / tau2) / (J[0][0] + 1 / tau2));
      if (J[0][0] > 1e-9) { const w = 1 / (1 / J[0][0] + tau2); pm += w; hm += w * hl / J[0][0]; }
      pg += J[1][1]; hg += h[1] - J[1][0] * ks[id]; }
    m = clampL(hm / pm); g = Math.max(0, Math.min(ORD.kGmax, hg / pg));
  }
  const by = {}; for (const id in lifts) { const J = lifts[id].J[0][0]; by[id] = { k: ks[id], sd: 1 / Math.sqrt(J + 1 / tau2), n: lifts[id].n, chg: lifts[id].chg, own: J * tau2 }; } // own: how much its own sessions count against the pooled mean
  return X.ord = { kL: m, kG: g, sig, by };
}
function ordK(exId) { const M = ordModel(); return { kL: M.by[exId]?.k ?? M.kL, kG: M.kG }; }
function ordFactor(exId, ctx) { if (!ctx) return 1; const k = ordK(exId); return Math.exp(-k.kL * ctx.L - k.kG * ctx.G); } // performance there ÷ performance fresh
function freshSc(exId, x) { return x.sc / ordFactor(exId, x.ctx); }
function ordNote(exId, ctx, sid) { // today's slot against the usual one, for the line under the Aim
  const u = usualCtx(exId, sid), f = ordFactor(exId, ctx) / ordFactor(exId, u) - 1; return Math.abs(f) >= 0.01 ? f : 0;
}

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
function refScore(exId, s, rir, date) {
  if (exDef(exId).u !== 'bw') return e1rm({ w: s.w, r: (s.r || 0) + rir });
  const B = bodyKg(exId, date); return B != null ? e1rm({ w: B + (s.w || 0), r: (s.r || 0) + rir }) : (s.r || 0) + rir + (s.w || 0) / 2.5;
}
function strengthRef(exId, before, ctx) { // current strength: median of the top sets from the last 3 sessions in 90 days, at a position in the session
  const { list } = lixEx(exId), n = nBefore(list, before), from = addDays(before, -90), rir = exRir(exId), at = ordFactor(exId, ctx || usualCtx(exId));
  const last = list.slice(Math.max(0, n - 3), n).filter(x => x.date >= from);
  // each on the fresh scale first (v1.43), so sessions done in another slot count fairly, then back to where the lift sits now
  if (last.length) { const v = last.map(x => refScore(exId, x.top, rir, x.date) / ordFactor(exId, x.ctx)).sort((a, b) => a - b), f = v[Math.floor((v.length - 1) / 2)]; return { v: f * at, fresh: f, n: last.length, top: last[last.length - 1].top }; }
  const b = exDef(exId).base; if (!(b && b.r > 0)) return null; const f = refScore(exId, b, 0, null) / ordFactor(exId, baseCtx(exId)); return { v: f * at, fresh: f, n: 0, top: b };
}
function fitLoad(exId, e, startW, date) { // load × reps leaving the lift's reserve at strength e; stays on the last load while it fits (double progression)
  const d = exDef(exId), rir = exRir(exId);
  if (d.u === 'bw') {
    const B = bodyKg(exId, date);
    if (B == null) { const add = startW || 0; return { w: add, r: Math.max(1, Math.floor(e - add / 2.5 + 1e-6) - rir), rir }; }
    if (!(e > 0)) return null; // body weight counts: same double progression, on the added load (never below none)
    const step = exStep(exId), mid = Math.round((d.lo + d.hi) / 2), repsAt = a => Math.floor(30 * (e / (B + a) - 1) + 1e-6) - rir;
    let a = startW != null ? startW : Math.max(0, Math.floor((e / (1 + (mid + rir) / 30) - B) / step + 1e-6) * step), r = repsAt(a);
    while (r < d.lo && a - step >= -1e-9) { a -= step; r = repsAt(a); }
    while (r > d.hi && repsAt(a + step) >= d.lo) { a += step; r = repsAt(a); }
    if (r > d.hi) r = d.hi; // the next load doesn't fit the range yet: the top of the range, with a little more in reserve
    return { w: Math.max(0, +a.toFixed(3)), r: Math.max(1, r), rir };
  }
  const step = exStep(exId), mid = Math.round((d.lo + d.hi) / 2), repsAt = w => Math.floor(30 * (e / w - 1) + 1e-6) - rir;
  let w = startW > 0 ? startW : Math.floor(e / (1 + (mid + rir) / 30) / step + 1e-6) * step; if (!(w > 0) || !(e > 0)) return null;
  let r = repsAt(w);
  while (r < d.lo && w - step > 0) { w -= step; r = repsAt(w); } // too heavy for the range now: come down
  while (r > d.hi && repsAt(w + step) >= d.lo) { w += step; r = repsAt(w); } // top of the range passed: step up
  if (r > d.hi) r = d.hi; // the next jump doesn't fit the range yet (a coarse step on a light cable): the top of the range, a little more in reserve (v1.36; was up to 2 reps over)
  return { w: +w.toFixed(3), r: Math.max(1, r), rir };
}
function holdTarget(exId, before, ctx) { // maintenance: hold current strength
  const ref = strengthRef(exId, before, ctx); return ref ? fitLoad(exId, ref.v, ref.n ? ref.top.w : null, before) : null;
}
/* Overload: target strength climbs from where you were when you switched (S().growFrom) by the weekly rate,
   so small weekly gains add up instead of rounding away. It never asks for more than 5% above what your logged
   sets show (about a rep and a half), and pushes on from there if you get ahead of plan. */
function growStrength(exId, before, ctx) {
  const rate = S().progRate ?? 0.005, cur = strengthRef(exId, before, ctx); if (!cur) return null;
  const from = S().growFrom && S().growFrom <= before ? S().growFrom : before, base = strengthRef(exId, from, ctx) || cur;
  const plan = base.v * (1 + rate) ** Math.max(1, Math.floor(diffDays(from, before) / 7) + 1);
  return { e: Math.min(Math.max(plan, cur.v * (1 + rate)), cur.v * 1.05), cur };
}
function suggest(exId, before, ctx) { // the Aim shown on Today and in the log: { w, r, rir } or null; ctx: where the lift sits (default its usual slot)
  if (S().suggest === false) return null;
  if (S().goal !== 'grow') return holdTarget(exId, before, ctx);
  const g = growStrength(exId, before, ctx); return g ? fitLoad(exId, g.e, g.cur.n ? g.cur.top.w : null, before) : null;
}
/* PROGRESSION PLAN (Plan tab): the overload track week by week from today, at the lift's reps in reserve.
   Reps climb at a fixed load until the top of the range, then the load steps up and reps drop back. */
function progression(exId, weeks, rate, before = today()) {
  const ref = strengthRef(exId, before); if (!ref) return null;
  const e1 = S().goal === 'grow' ? growStrength(exId, before).e : ref.v * (1 + rate), out = [];
  let w = ref.n ? ref.top.w : null;
  for (let k = 1; k <= weeks; k++) { const e = e1 * (1 + rate) ** (k - 1), p = fitLoad(exId, e, w, before); if (!p) return null; w = p.w; out.push({ k, ...p, g: e / ref.v - 1 }); }
  return out;
}
/* Sets after the first: one weight step lighter for the same reps. Repeating set 1's load would need long rests, growth is
   similar across loads when sets end near failure (Schoenfeld et al., 2017), and rest beyond ~90 s adds little (Singer et al., 2024).
   strengthRef() reads each session's best set, so lighter later sets don't pull future Aims down. */
function setAim(exId, before, j, sg = suggest(exId, before)) {
  if (!sg || !j) return sg;
  const d = exDef(exId); if (d.u === 'bw' && !bwScored(exId)) return sg; // reps-only bodyweight lifts have no load to drop
  const w = +(sg.w - exStep(exId)).toFixed(3);
  return (d.u === 'bw' ? w < 0 : w <= 0) ? sg : { ...sg, w, back: true };
}
/* Overload during a cut: a deficit of ~500 kcal a day blunts muscle gain though strength mostly holds (Murphy & Koehler, 2022);
   at Louis's size that is roughly 0.5% of body weight a week, so faster loss flags the Overload setting. */
function cutCheck() { const r = weightRate(); return r && r.pct <= -0.5 ? r : null; }
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
    ex: (sd?.items || []).filter(it => S().ex[it.ex]).map(it => ({ id: it.ex, sets: prefill(it.ex, defSets(it.ex), date) })),
    cardio: { name: S().cardio.name, min: S().cardio.min, lvl: null, done: false }, note: '',
  };
}
/* Exercise order inside one day's log (v1.39): the whole entry moves (sets, warm-ups, ticks, note); the Plan is untouched. */
function moveEx(w, from, to) {
  const n = w?.ex?.length || 0; if (!(from >= 0 && from < n && to >= 0 && to < n) || from === to) return false;
  const [m] = w.ex.splice(from, 1); w.ex.splice(to, 0, m); return true;
}
const movedIdx = (i, from, to) => i == null || i < 0 ? i : i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i; // where index i sits after moveEx
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
    let run = bestRecBefore(e.id, w.date); // sets in order, each against the best so far (same rule as beatsBest)
    for (const s of doneSets(e)) if (run && beatsBest(e.id, run, s, w.date)) { run = { s, sc: setScore(e.id, s, w.date), date: w.date }; out.push({ id: e.id, s }); }
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
function actSpan(acts) { // v1.46: WHOOP activities as one span: strain (highest if several), start and end as HH:MM
  if (!acts.length) return null;
  const m = t => { const x = /^(\d{1,2}):(\d{2})/.exec(t || ''); return x ? +x[1] * 60 + +x[2] : null; }, hm = v => { const r = Math.round(v); return `${pad(Math.floor(r / 60) % 24)}:${pad(r % 60)}`; };
  const st = acts.map(a => m(a.t)).filter(v => v != null), en = acts.filter(a => m(a.t) != null).map(a => m(a.t) + (a.min || 0)), strs = acts.map(a => a.str).filter(v => v != null);
  return { str: strs.length ? Math.max(...strs) : null, from: st.length ? hm(Math.min(...st)) : null, to: en.length ? hm(Math.max(...en)) : null };
}
function sessDur(w) { const m = whoopLiftMin(w.date); return m != null ? m * 60 : w.durMin ? w.durMin * 60 : (w.dur || null); } // seconds; WHOOP first, then minutes entered by hand, then old timer logs

/* ============================================================
   VOLUME — direct working sets per muscle group
   ============================================================ */
function planWeekly(prog) { // sets per week if one session is trained every day
  const o = prog.order.filter(id => prog.sessions[id]); const out = {}; if (!o.length) return out;
  for (const id of o) for (const it of prog.sessions[id].items) { const d = exDef(it.ex), g = d.g; out[g] = (out[g] || 0) + defSets(it.ex); // same rule as Volume (v1.36): secondaries at half a set
    for (const g2 of d.g2 || SECONDARY[it.ex] || []) if (g2 !== g) out[g2] = (out[g2] || 0) + defSets(it.ex) / 2; }
  for (const g in out) out[g] = out[g] * 7 / o.length;
  return out;
}
/* Muscles a compound also trains hard, counted at half a set each: the "fractional" count that predicted growth best in
   Pelland et al. (2024). Library lifts only; an exercise can carry its own list as exDef().g2. */
const SECONDARY = { incline_db: ['triceps', 'delt_f'], chest_press: ['triceps', 'delt_f'], cable_fly: ['delt_f'], tbar: ['biceps', 'delt_r'], pulldown: ['biceps'], seated_row: ['biceps', 'delt_r'], shoulder_press: ['triceps'] };
function doneByGroupDetail(from, to) { // what makes up doneByGroup: per muscle, each exercise's sets and the credit they give
  const out = {};
  for (const w of Object.values(STATE.w)) if (w.date >= from && w.date <= to) for (const e of w.ex || []) {
    const n = doneSets(e).length; if (!n) continue; const d = exDef(e.id);
    const add = (g, k, sec) => { const a = out[g] = out[g] || {}, key = e.id + (sec ? ':2' : ''); const r = a[key] = a[key] || { id: e.id, sets: 0, credit: 0, sec }; r.sets += n; r.credit += n * k; };
    add(d.g, 1, false);
    for (const g of d.g2 || SECONDARY[e.id] || []) if (g !== d.g) add(g, 0.5, true);
  }
  for (const g in out) out[g] = Object.values(out[g]).sort((a, b) => b.credit - a.credit || a.sec - b.sec);
  return out;
}
function doneByGroup(from, to, frac = true) {
  const out = {};
  for (const w of Object.values(STATE.w)) if (w.date >= from && w.date <= to) for (const e of w.ex || []) {
    const n = doneSets(e).length; if (!n) continue; const d = exDef(e.id);
    out[d.g] = (out[d.g] || 0) + n;
    if (frac) for (const g of d.g2 || SECONDARY[e.id] || []) if (g !== d.g) out[g] = (out[g] || 0) + n / 2;
  }
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
   weight), modelled on MacroFactor and checked against Louis's MacroFactor export (Feb to Oct 2026, run on intake and
   scale weight alone). MacroFactor's own numbers always win and reseed the model.
   - Trend weight: MacroFactor's own method, reproduced from its export (exact to 0.01 kg): scale weights linearly
     interpolated across the days between weigh-ins, then a 10%/day moving average. Shown up to 7 days past the last weigh-in.
   - Expenditure: a Kalman filter tracking weight and expenditure together, stepped daily. Weight moves by (intake -
     expenditure) / energy density and is corrected by the trend weight; expenditure is a slow random walk.
   - Energy density: Hall (2008), with Forbes' partition: p = 10.4 / (10.4 + fat kg) of a change is lean (1,816 kcal/kg),
     the rest fat (9,441 kcal/kg). Fat mass starts at XP.bf of body weight and moves with the partition.
   - Pausing (v1.35, read off the export: it matches every one of the 31 days MacroFactor's expenditure stood still):
     the update into day d pauses when more than 3 of days d-6..d-2 have no usable intake. Yesterday and today never
     count as missing, so a gap pauses updates from its 6th day and they resume as soon as logging covers that window.
   - Partly logged days: MacroFactor counts a low day as complete unless you confirm its prompt, and the confirmed ones
     count as missing. Orbit flags days under 70% of the mean of the 6 days before (`partialFlags`); S().partial[date]
     holds his answer (true = partly logged), and an unanswered day under half counts as partly logged.
   - A blank or partly logged day's intake is estimated as the mean of usable days in the 7 before (MacroFactor V3
     estimates unlogged intake too), with a wide error.
   Against the export with his MacroFactor answers: 19 kcal/day mean error (18 to 22 on a held-out half; only the
   intake estimate's weighting was fitted). Unanswered, with the under-half rule: 33. Steps were tried as a slow nudge
   (shifting expenditure, or speeding updates while the step trend moves); neither helped, so they stay out. */
const XP = { a: 0.1, gap: 30, r: 0.03, qE: 56, qW: 1e-4, sLog: 0.1, sMiss: 0.35, part: 0.5, flag: 0.7, pause: 3, impN: 7, e0: 32, pE0: 3500, bf: 0.16 };
const HALL = { C: 10.4, lean: 1816, fat: 9441 };
const weekPct = (D, d) => { // a day's intake as a share of the mean of the logged days in the 6 before
  const v = D[d]?.kcal; if (!(v > 0)) return null;
  const o = []; for (let i = 1; i < 7; i++) { const x = D[addDays(d, -i)]?.kcal; if (x > 0) o.push(x); }
  return o.length ? v / mean(o) : null;
};
function xpRun(D, t0, P = XP, marks = {}) {
  const tw = {}, exp = {}, kc = d => D[d]?.kcal > 0 ? D[d].kcal : null;
  const ds = Object.keys(D).filter(d => d <= t0 && (D[d].wt != null || D[d].tw != null || D[d].kcal != null)).sort();
  if (!ds.length) return { tw, exp };
  const wts = ds.filter(d => D[d].wt != null);
  // trend weight, with the filter's observation for each day (weigh-in days, and days inside gaps of up to P.gap days)
  const T = {}, obs = {}; let t = null, wi = 0, lastW = null;
  for (let d = ds[0]; d <= t0; d = addDays(d, 1)) {
    while (wi < wts.length && wts[wi] < d) wi++;
    const nx = wts[wi], pv = wi > 0 ? wts[wi - 1] : null, x = D[d] || {};
    let iw = null, g = 0;
    if (nx === d) iw = x.wt; else if (pv && nx) { g = diffDays(pv, nx); iw = D[pv].wt + (D[nx].wt - D[pv].wt) * diffDays(pv, d) / g; }
    if (x.tw != null) t = x.tw; else if (iw != null) t = t == null ? iw : t + P.a * (iw - t);
    if (x.wt != null || x.tw != null) lastW = d;
    if (t == null) continue;
    T[d] = t; if (x.tw != null || nx === d || (iw != null && g <= P.gap)) obs[d] = t;
    if (x.tw == null && diffDays(lastW, d) <= 7) tw[d] = Math.round(t * 100) / 100;
  }
  // usable intake: logged, and not partly logged (his answer, else under P.part of the days before)
  const use = {}, usable = d => {
    if (d in use) return use[d];
    const v = kc(d); if (v == null) return use[d] = null;
    if (marks[d] != null) return use[d] = marks[d] ? null : v;
    const pct = weekPct(D, d); return use[d] = pct != null && pct < P.part ? null : v;
  };
  const pz = {}, pausedAt = d => { // the update into day d pauses when more than P.pause of days d-6..d-2 have no usable intake
    if (d in pz) return pz[d];
    let miss = 0; for (let i = 2; i <= 6; i++) if (usable(addDays(d, -i)) == null) miss++;
    return pz[d] = miss > P.pause;
  };
  // the filter: state [W kg, E kcal/day], covariance [[pw, pc], [pc, pe]]
  let W = null, E = null, F = null, pw = 0, pc = 0, pe = 0, lastD = null;
  for (let d = ds[0]; d <= t0; d = addDays(d, 1)) {
    const x = D[d] || {}, paused = pausedAt(d), pausedN = pausedAt(addDays(d, 1));
    if (W == null) { if (T[d] == null) continue; W = T[d]; E = x.exp ?? P.e0 * W; F = P.bf * W; pw = P.r; pe = P.pE0; }
    if (obs[d] != null) { // correct with the trend weight; a paused filter corrects weight only
      const s = pw + P.r, kw = pw / s, ke = paused ? 0 : pc / s, y = obs[d] - W;
      W += kw * y; E += ke * y;
      pe = pe - 2 * ke * pc + ke * ke * s; pc = paused ? 0 : (1 - kw) * pc; pw = (1 - kw) * pw; // Joseph form, so a zeroed gain stays valid
    }
    if (x.exp != null) { E = x.exp; if (T[d] != null) W = T[d]; } // MacroFactor's numbers reseed the state
    if (x.wt != null || x.tw != null || kc(d) != null) lastD = d;
    if (x.exp == null && diffDays(lastD, d) <= 7) exp[d] = Math.round(E);
    // step to tomorrow on today's intake; a blank or partly logged day is estimated from the usable days in the 7 before
    let I = usable(d); const vI = I != null ? (P.sLog * I) ** 2 : (P.sMiss * E) ** 2;
    if (I == null) { const h = []; for (let i = 1; i <= P.impN; i++) { const v = usable(addDays(d, -i)); if (v != null) h.push(v); } I = h.length ? mean(h) : E; }
    const p = HALL.C / (HALL.C + Math.max(F, 1)), rho = p * HALL.lean + (1 - p) * HALL.fat, dW = (I - E) / rho, a = -1 / rho;
    W += dW; F += (1 - p) * dW;
    const npw = pw + 2 * a * pc + a * a * pe + vI / rho / rho + P.qW, npc = pc + a * pe;
    pw = npw; pc = pausedN ? 0 : npc; pe += pausedN ? 0 : P.qE;
  }
  return { tw, exp };
}
/* Days that may be partly logged, newest first: under XP.flag of the days before, with his answer if he gave one and
   whether the model treats it as partly logged right now. Today is left out (it's still being logged). */
function partialFlags(days = 21) {
  const out = [], t = today(), m = S().partial || {};
  for (let i = 1; i <= days; i++) {
    const d = addDays(t, -i), pct = weekPct(STATE.d, d); if (pct == null || pct >= XP.flag) continue;
    out.push({ d, kcal: STATE.d[d].kcal, pct, ans: m[d] ?? null, part: m[d] ?? pct < XP.part });
  }
  return out;
}
let DER = { key: null };
function derived() {
  const key = STATE.v + ':' + Object.keys(STATE.d).length + ':' + today(); if (DER.key === key) return DER; // today: a new day extends the trend
  return DER = { key, ...xpRun(STATE.d, today(), XP, S().partial || {}) };
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
