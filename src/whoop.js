/* ============================================================
   TODAY REDESIGN (v1.81): WHOOP-style rings and tiles on Today, the Health monitor, the Sleep, Recovery, Strain and
   Activity detail screens, the Trend screen, the alcohol check, and one back stack with scroll restore (ui.nav).
   Design reference: the "Orbit Today" Claude Design canvas. Numbers are real day fields (STATE.d).
   ============================================================ */
const WC = { rec: 'var(--wc-rec)', green: 'var(--wc-green)', red: 'var(--wc-red)', sleep: 'var(--wc-sleep)', strain: 'var(--wc-strain)', yellow: 'var(--wc-yellow)', track: '#373d42', up: 'var(--wc-up)', dn: 'var(--wc-dn)', lt: 'var(--wc-lt)', deep: 'var(--wc-deep)', rem: 'var(--wc-rem)', aw: '#c8c8c8',
  z: [1, 2, 3, 4, 5].map(i => `var(--wc-z${i})`), hm: '#5a6168', debt: '#d9dcde', grid: '#222830', dim: '#80889a', ink: '#e8ebef', card: '#111418' };
const WP = { // line icons (24px grid)
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', cons: 'M14 3.5a8.5 8.5 0 1 0 6.5 13.5M17 3.5a8.5 8.5 0 0 1 4 7', eff: 'M4 20v-6M8 20V9M12 20V5M16 20v-8M20 20v-4',
  hrv: 'M3 12h4l2-4 3 8 2-4h7', heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', lungs: 'M12 4v7M12 11c-1.5 0-2.5-2-4.5-2S4 12 4 15.5 5 20 7 20s4-2 5-4.5M12 11c1.5 0 2.5-2 4.5-2s3.5 3 3.5 6.5S19 20 17 20s-4-2-5-4.5',
  lift: 'M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12', shoe: 'M3 17h18v2.5H3zM4 17l2.5-9 4.5 3 4-1 5.5 7', stairs: 'M4 20h4v-4h4v-4h4V8h4', walk: 'M13 4.5a1.5 1.5 0 1 0 0 .01M10 21l2-6 3 3v3M9 12l3-4 3 2 3 1M12 8l-1 5',
  pulse: 'M3 12h4l2-5 4 10 2-5h6', glass: 'M7 3h10l-1 7a4 4 0 0 1-8 0L7 3zM12 14v6M8.5 20h7', tick: 'M5 12.5l4.5 4.5L19 7.5', excl: 'M12 6v8M12 17.6v.4', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5' };
const wIco = (k, cls = '', sw = 1.7) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${WP[k]}"/></svg>`;
const wMoon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + WP.moon + '"/></svg>';
const CHEV6 = '<svg class="chev6" viewBox="0 0 6 10" fill="none" stroke="#8e9293" stroke-width="1.8" aria-hidden="true"><path d="M1 1l4 4-4 4"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
const wArr = (up, good) => `<svg class="warr" viewBox="0 0 10 9" aria-hidden="true"><path d="${up ? 'M1 7l4-5 4 5z' : 'M1 2l4 5 4-5z'}" fill="${good ? WC.up : WC.dn}"/></svg>`;
const wDay = () => ui.np?.d || addDays(today(), ui.dayOff || 0);
const wSrc = d => `<span class="wsrc">WHOOP · ${d === today() ? 'today' : esc(fmtDow(d) + ' ' + fmtDate(d))}</span>`;
const wHM = m => m == null ? '–' : hm(m); // 7:24
function wSpan(on, off) { // "11:21 pm – 8:01 am", or "12:27 – 8:15 am" when both share am/pm
  const a = clockMin(on), b = clockMin(off); if (a == null || b == null) return '';
  const A = clockOf(a), B = clockOf(b); return A.slice(-2) === B.slice(-2) ? `${A.slice(0, -3)} – ${B}` : `${A} – ${B}`;
}
const recCol = r => r == null ? WC.track : r >= 67 ? WC.green : r >= 34 ? WC.yellow : WC.red; // sampled off his WHOOP Recovery trend (v1.100)
const sleepBand = v => v == null ? -1 : v >= 85 ? 2 : v >= 70 ? 1 : 0; // WHOOP's sleep thresholds, as an approximation
function wSeg3(v, row) { const b = sleepBand(v), c = [WC.dn, '#8e9293', WC.up]; return `<span class="wseg3${row ? ' row' : ''}" aria-hidden="true">${[0, 1, 2].map(i => `<i${i === b ? ` style="background:${c[i]}"` : ''}></i>`).join('')}</span>`; }

/* A ring's value arc as a filled band with slightly rounded corners, as WHOOP's and the widget's band() (corner = 18% of the stroke).
   SVG coordinates before the ring's rotate(-90deg): angle 0 is +x, clockwise. */
function wBand(k, r, sw, f, col) {
  f = Math.max(0, Math.min(1, f || 0)); if (f < 1e-4) return '';
  const ro = r + sw / 2, ri = r - sw / 2, a1 = Math.min(f, 0.99999) * 2 * Math.PI, rc = Math.min(sw * 0.18, sw / 2, f * Math.PI * ri), dO = rc / ro, dI = rc / ri;
  const Q = (rr, a) => (k + rr * Math.cos(a)).toFixed(2) + ' ' + (k + rr * Math.sin(a)).toFixed(2), big = a1 - 2 * dO > Math.PI ? 1 : 0, bigI = a1 - 2 * dI > Math.PI ? 1 : 0;
  const d = `M${Q(ro, dO)}A${ro} ${ro} 0 ${big} 1 ${Q(ro, a1 - dO)}Q${Q(ro, a1)} ${Q(ro - rc, a1)}L${Q(ri + rc, a1)}Q${Q(ri, a1)} ${Q(ri, a1 - dI)}A${ri} ${ri} 0 ${bigI} 0 ${Q(ri, dI)}Q${Q(ri, 0)} ${Q(ri + rc, 0)}L${Q(ro - rc, 0)}Q${Q(ro, 0)} ${Q(ro, dO)}Z`;
  return `<path class="wv" data-f="${f.toFixed(4)}" d="${d}" fill="${col}"/>`;
}
/* A ring: full-circle track, value from 12 o'clock clockwise with WHOOP's rounded corners. */
function wRing(f, col, size, sw, inner, label) {
  const r = (size - sw) / 2, k = size / 2;
  return `<span class="wr${size > 100 ? ' big' : ''}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}"><circle cx="${k}" cy="${k}" r="${r}" fill="none" stroke="${WC.track}" stroke-width="${sw}"/>${wBand(k, r, sw, f, col)}</svg><b>${inner}</b></span>`;
}
const pctIn = v => v == null ? '<span class="nil">–</span>' : `<span>${fmt(v, 0)}<small>%</small></span>`;
const strIn = v => v == null ? '<span class="nil">–</span>' : `<span>${fmtS(v)}</span>`;

/* ---------- Today: rings, tiles, alcohol ---------- */
function todayTop(d) {
  const x = STATE.d[d] || {}, rc = recCol(x.rec);
  const ring = (s, f, col, inner, label, aria) => `<button class="wring" data-act="nav" data-s="${s}" data-d="${d}" data-live="ring-${s}" aria-label="${esc(aria)}">${wRing(f, col, 88, 6, inner, aria)}<span class="wlab">${label}${CHEV6}</span></button>`;
  let h = `<div class="wrings">${ring('sleep', x.sp / 100, WC.sleep, pctIn(x.sp), 'Sleep', `Sleep ${x.sp == null ? 'no data' : fmt(x.sp, 0) + '%'}`)}${ring('recovery', x.rec / 100, rc, pctIn(x.rec), 'Recovery', `Recovery ${x.rec == null ? 'no data' : fmt(x.rec, 0) + '%'}`)}${ring('strain', x.str / 21, WC.strain, strIn(x.str), 'Strain', `Strain ${x.str == null ? 'no data' : fmtS(x.str)} of 21`)}</div>`;
  const ir = inRangeCount(d), out = ir.of - ir.n;
  const hmT = !ir.of ? `<span class="wico nil">${wIco('pulse', '', 2)}</span><span class="wtile-t"><b class="st nil">No range yet</b><span>Needs 14 nights</span></span>`
    : `<span class="wico ${out ? 'warn' : 'ok'}">${wIco(out ? 'excl' : 'tick', '', 2.6)}</span><span class="wtile-t"><b class="st${out ? ' warn' : ''}">${out ? `${out} out of range` : 'Within range'}</b><span class="wnum" style="font-family:var(--f-body)">${ir.n}/${ir.of} Metrics</span></span>`;
  const sl = x.slp != null ? `<span class="wico moon">${wMoon}</span><span class="wtile-t"><b class="wnum">${wHM(x.slp)} asleep</b><span class="tm">${esc(wSpan(x.on, x.off))}</span></span>`
    : `<span class="wico nil">${wMoon}</span><span class="wtile-t"><b class="st nil">No sleep yet</b><span class="tm">&nbsp;</span></span>`;
  h += `<div class="wtiles"><button class="wtile" data-act="nav" data-s="health" data-d="${d}" data-live="hm"><span class="wlab">Health monitor<span aria-hidden="true">›</span></span><span class="wtile-b">${hmT}</span></button>
    <button class="wtile" data-act="nav" data-s="sleep" data-d="${d}" data-live="lastnight"><span class="wlab">Last night<span aria-hidden="true">›</span></span><span class="wtile-b">${sl}</span></button></div>`;
  return h;
}
const nightOf = d => addDays(d, -1);
function alcAsk(d, sel) { // the question, or the same buttons in place when changing an answer
  const v = STATE.d[d]?.alc;
  return `<section class="alc" data-alc="${d}"><span class="alc-h">${wIco('glass')}<b>${sel ? '<span class="wlab">Alcohol</span>' : 'Alcohol last night?'}</b><span class="wlab">${esc(fmtDow(nightOf(d)) + ' ' + fmtDate(nightOf(d)))}</span></span>
    <div class="alc-b" role="group" aria-label="Alcohol on ${esc(fmtDow(nightOf(d)) + ' ' + fmtDate(nightOf(d)))}"><button class="${sel && v === false ? 'on' : ''}" data-act="alc" data-d="${d}" data-v="0" aria-pressed="${v === false}">No</button><button class="${sel && v === true ? 'on' : ''}" data-act="alc" data-d="${d}" data-v="1" aria-pressed="${v === true}">Yes</button></div></section>`;
}
function alcRow(d) { // the answer, with Change (Sleep detail; past days on Today)
  const v = STATE.d[d]?.alc;
  if (v == null || ui.alcEdit === d) return alcAsk(d, v != null);
  return `<button class="alcrow" data-act="alcedit" data-d="${d}">${wIco('glass')}<span class="wlab">Alcohol</span><b>${v ? 'Yes' : 'No'}</b><em>Change</em></button>`;
}
function alcToday(d) { return d === today() ? (alcDue(d) || ui.alcEdit === d ? alcAsk(d, ui.alcEdit === d) : '') : alcRow(d); }

/* ---------- Recovery card (v1.81: no ring; HRV, Resting HR and Sleep in three columns, then three tiles) ---------- */
function whoopCard(day) {
  const t = day || today(), isT = t === today(), x = STATE.d[t];
  if (!x || (x.rec == null && x.slp == null)) return '';
  const tone = recTone(x.rec), hb = hrvBand(t), base = k => avgOver(k, t, 30, true)?.avg;
  let note = '';
  if (hb && hb.state === 'below' && tone !== 'bad') note = `<p class="note">Your 7-day HRV is below your normal range (${fmt(hb.lo, 0)}–${fmt(hb.hi, 0)} ms). A sustained drop often reflects accumulated fatigue, poor sleep or illness, so it's worth watching over the next few days.</p>`;
  if (tone === 'bad') note = `<p class="note">Red recovery. The rotation stays the same; a lighter day is reasonable, such as stopping sets 2–3 reps short and keeping the ${esc(S().cardio.name.toLowerCase())} easy. Treat the score as a guide, not a rule.</p>`;
  const val = (v, unit) => v == null ? '<b class="wnum nil">–</b>' : `<b class="wnum">${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b>`;
  const sub = (txt, tn) => `<em${tn ? ` class="tn-${tn}"` : ''}>${txt || '&nbsp;'}</em>`;
  const vs = (v, b, d, lowerBetter) => { if (v == null || b == null) return sub(''); const diff = v - b; if (Math.abs(diff) < 10 ** -d / 2) return sub('Same as 30-day');
    return sub(`${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), d)} vs 30-day`, (lowerBetter ? diff < 0 : diff > 0) ? 'good' : 'warn'); };
  const col = (label, v, s) => `<div data-live="${esc(label)}"><span>${esc(label)}</span>${v}${s}</div>`;
  const hbTone = hb ? { below: 'warn', within: 'good', above: '' }[hb.state] : '';
  const tile = (label, v) => `<div data-live="${esc(label)}"><span class="wlab">${esc(label)}</span>${v}</div>`;
  const stT = stepsOf(t);
  return `<section class="card rcard"><div class="card-h"><h2>Recovery</h2>${x.rec != null ? pill(tone, recWord(x.rec)) : ''}</div>
    <div class="rc3">${col('HRV', val(x.hrv != null ? fmt(x.hrv, 0) : null, 'ms'), hb ? sub(`7-day ${HRV_STATE[hb.state][1].toLowerCase()}`, hbTone) : sub(''))}${col('Resting HR', val(x.rhr != null ? fmt(x.rhr, 0) : null, 'bpm'), vs(x.rhr, base('rhr'), 0, true))}${col('Sleep', val(x.slp != null ? fmt(x.slp / 60, 1) : null, 'h'), sub(x.sp != null ? `${fmt(x.sp, 0)}% of need` : ''))}</div>
    <div class="rt3">${tile(isT ? 'Strain today' : 'Strain', x.str != null ? `<b class="wnum strain">${fmtS(x.str)}</b>` : val(null))}${tile('Sleep debt', val(x.sd != null ? fmt(x.sd, 0) : null, 'min'))}${tile(isT ? 'Steps today' : 'Steps', val(stT != null ? fmt(stT, 0) : null))}</div>${note}
    ${wSrc(t)}</section>`;
}

/* ---------- Activity tiles (Done hero, Strain detail) ---------- */
const sportIco = n => /weight|strength|lift|function|power|crossfit/i.test(n) ? 'lift' : /stair|climb/i.test(n) ? 'stairs' : /walk|hik/i.test(n) ? 'walk' : /run|tread/i.test(n) ? 'shoe' : 'pulse';
const actEnd = a => { const s = clockMin(a.t); return s == null ? null : s + (a.min || 0); };
function actTile(d, i) {
  const a = STATE.d[d].acts[i], s = clockMin(a.t), e = actEnd(a);
  return `<button class="act" data-act="nav" data-s="activity" data-d="${d}" data-i="${i}" aria-label="${esc(a.n)}, strain ${a.str != null ? fmtS(a.str) : 'unknown'}"><span class="act-chip">${wIco(sportIco(a.n), '', 2)}<b>${a.str != null ? fmtS(a.str) : '–'}</b></span><span class="wlab">${esc(a.n)}</span><span class="act-t">${s != null ? `${esc(clockOf(s))}<br>${esc(clockOf(e))}` : ''}</span></button>`;
}
function handTile(name, min, ico) { return `<div class="act" role="group" aria-label="${esc(name)}, ${min} minutes, no strain"><span class="act-chip grey">${wIco(ico, '', 1.7)}<b>${fmt(min, 0)}<small>m</small></b></span><span class="wlab">${esc(name)}</span><span class="act-ns">No strain</span></div>`; }
function doneActs(w) { // the WHOOP activities sessStats uses (lifting, and the cardio it logged), each its own tile; hand-typed cardio gets a grey one
  const acts = STATE.d[w.date]?.acts || [], idx = new Set();
  whoopActs(w.date, LIFT_RE).forEach(a => idx.add(acts.indexOf(a)));
  if (w.cardio?.done && w.cardio.src === 'whoop') whoopCardio(w.date, w.cardio.name).forEach(a => idx.add(acts.indexOf(a)));
  const order = [...idx].filter(i => i >= 0).sort((a, b) => (clockMin(acts[a].t) ?? 0) - (clockMin(acts[b].t) ?? 0));
  let h = order.map(i => actTile(w.date, i)).join('');
  if (!whoopActs(w.date, LIFT_RE).length && w.durMin) h = handTile('Weightlifting', w.durMin, 'lift') + h;
  if (w.cardio?.done && w.cardio.src !== 'whoop' && w.cardio.min) h += handTile(w.cardio.name, w.cardio.min, sportIco(w.cardio.name));
  return h ? `<div class="acts">${h}</div>` : '';
}

/* ---------- shared detail-screen pieces ---------- */
const NAV_NAME = { today: 'Today', health: 'Health monitor', sleep: 'Sleep', recovery: 'Recovery', strain: 'Strain', trend: 'Trends', alcohol: 'Morning after', log: 'Log' };
function navName(e) { if (e.screen === 'activity') return STATE.d[e.params?.d]?.acts?.[e.params?.i]?.n || 'Activity'; return NAV_NAME[e.screen] || 'Back'; }
function wBack() { return ''; } // v1.89: the back button lives in the header, where the logo is (renderHback)
const RING_SCREENS = ['sleep', 'recovery', 'strain'];
function renderHback() { // while the back stack has a screen: chevron in place of the logo; ring screens name the day in the centre, as WHOOP does
  const b = $('#hback'), c = $('#hday'), br = $('.brand'); if (!b) return;
  const e = ui.nav[ui.nav.length - 1], on = !!e && ui.tab !== 'data';
  b.hidden = !on; if (br) br.hidden = on;
  if (on) b.setAttribute('aria-label', 'Back to ' + navName(e));
  const day = on && RING_SCREENS.includes(ui.tab) ? (d => { const n = Math.round((Date.parse(d) - Date.parse(today())) / 864e5); return n === 0 ? 'Today' : n === -1 ? 'Yesterday' : n === 1 ? 'Tomorrow' : fmtDow(d) + ' ' + fmtDate(d); })(wDay()) : '';
  c.hidden = !day; if (c.textContent !== day) c.textContent = day;
}
const wTitle = (eye, title) => `<div class="wtitle"><span class="wlab">${esc(eye)}</span><h1>${esc(title)}</h1></div>`;
/* v1.89 big ring, sized off WHOOP's (241pt on a 393pt screen, 15pt stroke): Orbit wordmark, number, label; the card under it points up at it. */
const wBigRing = (f, col, inner, lab, aria, extra = '') => { const S = 240, sw = 15, r = (S - sw) / 2, k = S / 2;
  return `<div class="wbig"><span class="wbr"><svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(aria)}"><circle cx="${k}" cy="${k}" r="${r}" fill="none" stroke="${WC.track}" stroke-width="${sw}"/>${wBand(k, r, sw, f, col)}</svg><b><i class="wbr-m">Orbit</i><span class="wbr-v">${inner}</span><span class="wlab">${esc(lab)}</span>${extra}</b></span></div>`; };
const avg30 = (d, f) => { const v = []; for (let i = 1; i <= 30; i++) { const x = f(addDays(d, -i)); if (x != null) v.push(x); } return v.length ? mean(v) : null; };
/* A "Today vs. last 30 days" row: icon, label, value with a small arrow (green when the change is good), the average under it. */
function cmpRow({ ico, label, v, avg, f, unit = '', better = 1, act = '' }) {
  const arr = v != null && avg != null && better && Math.abs(v - avg) > 1e-9 && f(v) !== f(avg) ? wArr(v > avg, (v > avg) === (better > 0)) : '';
  const tag = act ? 'button' : 'div';
  return `<${tag} class="wrow" ${act}><span class="wrow-l">${wIco(ico)}<span class="wlab">${esc(label)}</span></span><span class="wrow-r"><span><b class="wnum">${v == null ? '–' : f(v)}${unit && v != null ? `<small>${esc(unit)}</small>` : ''}</b>${arr}</span><em>${avg == null ? '–' : f(avg) + (unit === '%' ? '%' : '')}</em></span></${tag}>`;
}
const cmpLeg = `<div class="wleg">${wArr(true, true)}${wArr(false, false)}<span><b>Today</b> vs. last 30 days</span></div>`;
/* (i) explanations open as a bottom sheet over the screen (WHOOP's), never inside the card, so the card keeps its size.
   Each: title, lead, optional bands [bold, rest], optional closing paragraphs. */
const INFO_TXT = {
  hos: { t: 'Hours of sleep', p: 'Time asleep last night, against your average over the 30 nights before.' },
  hvn: { t: 'What is Hours vs. Needed?', p: 'How much you slept last night against how much you needed.',
    l: [['High (85%+):', 'best for health and performance.'], ['Moderate (70 to 85%):', 'enough to get by.'], ['Low (under 70%):', 'holds back recovery.']],
    n: ['Sleep needed is your baseline plus extra for recent strain, naps and sleep debt.'] },
  cons: { t: 'What is Sleep Consistency?', p: 'How alike your bed and wake times are over 4 days, from 0 to 100%.',
    l: [['High (80%+):', 'best for health and performance.'], ['Moderate (70 to 80%):', 'enough to get by.'], ['Low (under 70%):', 'can throw off your body clock and leave you tired.']],
    n: ['Naps outside your usual sleep window lower it, even though they cut sleep debt.', 'Dashed lines: Orbit’s estimate of your optimal bed and wake times.'] },
  eff: { t: 'What is Sleep Efficiency?', p: 'Time asleep as a share of time in bed.',
    l: [['High (85%+):', 'optimal, so you need less time in bed for the same sleep.'], ['Under 85%:', 'a darker, quieter room can help.']],
    n: ['Wake events are the disturbances WHOOP counted.'] },
  zones: { t: 'Heart rate zones', p: 'Time in each heart-rate zone during this activity, from WHOOP.' },
};
function wStatHead(label, ikey, metric) {
  return `<div class="wch">${metric ? `<button class="wlab" data-act="nav" data-s="trend" data-m="${metric}" data-d="${wDay()}">${esc(label)}</button>` : `<span class="wlab">${esc(label)}</span>`}<button class="winfo" data-act="winfo" data-k="${ikey}" aria-label="About ${esc(label)}" aria-haspopup="dialog">${INFO}</button></div>`;
}
function infoSheet(key) {
  const x = INFO_TXT[key]; if (!x) return;
  closeSheet(true);
  const bg = document.createElement('div'); bg.className = 'wsheet-bg'; bg.id = 'wsheet';
  bg.innerHTML = `<div class="wsheet" role="dialog" aria-modal="true" aria-label="${esc(x.t)}"><i class="grab" aria-hidden="true"></i><h3>${esc(x.t)}</h3><p>${esc(x.p)}</p>${x.l ? `<ul>${x.l.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join('')}</ul>` : ''}${(x.n || []).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  document.body.appendChild(bg);
  const sh = bg.firstChild; let y0 = null, dy = 0;
  bg.addEventListener('click', ev => { if (ev.target === bg) closeSheet(); });
  sh.addEventListener('pointerdown', ev => { y0 = ev.clientY; dy = 0; sh.style.transition = 'none'; sh.setPointerCapture?.(ev.pointerId); });
  sh.addEventListener('pointermove', ev => { if (y0 == null) return; dy = Math.max(0, ev.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  const up = () => { if (y0 == null) return; y0 = null; sh.style.transition = ''; if (dy > 70) closeSheet(); else sh.style.transform = ''; };
  sh.addEventListener('pointerup', up); sh.addEventListener('pointercancel', up);
  requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add('on')));
}
function closeSheet(now) {
  const bg = document.getElementById('wsheet'); if (!bg) return;
  if (now) { bg.remove(); return; }
  bg.classList.remove('on'); bg.firstChild.style.transform = ''; bg.id = ''; setTimeout(() => bg.remove(), 260);
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });
function wBigVal(txt, v, avg, f, better = 1) {
  const arr = v != null && avg != null && f(v) !== f(avg) ? wArr(v > avg, (v > avg) === (better > 0)) : '';
  return `<div class="wbigv"><span><b class="wnum">${txt}</b>${arr}</span><em>${avg == null ? '–' : f(avg)}</em></div>`;
}

/* ---------- Weekly trends charts: the 7 days up to the viewed day, which is the highlighted column on the right ---------- */
function wkDays(d) { return [6, 5, 4, 3, 2, 1, 0].map(i => addDays(d, -i)); }
const CX = i => 26 + 52 * i, PB = 150, PT = 18;
function wkFrame(days, hi, body) {
  const grid = [37.5, 75, 112.5, 150].map(y => `<line x1="0" x2="364" y1="${y}" y2="${y}" stroke="${WC.grid}" stroke-width="1"/>`).join('');
  const lab = days.map((d, i) => `<text class="d" x="${CX(i)}" y="166" text-anchor="middle" font-size="11" fill="${i === hi ? WC.ink : WC.dim}">${esc(fmtDow(d))}</text><text x="${CX(i)}" y="180" text-anchor="middle" font-size="10.5" fill="${i === hi ? WC.ink : WC.dim}">${+d.slice(8)}</text>`).join('');
  return `<svg class="wsvg" viewBox="0 0 364 186" role="img" aria-hidden="false">${hi >= 0 ? `<rect x="${CX(hi) - 23}" y="0" width="46" height="184" rx="6" fill="#fff" fill-opacity=".05"/>` : ''}${grid}${body}${lab}</svg>`;
}
function wkChart(d, spec) {
  const days = wkDays(d), hi = days.indexOf(d), vals = days.map(spec.v);
  const has = vals.filter(v => v != null && (!Array.isArray(v) || v.some(x => x != null)));
  if (!has.length) return `<p class="xs muted">No data in these 7 days.</p>`;
  const tot = v => Array.isArray(v) ? sum(v.map(x => x || 0)) : v;
  let lo = spec.yMin ?? 0, hiV = spec.yMax ?? (Math.max(...has.map(tot)) * 1.05 || 1);
  if (spec.type === 'line' || spec.type === 'dual') { const all = spec.type === 'dual' ? has.flat().filter(x => x != null) : has; const mn = Math.min(...all), mx = Math.max(...all), pad = Math.max((mx - mn) * 0.35, Math.abs(mx) * 0.02, 0.5); lo = spec.yMin ?? mn - pad; hiV = spec.yMax ?? mx + pad; }
  const Y = v => PB - (v - lo) / ((hiV - lo) || 1) * (PB - PT);
  const f = spec.f, col = spec.color, t = (x, y, txt, c) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="${c}">${esc(txt)}</text>`;
  let body = '';
  if (spec.type === 'bar') vals.forEach((v, i) => { if (v == null) return; const c = typeof col === 'function' ? col(v) : col, y = Math.min(PB - 1, Y(v)); body += `<rect x="${CX(i) - 6}" y="${y.toFixed(1)}" width="12" height="${(PB - y).toFixed(1)}" rx="2" fill="${c}"/>` + t(CX(i), (y - 6).toFixed(1), f(v), spec.lab || c); });
  if (spec.type === 'stack') vals.forEach((v, i) => { if (!v || !v.some(x => x)) return; let base = PB; v.forEach((x, k) => { if (!x) return; const h = (x / ((hiV - lo) || 1)) * (PB - PT); body += `<rect x="${CX(i) - 6}" y="${(base - h).toFixed(1)}" width="12" height="${h.toFixed(1)}" fill="${spec.colors[k]}"/>`; base -= h; }); body += t(CX(i), (base - 6).toFixed(1), f(tot(v)), WC.ink); });
  if (spec.type === 'line') { const pts = vals.map((v, i) => v == null ? null : [CX(i), Y(v)]).filter(Boolean), pl = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
    if (pts.length > 1) { if (spec.fill) { const gid = 'wf' + (wkChart.n = (wkChart.n || 0) + 1); body += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".16"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><polygon points="${pts[0][0].toFixed(1)},${PB} ${pl} ${pts[pts.length - 1][0].toFixed(1)},${PB}" fill="url(#${gid})"/>`; }
      body += `<polyline points="${pl}" fill="none" stroke="${col}" stroke-opacity=".55" stroke-width="2.5"/>`; } // WHOOP: a dimmed line, hollow markers; Recovery's metrics also get a fading fill
    vals.forEach((v, i) => { if (v == null) return; body += `<circle cx="${CX(i)}" cy="${Y(v).toFixed(1)}" r="4.5" fill="${WC.card}" stroke="${col}" stroke-width="2"/>` + t(CX(i), (Y(v) - 10).toFixed(1), f(v), col); }); }
  if (spec.type === 'dual') spec.colors.forEach((c, k) => { const pts = vals.map((v, i) => v && v[k] != null ? [CX(i), Y(v[k])] : null).filter(Boolean);
    if (pts.length > 1) body += `<polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="2.5"/>`;
    vals.forEach((v, i) => { if (!v || v[k] == null) return; body += `<circle cx="${CX(i)}" cy="${Y(v[k]).toFixed(1)}" r="4" fill="${WC.card}" stroke="${c}" stroke-width="2"/>` + t(CX(i), (Y(v[k]) + (k ? -10 : 18)).toFixed(1), f(v[k]), c); }); });
  if (spec.type === 'float') { // time in bed: a bar from bed to wake, later times lower, labelled at both ends
    const all = has.flat(), mn = Math.min(...all) - 30, mx = Math.max(...all) + 30, Yt = m => PT + (m - mn) / (mx - mn) * (PB - PT - 14);
    vals.forEach((v, i) => { if (!v) return; const y0 = Yt(v[0]), y1 = Yt(v[1]); body += `<rect x="${CX(i) - 6}" y="${y0.toFixed(1)}" width="12" height="${(y1 - y0).toFixed(1)}" rx="2" fill="${col}"/>` + `<text x="${CX(i)}" y="${(y0 - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${col}">${esc(clockOf(v[0]).replace(' ', ''))}</text><text x="${CX(i)}" y="${(y1 + 12).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${col}">${esc(clockOf(v[1]).replace(' ', ''))}</text>`; }); }
  return wkFrame(days, hi, body) + (spec.legend ? `<div class="wleg gap">${spec.legend.map(([c, l, dash]) => `<span><i class="bar" style="${dash === 'o' ? `width:9px;height:9px;border-radius:50%;border:2.5px solid ${c};box-sizing:border-box` : dash ? `border-top:2px dashed ${c};height:0` : `background:${c}`}"></i>${esc(l)}</span>`).join('')}</div>` : '');
}
function wkCard(d, label, metric, spec) { return `<section class="wcard"><div class="wch"><button class="wlab" data-act="nav" data-s="trend" data-m="${metric}" data-d="${d}" aria-label="${esc(label)}: open trends">${esc(label)}</button><button class="winfo" data-act="nav" data-s="trend" data-m="${metric}" data-d="${d}" aria-label="Open ${esc(label)} trends">${CHEV6}</button></div>${wkChart(d, spec)}</section>`; }

/* ---------- Health monitor ---------- */
const HM_LAB = { rr: ['Respiratory rate', 'rpm'], spo2: ['Blood oxygen', '%'], rhr: ['Resting HR', 'bpm'], hrv: ['HRV', 'ms'], skt: ['Skin temp', '°C'] };
const sgn = (x, d) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
function vHealth() {
  const d = wDay(), ir = inRangeCount(d), out = ir.of - ir.n;
  let h = wBack() + wTitle(`${d === today() ? 'Last night' : fmtDow(d) + ' ' + fmtDate(d)} · vs your 30-day normal`, 'Health monitor');
  h += `<section class="hmsum">${!ir.of ? `<span class="wico lg nil">${wIco('pulse', '', 2)}</span><span><b class="nil">No range yet</b><span>Ranges need 14 of the 30 nights before</span></span>`
    : `<span class="wico lg ${out ? 'warn' : 'ok'}">${wIco(out ? 'excl' : 'tick', '', 2.6)}</span><span><b class="${out ? 'warn' : ''}">${out ? `${out} out of range` : 'Within range'}</b><span>${ir.n} of ${ir.of} in your normal range</span></span>`}</section>`;
  const tile = k => {
    const r = healthRange(d, k), [lab, unit] = HM_LAB[k], dec = HM_DEC[k], v = dayVal(d, k), sk = k === 'skt';
    const sh = x => sk && r ? x - r.mean : x, fv = x => sk ? sgn(rnd(sh(x), dec), dec) : rnd(x, dec).toFixed(dec);
    let bar = '<span class="hmbar"></span>', line = '<em class="nil">Not enough nights yet</em>';
    if (r) { const w = r.hi - r.lo, a = r.lo - w / 1.5 * 0.5, b = r.hi + w / 1.5 * 0.5, P = x => Math.max(0, Math.min(100, (x - a) / (b - a) * 100));
      bar = `<span class="hmbar"><i style="left:${P(r.lo).toFixed(1)}%;width:${(P(r.hi) - P(r.lo)).toFixed(1)}%"></i>${v != null ? `<s style="left:${P(v).toFixed(1)}%"></s>` : ''}</span>`;
      const rng = sk ? `${fv(r.lo)} to ${fv(r.hi)}` : `${rnd(r.lo, dec).toFixed(dec)} – ${rnd(r.hi, dec).toFixed(dec)}${unit === '%' ? '%' : ''}`;
      line = v == null ? `<em class="nil">No reading · normal ${rng}</em>` : r.state === 'within' ? `<em>✓ within ${rng}</em>` : `<em class="warn">${r.state} ${rng}</em>`; }
    return `<button class="hmt" data-act="nav" data-s="trend" data-m="${k}" data-d="${d}"><span class="wlab">${esc(lab)}</span><b class="wnum">${v == null ? '–' : fv(v)}${v != null ? `<small>${esc(unit)}</small>` : ''}</b>${bar}${line}</button>`;
  };
  h += `<div class="hmg">${HM_KEYS.map(tile).join('')}<div class="hmhow"><span class="wlab dim">How ranges work</span><span>Green band is your normal from the last 30 nights. The dot is ${d === today() ? 'last night' : 'that night'}.</span></div></div>`;
  const days = [6, 5, 4, 3, 2, 1, 0].map(i => addDays(d, -i));
  h += `<section class="wcard"><div class="card-h"><h2>Last 7 nights</h2><span class="eyebrow">in range</span></div><div class="hm7">${days.map(x => { const c = inRangeCount(x), cls = !c.of ? 'nil' : c.n === c.of ? 'ok' : 'warn';
    return `<button class="${cls}${x === d ? ' on' : ''}" data-act="navday" data-d="${x}" aria-label="${esc(fmtDow(x) + ' ' + fmtDate(x))}: ${c.of ? `${c.n} of ${c.of} in range` : 'no range'}" aria-current="${x === d}"><span>${c.of ? c.n : '–'}</span><small>${esc(fmtDow(x)[0])}</small></button>`; }).join('')}</div></section>`;
  return h + wSrc(d);
}

/* ---------- Sleep detail ---------- */
const pctile = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
function vSleep() {
  const d = wDay(), x = STATE.d[d] || {}, f0 = v => fmt(v, 0) + '%';
  let h = '';
  h += wBigRing(x.sp / 100, WC.sleep, pctIn(x.sp), 'Sleep\nperformance', `Sleep performance ${x.sp == null ? 'no data' : fmt(x.sp, 0) + '%'}`, wSeg3(x.sp));
  const hvnp = dd => { const a = dayVal(dd, 'slp'), b = dayVal(dd, 'sn'); return a != null && b ? a / b * 100 : null; };
  const crow = (id, ico, label, v) => `<button class="wrow" data-act="wscroll" data-id="${id}"><span class="wrow-l">${wIco(ico)}<span class="wlab">${esc(label)}</span></span><span class="wrow-c">${wSeg3(v, true)}<b class="wnum">${v == null ? '–' : f0(v)}</b></span></button>`;
  h += `<section class="wcard rows wpt">${crow('hvn', 'moon', 'Hours vs. needed', hvnp(d))}${crow('cons', 'cons', 'Sleep consistency', x.sc)}${crow('eff', 'eff', 'Sleep efficiency', x.se)}
    <div class="wleg gap"><span><i class="bar" style="background:${WC.dn}"></i>Poor</span><span><i class="bar" style="background:#8e9293"></i>Sufficient</span><span><i class="bar" style="background:${WC.up}"></i>Optimal</span></div></section>`;
  h += `<h2 class="wh2">${d === today() ? "Last night's sleep" : 'That night’s sleep'}</h2>` + alcRow(d);
  // hours of sleep + stages
  const bed = x.bed, st = [['Awake', 'aw', WC.aw], ['Light', 'lt', WC.lt], ['SWS (deep)', 'deep', WC.deep], ['REM', 'rem', WC.rem]];
  const typ = k => { const v = []; for (let i = 1; i <= 30; i++) { const y = STATE.d[addDays(d, -i)]; if (y && y[k] != null && y.bed) v.push(y[k] / y.bed * 100); } return v.length >= 7 ? [pctile(v, .25), pctile(v, .75)] : null; };
  h += `<section class="wcard">${wStatHead('Hours of sleep', 'hos', 'hvn')}${wBigVal(wHM(x.slp), x.slp, avg30(d, dd => dayVal(dd, 'slp')), wHM)}<div class="wsep"></div>
    <div class="wkv"><span class="wkv" style="gap:8px"><i class="wtyp"></i><span class="wlab sm">Typical range</span></span><span class="wkv" style="gap:8px"><span class="wlab sm">Duration</span><b class="wnum lg">${wHM(bed)}</b></span></div>
    ${st.map(([lab, k, c]) => { const v = x[k], p = v != null && bed ? v / bed * 100 : null, ty = typ(k);
      return `<div class="wstage"><div class="wkv"><span class="wstage-l"><i class="o"></i><span class="wlab">${esc(lab)}</span><span class="wnum" style="color:${c}">${p == null ? '–' : fmt(p, 0) + '%'}</span></span><b class="wnum lg">${wHM(v)}</b></div>
        <span class="wtrack">${p != null ? `<i style="width:${Math.min(100, p).toFixed(1)}%;background:${c}"></i>` : ''}${ty ? `<s style="left:${ty[0].toFixed(1)}%;width:${Math.max(1.5, ty[1] - ty[0]).toFixed(1)}%"></s>` : ''}</span></div>`; }).join('')}
    ${(() => { const r = x.deep != null && x.rem != null ? x.deep + x.rem : null, ra = avg30(d, dd => { const y = STATE.d[dd]; return y && y.deep != null && y.rem != null ? y.deep + y.rem : null; });
      const arr = r != null && ra != null && wHM(r) !== wHM(ra) ? wArr(r > ra, r > ra) : '';
      return `<button class="wkv wsep" style="padding-top:12px;background:none;border-left:0;border-right:0;border-bottom:0;color:inherit;font:inherit;width:100%;cursor:pointer" data-act="nav" data-s="trend" data-m="resth" data-d="${d}"><span class="wkv" style="gap:8px"><i class="wsq" style="background:linear-gradient(135deg, ${WC.deep} 50%, ${WC.rem} 50%)"></i><span class="wlab">Restorative sleep</span></span><span class="wkv" style="gap:6px"><b class="wnum xl">${wHM(r)}</b>${arr}</span></button>`; })()}</section>`;
  // hours vs needed
  const sn = x.sn, slp = x.slp;
  if (sn) {
    const p = slp != null ? slp / sn * 100 : null, scale = Math.max(sn, slp || 0), W = v => (v / scale * 100);
    const debt = x.sd || 0, split = x.snb != null && x.sns != null, base = split ? x.snb : sn - debt, strain = split ? x.sns : 0;
    const a = W(base), b = W(base + strain), c = W(sn);
    const grad = `linear-gradient(90deg, rgba(90,97,104,0) 0%, ${WC.hm} ${(a * 0.97).toFixed(1)}%, ${WC.hm} ${a.toFixed(1)}%, ${split ? `${WC.strain} ${a.toFixed(1)}%, ${WC.strain} ${b.toFixed(1)}%, ` : ''}${WC.debt} ${b.toFixed(1)}%, ${WC.debt} ${c.toFixed(1)}%, transparent ${c.toFixed(1)}%)`;
    h += `<section class="wcard" id="hvn">${wStatHead('Hours vs. needed', 'hvn', 'hvnp')}${wBigVal(p == null ? '–' : f0(p), p, avg30(d, hvnp), f0)}
      <div class="wkv"><span class="wlab sm">Hours of sleep</span><b class="wnum">${wHM(slp)}</b></div>
      <span class="wfade">${slp != null ? `<span class="wfade" style="width:${W(slp).toFixed(1)}%;background:linear-gradient(90deg, rgba(131,160,184,0) 0%, rgba(131,160,184,.55) 35%, ${WC.sleep} 100%)"></span>` : ''}</span>
      <span class="wfade" style="background:${grad}"></span>
      <div class="wkv"><span class="wlab sm">Sleep needed</span><b class="wnum">${wHM(sn)}</b></div>
      <div class="wsplit">${split ? `<div><span><i class="wsq" style="background:${WC.hm}"></i>Healthy minimum</span><b class="wnum">${wHM(base)}</b></div><div><span><i class="wsq" style="background:${WC.strain}"></i>Recent strain</span><b class="wnum">${strain >= 0 ? '+' : '−'}${wHM(Math.abs(strain))}</b></div>`
        : `<div><span><i class="wsq" style="background:${WC.hm}"></i>Healthy minimum and strain</span><b class="wnum">${wHM(base)}</b></div>`}<div><span><i class="wsq" style="background:${WC.debt}"></i>Sleep debt</span><b class="wnum">+${wHM(debt)}</b></div></div></section>`;
  }
  // consistency
  const nights = [4, 3, 2, 1, 0].map(i => addDays(d, -i));
  h += `<section class="wcard" id="cons">${wStatHead('Sleep consistency', 'cons', 'sc')}${wBigVal(x.sc == null ? '–' : f0(x.sc), x.sc, avg30(d, dd => dayVal(dd, 'sc')), f0)}
    <div class="wkv" style="justify-content:flex-end;gap:6px"><i class="wdash"></i><span class="wlab sm">Optimal bed/waketime</span></div>${consChart(nights)}</section>`;
  // efficiency
  h += `<section class="wcard" id="eff">${wStatHead('Sleep efficiency', 'eff', 'se')}${wBigVal(x.se == null ? '–' : f0(x.se), x.se, avg30(d, dd => dayVal(dd, 'se')), f0)}
    <div class="wkv"><span class="wlab sm">Asleep</span><b class="wnum">${wHM(slp)}</b></div>
    <span class="wtrack">${slp != null && bed ? `<i style="width:${Math.min(100, slp / bed * 100).toFixed(1)}%;background:${WC.sleep}"></i>` : ''}</span>
    <span class="wtrack">${x.aw != null && bed ? `<i style="width:${Math.min(100, x.aw / bed * 100).toFixed(1)}%;background:${WC.aw}"></i>` : ''}</span>
    <div class="wkv"><span class="wlab sm">Awake</span><b class="wnum">${wHM(x.aw)}</b></div>
    <div class="wkv wsep" style="padding-top:12px"><span class="wkv" style="gap:8px"><i class="wsq" style="background:var(--w-lab)"></i><span class="wlab">Wake events</span></span><b class="wnum xl">${x.dst != null ? x.dst : '–'}</b></div></section>`;
  // weekly trends
  const dv2 = k => dd => dayVal(dd, k);
  h += `<h2 class="wh2">Weekly trends</h2>`
    + wkCard(d, 'Sleep performance', 'sp', { type: 'bar', v: dv2('sp'), color: WC.sleep, f: f0, yMin: 0, yMax: 100 })
    + wkCard(d, 'Hours vs. needed (hours)', 'hvn', { type: 'dual', v: dd => { const a = dayVal(dd, 'slp'), b = dayVal(dd, 'sn'); return a == null && b == null ? null : [a, b]; }, colors: [WC.sleep, WC.up], f: wHM, legend: [[WC.sleep, 'Hours of sleep', 'o'], [WC.up, 'Sleep needed', 'o']] })
    + wkCard(d, 'Hours vs. needed (%)', 'hvnp', { type: 'bar', v: hvnp, color: WC.sleep, f: f0, yMin: 0, yMax: 100 })
    + wkCard(d, 'Restorative sleep', 'resth', { type: 'stack', v: dd => { const y = STATE.d[dd]; return y && (y.deep != null || y.rem != null) ? [y.rem, y.deep] : null; }, colors: [WC.rem, WC.deep], f: wHM, legend: [[WC.deep, 'SWS (deep)'], [WC.rem, 'REM']] })
    + wkCard(d, 'Sleep consistency', 'sc', { type: 'bar', v: dv2('sc'), color: WC.sleep, f: f0, yMin: 0, yMax: 100 })
    + wkCard(d, 'Time in bed', 'bed', { type: 'float', v: dd => { const a = clockMin(dayVal(dd, 'on')), b = clockMin(dayVal(dd, 'off')); return a != null && b != null && b > a ? [a, b] : null; }, color: WC.sleep })
    + wkCard(d, 'Sleep efficiency', 'se', { type: 'line', v: dv2('se'), color: WC.sleep, f: f0 })
    + wkCard(d, 'Sleep debt', 'sd', { type: 'bar', v: debtAfter, color: WC.sleep, f: wHM });
  return h + wSrc(d);
}
/* Bed to wake bars for 5 nights (last one blue and labelled), with smooth dashed optimal bed and wake contours. */
function consChart(nights) {
  const Y = m => Math.max(0, Math.min(200, (m + 300) / 960 * 200)), X = i => 76 + 64 * i; // 7 pm .. 11 am
  let s = ['7PM', '11PM', '3AM', '7AM', '11AM'].map((l, i) => `<line x1="44" x2="364" y1="${i * 50}" y2="${i * 50}" stroke="${WC.grid}"/><text class="d" x="0" y="${i * 50 + 4}" font-size="10.5" fill="${WC.dim}" style="font-weight:700">${l}</text>`).join('');
  const opt = nights.map(n => sleepOptimal(n));
  const curve = k => { const p = opt.map((o, i) => o ? [X(i), Y(o[k])] : null); const pts = p.filter(Boolean); if (pts.length < 2) return '';
    let dd = `M44,${pts[0][1].toFixed(1)} L${pts[0][0]},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; dd += ` C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1},${y1.toFixed(1)}`; }
    dd += ` L364,${pts[pts.length - 1][1].toFixed(1)}`; return `<path d="${dd}" fill="none" stroke="#c8ccd0" stroke-width="1.5" stroke-dasharray="5 4"/>`; };
  s += curve('bed') + curve('wake');
  nights.forEach((n, i) => { const a = clockMin(dayVal(n, 'on')), b = clockMin(dayVal(n, 'off')), last = i === nights.length - 1;
    if (a != null && b != null && b > a) { s += `<rect x="${X(i) - 7}" y="${Y(a).toFixed(1)}" width="14" height="${(Y(b) - Y(a)).toFixed(1)}" rx="2" fill="${last ? WC.sleep : WC.hm}"/>`;
      if (last) s += `<text x="${X(i) + 10}" y="${(Y(a) - 4).toFixed(1)}" font-size="11.5" fill="${WC.sleep}" text-anchor="end">${esc(clockOf(a))}</text><text x="${X(i) + 10}" y="${(Y(b) + 16).toFixed(1)}" font-size="11.5" fill="${WC.sleep}" text-anchor="end">${esc(clockOf(b))}</text>`; }
    s += `<text class="d" x="${X(i)}" y="220" text-anchor="middle" font-size="11" fill="${last ? WC.ink : WC.dim}">${esc(fmtDow(n))}.</text>`; });
  return `<svg class="wsvg" viewBox="0 0 364 226" role="img" aria-label="Bed and wake times for the last 5 nights against optimal bed and wake times">${s}</svg>`;
}

/* ---------- Recovery detail ---------- */
function vRecovery() {
  const d = wDay(), x = STATE.d[d] || {}, a = k => avg30(d, dd => dayVal(dd, k));
  let h = '';
  h += wBigRing(x.rec / 100, recCol(x.rec), pctIn(x.rec), 'Recovery', `Recovery ${x.rec == null ? 'no data' : fmt(x.rec, 0) + '%'}`);
  const tr = m => `data-act="nav" data-s="trend" data-m="${m}" data-d="${d}"`;
  h += `<section class="wcard rows wpt">${cmpRow({ ico: 'hrv', label: 'Heart rate variability', v: x.hrv, avg: a('hrv'), f: v => fmt(v, 0), unit: 'ms', act: tr('hrv') })}${cmpRow({ ico: 'heart', label: 'Resting heart rate', v: x.rhr, avg: a('rhr'), f: v => fmt(v, 0), unit: 'bpm', better: -1, act: tr('rhr') })}${cmpRow({ ico: 'lungs', label: 'Respiratory rate', v: x.rr, avg: a('rr'), f: v => v.toFixed(1), unit: 'rpm', better: -1, act: tr('rr') })}${cmpRow({ ico: 'moon', label: 'Sleep performance', v: x.sp, avg: a('sp'), f: v => fmt(v, 0) + '%', act: `data-act="nav" data-s="sleep" data-d="${d}"` })}${cmpLeg}</section>`;
  h += `<button class="wlink" data-act="nav" data-s="alcohol" data-d="${d}"><span><span class="wlab">Recovery the morning after</span><span>What moves your recovery, on Body.</span></span>${CHEV6}</button>`;
  const dv2 = k => dd => dayVal(dd, k);
  h += `<h2 class="wh2">Weekly trends</h2>`
    + wkCard(d, 'Recovery', 'rec', { type: 'bar', v: dv2('rec'), color: v => recCol(v), f: v => fmt(v, 0) + '%', yMin: 0, yMax: 100 })
    + wkCard(d, 'Heart rate variability', 'hrv', { type: 'line', v: dv2('hrv'), color: WC.rec, fill: true, f: v => fmt(v, 0) })
    + wkCard(d, 'Resting heart rate', 'rhr', { type: 'line', v: dv2('rhr'), color: WC.rec, fill: true, f: v => fmt(v, 0) })
    + wkCard(d, 'Respiratory rate', 'rr', { type: 'line', v: dv2('rr'), color: WC.rec, fill: true, f: v => v.toFixed(1) })
    + wkCard(d, 'Sleep performance', 'sp', { type: 'bar', v: dv2('sp'), color: WC.sleep, f: v => fmt(v, 0) + '%', yMin: 0, yMax: 100 });
  return h + wSrc(d);
}
function vAlcohol() { // "Recovery the morning after": Body's two cards on a screen of their own
  const d = wDay(); return wBack() + wTitle('From Body', 'Recovery the morning after') + (recAfterCard() || '') + (alcoholCard() || '') + (recAfterCard() || alcoholCard() ? '' : '<p class="small dim">Not enough nights yet.</p>') + alcRow(d);
}

/* ---------- Strain detail ---------- */
const liftMin = dd => whoopLiftMin(dd); // same rule as the Trends "Strength activity time" metric
const onWhoopDay = (dd, f) => STATE.d[dd]?.str != null ? (f(dd) ?? 0) : null; // a WHOOP day without activities counts as zero
function vStrain() {
  const d = wDay(), x = STATE.d[d] || {}, zs = zoneSplit(d), tr = m => `data-act="nav" data-s="trend" data-m="${m}" data-d="${d}"`;
  const z13 = dd => zoneSplit(dd)?.z13, z45 = dd => zoneSplit(dd)?.z45;
  let h = '';
  h += wBigRing(x.str / 21, WC.strain, strIn(x.str), 'Strain', `Strain ${x.str == null ? 'no data' : fmtS(x.str)} of 21`);
  h += `<section class="wcard rows wpt">${cmpRow({ ico: 'heart', label: 'Heart rate zones 1-3', v: x.str != null ? zs?.z13 ?? 0 : null, avg: avg30(d, dd => onWhoopDay(dd, z13)), f: wHM, act: tr('z13') })}${cmpRow({ ico: 'heart', label: 'Heart rate zones 4-5', v: x.str != null ? zs?.z45 ?? 0 : null, avg: avg30(d, dd => onWhoopDay(dd, z45)), f: wHM, act: tr('z45') })}${cmpRow({ ico: 'lift', label: 'Strength activity time', v: x.str != null ? liftMin(d) ?? 0 : null, avg: avg30(d, dd => onWhoopDay(dd, liftMin)), f: wHM, act: tr('lift') })}${cmpRow({ ico: 'shoe', label: 'Steps', v: stepsOf(d), avg: avg30(d, stepsOf), f: v => fmt(v, 0), act: tr('stp') })}${cmpLeg}</section>`;
  const acts = x.acts || [];
  if (acts.length) h += `<h2 class="wh2">${d === today() ? 'Today’s activities' : 'Activities'}</h2><div class="acts lone">${acts.map((a, i) => i).sort((a, b) => (clockMin(acts[a].t) ?? 0) - (clockMin(acts[b].t) ?? 0)).map(i => actTile(d, i)).join('')}</div>`;
  const zz = (dd, ks) => { const s = zoneSplit(dd); return s ? ks.map(k => s.z[k]) : null; };
  h += `<h2 class="wh2">Weekly trends</h2>`
    + wkCard(d, 'Strain', 'str', { type: 'bar', v: dd => dayVal(dd, 'str'), color: WC.strain, f: v => v.toFixed(1), yMin: 0, yMax: 21 })
    + wkCard(d, 'HR zones 1-3', 'z13', { type: 'stack', v: dd => zz(dd, [0, 1, 2]), colors: WC.z.slice(0, 3), f: wHM, legend: [[WC.z[0], 'Zone 1'], [WC.z[1], 'Zone 2'], [WC.z[2], 'Zone 3']] })
    + wkCard(d, 'HR zones 4-5', 'z45', { type: 'stack', v: dd => zz(dd, [3, 4]), colors: WC.z.slice(3), f: wHM, legend: [[WC.z[3], 'Zone 4'], [WC.z[4], 'Zone 5']] })
    + wkCard(d, 'Steps', 'stp', { type: 'bar', v: stepsOf, color: WC.strain, f: v => fmt(v, 0) })
    + wkCard(d, 'Calories', 'kb', { type: 'bar', v: dd => dayVal(dd, 'kb'), color: WC.strain, f: v => fmt(v, 0) })
    + wkCard(d, 'Strength activity time', 'lift', { type: 'bar', v: liftMin, color: WC.strain, lab: '#fff', f: wHM });
  return h + wSrc(d);
}

/* ---------- Activity detail ---------- */
function vActivity() {
  const d = ui.np?.d || today(), a = STATE.d[d]?.acts?.[ui.np?.i];
  if (!a) return wBack() + '<p class="small dim">That activity isn’t here any more.</p>';
  const s = clockMin(a.t), e = actEnd(a);
  let h = wBack() + wTitle(`${d === today() ? 'Today' : fmtDow(d) + ' ' + fmtDate(d)}${s != null ? ` · ${wSpan(a.t, `${pad(Math.floor(e / 60) % 24)}:${pad(Math.round(e % 60))}`)}` : ''}`, a.n);
  h += wBigRing(a.str / 21, WC.strain, strIn(a.str), 'Activity strain', `Activity strain ${a.str == null ? 'unknown' : fmtS(a.str)}`);
  const t = (lab, v, u) => `<div><span class="wlab">${lab}</span><b class="wnum">${v == null ? '–' : v}${v != null && u ? `<small>${u}</small>` : ''}</b></div>`;
  h += `<div class="wtiles4">${t('Duration', a.min != null ? wHM(a.min) : null)}${t('Calories', a.kcal != null ? fmt(a.kcal, 0) : null, 'kcal')}${t('Average HR', a.ahr, 'bpm')}${t('Max HR', a.mhr, 'bpm')}</div>`;
  if (a.z) { const mx = Math.max(...a.z, 1);
    h += `<section class="wcard"><div class="wch"><button class="wlab" data-act="nav" data-s="trend" data-m="zall" data-d="${d}">Heart rate zones</button><span class="wlab sm" style="color:var(--ink-3)">Time · share</span></div>${a.z.map((p, i) => `<div class="wzone"><span class="wlab">Zone ${i + 1}</span><span class="wtrack sm"><i style="width:${(p / mx * 80).toFixed(1)}%;background:${WC.z[i]}"></i></span><b class="wnum">${wHM((a.min || 0) * p / 100)}</b><em>${fmt(p, 0)}%</em></div>`).join('')}</section>`; }
  const w = STATE.w[d];
  if (LIFT_RE.test(a.n) && w && !w.rest && !emptyW(w)) { const st = wStats(w), prs = prsIn(w);
    h += `<button class="wlink" data-act="navlog" data-d="${d}"><span><span class="wlab">${esc(sessName(w))} · logged ${d === today() ? 'today' : esc(fmtDate(d))}</span><span>${st.sets} working set${st.sets === 1 ? '' : 's'}${prs.length ? ` · ${prs.length} new best${prs.length > 1 ? 's' : ''}` : ''}. Open the log.</span></span>${CHEV6}</button>`; }
  return h + wSrc(d);
}

/* ---------- Trend screen: the Trends explorer on its own, opened on a metric with period W and the viewed day's week ---------- */
function vTrend() { return wBack() + explorerHTML(); }

/* ---------- Navigation: one back stack ---------- */
const NAV_SCREENS = ['health', 'sleep', 'recovery', 'strain', 'activity', 'trend', 'alcohol'];
function navLeave() { // what leaving a screen through the stack cleans up (the same as go() does for these)
  flushField();
  if (ui.tab === 'today') ui.editToday = false;
  if (ui.tab === 'log') { if (ui.logDate) dropEmpty(ui.logDate); ui.logEdit = null; }
  ui.exNote = null; ui.exHist = null; ui.exMore = null; ui.winfo = null; ui.alcEdit = null;
}
function navOpen(screen, params) {
  const here = { screen: ui.tab, params: ui.np || null, dayOff: ui.dayOff || 0, y: scrollY0(), logDate: ui.logDate };
  navLeave(); ui.nav.push(here); if (ui.nav.length > 10) ui.nav.shift();
  ui.tab = screen; ui.np = params || null;
  if (screen === 'trend') { ui.metric = params.m; ui.per = 'W'; ui.off = 0; ui.exEnd = params.d || today(); }
  if (screen === 'log') { ui.logDate = params.d; ui.logEdit = null; }
  if (screen === 'today') { ui.dayOff = 0; ui.editToday = true; ui.logDate = null; }
  resetScroll(); render(true);
}
function navBack() {
  const e = ui.nav.pop(); if (!e) { go('today'); return; }
  navLeave(); ui.tab = e.screen; ui.np = e.params; ui.dayOff = e.dayOff; ui.logDate = e.logDate ?? null;
  if (e.screen === 'trend') ui.exEnd = e.params?.d || today();
  resetScroll(); render(true);
  scrollToY(e.y); requestAnimationFrame(() => { if (Math.abs(scrollY0() - e.y) > 1) scrollToY(e.y); });
}
const WACT = {
  nav: el => { const s = el.dataset.s, p = { d: el.dataset.d || wDay() }; if (el.dataset.i != null) p.i = +el.dataset.i; if (el.dataset.m) p.m = el.dataset.m; navOpen(s, p); },
  navback: () => navBack(),
  navday: el => { ui.np = { ...(ui.np || {}), d: el.dataset.d }; render(true); }, // the same screen on another night; no stack entry
  navlog: el => { const d = el.dataset.d; if (d === today()) navOpen('today', {}); else navOpen('log', { d }); },
  wscroll: el => reveal('#' + el.dataset.id),
  winfo: el => infoSheet(el.dataset.k),
  alc: el => { const d = el.dataset.d, v = el.dataset.v === '1'; setAlc(d, v); ui.alcEdit = null; changed('dy', d); render(true); },
  alcedit: el => { ui.alcEdit = el.dataset.d; render(true); },
};
Object.assign(VIEWS, { health: vHealth, sleep: vSleep, recovery: vRecovery, strain: vStrain, activity: vActivity, trend: vTrend, alcohol: vAlcohol });
