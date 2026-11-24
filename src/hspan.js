/* ---------- Healthspan (v1.107): WHOOP's Healthspan screen, laid out and coloured from his screenshots (16 Nov 2026) ----------
   Body has a small card that opens the `healthspan` screen (a nav screen, back stack as the ring screens). The screen: title
   and "Next update in N days" in the header, a week navigator, the big orb (Orbit Age, years younger), Pace of Aging, then
   Sleep / Strain / Fitness cards of range bars (▼ 6M average, ▲ 30D, the 6M Age Impact on the right; an open row is darker
   with a tall filled bar, a verdict and View trend), milestones, and Trend View charts (Orbit Age vs your age, Pace).
   Scrolling the big orb away brings a fixed mini bar (#hsmini: years younger, mini orb, pace) over the header, as WHOOP's.
   Colours are raw samples off his Display P3 screenshots, so they're written as color(display-p3 …). Segment colours follow
   hsImpact at each segment's midpoint: orange (older) through brown and grey (neutral) to dark and bright green (younger).
   Bar ends read off WHOOP's screens: steps 0–16K, VO2 15–70, RHR 40–80, consistency 40–100%, sleep 5–8 h, zones 1–3
   0–10 h, zones 4–5 0–1 h, strength 0–8 h a week. */
const HS_FMT = { steps: [0, 'Steps'], rhr: [0, 'bpm'], sleep_consistency: [0, '%'], z13: ['hm', 'h'], z45: ['hm', 'h'], sleep_hours: ['hh', 'h'], strength: ['hm', 'h'], vo2: [0, 'ml/kg/min'] };
const HS_RANGE = { steps: [0, 16000], rhr: [40, 80], sleep_consistency: [40, 100], z13: [0, 600], z45: [0, 60], sleep_hours: [5, 8], strength: [0, 480], vo2: [15, 70] };
const HS_GROUPS = [['Sleep', ['sleep_consistency', 'sleep_hours']], ['Strain', ['z13', 'z45', 'strength', 'steps']], ['Fitness', ['vo2', 'rhr']]];
const HS_TITLE = { steps: 'Steps', rhr: 'RHR', sleep_consistency: 'Sleep consistency', z13: 'Time in HR zones 1-3 (weekly)', z45: 'Time in HR zones 4-5 (weekly)', sleep_hours: 'Hours of sleep', strength: 'Strength activity time (weekly)', vo2: 'VO₂ max' };
const HS_TREND = { steps: 'stp', rhr: 'rhr', sleep_consistency: 'sc', z13: 'z13', z45: 'z45', strength: 'lift' }; // Trends explorer ids
const HS_NOUN = { steps: 'daily Steps', rhr: 'Resting HR', sleep_consistency: 'Sleep Consistency', z13: 'weekly Time in HR Zones 1-3', z45: 'weekly Time in HR Zones 4-5', sleep_hours: 'Hours of Sleep', strength: 'weekly Strength Activity Time', vo2: 'VO2 max' };
// WHOOP's colours (raw P3 samples): orange, dark brown, neutral grey, dark green, bright green, open-row card
const HSP = { o: [.949, .671, .271], b: [.396, .322, .188], g: [.588, .588, .588], gd: [.173, .365, .282], gb: [.431, .929, .647], card: [.11, .118, .125] };
const p3 = (c, a) => `color(display-p3 ${c.map(v => v.toFixed(3)).join(' ')}${a != null ? ' / ' + a : ''})`;
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function hsCol(y) { // a segment's colour from its Age Impact (years; + is older)
  if (Math.abs(y) < 0.03) return HSP.g;
  const t = Math.pow(Math.min(1, Math.abs(y) / 0.45), 0.75);
  return y > 0 ? mix3(HSP.b, HSP.o, t) : mix3(HSP.gd, HSP.gb, t);
}
const hsYrsCol = y => { const r = Math.round(y * 10) / 10; return r > 0 ? p3(HSP.o) : r < 0 ? p3(HSP.gb) : '#fff'; };
function hsVal(m, x) { // value text, no unit
  if (x == null || !Number.isFinite(x)) return '–';
  const f = HS_FMT[m][0];
  return f === 'hm' ? hm(x) : f === 'hh' ? hm(x * 60) : fmt(x, f);
}
function hsEnd(m, x) { const f = HS_FMT[m][0]; return f === 'hm' ? (x % 60 ? hm(x) : x / 60) + 'h' : f === 'hh' ? x + 'h' : m === 'steps' ? (x ? x / 1000 + 'K' : '0K') : m === 'rhr' ? x + 'bpm' : m === 'sleep_consistency' ? x + '%' : '' + x; }
const hsSgn = x => { const r = Math.round(x * 10) / 10; return (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1); };
function hsBar(m, x6, x30, open) {
  const [lo, hi] = HS_RANGE[m], pos = x => x == null ? null : Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const cols = Array.from({ length: 10 }, (_, i) => hsCol(hsImpact(m, lo + (i + .5) / 10 * (hi - lo))));
  const seg = cols.map(c => `<i style="--t:${p3(c)};--f:${p3(mix3(HSP.card, c, .15))}"></i>`).join('');
  const p6 = pos(x6), p30 = pos(x30), u = HS_FMT[m][1];
  const at = p => `left:${p}%;transform:translateX(-${Math.max(0, Math.min(100, (p - 8) / 84 * 100)).toFixed(0)}%)`; // centred, kept inside at the ends
  const val = (x, cls, em) => `<span class="hsb-l ${cls}" style="${at(cls === 'l6' ? p6 : p30)}">${em && cls === 'l6' ? `<em>${em}</em>` : ''}<b>${hsVal(m, x)}${u ? `${u === '%' ? '' : ' '}<small>${u}</small>` : ''}</b>${em && cls === 'l30' ? `<em>${em}</em>` : ''}</span>`;
  const ends = `<div class="hsb-e"><span style="color:${p3(cols[0])}">${hsEnd(m, lo)}</span><span style="color:${p3(cols[9])}">${hsEnd(m, hi)}</span></div>`;
  return `<div class="hsb${open ? ' open' : ''}">
    <div class="hsb-top">${p6 != null ? val(x6, 'l6', open ? '6 Month avg.' : '') : ''}</div>
    <div class="hsb-t">${seg}${p6 != null ? `<span class="hsb-m dn" style="left:${p6}%"></span>` : ''}${p30 != null ? `<span class="hsb-m up" style="left:${p30}%"></span>` : ''}${open ? ends : ''}</div>
    ${open ? '' : ends}${open && p30 != null ? `<div class="hsb-bot">${val(x30, 'l30', '30 Day avg.')}</div>` : ''}</div>`;
}

