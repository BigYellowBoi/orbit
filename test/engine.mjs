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
  liftSeries, maintenance, strengthRef, suggest, progression, prsIn, setScore, e1rm, exRir, exStep, derived, dayVal, scoreTxt, newWorkout, restRecord,
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
    E.STATE.w[date] = { date, s: 'push2', ex: [{ id: exId, sets: [0, 1, 2].map(() => ({ w: a.w, r: a.r, done: true })) }] };
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

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
