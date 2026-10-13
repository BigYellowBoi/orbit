/* ============================================================
   VIEWS
   ============================================================ */
function pill(tone, text) { return `<span class="pill ${tone || ''}">${esc(text)}</span>`; }
function stat(v, unit, label, extra) { return `<div class="stat" data-live="${esc(label)}"><b>${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b><span>${esc(label)}</span>${extra || ''}</div>`; }
function deltaTxt(v, base, d = 0, unit = '', invert = false) {
  if (v == null || base == null) return '';
  const diff = v - base; if (Math.abs(diff) < 10 ** -d / 2) return `<span class="delta">= 30-day avg</span>`;
  const better = invert ? diff < 0 : diff > 0;
  return `<span class="delta" style="color:var(${better ? '--good-ink' : '--warn-ink'})">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), d)}${unit} vs 30-day</span>`;
}
function rxTxt(it) { const d = exDef(it.ex); return `${it.sets} × ${d.lo}${d.hi > d.lo ? '–' + d.hi : ''}`; }
function prevLine(exId, before) { const sg = suggest(exId, before); return (sg ? `<b class="aimtxt">Aim ${esc(suggestTxt(exId, sg))}</b> · ` : '') + esc(lastLine(exId, before)); }
function lastLine(exId, before) {
  const ix = lixEx(exId), n = nBefore(ix.list, before); // Best counts logged sets only; stated maxes just seed the Aim
  let b = null; for (let i = 0; i < n; i++) if (!b || ix.list[i].sc > b.sc) b = ix.list[i];
  const l = lastFor(exId, before), best = b ? `Best ${fmtSet(exId, b.top)}` : '';
  if (l) return `Last ${fmtDate(l.date)} · ${setsTxt(exId, l.sets)}${best ? ' · ' + best : ''}`;
  return 'Not logged yet';
}

/* ---------- Today: the next session, then today's log once it's started ---------- */
/* Day navigation on Today: ‹ › step through past days (what was logged, with that day's WHOOP numbers) and coming days
   (the planned session with its Aims, or rest, with a toggle to plan rest). Tapping the Today tab comes back. */