/* The orb (v1.106, reworked v1.107 to WHOOP's): a canvas blob whose edge wobbles from a few slow sine harmonics; inside, a
   radial ramp from black (centre to ~45%) to the body green, a thin bright rim line and a soft dark drop shadow. Motes: ~110
   are born near the centre and drift outward (slight spiral), growing and brightening, fading out at the rim; ~70 more
   orbit slowly in the rim band, a few as soft bokeh. Blooms in on first sight; a tap sends a ripple round the edge and a
   burst outward. One rAF loop draws every visible .hsorb-cv and idles (polls every 250 ms) when there's none. */
const HSO = { col: null, from: null, colAt: 0, seen: -1e9, kickAt: -9, spin: 0, rt: 0, last: 0, on: false, rim: null, out: null };
const hsoH = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
function hsoMotes() { let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647, rim = [], out = [];
  for (let i = 0; i < 70; i++) { const big = rnd() < .16;
    rim.push({ a: rnd() * 6.2832, f: .74 + rnd() * .25, w: (rnd() - .5) * .14, s: big ? 2.2 + rnd() * 2.4 : .7 + rnd() * 1.2, big, tw: 1 + rnd() * 2.4, ph: rnd() * 6.28, wob: rnd() * 6.28 }); }
  for (let i = 0; i < 110; i++) out.push({ D: 5 + rnd() * 7, ph: rnd(), f0: .02 + rnd() * .22, fe: .78 + rnd() * .22, w: (rnd() - .5) * .7, s: .6 + rnd() * 1.5, big: rnd() < .07, k: i * 7.31 + 3 });
  HSO.rim = rim; HSO.out = out;
}
function hsoCol(el) { // the tone colour as [r, g, b] 0..1 plus whether it's Display P3
  const pr = el.querySelector('.hsorb-p'), c = pr ? getComputedStyle(pr).color : 'rgb(128,136,154)';
  let m = /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c); if (m) return { v: [+m[1], +m[2], +m[3]], p3: true };
  m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c); return { v: m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [.5, .53, .6], p3: false };
}
function hsoR(th, t, k, w = 1) { // edge radius as a share of the base radius; w scales the wobble (pace of aging)
  return 1 + w * (.034 * Math.sin(2 * th + t * .31) + .024 * Math.sin(3 * th - t * .23 + 1) + .014 * Math.sin(5 * th + t * .47 + 2)) + .012 * Math.sin(t * 1.25) + k * .05 * Math.sin(6 * th - t * 9);
}
function hsoPath(x, cx, cy, R, t, k, sc, w) { x.beginPath(); for (let i = 0; i <= 72; i++) { const th = i / 72 * 6.2832, r = R * sc * hsoR(th, t, k, w); i ? x.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r) : x.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); } x.closePath(); }
function hsoNow(now) { const p = Math.min(1, (now - HSO.colAt) / 700), q = p * p * (3 - 2 * p); return HSO.col.map((v, i) => HSO.from[i] + (v - HSO.from[i]) * q); }
function hsoDraw(cv, now, dt) {
  const box = cv.parentNode, css = box.clientWidth, pad = 1.4; if (!css) return;
  const dpr = Math.min(devicePixelRatio || 1, css > 200 ? 2 : 2.5), W = Math.round(css * pad * dpr), c = hsoCol(box);
  if (cv.width !== W || cv.dataset.cs !== (c.p3 ? 'p3' : 's')) { cv.width = cv.height = W; cv.dataset.cs = c.p3 ? 'p3' : 's'; cv._x = null; }
  const x = cv._x || (cv._x = cv.getContext('2d', c.p3 ? { colorSpace: 'display-p3' } : undefined));
  if (!HSO.col || HSO.col.join() !== c.v.join()) { HSO.from = HSO.col ? hsoNow(now) : c.v; HSO.col = c.v; HSO.colAt = now; }
  const rim = hsoNow(now), body = rim.map(v => v * .715), sp = c.p3 ? 'display-p3' : 'srgb';
  const col = (base, a, wt = 0) => `color(${sp} ${base.map(v => (v * (1 - wt) + wt).toFixed(3)).join(' ')} / ${a.toFixed(3)})`;
  const t = now / 1000, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!cv._born) cv._born = now - HSO.seen < 2500 ? -1e9 : now; // a re-render (week change) carries on without blooming again
  HSO.seen = now;
  const e = still ? 1 : Math.min(1, (now - cv._born) / 1400), bloom = 1 - Math.pow(1 - e, 3), ov = e < 1 ? Math.sin(e * Math.PI) * .05 : 0;
  const kick = still ? 0 : Math.max(0, 1 - (t - HSO.kickAt) / 1.6), k = kick * kick, u = dpr * css / 300;
  const cx = W / 2, cy = W / 2, R = W / pad / 2 * (.62 + .38 * bloom + ov);
  // v1.108: the slower the pace of aging the rounder the blob (0x near round, 1x the full wobble, up to 1.8x at 3x); eased so a week change morphs
  const pace = parseFloat(box.dataset.pace), goal = Number.isFinite(pace) ? Math.max(.12, Math.min(1.8, .2 + .8 * pace)) : 1;
  cv._w = cv._w == null ? goal : cv._w + (goal - cv._w) * Math.min(1, dt * 2.5); const wob = cv._w;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, W); x.globalAlpha = Math.min(1, e * 1.6);
  // soft dark drop shadow, as WHOOP's sits on the page
  x.save(); hsoPath(x, cx, cy, R, t, k, 1, wob); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = R * .14; x.shadowOffsetY = R * .05; x.fillStyle = '#000'; x.fill(); x.restore();
  x.save(); hsoPath(x, cx, cy, R, t, k, 1, wob); x.clip();
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.03);
  g.addColorStop(0, '#000'); for (let i = 0; i <= 24; i++) { const q = i / 24; g.addColorStop(.4 + .58 * q, col(body, q * q * (1.6 - .6 * q))); } g.addColorStop(1, col(body, 1)); // one smooth ramp (v1.108: the old piecewise stops showed as a ring)
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  if (!HSO.rim) hsoMotes();
  // motes born near the centre, drifting outward
  for (const m of HSO.out) {
    const q = HSO.rt / m.D + m.ph, cyc = Math.floor(q), p = q - cyc;
    const th = hsoH(m.k + cyc * 1.618) * 6.2832 + p * m.w, f = (m.f0 + (m.fe - m.f0) * (p * .6 + p * p * .4)) * (.3 + .7 * bloom), r = R * f * hsoR(th, t, k, wob);
    const fade = Math.min(1, p / .15, (1 - p) / .12), a = Math.max(0, fade) * (.2 + .8 * p) * (still ? .8 : 1), s = m.s * u * (.35 + .9 * p) * (m.big ? 2 : 1);
    const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r;
    if (m.big) { x.fillStyle = col(rim, a * .45, .35); x.beginPath(); x.arc(px, py, s, 0, 6.2832); x.fill(); }
    else { x.fillStyle = col(rim, a, .6); x.beginPath(); x.arc(px, py, s, 0, 6.2832); x.fill(); }
  }
  // residents of the rim band
  for (const m of HSO.rim) {
    const th = m.a + HSO.spin * m.w, f = (m.f + .015 * Math.sin(t * .6 + m.wob)) * (.3 + .7 * bloom), r = R * f * hsoR(th, t, k, wob);
    const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r, tw = .5 + .5 * Math.sin(t * m.tw + m.ph), s = m.s * u * (1 + .4 * k);
    if (m.big) { x.fillStyle = col(rim, (.3 + .25 * tw), .3); x.beginPath(); x.arc(px, py, s, 0, 6.2832); x.fill(); }
    else { x.fillStyle = col(rim, .55 + .45 * tw, .65); x.beginPath(); x.arc(px, py, s, 0, 6.2832); x.fill(); }
  }
  x.restore();
  // thin bright rim line
  x.save(); hsoPath(x, cx, cy, R, t, k, 1, wob); x.lineWidth = Math.max(1, 1.5 * u); x.strokeStyle = col(rim, .95, .08); x.shadowColor = col(rim, .6 + .4 * k); x.shadowBlur = (3 + 8 * k) * u; x.stroke(); x.restore();
  x.globalAlpha = 1;
}
function hsoLoop() {
  const cvs = document.hidden ? [] : [...document.querySelectorAll('.hsorb-cv')];
  if (!cvs.length) { HSO.last = 0; setTimeout(hsoLoop, 250); return; }
  const now = performance.now(), t = now / 1000, dt = Math.min(.05, HSO.last ? t - HSO.last : 0), k = Math.max(0, 1 - (t - HSO.kickAt) / 1.6) ** 2;
  HSO.last = t; HSO.spin += dt * (1 + 6 * k); HSO.rt += dt * (1 + 5 * k);
  const miniOn = document.documentElement.classList.contains('hsmini-on');
  for (const cv of cvs) {
    if (!cv._tap) { cv._tap = 1; cv.parentNode.addEventListener('pointerdown', () => { HSO.kickAt = performance.now() / 1000; }); }
    if (cv.closest('#hsmini') && !miniOn) continue;
    const b = cv.getBoundingClientRect(); if (b.bottom > -50 && b.top < innerHeight + 50) hsoDraw(cv, now, dt);
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setTimeout(hsoLoop, 600); return; }
  requestAnimationFrame(hsoLoop);
}
if (typeof window !== 'undefined' && !HSO.on) { HSO.on = true; setTimeout(hsoLoop, 0); }
const hsOrb = (cls, tone, inner, aria = '', pace) => `<div class="hsorb ${cls} hs-o-${tone}"${pace != null ? ` data-pace="${pace}"` : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}><canvas class="hsorb-cv" data-keep aria-hidden="true"></canvas><i class="hsorb-p"></i><div class="hsorb-c">${inner}</div></div>`;

