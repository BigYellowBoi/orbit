// Engine checks: node test/engine.mjs
// Loads src/core.js + src/engine.js in a sandbox with a settable clock. Covers the rotation, the Aim
// (follow-the-Aim: maintenance stays flat, overload climbs at each rate), the maintenance badge, PRs,
// bodyweight scoring, the date-rollover caches, and (with OLD_ENGINE=path) parity with an older engine.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
const EXPOSE = `globalThis.E = { STATE, S, today, addDays, diffDays, sessionFor, upcoming, lastFor, bestBefore, bestSet, records, hasHistory, hasRef,
  liftSeries, maintenance, strengthRef, suggest, setAim, cutCheck, progression, prsIn, setScore, e1rm, exRir, exStep, derived, xpRun: typeof xpRun !== "undefined" ? xpRun : null, XP: typeof XP !== "undefined" ? XP : null, partialFlags: typeof partialFlags !== "undefined" ? partialFlags : null, warmup: typeof warmup !== "undefined" ? warmup : null, rowAim: typeof rowAim !== "undefined" ? rowAim : null, doneSets, planWeekly, wStats, fmtSet, dayVal, scoreTxt, newWorkout, restRecord, sessDef, exDef, ordModel: typeof ordModel !== "undefined" ? ordModel : null, ordFactor: typeof ordFactor !== "undefined" ? ordFactor : null, overlap: typeof overlap !== "undefined" ? overlap : null, ctxLog: typeof ctxLog !== "undefined" ? ctxLog : null, usualCtx: typeof usualCtx !== "undefined" ? usualCtx : null, aimIn: typeof aimIn !== "undefined" ? aimIn : null, refScore, exRir, snapBase: typeof snapBase !== "undefined" ? snapBase : null, baseCtx: typeof baseCtx !== "undefined" ? baseCtx : null, moveEx: typeof moveEx !== "undefined" ? moveEx : null, movedIdx: typeof movedIdx !== "undefined" ? movedIdx : null,
  bump: () => { STATE.v++; } };`;

function load(engine = engineSrc) {
  let now = Date.UTC(2026, 9, 13, 2); // Brisbane-ish morning, as a fixed instant
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const ctx = vm.createContext({ console, Date: FakeDate, Intl, document: undefined });
  vm.runInContext(core + '\n' + engine + '\n' + EXPOSE, ctx, { timeout: 20000 });
  ctx.E.setNow = t => { now = t; };
  return ctx.E;
}

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

/* ---------- rotation ---------- */
{
  const E = load(), t = E.today();
  ok(E.sessionFor(t) === 'push1', 'empty log starts at Push 1');
  E.STATE.w[E.addDays(t, -2)] = { ...E.newWorkout(E.addDays(t, -2), 'push1') };
  ok(E.sessionFor(t) === 'pull', 'next after Push 1 is Pull, a missed day waits');
  E.STATE.w[E.addDays(t, -1)] = E.restRecord(E.addDays(t, -1));
  ok(E.sessionFor(t) === 'pull', 'a rest day does not advance the rotation');
  ok(E.upcoming(5).map(x => x.s).join() === 'pull,push2,legs,push1,pull', 'upcoming cycles the rotation');
  E.S().restPlan = [E.addDays(t, 2)];
  ok(E.upcoming(5).map(x => x.s).join() === 'pull,push2,_rest,legs,push1', 'a planned rest day pushes the rotation back a day');
  E.S().restPlan = [t];
  ok(E.upcoming(3).map(x => x.s).join() === '_rest,pull,push2' && E.upcoming(1)[0].planned, 'planned rest today: today is rest, Pull waits');
  ok(E.sessionFor(t) === 'pull', 'planning rest does not change what is next when you do train');
  // a planned rest that lands on a rotation rest slot just fills it
  E.S().prog.sessions.r1 = { name: 'Rest', items: [], rest: true }; E.S().prog.order = ['push1', 'pull', 'r1', 'push2', 'legs'];
  E.S().restPlan = [E.addDays(t, 1)];
  ok(E.upcoming(5).map(x => x.s).join() === 'pull,r1,push2,legs,push1', 'planned rest on a rest slot uses the slot, no extra shift');
  E.S().restPlan = [E.addDays(t, 2)];
  ok(E.upcoming(5).map(x => x.s).join() === 'pull,r1,_rest,push2,legs', 'planned rest after a rest slot adds a day');
  E.STATE.w[t] = E.restRecord(t); E.S().restPlan = [t];
  ok(E.upcoming(2)[0].done && E.upcoming(2)[0].planned === false, 'a logged day wins over the plan');
}

