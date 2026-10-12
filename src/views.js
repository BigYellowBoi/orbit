/* ============================================================
   VIEWS
   ============================================================ */
function pill(tone, text) { return `<span class="pill ${tone || ''}">${esc(text)}</span>`; }
function stat(v, unit, label, extra) { return `<div class="stat"><b>${v}${unit ? `<small>${esc(unit)}</small>` : ''}</b><span>${esc(label)}</span>${extra || ''}</div>`; }
function deltaTxt(v, base, d = 0, unit = '', invert = false) {
  if (v == null || base == null) return '';
  const diff = v - base; if (Math.abs(diff) < 10 ** -d / 2) return `<span class="delta">= 30-day avg</span>`;
  const better = invert ? diff < 0 : diff > 0;
  return `<span class="delta" style="color:var(${better ? '--good-ink' : '--warn-ink'})">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), d)}${unit} vs 30-day</span>`;
}
function ring(v, tone, strain) { // inner ring: recovery (0–100%); outer ring: day strain (0–21), as on the WHOOP home screen
  const arc = (r, f, col, w) => { const c = 2 * Math.PI * r; return `<circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${w}"/>` + (f > 0 ? `<circle cx="56" cy="56" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * Math.min(1, f)).toFixed(1)} ${c.toFixed(1)}"/>` : ''); };
  const col = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' }[tone] || 'var(--ink-3)';
  return `<div class="ring" role="img" aria-label="Recovery ${v == null ? 'unknown' : Math.round(v) + '%'}${strain != null ? `, strain ${fmt(strain, 1)}` : ''}"><svg viewBox="0 0 112 112">${arc(51, strain != null ? strain / 21 : 0, 'var(--s1)', 6)}${arc(40, Math.max(0, Math.min(100, v || 0)) / 100, col, 6)}</svg><b style="color:${col}">${v == null ? '–' : Math.round(v)}<small style="color:inherit;opacity:.75">%</small></b></div>`;
}
function rxTxt(it) { const d = exDef(it.ex); return `${it.sets} × ${d.lo}${d.hi > d.lo ? '–' + d.hi : ''}`; }
function lastLine(exId, before) {
  const l = lastFor(exId, before), b = bestSet(exId, before), best = b ? `Best ${fmtSet(exId, b)}` : '';
  if (l) return `Last ${fmtDate(l.date)} · ${setsTxt(exId, l.sets)}${best ? ' · ' + best : ''}`;
  return best ? `${best} · not logged yet` : 'Not logged yet';
}

