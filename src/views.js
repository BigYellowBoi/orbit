/* ============================================================
   VIEWS
   ============================================================ */
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function pill(tone, text) { return `<span class="pill ${tone || ''}">${esc(text)}</span>`; }
function stat(v, unit, label, extra) { return `<div class="stat" data-live="${esc(label)}"><b>${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b><span>${esc(label)}</span>${extra || ''}</div>`; }
function deltaTxt(v, base, d = 0, unit = '', invert = false) {
  if (v == null || base == null) return '';
  const diff = v - base; if (Math.abs(diff) < 10 ** -d / 2) return `<span class="delta">= 30-day avg</span>`;
  const better = invert ? diff < 0 : diff > 0;
  return `<span class="delta" style="color:var(${better ? '--good-ink' : '--warn-ink'})">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), d)}${unit} vs 30-day</span>`;
}
function rxTxt(it) { const d = exDef(it.ex); return `${it.sets} × ${d.lo}${d.hi > d.lo ? '–' + d.hi : ''}`; }
function prevLine(exId, before) { const sg = suggest(exId, before), l = lastLine(exId, before); return [sg ? `<b class="aimtxt">Aim ${esc(suggestTxt(exId, sg))}</b>` : '', esc(l)].filter(Boolean).join(' · '); }
function lastLine(exId, before) {
  const ix = lixEx(exId), n = nBefore(ix.list, before); // Best counts logged sets only; stated maxes just seed the Aim
  let b = null; for (let i = 0; i < n; i++) if (!b || ix.list[i].sc > b.sc) b = ix.list[i];
  const l = lastFor(exId, before), best = b ? `Best ${fmtSet(exId, b.top)}` : '';
  if (l) return `Last ${fmtDate(l.date)} · ${setsTxt(exId, l.sets)}${best ? ' · ' + best : ''}`;
  return ''; // never done before: nothing to say (v1.36; was "Not logged yet")
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
  let h = `<div class="page-h day"><div><div class="eyebrow">${esc(fmtDow(d))} ${esc(fmtDate(d, { year: 'numeric' }))}</div><h1>${off === -1 ? 'Yesterday' : off === 1 ? 'Tomorrow' : esc(long)}</h1></div>${dayNav(off)}</div>`;
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
  let h = `<div class="page-h day"><div><div class="eyebrow">${esc(fmtDow(t))} ${esc(fmtDate(t, { year: 'numeric' }))}</div><h1>Today</h1></div><div class="hdr-r">${o.length ? `<span class="pill plain" title="Your ${ordinal(rotationCount() + 1)} time through the split">${ordinal(rotationCount() + 1)} rotation</span>` : ''}${dayNav(0)}</div></div>`;
  const tail = () => whoopCard() + stripHTML() + weekCard();
  if (w && (!w.fin || ui.editToday)) return h + logBody(t) + stripHTML() + weekCard(); // the log, until you press Done (no Recovery card while logging, v1.36)
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
    ${(() => { // against the last time this session was done (v1.36)
      const prev = workoutsSorted().filter(x => x.s === w.s && x.date < w.date && !x.rest && wStats(x).sets).pop(); if (!prev) return '';
      const p = wStats(prev), ds = st.sets - p.sets, dt = (st.kg - p.kg) / 1000, sg = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), 1);
      return `<p class="small dim">Against ${esc(sessName(prev))} on ${esc(fmtDate(prev.date))}: ${sg(ds)} set${Math.abs(ds) === 1 ? '' : 's'} · ${sg(dt)} t tonnage${prs.length ? ` · ${prs.length} new best${prs.length > 1 ? 's' : ''}` : ''}</p>`; })()}
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
  if (lifts.length) h += lifts.map(actChips).join('');
  normSets(w); if (autoCardio(w)) saveW(w.date);
  const prSet = new Set(prsIn(w).map(p => p.s));
  w.ex.forEach((e, i) => { h += exCard(w, e, i, prSet); });
  h += pickerHTML(w);
  h += cardioCard(w);
  h += `<section class="card">${wl != null ? `<div class="fl"><span>Duration</span><b class="roval">${esc(fmtDur(wl * 60))} <small>WHOOP</small></b></div>` : `<label class="fl">Duration (min)<input class="in" id="wdur" inputmode="numeric" data-in="durmin" value="${w.durMin ?? ''}" placeholder="optional"></label>`}
    <label class="fl">Session notes<textarea class="in" id="wnote" data-in="note" placeholder="Anything worth remembering next time">${esc(w.note || '')}</textarea></label></section>`;
  h += `<button class="btn wide" data-act="logdone">Done</button>`;
  h += `<button class="link danger delw" data-act="delw1" style="align-self:flex-start">Delete this session</button>`; // two taps (v1.36)
  return h;
}
/* Add exercise (v1.36): a searchable list ranked for the day: the session's own muscles, then muscles its lifts also work
   and the same movement pattern (push, pull, legs), then abs, then the rest; most recently used first within each. */
