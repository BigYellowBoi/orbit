/* ============================================================
   IMPORTS — WHOOP export (zip or CSVs) and MacroFactor export (xlsx or csv)
   Parsing happens in the browser; nothing leaves the page.
   ============================================================ */
const LIBS = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' };
const libP = {};
function loadLib(k) {
  if (k === 'xlsx' && window.XLSX) return Promise.resolve(window.XLSX);
  if (k === 'jszip' && window.JSZip) return Promise.resolve(window.JSZip);
  return libP[k] || (libP[k] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = LIBS[k]; s.async = true;
    s.onload = () => res(k === 'xlsx' ? window.XLSX : window.JSZip);
    s.onerror = () => { delete libP[k]; rej(new Error('Couldn’t load the file reader. Check your connection and try again.')); };
    document.head.appendChild(s);
  }));
}
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const norm = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
function isoDate(v) { // → 'YYYY-MM-DD' from ISO text, Excel serial, D/M/Y text or a Date
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) { const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 864e5)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
  if (v instanceof Date && !isNaN(v)) { const t = new Date(v.getTime() + 12 * 36e5); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s); if (m) { let a = +m[1], b = +m[2]; if (a <= 12 && b > 12) [a, b] = [b, a]; return `${m[3]}-${pad(b)}-${pad(a)}`; } // assume D/M/Y unless impossible
  const t = Date.parse(s); if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return null;
}
function numCell(v) { if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; }

/* ---------- WHOOP ---------- */
const WHOOP_CYCLE = { rec: 'recovery score', hrv: 'heart rate variability', rhr: 'resting heart rate', str: 'day strain', kb: 'energy burned', slp: 'asleep duration', sp: 'sleep performance',
  sn: 'sleep need', sd: 'sleep debt', se: 'sleep efficiency', sc: 'sleep consistency', deep: 'deep sws duration', rem: 'rem duration', lt: 'light sleep duration', aw: 'awake duration', bed: 'in bed duration', rr: 'respiratory rate' };
function whoopKind(head) {
  const h = head.map(norm);
  if (h.some(x => x.startsWith('recovery score')) && h.some(x => x.startsWith('cycle start time'))) return 'cycles';
  if (h.some(x => x.startsWith('activity name')) && h.some(x => x.startsWith('workout start time'))) return 'workouts';
  if (h.some(x => x.startsWith('question text')) && h.some(x => x.startsWith('answered yes'))) return 'journal';
  return null;
}
function parseWhoopRows(rows, acc) {
  const head = rows[0] || [], kind = whoopKind(head); if (!kind) return false;
  const h = head.map(norm), col = p => h.findIndex(x => x.startsWith(p));
  if (kind === 'cycles') {
    const ci = {}; for (const k in WHOOP_CYCLE) ci[k] = col(WHOOP_CYCLE[k]);
    const iWake = col('wake onset'), iStart = col('cycle start time'), iOn = col('sleep onset');
    for (const r of rows.slice(1)) {
      let date = isoDate(r[iWake]);
      if (!date) { const st = String(r[iStart] || ''), d0 = isoDate(st); if (!d0) continue; date = +(st.slice(11, 13) || 0) >= 15 ? addDays(d0, 1) : d0; }
      const o = {}; for (const k in ci) if (ci[k] >= 0) { const v = numCell(r[ci[k]]); if (v != null) o[k] = v; }
      const clk = v => { const m = /\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/.exec(String(v || '')); return m ? m[1] : null; };
      if (iOn >= 0 && clk(r[iOn])) o.on = clk(r[iOn]); if (iWake >= 0 && clk(r[iWake])) o.off = clk(r[iWake]);
      if (Object.keys(o).length) { acc.days[date] = { ...(acc.days[date] || {}), ...o }; acc.cycles++; }
    }
  } else if (kind === 'journal') {
    const iStart = col('cycle start time'), iQ = col('question text'), iY = col('answered yes');
    for (const r of rows.slice(1)) {
      if (!/alcohol/i.test(String(r[iQ] || ''))) continue; // only the alcohol question is read
      const st = String(r[iStart] || ''), d0 = isoDate(st); if (!d0) continue;
      const date = +(st.slice(11, 13) || 0) >= 15 ? addDays(d0, 1) : d0;
      acc.days[date] = { ...(acc.days[date] || {}), alc: /^true$|^yes$|^1$/i.test(String(r[iY]).trim()) }; acc.alc = (acc.alc || 0) + 1;
    }
  } else {
    const iS = col('workout start time'), iN = col('activity name'), iD = col('duration'), iSt = col('activity strain'), iK = col('energy burned'), iA = col('average hr'), iM = col('max hr');
    const iZ = [1, 2, 3, 4, 5].map(k => col('hr zone ' + k));
    for (const r of rows.slice(1)) {
      const date = isoDate(r[iS]); if (!date) continue;
      const a = { n: String(r[iN] || 'Activity'), min: numCell(r[iD]), str: numCell(r[iSt]), kcal: numCell(r[iK]), ahr: numCell(r[iA]), mhr: numCell(r[iM]), t: String(r[iS] || '').slice(11, 16) };
      if (iZ.every(i => i >= 0)) a.z = iZ.map(i => numCell(r[i]) || 0);
      (acc.acts[date] = acc.acts[date] || []).push(a); acc.workouts++;
    }
  }
  return true;
}
async function readWhoopFiles(files) {
  const acc = { days: {}, acts: {}, cycles: 0, workouts: 0, files: [] };
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
      const JSZip = await loadLib('jszip'); const z = await JSZip.loadAsync(f);
      for (const name of Object.keys(z.files)) if (/\.csv$/i.test(name) && !z.files[name].dir) {
        if (parseWhoopRows(parseCSV(await z.files[name].async('string')), acc)) acc.files.push(name.split('/').pop());
      }
    } else if (parseWhoopRows(parseCSV(await f.text()), acc)) acc.files.push(f.name);
  }
  if (!acc.cycles && !acc.workouts && !acc.alc) throw new Error('No WHOOP data found. Choose the export .zip, or physiological_cycles.csv and workouts.csv from inside it.');
  const out = {};
  for (const d in acc.days) out[d] = { ...acc.days[d] };
  for (const d in acc.acts) out[d] = { ...(out[d] || {}), acts: acc.acts[d] };
  for (const d in out) if (out[d].slp != null) out[d].slp = Math.round(out[d].slp);
  return { src: 'whoop', days: out, summary: `${acc.cycles} days of recovery and sleep, ${acc.workouts} activities${acc.alc ? `, ${acc.alc} alcohol journal answers` : ''}`, files: acc.files };
}

