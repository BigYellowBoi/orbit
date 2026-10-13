/* ============================================================
   NOTES — session and exercise notes, compiled by muscle group.
   Notes flow one way: a workout's own note is never changed from the Notes list.
   Edits and removals made in the list are stored separately (S().notebook).
   ============================================================ */
const NOTE_GROUPS = { ...GROUPS, general: 'General' };
function notebook() { const nb = S().notebook || (S().notebook = {}); nb.general = nb.general || []; nb.edits = nb.edits || {}; nb.hidden = nb.hidden || {}; return nb; }
function noteEntries() {
  const nb = notebook(), out = [];
  for (const w of Object.values(STATE.w)) {
    const groups = [...new Set((w.ex || []).filter(e => !w.rest).map(e => exDef(e.id).g))];
    if (w.note && w.note.trim()) { const k = 's|' + w.date; if (!nb.hidden[k]) out.push({ k, date: w.date, groups: groups.length ? groups : ['general'], src: `${sessName(w)} · session note`, text: nb.edits[k] ?? w.note.trim(), edited: k in nb.edits }); }
    for (const e of w.ex || []) if (e.note && e.note.trim()) { const k = `e|${w.date}|${e.id}`; if (!nb.hidden[k]) out.push({ k, date: w.date, groups: [exDef(e.id).g], src: `${sessName(w)} · ${exDef(e.id).name}`, text: nb.edits[k] ?? e.note.trim(), edited: k in nb.edits }); }
  }
  for (const n of nb.general) out.push({ k: 'g|' + n.id, date: n.date, groups: [n.g || 'general'], src: 'Added in Notes', text: n.text, general: true });
  return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
function lastSessionNote(w) { // newest earlier note for the same session type
  let best = null; for (const x of Object.values(STATE.w)) if (x.s === w.s && x.date < w.date && x.note && x.note.trim() && (!best || x.date > best.date)) best = x;
  return best;
}
function lastExerciseNote(exId, before) {
  let best = null; for (const x of Object.values(STATE.w)) if (x.date < before) for (const e of x.ex || []) if (e.id === exId && e.note && e.note.trim() && (!best || x.date > best.date)) best = { date: x.date, note: e.note.trim() };
  return best;
}
const noteId = k => k.replace(/[^a-z0-9]/gi, '_');
function vNotes() {
  const all = noteEntries(), f = ui.noteG || 'all';
  const has = Object.keys(NOTE_GROUPS).filter(g => all.some(n => n.groups.includes(g)));
  let h = !ui.noteNew ? `<button class="btn ghost" data-act="notenew" style="align-self:flex-start">+ Add a note</button>` : `<section class="card"><div class="card-h"><h2>Add a note</h2><button class="link dim" data-act="notenew">Cancel</button></div>
    <div class="fields" style="grid-template-columns:minmax(0,1fr)"><label class="fl">Muscle group<select class="in" id="ng">${Object.entries(NOTE_GROUPS).filter(([g]) => g !== 'other').map(([g, l]) => `<option value="${g}" ${g === (f === 'all' ? 'general' : f) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="fl">Note<textarea class="in" id="nt" placeholder="Technique cues, machine settings, anything to remember"></textarea></label></div>
    <div class="btnrow"><button class="btn sm" data-act="noteadd">Add note</button></div></section>`;
  if (ui.noteNew) setTimeout(() => $('#nt')?.focus(), 30);
  if (!all.length) return h + `<section class="card"><p class="dim small">Notes from your sessions collect here, sorted by muscle group. Add one at the bottom of a session, or on any exercise with "+ Note".</p></section>`;
  h += `<div class="chips">${['all', ...has].map(g => `<button class="chip ${f === g ? 'on' : ''}" data-act="notefilter" data-v="${g}">${g === 'all' ? 'All' : esc(NOTE_GROUPS[g])} <span class="muted">${g === 'all' ? all.length : all.filter(n => n.groups.includes(g)).length}</span></button>`).join('')}</div>`;
  for (const g of (f === 'all' ? has : [f])) {
    const list = all.filter(n => n.groups.includes(g)); if (!list.length) continue;
    h += `<section class="sec"><div class="sec-h"><span class="eyebrow">${esc(NOTE_GROUPS[g])}</span><span class="xs muted">${list.length} note${list.length === 1 ? '' : 's'}</span></div><section class="card"><ul class="notes">`;
    for (const n of list) {
      const id = noteId(n.k + '_' + g), editing = ui.noteEdit === n.k + '#' + g;
      h += `<li><div class="note-m">${esc(fmtDMY(n.date))} · ${esc(n.src)}${n.edited ? ' · edited here' : ''}</div>
        ${editing ? `<textarea class="in" id="ne_${id}">${esc(n.text)}</textarea>${n.general ? '' : '<p class="xs muted">Edits here only change this list. The session keeps its original note.</p>'}
          <div class="btnrow"><button class="btn sm" data-act="notesave" data-k="${esc(n.k)}" data-g="${g}" data-id="${id}">Save</button><button class="link dim" data-act="noteedit" data-k="">Cancel</button>
          <button class="link danger" data-act="notedel" data-k="${esc(n.k)}" style="margin-left:auto">${n.general ? 'Delete note' : 'Remove from list'}</button></div>`
        : `<p class="note-t">${esc(n.text)}</p><div class="btnrow"><button class="link" data-act="noteedit" data-k="${esc(n.k + '#' + g)}">Edit</button>${n.general ? '' : `<button class="link dim" data-act="openlog" data-d="${n.date}">Open session</button>`}</div>`}</li>`;
    }
    h += `</ul></section></section>`;
  }
  return h;
}