const PATTERN = { chest: 'push', delt_f: 'push', delt_s: 'push', triceps: 'push', back: 'pull', biceps: 'pull', delt_r: 'pull', quads: 'legs', hams: 'legs', calves: 'legs' };
function pickerHTML(w) {
  if (!ui.pick) return `<button class="btn ghost wide" data-act="pickopen">+ Exercise</button>`;
  const inW = new Set(w.ex.map(e => e.id)), sd = sessDef(w.s);
  const ids = [...(sd?.items || []).map(it => it.ex), ...w.ex.map(e => e.id)];
  const G = new Set(ids.map(id => exDef(id).g)), G2 = new Set(ids.flatMap(id => exDef(id).g2 || SECONDARY[id] || []));
  const P = new Set([...G].map(g => PATTERN[g]).filter(Boolean)); // push, pull, legs: the day's movement patterns
  const rank = x => G.has(x.g) ? 0 : G2.has(x.g) || P.has(PATTERN[x.g]) ? 1 : x.g === 'abs' ? 2 : 3;
  const used = id => { const l = lixEx(id).list; return l.length ? l[l.length - 1].date : ''; };
  const all = Object.entries(S().ex).filter(([id, x]) => !inW.has(id) && x.name).map(([id, x]) => ({ id, x, u: used(id), k: rank(x) }))
    .sort((a, b) => (a.k - b.k) || (b.u > a.u ? 1 : b.u < a.u ? -1 : 0) || a.x.name.localeCompare(b.x.name));
  all.forEach(r => { r.day = r.k <= 1; });
  const row = r => `<li data-q="${esc(exHay(r.x))}"><button data-act="addexid" data-id="${r.id}"><span>${esc(r.x.name)}</span><small>${esc(GROUPS[r.x.g] || '')}${r.u ? ` · last ${esc(fmtDate(r.u))}` : ''}</small></button></li>`;
  const day = all.filter(r => r.day), rest = all.filter(r => !r.day);
  return `<section class="card pick"><div class="card-h"><h2>Add exercise</h2><button class="link dim" data-act="pickopen">Close</button></div>
    <div class="srch">${ICON.search}<input class="in left" id="pickq" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search by name or muscle" aria-label="Search exercises" value="${esc(ui.pick.q || '')}"></div>
    <ul class="picklist">${day.length ? `<li class="pg">For ${esc(sessName(w))}</li>${day.map(row).join('')}` : ''}${rest.length ? `<li class="pg">Everything else</li>${rest.map(row).join('')}` : ''}</ul>
    <p class="xs muted pickempty" hidden>No match.</p></section>`;
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
  const ph = (v, dflt) => v != null ? fmt(v, 2).replace(/,/g, '') : dflt, sg = suggest(e.id, w.date), back = setAim(e.id, w.date, 1, sg);
  const last = lastFor(e.id, w.date), nWork = e.sets.filter(s => s.t !== 'w').length;
  let k = 0; // working-set number
  const rows = e.sets.map((s, j) => {
    const warm = s.t === 'w', a = rowAim(e, j, w.date, sg), kk = warm ? null : k++, prev = !warm && last ? last.sets[kk] : null;
    const tag = warm ? 'W' : s.t === 'd' ? 'D' : String(kk + 1), lbl = warm ? 'warm-up' : s.t === 'd' ? 'drop set' : 'working set';
    const box = (key, val, phv, im, aria) => `<div class="stp"><button class="sb" data-act="step" data-e="${i}" data-s="${j}" data-k="${key}" data-d="-1" tabindex="-1" aria-label="${aria} down">−</button><input class="in" id="${key}${i}_${j}" inputmode="${im}" enterkeyhint="next" data-in="${key}" data-e="${i}" data-s="${j}" value="${val ?? ''}" placeholder="${phv}" aria-label="Set ${j + 1} ${aria}"><button class="sb" data-act="step" data-e="${i}" data-s="${j}" data-k="${key}" data-d="1" tabindex="-1" aria-label="${aria} up">+</button></div>`;
    return `<div class="set ${s.done ? 'done' : ''} ${prSet.has(s) ? 'pr' : ''} ${warm ? 'warm' : ''} ${s.t === 'd' ? 'dset' : ''}" id="row${i}_${j}"><button class="sn" data-act="settype" data-e="${i}" data-s="${j}" aria-label="Set ${j + 1}: ${lbl}. Tap to change">${tag}</button>
      ${box('w', s.w, ph(a ? a.w : s.pw, def.u === 'bw' ? '0' : '–'), 'decimal', esc(u.label))}
      ${box('r', s.r, ph(a ? a.r : s.pr, '–'), 'numeric', 'reps')}
      <span class="mark" aria-hidden="true">${ICON.tick}</span>${prev ? `<span class="lastset">Last ${esc(fmtSet(e.id, prev))}</span>` : ''}</div>`;
  }).join('');
  const meta = [lastLine(e.id, w.date), def.note].filter(Boolean).map(esc).join(' · ');
  return `<section class="card ex" id="ex${i}"><div class="ex-h"><button class="ex-name" data-act="exhist" data-e="${i}" aria-expanded="${open}"><h3>${esc(def.name)}</h3><span class="chev">${ICON.down}</span></button><span class="rx">${def.lo}${def.hi > def.lo ? '–' + def.hi : ''} reps</span></div>
    ${open ? exHistHTML(e.id, w.date) : ''}
    ${sg ? `<p class="aim"><b>Aim ${esc(suggestTxt(e.id, sg))}</b>${nWork > 1 && back?.back ? `, then ${esc(fmtLoad(e.id, back.w))}${def.u === 'kg' ? ' kg' : ''}` : ''} · ${sg.rir} rep${sg.rir === 1 ? '' : 's'} in reserve${S().goal === 'grow' ? ' · overload' : ''}</p>` : ''}
    ${meta ? `<p class="ex-meta">${meta}</p>` : ''}
    ${(() => { const ln = e.note == null ? lastExerciseNote(e.id, w.date) : null; return ln ? `<p class="ex-lastnote">Note from ${esc(fmtDate(ln.date))}: ${esc(ln.note)}</p>` : ''; })()}
    <div class="sets"><div class="set hdr"><span>Set</span><span>${esc(u.col)}</span><span>Reps</span><span></span></div>${rows}</div>
    ${e.note != null || ui.exNote === i ? `<label class="fl">Exercise note<textarea class="in exnote" id="xn${i}" data-in="exnote" data-e="${i}" placeholder="Seat height, grip, how it felt">${esc(e.note || '')}</textarea></label>` : ''}
    <div class="ex-foot"><button class="link" data-act="addset" data-e="${i}">+ Set</button>${sg && sg.w > 0 && def.u !== 'bw' ? `<button class="link dim" data-act="addwarm" data-e="${i}">+ Warm-up</button>` : ''}${e.note == null && ui.exNote !== i ? `<button class="link dim" data-act="exnote" data-e="${i}">+ Note</button>` : ''}<button class="link dim more" data-act="exmore" data-e="${i}" aria-expanded="${ui.exMore === i}" aria-label="More for ${esc(def.name)}">${ui.exMore === i ? 'Close' : 'More'}</button></div>
    ${ui.exMore === i ? exMoreHTML(w, e, i) : ''}</section>`;
}
function actChips(a) { // a WHOOP activity as one line of chips (v1.36)
  const c = [a.t && `from ${esc(a.t)}`, a.min && `${fmt(a.min, 0)} min`, a.str != null && `<span class="strain">strain ${fmt(a.str, 1)}</span>`, a.ahr && `avg ${fmt(a.ahr, 0)} bpm`, a.kcal && `${fmt(a.kcal, 0)} kcal`].filter(Boolean);
  return `<div class="whoopact"><b>WHOOP · ${esc(a.n)}</b><span class="achips">${c.map(x => `<span>${x}</span>`).join('')}</span></div>`;
}
function cardioTypes() { return Object.keys(CARDIO_RE); }
function cardioCard(w) {
  if (w.cardio === null) return `<section class="card flat"><div class="card-h"><h2>Cardio</h2>${pill('', 'Removed')}</div><p class="small dim">No cardio for this session.</p>
    <div class="chips">${cardioTypes().map(n => `<button class="chip" data-act="cardiotype" data-v="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></section>`;
  const c = w.cardio || { name: S().cardio.name, min: S().cardio.min };
  const acts = whoopCardio(w.date, c.name), wmin = Math.round(sum(acts.map(a => a.min || 0))), fromW = c.done && c.src === 'whoop' && wmin > 0;
  return `<section class="card"><div class="card-h"><h2>${esc(c.name)}</h2>${c.done ? pill('good', fromW ? 'From WHOOP' : 'Done') : pill('', 'After lifting')}</div>
    <div class="chips" role="group" aria-label="Cardio type">${cardioTypes().map(n => `<button class="chip ${n === c.name ? 'on' : ''}" data-act="cardiotype" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="fields" style="grid-template-columns:repeat(2,minmax(0,1fr))">${fromW ? `<div class="fl"><span>Minutes</span><b class="roval">${fmt(c.min, 0)} min</b></div>` : `<label class="fl">Minutes<input class="in" id="cmin" inputmode="numeric" data-in="cmin" value="${c.min ?? ''}"></label>`}<label class="fl">Level or note<input class="in" id="clvl" data-in="clvl" value="${esc(c.lvl ?? '')}" placeholder="optional"></label></div>
    ${acts.map(actChips).join('')}
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
  h += calendarHTML(ws);
  // search and session filter, applied in place (filterHist in boot.js) so the keyboard stays up
  const sids = [...new Set(ws.filter(w => !w.rest).map(w => w.s))].filter(id => sessDef(id)).sort((a, b) => order().indexOf(a) - order().indexOf(b));
  h += `<div class="srch">${ICON.search}<input class="in left" id="hq" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search exercises and notes" aria-label="Search history" value="${esc(ui.histQ || '')}"></div>
    <div class="chips" role="group" aria-label="Session">${[['', 'All'], ...sids.map(id => [id, sessDef(id).name])].map(([id, n]) => `<button class="chip ${(ui.histS || '') === id ? 'on' : ''}" data-act="histsess" data-v="${id}">${esc(n)}</button>`).join('')}</div>
    <p class="xs muted histempty" hidden>No sessions match.</p>`;
  let wk = null;
  for (const w of ws) {
    const s = weekStart(w.date);
    if (s !== wk) {
      if (wk) h += `</div>`;
      wk = s; const inW = ws.filter(x => weekStart(x.date) === s && !x.rest);
      h += `<div class="sec-h"><span class="eyebrow">Week of ${esc(fmtDate(s))}</span><span class="xs muted">${inW.length} sessions · ${sum(inW.map(x => wStats(x).sets))} sets</span></div><div class="hist">`;
    }
    const st = wStats(w), prs = prsIn(w).length, rec = dayVal(w.date, 'rec'), str = dayVal(w.date, 'str');
    const hq = [sessName(w), ...(w.ex || []).filter(e => doneSets(e).length).map(e => exDef(e.id).name), w.note || '', ...(w.ex || []).map(e => e.note || '')].join(' ').toLowerCase();
    h += `<button class="hrow" data-act="openlog" data-d="${w.date}" data-q="${esc(hq)}" data-s="${esc(w.rest ? '_rest' : w.s)}"><span class="hdate"><b>${esc(w.date.slice(8))}</b><small>${esc(fmtDow(w.date))}</small></span>
      <span class="hmain"><b${w.rest ? ' class="dim"' : ''}>${esc(sessName(w))}</b><small>${w.rest ? (st.cardio ? `${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : 'No training') : `${st.sets} sets`}${sessDur(w) ? ` · ${fmtDur(sessDur(w))}` : ''}${!w.rest && st.cardio ? ` · ${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : ''}${prs ? ` · ${prs} best${prs > 1 ? 's' : ''}` : ''}</small></span>
      ${rec != null || str != null ? `<span class="hwh">${rec != null ? `<b class="tn-${recTone(rec)}" aria-label="Recovery ${Math.round(rec)}%">${Math.round(rec)}%</b>` : ''}${str != null ? `<b class="strain" aria-label="Strain ${fmt(str, 1)}">${fmt(str, 1)}</b>` : ''}</span>` : '<span></span>'}${w.note && w.note.trim() ? `<span class="hnote">${esc(w.note.trim())}</span>` : ''}</button>`;
  }
  return h + `</div>`;
}