/* ---------- MacroFactor ---------- */
function mfField(hn) { // header (normalised) → field key + unit scale
  const has = (...w) => w.every(x => hn.includes(x));
  const lb = /\blbs?\b|pound/.test(hn), kj = /\bkj\b/.test(hn);
  const wscale = lb ? 0.45359237 : 1, escale = kj ? 1 / 4.184 : 1;
  if (/^date\b|^day$/.test(hn)) return { k: 'date' };
  if (has('target') || has('goal')) {
    if (has('protein')) return { k: 'pT', s: 1 };
    if (/calorie|energy/.test(hn)) return { k: 'kT', s: escale };
    return null;
  }
  if (has('trend') && has('weight')) return { k: 'tw', s: wscale };
  if (has('weight') && !has('body fat')) return { k: 'wt', s: wscale };
  if (has('expenditure') || has('tdee')) return { k: 'exp', s: escale };
  if (/calorie|energy|kcal/.test(hn)) return { k: 'kcal', s: escale };
  if (has('protein')) return { k: 'p', s: 1 };
  if (/carb/.test(hn) && !has('net')) return { k: 'c', s: 1 };
  if (/^(total )?fats?( g| grams)?$/.test(hn)) return { k: 'f', s: 1 };
  return null;
}
function parseMfRows(rows, acc) {
  for (let hi = 0; hi < Math.min(rows.length, 12); hi++) {
    const head = rows[hi].map(norm); const map = head.map(mfField);
    const di = map.findIndex(m => m && m.k === 'date'); const fields = map.filter(m => m && m.k !== 'date');
    if (di < 0 || !fields.length) continue;
    let n = 0;
    for (const r of rows.slice(hi + 1)) {
      const date = isoDate(r[di]); if (!date) continue;
      const o = {};
      map.forEach((m, i) => { if (!m || m.k === 'date' || o[m.k] != null) return; const v = numCell(r[i]); if (v != null && v > 0) o[m.k] = Math.round(v * m.s * 100) / 100; });
      if (Object.keys(o).length) { acc.days[date] = { ...(acc.days[date] || {}), ...o }; n++; }
    }
    if (n) { fields.forEach(m => acc.found.add(m.k)); return n; }
  }
  return 0;
}
async function readMfFiles(files) {
  const acc = { days: {}, found: new Set() }; let rows = 0;
  for (const f of files) {
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const XLSX = await loadLib('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      for (const sn of wb.SheetNames) rows += parseMfRows(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }), acc);
    } else rows += parseMfRows(parseCSV(await f.text()), acc);
  }
  if (!rows) throw new Error('No MacroFactor data found. Use Data Export → Quick Export in MacroFactor and choose the .xlsx it creates.');
  const names = { kcal: 'calories', p: 'protein', c: 'carbs', f: 'fat', wt: 'scale weight', tw: 'trend weight', exp: 'expenditure', kT: 'calorie target', pT: 'protein target' };
  return { src: 'mf', days: acc.days, summary: `${Object.keys(acc.days).length} days · ${[...acc.found].map(k => names[k] || k).join(', ')}`, files: files.map(f => f.name) };
}
function previewRange(days) { const ds = Object.keys(days).sort(); return ds.length ? `${fmtDate(ds[0], { year: 'numeric' })} to ${fmtDate(ds[ds.length - 1], { year: 'numeric' })}` : ''; }
function applyImport(p) {
  const months = new Set(); const keysBySrc = { whoop: ['rec', 'hrv', 'rhr', 'str', 'kb', 'slp', 'sp', 'sn', 'sd', 'se', 'sc', 'deep', 'rem', 'lt', 'aw', 'bed', 'rr', 'on', 'off', 'alc', 'acts'], mf: ['kcal', 'p', 'c', 'f', 'wt', 'tw', 'exp', 'kT', 'pT'] }[p.src];
  for (const date in p.days) {
    const cur = STATE.d[date] || {}; const nx = { ...cur };
    for (const k of keysBySrc) if (p.days[date][k] != null) nx[k] = p.days[date][k];
    STATE.d[date] = nx; months.add(date.slice(0, 7));
  }
  S().imports = { ...(S().imports || {}), [p.src]: { at: Date.now(), range: previewRange(p.days), n: Object.keys(p.days).length } };
  return months;
}