/* ---------- follow the Aim ---------- */
function follow(goal, rate, weeks = 26, exId = 'shoulder_press') {
  const E = load(), t0 = E.today();
  Object.assign(E.S(), { goal, progRate: rate, growFrom: goal === 'grow' ? t0 : null });
  const start = E.strengthRef(exId, t0).v; let last = null;
  for (let d = 0; d <= weeks * 7; d += 4) {
    const date = E.addDays(t0, d); E.setNow(Date.UTC(...date.split('-').map((x, i) => i === 1 ? x - 1 : +x), 2));
    const a = E.suggest(exId, date); if (!a) return { fail: true };
    E.STATE.w[date] = { date, s: 'push2', ex: [{ id: exId, sets: [0, 1].map(j => { const x = E.setAim(exId, date, j); return { w: x.w, r: x.r, done: true }; }) }] }; // set 2 one step lighter, as the Aim now says
    E.bump(); last = { date, a };
  }
  return { E, start, end: E.strengthRef(exId, E.addDays(last.date, 1)).v, last, days: diffDays(t0, last.date) };
  function diffDays(a, b) { return E.diffDays(a, b); }
}
{
  const h = follow('hold', 0.005);
  near(h.end / h.start, 1, 0.025, 'maintenance: strength stays flat over 26 weeks of following the Aim');
  for (const rate of [0.0025, 0.005, 0.01]) {
    const g = follow('grow', rate), want = (1 + rate) ** (g.days / 7);
    near(g.end / g.start, want, 0.035, `overload ${rate * 100}%/wk: strength climbs on plan`);
    ok(g.end > g.start * (1 + rate * 10), `overload ${rate * 100}%/wk: clearly above start after 26 weeks`);
  }
  const g = follow('grow', 0.005, 26, 'lat_raise'); // 2 kg dumbbell steps
  ok(g.end > g.start * 1.05, 'overload on 2 kg dumbbell steps still climbs');
}

/* ---------- later sets one step lighter ---------- */
{
  const E = load(), t = E.today(), a0 = E.setAim('incline_db', t, 0), a1 = E.setAim('incline_db', t, 1);
  ok(a1.back && Math.abs(a0.w - a1.w - 2) < 1e-9 && a1.r === a0.r, `set 2 one dumbbell step (2 kg) lighter, same reps: ${a0.w}×${a0.r} then ${a1.w}×${a1.r}`);
  const p0 = E.setAim('hack', t, 0), p1 = E.setAim('hack', t, 1); ok(Math.abs(p0.w - p1.w - 0.25) < 1e-9, 'plates: a quarter plate (5 kg a side) lighter');
  ok(E.setAim('ab_roller', t, 1).w === E.setAim('ab_roller', t, 0).w, 'reps-only bodyweight lift: no load to drop');
  ok(E.S().prog.sessions.push1.items.every(it => it.sets === 2), 'new programmes default to 2 sets');
}

/* ---------- maintenance badge: one standout day doesn't decide it ---------- */
{
  const E = load(), t = E.today(), id = 'pulldown';
  const add = (ago, w, r) => { const d = E.addDays(t, -ago); E.STATE.w[d] = { date: d, s: 'pull', ex: [{ id, sets: [{ w, r, done: true }] }] }; };
  for (let ago = 85; ago > 28; ago -= 5) add(ago, 90, 8);
  add(50, 105, 8); // one very good day in the older window
  for (let ago = 26; ago >= 2; ago -= 5) add(ago, 90, 8);
  E.bump();
  ok(E.maintenance(id).state === 'hold', `steady lifting with one standout old day reads Holding (got ${E.maintenance(id).state})`);
  add(1, 80, 8); add(3, 80, 8); add(6, 80, 8); add(9, 80, 8); E.bump();
  ok(['dip', 'down'].includes(E.maintenance(id).state), 'a real drop still shows');
}

/* ---------- PRs ---------- */
{
  const E = load(), t = E.today(), id = 'rdl'; // stated max 150×6
  const d1 = E.addDays(t, -3), d2 = E.addDays(t, -1);
  E.STATE.w[d1] = { date: d1, s: 'legs', ex: [{ id, sets: [{ w: 150, r: 6, done: true }, { w: 152.5, r: 6, done: true }] }] };
  E.STATE.w[d2] = { date: d2, s: 'legs', ex: [{ id, sets: [{ w: 147.5, r: 7, done: true }, { w: 140, r: 8, done: true }] }] };
  E.bump();
  ok(E.prsIn(E.STATE.w[d1]).length === 1 && E.prsIn(E.STATE.w[d1])[0].s.w === 152.5, 'PR: beats the stated max, ties do not count');
  ok(E.prsIn(E.STATE.w[d2]).length === 0, 'PR: 147.5×7 does not beat 152.5×6 (e1RM)');
  ok(E.records(id).best.date === d1 && E.records(id).heavy.s.w === 152.5, 'records: best and heaviest');
  ok(E.lastFor(id, t).date === d2 && E.lastFor(id, d2).date === d1 && !E.lastFor(id, d1), 'lastFor walks back by date');
  ok(E.bestSet(id, d1).w === 150 && E.bestSet(id).w === 152.5, 'bestSet: stated max, then logged');
}

