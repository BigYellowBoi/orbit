/* ============================================================
   CHARTS — small hand-built SVG charts, one y-axis each, hover crosshair + tooltip
   cfg: { h, x0, x1, xTicks, xFmt, yMin, yMax, yFmt, series:[{color, pts:[{x,y}], line, dots, r, faint, w, label}],
          bars:[{x, v, color}], refY:{v, label}, tip(x)->html, hoverXs, empty }
   ============================================================ */
function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag; const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(6));
  return { lo, hi, t };
}
const CHART_REG = new Map(); let chartSeq = 0;
function chartHTML(cfg) { const id = 'ch' + (++chartSeq); CHART_REG.set(id, cfg); return `<div class="chart" id="${id}" style="height:${cfg.h || 180}px" role="img" aria-label="${esc(cfg.label || 'Chart')}"></div>`; }
function drawCharts(root = document) { root.querySelectorAll('.chart').forEach(el => { const c = CHART_REG.get(el.id); if (c) drawChart(el, c); }); }
function drawChart(el, cfg) {
  const W = Math.max(260, el.clientWidth || 340), H = cfg.h || 180;
  const m = { l: cfg.ml ?? 36, r: cfg.mr ?? 14, t: cfg.barLabel ? 22 : 10, b: 22 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ys = [];
  (cfg.series || []).forEach(s => s.pts.forEach(p => p.y != null && ys.push(p.y)));
  (cfg.bars || []).forEach(b => { ys.push(b.segs ? sum(b.segs.map(s => s.v || 0)) : b.v); if (b.lo != null) ys.push(b.lo); });
  (cfg.area || []).forEach(a => ys.push(a.lo, a.hi));
  if (cfg.refY) ys.push(cfg.refY.v);
  if (!ys.length || (cfg.series || []).every(s => !s.pts.length) && !(cfg.bars || []).length) { el.innerHTML = `<div class="chart-empty">${esc(cfg.empty || 'No data yet')}</div>`; return; }
  let lo = cfg.yMin ?? Math.min(...ys), hi = cfg.yMax ?? Math.max(...ys);
  if (cfg.yPad && cfg.yMin == null) lo -= cfg.yPad; if (cfg.yPad && cfg.yMax == null) hi += cfg.yPad;
  const nt = cfg.yTickVals ? { t: cfg.yTickVals, lo: Math.min(...cfg.yTickVals), hi: Math.max(...cfg.yTickVals) } : niceTicks(lo, hi, cfg.yTicks || 4); const y0 = cfg.yMin ?? nt.lo, y1 = cfg.yMax ?? nt.hi;
  const X = x => m.l + (cfg.x1 === cfg.x0 ? iw / 2 : (x - cfg.x0) / (cfg.x1 - cfg.x0) * iw);
  const Y = y => m.t + ih - (y - y0) / (y1 - y0 || 1) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  let yf = cfg.yFmt || (v => fmt(v, 1));
  if (new Set(nt.t.map(yf)).size < nt.t.length) { const st = nt.t.length > 1 ? Math.abs(nt.t[1] - nt.t[0]) : 1, d = Math.max(0, Math.min(3, -Math.floor(Math.log10(st) + 1e-9))); yf = v => fmt(v, d); } // close ticks would round to the same label: show the decimals
  for (const t of nt.t) if (t >= y0 - 1e-9 && t <= y1 + 1e-9) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${m.l - 6}" y="${Y(t) + 3.5}" class="ax" text-anchor="end">${esc(yf(t))}</text>`;
  for (const x of cfg.xTicks || []) s += `<text x="${X(x)}" y="${H - 5}" class="ax" text-anchor="middle">${esc(cfg.xFmt(x))}</text>`;
  if (cfg.area?.length) {
    let seg = [], prev = null; const segsA = [];
    for (const a of cfg.area) { if (prev != null && a.x - prev > (cfg.areaGap || 10)) { segsA.push(seg); seg = []; } seg.push(a); prev = a.x; }
    if (seg.length) segsA.push(seg);
    for (const sg of segsA) if (sg.length > 1) s += `<polygon points="${sg.map(a => `${X(a.x).toFixed(1)},${Y(a.hi).toFixed(1)}`).join(' ')} ${sg.slice().reverse().map(a => `${X(a.x).toFixed(1)},${Y(a.lo).toFixed(1)}`).join(' ')}" fill="var(--s1)" fill-opacity=".12" stroke="none"/>`;
  }
  if (cfg.bars) {
    const span = Math.max(1, cfg.x1 - cfg.x0 + 1), bw = Math.max(1.5, Math.min(cfg.barMax || 18, iw / span - 2));
    const base = Y(Math.max(y0, 0));
    for (const b of cfg.bars) {
      let top;
      if (b.segs) { let acc = 0; const segs = b.segs.filter(g => g.v > 0); segs.forEach((g, i) => { const y0p = Y(acc), y1p = Y(acc + g.v), x = X(b.x) - bw / 2; s += `<rect x="${x}" y="${y1p}" width="${bw}" height="${Math.max(0, y0p - y1p - (i < segs.length - 1 && bw > 3 ? 1.5 : 0))}" fill="${g.color}"/>`; acc += g.v; }); top = Y(acc); }
      else if (b.lo != null) { const x = X(b.x) - bw / 2, ya = Y(Math.max(b.v, b.lo)), yb = Y(Math.min(b.v, b.lo)); s += `<rect x="${x}" y="${ya}" width="${bw}" height="${Math.max(1, yb - ya)}" rx="${Math.min(4, bw / 2)}" fill="${b.color || 'var(--s1)'}"/>`; top = ya;
        if (cfg.barLabel) s += `<text x="${X(b.x)}" y="${yb + 13}" class="${cfg.lblCls || 'lbl'}" text-anchor="middle">${esc(cfg.barLabelLo(b))}</text>`; }
      else { const x = X(b.x) - bw / 2, yt = Y(b.v), h = Math.max(1, base - yt), r = Math.min(3, bw / 2, h); top = yt;
        s += `<path d="M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z" fill="${b.color || 'var(--s1)'}"/>`; }
      if (cfg.barLabel) s += `<text x="${X(b.x)}" y="${top - 6}" class="${cfg.lblCls || 'lbl'}" text-anchor="middle">${esc(cfg.barLabel(b))}</text>`;
    }
  }
  if (cfg.refY) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(cfg.refY.v)}" y2="${Y(cfg.refY.v)}" stroke="var(--ink-2)" stroke-dasharray="4 4" stroke-width="1"/>`;
  for (const se of cfg.series || []) {
    const pts = se.pts.filter(p => p.y != null);
    if (se.line !== false && pts.length > 1) {
      let d = '', prev = null; for (const p of pts) { d += (prev != null && (!se.gap || p.x - prev <= se.gap) ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1); prev = p.x; }
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.w || 2}" stroke-linejoin="round" stroke-linecap="round" ${se.faint ? 'stroke-opacity=".45"' : ''}/>`;
    }
    if (se.dots) for (const p of pts) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${se.r || 3}" fill="${se.color}" ${se.faint ? 'fill-opacity=".4"' : 'stroke="var(--surface)" stroke-width="2"'}/>`;
    if (se.labels) for (const p of pts) s += `<text x="${X(p.x)}" y="${Y(p.y) - 9}" class="lbl" text-anchor="middle">${esc(se.labels(p))}</text>`;
    if (se.end && pts.length) { const p = pts[pts.length - 1]; s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`; }
  }
  s += `<line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/><rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="ctip" hidden></div>`;
  el.innerHTML = s;
  if (!cfg.tip) return;
  const svg = el.querySelector('svg'), tip = el.querySelector('.ctip'), xh = el.querySelector('.xhair');
  const xs = (cfg.hoverXs || []).slice().sort((a, b) => a - b);
  const move = ev => {
    const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * (W / r.width);
    const xv = cfg.x0 + (px - m.l) / iw * (cfg.x1 - cfg.x0);
    let best = null, bd = 1e9; for (const x of xs) { const d = Math.abs(x - xv); if (d < bd) { bd = d; best = x; } }
    if (best == null) return; const html = cfg.tip(best); if (!html) return;
    xh.setAttribute('x1', X(best)); xh.setAttribute('x2', X(best)); xh.setAttribute('visibility', 'visible');
    tip.innerHTML = html; tip.hidden = false;
    const tx = X(best) * (r.width / W), tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(r.width - tw, tx - tw / 2)) + 'px';
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
}
let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => drawCharts(), 150); });
function monYr(s) { return `${new Date(toUTC(s)).toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' })} ’${s.slice(2, 4)}`; } // Oct ’25
function dateAxis(from, to) { // x = day index from `from`
  const n = diffDays(from, to); const k = n <= 14 ? 3 : n <= 45 ? 7 : n <= 120 ? 21 : n <= 200 ? 60 : n <= 400 ? 91 : 120; const ticks = [];
  for (let i = n; i >= 0; i -= k) ticks.unshift(i);
  if (ticks.length > 1 && ticks[1] - ticks[0] < k * 0.6) ticks.shift();
  return { x0: 0, x1: Math.max(1, n), xTicks: ticks, xFmt: i => n > 120 ? monYr(addDays(from, i)) : fmtDate(addDays(from, i)) }; // long ranges label month and year, so going back a year stays readable
}