const CHEV = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
function dayNav(off) {
  return `<div class="daynav">${off ? '<button class="link" data-act="dayoff" data-n="0">Today</button>' : ''}<button class="iconbtn sm" data-act="dayoff" data-n="-1" aria-label="Previous day">${CHEV('M15 5l-7 7 7 7')}</button><button class="iconbtn sm" data-act="dayoff" data-n="1" aria-label="Next day">${CHEV('M9 5l7 7-7 7')}</button></div>`;
}
function vDay(off) {
  const d = addDays(today(), off), long = new Date(toUTC(d)).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'long' });
  let h = `<div class="page-h"><div><div class="eyebrow">${esc(fmtDow(d))} ${esc(fmtDate(d, { year: 'numeric' }))}</div><h1>${off === -1 ? 'Yesterday' : off === 1 ? 'Tomorrow' : esc(long)}</h1></div>${dayNav(off)}</div>`;
  if (off < 0) return h + pastDayHTML(d) + whoopCard(d);
  return h + futureDayHTML(d, off) + stripHTML();
}
function pastDayHTML(d) {
  const w = STATE.w[d] && !emptyW(STATE.w[d]) ? STATE.w[d] : null;
  if (!w) return `<section class="card hero"><div class="card-h"><span class="eyebrow">Nothing logged</span></div><p class="dim small">No session or rest day was logged on this day.</p><button class="btn sm ghost" data-act="openlog" data-d="${d}">Log this day</button></section>`;
  if (w.rest) return `<section class="card hero"><div class="card-h"><span class="eyebrow">Rest day</span>${pill('', 'Logged')}</div><div><h1>Rest</h1></div>${w.cardio?.done ? `<p class="small dim">${esc(w.cardio.name)} · ${w.cardio.min || 0} min</p>` : ''}<button class="btn sm ghost" data-act="openlog" data-d="${d}">Open log</button></section>`;
  const st = wStats(w), dur = sessDur(w), prs = prsIn(w), ex = (w.ex || []).filter(e => doneSets(e).length);
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Logged</span>${pill('good', 'Done')}</div>
    <div><h1>${esc(sessName(w))}</h1><p class="focus">${esc(sessDef(w.s)?.focus || '')}</p></div>
    <div class="stats">${stat(st.sets, '', 'sets')}${stat(dur ? fmtDur(dur) : '–', '', 'duration')}${stat(st.cardio || '–', st.cardio ? 'min' : '', w.cardio?.name || 'Cardio')}</div>
    ${ex.length ? `<ul class="exlist">${ex.map(e => `<li><span>${esc(exDef(e.id).name)}</span><span class="rx">${esc(setsTxt(e.id, doneSets(e)))}</span></li>`).join('')}</ul>` : ''}
    ${prs.length ? `<div class="chips">${prs.slice(0, 6).map(p => `<span class="pill acc">${esc(exDef(p.id).name)} ${esc(fmtSet(p.id, p.s))}</span>`).join('')}</div>` : ''}
    <button class="btn wide ghost" data-act="openlog" data-d="${d}">Open log</button></section>`;
}
function futureDayHTML(d, off) {
  const u = upcoming(off + 1)[off], sid = u.s, sd = sessDef(sid), o = order(), idx = o.indexOf(sid);
  if (sid === '_rest' || isRestSlot(sid)) return `<section class="card hero"><div class="card-h"><span class="eyebrow">${u.planned ? 'Planned rest' : 'Rest from your rotation'}</span></div>
    <div><h1>Rest</h1><p class="focus">${u.planned ? 'You planned this day off. The rotation waits, so the sessions after it move back a day.' : 'A rest slot in your rotation.'}</p></div>
    ${u.planned ? `<button class="btn sm ghost" data-act="restoff" data-date="${d}">Train this day instead</button>` : ''}</section>`;
  if (!sd) return '';
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Planned · ${idx + 1} of ${o.length}</span></div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sd.name)}</h1><p class="focus">${esc(sd.focus || '')}</p></div>
    <ul class="exlist">${sd.items.filter(it => S().ex[it.ex]).map(it => `<li><span>${esc(exDef(it.ex).name)}</span><span class="rx">${rxTxt(it)}</span><span class="lt">${prevLine(it.ex, d)}</span></li>`).join('')}
      <li><span>${esc(S().cardio.name)}</span><span class="rx">${S().cardio.min} min</span></li></ul>
    <div class="btnrow" style="justify-content:space-between"><span class="xs muted">Assumes you train each day until then.</span><button class="link dim" data-act="reston" data-date="${d}">Rest this day</button></div></section>`;
}
function vToday() {
  if (ui.dayOff) return vDay(ui.dayOff);
  const t = today(), w = STATE.w[t], sid = w ? w.s : sessionFor(t), sd = sessDef(sid), o = order(), idx = o.indexOf(sid);
  let h = `<div class="page-h"><div><div class="eyebrow">${esc(fmtDow(t))} ${esc(fmtDate(t, { year: 'numeric' }))}</div><h1>Today</h1></div><div class="hdr-r">${o.length ? `<span class="pill plain">Rotation ${rotationCount() + 1}</span>` : ''}${dayNav(0)}</div></div>`;
  const tail = () => whoopCard() + stripHTML() + weekCard();
  if (w && (!w.fin || ui.editToday)) return h + logBody(t) + tail(); // the log, until you press Done
  if (w) return h + doneHero(w, idx, o) + tail();
  if (!sd) return h + `<section class="card"><p>Your programme has no sessions. Add one in Plan.</p><button class="btn" data-act="go" data-tab="plan">Open Plan</button></section>`;
  if (plannedRest(t) && !sd.rest) return h + oneOffRestHero(t, sid) + tail();
  if (sd.rest) return h + plannedRestHero(sid) + tail();
  h += `<section class="card hero"><div class="card-h"><span class="eyebrow">Next up · ${idx + 1} of ${o.length}</span>${S().suggest !== false ? `<button class="pill ${S().goal === 'grow' ? 'acc' : ''}" data-act="goalflip" aria-label="Targets: ${esc(goalLabel())}. Tap to switch">${esc(goalLabel())}</button>` : ''}</div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sd.name)}</h1><p class="focus">${esc(sd.focus || '')}</p></div>
    <button class="btn wide" data-act="start" data-id="${sid}">Log ${esc(sd.name)}</button>
    <ul class="exlist">${sd.items.filter(it => S().ex[it.ex]).map(it => `<li><span>${esc(exDef(it.ex).name)}</span><span class="rx">${rxTxt(it)}</span><span class="lt">${prevLine(it.ex, t)}</span></li>`).join('')}
      <li><span>${esc(S().cardio.name)}</span><span class="rx">${S().cardio.min} min</span></li></ul>
    ${ui.pickSess === 'today' ? `<div class="sec"><span class="xs muted">Do a different session today. The rotation carries on from whichever you log.</span><div class="chips">${trainIds().map(id => `<button class="chip ${id === sid ? 'on' : ''}" data-act="setnext" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div></div>`
      : `<div class="btnrow" style="justify-content:space-between"><button class="link" data-act="picktoday">Change today's session</button><button class="link dim" data-act="restday">Rest day instead</button></div>`}</section>`;
  return h + tail();
}
function doneHero(w, idx, o) { // today after Done: a summary, with the log one tap away
  if (w.rest) return `<section class="card hero"><div class="card-h"><span class="eyebrow">Rest day${isRestSlot(w.s) ? ' · planned' : ''}</span>${pill('', 'Logged')}</div>
    <div><h1>Rest</h1><p class="focus">${isRestSlot(w.s) ? 'Planned rest from your rotation.' : 'The rotation waits.'} Tomorrow: ${esc(slotName(upcoming(2)[1].s))}.</p></div>
    ${w.cardio?.done ? `<p class="small dim">${esc(w.cardio.name)} · ${w.cardio.min || 0} min</p>` : ''}
    <div class="btnrow" style="justify-content:space-between"><button class="btn sm ghost" data-act="edittoday">${w.cardio?.done || w.note ? 'Edit day' : 'Log cardio or notes'}</button><button class="link dim" data-act="unrest">Undo rest day</button></div></section>`;
  const st = wStats(w), dur = sessDur(w), prs = prsIn(w);
  return `<section class="card hero${ui.justDone ? ' just' : ''}"><div class="card-h"><span class="eyebrow">Logged today · ${idx + 1} of ${o.length}</span>${pill('good', 'Done')}</div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sessName(w))}</h1><p class="focus">${esc(sessDef(w.s)?.focus || '')}</p></div>
    <div class="stats">${stat(st.sets, '', 'sets')}${stat(dur ? fmtDur(dur) : '–', '', dur && whoopLiftMin(w.date) != null ? 'duration · WHOOP' : 'duration')}${stat(st.cardio || '–', st.cardio ? 'min' : '', w.cardio?.name || 'Cardio')}</div>
    ${prs.length ? `<div class="chips">${prs.slice(0, 6).map(p => `<span class="pill acc">${esc(exDef(p.id).name)} ${esc(fmtSet(p.id, p.s))}</span>`).join('')}</div>` : ''}
    <button class="btn wide ghost" data-act="edittoday">Edit log</button></section>`;
}
function stripHTML() { // the next days; tap one to plan it as a rest day (or undo that)
  const up = upcoming(Math.max(5, order().length + 1)), t = today(), pick = up.find((u, i) => i > 0 && u.date === ui.restPick);
  const later = (S().restPlan || []).filter(d => d >= t).sort(), lab = d => `${fmtDow(d)} ${fmtDate(d)}`;
  let h = `<section class="sec"><div class="sec-h"><span class="eyebrow">Coming up</span><button class="link" data-act="restplan">${ui.restPlanOpen ? 'Done' : `Plan rest${later.length ? ` (${later.length})` : ''}`}</button></div><div class="strip">${up.map((u, i) => {
    const cls = `sd ${i === 0 ? (pick ? '' : 'now') + (u.done ? ' done' : '') : ''} ${u.s === '_rest' || isRestSlot(u.s) ? 'rest' : ''} ${u.planned ? 'planned' : ''} ${pick && pick.date === u.date ? 'pick' : ''}`;
    const inner = `<small>${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : esc(fmtDow(u.date))}</small><b>${esc(slotName(u.s))}</b>`;
    return i > 0 ? `<button class="${cls}" data-act="strippick" data-date="${u.date}" aria-label="${esc(lab(u.date))}: ${esc(slotName(u.s))}">${inner}</button>` : `<div class="${cls}" data-now="1">${inner}</div>`; }).join('')}</div>`;
  if (pick) h += `<div class="pickrow"><span><b>${esc(lab(pick.date))}</b> · ${pick.planned ? 'planned rest' : isRestSlot(pick.s) ? 'rest from your rotation' : esc(slotName(pick.s))}</span>${pick.planned ? `<button class="btn sm ghost" data-act="restoff" data-date="${pick.date}">Train this day</button>` : isRestSlot(pick.s) ? '' : `<button class="btn sm" data-act="reston" data-date="${pick.date}">Rest this day</button>`}</div>`;
  if (ui.restPlanOpen) h += `<section class="card"><div class="card-h"><h2>Planned rest days</h2></div>
    ${later.length ? `<div class="chips">${later.map(d => `<span class="pill plain restchip">${esc(lab(d))}<button class="ed-x sm" data-act="restoff" data-date="${d}" aria-label="Remove rest on ${esc(lab(d))}">${ICON.x}</button></span>`).join('')}</div>` : '<p class="xs muted">None yet.</p>'}
    <label class="fl">Add a day<input class="in" type="date" id="restadd" data-in="restadd" min="${t}"></label>
    <p class="xs muted">Tap a day above for this week, or pick any date here. On a planned rest day the rotation waits, so the sessions after it move back a day. If a rest slot from your rotation is due that day, the planned rest just fills it.</p></section>`;
  return h + `</section>`;
}
function oneOffRestHero(t, sid) { // today was planned as a rest day
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Planned rest</span></div>
    <div><h1>Rest</h1><p class="focus">You planned today off. The rotation waits: ${esc(slotName(sid))} is next when you train.</p></div>
    <div class="sec"><span class="xs muted">Train anyway</span><div class="chips">${[sid, ...trainIds().filter(id => id !== sid)].filter(id => sessDef(id)).map(id => `<button class="chip ${id === sid ? 'on' : ''}" data-act="start" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div></div>
    <div class="btnrow" style="justify-content:space-between"><button class="btn sm ghost" data-act="restday">Log rest day</button><button class="link dim" data-act="restoff" data-date="${t}">Cancel planned rest</button></div></section>`;
}
function plannedRestHero(sid) {
  const o = order(), idx = o.indexOf(sid), sd = sessDef(sid);
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Planned rest · ${idx + 1} of ${o.length}</span></div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sd.name)}</h1><p class="focus">Nothing to log. If you don't train today, the rotation moves on to ${esc(slotName(nextAfter(sid)))} tomorrow.</p></div>
    <div class="sec"><span class="xs muted">Train anyway</span><div class="chips">${trainIds().map(id => `<button class="chip" data-act="start" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div></div></section>`;
}
function weekCard() {
  const t = today(), ws = weekStart(t);
  const wk = Object.values(STATE.w).filter(w => w.date >= ws && w.date <= t && !w.rest && !emptyW(w));
  const sets = sum(wk.map(w => wStats(w).sets)), card = sum(wk.map(w => wStats(w).cardio));
  const kg = sum(wk.map(w => wStats(w).kg));
  const prs = wk.flatMap(w => prsIn(w));
  return `<section class="card"><div class="card-h"><h2>This week</h2><span class="eyebrow">from ${esc(fmtDate(ws))}</span></div>
    <div class="stats four">${stat(wk.length, '', 'sessions')}${stat(sets, '', 'working sets')}${stat(card, 'min', 'cardio')}${stat(kg ? fmt(kg / 1000, 1) : '–', kg ? 't' : '', 'moved')}</div>
    ${prs.length ? `<div class="sec"><span class="xs muted">New bests this week</span><div class="chips">${prs.slice(0, 6).map(p => `<span class="pill acc">${esc(exDef(p.id).name)} ${esc(fmtSet(p.id, p.s))}</span>`).join('')}</div></div>` : ''}</section>`;
}

/* ---------- WHOOP on Today: only this morning's numbers, so nothing stale shows ---------- */
function ring(v, tone, strain) { // inner ring: recovery (0–100%); outer ring: today's strain so far (0–21) in WHOOP blue, as on the WHOOP home screen
  const arc = (r, f, col, w) => { const c = 2 * Math.PI * r; return `<circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${w}"/>` + (f > 0 ? `<circle cx="56" cy="56" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * Math.min(1, f)).toFixed(1)} ${c.toFixed(1)}"/>` : ''); };
  const col = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' }[tone] || 'var(--ink-3)';
  return `<div class="ring" data-live="ring" role="img" aria-label="Recovery ${v == null ? 'unknown' : Math.round(v) + '%'}${strain != null ? `, strain ${fmt(strain, 1)}` : ''}"><svg viewBox="0 0 112 112">${arc(51, strain != null ? strain / 21 : 0, 'var(--strain)', 6)}${arc(40, Math.max(0, Math.min(100, v || 0)) / 100, col, 6)}</svg><b style="color:${col}">${v == null ? '–' : Math.round(v)}<small style="color:inherit;opacity:.75">%</small></b></div>`;
}
function whoopCard(day) {
  const t = day || today(), isT = t === today(), x = STATE.d[t];
  if (!x || (x.rec == null && x.slp == null)) return ''; // older numbers live in Body
  const tone = recTone(x.rec), hb = hrvBand(t), base = k => avgOver(k, t, 30, true)?.avg, str = x.str;
  let note = '';
  if (hb && hb.state === 'below' && tone !== 'bad') note = `<p class="note">Your 7-day HRV is below your normal range (${fmt(hb.lo, 0)}–${fmt(hb.hi, 0)} ms). A sustained drop often reflects accumulated fatigue, poor sleep or illness, so it's worth watching over the next few days.</p>`;
  if (tone === 'bad') note = `<p class="note">Red recovery. The rotation stays the same; a lighter day is reasonable, such as stopping sets 2–3 reps short and keeping the ${esc(S().cardio.name.toLowerCase())} easy. Treat the score as a guide, not a rule.</p>`;
  // key rows beside the ring, then a tile per secondary number; every cell has label, value and one sub line
  const val = (v, unit) => v == null ? '<b class="nil">–</b>' : `<b>${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b>`;
  const sub = (txt, tone) => txt ? `<em${tone ? ` class="tn-${tone}"` : ''}>${txt}</em>` : '<em>&nbsp;</em>'; // key rows keep the line, so they stay evenly spaced
  const vs = (v, b, d, unit, lowerBetter, neutral) => { // change from the 30-day average, one line
    if (v == null || b == null) return sub(''); const diff = v - b;
    if (Math.abs(diff) < 10 ** -d / 2) return sub('Same as 30-day');
    const better = lowerBetter ? diff < 0 : diff > 0;
    return sub(`${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), d)}${unit} vs 30-day`, neutral ? '' : better ? 'good' : 'warn');
  };
  const key = (label, v, s) => `<div class="rk" data-live="${esc(label)}"><span>${esc(label)}</span>${v}${s}</div>`;
  const tile = (label, v, s = '') => `<div class="rt" data-live="${esc(label)}"><span>${esc(label)}</span>${v}${s.includes('&nbsp;') ? '' : s}</div>`;
  const hbTone = hb ? { below: 'warn', within: 'good', above: '' }[hb.state] : '';
  const keys = [
    key('HRV', val(x.hrv != null ? fmt(x.hrv, 0) : null, 'ms'), hb ? sub(`7-day ${HRV_STATE[hb.state][1].toLowerCase()}`, hbTone) : sub('')),
    key('Resting HR', val(x.rhr != null ? fmt(x.rhr, 0) : null, 'bpm'), vs(x.rhr, base('rhr'), 0, '', true)),
    key('Sleep', val(x.slp != null ? fmt(x.slp / 60, 1) : null, 'h'), sub(x.sp != null ? `${fmt(x.sp, 0)}% of need` : '')),
  ];
  const tiles = [tile(isT ? 'Strain today' : 'Strain', str != null ? `<b class="strain">${fmt(str, 1)}</b>` : val(null))];
  if (x.sd) tiles.push(tile('Sleep debt', val(fmt(x.sd, 0), 'min')));
  const stT = stepsOf(t); if (stT != null) tiles.push(tile(isT ? 'Steps today' : 'Steps', val(fmt(stT, 0))));
  if (x.rr != null) tiles.push(tile('Respiratory', val(fmt(x.rr, 1), 'rpm'), vs(x.rr, base('rr'), 1, '', true)));
  if (x.spo2 != null) tiles.push(tile('Blood oxygen', val(fmt(x.spo2, 0), '%')));
  if (x.skt != null) tiles.push(tile('Skin temp', val(fmt(x.skt, 1), '°C'), vs(x.skt, base('skt'), 1, '°', false, true)));
  return `<section class="card rcard"><div class="card-h"><h2>Recovery</h2>${x.rec != null ? pill(tone, recWord(x.rec)) : ''}</div>
    <div class="rtop">${ring(x.rec, tone, str)}<div class="rkeys">${keys.join('')}</div></div>
    <div class="rtiles">${tiles.join('')}</div>${note}
    <span class="rsrc">WHOOP · ${isT ? 'today' : esc(fmtDate(t))}</span></section>`;
}