/* One week's numbers, shared by the card, the screen and the mini bar */
function hsWeek(off) {
  const h = healthspan(); if (!h.cur) return null;
  const n = h.weeks.length, o = Math.min(Math.max(off || 0, 0), n - 1), w = h.weeks[n - 1 - o];
  const dob = S().dob, ageAt = dob ? diffDays(dob, w.W) / 365.2425 : null, rawAge = ageAt != null ? ageAt + w.total : null; // Orbit Age: your age plus the 6M impacts; WHOOP floors it at 18
  const age = rawAge == null ? null : rawAge < 18 ? '&lt;18.0' : fmt(Math.round(rawAge * 10) / 10, 1).replace(/^(\d+)$/, '$1.0');
  const tone = w.yrs > 0 ? 'good' : w.yrs < 0 ? 'warn' : 'n';
  const yrsTxt = w.yrs ? String(Math.abs(w.yrs)) : '0', yrsLab = w.yrs < 0 ? 'years older' : 'years younger';
  return { h, n, o, w, prev: h.weeks[n - 2 - o], age, tone, yrsTxt, yrsLab, yCol: w.yrs > 0 ? p3(HSP.gb) : w.yrs < 0 ? p3(HSP.o) : '#fff', pace: fmt(w.pace, 1).replace(/^(-?\d+)$/, '$1.0') + 'x' };
}
function hsVo2In() { const v2 = hsVo2(), lastV = v2[v2.length - 1];
  return `<div class="hsvo2"><span class="small">VO2 max this week${lastV ? `<span class="xs muted">Last ${fmt(lastV.v, 1)} · ${esc(fmtD(lastV.d))}</span>` : ''}</span><input class="in" type="number" inputmode="decimal" step="0.1" min="20" max="90" id="vo2in" aria-label="VO2 max this week" ><button class="btn sm" data-act="vo2add">Save</button></div>`; }