/* Calendar (v1.36): a month of training days, a dot per session coloured by its place in the rotation; tap to open. */
function calendarHTML(ws) {
  const t = today(), [y, m] = t.split('-').map(Number), off = ui.calOff || 0, mm = ((m - 1 + off) % 12 + 12) % 12, yy = y + Math.floor((m - 1 + off) / 12);
  const first = `${yy}-${pad(mm + 1)}-01`, days = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(), lead = dowMon(first), by = {};
  for (const w of ws) if (w.date.startsWith(first.slice(0, 7))) by[w.date] = w;
  const o = order(), PAL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--strain)', 'var(--warn)'], pc = id => PAL[Math.max(0, o.indexOf(id)) % PAL.length], col = w => w.rest ? 'var(--ink-3)' : pc(w.s);
  let cells = Array.from({ length: lead }, () => '<span></span>').join('');
  for (let i = 1; i <= days; i++) { const d = `${first.slice(0, 8)}${pad(i)}`, w = by[d];
    cells += w ? `<button class="cd${d === t ? ' now' : ''}" data-act="openlog" data-d="${d}" title="${esc(sessName(w))}"><b>${i}</b><i style="background:${col(w)}"></i></button>` : `<span class="cd${d === t ? ' now' : ''}${d > t ? ' fut' : ''}"><b>${i}</b></span>`; }
  const name = new Date(Date.UTC(yy, mm, 1)).toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const legend = o.filter(id => !isRestSlot(id)).map(id => `<span><i style="background:${pc(id)}"></i>${esc(sessDef(id).name)}</span>`).join('');
  return `<section class="card cal"><div class="card-h"><h2>${esc(name)}</h2><div class="ex-nav"><button class="iconbtn sm" data-act="calmon" data-n="-1" aria-label="Previous month">‹</button><button class="iconbtn sm" data-act="calmon" data-n="1" aria-label="Next month" ${off >= 0 ? 'disabled' : ''}>›</button></div></div>
    <div class="calg">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="cdh">${d}</span>`).join('')}${cells}</div><div class="calk">${legend}</div></section>`;
}

/* ---------- Strength: every lift in one table, one chart ---------- */
function liftIds() {
  const ids = [...new Set(order().flatMap(id => sessDef(id).items.map(it => it.ex)))].filter(id => S().ex[id]);
  const others = Object.keys(S().ex).filter(id => !ids.includes(id) && records(id)?.logged);
  return [...ids, ...others].filter(id => records(id));
}
/* A short "About" toggle for explanations, so the copy stays out of the way (v1.36) */
const infoHTML = txt => `<details class="info"><summary>About this</summary><p class="xs muted">${txt}</p></details>`;
/* Lift chart metrics: estimated 1RM (the default), heaviest set, reps at that heaviest load, session volume (load × reps over
   working sets) and relative strength (e1RM ÷ trend body weight at the date, kg lifts only). v1.36–v1.37 */
const LIFT_M = { e1rm: 'e1RM', top: 'Heaviest', reps: 'Reps', vol: 'Volume', rel: '×BW' };
function liftMetricsFor(id) { const u = exDef(id).u, scored = !(u === 'bw' && !bwScored(id)); if (!scored) return []; return Object.keys(LIFT_M).filter(k => k !== 'rel' || ((u === 'kg' || u === 'bw') && bwAt(null) != null)); }
function liftMetric(id, m) {
  return lixEx(id).list.map(x => {
    const mw = Math.max(...x.sets.map(s => s.w || 0)), atTop = x.sets.filter(s => (s.w || 0) === mw);
    const y = m === 'top' ? mw : m === 'reps' ? Math.max(...atTop.map(s => s.r)) : m === 'vol' ? (sum(x.sets.map(s => (s.w || 0) * s.r)) || sum(x.sets.map(s => s.r))) : m === 'rel' ? (bwAt(x.date) ? x.sc / bwAt(x.date) : null) : x.sc;
    return { date: x.date, top: x.top, sets: x.sets, y, mw };
  }).filter(p => p.y != null);
}
/* Rep maxes (v1.37): the heaviest load you've lifted for at least each rep count, with the date, beside what your best
   e1RM predicts for that count (Epley, the same formula as everywhere else), rounded down to the lift's step. */
function repMaxHTML(id) {
  const d = exDef(id), list = lixEx(id).list; if (!list.length || (d.u === 'bw' && !bwScored(id))) return '';
  const all = list.flatMap(x => x.sets.map(s => ({ ...s, date: x.date }))), maxR = Math.min(15, Math.max(d.hi + 2, ...all.map(s => s.r)));
  const best = list.reduce((a, x) => !a || x.sc > a.sc ? x : a, null), st = exStep(id), bwk = d.u === 'bw' ? (bwAt(null) || 0) * bwShare(id) : 0;
  const est = r => { const w = best.sc / (1 + r / 30) - bwk; return w > 0 ? Math.floor(w / st + 1e-6) * st : 0; };
  const rows = []; for (let r = 1; r <= maxR; r++) { const c = all.filter(s => s.r >= r).sort((a, b) => (b.w || 0) - (a.w || 0) || (a.date < b.date ? -1 : 1))[0]; rows.push({ r, c }); }
  const ld = w => `${fmtLoad(id, w)}${d.u === 'kg' ? ' kg' : ''}`, inRange = r => r >= d.lo && r <= d.hi;
  return `<section class="card"><div class="card-h"><h2>Rep maxes</h2><span class="eyebrow">${esc(d.name)}</span></div><div class="tblwrap"><table class="tbl repmax"><thead><tr><th>Reps</th><th class="n">Best logged</th><th class="n">Date</th><th class="n">Predicted</th></tr></thead><tbody>
    ${rows.map(({ r, c }) => `<tr class="${inRange(r) ? 'rng' : ''}"><td>${r}</td><td class="n">${c ? esc(ld(c.w || 0)) + (c.r > r ? ` <span class="xs muted">(${c.r})</span>` : '') : '<span class="muted">–</span>'}</td><td class="n xs muted">${c ? esc(fmtD(c.date)) : ''}</td><td class="n dim">${esc(ld(est(r)))}</td></tr>`).join('')}
    </tbody></table></div>${infoHTML(`Best logged: the heaviest load you've done for at least that many reps (the reps actually done in brackets). Predicted: from your best estimated 1RM. Your ${d.lo}–${d.hi} rep range is highlighted.`)}</section>`;
}
/* Weekly sets per muscle (v1.37): a heatmap of the last 12 weeks, same counting as Volume, coloured by the research bands */
function heatHTML() {
  const t = today(), n = 12, wks = []; for (let k = n - 1; k >= 0; k--) { const ws = addDays(weekStart(t), -7 * k); wks.push({ ws, cur: k === 0, v: doneByGroup(ws, addDays(ws, 6)) }); }
  const gs = GROUP_ORDER.filter(g => wks.some(w => w.v[g])); if (!gs.length) return '';
  const tone = v => !v ? 'h0' : v < 3 ? 'h1' : v < 10 ? 'h2' : v <= 20 ? 'h3' : 'h4';
  return `<section class="card"><div class="card-h"><h2>Weekly sets by muscle</h2><span class="eyebrow">by week</span></div>
    <div class="tblwrap"><table class="heat"><thead><tr><th></th>${wks.map((w, i) => `<th class="${i < 4 ? 'old' : ''}" title="Week of ${esc(fmtDate(w.ws))}">${esc(fmtDate(w.ws).split(' ')[0])}<br><span>${esc(fmtDate(w.ws).split(' ')[1] || '')}</span></th>`).join('')}</tr></thead><tbody>
    ${gs.map(g => `<tr><th>${esc(GROUPS[g])}</th>${wks.map((w, i) => { const v = w.v[g] || 0; return `<td class="${tone(v)}${w.cur ? ' cur' : ''}${i < 4 ? ' old' : ''}" title="${esc(GROUPS[g])}, week of ${esc(fmtDate(w.ws))}: ${fmt(v, 1)} sets">${v ? fmt(v, v % 1 ? 1 : 0) : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div><div class="legend heatk"><span><i class="h1"></i>under 3</span><span><i class="h2"></i>3–10</span><span><i class="h3"></i>10–20</span><span><i class="h4"></i>over 20</span></div>
    ${infoHTML('Hard sets per muscle each week (Monday start), compounds counting half for the muscles they also work, warm-ups left out. The colours follow the Volume bands: about 3 a week holds, 10–20 grows. This week so far is outlined.')}</section>`;
}
/* Recovery vs performance (v1.37): each session's lifts against the median of that lift's previous 3 sessions (top e1RM),
   averaged, plotted against that morning's WHOOP recovery. Bucket means by recovery colour sit underneath. */
function recPerfData() {
  const out = [];
  for (const w of workoutsSorted()) { if (w.rest) continue; const rec = dayVal(w.date, 'rec'); if (rec == null) continue;
    const rs = []; for (const e of w.ex || []) { const list = lixEx(e.id).list, i = list.findIndex(x => x.date === w.date); if (i < 3) continue; const ref = median(list.slice(i - 3, i).map(x => x.sc)); if (ref > 0) rs.push(list[i].sc / ref - 1); }
    if (rs.length) out.push({ date: w.date, rec, p: mean(rs) * 100, n: rs.length, s: sessName(w) }); }
  return out;
}
function recPerfHTML() {
  const pts = recPerfData(); if (pts.length < 3) return `<section class="card"><div class="card-h"><h2>Recovery and performance</h2></div><p class="small dim">Needs a few sessions on days with a WHOOP recovery, and lifts with 3 sessions behind them.</p></section>`;
  const bk = [['good', 'Green', p => p.rec >= 67], ['warn', 'Yellow', p => p.rec >= 34 && p.rec < 67], ['bad', 'Red', p => p.rec < 34]].map(([tone, l, f]) => { const v = pts.filter(f); return { tone, l, n: v.length, m: v.length ? mean(v.map(p => p.p)) : null }; });
  const n = pts.length, mx = mean(pts.map(p => p.rec)), my = mean(pts.map(p => p.p)), sxx = sum(pts.map(p => (p.rec - mx) ** 2)), b = sxx ? sum(pts.map(p => (p.rec - mx) * (p.p - my))) / sxx : 0, a = my - b * mx;
  const r = sxx && pts.some(p => p.p !== my) ? sum(pts.map(p => (p.rec - mx) * (p.p - my))) / Math.sqrt(sxx * sum(pts.map(p => (p.p - my) ** 2))) : 0;
  const series = [{ color: 'var(--ink-3)', pts: [{ x: 0, y: a }, { x: 100, y: a + b * 100 }], w: 1.5, faint: true }];
  for (const [tone, f] of [['good', p => p.rec >= 67], ['warn', p => p.rec >= 34 && p.rec < 67], ['bad', p => p.rec < 34]]) series.push({ color: `var(--${tone})`, pts: pts.filter(f).map(p => ({ x: p.rec, y: p.p })), line: false, dots: true, r: 4 });
  const byX = {}; for (const p of pts) (byX[Math.round(p.rec)] = byX[Math.round(p.rec)] || []).push(p);
  return `<section class="card"><div class="card-h"><h2>Recovery and performance</h2><span class="eyebrow">${n} sessions</span></div>
    <span class="small dim">Lifts against their last 3 sessions (%), by that morning's recovery</span>
    ${chartHTML({ h: 180, x0: 0, x1: 100, xTicks: [0, 33, 67, 100], xFmt: x => x + '%', yFmt: v => (v > 0 ? '+' : '') + fmt(v, 0) + '%', yPad: 1, refY: { v: 0 }, series, hoverXs: Object.keys(byX).map(Number), tip: x => (byX[x] || []).map(p => `<b>${esc(fmtDate(p.date))}</b> ${esc(p.s)}<br>${fmt(p.rec, 0)}% recovery · ${p.p >= 0 ? '+' : '−'}${fmt(Math.abs(p.p), 1)}%`).join('<br>'), label: 'Recovery against performance' })}
    <div class="rtiles">${bk.map(x => `<div class="rt"><span><i class="dot" style="background:var(--${x.tone})"></i>${x.l} days</span>${x.m == null ? '<b class="nil">–</b>' : `<b>${x.m >= 0 ? '+' : '−'}${fmt(Math.abs(x.m), 1)}<small>%</small></b>`}<em>${x.n} session${x.n === 1 ? '' : 's'}</em></div>`).join('')}</div>
    ${infoHTML(`Each dot is a session: the average of its lifts' best estimated 1RM against the median of that lift's previous 3 sessions, so 0% is a typical day for you. Line: the straight-line fit (r = ${fmt(r, 2)}${n < 15 ? '; with under 15 sessions treat it as a hint' : ''}).`)}</section>`;
}
/* New bests over time (v1.37): count per week for 12 weeks, then the latest ones with how far each beat the old best */
function prTimelineHTML() {
  const t = today(), from = addDays(weekStart(t), -7 * 11), prs = [];
  for (const w of workoutsSorted()) { if (w.date < addDays(from, -200)) continue; const seen = {}; for (const p of prsIn(w)) { const prev = seen[p.id] ?? bestBefore(p.id, w.date), sc = setScore(p.id, p.s, w.date); prs.push({ date: w.date, id: p.id, s: p.s, up: prev > 0 ? sc / prev - 1 : null }); seen[p.id] = sc; } }
  if (!prs.length) return '';
  const bars = []; for (let k = 0; k < 12; k++) { const ws = addDays(from, 7 * k), we = addDays(ws, 6); bars.push({ x: k, v: prs.filter(p => p.date >= ws && p.date <= we).length, ws }); }
  const last = prs.slice(-10).reverse();
  return `<section class="card"><div class="card-h"><h2>New bests</h2><span class="eyebrow">${prs.filter(p => p.date >= from).length} in 12 weeks</span></div>
    ${chartHTML({ h: 120, x0: 0, x1: 11, xTicks: [0, 4, 8, 11], xFmt: k => fmtDate(bars[k].ws), bars: bars.map(b => ({ x: b.x, v: b.v, color: 'var(--accent)' })), barMax: 16, yMin: 0, yTicks: 2, yFmt: v => fmt(v, 0), hoverXs: bars.map(b => b.x), tip: k => `<b>Week of ${esc(fmtDate(bars[k].ws))}</b><br>${bars[k].v} new best${bars[k].v === 1 ? '' : 's'}`, label: 'New bests per week' })}
    <ul class="exlist recent">${last.map(p => `<li><span>${esc(exDef(p.id).name)}<small class="xs muted"> · ${esc(fmtD(p.date))}</small></span><span class="rx">${esc(fmtSet(p.id, p.s))}${p.up != null ? ` <span class="tn-good">+${fmt(p.up * 100, 1)}%</span>` : ''}</span></li>`).join('')}</ul></section>`;
}
function vStrength() {
  const t = today(), ids = liftIds();
  let h = `<div class="page-h"><div><div class="eyebrow">From your logbook</div><h1>Strength</h1></div></div>`;
  if (!ids.length) return h + `<section class="card"><p class="dim small">Log a session, or add your maxes under Plan → Exercises, and your lifts show up here.</p></section>`;
  const pick = ui.lift && ids.includes(ui.lift) ? ui.lift : (ids.find(id => liftSeries(id).length) || ids[0]);
  const u = exDef(pick).u, mets = liftMetricsFor(pick), scored = mets.length > 0, m = mets.includes(ui.liftM) ? ui.liftM : 'e1rm';
  const ser = liftMetric(pick, m), from = ser.length && diffDays(ser[0].date, t) > 27 ? ser[0].date : addDays(t, -27), ax = dateAxis(from, t), xi = d => diffDays(from, d);
  const unit = u === 'plates' ? 'pl' : 'kg', ys = ser.map(p => p.y), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo, padY = Math.max(m === 'rel' ? .02 : m === 'reps' ? 1 : u === 'plates' ? .1 : 1, ys.length ? (span < Math.abs(hi) * .04 ? Math.abs(hi) * .04 : span * .15) : 1); // one point or a flat run still gets a sensible axis
  const yLab = !scored ? 'Best reps per session' : m === 'reps' ? 'Reps at the heaviest load of each session' : m === 'rel' ? 'Estimated 1RM ÷ trend body weight' : m === 'top' ? `Heaviest set per session (${u === 'plates' ? 'plates / side' : u === 'bw' ? 'kg added' : 'kg'})` : m === 'vol' ? `Session volume (${unit} × reps, working sets)` : `Estimated 1RM per session (${u === 'plates' ? 'plates / side' : u === 'bw' ? 'kg, body weight included' : 'kg'})`;
  const recent = lixEx(pick).list.slice(-6).reverse();
  const cards = [];
  cards.push({ k: 'chart', t: 'Lift chart', h: `<section class="card" id="liftchart"><label class="fl">Lift<select class="in" id="liftpick" data-in="lift">${ids.map(id => `<option value="${id}" ${id === pick ? 'selected' : ''}>${esc(exDef(id).name)}</option>`).join('')}</select></label>
    ${scored ? `<div class="seg full" role="group" aria-label="Measure">${mets.map(k => `<button class="${k === m ? 'on' : ''}" data-act="liftm" data-v="${k}">${LIFT_M[k]}</button>`).join('')}</div>` : ''}<span class="small dim">${esc(yLab)}</span>
    ${chartHTML({ h: 170, ...ax, refY: null, yPad: padY, yFmt: v => m === 'rel' ? fmt(v, 2) + '×' : fmt(v, u === 'plates' && m !== 'vol' && m !== 'reps' ? 2 : 0), series: [{ color: 'var(--s1)', pts: ser.map(p => ({ x: xi(p.date), y: p.y })), dots: true, r: 3.5, end: true }], hoverXs: ser.map(p => xi(p.date)), tip: x => { const p = ser.find(q => xi(q.date) === x); return p ? `<b>${esc(fmtDate(p.date))}</b><br>${esc(fmtSet(pick, p.top))} · ${esc(m === 'e1rm' ? scoreTxt(pick, p.y) : m === 'vol' ? fmt(p.y, 0) + ' ' + unit + ' × reps' : m === 'reps' ? p.y + ' reps at ' + fmtLoad(pick, p.mw) + (u === 'kg' ? ' kg' : '') : m === 'rel' ? fmt(p.y, 2) + '× body weight' : fmtLoad(pick, p.y) + (u === 'kg' ? ' kg' : ''))}` : ''; }, empty: 'No sets logged for this lift yet', label: 'Lift trend' })}
    ${recent.length ? `<div class="sec"><span class="eyebrow">Recent sessions</span><ul class="exlist recent">${recent.map(x => `<li><span class="mono xs">${esc(fmtD(x.date))}</span><span class="rx">${esc(setsTxt(pick, x.sets))}</span></li>`).join('')}</ul></div>` : ''}</section>` });
  const bestLogged = id => lixEx(id).list.reduce((a, x) => !a || x.sc > a.sc ? x : a, null); // stated maxes are only a starting point for the Aim, so Best waits for real sets
  const row = id => { const mm = maintenance(id), [tone, word] = MSTATE[mm.state]; return `<tr class="${id === pick && ui.lift ? 'sel' : ''}" data-act="liftsel" data-id="${id}"><td>${esc(exDef(id).name)}</td>
      <td class="n">${(b => b ? `${esc(fmtSet(id, b.top))}<br><span class="xs muted">${esc(fmtD(b.date))}</span>` : '<span class="muted">–</span>')(bestLogged(id))}</td>
      <td class="n">${mm.last ? `${esc(fmtSet(id, mm.last.top))}<br><span class="xs muted">${esc(fmtD(mm.last.date))}</span>` : '<span class="muted">–</span>'}</td>
      <td class="n">${tone ? `<span class="pill plain ${tone}" title="${word}">${(mm.ch >= 0 ? '+' : '−') + fmt(Math.abs(mm.ch), 1)}%</span>` : `<span class="xs muted">${mm.state === 'new' ? 'Too new' : '–'}</span>`}</td></tr>`; };
  // grouped by session in rotation order; lifts never logged wait behind Show all (v1.36)
  const logged = id => lixEx(id).list.length > 0, groups = [], seen = new Set();
  for (const sid of order()) { const sd = sessDef(sid); if (!sd || isRestSlot(sid)) continue; const g = sd.items.map(it => it.ex).filter(id => ids.includes(id) && !seen.has(id)); g.forEach(id => seen.add(id)); if (g.length) groups.push([sd.name, g]); }
  const other = ids.filter(id => !seen.has(id)); if (other.length) groups.push(['Other lifts', other]);
  const hidden = ui.liftsAll ? 0 : ids.filter(id => !logged(id)).length;
  cards.push({ k: 'lifts', t: 'Lifts table', h: `<section class="card"><div class="tblwrap"><table class="tbl lifts"><thead><tr><th>Lift</th><th class="n">Best</th><th class="n">Last</th><th class="n">4 wk</th></tr></thead>
    ${groups.map(([n, g]) => { const vis = g.filter(id => ui.liftsAll || logged(id)); return vis.length ? `<tbody><tr class="grp"><th colspan="4" scope="rowgroup">${esc(n)}</th></tr>${vis.map(row).join('')}</tbody>` : ''; }).join('')}
    </table></div>
    <div class="btnrow" style="justify-content:space-between">${hidden || ui.liftsAll ? `<button class="link dim" data-act="liftsall">${ui.liftsAll ? 'Hide lifts not logged yet' : `Show all (${hidden} not logged yet)`}</button>` : '<span></span>'}</div>
    ${infoHTML('Best: strongest logged set. 4 wk: your typical session over the last 4 weeks against the 2 months before; green is within 2.5% or up, amber down to 5%, red further. Too new: nothing older to compare yet.')}</section>` });
  // Bands from research, not from the plan: ~3 hard sets a week held size and strength in younger adults (Bickel et al., 2011:
  // a ninth of the training dose, one set of each of three exercises once a week); 10-20 a week is the usual growth range,
  // with diminishing returns above it (Schoenfeld et al., 2017; Pelland et al., 2024).
  const HOLD = 3, GLO = 10, GHI = 20, plan = planWeekly(S().prog), done = doneByGroup(addDays(t, -6), t), gs = GROUP_ORDER.filter(g => plan[g] || done[g]);
  const mx = Math.max(GHI + 2, ...gs.map(g => done[g] || 0)), pc = v => v / mx * 100;
  // a muscle whose session is still coming in the next 2 days isn't behind, it's due: grey, not amber (v1.36)
  const due = new Set(upcoming(3).filter(x => !x.done && sessDef(x.s)).flatMap(x => sessDef(x.s).items.flatMap(it => [exDef(it.ex).g, ...(exDef(it.ex).g2 || SECONDARY[it.ex] || [])])));
  const tone = (n, g) => n < HOLD ? (due.has(g) ? 'due' : 'warn') : n >= GLO ? 'good' : '';
  cards.push({ k: 'volume', t: 'Volume, last 7 days', h: `<section class="sec" data-card="volume"><div class="sec-h"><span class="eyebrow">Volume · last 7 days</span></div><section class="card"><div class="legend"><span><i class="ln" style="background:var(--s1);height:8px;width:12px"></i>Sets done</span><span><i class="tk"></i>Hold, ~${HOLD}</span><span><i class="bandk"></i>Grow, ${GLO}–${GHI}</span></div>
    <ul class="hbars">${gs.map(g => { const n = done[g] || 0, tn = tone(n, g); return `<li><span class="lab">${esc(GROUPS[g])}</span><span class="trk"><span class="band" style="left:${pc(GLO)}%;width:${pc(GHI) - pc(GLO)}%"></span><span class="fill" style="width:${pc(Math.min(n, mx))}%"></span><span class="tgt" style="left:calc(${pc(HOLD)}% - 1px)"></span></span><span class="v ${tn ? 'tn-' + tn : ''}"${tn === 'due' ? ' title="Its session is coming up"' : ''}>${fmt(n, 1)}</span></li>`; }).join('')}</ul>
    ${infoHTML('Hard sets per muscle over the last 7 days; compounds count half for the muscles they also work, and warm-ups don\'t count. About 3 a week holds (Bickel et al., 2011); 10–20 grows (Schoenfeld et al., 2017; Pelland et al., 2024). Grey: that muscle\'s session is due in the next 2 days.')}</section></section>` });
  cards.push({ k: 'repmax', t: 'Rep maxes', h: repMaxHTML(pick) });
  cards.push({ k: 'heat', t: 'Weekly sets by muscle', h: heatHTML() });
  cards.push({ k: 'prs', t: 'New bests', h: prTimelineHTML() });
  cards.push({ k: 'recperf', t: 'Recovery and performance', h: recPerfHTML() });
  const det = doneByGroupDetail(addDays(t, -6), t), dg = GROUP_ORDER.filter(g => det[g]);
  if (dg.length) cards.push({ k: 'volsrc', t: 'Volume breakdown', h: `<section class="sec" data-card="volsrc"><div class="sec-h"><span class="eyebrow">Volume breakdown · last 7 days</span></div><section class="card"><div class="tblwrap"><table class="tbl volsrc"><thead><tr><th>Exercise</th><th class="n">Sets</th><th class="n">Counts</th></tr></thead>
    ${dg.map(g => `<tbody><tr class="grp"><th scope="rowgroup">${esc(GROUPS[g])}</th><td></td><td class="n">${fmt(sum(det[g].map(r => r.credit)), 1)}</td></tr>
      ${det[g].map(r => `<tr${r.sec ? ' class="sec2"' : ''}><td>${esc(exDef(r.id).name)}${r.sec ? ' <span class="xs muted">· half</span>' : ''}</td><td class="n">${r.sets}</td><td class="n">${fmt(r.credit, 1)}</td></tr>`).join('')}</tbody>`).join('')}
    </table></div></section></section>` });
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
/* Partly logged days (v1.35): MacroFactor's prompt, here. Shown while any flagged day in the last 3 weeks is unanswered;
   answered ones stay listed with their answer so a slip can be undone. */
function partialCard() {
  const f = partialFlags(); if (!f.some(x => x.ans == null)) return '';
  return `<section class="card"><div class="card-h"><h2>Partly logged?</h2><span class="eyebrow">expenditure</span></div>
    <ul class="rows partq">${f.map(x => `<li><span>${esc(fmtDow(x.d))} ${esc(fmtDate(x.d))}</span><div class="seg" role="group" aria-label="${esc(fmtDate(x.d))}">${[['1', 'Partly'], ['0', 'Complete']].map(([v, l]) => `<button class="${x.ans === (v === '1') ? 'on' : ''}" data-act="partial" data-date="${x.d}" data-v="${v}">${l}</button>`).join('')}</div><span class="sub">${fmt(x.kcal, 0)} kcal, ${fmt(x.pct * 100, 0)}% of the days before${x.ans == null ? ` · treated as ${x.part ? 'partly logged' : 'complete'}` : ''}</span></li>`).join('')}</ul></section>`;
}
/* Energy (v1.36): trend weight and its rate, expenditure, and the week's intake, in one place */
function energyCard() {
  const t = today(), twD = latestWith('tw'), exD = latestWith('exp'); if (!twD && !exD) return '';
  const wr = weightRate(), k7 = []; for (let i = 1; i <= 7; i++) { const v = dayVal(addDays(t, -i), 'kcal'); if (v > 0) k7.push(v); }
  const ex = exD ? dayVal(exD, 'exp') : null, ik = k7.length >= 4 ? mean(k7) : null;
  const tile = (label, v, unit, sub) => `<div class="rt" data-live="${esc(label)}"><span>${esc(label)}</span>${v == null ? '<b class="nil">–</b>' : `<b>${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b>`}${sub ? `<em>${sub}</em>` : ''}</div>`;
  return `<section class="card rcard"><div class="card-h"><h2>Energy</h2><span class="eyebrow">${exD && STATE.d[exD]?.exp != null ? 'MacroFactor' : 'Orbit estimate'}</span></div><div class="rtiles e4">
    ${tile('Trend weight', twD ? fmt(dayVal(twD, 'tw'), 1) : null, 'kg', twD && twD !== t ? esc(fmtD(twD)) : '')}
    ${tile('Rate', wr ? (wr.wk >= 0 ? '+' : '−') + fmt(Math.abs(wr.wk), 2) : null, 'kg/wk', wr ? `${wr.pct >= 0 ? '+' : '−'}${fmt(Math.abs(wr.pct), 2)}% a week` : '')}
    ${tile('Expenditure', ex != null ? fmt(ex, 0) : null, 'kcal', '')}
    ${tile('Intake, 7 days', ik != null ? fmt(ik, 0) : null, 'kcal', ik != null && ex != null ? `${ik - ex >= 0 ? '+' : '−'}${fmt(Math.abs(ik - ex), 0)} vs expenditure` : '')}</div></section>`;
}
function vBody() {
  let h = `<div class="page-h"><div><div class="eyebrow">Recovery · energy · trends</div><h1>Body</h1></div></div>`;
  h += freshHTML() + partialCard() + energyCard();
  const cards = [{ k: 'trends', t: 'Trends', h: explorerHTML() }, { k: 'alcohol', t: 'Alcohol and recovery', h: alcoholCard() }];
  const ra = recoveryAfter().filter(r => r.n >= 2).sort((a, b) => b.avg - a.avg);
  if (ra.length >= 2) cards.push({ k: 'recafter', t: 'Recovery the morning after', h: `<section class="card"><div class="card-h"><h2>Recovery the morning after</h2><span class="eyebrow">all time</span></div><p class="xs muted">Average next-day WHOOP recovery after each session type. Small samples move a lot; read it as a hint.</p>
    <ul class="hbars">${ra.map(r => `<li><span class="lab">${esc(r.k)}</span><span class="trk"><span class="fill" style="width:${Math.max(2, r.avg)}%;background:var(--${recTone(r.avg)})"></span></span><span class="v">${fmt(r.avg, 0)}% <span class="muted">${r.n}×</span></span></li>`).join('')}</ul></section>` });
  const nW = ui.weeksAll ? 26 : 8, wrows = weekRows(nW).filter(r => r.sessions || r.rec != null || r.kcal != null || r.tw != null);
  if (wrows.length) {
    const c = (v, d = 0, u = '') => v == null ? '<span class="muted">–</span>' : fmt(v, d) + u;
    const cols = ui.reo?.tab === 'body' ? ui.reo.cols : wkCols(), m = '<span class="muted">–</span>';
    const cell = { sessions: r => r.sessions || m, sets: r => r.sets || m, cardio: r => r.cardio ? r.cardio + ' min' : m, rec: r => r.rec != null ? `<span style="color:var(--${recTone(r.rec)}-ink)">${fmt(r.rec, 0)}%</span>` : m,
      hrv: r => c(r.hrv, 0), slp: r => r.slp != null ? fmt(r.slp / 60, 1) + ' h' : m, kcal: r => c(r.kcal, 0), p: r => c(r.p, 0, ' g'), dtw: r => r.dtw != null ? (r.dtw >= 0 ? '+' : '−') + fmt(Math.abs(r.dtw), 2) : m };
    cards.push({ k: 'weekly', t: 'Weekly summary', h: `<section class="sec"><div class="sec-h"><span class="eyebrow">Weekly summary</span><span class="xs muted">weeks start Monday</span></div><section class="card"><div class="tblwrap fade"><table class="tbl wk"><thead><tr><th>Week</th>${cols.map(k => `<th class="n">${esc(WKCOLS[k])}</th>`).join('')}</tr></thead><tbody>
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
  const pt = ['split', 'targets', 'sessions', 'exercises'].includes(ui.planTab) ? ui.planTab : 'sessions'; // one part at a time (v1.36)
  h += `<div class="seg plantabs" role="tablist" aria-label="Plan">${[['split', 'Split'], ['targets', 'Targets'], ['sessions', 'Sessions'], ['exercises', 'Exercises']].map(([k, l]) => `<button role="tab" aria-selected="${k === pt}" class="${k === pt ? 'on' : ''}" data-act="plantab" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (pt === 'split') {
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Split</span></div><div class="grid2">${Object.entries(PRESETS).map(([k, p]) => `<button class="opt ${near === k ? 'on' : ''}" data-act="preset" data-id="${k}"><b>${esc(p.name)}${near === k && !match ? ' <span class="xs muted">· edited</span>' : ''}</b><span class="seqs">${p.order.map(id => esc(p.sessions[id].name)).join(' → ')}</span><span>${esc(p.blurb)}</span></button>`).join('')}</div>
    ${ui.confirm && ui.confirm.startsWith('preset:') ? `<div class="prev"><p>${ui.confirm.slice(7) === near && !match ? `Reset to the original <b>${esc(PRESETS[near].name)}</b>? Your edits to the session lists are undone` : `Switch to <b>${esc(PRESETS[ui.confirm.slice(7)].name)}</b>? Your session lists are replaced`}; logged sessions and history stay as they are.</p><div class="btnrow"><button class="btn sm" data-act="usepreset" data-id="${ui.confirm.slice(7)}">${ui.confirm.slice(7) === near && !match ? 'Reset' : 'Switch'}</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div></div>` : ''}</section>`;

  }
  if (pt === 'targets') {
  h += progressionCard();

  }
  if (pt === 'split') {
  // weekly sets comparison
  const cols = [['ppl4', PRESETS.ppl4], ['ulppl5', PRESETS.ulppl5]]; if (!match) cols.push(['yours', cur]);
  const vols = cols.map(([, p]) => planWeekly(p));
  const gs = GROUP_ORDER.filter(g => vols.some(v => v[g]));
  h += `<section class="card"><div class="card-h"><h2>Weekly sets by muscle</h2><span class="eyebrow">training daily</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Muscle</th>${cols.map(([k, p]) => `<th class="n">${k === 'yours' ? 'Yours' : k === 'ppl4' ? 'Current' : 'U/L/PPL'}</th>`).join('')}</tr></thead><tbody>
    ${gs.map(g => `<tr><td>${esc(GROUPS[g])}</td>${vols.map((v, i) => { const base = vols[0][g] || 0, x = v[g] || 0; const tag = i && x > base + .5 ? ' <span class="xs" style="color:var(--accent)">▲</span>' : i && x < base - .5 ? ' <span class="xs muted">▼</span>' : ''; return `<td class="n">${fmt(x, 1)}${tag}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    ${infoHTML("Sets a week if you train every day, counted like Volume on Strength: compounds give half a set to the muscles they also work. Growth needs about 10–20; holding far less.")}</section>`;

  }
  if (pt === 'sessions') {
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

  }
  if (pt === 'exercises') {
  // exercise library
  const exs = Object.entries(S().ex).sort((a, b) => GROUP_ORDER.indexOf(a[1].g) - GROUP_ORDER.indexOf(b[1].g) || a[1].name.localeCompare(b[1].name));
  const q = ui.exQ || '', shown = exs.filter(([id, x]) => ui.editEx === id || exMatch(exHay(x), q)).length;
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Exercises</span><button class="link" data-act="newex">+ Exercise</button></div><section class="card">
    <div class="srch">${ICON.search}<input class="in left" id="exq" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search by name or muscle" aria-label="Search exercises" value="${esc(q)}"><button class="srch-x" id="exqx" data-act="exqclear" aria-label="Clear search" ${q ? '' : 'hidden'}>${ICON.x}</button></div>
    <ul class="rows exlist" id="exlist">
    ${exs.map(([id, x]) => { const hide = ui.editEx !== id && !exMatch(exHay(x), q) ? ' hidden' : '', hay = ` data-q="${esc(exHay(x))}"`; return ui.editEx === id ? `<li style="display:block" data-edit="1"${hay}>${exEditor(id, x)}</li>` : `<li${hay}${hide}><span>${esc(x.name)}</span><button class="link" data-act="editex" data-id="${id}">Edit</button><span class="sub">${esc(GROUPS[x.g] || '')} · ${esc(UNITS[x.u]?.label || x.u)} · ${x.lo}–${x.hi} reps${x.base && x.base.r ? ` · max ${esc(fmtSet(id, x.base))}` : ''}</span></li>`; }).join('')}
  </ul><p class="xs muted" id="exnone" ${shown ? 'hidden' : ''}>No exercises match.</p></section></section>`;

  }
  if (pt === 'split') {
  // settings
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Settings</span></div><section class="card"><div class="fields">
    <label class="fl">Cardio after lifting<select class="in" id="st_cn" data-in="cname">${cardioTypes().map(n => `<option value="${n}" ${n === S().cardio.name ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fl">Cardio minutes<input class="in" id="st_cm" inputmode="numeric" data-in="cmindef" value="${S().cardio.min}"></label>
    <label class="fl">Plate weight (kg)<input class="in" id="st_pk" inputmode="decimal" data-in="platekg" value="${S().plateKg}"></label>
    <label class="fl">Protein target (g)<input class="in" id="st_pt" inputmode="numeric" data-in="proteint" value="${S().proteinT ?? ''}" placeholder="from MacroFactor"></label>
    <label class="fl">Suggested weight and reps<select class="in" id="st_sg" data-in="suggest"><option value="1" ${S().suggest !== false ? 'selected' : ''}>On</option><option value="0" ${S().suggest === false ? 'selected' : ''}>Off</option></select></label>
  </div><p class="xs muted">Plate weight converts plate machines to kg for tonnage.</p>
  <p class="xs muted">Aims follow Targets above. Change a lift's weight step or reps in reserve under Exercises.</p></section></section>`;
  }
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
      ${plan.map(p => `<tr><td>Week ${p.k}</td><td class="n ${grow ? '' : 'act'}">${hold ? esc(suggestTxt(pick, hold)) : '–'}</td><td class="n ${grow ? 'act' : ''}">${esc(suggestTxt(pick, p))}</td><td class="n">+${(p.g * 100).toFixed(1)}%</td></tr>`).join('')}
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
  let h = `<div class="page-h"><div><div class="eyebrow">Sync, imports, backups</div><h1>Settings</h1></div></div>`;
  if (window.GH_SYNC) h += GH.card() + Helper.card() + Helper.traffic() + Helper.explain(); else h += `<section class="card"><div class="card-h"><h2>Where your data lives</h2><span id="sync2">${Cloud.ready ? pill('good', 'Synced') : pill('', 'This browser')}</span></div><p class="small dim">${Cloud.ready ? 'Saved to your private storage for this app on claude.ai, so it follows you between phone and desktop. A copy is also kept in this browser.' : 'Saving in this browser only. Cloud sync starts when the app is opened from claude.ai while signed in.'}</p></section>`;
  const impBox = src => { const p = ui.imp[src]; if (!p) return '';
    return `<div class="prev" id="imp-${src}"><div class="card-h"><b>Ready to import</b></div><p><b>${esc(p.summary)}</b></p><p class="dim">${esc(previewRange(p.days))}</p><p class="xs muted">From ${esc(p.files.join(', '))}.</p>
      <div class="btnrow"><button class="btn" data-act="doimport" data-v="${src}">Import</button><button class="link dim" data-act="cancelimp" data-v="${src}">Cancel</button></div></div>`; };
  h += `<section class="card"><div class="card-h"><h2>WHOOP</h2><span class="eyebrow">recovery · HRV · sleep · strain</span></div>
    <details class="info"><summary>How to export</summary><ol class="steps"><li>In the WHOOP app, open the menu and choose <b>Data Export</b>.</li><li>WHOOP emails you a download link, usually within minutes.</li><li>Choose the .zip below. Only needed for the journal (alcohol); everything else syncs by itself.</li></ol></details>
    <div class="drop" data-drop="whoop"><label class="btn sm ghost filebtn">Choose file<input type="file" class="vh" id="f_whoop" accept=".zip,.csv,text/csv,application/zip" multiple data-in="fwhoop"></label><span class="xs muted">${last('whoop')}</span></div>${impBox('whoop')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>MacroFactor</h2><span class="eyebrow">intake · weight · expenditure</span></div>
    <details class="info"><summary>How to export</summary><ol class="steps"><li>In MacroFactor, go to <b>More → Data Management → Data Export</b>.</li><li>Include nutrition, scale weight, weight trend and expenditure, choose a time frame, then save the spreadsheet.</li><li>Choose it below. Re-importing is safe.</li></ol></details>
    <div class="drop" data-drop="mf"><label class="btn sm ghost filebtn">Choose file<input type="file" class="vh" id="f_mf" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple data-in="fmf"></label><span class="xs muted">${last('mf')}</span></div>${impBox('mf')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Apple Health</h2><span class="eyebrow">steps · headphones · MacroFactor</span></div>
    <p class="small dim">New days arrive through Health Auto Export. For older days, import an Orbit Health file (.json).</p>
    <div class="drop" data-drop="ah"><label class="btn sm ghost filebtn">Choose file<input type="file" class="vh" id="f_ah" accept=".json,application/json" data-in="fah"></label><span class="xs muted">${last('ah')}</span></div>${impBox('ah')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Backups</h2></div>
    <div class="btnrow"><button class="btn sm ghost" data-act="export" data-v="json">Save full backup (.json)</button><button class="btn sm ghost" data-act="export" data-v="csv">Save sets (.csv)</button></div>
    ${ui.exportText ? `<div class="exportbox sec"><span class="xs muted">Saving files isn't available here. Copy this instead.</span><textarea class="in" id="exporttext" readonly>${esc(ui.exportText)}</textarea><button class="btn sm" data-act="copyexport">Copy</button></div>` : ''}
    <label class="btn sm ghost filebtn" style="align-self:flex-start">Restore from a backup<input type="file" class="vh" id="f_backup" accept=".json,application/json" data-in="fbackup"></label></section>`;
  h += `<section class="card"><div class="card-h"><h2>Start over</h2></div>
    ${ui.confirm === 'reset' ? `<p class="small">This deletes every session, import and setting, here and in cloud storage. Save a backup first if you might want it.</p><div class="btnrow"><button class="btn danger sm" data-act="reset">Delete everything</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div>`
      : `<button class="link danger" data-act="confirm" data-v="reset" style="align-self:flex-start">Delete all data</button>`}</section>`;
  h += `<p class="xs muted" style="text-align:center">Orbit v${esc(APP_VERSION)}${ui.update ? ` · <button class="link" data-act="update">v${esc(ui.update)} is ready, update</button>` : ''}</p>`;
  return h;
}
const VIEWS = { today: vToday, log: vLog, history: vHistory, strength: vStrength, body: vBody, plan: vPlan, data: vData };