/* ---------- bodyweight lifts ---------- */
{
  const E = load(), t = E.today();
  // ab roller: no body weight share, reps as before even with weight on record
  for (let i = 0; i < 30; i++) E.STATE.d[E.addDays(t, -i)] = { wt: 85, tw: 85 };
  const d = E.addDays(t, -2); E.STATE.w[d] = { date: d, s: 'push1', ex: [{ id: 'ab_roller', sets: [{ w: 0, r: 11, done: true }] }] }; E.bump();
  ok(E.setScore('ab_roller', { w: 0, r: 11 }, d) === 11, 'ab roller scores by reps');
  ok(E.scoreTxt('ab_roller', 11) === '11 reps', 'ab roller shows reps');
  const a = E.suggest('ab_roller', t); ok(a && a.w === 0 && a.r > 0, 'ab roller Aim still works');
  // pull-ups with body weight counted
  E.S().ex.pullup = { name: 'Pull-up', g: 'back', u: 'bw', rest: 150, lo: 6, hi: 10, base: null, bwf: 1 }; E.bump();
  const s = E.setScore('pullup', { w: 10, r: 8 }, d); near(s, 95 * (1 + 8 / 30), 1e-9, 'pull-up scores (body weight + added) e1RM');
  ok(E.scoreTxt('pullup', s).endsWith('kg'), 'pull-up shows kg');
  // losing weight at the same reps shows as a lower score, gaining strength at a lighter weight still counts
  E.STATE.d[E.addDays(t, -40)] = { tw: 90 }; E.bump();
  ok(E.setScore('pullup', { w: 0, r: 8 }, E.addDays(t, -40)) > E.setScore('pullup', { w: 0, r: 8 }, d), 'body weight is taken at the set\'s date');
  // follow the Aim on pull-ups: maintenance holds, added load stays sane
  const p = (() => { E.S().goal = 'hold'; for (let i = 0; i < 3; i++) { const dd = E.addDays(t, -30 + i * 4); E.STATE.w[dd] = { date: dd, s: 'pull', ex: [{ id: 'pullup', sets: [{ w: 5, r: 8, done: true }] }] }; } E.bump(); return E.suggest('pullup', t); })();
  ok(p && p.w >= 0 && p.r >= 6 && p.r <= 12, `pull-up Aim is in range: +${p?.w} × ${p?.r}`);
  // no weight on record: falls back to reps
  const F = load(); F.S().ex.pullup = { name: 'Pull-up', g: 'back', u: 'bw', rest: 150, lo: 6, hi: 10, base: null, bwf: 1 }; F.bump();
  ok(F.setScore('pullup', { w: 0, r: 8 }, t) === 8 && F.scoreTxt('pullup', 8) === '8 reps', 'no weight on record: reps scoring');
}

/* ---------- Aims stay inside the rep range (v1.36: light cables with coarse steps asked for 14 reps on 8-12) ---------- */
{
  for (const goal of ['hold', 'grow']) {
    const E = load(), t = E.today(); Object.assign(E.S(), { goal, progRate: 0.01, growFrom: goal === 'grow' ? E.addDays(t, -60) : null });
    E.S().ex.y_raise = { name: 'Cable Y raises', g: 'delt_s', u: 'kg', rest: 60, lo: 8, hi: 12, base: { w: 6.25, r: 8 }, inc: 1.25 }; E.bump();
    const bad = Object.keys(E.S().ex).map(id => [id, E.suggest(id, t), E.S().ex[id]]).filter(([, s, x]) => s && (s.r > x.hi));
    ok(!bad.length, `${goal}: no Aim above its rep range${bad.length ? ' (' + bad.map(([id, s]) => id + ' ' + s.w + 'x' + s.r).join(', ') + ')' : ''}`);
  }
}

