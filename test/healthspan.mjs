// Healthspan checks (v1.72): node test/healthspan.mjs [brief dir] [backup.json]
// Without arguments: synthetic checks only. With the brief's folder (test_vectors_84wk.csv, seed_whoop_vo2_weekly.csv):
// the formula layer against every week's expected values (1e-4). With an Orbit backup as well: the pipeline layer
// (Orbit's own days through the windows vs the vectors' 6M inputs) and end to end (Pace vs WHOOP's, milestones).
// The vectors and backups are real data: pass them by path, never commit them.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['core.js', 'engine.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
function load(nowISO) {
  const now = Date.parse(nowISO), RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const ctx = vm.createContext({ console, Date: FakeDate, Intl, document: undefined });
  vm.runInContext(src + '\nglobalThis.E = { STATE, S, HS, HS_M, hsImpact, hsEval, hsWindow, hsDay, healthspan, hsFlags, addDays };', ctx, { timeout: 60000 });
  return ctx.E;
}
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const csv = f => { const [h, ...rows] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).map(l => l.split(',')); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const num = v => v === '' || v === 'nan' || v == null ? null : +v;

/* ---------- synthetic ---------- */
{
  const E = load('2026-06-10T02:00:00Z');
  ok(E.hsImpact('steps', 8113) === 0, 'at target the impact is 0');
  ok(Math.abs(E.hsImpact('rhr', 50) - (-0.1187 * 10.09)) < 1e-12 && E.hsImpact('rhr', 50) < 0 === false || E.hsImpact('rhr', 50) < 0, 'lower RHR is younger');
  ok(E.hsImpact('z13', 1e5) === -2.9 && E.hsImpact('strength', 1e4) === -1.6 && E.hsImpact('sleep_hours', 12) === -0.2, 'caps hold');
  ok(Math.abs(E.hsImpact('z45', 18.51 * Math.E) + 0.2466) < 1e-12, 'zones 4-5 are logarithmic');
  const flat = { steps: 9000, rhr: 45, sleep_consistency: 70, z13: 300, z45: 40, sleep_hours: 7.5, strength: 300, vo2: 54 };
  const r = E.hsEval(flat, flat);
  ok(Math.abs(r.raw - 0.6553) < 1e-12 && r.pace === 0.7, 'no change between windows gives the base pace');
  // the years rule: rounded impacts −0.19 → −0.2 etc. are summed, then truncated; a raw −7.99 still reads 8 when the rounded sum is −8.0
  const yrs = imp => { const s = imp.reduce((a, x) => a + Math.sign(x) * Math.round(Math.abs(x) * 10) / 10, 0); return -Math.trunc(Math.round(s * 10) / 10); };
  ok(yrs([-3.96, -4.03]) === 8 && yrs([-3.94, -4.03]) === 7 && yrs([0.4, 0.3]) === 0 && yrs([1.3]) === -1, 'years younger rounds each impact, then truncates');
  // pipeline on synthetic days: 30 days of steady data, eligibility and window maths
  const E2 = load('2026-06-10T02:00:00Z'), D = E2.STATE.d;
  for (let i = 0; i < 40; i++) D[E2.addDays('2026-06-07', -i)] = { rec: 60, stp: 10000, rhr: 45, sc: 72, slp: 450, acts: [{ n: 'Weightlifting', min: 60, z: [50, 20, 0, 10, 0] }] };
  E2.S().vo2 = { '2026-06-02': { v: 54, src: 'whoop' }, '2026-05-26': 55 };
  const h = E2.healthspan(), w = h.cur;
  ok(w && w.W === '2026-06-07', 'the latest week ends on the last Sunday ' + (w && w.W));
  ok(w && Math.abs(w.x30.z13 - 60 * 0.7 * 7 * 1.04) < 1e-9 && Math.abs(w.x30.strength - 420) < 1e-9 && Math.abs(w.x30.z45 - 42) < 1e-9, '30D weekly minutes, zone 1-3 correction');
  ok(w && Math.abs(w.x6.strength - 40 * 60 * 7 / 180) < 1e-9 && w.x6.steps === 10000 && w.x6.sleep_hours === 7.5, '6M: missing days count 0 for minutes, means skip them');
  ok(w && w.x6.vo2 === 54.5 && w.x30.vo2 === 54.5, 'VO2: mean of the estimates in the window, number or {v, src}');
  ok(h.weeks.length && h.weeks[0].W >= '2026-05-17', 'calibrating until 21 recoveries in 31 days');
  ok(E2.hsDay('2026-06-07').src.steps === 'whoop', 'each value keeps its source');
  // milestones: 200 steady days (full 6M windows from day 180), one recorded WHOOP milestone below the current level
  const E3 = load('2026-06-10T02:00:00Z');
  for (let i = 0; i < 200; i++) E3.STATE.d[E3.addDays('2026-06-07', -i)] = { rec: 60, stp: 12000, rhr: 45, sc: 72, slp: 450, acts: [{ n: 'Weightlifting', min: 60, z: [50, 20, 0, 10, 0] }] };
  const yNow = E3.healthspan().cur.yrs;
  E3.S().hsMiles = { [yNow - 1]: { d: '2025-12-01', src: 'whoop' } }; E3.STATE.v++;
  const m2 = E3.healthspan().miles;
  ok(m2.length === 2 && m2[0].src === 'whoop' && m2[1].src === 'orbit' && m2[1].yrs === yNow && m2[1].W > '2025-12-01', 'recorded milestones first, Orbit adds new records after them ' + JSON.stringify(m2));
  E3.S().hsMiles = { [yNow]: { d: '2026-05-31', src: 'whoop' } }; E3.STATE.v++;
  ok(E3.healthspan().miles.length === 1, 'nothing added at a level WHOOP already awarded');
}