/* ---------- Today ---------- */
function vToday() {
  const t = today(), w = STATE.w[t], sid = w ? w.s : sessionFor(t), sd = sessDef(sid), o = order(), idx = o.indexOf(sid);
  let h = `<div class="page-h"><div><div class="eyebrow">${esc(fmtDow(t))} ${esc(fmtDate(t, { year: 'numeric' }))}</div><h1>Today</h1></div>${o.length ? `<span class="pill plain">Rotation ${rotationCount() + 1}</span>` : ''}</div>`;
  if (w && w.rest) return h + restHero(w) + stripHTML() + `<div class="grid2">${recoveryCard()}${nutritionCard()}</div>` + weekCard();
  if (!sd) return h + `<section class="card"><p>Your programme has no sessions. Add one in Plan.</p><button class="btn" data-act="go" data-tab="plan">Open Plan</button></section>`;
  if (!w && sd.rest) return h + plannedRestHero(sid) + stripHTML() + `<div class="grid2">${recoveryCard()}${nutritionCard()}</div>` + weekCard();
  const wst = w ? wStats(w) : null, status = w ? (wst.sets ? 'Logged today' : 'Opened today') : 'Next up';
  h += `<section class="card hero"><div class="card-h"><span class="eyebrow">${status} · ${idx + 1} of ${o.length}</span>${wst?.sets ? pill('good', 'Logged') : ''}</div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sd.name)}</h1><p class="focus">${esc(sd.focus || '')}</p></div>`;
  if (w) {
    const st = wStats(w);
    const dur = sessDur(w);
    h += `<div class="stats">${stat(st.sets, '', 'sets done')}${stat(dur ? fmtDur(dur) : '–', '', dur ? 'duration · WHOOP' : 'duration, after WHOOP import')}${stat(st.cardio || '–', st.cardio ? 'min' : '', w.cardio?.name || 'Cardio')}</div>
      <button class="btn wide" data-act="go" data-tab="log">${st.sets ? 'Open log' : 'Continue logging'}</button>`;
  } else {
    h += `<ul class="exlist">${sd.items.filter(it => S().ex[it.ex]).map(it => `<li><span>${esc(exDef(it.ex).name)}</span><span class="rx">${rxTxt(it)}</span><span class="lt">${esc(lastLine(it.ex, t))}</span></li>`).join('')}
      <li><span>${esc(S().cardio.name)}</span><span class="rx">${S().cardio.min} min</span></li></ul>
      <button class="btn wide" data-act="start" data-id="${sid}">Log ${esc(sd.name)}</button>
      ${ui.pickSess === 'today' ? `<div class="sec"><span class="xs muted">Do a different session today. The rotation carries on from whichever you log.</span><div class="chips">${trainIds().map(id => `<button class="chip ${id === sid ? 'on' : ''}" data-act="setnext" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div></div>`
        : `<div class="btnrow" style="justify-content:space-between"><button class="link" data-act="picktoday">Change today's session</button><button class="link dim" data-act="restday">Rest day instead</button></div>`}`;
  }
  h += `</section>`;
  h += stripHTML();
  h += `<div class="grid2">${recoveryCard()}${nutritionCard()}</div>`;
  h += weekCard();
  return h;
}
function stripHTML() {
  const up = upcoming(Math.max(5, order().length + 1));
  return `<section class="sec"><div class="sec-h"><span class="eyebrow">Coming up</span></div><div class="strip">${up.map((u, i) => `<div class="sd ${i === 0 ? (u.done ? 'done' : 'now') : ''} ${u.s === '_rest' || isRestSlot(u.s) ? 'rest' : ''}"><small>${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : esc(fmtDow(u.date))}</small><b>${esc(slotName(u.s))}</b></div>`).join('')}</div></section>`;
}
function restHero(w) {
  const nx = sessionFor(addDays(w.date, 1));
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Rest day${isRestSlot(w.s) ? ' · planned' : ''}</span>${pill('', 'Logged')}</div>
    <div><h1>Rest</h1><p class="focus">${isRestSlot(w.s) ? 'Planned rest from your rotation.' : 'The rotation waits.'} Tomorrow: ${esc(slotName(nx))}.</p></div>
    ${w.cardio?.done ? `<p class="small dim">${esc(w.cardio.name)} · ${w.cardio.min || 0} min</p>` : ''}
    <div class="btnrow" style="justify-content:space-between"><button class="btn sm ghost" data-act="go" data-tab="log">${w.cardio?.done ? 'Open day' : 'Log cardio or notes'}</button><button class="link dim" data-act="unrest">Undo rest day</button></div></section>`;
}
function plannedRestHero(sid) {
  const o = order(), idx = o.indexOf(sid), sd = sessDef(sid);
  return `<section class="card hero"><div class="card-h"><span class="eyebrow">Planned rest · ${idx + 1} of ${o.length}</span></div>
    <div class="rot">${o.map((id, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</div>
    <div><h1>${esc(sd.name)}</h1><p class="focus">Nothing to log. If you don't train today, the rotation moves on to ${esc(slotName(nextAfter(sid)))} tomorrow.</p></div>
    <div class="sec"><span class="xs muted">Train anyway</span><div class="chips">${trainIds().map(id => `<button class="chip" data-act="start" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div></div></section>`;
}
function recoveryCard() {
  const t = today(), d = latestWith('rec') || latestWith('slp');
  if (!d) return `<section class="card"><div class="card-h"><h2>Recovery</h2><span class="eyebrow">WHOOP</span></div><p class="dim small">Import your WHOOP export to see recovery, HRV, resting heart rate and sleep here.</p><div class="btnrow"><button class="btn sm" data-act="go" data-tab="data">Import WHOOP data</button></div></section>`;
  const x = STATE.d[d], tone = recTone(x.rec), age = diffDays(d, t);
  const hb = hrvBand(d), rhrB = avgOver('rhr', d, 30, true), strY = dayVal(addDays(d, -1), 'str');
  let note = '';
  if (hb && hb.state === 'below' && age <= 1 && tone !== 'bad') note = `<p class="note">Your 7-day HRV is below your normal range (${fmt(hb.lo, 0)}–${fmt(hb.hi, 0)} ms). A sustained drop often reflects accumulated fatigue, poor sleep or illness, so it's worth watching over the next few days.</p>`;
  if (tone === 'bad' && age <= 1) note = `<p class="note">Red recovery. The rotation stays the same; a lighter day is reasonable, such as stopping sets 2–3 reps short and keeping the ${esc(S().cardio.name.toLowerCase())} easy. Treat the score as a guide, not a rule.</p>`;
  return `<section class="card"><div class="card-h"><h2>Recovery</h2>${x.rec != null ? pill(tone, recWord(x.rec)) : ''}</div>
    <div class="recov">${ring(x.rec, tone, strY)}<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      ${stat(x.hrv != null ? fmt(x.hrv, 0) : '–', 'ms', 'HRV', hb ? `<span class="delta" style="color:var(${hb.state === 'below' ? '--warn-ink' : hb.state === 'within' ? '--good-ink' : '--ink-2'})">7-day ${HRV_STATE[hb.state][1].toLowerCase()}</span>` : '')}
      ${stat(x.rhr != null ? fmt(x.rhr, 0) : '–', 'bpm', 'Resting HR', deltaTxt(x.rhr, rhrB?.avg, 0, '', true))}
      ${stat(x.slp != null ? fmt(x.slp / 60, 1) : '–', 'h', 'Asleep', x.sp != null ? `<span class="delta">${fmt(x.sp, 0)}% of need${x.sd != null ? ` · debt ${fmt(x.sd, 0)} min` : ''}</span>` : '')}
      ${stat(strY != null ? `<span style="color:var(--s1)">${fmt(strY, 1)}</span>` : '–', '', 'Strain, day before')}
    </div></div>${note}
    <div class="btnrow" style="justify-content:space-between"><span class="xs muted">WHOOP · ${esc(fmtDate(d))}${age > 1 ? ` · ${age} days old, import a new export to update` : ''}</span></div></section>`;
}
function nutritionCard() {
  const t = today(), d = latestWith('kcal'), tw = latestWith('tw') || latestWith('wt');
  if (!d && !tw) return `<section class="card"><div class="card-h"><h2>Nutrition</h2><span class="eyebrow">MacroFactor</span></div><p class="dim small">Import a MacroFactor export to see intake, expenditure and trend weight next to your training.</p><div class="btnrow"><button class="btn sm" data-act="go" data-tab="data">Import MacroFactor data</button></div></section>`;
  const x = d ? STATE.d[d] : {}, pT = x.pT ?? S().proteinT, kT = x.kT;
  const twv = tw ? (STATE.d[tw].tw ?? STATE.d[tw].wt) : null, wr = weightRate();
  const expD = latestWith('exp');
  return `<section class="card"><div class="card-h"><h2>Nutrition</h2><span class="eyebrow">${d ? esc(d === t ? 'Today so far' : fmtDate(d)) : ''}</span></div>
    <div class="stats four">
      ${stat(x.kcal != null ? fmt(x.kcal, 0) : '–', 'kcal', kT ? `of ${fmt(kT, 0)} target` : 'calories')}
      ${stat(x.p != null ? fmt(x.p, 0) : '–', 'g', pT ? `protein of ${fmt(pT, 0)}` : 'protein')}
      ${stat(x.c != null ? fmt(x.c, 0) : '–', 'g', 'carbs')}
      ${stat(x.f != null ? fmt(x.f, 0) : '–', 'g', 'fat')}
    </div><hr class="hr"><div class="stats">
      ${stat(twv != null ? fmt(twv, 1) : '–', 'kg', STATE.d[tw]?.tw != null ? 'trend weight' : 'scale weight', wr ? `<span class="delta">${wr.wk >= 0 ? '+' : '−'}${fmt(Math.abs(wr.wk), 2)} kg/wk over ${wr.weeks} wk</span>` : '')}
      ${stat(expD ? fmt(STATE.d[expD].exp, 0) : '–', 'kcal', 'expenditure')}
      ${stat(x.kcal != null && expD ? (x.kcal - STATE.d[expD].exp >= 0 ? '+' : '−') + fmt(Math.abs(x.kcal - STATE.d[expD].exp), 0) : '–', '', 'balance')}
    </div></section>`;
}
function weekCard() {
  const t = today(), ws = weekStart(t);
  const wk = Object.values(STATE.w).filter(w => w.date >= ws && w.date <= t && !w.rest);
  const sets = sum(wk.map(w => wStats(w).sets)), card = sum(wk.map(w => wStats(w).cardio));
  const rec = avgOver('rec', t, dowMon(t) + 1);
  const prs = wk.flatMap(w => prsIn(w));
  return `<section class="card"><div class="card-h"><h2>This week</h2><span class="eyebrow">from ${esc(fmtDate(ws))}</span></div>
    <div class="stats four">${stat(wk.length, '', 'sessions')}${stat(sets, '', 'working sets')}${stat(card, 'min', 'cardio')}${stat(rec ? fmt(rec.avg, 0) : '–', rec ? '%' : '', 'avg recovery')}</div>
    ${prs.length ? `<div class="sec"><span class="xs muted">New bests this week</span><div class="chips">${prs.slice(0, 6).map(p => `<span class="pill acc">${esc(exDef(p.id).name)} ${esc(fmtSet(p.id, p.s))}</span>`).join('')}</div></div>` : ''}</section>`;
}

/* ---------- Log ---------- */
function vLog() {
  const d = ui.logDate || today(), w = STATE.w[d], t = today();
  let h = `<div class="dnav"><button class="iconbtn" data-act="logday" data-n="-1" aria-label="Previous day">‹</button><div class="dnav-c"><b>${d === t ? 'Today' : esc(fmtDow(d) + ' ' + fmtDate(d))}</b><small>${esc(fmtDate(d, { weekday: 'long', year: 'numeric' }))}</small></div><button class="iconbtn" data-act="logday" data-n="1" aria-label="Next day" ${d >= t ? 'disabled style="opacity:.3"' : ''}>›</button></div>`;
  if (w && w.rest) {
    if (autoCardio(w)) saveW(w.date);
    h += `<section class="card"><div class="card-h"><h2>Rest day</h2>${isRestSlot(w.s) ? pill('', 'Planned') : ''}</div><p class="small dim">No lifting logged. Cardio and notes below are optional.</p>
      <div class="btnrow"><button class="link" data-act="unrest">Undo rest day</button></div></section>`;
    h += cardioCard(w);
    h += `<section class="card"><label class="fl">Notes<textarea class="in" id="wnote" data-in="note" placeholder="Optional">${esc(w.note || '')}</textarea></label></section>`;
    h += `<button class="btn wide" data-act="logdone">Done</button>`;
    return h;
  }
  if (!w) {
    const o = trainIds(), due = sessionFor(d), sid = ui.pickSess && sessDef(ui.pickSess) ? ui.pickSess : nextTraining(due), sd = sessDef(sid);
    if (!sd) return h + `<section class="card"><p>Add a session in Plan first.</p></section>`;
    h += `<section class="card"><div class="card-h"><span class="eyebrow">${d === t ? 'Nothing logged yet' : 'No session on this day'}</span>${isRestSlot(due) ? pill('', 'Planned rest') : ''}</div>
      <div class="chips">${o.map(id => `<button class="chip ${id === sid ? 'on' : ''}" data-act="picksess" data-id="${id}">${esc(sessDef(id).name)}</button>`).join('')}</div>
      <ul class="exlist">${sd.items.filter(it => S().ex[it.ex]).map(it => `<li><span>${esc(exDef(it.ex).name)}</span><span class="rx">${rxTxt(it)}</span><span class="lt">${esc(lastLine(it.ex, d))}</span></li>`).join('')}</ul>
      <button class="btn wide" data-act="start" data-id="${sid}">Log ${esc(sd.name)}</button>
      <button class="link dim" data-act="restday" style="align-self:flex-start">Mark as a rest day</button>
      <p class="xs muted">Last session's numbers show faintly in each box as a guide. A set counts as soon as you enter its reps; leave the weight blank to use last time's.</p></section>`;
    return h;
  }
  const sd = sessDef(w.s), st = wStats(w);
  h += `<div class="sess-top"><div class="t"><b>${esc(sessName(w))}</b><small>${esc(sd?.focus || '')} · ${st.sets} set${st.sets === 1 ? '' : 's'}${st.kg ? ` · ${fmt(st.kg / 1000, 1)} t moved` : ''}</small></div>
    ${sessDur(w) ? pill('acc', fmtDur(sessDur(w))) : ''}</div>`;
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
  h += `<section class="card"><label class="fl">Session notes<textarea class="in" id="wnote" data-in="note" placeholder="Anything worth remembering next time">${esc(w.note || '')}</textarea></label></section>`;
  h += `<button class="btn wide" data-act="logdone">Done</button>`;
  h += ui.confirm === 'delw' ? `<section class="card"><p>Delete this session and its sets?</p><div class="btnrow"><button class="btn danger sm" data-act="delw">Delete session</button><button class="link dim" data-act="confirm" data-v="">Keep it</button></div></section>`
    : `<button class="link danger" data-act="confirm" data-v="delw" style="align-self:flex-start">Delete this session</button>`;
  return h;
}
function exCard(w, e, i, prSet) {
  const def = exDef(e.id), u = UNITS[def.u] || UNITS.kg;
  const ph = (v, dflt) => v != null ? fmt(v, 2).replace(/,/g, '') : dflt;
  return `<section class="card ex" id="ex${i}"><div class="ex-h"><h3>${esc(def.name)}</h3><span class="rx">${def.lo}${def.hi > def.lo ? '–' + def.hi : ''} reps</span></div>
    <p class="ex-meta">${esc(lastLine(e.id, w.date))}${def.note ? ` · ${esc(def.note)}` : ''}</p>
    ${(() => { const ln = e.note == null ? lastExerciseNote(e.id, w.date) : null; return ln ? `<p class="ex-lastnote">Note from ${esc(fmtDate(ln.date))}: ${esc(ln.note)}</p>` : ''; })()}
    <div class="sets"><div class="set hdr"><span>Set</span><span>${esc(u.col)}</span><span>Reps</span><span></span></div>
    ${e.sets.map((s, j) => `<div class="set ${s.done ? 'done' : ''} ${prSet.has(s) ? 'pr' : ''}" id="row${i}_${j}"><span class="sn">${j + 1}</span>
      <input class="in" id="w${i}_${j}" inputmode="decimal" enterkeyhint="next" data-in="w" data-e="${i}" data-s="${j}" value="${s.w ?? ''}" placeholder="${ph(s.pw, def.u === 'bw' ? '0' : '–')}" aria-label="Set ${j + 1} ${esc(u.label)}">
      <input class="in" id="r${i}_${j}" inputmode="numeric" enterkeyhint="next" data-in="r" data-e="${i}" data-s="${j}" value="${s.r ?? ''}" placeholder="${ph(s.pr, '–')}" aria-label="Set ${j + 1} reps">
      <span class="mark" aria-hidden="true">${ICON.tick}</span></div>`).join('')}</div>
    ${e.note != null || ui.exNote === i ? `<label class="fl">Exercise note<textarea class="in exnote" id="xn${i}" data-in="exnote" data-e="${i}" placeholder="Seat height, grip, how it felt">${esc(e.note || '')}</textarea></label>` : ''}
    <div class="ex-foot"><button class="link" data-act="addset" data-e="${i}">+ Set</button>${e.note == null && ui.exNote !== i ? `<button class="link dim" data-act="exnote" data-e="${i}">+ Note</button>` : ''}${e.sets.length > 1 ? `<button class="link dim" data-act="remset" data-e="${i}">Remove last set</button>` : ''}<button class="link dim" data-act="remex" data-e="${i}" style="margin-left:auto">Remove</button></div></section>`;
}
function cardioTypes() { return Object.keys(CARDIO_RE); }
function cardioCard(w) {
  if (w.cardio === null) return `<section class="card flat"><div class="card-h"><h2>Cardio</h2>${pill('', 'Removed')}</div><p class="small dim">No cardio for this session.</p>
    <div class="chips">${cardioTypes().map(n => `<button class="chip" data-act="cardiotype" data-v="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></section>`;
  const c = w.cardio || { name: S().cardio.name, min: S().cardio.min };
  const acts = whoopCardio(w.date, c.name);
  const wmin = Math.round(sum(acts.map(a => a.min || 0)));
  return `<section class="card"><div class="card-h"><h2>${esc(c.name)}</h2>${c.done ? pill('good', c.src === 'whoop' && !c.manual ? 'Logged from WHOOP' : 'Done') : pill('', 'After lifting')}</div>
    <div class="chips" role="group" aria-label="Cardio type">${cardioTypes().map(n => `<button class="chip ${n === c.name ? 'on' : ''}" data-act="cardiotype" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="fields" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label class="fl">Minutes<input class="in" id="cmin" inputmode="numeric" data-in="cmin" value="${c.min ?? ''}"></label><label class="fl">Level or note<input class="in" id="clvl" data-in="clvl" value="${esc(c.lvl ?? '')}" placeholder="optional"></label></div>
    ${acts.map(a => `<p class="whoopact">WHOOP · ${esc(a.n)}${a.t ? ` from ${esc(a.t)}` : ''}${a.min ? ` · ${fmt(a.min, 0)} min` : ''}${a.str != null ? ` · strain ${fmt(a.str, 1)}` : ''}${a.ahr ? ` · avg ${fmt(a.ahr, 0)} bpm` : ''}${a.kcal ? ` · ${fmt(a.kcal, 0)} kcal` : ''}</p>`).join('')}
    <div class="btnrow"><button class="btn ${c.done ? 'ghost' : ''}" data-act="cardio">${c.done ? 'Mark not done' : `Log ${esc(c.name.toLowerCase())}`}</button>${!c.done && wmin ? `<button class="btn ghost" data-act="cardiowhoop" data-v="${wmin}">Log WHOOP's ${wmin} min</button>` : ''}<button class="link danger" data-act="cardiorem" style="margin-left:auto">Remove</button></div></section>`;
}

/* ---------- History ---------- */
function vHistory() {
  const ws = workoutsSorted().reverse(), nNotes = noteEntries().length;
  let h = `<div class="page-h"><div><div class="eyebrow">${ws.filter(w => !w.rest).length} sessions logged</div><h1>History</h1></div>
    <div class="seg" role="group" aria-label="View"><button class="${ui.hist !== 'notes' ? 'on' : ''}" data-act="histview" data-v="sessions">Sessions</button><button class="${ui.hist === 'notes' ? 'on' : ''}" data-act="histview" data-v="notes">Notes${nNotes ? ` ${nNotes}` : ''}</button></div></div>`;
  if (ui.hist === 'notes') return h + vNotes();
  if (!ws.length) return h + `<section class="card"><p class="dim">Sessions you log appear here, grouped by week.</p><button class="btn sm" data-act="go" data-tab="log" style="align-self:flex-start">Log today</button></section>`;
  let wk = null;
  for (const w of ws) {
    const s = weekStart(w.date);
    if (s !== wk) {
      if (wk) h += `</div>`;
      wk = s; const inW = ws.filter(x => weekStart(x.date) === s && !x.rest);
      h += `<div class="sec-h"><span class="eyebrow">Week of ${esc(fmtDate(s))}</span><span class="xs muted">${inW.length} sessions · ${sum(inW.map(x => wStats(x).sets))} sets</span></div><div class="hist">`;
    }
    const st = wStats(w), prs = prsIn(w).length, rec = dayVal(w.date, 'rec');
    h += `<button class="hrow" data-act="openlog" data-d="${w.date}"><span class="hdate"><b>${esc(w.date.slice(8))}</b><small>${esc(fmtDow(w.date))}</small></span>
      <span class="hmain"><b${w.rest ? ' class="dim"' : ''}>${esc(sessName(w))}</b><small>${w.rest ? (st.cardio ? `${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : 'No training') : `${st.sets} sets`}${sessDur(w) ? ` · ${fmtDur(sessDur(w))}` : ''}${!w.rest && st.cardio ? ` · ${st.cardio} min ${esc(w.cardio.name.toLowerCase())}` : ''}${prs ? ` · ${prs} best${prs > 1 ? 's' : ''}` : ''}</small></span>
      ${rec != null ? pill(recTone(rec), `${Math.round(rec)}%`) : '<span></span>'}${w.note && w.note.trim() ? `<span class="hnote">${esc(w.note.trim())}</span>` : ''}</button>`;
  }
  return h + `</div>`;
}

/* ---------- Trends ---------- */
function vTrends() {
  const t = today(), from0 = null;
  const from = Object.keys(STATE.w).sort()[0] || addDays(t, -29);
  const ax = dateAxis(from, t), xi = d => diffDays(from, d);
  let h = `<div class="page-h"><div><div class="eyebrow">WHOOP · MacroFactor · logbook</div><h1>Trends</h1></div></div>`;
  h += explorerHTML();
  h += alcoholCard();

  // Weekly summary
  const nW = ui.weeksAll ? 26 : 8, wrows = weekRows(nW).filter(r => r.sessions || r.rec != null || r.kcal != null || r.tw != null);
  if (wrows.length) {
    const c = (v, d = 0, u = '') => v == null ? '<span class="muted">–</span>' : fmt(v, d) + u;
    h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Weekly summary</span><span class="xs muted">weeks start Monday</span></div><section class="card"><div class="tblwrap"><table class="tbl wk"><thead><tr><th>Week</th><th class="n">Sessions</th><th class="n">Sets</th><th class="n">Cardio</th><th class="n">Recovery</th><th class="n">HRV</th><th class="n">Sleep</th><th class="n">kcal</th><th class="n">Protein</th><th class="n">Weight Δ</th></tr></thead><tbody>
      ${wrows.map(r => `<tr><td>${esc(fmtDate(r.ws))}${r.cur ? ' <span class="xs muted">so far</span>' : ''}</td><td class="n">${r.sessions || '<span class="muted">–</span>'}</td><td class="n">${r.sets || '<span class="muted">–</span>'}</td><td class="n">${r.cardio ? r.cardio + ' min' : '<span class="muted">–</span>'}</td>
        <td class="n">${r.rec != null ? `<span style="color:var(--${recTone(r.rec)}-ink)">${fmt(r.rec, 0)}%</span>` : '<span class="muted">–</span>'}</td><td class="n">${c(r.hrv, 0)}</td><td class="n">${r.slp != null ? fmt(r.slp / 60, 1) + ' h' : '<span class="muted">–</span>'}</td><td class="n">${c(r.kcal, 0)}</td><td class="n">${c(r.p, 0, ' g')}</td><td class="n">${r.dtw != null ? (r.dtw >= 0 ? '+' : '−') + fmt(Math.abs(r.dtw), 2) : '<span class="muted">–</span>'}</td></tr>`).join('')}
      </tbody></table></div><div class="btnrow" style="justify-content:space-between"><span class="xs muted">Daily averages, except sessions, sets and cardio (totals). Weight Δ is MacroFactor's trend weight change.</span><button class="link" data-act="weeksall">${ui.weeksAll ? 'Show 8 weeks' : 'Show 26 weeks'}</button></div></section></section>`;
  }

  // Personal records
  const ids = [...new Set(order().flatMap(id => sessDef(id).items.map(it => it.ex)))].filter(id => S().ex[id]);
  const others = Object.keys(S().ex).filter(id => !ids.includes(id) && records(id)?.logged);
  const prIds = [...ids, ...others].filter(id => records(id));
  const when = c => c.date ? esc(fmtDate(c.date, { year: '2-digit' })) : 'stated';
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Personal records</span><span class="xs muted">all time</span></div><section class="card">
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Lift</th><th class="n">Heaviest</th><th class="n">Best e1RM</th></tr></thead><tbody>
    ${prIds.map(id => { const r = records(id), u = exDef(id).u; return `<tr><td>${esc(exDef(id).name)}</td>
      <td class="n">${esc(u === 'bw' ? (r.heavy.s.w ? fmtSet(id, r.heavy.s) : `${r.heavy.s.r} reps`) : u === 'kg' ? `${fmt(r.heavy.s.w, 2)} kg × ${r.heavy.s.r}` : `${fmt(r.heavy.s.w, 2)} pl × ${r.heavy.s.r}`)}<br><span class="xs muted">${when(r.heavy)}</span></td>
      <td class="n">${u === 'bw' ? '–' : esc(scoreTxt(id, setScore(id, r.best.s)))}<br><span class="xs muted">${u === 'bw' ? '' : esc(fmtSet(id, r.best.s)) + ' · '}${when(r.best)}</span></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="xs muted">"Stated" means the max you entered in Plan, which stays the record until a logged set beats it. Estimated 1RM uses the Epley formula and gets less reliable above about 10 reps.</p></section></section>`;

  // Strength maintenance
  const rows = ids.map(id => ({ id, m: maintenance(id) }));
  const logged = rows.filter(r => r.m.state !== 'none' || r.m.last);
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Strength · maintenance check</span></div>`;
  if (!logged.length) h += `<section class="card"><p class="dim small">Once you've logged a few sessions, each lift shows whether your best estimated 1-rep max over the last 4 weeks is holding against the 2 months before it.</p></section>`;
  else {
    h += `<section class="card"><p class="xs muted">Best estimated 1RM (Epley) in the last 28 days vs days 29–90 of logged sessions. Within ±2.5% counts as holding, since day-to-day strength varies by about that much. Bodyweight lifts compare best reps.</p><div class="tblwrap"><table class="tbl"><thead><tr><th>Lift</th><th class="n">Top set</th><th class="n">28-day change</th></tr></thead><tbody>
      ${logged.map(({ id, m }) => { const [tone, word] = MSTATE[m.state]; return `<tr><td>${esc(exDef(id).name)}</td><td class="n">${m.last ? esc(fmtSet(id, m.last.top)) : '–'}</td><td class="n">${tone ? pill(tone, `${word} ${(m.ch >= 0 ? '+' : '−') + fmt(Math.abs(m.ch), 1)}%`) : `<span class="xs muted">${word}</span>`}</td></tr>`; }).join('')}
      </tbody></table></div></section>`;
    const pick = ui.lift && S().ex[ui.lift] ? ui.lift : logged[0].id, ser = liftSeries(pick).filter(p => !from0 || p.date >= from0);
    h += `<section class="card"><label class="fl">Lift<select class="in" id="liftpick" data-in="lift">${logged.map(r => `<option value="${r.id}" ${r.id === pick ? 'selected' : ''}>${esc(exDef(r.id).name)}</option>`).join('')}</select></label>
      <div class="card-h"><span class="small dim">${exDef(pick).u === 'bw' ? 'Best reps per session' : `Estimated 1RM per session (${exDef(pick).u === 'plates' ? 'plates / side' : 'kg'})`}</span>${maxScore(pick) ? `<div class="legend"><span><i class="ln" style="background:var(--ink-2)"></i>Your max ${esc(fmtSet(pick, exDef(pick).base))}</span></div>` : ''}</div>
      ${chartHTML({ h: 170, ...ax, refY: maxScore(pick) ? { v: maxScore(pick) } : null, yPad: exDef(pick).u === 'plates' ? .1 : 1, yFmt: v => fmt(v, exDef(pick).u === 'plates' ? 2 : 0), series: [{ color: 'var(--s1)', pts: ser.map(p => ({ x: xi(p.date), y: p.y })), dots: true, r: 3.5, end: true }], hoverXs: ser.map(p => xi(p.date)), tip: x => { const p = ser.find(q => xi(q.date) === x); return p ? `<b>${esc(fmtDate(p.date))}</b><br>${esc(fmtSet(pick, p.top))} · ${esc(scoreTxt(pick, p.y))}` : ''; }, empty: 'No sets for this lift in this range', label: 'Lift trend' })}</section>`;
  }
  h += `</section>`;

  // Recovery after each session type
  {
    const ra = recoveryAfter().filter(r => r.n >= 2).sort((a, b) => b.avg - a.avg);
    if (ra.length >= 2) h += `<section class="card"><div class="card-h"><h2>Recovery the morning after</h2><span class="eyebrow">all time</span></div><p class="xs muted">Average next-day WHOOP recovery after each session type. Small samples move a lot; read it as a hint.</p>
      <ul class="hbars">${ra.map(r => `<li><span class="lab">${esc(r.k)}</span><span class="trk"><span class="fill" style="width:${Math.max(2, r.avg)}%;background:var(--${recTone(r.avg)})"></span></span><span class="v">${fmt(r.avg, 0)}% <span class="muted">n${r.n}</span></span></li>`).join('')}</ul></section>`;
  }

  // Volume
  const plan = planWeekly(S().prog), done = doneByGroup(addDays(t, -6), t), gs = GROUP_ORDER.filter(g => plan[g] || done[g]);
  const mx = Math.max(1, ...gs.map(g => Math.max(plan[g] || 0, done[g] || 0)));
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Volume · last 7 days</span></div><section class="card"><div class="legend"><span><i class="ln" style="background:var(--s1);height:8px;width:12px"></i>Sets done</span><span><i class="tk"></i>Plan, if trained daily</span></div>
    <ul class="hbars">${gs.map(g => `<li><span class="lab">${esc(GROUPS[g])}</span><span class="trk"><span class="fill" style="width:${(done[g] || 0) / mx * 100}%"></span>${plan[g] ? `<span class="tgt" style="left:calc(${plan[g] / mx * 100}% - 1px)"></span>` : ''}</span><span class="v">${done[g] || 0} <span class="muted">/ ${fmt(plan[g] || 0, 0)}</span></span></li>`).join('')}</ul>
    <p class="xs muted">Direct working sets only. Compounds also train other muscles (rows hit rear delts, presses hit triceps), so real totals run higher.</p></section></section>`;
  return h;
}

/* ---------- Plan ---------- */
function progSig(p) { return JSON.stringify({ o: p.order, s: Object.fromEntries(Object.entries(p.sessions).map(([k, v]) => [k, v.items.map(i => i.ex + i.sets)])) }); }
function vPlan() {
  const cur = S().prog, sig = progSig(cur), o = order();
  const match = Object.keys(PRESETS).find(k => progSig(PRESETS[k]) === sig);
  let h = `<div class="page-h"><div><div class="eyebrow">${match ? esc(PRESETS[match].name) : 'Custom split'} · ${trainIds().length} sessions${o.length > trainIds().length ? ` + ${o.length - trainIds().length} rest` : ''}</div><h1>Plan</h1></div></div>`;
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Split</span></div><div class="grid2">${Object.entries(PRESETS).map(([k, p]) => `<button class="opt ${match === k ? 'on' : ''}" data-act="preset" data-id="${k}"><b>${esc(p.name)}</b><span class="seqs">${p.order.map(id => esc(p.sessions[id].name)).join(' → ')}</span><span>${esc(p.blurb)}</span></button>`).join('')}</div>
    ${ui.confirm && ui.confirm.startsWith('preset:') ? `<div class="prev"><p>Switch to <b>${esc(PRESETS[ui.confirm.slice(7)].name)}</b>? Your session lists are replaced; logged sessions and history stay as they are.</p><div class="btnrow"><button class="btn sm" data-act="usepreset" data-id="${ui.confirm.slice(7)}">Switch</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div></div>` : ''}</section>`;

  // weekly sets comparison
  const cols = [['ppl4', PRESETS.ppl4], ['ulppl5', PRESETS.ulppl5]]; if (!match) cols.push(['yours', cur]);
  const vols = cols.map(([, p]) => planWeekly(p));
  const gs = GROUP_ORDER.filter(g => vols.some(v => v[g]));
  h += `<section class="card"><div class="card-h"><h2>Weekly sets by muscle</h2><span class="eyebrow">training daily</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Muscle</th>${cols.map(([k, p]) => `<th class="n">${k === 'yours' ? 'Yours' : k === 'ppl4' ? 'Current' : 'U/L/PPL'}</th>`).join('')}</tr></thead><tbody>
    ${gs.map(g => `<tr><td>${esc(GROUPS[g])}</td>${vols.map((v, i) => { const base = vols[0][g] || 0, x = v[g] || 0; const tag = i && x > base + .5 ? ' <span class="xs" style="color:var(--accent)">▲</span>' : i && x < base - .5 ? ' <span class="xs muted">▼</span>' : ''; return `<td class="n">${fmt(x, 1)}${tag}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="xs muted">Direct sets per week, assuming you train every day. Growth research on trained lifters points to roughly 10–20 hard sets per muscle per week (Schoenfeld et al., 2017; Baz-Valle et al., 2022). Holding muscle and strength takes far less: studies have kept both on a third to a ninth of the original volume, as long as the sets stay heavy (Bickel et al., 2011; Spiering et al., 2021). Both splits clear that bar easily.</p></section>`;

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
  h += `</div><p class="xs muted">Drag the handle to reorder sessions, or exercises inside a session. Tap a session to open it.</p>`;
  h += `</section>`;

  // exercise library
  const exs = Object.entries(S().ex).sort((a, b) => GROUP_ORDER.indexOf(a[1].g) - GROUP_ORDER.indexOf(b[1].g) || a[1].name.localeCompare(b[1].name));
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Exercises</span><button class="link" data-act="newex">+ Exercise</button></div><section class="card"><ul class="rows">
    ${exs.map(([id, x]) => ui.editEx === id ? `<li style="display:block">${exEditor(id, x)}</li>` : `<li><span>${esc(x.name)}</span><button class="link" data-act="editex" data-id="${id}">Edit</button><span class="sub">${esc(GROUPS[x.g] || '')} · ${esc(UNITS[x.u]?.label || x.u)} · ${x.lo}–${x.hi} reps${x.base && x.base.r ? ` · max ${esc(fmtSet(id, x.base))}` : ''}</span></li>`).join('')}
  </ul></section></section>`;

  // settings
  h += `<section class="sec"><div class="sec-h"><span class="eyebrow">Settings</span></div><section class="card"><div class="fields">
    <label class="fl">Cardio after lifting<select class="in" id="st_cn" data-in="cname">${cardioTypes().map(n => `<option value="${n}" ${n === S().cardio.name ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fl">Cardio minutes<input class="in" id="st_cm" inputmode="numeric" data-in="cmindef" value="${S().cardio.min}"></label>
    <label class="fl">Plate weight (kg)<input class="in" id="st_pk" inputmode="decimal" data-in="platekg" value="${S().plateKg}"></label>
    <label class="fl">Protein target (g)<input class="in" id="st_pt" inputmode="numeric" data-in="proteint" value="${S().proteinT ?? ''}" placeholder="from MacroFactor"></label>
  </div><p class="xs muted">Plate weight converts plate-loaded machines to kg for session tonnage. Protein target is used when your MacroFactor export has no target column.</p></section></section>`;
  return h;
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
    <label class="fl">Note<input class="in left" id="xe_note" value="${esc(x.note || '')}" placeholder="optional"></label>
  </div><div class="btnrow"><button class="btn sm" data-act="saveex" data-id="${id}">Save</button><button class="link dim" data-act="editex" data-id="">Cancel</button>
  ${Object.values(S().prog.sessions).some(s => s.items.some(i => i.ex === id)) ? '' : `<button class="link danger" data-act="delex" data-id="${id}" style="margin-left:auto">Delete</button>`}</div></div>`;
}

/* ---------- Data ---------- */
function vData() {
  const im = S().imports || {};
  const last = k => im[k] ? `Last import ${new Date(im[k].at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${im[k].n} days · ${esc(im[k].range)}` : 'Not imported yet';
  let h = `<div class="page-h"><div><div class="eyebrow">Imports, backups, storage</div><h1>Data</h1></div></div>`;
  if (window.GH_SYNC) h += GH.card(); else h += `<section class="card"><div class="card-h"><h2>Where your data lives</h2><span id="sync2">${Cloud.ready ? pill('good', 'Synced') : pill('', 'This browser')}</span></div><p class="small dim">${Cloud.ready ? 'Saved to your private storage for this app on claude.ai, so it follows you between phone and desktop. A copy is also kept in this browser.' : 'Saving in this browser only. Cloud sync starts when the app is opened from claude.ai while signed in.'}</p></section>`;
  const impBox = src => { const p = ui.imp[src]; if (!p) return '';
    return `<div class="prev" id="imp-${src}"><div class="card-h"><b>Ready to import</b></div><p><b>${esc(p.summary)}</b></p><p class="dim">${esc(previewRange(p.days))}</p><p class="xs muted">From ${esc(p.files.join(', '))}. Matching days are updated with these values; everything else stays.</p>
      <div class="btnrow"><button class="btn" data-act="doimport" data-v="${src}">Import</button><button class="link dim" data-act="cancelimp" data-v="${src}">Cancel</button></div></div>`; };
  h += `<section class="card"><div class="card-h"><h2>WHOOP</h2><span class="eyebrow">recovery · HRV · sleep · strain</span></div>
    <ol class="steps"><li>In the WHOOP app, open the menu and choose <b>Data Export</b>.</li><li>WHOOP emails you a download link, usually within minutes.</li><li>Save the file, then choose it below. The .zip works as is, or pick <span class="mono">physiological_cycles.csv</span>, <span class="mono">workouts.csv</span> and <span class="mono">journal_entries.csv</span> from inside it. Only the alcohol answer is read from the journal.</li></ol>
    <div class="drop" data-drop="whoop"><input type="file" class="file" id="f_whoop" accept=".zip,.csv,text/csv,application/zip" multiple data-in="fwhoop"><span class="xs muted">${last('whoop')}</span></div>${impBox('whoop')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>MacroFactor</h2><span class="eyebrow">intake · weight · expenditure</span></div>
    <ol class="steps"><li>In MacroFactor, go to <b>More → Data Management → Data Export</b>.</li><li>Include nutrition, scale weight, weight trend and expenditure, choose a time frame, then save the spreadsheet.</li><li>Choose it below. Re-importing is safe: matching days are updated, not duplicated.</li></ol>
    <div class="drop" data-drop="mf"><input type="file" class="file" id="f_mf" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple data-in="fmf"><span class="xs muted">${last('mf')}</span></div>${impBox('mf')}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Backups</h2></div><p class="small dim">A full backup restores everything here. The CSV is every logged set, for a spreadsheet.</p>
    <div class="btnrow"><button class="btn sm ghost" data-act="export" data-v="json">Save full backup (.json)</button><button class="btn sm ghost" data-act="export" data-v="csv">Save sets (.csv)</button></div>
    ${ui.exportText ? `<div class="exportbox sec"><span class="xs muted">Saving files isn't available here. Copy this instead.</span><textarea class="in" id="exporttext" readonly>${esc(ui.exportText)}</textarea><button class="btn sm" data-act="copyexport">Copy</button></div>` : ''}
    <label class="fl">Restore from a backup<input type="file" class="file" id="f_backup" accept=".json,application/json" data-in="fbackup"></label></section>`;
  h += `<section class="card"><div class="card-h"><h2>Start over</h2></div>
    ${ui.confirm === 'reset' ? `<p class="small">This deletes every session, import and setting, here and in cloud storage. Save a backup first if you might want it.</p><div class="btnrow"><button class="btn danger sm" data-act="reset">Delete everything</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div>`
      : `<button class="link danger" data-act="confirm" data-v="reset" style="align-self:flex-start">Delete all data</button>`}</section>`;
  return h;
}
const VIEWS = { today: vToday, log: vLog, history: vHistory, trends: vTrends, plan: vPlan, data: vData };