/* ---------- set types and warm-ups (v1.36) ---------- */
{
  const E = load(), t = E.today(), id = 'incline_db';
  const w = E.warmup(id, 44, 2); ok(w.length === 2 && w[0].w < w[1].w && w[1].w < 44 && w[0].r > w[1].r, `2 warm-ups climb under 44 kg: ${w.map(x => x.w + 'x' + x.r).join(', ')}`);
  ok(E.warmup(id, 44, 3).length === 3 && E.warmup(id, 0, 2).length === 0, 'three warm-ups; none without a working weight');
  const e = { id, sets: [{ t: 'w', w: 20, r: 8, done: true }, { w: 44, r: 7, done: true }, { t: 'd', w: 36, r: 9, done: true }] };
  ok(E.doneSets(e).length === 2 && E.doneSets(e).every(s => s.t !== 'w'), 'warm-ups left out of working sets, drop sets kept');
  const sg = E.suggest(id, t), a1 = E.rowAim(e, 1, t, sg), a0 = E.rowAim(e, 0, t, sg);
  ok(a1.w === sg.w && a1.r === sg.r && a0.warm && a0.w < sg.w, 'the first working set after a warm-up gets the top Aim; the warm-up gets the ladder');
  E.STATE.w[t] = { date: t, s: 'push1', ex: [e] }; E.bump();
  ok(E.wStats(E.STATE.w[t]).sets === 2, 'session stats count working sets only');
  ok(E.fmtSet(id, { w: 44, r: 7 }) === '44 kg × 7', 'sets read "44 kg × 7"');
  const pw = E.planWeekly(E.S().prog); ok(pw.triceps > 0 && pw.delt_f > 0, `plan's weekly sets give compounds' secondary muscles half credit (front delts ${pw.delt_f.toFixed(1)})`);
}

/* ---------- caches notice the day turning over ---------- */
{
  const E = load(), t = E.today();
  E.STATE.d[E.addDays(t, -1)] = { wt: 80 }; E.bump();
  ok(E.dayVal(t, 'tw') === 80, 'trend weight carries to today');
  E.setNow(Date.now() + 864e5); const t2 = E.today();
  ok(t2 !== t && E.dayVal(t2, 'tw') === 80, 'after midnight, with no data change, the trend still reaches the new day');
  const id = 'rdl', d = E.addDays(t, -1); E.STATE.w[d] = { date: d, s: 'legs', ex: [{ id, sets: [{ w: 100, r: 5, done: true }] }] }; E.bump();
  ok(E.maintenance(id).state === 'new', 'lift index sees new data after a save');
}

/* ---------- trend weight and expenditure (xpRun) ---------- */
{
  const E = load(), t = E.today(), A = n => E.addDays(t, n);
  // trend: MacroFactor's interpolate-then-10% average, reseeded by MacroFactor's own trend
  let D = { [A(-20)]: { wt: 100 }, [A(-10)]: { wt: 98 } }, o = E.xpRun(D, t);
  let m = 100; for (let i = 1; i <= 10; i++) m += 0.1 * (100 - 0.2 * i - m);
  near(o.tw[A(-10)], Math.round(m * 100) / 100, 1e-9, 'trend interpolates between weigh-ins, then averages 10%/day');
  ok(o.tw[A(-3)] === o.tw[A(-10)] && o.tw[A(-2)] == null, 'trend holds after the last weigh-in, for 7 days');
  D = { [A(-20)]: { wt: 100 }, [A(-15)]: { tw: 99 }, [A(-10)]: { wt: 98 } }; o = E.xpRun(D, t);
  ok(o.tw[A(-15)] == null && o.tw[A(-14)] === 98.98, 'MacroFactor trend wins and reseeds'); // 99 + 10% of (98.8 - 99)
  // expenditure: simulated person, true 3000 kcal/day, eating 2500, noisy scale; the estimate settles near the truth
  const sim = (days, eat, burn, opts = {}) => {
    const D = {}; let W = 90, F = 0.16 * 90;
    for (let i = -days; i <= 0; i++) {
      const d = A(i), noise = Math.sin(i * 1.7) * 0.6;
      D[d] = { wt: Math.round((W + noise) * 10) / 10 };
      if (!(opts.blank || []).includes(i)) D[d].kcal = (opts.kcal || {})[i] ?? eat;
      const p = 10.4 / (10.4 + F), rho = p * 1816 + (1 - p) * 9441, dW = (eat - burn) / rho; W += dW; F += (1 - p) * dW;
    }
    return D;
  };
  o = E.xpRun(sim(180, 2500, 3000), t);
  near(o.exp[t], 3000, 80, 'expenditure settles near the truth (500 kcal/day deficit, noisy weigh-ins)');
  o = E.xpRun(sim(180, 3300, 3000), t);
  near(o.exp[t], 3000, 80, 'and in a surplus');
  // missing-data rules (MacroFactor's, read off its export): the update into day d pauses when more than 3 of d-6..d-2 are blank
  const blank = [-10, -9, -8, -7, -6];
  o = E.xpRun(sim(30, 2500, 3400, { blank }), t); // a short run, so the estimate is still moving
  const ex = i => o.exp[A(i)];
  ok(ex(-6) === ex(-5) && ex(-5) === ex(-4) && ex(-4) === ex(-3) && ex(-2) !== ex(-3) && ex(-9) !== ex(-10), `updates keep going for a gap's first 5 days, pause from the 6th, resume once d-6..d-2 is covered (${[-11, -10, -9, -8, -7, -6, -5, -4, -3, -2].map(ex).join(' ')})`);
  const a = E.xpRun(sim(120, 2500, 3000, { kcal: { [-20]: 900 } }), t), b = E.xpRun(sim(120, 2500, 3000, { blank: [-20] }), t);
  ok(a.exp[t] === b.exp[t], 'an unanswered day under half the days before counts as partly logged (like a blank day)');
  const c = E.xpRun(sim(120, 2500, 3000, { kcal: { [-20]: 1400 } }), t);
  ok(c.exp[t] !== b.exp[t], 'a low day above half still counts');
  ok(E.xpRun(sim(120, 2500, 3000, { kcal: { [-20]: 900 } }), t, E.XP, { [A(-20)]: false }).exp[t] !== b.exp[t], 'answered Complete: the low day counts');
  ok(E.xpRun(sim(120, 2500, 3000, { kcal: { [-20]: 1400 } }), t, E.XP, { [A(-20)]: true }).exp[t] === b.exp[t], 'answered Partly: the day counts as blank');
  E.STATE.d = sim(30, 2500, 3000, { kcal: { [-3]: 1500, [-5]: 1000 } }); E.S().partial = { [A(-5)]: false }; E.bump();
  const pf = E.partialFlags();
  ok(pf.length === 2 && pf[0].d === A(-3) && !pf[0].part && pf[0].ans == null && pf[1].ans === false && !pf[1].part, `flags days under 70%, newest first, with answers (${pf.map(x => x.d.slice(5) + ':' + Math.round(x.pct * 100)).join(', ')})`);
  E.S().partial = {};
  // MacroFactor's numbers win and the model carries on from them
  D = sim(120, 2500, 3000); for (let i = -120; i <= -30; i++) D[A(i)].exp = 2900;
  E.STATE.d = D; E.bump();
  ok(E.dayVal(A(-30), 'exp') === 2900 && Math.abs(E.dayVal(A(-29), 'exp') - 2900) < 30, 'MacroFactor expenditure wins, and the model carries on from it');
}