/* ---------- formula layer: the brief's vectors ---------- */
const brief = process.argv[2], backup = process.argv[3];
if (brief) {
  const E = load('2026-10-27T02:00:00Z'), rows = csv(path.join(brief, 'test_vectors_84wk.csv'));
  let bad = 0, badImp = 0, app = 0;
  for (const r of rows) {
    const x6 = {}, x30 = {}; for (const m of E.HS_M) { x6[m] = num(r[m + '_6m']); x30[m] = num(r[m + '_30d']); }
    const e = E.hsEval(x6, x30);
    if (Math.abs(e.raw - +r.expected_pace_raw) > 1e-4) { bad++; console.log('  pace', r.week_start, e.raw, r.expected_pace_raw); }
    for (const m of E.HS_M) if (Math.abs(e.i6[m] - +r['expected_impact_6m_' + m]) > 1e-4) badImp++;
    app += Math.abs(e.pace - +r.whoop_displayed_pace) <= 0.1 + 1e-9;
  }
  ok(!bad && !badImp, `formula layer: ${rows.length} weeks, pace mismatches ${bad}, impact mismatches ${badImp}`);
  console.log(`  within ±0.1 of WHOOP's Pace: ${app}/${rows.length}`);
  // years rule on the vectors' impacts: the first week of each new year younger is WHOOP's milestone week
  let best = -Infinity; const miles = [];
  for (const r of rows) { const x6 = {}, x30 = {}; for (const m of E.HS_M) { x6[m] = num(r[m + '_6m']); x30[m] = num(r[m + '_30d']); } const y = E.hsEval(x6, x30).yrs; if (y > best) { miles.push(`${y}@${r.week_start}`); best = y; } }
  console.log('  years younger, first weeks:', miles.join(' '));

  if (backup) {
    const b = JSON.parse(fs.readFileSync(backup, 'utf8')), P = load('2026-10-27T02:00:00Z');
    P.STATE.d = b.days; P.STATE.settings = b.settings; P.STATE.settings.vo2 = {};
    for (const r of csv(path.join(brief, 'seed_whoop_vo2_weekly.csv'))) P.STATE.settings.vo2[r.date] = { v: +r.vo2_whoop_estimate, src: 'whoop' };
    const h = P.healthspan(), byW = Object.fromEntries(h.weeks.map(w => [w.W, w]));
    const tol = { steps: [0.01, 1], rhr: [0.3], sleep_consistency: [0.5], sleep_hours: [0.02], z13: [0.02, 1], z45: [0.05, 1], strength: [0.03, 1], vo2: [0.05] };
    const out = Object.fromEntries(Object.keys(tol).map(m => [m, 0])), outRecent = { ...out }; let n = 0, nRecent = 0, paceOk = 0, paceRecent = 0;
    for (const r of rows) {
      const w = byW[r.week_start]; if (!w) { console.log('  no week', r.week_start); continue; } n++;
      const recent = r.week_start >= '2026-04-01'; if (recent) nRecent++;
      for (const [m, [t, rel]] of Object.entries(tol)) { const e = +r[m + '_6m'], g = w.x6[m], err = rel ? (g - e) / e : g - e; if (!(Math.abs(err) <= t)) { out[m]++; if (recent) outRecent[m]++; } }
      const pOk = Math.abs(w.pace - +r.whoop_displayed_pace) <= 0.1 + 1e-9; paceOk += pOk; if (recent) paceRecent += pOk;
    }
    console.log(`  pipeline 6M out of tolerance, all ${n} weeks:`, JSON.stringify(out));
    console.log(`  pipeline 6M out of tolerance, ${nRecent} weeks since Apr 2026:`, JSON.stringify(outRecent));
    console.log(`  end to end Pace within ±0.1 of WHOOP: ${paceOk}/${n} (since Apr 2026: ${paceRecent}/${nRecent})`);
    console.log('  milestones from Orbit data:', h.miles.map(m => `${m.yrs}@${m.W}`).join(' '), '· now', h.cur.W, h.cur.yrs, 'yrs, pace', h.cur.pace, '(raw', h.cur.raw.toFixed(3) + ')');
    for (const W of ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18']) console.log('  ', W, 'pace', byW[W]?.pace, '(' + byW[W]?.raw.toFixed(3) + ')', 'yrs', byW[W]?.yrs);
    // with nothing recorded, from Orbit's data alone. WHOOP: −8 on 5 Apr 2026, −9 on 28 Jun 2026; Orbit's 6M zones 1-3 ran
    // ~3% under WHOOP's in late June, so its own −9 lands later. With WHOOP's recorded, those stand and nothing is added yet.
    const m8 = h.miles.find(m => m.yrs === 8), m9 = h.miles.find(m => m.yrs === 9);
    ok(m8?.W === '2026-04-05', 'milestone −8 on 5 Apr 2026 from Orbit data alone ' + m8?.W);
    ok(m9 && m9.W >= '2026-06-28' && m9.W <= '2026-07-26', 'milestone −9 within 4 weeks of 28 Jun 2026 ' + m9?.W);
    ok(!h.miles.some(m => m.W < '2025-05-18'), 'no milestones from part-covered windows');
    P.STATE.settings.hsMiles = { 7: { d: '2025-03-18' }, 8: { d: '2026-04-05' }, 9: { d: '2026-06-28' } }; P.STATE.v++;
    const h2 = P.healthspan(); ok(h2.miles.map(m => `${m.yrs}@${m.W}`).join() === '7@2025-03-18,8@2026-04-05,9@2026-06-28', 'recorded WHOOP milestones stand, none added ' + JSON.stringify(h2.miles));
  }
} else console.log('  (formula and pipeline layers skipped: pass the brief folder and a backup)');
console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