/* Body card: a summary that opens the screen */
function healthspanCard() {
  const k = hsWeek(0);
  if (!k) return `<section class="card"><div class="card-h"><h2>Healthspan</h2><span class="eyebrow">calibrating</span></div><p class="small dim">Needs 21 WHOOP recoveries in the last 31 days.</p>${hsVo2In()}</section>`;
  return `<section class="card hscard" data-act="nav" data-s="healthspan" role="button" aria-label="Open Healthspan"><div class="card-h"><h2>Healthspan${tChev}</h2></div>
    <div class="hshero"><div class="hsst"><b style="color:${k.yCol}">${k.yrsTxt}</b><span>${k.yrsLab}</span></div>
      ${hsOrb('sm', k.tone, k.age != null ? `<b>${k.age}</b><span>Orbit Age</span>` : `<b>${k.yrsTxt}</b><span>${k.yrsLab}</span>`, '', k.w.pace)}
      <div class="hsst"><b>${k.pace}</b><span>Pace of Aging</span></div></div></section>`;
}

/* The screen */
/* WHOOP line chart: grid, y labels left, months under, hollow end marker with a tag. Interactive (v1.108): press or drag
   (hover with a mouse) to read any week; the end tags give way to a line, markers and tags at that week, with its dates on
   top. Tags are kept inside the plot so they never sit on the month labels, and two tags never overlap. */