/* ---------- parity with an older engine (everything but the maintenance badge) ---------- */
if (process.env.OLD_ENGINE) {
  const oldSrc = fs.readFileSync(process.env.OLD_ENGINE, 'utf8');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = load(), O = load(oldSrc), t = N.today(), ids = Object.keys(N.S().ex).filter(id => N.S().ex[id].u !== 'bw');
  const data = {};
  for (let i = 0; i < 400; i++) {
    if (rnd() < 0.3) continue;
    const date = N.addDays(t, -i), pick = ids.filter(() => rnd() < 0.35);
    data[date] = { date, s: 'push1', ex: pick.map(id => ({ id, sets: [0, 1, 2].map(() => ({ w: Math.round((20 + rnd() * 100) / 2.5) * 2.5, r: 4 + Math.floor(rnd() * 10), done: rnd() < 0.9 })) })) };
    if (rnd() < 0.05 && pick.length) data[date].ex.push({ id: pick[0], sets: [{ w: 50, r: 10, done: true }] }); // same lift twice in a day
  }
  for (const E of [N, O]) { E.STATE.w = Object.fromEntries(Object.keys(data).sort().map(k => [k, JSON.parse(JSON.stringify(data[k]))])); Object.assign(E.S(), { goal: 'grow', growFrom: N.addDays(t, -60) }); E.bump(); } // logged in date order, as in real use
  const J = x => JSON.stringify(x);
  let diffs = 0;
  const dates = Object.keys(data).sort().filter((_, i) => i % 7 === 0).concat([t, '9999']);
  for (const id of ids) {
    for (const f of ['records', 'liftSeries']) if (J(N[f](id)) !== J(O[f](id))) { diffs++; if (diffs < 5) console.log('diff', f, id); }
    for (const d of dates) for (const f of ['lastFor', 'bestBefore', 'bestSet', 'hasHistory', 'strengthRef', 'suggest']) {
      if (J(N[f](id, d)) !== J(O[f](id, d))) { diffs++; if (diffs < 5) console.log('diff', f, id, d, J(N[f](id, d)), J(O[f](id, d))); }
    }
    if (J(N.progression(id, 8, 0.005)) !== J(O.progression(id, 8, 0.005))) { diffs++; console.log('diff progression', id); }
  }
  for (const d of Object.keys(data)) if (J(N.prsIn(data[d])) !== J(O.prsIn(data[d]))) { diffs++; if (diffs < 5) console.log('diff prsIn', d); }
  ok(diffs === 0, `parity with the old engine (${diffs} differences)`);
  // speed: the History screen asks for PRs on every session
  const go = E => { const s = performance.now(); for (const d of Object.keys(data)) E.prsIn(E.STATE.w[d]); for (const id of ids) E.maintenance(id); return performance.now() - s; };
  const tn = go(N), to = go(O);
  console.log(`History-style PR pass: new ${tn.toFixed(1)} ms, old ${to.toFixed(1)} ms`);
  ok(tn < to, 'new engine is faster');
}

