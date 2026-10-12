'use strict';
/* ============================================================
   HELPERS
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const r1 = x => Math.round(x * 10) / 10;
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => a.length ? sum(a) / a.length : null;
const clone = o => JSON.parse(JSON.stringify(o));
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
function fmt(x, d = 1) { if (x == null || !Number.isFinite(x)) return '–'; return x.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: 0 }); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toUTC(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(s, n) { const t = new Date(toUTC(s) + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
function fmtDate(s, o) { return new Date(toUTC(s)).toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(o || {}) }); }
function fmtDow(s) { return new Date(toUTC(s)).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' }); }
function dowMon(s) { return (new Date(toUTC(s)).getUTCDay() + 6) % 7; } // Mon = 0
function weekStart(s) { return addDays(s, -dowMon(s)); }
function fmtDur(sec) { if (!sec) return ''; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`; }
const ICON = {
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
};

/* ============================================================
   PROGRAMME DATA
   Exercise library: name, muscle group, unit, rep range, and Louis's stated
   max set ('base'), shown as a reference and counted as the best to beat.
   Units: kg · plates (20 kg plates per side on plate-loaded machines) · bw
   ============================================================ */
const GROUPS = { chest: 'Chest', back: 'Back', delt_f: 'Front delts', delt_s: 'Side delts', delt_r: 'Rear delts', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads', hams: 'Hamstrings', calves: 'Calves', abs: 'Abs', other: 'Other' };
const GROUP_ORDER = Object.keys(GROUPS);
const UNITS = { kg: { label: 'kg', col: 'kg' }, plates: { label: 'plates / side', col: 'Plates' }, bw: { label: 'bodyweight', col: '+kg' } };
const X = (name, g, u, rest, lo, hi, w, r, note) => ({ name, g, u, rest, lo, hi, base: w == null && r == null ? null : { w, r }, note: note || '' });
const EXLIB = {
  incline_db: X('Incline dumbbell press', 'chest', 'kg', 150, 6, 8, 48, 6, 'kg per dumbbell'),
  chest_press: X('Seated chest press', 'chest', 'plates', 120, 8, 10, 3, 8),
  cable_fly: X('Cable chest flys', 'chest', 'kg', 90, 8, 12, 25, 8),
  crunch: X('Crunch machine', 'abs', 'kg', 60, 10, 15, 60, 12),
  ab_roller: X('Ab roller', 'abs', 'bw', 60, 8, 12, 0, 10),
  tbar: X('T-bar row', 'back', 'plates', 150, 8, 10, 3.75, 8),
  pulldown: X('Lat pulldown', 'back', 'kg', 120, 8, 10, 90, 8),
  seated_row: X('Seated row', 'back', 'kg', 120, 8, 10, 85, 8),
  pullover: X('Lat pullover', 'back', 'kg', 90, 8, 12, 25, 8),
  preacher: X('Machine preacher curl', 'biceps', 'kg', 90, 8, 10, 40, 8),
  spider: X('Spider curls', 'biceps', 'kg', 90, 8, 12, 20, 8, 'Incline bench · kg per dumbbell'),
  hammer: X('Hammer curls', 'biceps', 'kg', 90, 8, 10, 24, 8, 'kg per dumbbell'),
  shoulder_press: X('Shoulder press', 'delt_f', 'kg', 150, 8, 10, 40, 8),
  lat_raise: X('Dumbbell lateral raises', 'delt_s', 'kg', 90, 8, 12, 16, 8, 'kg per dumbbell'),
  y_raise: X('Cable Y raises', 'delt_s', 'kg', 90, 8, 12, 6.25, 8),
  rear_fly: X('Cable rear delt flys', 'delt_r', 'kg', 90, 8, 12, 7.5, 8),
  katana: X('Cable katanas', 'triceps', 'kg', 90, 8, 12, 7.5, 8),
  skull: X('EZ-bar skullcrushers', 'triceps', 'kg', 120, 8, 10, 35, 8),
  pushdown: X('Tricep pushdowns', 'triceps', 'kg', 90, 8, 12, 45, 8),
  hack: X('Hack squat', 'quads', 'plates', 180, 8, 10, 4.75, 8),
  rdl: X('Romanian deadlift', 'hams', 'kg', 180, 6, 8, 150, 6),
  leg_ext: X('Leg extension', 'quads', 'kg', 90, 10, 15, 125, 12),
  lying_curl: X('Lying hamstring curl', 'hams', 'kg', 90, 8, 12, 55, 10),
  calf: X('Calf raises', 'calves', 'plates', 90, 10, 15, 4, 12),
  seated_curl: X('Seated leg curl', 'hams', 'kg', 90, 10, 12, null, null, 'Optional swap for the second leg day'),
};
const I = (ex, sets = 3) => ({ ex, sets });
const PRESETS = {
  ppl4: {
    name: 'Current split', blurb: 'Your rotation as it is now. Four sessions, legs once per rotation.',
    order: ['push1', 'pull', 'push2', 'legs'],
    sessions: {
      push1: { name: 'Push 1', focus: 'Chest + core', items: [I('incline_db'), I('chest_press'), I('cable_fly'), I('crunch'), I('ab_roller')] },
      pull: { name: 'Pull', focus: 'Back + biceps', items: [I('tbar'), I('pulldown'), I('seated_row'), I('pullover'), I('preacher'), I('spider'), I('hammer')] },
      push2: { name: 'Push 2', focus: 'Shoulders + triceps', items: [I('shoulder_press'), I('lat_raise'), I('y_raise'), I('rear_fly'), I('katana'), I('skull'), I('pushdown')] },
      legs: { name: 'Legs', focus: 'Quads, hamstrings, calves', items: [I('hack'), I('rdl'), I('leg_ext'), I('lying_curl'), I('calf')] },
    },
  },
  ulppl5: {
    name: 'Upper / Lower / PPL', blurb: 'Same exercises over five sessions. Legs twice per rotation, shorter upper days.',
    order: ['upper', 'lower', 'push', 'pull', 'legs'],
    sessions: {
      upper: { name: 'Upper', focus: 'Heavy compounds + arms', items: [I('incline_db'), I('tbar'), I('shoulder_press'), I('pulldown'), I('skull'), I('preacher')] },
      lower: { name: 'Lower', focus: 'Hinge + squat, core', items: [I('rdl'), I('hack'), I('lying_curl'), I('calf'), I('crunch')] },
      push: { name: 'Push', focus: 'Chest, delts, triceps', items: [I('chest_press'), I('cable_fly'), I('lat_raise'), I('y_raise'), I('katana'), I('pushdown')] },
      pull: { name: 'Pull', focus: 'Back width, rear delts, biceps', items: [I('seated_row'), I('pullover'), I('rear_fly'), I('spider'), I('hammer')] },
      legs: { name: 'Legs', focus: 'Quads + hamstrings, core', items: [I('hack'), I('seated_curl'), I('leg_ext'), I('calf'), I('ab_roller')] },
    },
  },
};
function defaultSettings() {
  const p = PRESETS.ppl4;
  return { v: 1, preset: 'ppl4', prog: { order: p.order.slice(), sessions: clone(p.sessions) }, ex: clone(EXLIB), plateKg: 20, cardio: { name: 'Stairmaster', min: 30 }, proteinT: null, rotOverride: null, imports: {}, suggest: true, goal: 'hold', progRate: 0.005 };
}
function emptyData() { return { settings: defaultSettings(), w: {}, d: {}, v: 0 }; }

/* ============================================================
   STATE
   ============================================================ */
const APP_VERSION = '__APP_VERSION__'; // from VERSION, filled in by tools/build.sh
const verNum = v => String(v).split('.').map(Number); // compare 1.10 > 1.9 properly
const newerVer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const STATE = emptyData();
const ui = { metric: 'rec', per: 'M', off: 0, openSess: new Set(), tab: 'today', logDate: null, range: 90, lift: null, imp: {}, exportText: null, confirm: null, editEx: null, pickSess: null };
const S = () => STATE.settings;
const today = () => todayStr();
function exDef(id) { return S().ex[id] || { name: id, g: 'other', u: 'kg', rest: 90, lo: 8, hi: 12, base: null }; }
function sessDef(id) { return S().prog.sessions[id] || null; }
function sessName(w) { return sessDef(w.s)?.name || w.sName || w.s; }
function order() { return S().prog.order.filter(id => S().prog.sessions[id]); }
function workoutsSorted() { return Object.values(STATE.w).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0); }
