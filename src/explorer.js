/* ============================================================
   TRENDS EXPLORER — one metric at a time, WHOOP Trend View style:
   pick a metric, a period (W / M / 6M / 1Y), page back through periods,
   headline average with change vs the prior period, chart, breakdown.
   ============================================================ */
const PERIODS = { W: [7, 'week'], M: [30, 'month'], '6M': [182, '6 months'], '1Y': [365, 'year'] };
const hm = m => m == null || !Number.isFinite(m) ? '–' : `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}:${pad(Math.round(Math.abs(m) % 60))}`;
const clockOf = t => { const m = ((Math.round(t) % 1440) + 1440) % 1440, h = Math.floor(m / 60); return `${(h % 12) || 12}:${pad(m % 60)} ${h >= 12 ? 'pm' : 'am'}`; };
const tMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); if (!m) return null; let v = +m[1] * 60 + +m[2]; if (v >= 15 * 60) v -= 1440; return v; }; // minutes from midnight; evening negative
const ZONES = ['Zone 0', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];
const ZCOL = ['var(--z0)', 'var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];
function zoneMin(date) { // minutes per heart-rate zone from that day's WHOOP activities; zone 0 is the remainder of each activity
  const acts = (STATE.d[date]?.acts || []).filter(a => a.z && a.min); if (!acts.length) return null;
  const out = [0, 0, 0, 0, 0, 0];
  for (const a of acts) { const s = sum(a.z); out[0] += a.min * Math.max(0, 100 - s) / 100; a.z.forEach((p, i) => out[i + 1] += a.min * p / 100); }
  return out;
}
const dv = k => d => dayVal(d, k);
const sevBreak = (rows) => (vals) => rows.map(([label, test, color]) => ({ label, n: vals.filter(test).length, color }));
const METRICS = [
  // Recovery
  { id: 'rec', g: 'Recovery', label: 'Recovery', unit: '%', src: 'WHOOP', v: dv('rec'), chart: 'bar', better: 1, f: v => fmt(v, 0), yMin: 0, yMax: 100, color: v => `var(--${recTone(v)})`,
    breakdown: sevBreak([['Green (67–99%)', v => v >= 67, 'var(--good)'], ['Yellow (34–66%)', v => v >= 34 && v < 67, 'var(--warn)'], ['Red (1–33%)', v => v < 34, 'var(--bad)']]) },
  { id: 'hrv', g: 'Recovery', label: 'Heart rate variability', short: 'HRV', unit: 'ms', src: 'WHOOP', v: dv('hrv'), chart: 'line', band: true, better: 1, f: v => fmt(v, 0) },
  { id: 'rhr', g: 'Recovery', label: 'Resting heart rate', unit: 'bpm', src: 'WHOOP', v: dv('rhr'), chart: 'line', better: -1, f: v => fmt(v, 0) },
  { id: 'rr', g: 'Recovery', label: 'Respiratory rate', unit: 'rpm', src: 'WHOOP', v: dv('rr'), chart: 'line', better: 0, f: v => fmt(v, 1) },
  { id: 'spo2', g: 'Recovery', label: 'Blood oxygen', unit: '%', src: 'WHOOP', v: dv('spo2'), chart: 'line', better: 0, f: v => fmt(v, 1) },
  { id: 'skt', g: 'Recovery', label: 'Skin temperature', unit: '°C', src: 'WHOOP', v: dv('skt'), chart: 'line', better: 0, f: v => fmt(v, 1) },
  // Sleep
  { id: 'sp', g: 'Sleep', label: 'Sleep performance', unit: '%', src: 'WHOOP', v: dv('sp'), chart: 'bar', better: 1, f: v => fmt(v, 0), yMin: 0, yMax: 100,
    breakdown: sevBreak([['Optimal (85%+)', v => v >= 85, 'var(--good)'], ['Sufficient (70–84%)', v => v >= 70 && v < 85, 'var(--z1)'], ['Poor (under 70%)', v => v < 70, 'var(--warn)']]) },
  { id: 'hvn', g: 'Sleep', label: 'Hours vs needed (hours)', unit: 'h', src: 'WHOOP', v: d => dayVal(d, 'slp'), v2: d => dayVal(d, 'sn'), chart: 'dual', better: 1, f: v => hm(v), fmtUnit: '' },
  { id: 'hvnp', g: 'Sleep', label: 'Hours vs needed (%)', unit: '%', src: 'WHOOP', v: d => { const a = dayVal(d, 'slp'), b = dayVal(d, 'sn'); return a != null && b ? a / b * 100 : null; }, chart: 'bar', better: 1, f: v => fmt(v, 0) },
  { id: 'bed', g: 'Sleep', label: 'Time in bed', unit: '', src: 'WHOOP', v: d => { const a = tMin(dayVal(d, 'on')), b = tMin(dayVal(d, 'off')); return a != null && b != null && b > a ? b - a : null; }, chart: 'range', better: 0, f: v => hm(v) },
  { id: 'sc', g: 'Sleep', label: 'Sleep consistency', unit: '%', src: 'WHOOP', v: dv('sc'), chart: 'bar', better: 1, f: v => fmt(v, 0), yMin: 0, yMax: 100 },
  { id: 'resth', g: 'Sleep', label: 'Restorative sleep (hours)', unit: '', src: 'WHOOP', v: d => { const a = dayVal(d, 'deep'), b = dayVal(d, 'rem'); return a != null && b != null ? a + b : null; }, chart: 'stack', better: 1, f: v => hm(v) },
  { id: 'restp', g: 'Sleep', label: 'Restorative sleep (%)', unit: '%', src: 'WHOOP', v: d => { const a = dayVal(d, 'deep'), b = dayVal(d, 'rem'), t = dayVal(d, 'slp'); return a != null && b != null && t ? (a + b) / t * 100 : null; }, chart: 'bar', better: 1, f: v => fmt(v, 0) },
  { id: 'se', g: 'Sleep', label: 'Sleep efficiency', unit: '%', src: 'WHOOP', v: dv('se'), chart: 'line', better: 1, f: v => fmt(v, 0) },
  { id: 'sd', g: 'Sleep', label: 'Sleep debt', unit: '', src: 'WHOOP', v: dv('sd'), chart: 'bar', better: -1, hmY: true, f: v => hm(v) },
  // Strain
  { id: 'str', g: 'Strain', label: 'Day strain', unit: '', src: 'WHOOP', v: dv('str'), chart: 'bar', better: 0, delta: 'abs', partial: true, f: v => fmt(v, 1), yMin: 0, yMax: 21,
    breakdown: sevBreak([['All out (18+)', v => v >= 18, 'var(--z5)'], ['Strenuous (14–18)', v => v >= 14 && v < 18, 'var(--z4)'], ['Moderate (10–14)', v => v >= 10 && v < 14, 'var(--z2)'], ['Light (under 10)', v => v < 10, 'var(--z1)']]) },
  { id: 'kb', g: 'Strain', label: 'Calories burned', unit: 'kcal', src: 'WHOOP', v: dv('kb'), chart: 'bar', better: 0, partial: true, f: v => fmt(v, 0) },
  { id: 'z13', g: 'Strain', label: 'Heart rate zones 1–3', unit: 'hr', src: 'WHOOP', v: d => { const z = zoneMin(d); return z ? z[1] + z[2] + z[3] : null; }, zones: [1, 2, 3], chart: 'zones', weekly: true, better: 0, partial: true, f: v => hm(v) },
  { id: 'z45', g: 'Strain', label: 'Heart rate zones 4–5', unit: 'hr', src: 'WHOOP', v: d => { const z = zoneMin(d); return z ? z[4] + z[5] : null; }, zones: [4, 5], chart: 'zones', weekly: true, better: 0, partial: true, f: v => hm(v) },
  { id: 'zall', g: 'Strain', label: 'Heart rate zones, all', unit: 'hr', src: 'WHOOP', v: d => { const z = zoneMin(d); return z ? sum(z) : null; }, zones: [0, 1, 2, 3, 4, 5], chart: 'zones', weekly: true, better: 0, partial: true, f: v => hm(v) },
  { id: 'stp', g: 'Strain', label: 'Steps', unit: '', src: 'WHOOP, or your iPhone on days WHOOP has none', v: d => stepsOf(d), chart: 'bar', better: 1, partial: true, f: v => fmt(v, 0),
    breakdown: sevBreak([['10,000+', v => v >= 10000, 'var(--good)'], ['7,500–9,999', v => v >= 7500 && v < 10000, 'var(--z2)'], ['5,000–7,499', v => v >= 5000 && v < 7500, 'var(--z1)'], ['Under 5,000', v => v < 5000, 'var(--warn)']]) },
  { id: 'lift', g: 'Strain', label: 'Strength activity time', unit: 'hr', src: 'WHOOP', v: d => whoopLiftMin(d), chart: 'bar', weekly: true, better: 0, partial: true, f: v => hm(v) },
  { id: 'vol', g: 'Strain', label: 'Total volume load', unit: 't', src: 'Logbook', v: d => { const w = STATE.w[d]; if (!w || w.rest) return null; const k = wStats(w).kg; return k ? k / 1000 : null; }, chart: 'bar', weekly: true, better: 0, f: v => fmt(v, 1) },
  // Body + nutrition
  { id: 'wt', g: 'Body + nutrition', label: 'Weight', unit: 'kg', src: 'MacroFactor, by export or Apple Health', v: dv('tw'), chart: 'weight', better: 0, diff: true, delta: 'abs', f: v => fmt(v, 1) },
  { id: 'kcal', g: 'Body + nutrition', label: 'Calories in', unit: 'kcal', src: 'MacroFactor, by export or Apple Health', v: dv('kcal'), chart: 'intake', better: 0, partial: true, f: v => fmt(v, 0) },
  { id: 'exp', g: 'Body + nutrition', label: 'Expenditure', unit: 'kcal', src: 'MacroFactor, by export or Apple Health', v: dv('exp'), chart: 'line', better: 0, diff: true, f: v => fmt(v, 0) },
  { id: 'p', g: 'Body + nutrition', label: 'Protein', unit: 'g', src: 'MacroFactor, by export or Apple Health', v: dv('p'), chart: 'bar', better: 0, partial: true, f: v => fmt(v, 0) },
  // Hearing (Apple Health, from AirPods and other headphones)
  { id: 'hp', g: 'Hearing', label: 'Headphone volume', short: 'headphone volume', unit: 'dB', src: 'Apple Health (headphone audio levels)', v: dv('hp'), chart: 'line', better: -1, partial: true, f: v => fmt(v, 0),
    breakdown: sevBreak([['Under 70 dB', v => v < 70, 'var(--good)'], ['70–79 dB', v => v >= 70 && v < 80, 'var(--z1)'], ['80 dB+', v => v >= 80, 'var(--warn)']]) },
  { id: 'hpm', g: 'Hearing', label: 'Headphone time', unit: '', src: 'Apple Health (headphone audio levels)', v: dv('hpm'), chart: 'bar', better: 0, partial: true, hmY: true, f: v => hm(v) },
];
function explorerHTML() {
  const m = METRICS.find(x => x.id === ui.metric) || METRICS[0], [n0, word] = PERIODS[ui.per] || PERIODS.M, t = today();
  const n = m.weekly && n0 > 7 ? Math.round(n0 / 7) * 7 : n0; // weekly totals use whole 7-day weeks ending on the period's last day
  const end = addDays(t, -(ui.off || 0) * n), start = addDays(end, -(n - 1)), pEnd = addDays(start, -1), pStart = addDays(pEnd, -(n - 1));
  const span = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
  const days = span(start, end), pdays = span(pStart, pEnd);
  const use = ds => m.partial ? ds.filter(d => d !== t) : ds;
  const agg = ds => { const v = use(ds).map(m.v).filter(x => x != null); if (!v.length) return null; return m.weekly ? sum(v) / (use(ds).length / 7) : mean(v); };
  const cur = agg(days), prev = agg(pdays);
  const unitTxt = m.weekly && m.unit === 'hr' ? 'hr' : m.unit;
  // headline
  let delta = '';
  if (cur != null && prev != null && prev !== 0) {
    const absD = cur - prev, rel = absD / Math.abs(prev) * 100, useAbs = m.delta === 'abs';
    const tone = Math.abs(rel) < 1 || !m.better ? '' : (absD > 0) === (m.better > 0) ? 'good' : 'warn';
    const shown = useAbs ? (m.unit === 'kg' ? `${fmt(Math.abs(absD), 1)} kg` : fmt(Math.abs(absD), 1)) : `${fmt(Math.abs(rel), 0)}%`;
    delta = `<span class="pill plain ${tone}">${Math.abs(rel) < 1 ? '•' : absD > 0 ? '▲' : '▼'} ${shown} vs prior ${word}</span>`;
  }
  const fmtH = v => v == null ? '–' : m.f(v);
  const first = days.map(d => m.v(d)).find(x => x != null), last = [...days].reverse().map(d => m.v(d)).find(x => x != null);
  let extra = '';
  if (m.diff && first != null && last != null) extra = `<div class="stat"><span>Difference</span><b>${last - first >= 0 ? '+' : '−'}${m.f(Math.abs(last - first))}<small>${esc(m.unit)}</small></b></div>`;
  if (m.id === 'bed') { const on = use(days).map(d => tMin(dayVal(d, 'on'))).filter(x => x != null), off = use(days).map(d => tMin(dayVal(d, 'off'))).filter(x => x != null);
    if (on.length) extra = `<div class="stat"><span>Usual times</span><b class="sm">${clockOf(mean(on))}<small>to</small> ${clockOf(mean(off))}</b></div>`; }
  if (m.id === 'wt') { const wr = weightRate(end); if (wr) extra += `<div class="stat"><span>Rate, last ${wr.weeks} wk</span><b>${wr.wk >= 0 ? '+' : '−'}${fmt(Math.abs(wr.wk), 2)}<small>kg/wk</small></b></div>`; }
  const sentence = cur == null ? '' : prev == null ? `` : `<p class="small dim">Your ${m.weekly ? 'average weekly total' : 'average'} ${esc(m.short || m.label.toLowerCase())} ${ui.off ? 'in this period' : `this ${word}`} (${fmtH(cur)}${m.unit && !m.weekly ? ' ' + esc(m.unit) : ''}) was ${Math.abs(cur - prev) / Math.abs(prev) < .01 ? 'in line with' : cur > prev ? 'above' : 'below'} the ${word} before (${fmtH(prev)}).</p>`;

  let h = `<section class="card explorer">
    <label class="vh" for="metric">Metric</label>
    <select class="in metric" id="metric" data-in="metric">${[...new Set(METRICS.map(x => x.g))].map(g => `<optgroup label="${esc(g)}">${METRICS.filter(x => x.g === g).map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>`).join('')}</select>
    <div class="ex-top"><div class="stats ex-head"><div class="stat"><span>${m.weekly ? 'Avg. weekly total' : 'Average'}</span><b>${fmtH(cur)}<small>${esc(unitTxt)}</small></b></div>${extra}</div>
      <div class="ex-ctl"><div class="seg" role="group" aria-label="Period">${Object.keys(PERIODS).map(k => `<button class="${(ui.per || 'M') === k ? 'on' : ''}" data-act="per" data-v="${k}">${k}</button>`).join('')}</div>
      <div class="ex-nav"><button class="iconbtn sm" data-act="poff" data-n="1" aria-label="Previous period">‹</button><span class="mono xs rng">${esc(fmtDMY(start))} – ${esc(fmtDMY(end))}</span><button class="iconbtn sm" data-act="poff" data-n="-1" aria-label="Next period" ${ui.off ? '' : 'disabled style="opacity:.3"'}>›</button></div></div></div>
    ${delta ? `<div>${delta}</div>` : ''}${sentence}`;
  h += explorerChart(m, days, start, n);
  if (m.partial && end === t) h += `<p class="xs muted">Average leaves out today, which isn't finished yet.</p>`;
  // breakdowns
  const vals = use(days).map(m.v).filter(x => x != null);
  if (m.breakdown && vals.length) {
    const rows = m.breakdown(vals), tot = sum(rows.map(r => r.n)) || 1;
    h += `<div class="sec"><span class="eyebrow">${esc(m.label)} breakdown · days</span><div class="bk-bar">${rows.filter(r => r.n).map(r => `<i style="flex:${r.n};background:${r.color}"></i>`).join('')}</div>
      <ul class="bk">${rows.map(r => `<li><i style="background:${r.color}"></i><b>${r.n}×</b><span>${esc(r.label)}</span><span class="muted">${fmt(r.n / tot * 100, 0)}%</span></li>`).join('')}</ul></div>`;
  }
  if (m.chart === 'zones') {
    const tz = [0, 0, 0, 0, 0, 0]; let nd = 0; for (const d of use(days)) { const z = zoneMin(d); if (z) { z.forEach((v, i) => tz[i] += v); nd++; } }
    if (nd) { const wk = use(days).length / 7, zs = m.zones;
      h += `<div class="sec"><span class="eyebrow">Zone breakdown · avg weekly total</span><div class="bk-bar">${zs.map(i => `<i style="flex:${tz[i] || 0.0001};background:${ZCOL[i]}"></i>`).join('')}</div>
        <ul class="bk">${zs.map(i => `<li><i style="background:${ZCOL[i]}"></i><b>${hm(tz[i] / wk)}</b><span>${ZONES[i]}</span></li>`).join('')}</ul>
        <p class="xs muted">Zone time comes from activities WHOOP logged. Zone 0 is the time in each activity below zone 1.</p></div>`; }
  }
  if (m.id === 'hp') h += `<p class="xs muted">Average level while headphones were playing, weighted by time. For comparison, the WHO treats 80 dB for 40 hours a week as the safe limit; every 3 dB louder halves that time.</p>`;
  if (m.id === 'wt' || m.id === 'exp') h += `<p class="xs muted">Days MacroFactor's export doesn't cover use Orbit's own estimate from Apple Health: trend is scale weight smoothed over time, and expenditure is the last 28 days' intake adjusted for the change in trend weight.</p>`;
  if (m.band) h += `<p class="xs muted">Shaded band: your normal range, from the previous 60 days' average ± half a standard deviation of log-transformed HRV (Plews et al., 2013). A 7-day average sitting below it for several days is the signal worth noticing.</p>`;
  h += `<p class="xs muted">Source: ${esc(m.src)}.</p></section>`;
  return h;
}
function explorerChart(m, days, start, n) {
  const t = today(), xi = d => diffDays(start, d), ax = dateAxis(start, days[days.length - 1]);
  if (n <= 7) { ax.xTicks = days.map(xi); ax.xFmt = i => fmtDow(addDays(start, i)); ax.x0 = -0.5; ax.x1 = n - 0.5; }
  else { ax.x0 = -0.5; ax.x1 = n - 0.5; }
  const has = days.filter(d => m.v(d) != null), lab = n <= 7;
  const tipBase = d => `<b>${esc(fmtDow(d))} ${esc(fmtDMY(d))}</b>`;
  const tip = x => { const d = addDays(start, x), v = m.v(d); if (v == null) return ''; return `${tipBase(d)}<br>${esc(m.label)}: ${m.f(v)}${m.unit && m.unit !== 'hr' ? ' ' + esc(m.unit) : ''}${STATE.w[d] && !STATE.w[d].rest ? `<br>${esc(sessName(STATE.w[d]))}` : ''}${dayVal(d, 'alc') ? '<br>Alcohol logged the night before' : ''}`; };
  const empty = `No ${m.src} data for ${m.label.toLowerCase()} in this period.`;
  const base = { h: 200, ...ax, hoverXs: has.map(xi), tip, empty, label: m.label };
  // weekly aggregation for M and longer
  if (m.weekly && n > 7) {
    const last = days[days.length - 1], weeks = []; for (let we = last; we >= start; we = addDays(we, -7)) weeks.unshift(addDays(we, -6));
    const wkDays = ws => { const o = []; for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (!(m.partial && d === t)) o.push(d); } return o; };
    const bars = weeks.map((ws, i) => {
      const ds = wkDays(ws);
      if (m.chart === 'zones') { const z = [0, 0, 0, 0, 0, 0]; ds.forEach(d => { const q = zoneMin(d); if (q) q.forEach((v, k) => z[k] += v); }); return { x: i, segs: m.zones.map(k => ({ v: z[k] / 60, color: ZCOL[k] })), tot: sum(m.zones.map(k => z[k])) }; }
      const v = sum(ds.map(m.v).filter(x => x != null)); return { x: i, v: m.unit === 'hr' ? v / 60 : v, tot: v, color: 'var(--s1)' };
    });
    const wl = i => { const ws = weeks[i], we = addDays(ws, 6); return weeks.length > 17 ? monYr(we) : weeks.length > 6 ? fmtDate(we) : `${+ws.slice(8)}–${+we.slice(8)}`; };
    const step = Math.ceil(weeks.length / 4);
    return chartHTML({ ...base, x0: -0.5, x1: weeks.length - 0.5, xTicks: weeks.map((_, i) => i).filter(i => (weeks.length - 1 - i) % step === 0), xFmt: wl, barMax: 48, yMin: 0,
      yFmt: v => m.unit === 'hr' ? hm(v * 60) : fmt(v, 1), bars: bars.filter(b => b.tot), hoverXs: bars.filter(b => b.tot).map(b => b.x),
      tip: i => { const b = bars[i]; return b && b.tot ? `<b>Week of ${esc(fmtDMY(weeks[i]))}</b><br>${m.unit === 'hr' ? hm(b.tot) : fmt(b.tot, 1) + ' ' + esc(m.unit)}` : ''; },
      barLabel: weeks.length <= 6 ? b => m.unit === 'hr' ? hm(b.tot) : fmt(b.tot, 1) : null });
  }
  switch (m.chart) {
    case 'bar': case 'zones': {
      if (m.chart === 'zones') return chartHTML({ ...base, yMin: 0, yFmt: v => hm(v * 60), bars: has.map(d => { const z = zoneMin(d); return { x: xi(d), segs: m.zones.map(k => ({ v: z[k] / 60, color: ZCOL[k] })), tot: m.v(d) }; }), barLabel: lab ? b => hm(b.tot) : null });
      const sc = m.unit === 'hr' || m.hmY ? 1 / 60 : 1; // minutes drawn in hours so the axis lands on whole hours
      return chartHTML({ ...base, yMin: m.yMin ?? 0, yMax: m.yMax, yFmt: v => m.unit === 'hr' || m.hmY ? hm(v / sc) : fmt(v, 0), refY: m.id === 'p' && S().proteinT ? { v: S().proteinT } : null,
        bars: has.map(d => ({ x: xi(d), v: m.v(d) * sc, raw: m.v(d), color: m.color ? m.color(m.v(d)) : 'var(--s1)' })), barLabel: lab ? b => m.f(b.raw) : null });
    }
    case 'line': {
      const pts = has.map(d => ({ x: xi(d), y: m.v(d) }));
      const area = m.band ? days.map(d => { const b = hrvBand(d); return b ? { x: xi(d), lo: b.lo, hi: b.hi } : null; }).filter(Boolean) : null;
      return chartHTML({ ...base, yPad: ['rr', 'skt', 'spo2'].includes(m.id) ? .3 : 2, yFmt: v => fmt(v, ['rr', 'skt'].includes(m.id) ? 1 : 0), area, areaGap: 3,
        series: [{ color: 'var(--s1)', pts, gap: n > 60 ? 6 : 3, dots: n <= 31, r: 3, end: true, w: n > 60 ? 1.6 : 2, labels: lab ? p => m.f(p.y) : null }] });
    }
    case 'dual': {
      const a = has.map(d => ({ x: xi(d), y: m.v(d) / 60 })), b = days.filter(d => m.v2(d) != null).map(d => ({ x: xi(d), y: m.v2(d) / 60 }));
      return `<div class="legend"><span><i class="ln" style="background:var(--s1)"></i>Hours of sleep</span><span><i class="ln" style="background:var(--s3)"></i>Sleep needed</span></div>` +
        chartHTML({ ...base, yPad: .5, yFmt: v => hm(v * 60), tip: x => { const d = addDays(start, x); return m.v(d) == null ? '' : `${tipBase(d)}<br>Asleep ${hm(m.v(d))} · needed ${hm(m.v2(d))}`; },
          series: [{ color: 'var(--s3)', pts: b, gap: 3, dots: n <= 31, r: 3, labels: lab ? p => hm(p.y * 60) : null }, { color: 'var(--s1)', pts: a, gap: 3, dots: n <= 31, r: 3, labels: lab ? p => hm(p.y * 60) : null }] });
    }
    case 'range': {
      const rows = has.map(d => ({ d, on: tMin(dayVal(d, 'on')), off: tMin(dayVal(d, 'off')) })).filter(r => r.on != null && r.off != null);
      if (!rows.length) return chartHTML({ ...base, bars: [] });
      const lo = Math.floor((Math.min(...rows.map(r => r.on)) - 30) / 120) * 120, hi = Math.ceil((Math.max(...rows.map(r => r.off)) + 30) / 120) * 120;
      const ticks = []; for (let v = lo; v <= hi; v += (hi - lo > 720 ? 240 : 120)) ticks.push(-v);
      return chartHTML({ ...base, ml: 52, lblCls: 'lbl sm', yMin: -hi, yMax: -lo, yTickVals: ticks, yFmt: v => clockOf(-v).replace(':00', ''), barMax: 22,
        bars: rows.map(r => ({ x: xi(r.d), v: -r.on, lo: -r.off, color: 'var(--s1)', r })), barLabel: lab ? b => clockOf(b.r.on).replace(/ (am|pm)$/, '') : null, barLabelLo: b => clockOf(b.r.off).replace(/ (am|pm)$/, ''),
        tip: x => { const d = addDays(start, x), r = rows.find(q => q.d === d); return r ? `${tipBase(d)}<br>${clockOf(r.on)} to ${clockOf(r.off)} · ${hm(r.off - r.on)} in bed` : ''; } });
    }
    case 'stack': return `<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Deep (SWS)</span><span><i class="dot" style="background:var(--s3)"></i>REM</span></div>` +
      chartHTML({ ...base, yMin: 0, yFmt: v => hm(v * 60), bars: has.map(d => ({ x: xi(d), segs: [{ v: dayVal(d, 'deep') / 60, color: 'var(--s1)' }, { v: dayVal(d, 'rem') / 60, color: 'var(--s3)' }], tot: m.v(d) })), barLabel: lab ? b => hm(b.tot) : null,
        tip: x => { const d = addDays(start, x); return m.v(d) == null ? '' : `${tipBase(d)}<br>Deep ${hm(dayVal(d, 'deep'))} · REM ${hm(dayVal(d, 'rem'))}<br>Total ${hm(m.v(d))}`; } });
    case 'weight': {
      const sc = days.filter(d => dayVal(d, 'wt') != null).map(d => ({ x: xi(d), y: dayVal(d, 'wt') }));
      return `<div class="legend"><span><i class="dot" style="background:var(--s1);opacity:.5"></i>Scale weight</span><span><i class="ln" style="background:var(--s1)"></i>Trend weight</span></div>` +
        chartHTML({ ...base, yPad: .3, yFmt: v => fmt(v, 1), hoverXs: [...new Set([...has, ...days.filter(d => dayVal(d, 'wt') != null)])].map(xi),
          tip: x => { const d = addDays(start, x); return `${tipBase(d)}${dayVal(d, 'wt') != null ? `<br>Scale ${fmt(dayVal(d, 'wt'), 1)} kg` : ''}${dayVal(d, 'tw') != null ? `<br>Trend ${fmt(dayVal(d, 'tw'), 2)} kg` : ''}`; },
          series: [{ color: 'var(--s1)', pts: sc, line: false, dots: true, r: 2.5, faint: true }, { color: 'var(--s1)', pts: has.map(d => ({ x: xi(d), y: m.v(d) })), gap: 7, end: true }] });
    }
    case 'intake': {
      const kD = has, eD = days.filter(d => dayVal(d, 'exp') != null);
      const roll7 = kD.map(d => { const a = avgOver('kcal', d, 7); return { x: xi(d), y: a && a.n >= 3 ? a.avg : null }; });
      const paired = kD.filter(d => d !== t && dayVal(d, 'exp') != null), bal = paired.length ? mean(paired.map(d => dayVal(d, 'kcal') - dayVal(d, 'exp'))) : null;
      return `<div class="legend"><span><i class="dot" style="background:var(--s1);opacity:.5"></i>Intake, daily</span>${n > 7 ? '<span><i class="ln" style="background:var(--s1)"></i>Intake, 7-day avg</span>' : ''}<span><i class="ln" style="background:var(--s2)"></i>Expenditure</span></div>` +
        chartHTML({ ...base, yPad: 100, yFmt: v => fmt(v, 0), hoverXs: [...new Set([...kD, ...eD])].map(xi),
          tip: x => { const d = addDays(start, x); return `${tipBase(d)}${dayVal(d, 'kcal') != null ? `<br>In ${fmt(dayVal(d, 'kcal'), 0)} kcal` : ''}${dayVal(d, 'exp') != null ? `<br>Expenditure ${fmt(dayVal(d, 'exp'), 0)} kcal` : ''}${dayVal(d, 'p') != null ? `<br>P ${fmt(dayVal(d, 'p'), 0)} · C ${fmt(dayVal(d, 'c'), 0)} · F ${fmt(dayVal(d, 'f'), 0)}` : ''}`; },
          series: [{ color: 'var(--s1)', pts: kD.map(d => ({ x: xi(d), y: m.v(d) })), line: n <= 7, dots: true, r: n <= 31 ? 3 : 2, faint: n > 7 }, ...(n > 7 ? [{ color: 'var(--s1)', pts: roll7, gap: 8 }] : []), { color: 'var(--s2)', pts: eD.map(d => ({ x: xi(d), y: dayVal(d, 'exp') })), gap: 7, end: true }] }) +
        (bal != null ? `<p class="xs muted">Average balance ${bal >= 0 ? '+' : '−'}${fmt(Math.abs(bal), 0)} kcal a day across ${paired.length} logged days.</p>` : '');
    }
  }
  return '';
}
function alcoholCard() {
  const rows = Object.keys(STATE.d).filter(d => STATE.d[d].alc != null && STATE.d[d].rec != null);
  const yes = rows.filter(d => STATE.d[d].alc), no = rows.filter(d => !STATE.d[d].alc);
  if (yes.length < 3 || no.length < 3) return '';
  const a = (ds, k) => mean(ds.map(d => STATE.d[d][k]).filter(v => v != null));
  const last30 = Object.keys(STATE.d).filter(d => d > addDays(today(), -30) && STATE.d[d].alc).length;
  const rY = a(yes, 'rec'), rN = a(no, 'rec'), hY = a(yes, 'hrv'), hN = a(no, 'hrv'), sY = a(yes, 'rhr'), sN = a(no, 'rhr');
  const row = (label, v, nn, tone) => `<li><span class="lab">${label}</span><span class="trk"><span class="fill" style="width:${Math.max(2, v)}%;background:var(--${tone})"></span></span><span class="v">${fmt(v, 0)}% <span class="muted">n${nn}</span></span></li>`;
  return `<section class="card"><div class="card-h"><h2>Alcohol and recovery</h2><span class="eyebrow">WHOOP journal</span></div>
    <ul class="hbars">${row('After alcohol', rY, yes.length, recTone(rY))}${row('No alcohol', rN, no.length, recTone(rN))}</ul>
    <div class="stats">${stat(`${rY - rN >= 0 ? '+' : '−'}${fmt(Math.abs(rY - rN), 0)}`, 'pts', 'recovery')}${stat(`${hY - hN >= 0 ? '+' : '−'}${fmt(Math.abs(hY - hN), 0)}`, 'ms', 'HRV')}${stat(`${sY - sN >= 0 ? '+' : '−'}${fmt(Math.abs(sY - sN), 0)}`, 'bpm', 'resting HR')}</div>
    <p class="xs muted">Average next-morning numbers when you logged alcohol the day before, against nights you didn't, across all imported days. ${last30} alcohol ${last30 === 1 ? 'night' : 'nights'} in the last 30 days.</p></section>`;
}