/* ---------- exercise order inside a day's log (v1.39) ---------- */
{
  const E = load(); ok(!!E.moveEx && !!E.movedIdx, 'moveEx and movedIdx exist'); const t = E.today(), w = E.newWorkout(t, 'push1'), ids = w.ex.map(e => e.id), n = ids.length;
  w.ex[0].sets = [{ w: 20, r: 10, done: true, t: 'w' }, { w: 60, r: 8, done: true }, { w: 57.5, r: null, done: false }]; w.ex[0].note = 'seat 4';
  const first = w.ex[0], planBefore = JSON.stringify(E.S().prog);
  ok(E.moveEx(w, 0, n - 1) === true, 'moveEx reports a move');
  ok(w.ex.length === n && w.ex[n - 1] === first, 'first exercise moves to the end, same object');
  ok(first.sets.length === 3 && first.sets[0].t === 'w' && first.sets[1].done && first.note === 'seat 4', 'sets, warm-ups, ticks and note travel with it');
  ok(w.ex.map(e => e.id).join() === [...ids.slice(1), ids[0]].join(), 'the others keep their order');
  ok(JSON.stringify(E.S().prog) === planBefore, 'the Plan is untouched');
  E.moveEx(w, n - 1, 0); ok(w.ex.map(e => e.id).join() === ids.join(), 'moving back restores the order');
  ok(!E.moveEx(w, 1, 1) && !E.moveEx(w, -1, 0) && !E.moveEx(w, 0, n) && !E.moveEx({ ex: [] }, 0, 0) && !E.moveEx(null, 0, 1), 'no-op and out-of-range moves are refused');
  const perm = (from, to) => { const a = [...Array(5).keys()]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; };
  let good = true; for (let f = 0; f < 5; f++) for (let to = 0; to < 5; to++) { const a = perm(f, to); for (let i = 0; i < 5; i++) if (a[E.movedIdx(i, f, to)] !== i) good = false; }
  ok(good, 'movedIdx follows every index through every move');
  ok(E.movedIdx(null, 0, 2) === null && E.movedIdx(undefined, 0, 2) === undefined, 'movedIdx leaves an empty pick alone');
}