/* ---------- Log: one day's session. Today's renders inside Today; past days open from History ---------- */
function vLog() {
  const d = ui.logDate || today(), t = today();
  return `<button class="link" data-act="go" data-tab="history" style="align-self:flex-start">‹ History</button>
    <div class="dnav"><button class="iconbtn" data-act="logday" data-n="-1" aria-label="Previous day">‹</button><div class="dnav-c"><b>${esc(fmtDow(d) + ' ' + fmtDate(d))}</b><small>${esc(fmtDate(d, { weekday: 'long', year: 'numeric' }))}</small></div><button class="iconbtn" data-act="logday" data-n="1" aria-label="Next day">›</button></div>` + logBody(d);
}
function logBody(d) {
  const w = STATE.w[d], t = today();
  let h = '';
  if (w && w.rest) {
    if (autoCardio(w)) saveW(w.date);
    h += `<section class="card"><div class="card-h"><h2>Rest day</h2>${isRestSlot(w.s) ? pill('', 'Planned') : pill('', 'Logged')}</div><p class="small dim">No lifting logged.${d === t ? ` ${isRestSlot(w.s) ? 'Planned rest from your rotation.' : 'The rotation waits.'} Tomorrow: ${esc(slotName(sessionFor(addDays(d, 1))))}.` : ''} Cardio and notes are optional.</p>
      <div class="btnrow"><button class="link" data-act="unrest">Undo rest day</button></div></section>`;
    h += cardioCard(w);
    h += `<section class="card"><label class="fl">Notes<textarea class="in" id="wnote" data-in="note" placeholder="Optional">${esc(w.note || '')}</textarea></label></section>`;
    h += `<button class="btn wide" data-act="logdone">Done</button>`;
    return h;
  }
  if (!w) {
    const o = trainIds(), due = sessionFor(d), sid = ui.pickSess && sessDef(ui.pickSess) ? ui.pickSess : nextTraining(due), sd = sessDef(sid);
    if (!sd) return h + `<section class="card"><p>Add a session in Plan first.</p></section>`;
    h += `<section class="card"><div class="card-h"><span class="eyebrow">No session on this day</span>${isRestSlot(due) ? pill('', 'Planned rest') : ''}</div>
      <div class="chips">${o.map(id => `<button class="chip ${id === sid ? 'on' : ''}" data-act="picksess" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div>
      <ul class="exlist">${sd.items.filter(it => S().ex[it.ex]).map(it => `<li><span>${esc(exDef(it.ex).name)}</span><span class="rx">${rxTxt(it)}</span><span class="lt">${prevLine(it.ex, d)}</span></li>`).join('')}</ul>
      <button class="btn wide" data-act="start" data-id="${sid}">Log ${esc(sd.name)}</button>
      <button class="link dim" data-act="restday" style="align-self:flex-start">Mark as a rest day</button></section>`;
    return h;
  }
  const sd = sessDef(w.s), st = wStats(w), dur = sessDur(w), wl = whoopLiftMin(w.date);
  const nPlan = sum((w.ex || []).map(e => e.sets.length)), empty = emptyW(w);
  h += `<div class="sess-top"><div class="t"><b>${esc(sessName(w))}</b><small>${esc(sd?.focus || '')}${sd?.focus ? ' · ' : ''}${st.sets} / ${nPlan} sets${st.kg ? ` · ${fmt(st.kg / 1000, 1)} t moved` : ''}</small></div>
    ${dur ? pill('acc', fmtDur(dur)) : ''}</div>`;
  if (empty) h += `<div class="btnrow" style="justify-content:space-between"><span class="xs muted">Nothing logged yet.</span><button class="link dim" data-act="cancelw">Not training? Cancel session</button></div>`;
  const ln = lastSessionNote(w);
  if (ln) h += `<section class="card flat lastnote"><span class="eyebrow">Last ${esc(sessName(ln))} · ${esc(fmtDate(ln.date))}</span><p class="small">${esc(ln.note.trim())}</p></section>`;
  const lifts = whoopActs(w.date, LIFT_RE);
  if (lifts.length) h += lifts.map(a => `<p class="whoopact">WHOOP · ${esc(a.n)}${a.t ? ` from ${esc(a.t)}` : ''}${a.min ? ` · ${fmt(a.min, 0)} min` : ''}${a.str != null ? ` · strain ${fmt(a.str, 1)}` : ''}${a.ahr ? ` · avg ${fmt(a.ahr, 0)} bpm` : ''}${a.kcal ? ` · ${fmt(a.kcal, 0)} kcal` : ''}</p>`).join('');
  normSets(w); if (autoCardio(w)) saveW(w.date);
  const prSet = new Set(prsIn(w).map(p => p.s));
  w.ex.forEach((e, i) => { h += exCard(w, e, i, prSet); });
  const inW = new Set(w.ex.map(e => e.id));
  const opts = Object.entries(S().ex).filter(([id]) => !inW.has(id)).sort((a, b) => a[1].name.localeCompare(b[1].name));
  h += `<section class="card flat"><label class="fl">Add an exercise to this session<select class="in" id="addex" data-in="addex"><option value="">Choose…</option>${opts.map(([id, x]) => `<option value="${id}">${esc(x.name)}</option>`).join('')}</select></label></section>`;
  h += cardioCard(w);
  h += `<section class="card"><label class="fl">Duration (min)${wl != null ? ` · WHOOP's ${fmt(wl, 0)} min is used` : ''}<input class="in" id="wdur" inputmode="numeric" data-in="durmin" value="${w.durMin ?? ''}" placeholder="${wl != null ? fmt(wl, 0) : 'optional'}" ${wl != null ? 'disabled' : ''}></label>
    <label class="fl">Session notes<textarea class="in" id="wnote" data-in="note" placeholder="Anything worth remembering next time">${esc(w.note || '')}</textarea></label></section>`;
  h += `<button class="btn wide" data-act="logdone">Done</button>`;
  h += ui.confirm === 'delw' ? `<section class="card"><p>Delete this session and its sets?</p><div class="btnrow"><button class="btn danger sm" data-act="delw">Delete session</button><button class="link dim" data-act="confirm" data-v="">Keep it</button></div></section>`
    : `<button class="link danger" data-act="confirm" data-v="delw" style="align-self:flex-start">Delete this session</button>`;
  return h;
}
function exHistHTML(exId, before) { // the last few sessions of a lift, for a quick look mid-workout
  const rows = [];
  for (const w of workoutsSorted().reverse()) { if (w.date >= before) continue; const e = (w.ex || []).find(x => x.id === exId && doneSets(x).length); if (e) rows.push({ date: w.date, sets: doneSets(e), note: e.note }); if (rows.length >= 6) break; }
  if (!rows.length) return `<div class="exhist"><p class="xs muted">No earlier sessions of this lift yet.</p></div>`;
  return `<div class="exhist"><ul>${rows.map(r => `<li><span class="mono xs">${esc(fmtDate(r.date))}</span><span>${esc(setsTxt(exId, r.sets))}${r.note && r.note.trim() ? `<small>${esc(r.note.trim())}</small>` : ''}</span></li>`).join('')}</ul>
    <button class="link" data-act="liftgo" data-id="${exId}">Strength trend</button></div>`;
}
function exMoreHTML(w, e, i) { // swap keeps the slot and set count; same muscle group listed first
  const inW = new Set(w.ex.map(x => x.id)), g = exDef(e.id).g, all = Object.entries(S().ex).filter(([id]) => !inW.has(id)).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const same = all.filter(([, x]) => x.g === g), rest = all.filter(([, x]) => x.g !== g), opt = ([id, x]) => `<option value="${id}">${esc(x.name)}</option>`;
  return `<div class="ex-more"><label class="fl">Swap for<select class="in" id="swap${i}" data-in="swapex" data-e="${i}"><option value="">Choose…</option>${same.length ? `<optgroup label="${esc(GROUPS[g] || 'Same group')}">${same.map(opt).join('')}</optgroup>` : ''}<optgroup label="Everything else">${rest.map(opt).join('')}</optgroup></select></label>
    ${doneSets(e).length ? `<p class="xs muted">Swapping clears the sets logged for ${esc(exDef(e.id).name)}.</p>` : ''}
    <div class="btnrow" style="justify-content:space-between">${e.sets.length > 1 ? `<button class="link dim" data-act="remset" data-e="${i}">Remove last set</button>` : '<span></span>'}<button class="link danger" data-act="remex" data-e="${i}">Remove exercise</button></div></div>`;
}
function exCard(w, e, i, prSet) {
  const def = exDef(e.id), u = UNITS[def.u] || UNITS.kg, open = ui.exHist === i;
  const ph = (v, dflt) => v != null ? fmt(v, 2).replace(/,/g, '') : dflt, sg = suggest(e.id, w.date), back = e.sets.length > 1 ? setAim(e.id, w.date, 1, sg) : null;
  return `<section class="card ex" id="ex${i}"><div class="ex-h"><button class="ex-name" data-act="exhist" data-e="${i}" aria-expanded="${open}"><h3>${esc(def.name)}</h3><span class="chev">${ICON.down}</span></button><span class="rx">${def.lo}${def.hi > def.lo ? '–' + def.hi : ''} reps</span></div>
    ${open ? exHistHTML(e.id, w.date) : ''}
    ${sg ? `<p class="aim"><b>Aim ${esc(suggestTxt(e.id, sg))}</b>${back?.back ? `, then ${esc(fmtLoad(e.id, back.w))}${def.u === 'kg' ? ' kg' : ''}` : ''} · ${sg.rir} rep${sg.rir === 1 ? '' : 's'} in reserve${S().goal === 'grow' ? ' · overload' : ''}</p>` : ''}
    <p class="ex-meta">${esc(lastLine(e.id, w.date))}${def.note ? ` · ${esc(def.note)}` : ''}</p>
    ${(() => { const ln = e.note == null ? lastExerciseNote(e.id, w.date) : null; return ln ? `<p class="ex-lastnote">Note from ${esc(fmtDate(ln.date))}: ${esc(ln.note)}</p>` : ''; })()}
    <div class="sets"><div class="set hdr"><span>Set</span><span>${esc(u.col)}</span><span>Reps</span><span></span></div>
    ${e.sets.map((s, j) => { const a = setAim(e.id, w.date, j, sg); return `<div class="set ${s.done ? 'done' : ''} ${prSet.has(s) ? 'pr' : ''}" id="row${i}_${j}"><span class="sn">${j + 1}</span>
      <input class="in" id="w${i}_${j}" inputmode="decimal" enterkeyhint="next" data-in="w" data-e="${i}" data-s="${j}" value="${s.w ?? ''}" placeholder="${ph(a ? a.w : s.pw, def.u === 'bw' ? '0' : '–')}" aria-label="Set ${j + 1} ${esc(u.label)}">
      <input class="in" id="r${i}_${j}" inputmode="numeric" enterkeyhint="next" data-in="r" data-e="${i}" data-s="${j}" value="${s.r ?? ''}" placeholder="${ph(a ? a.r : s.pr, '–')}" aria-label="Set ${j + 1} reps">
      <span class="mark" aria-hidden="true">${ICON.tick}</span></div>`; }).join('')}</div>
    ${e.note != null || ui.exNote === i ? `<label class="fl">Exercise note<textarea class="in exnote" id="xn${i}" data-in="exnote" data-e="${i}" placeholder="Seat height, grip, how it felt">${esc(e.note || '')}</textarea></label>` : ''}
    <div class="ex-foot"><button class="link" data-act="addset" data-e="${i}">+ Set</button>${e.note == null && ui.exNote !== i ? `<button class="link dim" data-act="exnote" data-e="${i}">+ Note</button>` : ''}<button class="link dim more" data-act="exmore" data-e="${i}" aria-expanded="${ui.exMore === i}" aria-label="More for ${esc(def.name)}">${ui.exMore === i ? 'Close' : 'More'}</button></div>
    ${ui.exMore === i ? exMoreHTML(w, e, i) : ''}</section>`;
}
function cardioTypes() { return Object.keys(CARDIO_RE); }
function cardioCard(w) {
  if (w.cardio === null) return `<section class="card flat"><div class="card-h"><h2>Cardio</h2>${pill('', 'Removed')}</div><p class="small dim">No cardio for this session.</p>
    <div class="chips">${cardioTypes().map(n => `<button class="chip" data-act="cardiotype" data-v="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></section>`;
  const c = w.cardio || { name: S().cardio.name, min: S().cardio.min };
  const acts = whoopCardio(w.date, c.name), wmin = Math.round(sum(acts.map(a => a.min || 0))), fromW = c.done && c.src === 'whoop' && wmin > 0;
  return `<section class="card"><div class="card-h"><h2>${esc(c.name)}</h2>${c.done ? pill('good', fromW ? 'From WHOOP' : 'Done') : pill('', 'After lifting')}</div>
    <div class="chips" role="group" aria-label="Cardio type">${cardioTypes().map(n => `<button class="chip ${n === c.name ? 'on' : ''}" data-act="cardiotype" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="fields" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label class="fl">Minutes<input class="in" id="cmin" inputmode="numeric" data-in="cmin" value="${c.min ?? ''}" ${fromW ? 'disabled' : ''}></label><label class="fl">Level or note<input class="in" id="clvl" data-in="clvl" value="${esc(c.lvl ?? '')}" placeholder="optional"></label></div>
    ${acts.map(a => `<p class="whoopact">WHOOP · ${esc(a.n)}${a.t ? ` from ${esc(a.t)}` : ''}${a.min ? ` · ${fmt(a.min, 0)} min` : ''}${a.str != null ? ` · strain ${fmt(a.str, 1)}` : ''}${a.ahr ? ` · avg ${fmt(a.ahr, 0)} bpm` : ''}${a.kcal ? ` · ${fmt(a.kcal, 0)} kcal` : ''}</p>`).join('')}
    ${fromW ? `<p class="xs muted">Minutes come from WHOOP, which overrides anything entered by hand.</p>` : ''}
    <div class="btnrow">${fromW ? '' : `<button class="btn ${c.done ? 'ghost' : ''}" data-act="cardio">${c.done ? 'Mark not done' : `Log ${esc(c.name.toLowerCase())}`}</button>`}<button class="link danger" data-act="cardiorem" style="margin-left:auto">Remove</button></div></section>`;
}

/* ---------- History ---------- */
function vHistory() {
  const ws = workoutsSorted().reverse().filter(w => !emptyW(w)), nNotes = noteEntries().length;
  let h = `<div class="page-h"><div><div class="eyebrow">${ws.filter(w => !w.rest).length} sessions logged</div><h1>History</h1></div>
    <div class="seg" role="group" aria-label="View"><button class="${ui.hist !== 'notes' ? 'on' : ''}" data-act="histview" data-v="sessions">Sessions</button><button class="${ui.hist === 'notes' ? 'on' : ''}" data-act="histview" data-v="notes">Notes${nNotes ? ` ${nNotes}` : ''}</button></div></div>`;
  if (ui.hist === 'notes') return h + vNotes();
  h += `<button class="link" data-act="pastlog" style="align-self:flex-start">+ Log a past day</button>`;
  if (!ws.length) return h + `<section class="card"><p class="dim">Sessions you log appear here, grouped by week. Tap one to open or edit it.</p></section>`;
  let wk = null;
  for (const w of ws) {
    const s = weekStart(w.date);
    if (s !== wk) {
      if (wk) h += `</div>`;
      wk = s; const inW = ws.filter(x => weekStart(x.date) === s && !x.rest);
      h += `<div class="sec-h"><span class="eyebrow">Week of ${esc(fmtDate(s))}</span><span class="xs muted">${inW.length} sessions · ${sum(inW.map(x => wStats(x).sets))} sets</span></div><div class="hist">`;
    }
    const st = wStats(w), prs = prsIn(w).length, rec = dayVal(w.date, 'rec'), str = dayVal(w.date, 'str');
    h += `<button class="hrow" data-act="openlog" data-d="${w.date}"><span class="hdate"><b>${esc(w.date.slice(8))}</b><small>${esc(fmtDow(w.date))}</small></span>
      <span class="hmain"><b${w.rest ? ' class="dim"' : ''}>${esc(sessName(w))}</b><small>${w.rest ? (st.cardio ? `${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : 'No training') : `${st.sets} sets`}${sessDur(w) ? ` · ${fmtDur(sessDur(w))}` : ''}${!w.rest && st.cardio ? ` · ${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : ''}${prs ? ` · ${prs} best${prs > 1 ? 's' : ''}` : ''}</small></span>
      ${rec != null || str != null ? `<span class="hwh">${rec != null ? `<b class="tn-${recTone(rec)}" aria-label="Recovery ${Math.round(rec)}%">${Math.round(rec)}%</b>` : ''}${str != null ? `<b class="strain" aria-label="Strain ${fmt(str, 1)}">${fmt(str, 1)}</b>` : ''}</span>` : '<span></span>'}${w.note && w.note.trim() ? `<span class="hnote">${esc(w.note.trim())}</span>` : ''}</button>`;
  }
  return h + `</div>`;
}

/* ---------- Strength: every lift in one table, one chart ---------- */
function liftIds() {
  const ids = [...new Set(order().flatMap(id => sessDef(id).items.map(it => it.ex)))].filter(id => S().ex[id]);
  const others = Object.keys(S().ex).filter(id => !ids.includes(id) && records(id)?.logged);
  return [...ids, ...others].filter(id => records(id));
}
function vStrength() {
  const t = today(), ids = liftIds();
  let h = `<div class="page-h"><div><div class="eyebrow">From your logbook</div><h1>Strength</h1></div></div>`;
  if (!ids.length) return h + `<section class="card"><p class="dim small">Log a session, or add your maxes under Plan → Exercises, and your lifts show up here.</p></section>`;
  const pick = ui.lift && ids.includes(ui.lift) ? ui.lift : (ids.find(id => liftSeries(id).length) || ids[0]);
  const ser = liftSeries(pick), from = ser.length && diffDays(ser[0].date, t) > 27 ? ser[0].date : addDays(t, -27), ax = dateAxis(from, t), xi = d => diffDays(from, d), u = exDef(pick).u;
  const cards = [];
  cards.push({ k: 'chart', t: 'Lift chart', h: `<section class="card" id="liftchart"><label class="fl">Lift<select class="in" id="liftpick" data-in="lift">${ids.map(id => `<option value="${id}" ${id === pick ? 'selected' : ''}>${esc(exDef(id).name)}</option>`).join('')}</select></label>
    <div class="card-h"><span class="small dim">${u === 'bw' && !bwScored(pick) ? 'Best reps per session' : `Estimated 1RM per session (${u === 'plates' ? 'plates / side' : u === 'bw' ? 'kg, body weight included' : 'kg'})`}</span></div>
    ${chartHTML({ h: 170, ...ax, refY: null, yPad: u === 'plates' ? .1 : 1, yFmt: v => fmt(v, u === 'plates' ? 2 : 0), series: [{ color: 'var(--s1)', pts: ser.map(p => ({ x: xi(p.date), y: p.y })), dots: true, r: 3.5, end: true }], hoverXs: ser.map(p => xi(p.date)), tip: x => { const p = ser.find(q => xi(q.date) === x); return p ? `<b>${esc(fmtDate(p.date))}</b><br>${esc(fmtSet(pick, p.top))} · ${esc(scoreTxt(pick, p.y))}` : ''; }, empty: 'No sets logged for this lift yet', label: 'Lift trend' })}</section>` });
  const bestLogged = id => lixEx(id).list.reduce((a, x) => !a || x.sc > a.sc ? x : a, null); // stated maxes are only a starting point for the Aim, so Best waits for real sets
  cards.push({ k: 'lifts', t: 'Lifts table', h: `<section class="card"><div class="tblwrap"><table class="tbl lifts"><thead><tr><th>Lift</th><th class="n">Best</th><th class="n">Last</th><th class="n">4 wk</th></tr></thead><tbody>
    ${ids.map(id => { const r = records(id), m = maintenance(id), [tone, word] = MSTATE[m.state]; return `<tr class="${id === pick && ui.lift ? 'sel' : ''}" data-act="liftsel" data-id="${id}"><td>${esc(exDef(id).name)}</td>
      <td class="n">${(b => b ? `${esc(fmtSet(id, b.top))}<br><span class="xs muted">${esc(fmtDMY(b.date))}</span>` : '<span class="muted">–</span>')(bestLogged(id))}</td>
      <td class="n">${m.last ? `${esc(fmtSet(id, m.last.top))}<br><span class="xs muted">${esc(fmtDate(m.last.date))}</span>` : '<span class="muted">–</span>'}</td>
      <td class="n">${tone ? `<span class="pill plain ${tone}" title="${word}">${(m.ch >= 0 ? '+' : '−') + fmt(Math.abs(m.ch), 1)}%</span>` : `<span class="xs muted">${m.state === 'new' ? 'Too new' : '–'}</span>`}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="xs muted">Best: strongest logged set. 4 wk: your typical session over the last 4 weeks against the 2 months before; green is within 2.5% or up, amber down to 5%, red further. Too new: nothing older to compare yet.</p></section>` });
  // Bands from research, not from the plan: ~3 hard sets a week held size and strength in younger adults (Bickel et al., 2011:
  // a ninth of the training dose, one set of each of three exercises once a week); 10-20 a week is the usual growth range,
  // with diminishing returns above it (Schoenfeld et al., 2017; Pelland et al., 2024).
  const HOLD = 3, GLO = 10, GHI = 20, plan = planWeekly(S().prog), done = doneByGroup(addDays(t, -6), t), gs = GROUP_ORDER.filter(g => plan[g] || done[g]);
  const mx = Math.max(GHI + 2, ...gs.map(g => done[g] || 0)), pc = v => v / mx * 100;
  const tone = n => n < HOLD ? 'warn' : n >= GLO ? 'good' : '';
  cards.push({ k: 'volume', t: 'Volume, last 7 days', h: `<section class="sec" data-card="volume"><div class="sec-h"><span class="eyebrow">Volume · last 7 days</span></div><section class="card"><div class="legend"><span><i class="ln" style="background:var(--s1);height:8px;width:12px"></i>Sets done</span><span><i class="tk"></i>Hold, ~${HOLD}</span><span><i class="bandk"></i>Grow, ${GLO}–${GHI}</span></div>
    <ul class="hbars">${gs.map(g => { const n = done[g] || 0; return `<li><span class="lab">${esc(GROUPS[g])}</span><span class="trk"><span class="band" style="left:${pc(GLO)}%;width:${pc(GHI) - pc(GLO)}%"></span><span class="fill" style="width:${pc(Math.min(n, mx))}%"></span><span class="tgt" style="left:calc(${pc(HOLD)}% - 1px)"></span></span><span class="v ${tone(n) ? 'tn-' + tone(n) : ''}">${fmt(n, 1)}</span></li>`; }).join('')}</ul>
    <p class="xs muted">Hard sets per muscle, last 7 days; compounds count half for the muscles they also work. About 3 a week holds (Bickel et al., 2011); 10–20 grows (Schoenfeld et al., 2017; Pelland et al., 2024).</p></section></section>` });
  return h + arrange('strength', cards);
}

/* ---------- card order on Strength and Body (the reorder button left of the gear) ---------- */
const WKCOLS = { sessions: 'Sessions', sets: 'Sets', cardio: 'Cardio', rec: 'Recovery', hrv: 'HRV', slp: 'Sleep', kcal: 'kcal', p: 'Protein', dtw: 'Weight Δ' };
function wkCols() { const all = Object.keys(WKCOLS), saved = (S().layout?.wkcols || []).filter(k => WKCOLS[k]); return [...saved, ...all.filter(k => !saved.includes(k))]; }
function cardOrder(tab, keys) { const saved = (S().layout?.[tab] || []).filter(k => keys.includes(k)); return [...saved, ...keys.filter(k => !saved.includes(k))]; }
const CARD_KEYS = {};
function arrange(tab, cards) { // cards: [{ k, t, h }] in default order; h is '' when a card has nothing to show
  CARD_KEYS[tab] = cards.map(c => c.k);
  if (ui.reo?.tab !== tab) return cardOrder(tab, CARD_KEYS[tab]).map(k => cards.find(c => c.k === k)?.h || '').join('');
  const shown = ui.reo.cards.filter(k => cards.some(c => c.k === k && c.h));
  return `<p class="xs muted">Drag the handles to change the order, then tap Done.</p><div class="dlist reo" data-list="cards">${shown.map(k => `<div class="reo-item" data-dragitem data-k="${k}"><div class="reo-h"><span class="grip" data-grip="card" aria-label="Drag to move ${esc(cards.find(c => c.k === k).t)}" role="button" tabindex="-1">${ICON.grip}</span><b>${esc(cards.find(c => c.k === k).t)}</b></div>
    ${k === 'weekly' ? `<span class="xs muted">Columns, left to right</span><div class="dlist reo-cols" data-list="cols">${ui.reo.cols.map(col => `<div class="reo-item sm" data-dragitem data-k="${col}"><span class="grip" data-grip="col" aria-label="Drag to move ${esc(WKCOLS[col])}" role="button" tabindex="-1">${ICON.grip}</span><span>${esc(WKCOLS[col])}</span></div>`).join('')}</div>` : ''}</div>`).join('')}</div>
    <div class="btnrow" style="justify-content:space-between"><button class="link dim" data-act="reoreset">Reset to default</button><button class="btn sm" data-act="reodone">Done</button></div>`;
}

/* ---------- Body: WHOOP and MacroFactor ---------- */
function freshHTML() { // how current each source is, so lagging data is obvious
  const t = today(), wd = latestWith('rec') || latestWith('slp'), md = latestWith('kcal') || latestWith('tw') || latestWith('wt');
  // Colour alone shows freshness (green: today or yesterday, grey: 2-3 days, amber: older or none); the dates are on the Data screen.
  // "MacroFactor" means intake and weight from any route: MacroFactor writes them to Apple Health, so Health Auto Export keeps it fresh without an upload.
  const one = (name, d) => { const age = d ? diffDays(d, t) : null, tone = d == null ? 'warn' : age <= 1 ? 'good' : age <= 3 ? '' : 'warn'; return `<span class="pill plain ${tone}" title="${esc(d ? `${name}: latest ${fmtDate(d)}` : `${name}: nothing yet`)}" aria-label="${esc(d ? `${name}, latest ${fmtDate(d)}` : `${name}, nothing yet`)}">${esc(name)}</span>`; };
  const hd = latestWith('stpi') || latestWith('hp');
  return `<div class="chips one" aria-label="Latest data from each source">${one('WHOOP', wd)}${one('MacroFactor', md)}${hd ? one('Apple Health', hd) : ''}</div>`;
}
function vBody() {
  let h = `<div class="page-h"><div><div class="eyebrow">WHOOP · MacroFactor · Apple Health</div><h1>Body</h1></div></div>`;
  h += freshHTML();
  const cards = [{ k: 'trends', t: 'Trends', h: explorerHTML() }, { k: 'alcohol', t: 'Alcohol and recovery', h: alcoholCard() }];
  const ra = recoveryAfter().filter(r => r.n >= 2).sort((a, b) => b.avg - a.avg);
  if (ra.length >= 2) cards.push({ k: 'recafter', t: 'Recovery the morning after', h: `<section class="card"><div class="card-h"><h2>Recovery the morning after</h2><span class="eyebrow">all time</span></div><p class="xs muted">Average next-day WHOOP recovery after each session type. Small samples move a lot; read it as a hint.</p>
    <ul class="hbars">${ra.map(r => `<li><span class="lab">${esc(r.k)}</span><span class="trk"><span class="fill" style="width:${Math.max(2, r.avg)}%;background:var(--${recTone(r.avg)})"></span></span><span class="v">${fmt(r.avg, 0)}% <span class="muted">n${r.n}</span></span></li>`).join('')}</ul></section>` });
  const nW = ui.weeksAll ? 26 : 8, wrows = weekRows(nW).filter(r => r.sessions || r.rec != null || r.kcal != null || r.tw != null);
  if (wrows.length) {
    const c = (v, d = 0, u = '') => v == null ? '<span class="muted">–</span>' : fmt(v, d) + u;
    const cols = ui.reo?.tab === 'body' ? ui.reo.cols : wkCols(), m = '<span class="muted">–</span>';
    const cell = { sessions: r => r.sessions || m, sets: r => r.sets || m, cardio: r => r.cardio ? r.cardio + ' min' : m, rec: r => r.rec != null ? `<span style="color:var(--${recTone(r.rec)}-ink)">${fmt(r.rec, 0)}%</span>` : m,
      hrv: r => c(r.hrv, 0), slp: r => r.slp != null ? fmt(r.slp / 60, 1) + ' h' : m, kcal: r => c(r.kcal, 0), p: r => c(r.p, 0, ' g'), dtw: r => r.dtw != null ? (r.dtw >= 0 ? '+' : '−') + fmt(Math.abs(r.dtw), 2) : m };
    cards.push({ k: 'weekly', t: 'Weekly summary', h: `<section class="sec"><div class="sec-h"><span class="eyebrow">Weekly summary</span><span class="xs muted">weeks start Monday</span></div><section class="card"><div class="tblwrap"><table class="tbl wk"><thead><tr><th>Week</th>${cols.map(k => `<th class="n">${esc(WKCOLS[k])}</th>`).join('')}</tr></thead><tbody>
      ${wrows.map(r => `<tr><td>${esc(fmtDate(r.ws))}${r.cur ? ' <span class="xs muted">so far</span>' : ''}</td>${cols.map(k => `<td class="n">${cell[k](r)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div><div class="btnrow" style="justify-content:space-between"><span class="xs muted">Daily averages; sessions, sets and cardio are totals. Weight Δ is the trend weight change.</span><button class="link" data-act="weeksall">${ui.weeksAll ? 'Show 8 weeks' : 'Show 26 weeks'}</button></div></section></section>` });
  }
  return h + arrange('body', cards);
}

/* ---------- Plan ---------- */
/* Exercise search: every word has to appear in the name, muscle group or load unit. Typing filters the rendered rows
   in place (filterEx in boot.js) so the keyboard stays up; ui.exQ keeps the filter across re-renders, e.g. Edit and Save. */
function exHay(x) { return `${x.name} ${GROUPS[x.g] || ''} ${UNITS[x.u]?.label || ''}`.toLowerCase(); }
function exMatch(hay, q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w)); }
function progSig(p) { return JSON.stringify({ o: p.order, s: Object.fromEntries(Object.entries(p.sessions).map(([k, v]) => [k, v.items.map(i => i.ex + i.sets)])) }); }
function vPlan() {
  const cur = S().prog, sig = progSig(cur), o = order();
  const match = Object.keys(PRESETS).find(k => progSig(PRESETS[k]) === sig);
  // Edited (sets, order, an exercise swapped): the closest preset stays selected, marked edited, rather than none
  const pairs = p => new Set(Object.entries(p.sessions).flatMap(([sid, sd]) => sd.items.map(i => sid + ':' + i.ex)));
  const mine = pairs(cur), near = match || Object.keys(PRESETS).map(k => { const ps = pairs(PRESETS[k]); return { k, sc: [...ps].filter(x => mine.has(x)).length / Math.max(ps.size, mine.size, 1) }; }).sort((a, b) => b.sc - a.sc).find(x => x.sc >= 0.5)?.k;
  let h = `<div class="page-h"><div><div class="eyebrow">${match ? esc(PRESETS[match].name) : near ? esc(PRESETS[near].name) + ', edited' : 'Custom split'} · ${trainIds().length} sessions${o.length > trainIds().length ? ` + ${o.length - trainIds().length} rest` : ''}</div><h1>Plan</h1></div></div>`;
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Split</span></div><div class="grid2">${Object.entries(PRESETS).map(([k, p]) => `<button class="opt ${near === k ? 'on' : ''}" data-act="preset" data-id="${k}"><b>${esc(p.name)}${near === k && !match ? ' <span class="xs muted">· edited</span>' : ''}</b><span class="seqs">${p.order.map(id => esc(p.sessions[id].name)).join(' → ')}</span><span>${esc(p.blurb)}</span></button>`).join('')}</div>
    ${ui.confirm && ui.confirm.startsWith('preset:') ? `<div class="prev"><p>${ui.confirm.slice(7) === near && !match ? `Reset to the original <b>${esc(PRESETS[near].name)}</b>? Your edits to the session lists are undone` : `Switch to <b>${esc(PRESETS[ui.confirm.slice(7)].name)}</b>? Your session lists are replaced`}; logged sessions and history stay as they are.</p><div class="btnrow"><button class="btn sm" data-act="usepreset" data-id="${ui.confirm.slice(7)}">${ui.confirm.slice(7) === near && !match ? 'Reset' : 'Switch'}</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div></div>` : ''}</section>`;

  h += progressionCard();

  // weekly sets comparison
  const cols = [['ppl4', PRESETS.ppl4], ['ulppl5', PRESETS.ulppl5]]; if (!match) cols.push(['yours', cur]);
  const vols = cols.map(([, p]) => planWeekly(p));
  const gs = GROUP_ORDER.filter(g => vols.some(v => v[g]));
  h += `<section class="card"><div class="card-h"><h2>Weekly sets by muscle</h2><span class="eyebrow">training daily</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Muscle</th>${cols.map(([k, p]) => `<th class="n">${k === 'yours' ? 'Yours' : k === 'ppl4' ? 'Current' : 'U/L/PPL'}</th>`).join('')}</tr></thead><tbody>
    ${gs.map(g => `<tr><td>${esc(GROUPS[g])}</td>${vols.map((v, i) => { const base = vols[0][g] || 0, x = v[g] || 0; const tag = i && x > base + .5 ? ' <span class="xs" style="color:var(--accent)">▲</span>' : i && x < base - .5 ? ' <span class="xs muted">▼</span>' : ''; return `<td class="n">${fmt(x, 1)}${tag}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="xs muted">Direct sets a week if you train daily. Growth needs about 10–20; holding far less.</p></section>`;

  // sessions editor
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Sessions, in rotation order</span><span class="btnrow"><button class="link" data-act="addrest">+ Rest day</button><button class="link" data-act="addsess">+ Session</button></span></div>`;
  const delBtn = sid => ui.confirm === 'dels:' + sid ? `<span class="btnrow"><button class="btn danger sm" data-act="delsess" data-id="${sid}">${sessDef(sid).rest ? 'Remove' : 'Delete'}</button><button class="link dim" data-act="confirm" data-v="">Keep</button></span>` : `<button class="link danger" data-act="confirm" data-v="dels:${sid}">${sessDef(sid).rest ? 'Remove rest day' : 'Delete session'}</button>`;
  h += `<div class="dlist" data-list="sess">`;
  o.forEach(sid => {
    const sd = sessDef(sid), open = ui.openSess.has(sid), nSets = sum(sd.items.map(i => i.sets));
    const meta = sd.rest ? 'Rest slot' : `${esc(sd.focus || '')}${sd.focus ? ' · ' : ''}${sd.items.length} exercises · ${nSets} sets`;
    h += `<section class="card sess ${open ? 'open' : ''} ${sd.rest ? 'flat' : ''}" data-dragitem data-id="${sid}">
      <div class="sess-h"><span class="grip" data-grip="sess" aria-label="Drag to reorder ${esc(sd.name)}" role="button" tabindex="-1">${ICON.grip}</span>
        <button class="sess-t" data-act="togglesess" data-id="${sid}" aria-expanded="${open}"><span><b>${esc(sd.name)}</b><small>${meta}</small></span><span class="chev">${ICON.down}</span></button></div>`;
    if (open) {
      if (sd.rest) h += `<div class="sess-b"><p class="xs muted">Any day you don't log a session fills this slot, and the rotation moves on. Train on the day instead and it's skipped.</p><div class="btnrow" style="justify-content:flex-end">${delBtn(sid)}</div></div>`;
      else h += `<div class="sess-b"><div class="fields" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)"><label class="fl">Name<input class="in left" id="sn_${sid}" data-in="sname" data-id="${sid}" value="${esc(sd.name)}"></label><label class="fl">Focus<input class="in left" id="sf_${sid}" data-in="sfocus" data-id="${sid}" value="${esc(sd.focus || '')}"></label></div>
        <div class="dlist" data-list="item" data-id="${sid}">${sd.items.map((it, j) => { const d = exDef(it.ex); return `<div class="ed-item" data-dragitem data-j="${j}"><span class="grip" data-grip="item" aria-label="Drag to reorder ${esc(d.name)}" role="button" tabindex="-1">${ICON.grip}</span><span class="nm">${esc(d.name)}<small>${esc(GROUPS[d.g] || '')} · ${d.lo}–${d.hi} reps</small></span>
          <input class="in" id="ss_${sid}_${j}" inputmode="numeric" data-in="isets" data-id="${sid}" data-j="${j}" value="${it.sets}" aria-label="Sets for ${esc(d.name)}">
          <button class="ed-x" data-act="remitem" data-id="${sid}" data-j="${j}" aria-label="Remove ${esc(d.name)}">${ICON.x}</button></div>`; }).join('')}</div>
        <label class="fl">Add exercise<select class="in" id="sa_${sid}" data-in="additem" data-id="${sid}"><option value="">Choose…</option>${Object.entries(S().ex).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, x]) => `<option value="${id}">${esc(x.name)}</option>`).join('')}</select></label>
        <div class="btnrow" style="justify-content:flex-end">${delBtn(sid)}</div></div>`;
    }
    h += `</section>`;
  });
  h += `</div><p class="xs muted">Drag the handles to reorder.</p>`;
  h += `</section>`;

  // exercise library
  const exs = Object.entries(S().ex).sort((a, b) => GROUP_ORDER.indexOf(a[1].g) - GROUP_ORDER.indexOf(b[1].g) || a[1].name.localeCompare(b[1].name));
  const q = ui.exQ || '', shown = exs.filter(([id, x]) => ui.editEx === id || exMatch(exHay(x), q)).length;
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Exercises</span><button class="link" data-act="newex">+ Exercise</button></div><section class="card">
    <div class="srch">${ICON.search}<input class="in left" id="exq" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search by name or muscle" aria-label="Search exercises" value="${esc(q)}"><button class="srch-x" id="exqx" data-act="exqclear" aria-label="Clear search" ${q ? '' : 'hidden'}>${ICON.x}</button></div>
    <ul class="rows exlist" id="exlist">
    ${exs.map(([id, x]) => { const hide = ui.editEx !== id && !exMatch(exHay(x), q) ? ' hidden' : '', hay = ` data-q="${esc(exHay(x))}"`; return ui.editEx === id ? `<li style="display:block" data-edit="1"${hay}>${exEditor(id, x)}</li>` : `<li${hay}${hide}><span>${esc(x.name)}</span><button class="link" data-act="editex" data-id="${id}">Edit</button><span class="sub">${esc(GROUPS[x.g] || '')} · ${esc(UNITS[x.u]?.label || x.u)} · ${x.lo}–${x.hi} reps${x.base && x.base.r ? ` · max ${esc(fmtSet(id, x.base))}` : ''}</span></li>`; }).join('')}
  </ul><p class="xs muted" id="exnone" ${shown ? 'hidden' : ''}>No exercises match.</p></section></section>`;

  // settings
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Settings</span></div><section class="card"><div class="fields">
    <label class="fl">Cardio after lifting<select class="in" id="st_cn" data-in="cname">${cardioTypes().map(n => `<option value="${n}" ${n === S().cardio.name ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fl">Cardio minutes<input class="in" id="st_cm" inputmode="numeric" data-in="cmindef" value="${S().cardio.min}"></label>
    <label class="fl">Plate weight (kg)<input class="in" id="st_pk" inputmode="decimal" data-in="platekg" value="${S().plateKg}"></label>
    <label class="fl">Protein target (g)<input class="in" id="st_pt" inputmode="numeric" data-in="proteint" value="${S().proteinT ?? ''}" placeholder="from MacroFactor"></label>
    <label class="fl">Suggested weight and reps<select class="in" id="st_sg" data-in="suggest"><option value="1" ${S().suggest !== false ? 'selected' : ''}>On</option><option value="0" ${S().suggest === false ? 'selected' : ''}>Off</option></select></label>
  </div><p class="xs muted">Plate weight converts plate machines to kg for tonnage.</p>
  <p class="xs muted">Aims follow Targets above. Change a lift's weight step or reps in reserve under Exercises.</p></section></section>`;
  return h;
}
function goalLabel() { return S().goal === 'grow' ? `Overload +${fmt((S().progRate ?? 0.005) * 100, 2)}%/wk` : 'Maintenance'; }
function progressionCard() {
  const ids = [...new Set(order().flatMap(id => sessDef(id).items.map(it => it.ex)))].filter(id => S().ex[id] && strengthRef(id, today()));
  if (!ids.length) return '';
  const grow = S().goal === 'grow', pick = ui.progLift && ids.includes(ui.progLift) ? ui.progLift : ids[0], rate = S().progRate ?? 0.005;
  const plan = progression(pick, 8, rate), hold = holdTarget(pick, today()), d = exDef(pick), rir = exRir(pick);
  const rates = [[0.0025, '0.25%'], [0.005, '0.5%'], [0.01, '1%']];
  return `<section class="sec"><div class="sec-h"><span class="eyebrow">Targets · next 8 weeks</span></div><section class="card">
    <div class="btnrow" style="justify-content:space-between"><span class="xs muted">Today's Aim follows</span><div class="seg" role="group" aria-label="Goal"><button class="${grow ? '' : 'on'}" data-act="goal" data-v="hold">Maintenance</button><button class="${grow ? 'on' : ''}" data-act="goal" data-v="grow">Overload</button></div></div>
    <div class="btnrow" style="justify-content:space-between"><span class="xs muted">Overload gain a week</span><div class="seg" role="group" aria-label="Weekly gain">${rates.map(([r, l]) => `<button class="${Math.abs(rate - r) < 1e-9 ? 'on' : ''}" data-act="prograte" data-v="${r}">${l}</button>`).join('')}</div></div>
    ${grow && cutCheck() ? (() => { const c = cutCheck(); return `<p class="small warnnote">Your trend weight is falling about ${fmt(Math.abs(c.wk), 2)} kg a week (${fmt(Math.abs(c.pct), 1)}%). In a deficit like that strength usually holds but gains slow down (Murphy &amp; Koehler, 2022), so Overload at +${fmt(rate * 100, 2)}%/wk may outrun you. Maintenance, or the 0.25% rate, fits better until the cut ends.</p>`; })() : ''}
    <label class="fl">Lift<select class="in" id="proglift" data-in="proglift">${ids.map(id => `<option value="${id}" ${id === pick ? 'selected' : ''}>${esc(exDef(id).name)}</option>`).join('')}</select></label>
    ${plan ? `<div class="tblwrap"><table class="tbl goal"><thead><tr><th>Week</th><th class="n ${grow ? '' : 'act'}">Maintenance</th><th class="n ${grow ? 'act' : ''}">Overload</th><th class="n">Gain</th></tr></thead><tbody>
      ${plan.map(p => `<tr><td>Week ${p.k}</td><td class="n ${grow ? '' : 'act'}">${hold ? esc(suggestTxt(pick, hold)) : '–'}</td><td class="n ${grow ? 'act' : ''}">${esc(suggestTxt(pick, p))}</td><td class="n">+${fmt(p.g * 100, 1)}%</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <p class="xs muted">Both leave ${rir} rep${rir === 1 ? '' : 's'} in reserve and update from your logged sets. Overload adds reps before load.</p></section></section>`;
}
function exEditor(id, x) {
  return `<div class="sec"><div class="fields">
    <label class="fl full">Name<input class="in left" id="xe_n" value="${esc(x.name)}"></label>
    <label class="fl">Muscle<select class="in" id="xe_g">${GROUP_ORDER.map(g => `<option value="${g}" ${g === x.g ? 'selected' : ''}>${GROUPS[g]}</option>`).join('')}</select></label>
    <label class="fl">Load unit<select class="in" id="xe_u">${Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === x.u ? 'selected' : ''}>${u.label}</option>`).join('')}</select></label>
    <label class="fl">Reps from<input class="in" id="xe_lo" inputmode="numeric" value="${x.lo}"></label>
    <label class="fl">Reps to<input class="in" id="xe_hi" inputmode="numeric" value="${x.hi}"></label>
    <label class="fl">Max ${x.u === 'bw' ? 'added kg' : x.u === 'plates' ? 'plates / side' : 'kg'}<input class="in" id="xe_bw" inputmode="decimal" value="${x.base?.w ?? ''}" placeholder="optional"></label>
    <label class="fl">Max reps<input class="in" id="xe_br" inputmode="numeric" value="${x.base?.r ?? ''}" placeholder="optional"></label>
    <label class="fl">Weight step<input class="in" id="xe_inc" inputmode="decimal" value="${x.inc ?? ''}" placeholder="${fmt(exStep(id), 3)}"></label>
    <label class="fl">Reps in reserve<input class="in" id="xe_rir" inputmode="numeric" value="${x.rir ?? ''}" placeholder="${exRir(id)}"></label>
    ${x.u === 'bw' ? `<label class="fl">Body weight counted %<input class="in" id="xe_bwf" inputmode="numeric" value="${x.bwf ? Math.round(x.bwf * 100) : ''}" placeholder="0 = reps only"></label>` : ''}
    <label class="fl full">Note<input class="in left" id="xe_note" value="${esc(x.note || '')}" placeholder="optional"></label>
  </div>${x.fresh ? `<div class="btnrow"><button class="btn sm" data-act="saveex" data-id="${id}">Add exercise</button><button class="link dim" data-act="editex" data-id="">Discard</button></div></div>` // new and unsaved: one way in, one way out
  : `<div class="btnrow"><button class="btn sm" data-act="saveex" data-id="${id}">Save</button><button class="link dim" data-act="editex" data-id="">Cancel</button>
  ${Object.values(S().prog.sessions).some(s => s.items.some(i => i.ex === id)) ? '' : `<button class="link danger" data-act="delex" data-id="${id}" style="margin-left:auto">Delete exercise</button>`}</div></div>`}`;
}

/* ---------- Data ---------- */
function vData() {
  const im = S().imports || {};
  const last = k => im[k] ? `Last import ${new Date(im[k].at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${im[k].n} days · ${esc(im[k].range)}` : 'Not imported yet';
  let h = `<div class="page-h"><div><div class="eyebrow">Imports, backups, storage</div><h1>Data</h1></div></div>`;
  if (window.GH_SYNC) h += GH.card() + Helper.card() + Helper.traffic() + Helper.explain(); else h += `<section class="card"><div class="card-h"><h2>Where your data lives</h2><span id="sync2">${Cloud.ready ? pill('good', 'Synced') : pill('', 'This browser')}</span></div><p class="small dim">${Cloud.ready ? 'Saved to your private storage for this app on claude.ai, so it follows you between phone and desktop. A copy is also kept in this browser.' : 'Saving in this browser only. Cloud sync starts when the app is opened from claude.ai while signed in.'}</p></section>`;
  const impBox = src => { const p = ui.imp[src]; if (!p) return '';
    return `<div class="prev" id="imp-${src}"><div class="card-h"><b>Ready to import</b></div><p><b>${esc(p.summary)}</b></p><p class="dim">${esc(previewRange(p.days))}</p><p class="xs muted">From ${esc(p.files.join(', '))}.</p>
      <div class="btnrow"><button class="btn" data-act="doimport" data-v="${src}">Import</button><button class="link dim" data-act="cancelimp" data-v="${src}">Cancel</button></div></div>`; };
  h += `<section class="card"><div class="card-h"><h2>WHOOP</h2><span class="eyebrow">recovery · HRV · sleep · strain</span></div>
    <ol class="steps"><li>In the WHOOP app, open the menu and choose <b>Data Export</b>.</li><li>WHOOP emails you a download link, usually within minutes.</li><li>Choose the .zip below. Only needed for the journal (alcohol); everything else syncs by itself.</li></ol>
    <div class="drop" data-drop="whoop"><input type="file" class="file" id="f_whoop" accept=".zip,.csv,text/csv,application/zip" multiple data-in="fwhoop"><span class="xs muted">${last('whoop')}</span></div>${impBox('whoop')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>MacroFactor</h2><span class="eyebrow">intake · weight · expenditure</span></div>
    <ol class="steps"><li>In MacroFactor, go to <b>More → Data Management → Data Export</b>.</li><li>Include nutrition, scale weight, weight trend and expenditure, choose a time frame, then save the spreadsheet.</li><li>Choose it below. Re-importing is safe.</li></ol>
    <div class="drop" data-drop="mf"><input type="file" class="file" id="f_mf" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple data-in="fmf"><span class="xs muted">${last('mf')}</span></div>${impBox('mf')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Apple Health</h2><span class="eyebrow">steps · headphones · MacroFactor</span></div>
    <p class="small dim">New days arrive through Health Auto Export. For older days, import an Orbit Health file (.json).</p>
    <div class="drop" data-drop="ah"><input type="file" class="file" id="f_ah" accept=".json,application/json" data-in="fah"><span class="xs muted">${last('ah')}</span></div>${impBox('ah')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Backups</h2></div>
    <div class="btnrow"><button class="btn sm ghost" data-act="export" data-v="json">Save full backup (.json)</button><button class="btn sm ghost" data-act="export" data-v="csv">Save sets (.csv)</button></div>
    ${ui.exportText ? `<div class="exportbox sec"><span class="xs muted">Saving files isn't available here. Copy this instead.</span><textarea class="in" id="exporttext" readonly>${esc(ui.exportText)}</textarea><button class="btn sm" data-act="copyexport">Copy</button></div>` : ''}
    <label class="fl">Restore from a backup<input type="file" class="file" id="f_backup" accept=".json,application/json" data-in="fbackup"></label></section>`;
  h += `<section class="card"><div class="card-h"><h2>Start over</h2></div>
    ${ui.confirm === 'reset' ? `<p class="small">This deletes every session, import and setting, here and in cloud storage. Save a backup first if you might want it.</p><div class="btnrow"><button class="btn danger sm" data-act="reset">Delete everything</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div>`
      : `<button class="link danger" data-act="confirm" data-v="reset" style="align-self:flex-start">Delete all data</button>`}</section>`;
  h += `<p class="xs muted" style="text-align:center">Orbit v${esc(APP_VERSION)}${ui.update ? ` · <button class="link" data-act="update">v${esc(ui.update)} is ready, update</button>` : ''}</p>`;
  return h;
}
const VIEWS = { today: vToday, log: vLog, history: vHistory, strength: vStrength, body: vBody, plan: vPlan, data: vData };