const HST = { Wd: 360, H: 214, L: 44, R: 10, T: 26, B: 34 };
function hstGeo(n, lo, hi) { const { Wd, H, L, R, T, B } = HST, xs = Math.max(1, n - 1);
  return { X: i => L + 10 + (Wd - L - R - 20) * i / xs, Y: v => T + (H - T - B) * (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) }; }
function hstTags(items) { // items: [{x, y, txt, col}] → markers and tags, placed above the point unless there's no room, inside the plot, apart
  const { Wd, H, L, T, B } = HST, lo = T - 22, hi = H - B - 26;
  const tags = items.map(o => { const tw = String(o.txt).replace(/&lt;/g, '<').length * 8 + 12; let ty = o.y - 34; if (ty < lo) ty = o.y + 12; ty = Math.max(lo, Math.min(hi, ty));
    return { ...o, tw, tx: Math.max(L, Math.min(Wd - tw - 1, o.x - tw / 2)), ty }; }).sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < tags.length; i++) { const p = tags[i - 1], q = tags[i]; if (q.ty < p.ty + 25 && q.tx < p.tx + p.tw && p.tx < q.tx + q.tw) { q.ty = p.ty + 25; if (q.ty > hi) { q.ty = hi; p.ty = Math.max(lo, q.ty - 25); } } }
  return tags.map(t => `<circle cx="${t.x.toFixed(1)}" cy="${t.y.toFixed(1)}" r="5.5" fill="var(--hs-card)" stroke="${t.col}" stroke-width="2.5"/>`).join('')
    + tags.map(t => `<rect x="${t.tx.toFixed(1)}" y="${t.ty.toFixed(1)}" width="${t.tw}" height="22" rx="4" fill="#111417"/><text x="${(t.tx + t.tw / 2).toFixed(1)}" y="${(t.ty + 16).toFixed(1)}" text-anchor="middle" class="hst-t" fill="${t.col}">${t.txt}</text>`).join('');
}
function hsTrendSVG(series, yt, yf, ref, months, dates) {
  const { Wd, H, L, R, B } = HST, n = series[0].pts.length, lo = yt[0], hi = yt[yt.length - 1], { X, Y } = hstGeo(n, lo, hi);
  let s = yt.map(v => `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" class="hst-g"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="hst-y${v === ref ? ' on' : ''}">${yf(v)}</text>`).join('');
  if (ref != null) s += `<line x1="${X(0) - 6}" x2="${X(n - 1)}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
  s += months.map(([i, m]) => `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="hst-x">${m}</text>`).join('');
  const ends = [];
  for (const se of series) {
    const p = se.pts.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean); if (!p.length) continue;
    s += `<path d="M${p.map(q => q.map(z => z.toFixed(1)).join(' ')).join('L')}" fill="none" stroke="${se.col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = se.pts.length - 1; ends.push({ x: X(li), y: Y(se.pts[li]), txt: se.labs[li], col: se.col });
  }
  const data = { lo, hi, s: series.map(se => ({ p: se.pts, l: se.labs, c: se.col })), d: dates };
  return `<svg class="hst" viewBox="0 0 ${Wd} ${H}" role="img" data-h="${esc(JSON.stringify(data))}">${s}<g class="hst-end">${hstTags(ends)}</g><g class="hst-hov"></g><rect class="hst-hit" x="${L}" y="0" width="${Wd - L}" height="${H - B}" fill="transparent"/></svg>`;
}
function hstShow(svg, cx) { // cx: pointer x in client px
  let d; try { d = svg._d || (svg._d = JSON.parse(svg.dataset.h)); } catch (e) { return; }
  const r = svg.getBoundingClientRect(), vx = (cx - r.left) * HST.Wd / r.width, n = d.s[0].p.length, { X, Y } = hstGeo(n, d.lo, d.hi);
  const i = Math.max(0, Math.min(n - 1, Math.round((vx - X(0)) / ((X(n - 1) - X(0)) / Math.max(1, n - 1)))));
  if (svg._i === i) return; svg._i = i;
  const x = X(i), items = d.s.filter(se => se.p[i] != null).map(se => ({ x, y: Y(se.p[i]), txt: se.l[i], col: se.c }));
  const lab = d.d[i] || '', lw = lab.length * 7 + 14, lx = Math.max(HST.L, Math.min(HST.Wd - lw - 1, x - lw / 2));
  svg.querySelector('.hst-hov').innerHTML = `<line x1="${x}" x2="${x}" y1="${HST.T - 4}" y2="${HST.H - HST.B}" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><text x="${(lx + lw / 2).toFixed(1)}" y="12" text-anchor="middle" class="hst-d">${esc(lab)}</text>` + hstTags(items);
  svg.classList.add('hov');
}
function hstHide(svg) { if (!svg || !svg.classList.contains('hov')) return; svg.classList.remove('hov'); svg.querySelector('.hst-hov').innerHTML = ''; svg._i = null; }
if (typeof document !== 'undefined') {
  const on = ev => { const svg = ev.target.closest?.('.hst'); if (svg) hstShow(svg, ev.clientX); };
  document.addEventListener('pointerdown', ev => { document.querySelectorAll('.hst.hov').forEach(s => { if (!s.contains(ev.target)) hstHide(s); }); on(ev); });
  document.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse' || ev.buttons) on(ev); else if (ev.target.closest?.('.hst')) on(ev); });
  document.addEventListener('pointerout', ev => { if (ev.pointerType === 'mouse') { const svg = ev.target.closest?.('.hst'); if (svg && !svg.contains(ev.relatedTarget)) hstHide(svg); } });
  for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, ev => { if (ev.pointerType !== 'mouse') document.querySelectorAll('.hst.hov').forEach(hstHide); });
  document.addEventListener('scroll', () => document.querySelectorAll('.hst.hov').forEach(hstHide), { capture: true, passive: true });
}
function hsTrends(k) {
  const ws = k.h.weeks.slice(Math.max(0, k.n - k.o - 26), k.n - k.o), dob = S().dob;
  if (ws.length < 2) return '';
  const months = []; ws.forEach((w, i) => { const m = fmtDate(w.W).split(' ')[1]; if (!months.length || months[months.length - 1][1] !== m) months.push([i, m]); });
  const mo = months.filter(([i]) => i > 0 || months.length < 7), dl = ws.map(w => `${hsWk(w.W)} - ${hsWk(addDays(w.W, 6))}`);
  let h = '<h2 class="hsx-gh">Trend View</h2>';
  if (dob) {
    const chron = ws.map(w => diffDays(dob, w.W) / 365.2425), age = ws.map((w, i) => Math.max(18, chron[i] + w.total));
    const all = [...chron, ...age], lo = Math.floor(Math.min(...all)) - 1, step = Math.max(1, Math.ceil((Math.ceil(Math.max(...all)) + 2 - lo) / 4)), yt = [0, 1, 2, 3, 4].map(i => lo + i * step);
    h += `<section class="hsx-card hsx-tc"><div class="hsx-th"><span class="hsx-lab">Orbit Age trend</span></div>
      <div class="hst-leg"><span><i class="sw grad"></i>Your Orbit Age</span><span><i class="sw"></i>Chronological age</span></div>
      ${hsTrendSVG([{ pts: chron, col: '#fff', labs: chron.map(v => fmt(v, 1).replace(/^(\d+)$/, '$1.0')) }, { pts: age, col: p3(HSP.gb), labs: ws.map((w, i) => chron[i] + w.total < 18 ? '&lt;18.0' : fmt(age[i], 1).replace(/^(\d+)$/, '$1.0')) }], yt, v => v.toFixed(1), null, mo, dl)}</section>`;
  }
  const pace = ws.map(w => w.pace);
  h += `<section class="hsx-card hsx-tc"><div class="hsx-th"><span class="hsx-lab">Pace of Aging trend</span></div>
    ${hsTrendSVG([{ pts: pace, col: 'var(--wc-rec)', labs: pace.map(v => fmt(v, 1).replace(/^(-?\d+)$/, '$1.0') + 'x') }], [-1, 0, 1, 2, 3], v => v.toFixed(1) + 'x', 1, mo, dl)}</section>`;
  return h;
}
function vHealthspan() {
  const k = hsWeek(ui.hsOff);
  if (!k) return `<section class="card"><div class="card-h"><h2>Healthspan</h2><span class="eyebrow">calibrating</span></div><p class="small dim">Needs 21 WHOOP recoveries in the last 31 days.</p>${hsVo2In()}</section>`;
  const { w, n, o } = k, flags = hsFlags(w.x6), open = ui.hsOpen || (ui.hsOpen = new Set());
  const v2 = hsVo2(), lastV = v2[v2.length - 1], stale = !lastV || lastV.d < addDays(today(), -6), dob = S().dob;
  const pp = Math.max(0, Math.min(100, (w.pace + 1) / 4 * 100));
  const ticks = Array.from({ length: 41 }, (_, i) => `<i${i % 10 === 0 ? ' class="maj"' : ''}></i>`).join('');
  const row = m => {
    const x6 = w.x6[m], x30 = w.x30[m], i6 = w.i6[m], isOpen = open.has(m);
    const verdict = w.d[m] < -0.3 ? 'Huge improvement' : i6 < -0.1 ? 'Outperforming' : i6 > 0.1 ? (w.d[m] < -0.05 ? 'Improving' : 'Underperforming') : 'Meeting recommendation';
    const drift = Math.abs(w.d[m]) < 0.05 ? 'Your 30-day average is holding steady.' : w.d[m] < 0 ? 'Your 30-day average is pulling this younger.' : 'Your 30-day average is pulling this older.';
    const lead = i6 < -0.1 ? `You're boosting your long-term health with your ${HS_NOUN[m]}.` : i6 > 0.1 ? `Your ${HS_NOUN[m]} is adding years.` : `Your ${HS_NOUN[m]} is close to neutral.`;
    const body = isOpen ? `<div class="hsr-x"><b>${verdict}</b><p>${lead} ${drift}</p>
      ${HS_TREND[m] ? `<button class="hs-vt" data-act="hstrend" data-m="${HS_TREND[m]}">View trend <svg viewBox="0 0 22 14" aria-hidden="true"><path d="M1 7h19M14 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ''}${m === 'vo2' ? hsVo2In() : ''}</div>` : '';
    return `<div class="hsr${isOpen ? ' open' : ''}"><button class="hsr-h" data-act="hsrow" data-m="${m}" aria-expanded="${isOpen}"><span>${esc(HS_TITLE[m])}${flags.includes(m) ? ' <small>· outside fit</small>' : ''}${m === 'vo2' && stale && !isOpen ? ` <small style="color:${p3(HSP.o)}">· add this week</small>` : ''}</span><span class="hs-chev">${ICON.down}</span></button>
      <div class="hsr-b">${hsBar(m, x6, x30, isOpen)}<div class="hsr-y"><b style="color:${hsYrsCol(i6)}">${hsSgn(i6)}</b><small>years</small></div></div>${body}</div>`;
  };
  const miles = k.h.miles;
  return `<div class="hsx">
    <div class="hsnav"><button class="iconbtn" data-act="hsweek" data-d="1" aria-label="Previous week" ${o >= n - 1 ? 'disabled' : ''}>${HS_CHEV(1)}</button><button class="hsnav-d" data-act="hsnow" aria-label="Back to this week"${o ? '' : ' disabled'}><b>${esc(hsWk(w.W))} - ${esc(hsWk(addDays(w.W, 6)))}</b></button><button class="iconbtn" data-act="hsweek" data-d="-1" aria-label="Next week" ${o ? '' : 'disabled'}>${HS_CHEV(0)}</button><button class="hs-i" data-act="winfo" data-k="hs" aria-label="About Healthspan">i</button></div>
    <div class="hsx-orbw">${hsOrb('big', k.tone, k.age != null ? `<b>${k.age}</b><span>Orbit Age</span><em style="color:${k.yCol}">${k.yrsTxt} ${k.yrsLab}</em>` : `<b>${k.yrsTxt}</b><span>${k.yrsLab}</span>`, k.age != null ? 'Orbit Age ' + k.age.replace('&lt;', 'under ') : '', k.w.pace)}</div>
    ${dob ? '' : `<div class="hsvo2 hsx-dob"><span class="small">Birth date<span class="xs muted">Shows your Orbit Age</span></span><input class="in hsdob" type="text" id="dobin" placeholder="d/m/yy" autocomplete="bday" aria-label="Birth date, day/month/year"><button class="btn sm" data-act="hsdob">Save</button></div>`}
    <section class="hspace"><span class="hsx-lab">Pace of Aging</span>
      <div class="hspace-v"><span><i class="hs-slow"></i>Slow</span><b style="left:${pp}%">${k.pace}</b><span>Fast<svg class="hs-fast" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2c4 0 7 2 7.6 5.5.6 3.6-1.4 7.6-4.6 9.4-2.6 1.4-5.8.6-7.6-1.6C3.4 13 2 10 3 7 4 4 6.6 2 10 2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 3.4c-1.5 3-1.6 6-.4 9.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></span></div>
      <div class="hspace-s">${ticks}<span class="hspace-m" style="left:${pp}%"></span></div>
      <div class="hspace-l"><span>-1.0x</span><span>1.0x</span><span>3.0x</span></div></section>
    ${HS_GROUPS.map(([g, ms]) => `<div class="hsg"><div class="hsg-h"><h2 class="hsx-gh">${g}</h2><span class="hsg-k"><i class="tri dn"></i>6 Month avg.<span class="hsg-sep"></span><i class="tri up"></i>30 Day avg.</span></div><section class="hsx-card">${ms.map(row).join('')}</section></div>`).join('')}
    ${miles.length ? `<section class="hsx-ach">${hsOrb('ico', 'good', '')}<div><b>Milestones</b><span>${miles.length} Healthspan milestone${miles.length > 1 ? 's' : ''} earned</span><span class="hsx-mil">${miles.map(m => `${m.yrs} yrs · ${esc(fmtDMY(m.W))}`).join('<br>')}</span></div></section>` : ''}
    ${hsTrends(k)}
    ${dob ? `<button class="link dim hsx-dobc" data-act="hsdobclr">Change birth date</button>` : ''}</div>`;
}
const HS_CHEV = back => `<svg viewBox="0 0 12 20" width="11" height="18" aria-hidden="true"><path d="${back ? 'M9.5 2 2 10l7.5 8' : 'M2.5 2 10 10l-7.5 8'}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const hsWk = d => { const [y, m, dd] = d.split('-'); return ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'][+m - 1] + ' ' + +dd; };
INFO_TXT.hs = { t: 'What is Healthspan?', p: 'A copy of WHOOP\'s Healthspan, fitted to your WHOOP numbers (Pace within ±0.1 of the app in about 9 weeks of 10). It updates every Sunday.',
  l: [['Orbit Age:', 'your age plus each metric\'s 6-month Age Impact, shown as under 18 below 18, as WHOOP does.'], ['Pace of Aging:', 'how your 30-day averages are moving those impacts. 1.0x is ageing a year a year.'], ['Bars:', '▼ your 6-month average, ▲ your 30-day one. Green segments make you younger, orange older, grey is about neutral.']],
  n: ['VO2 comes from WHOOP\'s weekly estimate, so type it in each week (open VO₂ max).'] };
NAV_NAME.healthspan = 'Healthspan';
NAV_SCREENS.push('healthspan');
VIEWS.healthspan = vHealthspan;

/* Header title and the mini bar that takes over once the big orb scrolls away */
function hsNextUpd() { const n = (7 - new Date(toUTC(today())).getUTCDay()) % 7 || 7; return `Next update in ${n} day${n > 1 ? 's' : ''}`; }
function renderHsMini() {
  const on = ui.tab === 'healthspan', root = document.documentElement; root.classList.toggle('hs-scr', on);
  let el = $('#hsmini');
  if (!on) { if (el) el.hidden = true; root.classList.remove('hsmini-on'); $('#hday')?.classList.remove('two'); return; }
  const c = $('#hday'); if (c) { const t = `<span>Healthspan</span><small>${hsNextUpd()}</small>`; if (c.innerHTML !== t) c.innerHTML = t; c.hidden = false; c.classList.add('two'); }
  const k = hsWeek(ui.hsOff);
  if (!el) { el = document.createElement('div'); el.id = 'hsmini'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="hsm-s"><b></b><span></span></div>${hsOrb('mini', 'good', '<b></b><span>Orbit Age</span>')}<div class="hsm-s"><b></b><span>Pace of Aging</span></div>`; document.body.appendChild(el); }
  el.hidden = !k; if (!k) return;
  const [l, r] = el.querySelectorAll('.hsm-s'), orb = el.querySelector('.hsorb');
  l.querySelector('b').textContent = k.yrsTxt; l.querySelector('b').style.color = k.yCol; l.querySelector('span').textContent = k.yrsLab;
  r.querySelector('b').textContent = k.pace; orb.className = `hsorb mini hs-o-${k.tone}`; orb.dataset.pace = k.w.pace;
  orb.querySelector('.hsorb-c').innerHTML = k.age != null ? `<b>${k.age}</b><span>Orbit Age</span>` : `<b>${k.yrsTxt}</b><span>Years</span>`;
  hsMiniCheck();
}
function hsMiniCheck() {
  const root = document.documentElement; if (ui.tab !== 'healthspan') return;
  const big = $('.hsorb.big'), top = $('.top'); if (!big || !top) return;
  const on = big.getBoundingClientRect().bottom < top.getBoundingClientRect().bottom + 60;
  if (root.classList.contains('hsmini-on') !== on) root.classList.toggle('hsmini-on', on);
}
if (typeof document !== 'undefined') document.addEventListener('scroll', () => { if (ui.tab === 'healthspan') hsMiniCheck(); }, { capture: true, passive: true });