/* ---------- exercise order: learned fatigue from the sets before a lift (v1.43) ---------- */
{
  const E = load(); ok(!!E.ordModel, 'order model exists');
  const t = E.today(), ws = E.addDays, plan = E.sessDef('pull');
  // his Pull with spider curls second, after preacher curls (the Plan order is the usual order)
  plan.items = [{ ex: 'preacher', sets: 2 }, { ex: 'spider', sets: 2 }, { ex: 'pulldown', sets: 2 }, { ex: 'seated_row', sets: 2 }];
  ok(E.overlap('preacher', 'spider') === 1 && E.overlap('pulldown', 'spider') === 0.5 && E.overlap('chest_press', 'spider') === 0, 'overlap: same muscle 1, a lift that also works it 0.5, unrelated 0');
  const pc = E.usualCtx('spider', 'pull'); ok(pc.L === 2 && pc.G === 2, 'usual slot for spider curls: 2 biceps sets before it');
  // ctx in a live log: an earlier exercise not reached yet counts its planned sets; once moved past, what was done
  const w0 = { date: t, s: 'pull', ex: [{ id: 'pulldown', sets: [{}, {}, {}].map(() => ({ w: null, r: null, done: false })) }, { id: 'spider', sets: [{ w: null, r: null, done: false }] }] };
  ok(E.ctxLog(w0, 1).G === 3 && E.ctxLog(w0, 1).L === 1.5, 'not reached yet: planned sets count');
  w0.ex[0].sets[0] = { w: 50, r: 10, done: true }; w0.ex[1].sets[0] = { w: 15, r: 10, done: true };
  ok(E.ctxLog(w0, 1).G === 1, 'moved past it: only the sets done count');
  ok(E.ctxLog({ ex: [{ id: 'spider', sets: [{ w: 1, r: 1, done: true }] }] }, 0).G === 0, 'first exercise is fresh');

  // regular order only: the model cancels out and the Aim is the old median-of-3 rule
  const top = (w, r) => [{ w, r, done: true }, { w: w - 2, r, done: true }];
  const log = (d, ids, spider, extra = {}) => { E.STATE.w[d] = { date: d, s: 'pull', ex: ids.map(id => ({ id, sets: id === 'spider' ? top(spider, 10) : top({ preacher: 30, pulldown: 60, seated_row: 60 }[id], 10) })), ...extra }; };
  for (let i = 12; i >= 1; i--) log(ws(t, -7 * i), ['preacher', 'spider', 'pulldown', 'seated_row'], 18);
  E.bump();
  const M0 = E.ordModel(); ok(Math.abs(M0.by.spider.k - M0.kL) < 1e-9 || M0.by.spider.chg === 0, 'a lift that never moved keeps the pooled value');
  const sr = E.strengthRef('spider', t), old = E.refScore('spider', { w: 18, r: 10 }, E.exRir('spider'), null);
  near(sr.v, old, 1e-9, 'regular order: strength equals the plain median of the last 3');
  ok(sr.fresh > sr.v, 'fresh strength sits above the usual-slot strength');

  // spider curls used to be first at 20 kg; moved second after preacher curls and dropped to 18.4 kg (about 8%)
  E.STATE.w = {};
  for (let i = 14; i >= 6; i--) log(ws(t, -7 * i), ['spider', 'preacher', 'pulldown', 'seated_row'], 20);
  for (let i = 5; i >= 1; i--) log(ws(t, -7 * i), ['preacher', 'spider', 'pulldown', 'seated_row'], 18.4);
  E.bump(); const M = E.ordModel(), ks = M.by.spider;
  ok(ks.chg === 1 && ks.k > M.kL && ks.k > 0.025, `spider curls learn a bigger cost than the pooled value (${(ks.k * 100).toFixed(2)}% vs ${(M.kL * 100).toFixed(2)}%)`);
  ok(M.by.preacher.k < ks.k, 'preacher curls, which got no weaker when moved first, learn a smaller cost');
  const a2 = E.suggest('spider', t), a1 = E.suggest('spider', t, { L: 0, G: 0 });
  ok(a2.w <= 18.4 + 1e-9, `Aim in the usual (2nd) slot stays at what he lifts there: ${a2.w} kg × ${a2.r}`);
  const sc = s => E.refScore('spider', s, E.exRir('spider'), null);
  ok(sc(a1) > sc(a2) * 1.04, `done first again, the Aim goes up: ${a1.w} kg × ${a1.r} vs ${a2.w} kg × ${a2.r}`);
  const mt = E.maintenance('spider'); ok(mt.state === 'hold' || mt.state === 'up', `4 wk badge reads the move as order, not a strength drop (${mt.state}, ${mt.ch?.toFixed(1)}%)`);
  // a log where spider curls come later than usual today gets a lighter Aim than the usual slot
  const wt = { date: t, s: 'pull', ex: ['preacher', 'pulldown', 'seated_row', 'spider'].map(id => ({ id, sets: [{ w: null, r: null, done: false }, { w: null, r: null, done: false }] })) };
  ok(sc(E.aimIn(wt, 3)) < sc(a2), 'later than usual today: lighter Aim');
  // today's sets don't teach the model (no Aim drifting mid-session)
  const before = E.ordModel().by.spider.k; E.STATE.w[t] = { date: t, s: 'pull', ex: [{ id: 'preacher', sets: top(30, 10) }, { id: 'pulldown', sets: top(60, 10) }, { id: 'spider', sets: top(10, 10) }] }; E.bump();
  ok(Math.abs(E.ordModel().by.spider.k - before) < 1e-12, "today's sets don't move the model"); delete E.STATE.w[t]; E.bump();
  // one-off bad day: rejected once the filter has a few sessions
  E.STATE.w[ws(t, -3)] = { date: ws(t, -3), s: 'pull', ex: [{ id: 'preacher', sets: top(30, 10) }, { id: 'spider', sets: top(9, 6) }] }; E.bump();
  ok(Math.abs(E.ordModel().by.spider.k - ks.k) < 0.01, 'a one-off terrible session barely moves what it learned');
  delete E.STATE.w[ws(t, -3)];

  // stated max set when done first: no history, max 20 × 8; usual slot is second
  E.STATE.w = {}; E.bump(); const x = E.exDef('spider'); x.base = { w: 20, r: 8 };
  delete x.bpos; E.bump(); const sUsual = E.suggest('spider', t);
  x.bpos = 1; E.bump(); const sFresh = E.suggest('spider', t);
  ok(sc(sFresh) < sc(sUsual), `max marked as set first: the Aim in the 2nd slot is lighter (${sFresh.w} × ${sFresh.r} vs ${sUsual.w} × ${sUsual.r})`);
  x.bpos = 2; E.bump(); ok(JSON.stringify(E.suggest('spider', t)) === JSON.stringify(sUsual), 'max set in the slot it is done in now: no change');
}

/* ---------- the Plan order is not absolute: reordering it, and lifts shared across splits (v1.44) ---------- */
{
  const E = load(), t = E.today(), ws = E.addDays, pull = E.sessDef('pull');
  pull.items = [{ ex: 'preacher', sets: 2 }, { ex: 'spider', sets: 2 }, { ex: 'pulldown', sets: 2 }, { ex: 'seated_row', sets: 2 }];
  const top = (w, r) => [{ w, r, done: true }, { w: w - 2, r, done: true }], W = { preacher: 30, pulldown: 60, seated_row: 60, tbar: 50, rear_fly: 10, hammer: 14 };
  const log = (d, s, ids, sp) => { E.STATE.w[d] = { date: d, s, ex: ids.map(id => ({ id, sets: top(id === 'spider' ? sp : W[id], 10) })) }; };
  for (let i = 14; i >= 6; i--) log(ws(t, -7 * i), 'pull', ['spider', 'preacher', 'pulldown', 'seated_row'], 20);
  for (let i = 5; i >= 1; i--) log(ws(t, -7 * i), 'pull', ['preacher', 'spider', 'pulldown', 'seated_row'], 18.4);
  const x = E.exDef('spider'); x.base = { w: 21, r: 8 }; x.bpos = 1; E.snapBase('spider'); E.bump();
  const at = c => JSON.stringify(E.suggest('spider', t, c)), c2 = { L: 2, G: 2 }, c0 = { L: 0, G: 0 };
  const before = { sr: E.strengthRef('spider', t, c2).fresh, a2: at(c2), a0: at(c0), M: E.ordModel().by.spider.k, base: JSON.stringify(E.baseCtx('spider')) };
  // reorder the Plan: spider curls go last
  pull.items = [{ ex: 'pulldown', sets: 2 }, { ex: 'seated_row', sets: 2 }, { ex: 'preacher', sets: 2 }, { ex: 'spider', sets: 2 }]; E.bump();
  ok(E.strengthRef('spider', t, c2).fresh === before.sr, 'Plan reorder: fresh strength unchanged (history keeps its own order)');
  ok(at(c2) === before.a2 && at(c0) === before.a0, 'Plan reorder: the Aim at any given slot is unchanged');
  ok(E.ordModel().by.spider.k === before.M, 'Plan reorder: nothing learned is lost');
  ok(JSON.stringify(E.baseCtx('spider')) === before.base, 'Plan reorder: a stated max keeps the slot it was set in');
  const u = E.usualCtx('spider', 'pull'); ok(u.G === 6 && u.L === 2 + 0.5 * 2 + 0.5 * 2, 'the new Plan slot becomes the usual one (6 sets before, preacher full, pulldown and rows half)');
  ok(JSON.parse(at(u)).w < JSON.parse(at(c2)).w || JSON.parse(at(u)).r < JSON.parse(at(c2)).r, 'and its preview Aim is lighter, since it now comes later');
  // a max with no slot given takes the Plan slot it has when entered, then keeps it
  const y = E.exDef('preacher'); y.base = { w: 32, r: 8 }; delete y.bpos; E.snapBase('preacher'); const yb = JSON.stringify(E.baseCtx('preacher'));
  pull.items.reverse(); E.bump(); ok(JSON.stringify(E.baseCtx('preacher')) === yb, 'a max entered without a slot is fixed to the Plan slot it had then');

  // across splits: spider curls also sit in Upper, 5th there; both feed one strength estimate
  E.S().prog.sessions.upper = { name: 'Upper', focus: '', items: ['tbar', 'pulldown', 'rear_fly', 'hammer', 'spider'].map(ex => ({ ex, sets: 2 })) }; E.S().prog.order.push('upper');
  for (let i = 4; i >= 1; i--) log(ws(t, -7 * i + 3), 'upper', ['tbar', 'pulldown', 'rear_fly', 'hammer', 'spider'], 16.4);
  E.bump(); const cu = E.usualCtx('spider', 'upper'), cp = E.usualCtx('spider', 'pull');
  ok(cu.G === 8 && cu.L === 0.5 * 2 + 0.5 * 2 + 1 * 2, `Upper slot: 8 sets before, hammer curls full, pulldown and rows half (L ${cu.L})`);
  const sc = s => E.refScore('spider', s, E.exRir('spider'), null);
  ok(Math.abs(E.strengthRef('spider', t, cu).fresh - E.strengthRef('spider', t, cp).fresh) < 1e-12, 'one fresh strength whichever session asks');
  ok(sc(E.suggest('spider', t, cu)) < sc(E.suggest('spider', t, cp)), 'its Aim in Upper (later, after hammer curls) is lighter than in Pull');
  const M = E.ordModel().by.spider; ok(M.n >= 18, `both splits' sessions teach it (${M.n} sessions)`);
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
