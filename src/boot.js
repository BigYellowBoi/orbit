/* ============================================================
   PERSISTENCE — browser copy + private claude.ai storage
   Cloud layout (per viewer, private): data/users/<id>/settings
   and month buckets data/users/<id>/log/{wk|dy}/<YYYY-MM> = { items: { date: … } }
   ============================================================ */
const LS_KEY = 'rotation-logbook-v1';
const Cloud = { db: null, uid: null, ready: false, failed: false, writing: 0, loaded: { settings: false, wk: false, dy: false }, cloud: { settings: undefined, wk: {}, dy: {} } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lsT;
function cacheLocal() { clearTimeout(lsT); lsT = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ settings: STATE.settings, w: STATE.w, d: STATE.d })); } catch (e) { } }, 250); }
function loadLocal() { try { const s = localStorage.getItem(LS_KEY); if (!s) return null; const o = JSON.parse(s); return o && o.settings ? o : null; } catch (e) { return null; } }
function migrateSettings(s) {
  const d = defaultSettings(), out = { ...d, ...(s || {}) };
  out.ex = { ...(s?.ex || d.ex) };
  out.prog = s?.prog && s.prog.order && s.prog.sessions ? s.prog : d.prog;
  for (const sd of Object.values(out.prog.sessions)) for (const it of sd.items) if (!out.ex[it.ex] && EXLIB[it.ex]) out.ex[it.ex] = clone(EXLIB[it.ex]);
  if (s && !s.sets2) { for (const sd of Object.values(out.prog.sessions)) for (const it of sd.items) it.sets = 2; ui.migSave = true; } // v1.24: 2 sets is the default, once
  out.sets2 = 1;
  out.cardio = { ...d.cardio, ...(s?.cardio || {}) };
  if (!['Stairmaster', 'Treadmill'].includes(out.cardio.name)) out.cardio.name = /tread/i.test(out.cardio.name) ? 'Treadmill' : 'Stairmaster';
  return out;
}
const base = () => `data/users/${Cloud.uid}`;
const setPath = () => `${base()}/settings`;
const monPath = (kind, ym) => `${base()}/log/${kind}/${ym}`;
const KIND = { wk: 'w', dy: 'd' };
function monthItems(kind, ym) { const src = STATE[KIND[kind]], o = {}; for (const k in src) if (k.slice(0, 7) === ym) o[k] = src[k]; return o; }
function docFor(path) {
  if (path === setPath()) return clone(STATE.settings);
  const [kind, ym] = path.split('/').slice(-2); const items = monthItems(kind, ym);
  return Object.keys(items).length ? { items: clone(items) } : null;
}
const Wq = { pending: new Set(), inflight: new Set(), until: new Map(), timer: null, local: [] };
function changed(kind, key, whole) { // kind: 'settings' | 'wk' | 'dy'; key: date or month; whole: the month is replaced outright
  bump(); cacheLocal();
  if (window.GH_SYNC) { GH.changed(kind, key, whole); return; }
  if (!Cloud.uid) { Wq.local.push([kind, key]); return; }
  const p = kind === 'settings' ? setPath() : monPath(kind, key.slice(0, 7));
  Wq.pending.add(p); Wq.until.set(p, Infinity);
  clearTimeout(Wq.timer); Wq.timer = setTimeout(flush, 600);
}
function bump() { STATE.v++; }
function isProtected(p) { const u = Wq.until.get(p); if (u == null) return false; if (u === Infinity || Date.now() < u) return true; Wq.until.delete(p); return false; }
function flush() { if (!Cloud.ready) return; for (const p of [...Wq.pending]) if (!Wq.inflight.has(p)) { Wq.pending.delete(p); writeOne(p); } }
async function writeOne(p) {
  Wq.inflight.add(p); Cloud.writing++; renderSync();
  const ref = Cloud.db.doc(p), op = () => { const data = docFor(p); return data ? ref.set(data) : ref.delete(); };
  try { await op().catch(async e => { if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 600); return op(); } throw e; }); Cloud.failed = false; }
  catch (e) { Cloud.failed = true; console.warn('save failed', p, e); toast(e?.code === 'quota_exceeded' ? 'Cloud storage is full. Save a backup and delete old data.' : 'Couldn’t save to the cloud. Your data is kept in this browser.', 'bad'); }
  finally { Wq.inflight.delete(p); Cloud.writing--; if (!Wq.pending.has(p)) Wq.until.set(p, Date.now() + 6000); renderSync(); if (Wq.pending.has(p)) flush(); }
}
const saveW = date => changed('wk', date);
const saveSettings = () => changed('settings', '');
function saveMonths(kind, months, whole) { for (const m of months) changed(kind, m, whole); }

async function connectCloud() {
  if (!window.claude || typeof window.claude.use !== 'function') { renderSync(); return; }
  let db = null, user = null;
  try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) { }
  if (!db || !user) { renderSync(); return; }
  let uid = null; try { uid = await user.id(); } catch (e) { }
  if (!uid) { renderSync(); return; }
  Cloud.db = db; Cloud.uid = uid;
  // anything changed before the cloud answered gets queued now
  for (const [k, key] of Wq.local) { const p = k === 'settings' ? setPath() : monPath(k, key.slice(0, 7)); Wq.pending.add(p); Wq.until.set(p, Infinity); }
  Wq.local = [];
  const onErr = e => { console.warn('sync error', e); if (e?.code === 'revoked') { Cloud.ready = false; renderSync(); } };
  db.doc(setPath()).onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites) return;
    Cloud.cloud.settings = snap.exists ? clone(snap.data()) : null; Cloud.loaded.settings = true; afterSnap();
  }, onErr);
  for (const kind of ['wk', 'dy']) db.collection(`${base()}/log/${kind}`).limit(1000).onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites) return;
    const m = {}; snap.docs.forEach(d => { if (d.exists) m[d.id] = clone(d.data()); });
    Cloud.cloud[kind] = m; Cloud.loaded[kind] = true; afterSnap();
  }, onErr);
}
function afterSnap() {
  if (!Cloud.ready) {
    if (!(Cloud.loaded.settings && Cloud.loaded.wk && Cloud.loaded.dy)) return;
    Cloud.ready = true; firstSync();
  } else applyCloud();
}
function firstSync() {
  const c = Cloud.cloud;
  if (c.settings && !isProtected(setPath())) STATE.settings = migrateSettings(c.settings);
  else if (!c.settings) { Wq.pending.add(setPath()); Wq.until.set(setPath(), Infinity); }
  for (const kind of ['wk', 'dy']) {
    const tgt = STATE[KIND[kind]], localMonths = new Set(Object.keys(tgt).map(k => k.slice(0, 7)));
    for (const ym in c[kind]) {
      const p = monPath(kind, ym); if (isProtected(p)) continue;
      const items = c[kind][ym].items || {}; let extra = false;
      for (const k of Object.keys(tgt)) if (k.slice(0, 7) === ym && !items[k]) extra = true;
      Object.assign(tgt, clone(items));
      if (extra) { Wq.pending.add(p); Wq.until.set(p, Infinity); }
      localMonths.delete(ym);
    }
    for (const ym of localMonths) { const p = monPath(kind, ym); Wq.pending.add(p); Wq.until.set(p, Infinity); }
  }
  bump(); cacheLocal(); flush(); renderSync(); render();
}
function applyCloud() {
  let ch = false; const c = Cloud.cloud;
  if (c.settings && !isProtected(setPath()) && JSON.stringify(c.settings) !== JSON.stringify(STATE.settings)) { STATE.settings = migrateSettings(c.settings); ch = true; }
  for (const kind of ['wk', 'dy']) {
    const tgt = STATE[KIND[kind]], months = new Set([...Object.keys(c[kind]), ...Object.keys(tgt).map(k => k.slice(0, 7))]);
    for (const ym of months) {
      if (isProtected(monPath(kind, ym))) continue;
      const items = c[kind][ym]?.items || {}, local = monthItems(kind, ym);
      if (JSON.stringify(items) === JSON.stringify(local)) continue;
      for (const k in local) delete tgt[k];
      Object.assign(tgt, clone(items)); ch = true;
    }
  }
  if (ch) { bump(); cacheLocal(); render(); }
}
function renderSync() {
  const el = $('#sync'); if (!el) return;
  const [cls, txt] = Cloud.failed ? ['bad', 'Not synced'] : Cloud.writing ? ['busy', 'Saving'] : Cloud.ready ? ['ok', 'Synced'] : Cloud.uid ? ['busy', 'Connecting'] : ['', 'This device'];
  el.className = 'sync ' + cls; el.textContent = txt;
}

/* ---------- export / import backups ---------- */
function exportJson() { return JSON.stringify({ app: 'orbit', version: 1, exportedAt: new Date().toISOString(), settings: STATE.settings, workouts: STATE.w, days: STATE.d }, null, 1); }
function csvEsc(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportCsv() {
  const rows = [['date', 'session', 'exercise', 'set', 'load', 'unit', 'reps', 'e1rm'].join(',')];
  for (const w of workoutsSorted()) for (const e of w.ex || []) doneSets(e).forEach((s, i) => rows.push([w.date, sessName(w), exDef(e.id).name, i + 1, s.w ?? '', exDef(e.id).u, s.r, exDef(e.id).u === 'bw' && !bwScored(e.id) ? '' : r1(setScore(e.id, s, w.date)) || ''].map(csvEsc).join(',')));
  for (const w of workoutsSorted()) if (w.cardio?.done) rows.push([w.date, sessName(w), w.cardio.name, 1, '', 'min', w.cardio.min ?? '', ''].map(csvEsc).join(','));
  return rows.join('\n');
}
async function offerFile(filename, text) {
  let dl = null; try { dl = window.claude && await window.claude.use('downloads'); } catch (e) { }
  if (dl) { try { await dl.save({ filename, data: text }); toast('Saved ' + esc(filename)); ui.exportText = null; return; } catch (e) { if (e?.code === 'declined') return; if (e?.code === 'rate_limited') { toast('A save prompt is already open.'); return; } } }
  if (!window.claude) { // plain web page: a real file
    const type = filename.endsWith('.csv') ? 'text/csv' : 'application/json', blob = new Blob([text], { type });
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (standalone && navigator.canShare) { try { const file = new File([blob], filename, { type }); if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e?.name === 'AbortError') return; } }
    const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Saved ' + esc(filename)); return;
  }
  ui.exportText = text; render(true);
}
function restoreBackup(o) {
  if (!o || !['orbit', 'rotation-logbook'].includes(o.app) || !o.settings || typeof o.workouts !== 'object' || typeof o.days !== 'object') throw new Error('This file isn’t an Orbit backup.');
  const okDate = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
  const w = {}, d = {}; for (const k in o.workouts) if (okDate(k) && o.workouts[k]?.ex) w[k] = o.workouts[k]; for (const k in o.days) if (okDate(k)) d[k] = o.days[k];
  const oldMonths = { wk: new Set(Object.keys(STATE.w).map(k => k.slice(0, 7))), dy: new Set(Object.keys(STATE.d).map(k => k.slice(0, 7))) };
  STATE.settings = migrateSettings(o.settings); STATE.w = w; STATE.d = d;
  saveSettings();
  for (const kind of ['wk', 'dy']) { const ms = new Set([...oldMonths[kind], ...Object.keys(STATE[KIND[kind]]).map(k => k.slice(0, 7))]); saveMonths(kind, ms, true); }
  return Object.keys(w).length;
}
async function resetAll() {
  const months = { wk: new Set([...Object.keys(STATE.w).map(k => k.slice(0, 7)), ...Object.keys(Cloud.cloud.wk)]), dy: new Set([...Object.keys(STATE.d).map(k => k.slice(0, 7)), ...Object.keys(Cloud.cloud.dy)]) };
  if (window.GH_SYNC) for (const p in GH.meta.known) { const o = GH.parse(p); if (o && o.kind !== 'settings') months[o.kind].add(o.ym); }
  const fresh = emptyData(); STATE.settings = fresh.settings; STATE.w = {}; STATE.d = {};
  try { localStorage.removeItem(LS_KEY); } catch (e) { }
  saveSettings(); for (const k of ['wk', 'dy']) saveMonths(k, months[k], true);
}

/* ============================================================
   RENDER
   ============================================================ */
/* Scrolling: in the claude.ai artifact the page scrolls. The home-screen app (Pages) uses the Scroll box layout, html.sbox:
   then only #scroll scrolls and the header and tab bar sit outside it. iOS swallows a tap that stops momentum on the
   page itself (no touch or click event reaches it), so with the page scrolling a tab tap mid-fling only stops the
   scroll. With the content in its own box, the tab bar isn't part of the moving surface and the tap arrives.
   All scroll calls go through these helpers. */
const SBOX = document.documentElement.classList.contains('sbox');
const scroller = () => SBOX ? $('#scroll') : window;
const scrollY0 = () => SBOX ? $('#scroll').scrollTop : window.scrollY;
const scrollToY = (top, smooth) => scroller().scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
function reveal(sel, room = 0) { // bring something just added fully onto the screen, clear of the header and tab bar
  setTimeout(() => {
    const el = typeof sel === 'string' ? $(sel) : sel; if (!el) return;
    const r = el.getBoundingClientRect(), top = ($('.top')?.getBoundingClientRect().bottom || 0) + 12, bot = ($('.tabs')?.getBoundingClientRect().top || innerHeight) - 12;
    if (r.top < top || r.bottom + room > bot) scrollToY(Math.max(0, scrollY0() + r.top - top), true);
  }, 30);
}
function resetScroll() { // to the top, and stop any momentum still running
  if (SBOX) { // swap in a fresh, empty-handed scroll box: the old one, and any fling it had, goes with it
    const old = $('#scroll'), box = old.cloneNode(false); while (old.firstChild) box.appendChild(old.firstChild); old.replaceWith(box); return;
  }
  // iOS keeps flinging the page unless overflow is cut for a frame
  const de = document.documentElement; de.style.overflow = 'hidden'; window.scrollTo(0, 0); requestAnimationFrame(() => { de.style.overflow = ''; window.scrollTo(0, 0); });
}
let pendingRender = false, drag = null; // drag: a reorder in progress (see the drag section)
function editingInView() { const a = document.activeElement; return a && $('#view')?.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'file'; }
/* Background updates (a sync pull, the helper's status, the Traffic card) patch the page in place: only text and attributes
   that differ change, so nothing on screen jumps and a scroll in progress keeps its momentum. iOS has no scroll anchoring,
   so if something above the view still changes height, keepAnchor() moves the scroll by the same amount. */
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.nodeType !== 1) return;
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  if (a !== document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(a.nodeName)) { // an edited field ignores its value attribute, so set the live value too
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    else if (a.nodeName === 'INPUT') { const v = b.getAttribute('value') ?? ''; if (a.value !== v) a.value = v; }
    else if (a.nodeName === 'TEXTAREA') { if (a.value !== b.textContent) a.value = b.textContent; }
  }
  const ac = [...a.childNodes], bc = [...b.childNodes];
  bc.forEach((n, i) => { if (i < ac.length) morph(ac[i], n); else a.appendChild(n); });
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}
function morphHTML(el, html) { const t = document.createElement(el.tagName === 'MAIN' ? 'main' : 'div'); t.innerHTML = html; if (el.id === 'view') morph(el, Object.assign(t, { id: 'view' })); else if (t.firstElementChild) morph(el, t.firstElementChild); }
function keepAnchor(change) {
  const top = ($('.top')?.getBoundingClientRect().bottom || 0) + 4, a = document.elementFromPoint(innerWidth / 2, top) || null, at = a ? a.getBoundingClientRect().top : 0;
  change();
  if (a && a.isConnected && $('#view').contains(a)) { const d = a.getBoundingClientRect().top - at; if (Math.abs(d) > 0.5) scroller().scrollBy(0, d); }
}
function render(force) {
  if (!force && (editingInView() || drag)) { pendingRender = true; return; } // a background update waits for the drag to end
  pendingRender = false;
  const v = $('#view'), y = scrollY0(), snap = !force && ui.tab === render.tab ? liveSnap() : null; CHART_REG.clear(); render.tab = ui.tab;
  if (snap) keepAnchor(() => { morphHTML(v, (VIEWS[ui.tab] || vToday)()); drawCharts(v); }); // a background re-render of the same screen: patch in place
  else {
    v.style.minHeight = v.offsetHeight + 'px'; // hold the page height while the view is swapped, so the scroll position can't be clamped
    v.innerHTML = (VIEWS[ui.tab] || vToday)();
    v.style.minHeight = '';
    drawCharts(v);
    if (Math.abs(scrollY0() - y) > 1) scrollToY(y); // a re-render keeps your place; changing tabs scrolls to the top in go()
  }
  v.classList.toggle('cols', ['strength', 'body', 'data'].includes(ui.tab) || (ui.tab === 'today' && !(STATE.w[today()] && (!STATE.w[today()].fin || ui.editToday)) && !ui.dayOff)); // two columns on wide screens (CSS decides when)
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === (ui.tab === 'log' ? 'history' : ui.tab) ? 'page' : 'false'));
  const g = $('#gear'); g.setAttribute('aria-current', ui.tab === 'data' ? 'page' : 'false'); g.setAttribute('aria-label', ui.tab === 'data' ? 'Back' : 'Settings: sync, imports and backups');
  renderSync(); renderMark(); renderUpdate(); renderFab(); renderReorder();
  fadeCheck();
  if (ui.tab === 'history' && (ui.histQ || ui.histS)) filterHist(); if (ui.pick && ui.pick.q) filterPick(); // in-place filters survive a re-render
  if (snap) flashChanged(snap);
  if (ui.justDone) { ui.justDone = false; setTimeout(() => $('.hero.just')?.classList.remove('just'), 1400); }
}
/* Values that change while you're looking (a sync brought new WHOOP or Health numbers) flash once, so an update is visible. */
function renderReorder() { // the reorder button sits left of the gear on Strength and Body; while reordering it reads Done
  const b = $('#reorder'); if (!b) return; const on = ui.tab === 'strength' || ui.tab === 'body';
  b.hidden = !on; if (!on) return; b.classList.toggle('txt', !!ui.reo);
  b.setAttribute('aria-label', ui.reo ? 'Done reordering' : 'Reorder cards');
  b.innerHTML = ui.reo ? 'Done' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5"/></svg>';
}
function liveSnap() { const m = {}, n = {}; document.querySelectorAll('#view [data-live]').forEach(el => { const k = el.dataset.live, i = n[k] = (n[k] || 0) + 1; m[k + '#' + i] = el.getAttribute('aria-label') || el.textContent; }); return m; }
function flashChanged(before) {
  const n = {}; document.querySelectorAll('#view [data-live]').forEach(el => { const k = el.dataset.live, i = n[k] = (n[k] || 0) + 1, was = before[k + '#' + i];
    if (was != null && was !== (el.getAttribute('aria-label') || el.textContent)) { el.classList.add('flash'); el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true }); } });
}
function pulseMark() { const m = $('#mark'); if (!m) return; m.classList.remove('pulse'); void m.offsetWidth; m.classList.add('pulse'); m.addEventListener('animationend', () => m.classList.remove('pulse'), { once: true }); } // new data arrived
/* Next empty set: a round button above the tab bar while a log is open; it scrolls to the first set without reps,
   hides once tapped, and comes back when you scroll. */
const logOpen = () => { if (ui.tab === 'log') return true; const w = ui.tab === 'today' && !ui.dayOff && STATE.w[today()]; return !!w && !w.rest && (!w.fin || !!ui.editToday); };
const firstEmptySet = () => $('#view .set:not(.hdr):not(.done)');
let fabHid = false, fabQuiet = 0;
function renderFab() {
  let b = $('#nextset'); const left = logOpen() ? document.querySelectorAll('#view .set:not(.hdr):not(.done)').length : 0;
  if (!left || fabHid) { if (b) b.classList.remove('on'); return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'nextset'; b.className = 'fab'; b.dataset.act = 'nextset';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg><i></i>'; // a locate mark: the next empty set can be above or below
    document.body.appendChild(b);
  }
  b.setAttribute('aria-label', `Go to the next empty set, ${left} left`);
  const n = b.querySelector('i'); if (n.textContent !== String(left)) n.textContent = left; // only the count changes: rebuilding the button mid-tap (a set saves on blur) would swallow the tap
  b.classList.add('on');
}
document.addEventListener('scroll', () => { if (!fabHid || Date.now() < fabQuiet) return; fabHid = false; renderFab(); }, true);
function renderUpdate() { // the update prompt floats above the tab bar on every screen
  let el = $('#updp'); const show = ui.update && ui.updLater !== ui.update;
  if (!show) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'updp'; el.className = 'updp'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Update available'); document.body.appendChild(el); }
  el.innerHTML = `<div><b>Update available</b><span>Orbit v${esc(ui.update)} is ready. Your data stays.</span></div><button class="link dim" data-act="updlater">Later</button><button class="btn sm acc" data-act="update">Update</button>`;
}
function renderMark() { // header ring: where today sits in the rotation, one segment per slot (rest slots included)
  const el = $('#mark'); if (!el) return;
  const o = order(), n = o.length, t = today(), rec = STATE.w[t], sid = rec && sessDef(rec.s) ? rec.s : sessionFor(t), k = Math.max(0, o.indexOf(sid)) + 1;
  // explicit arcs: equal segments, gaps centred on 12 o'clock and every 360/n degrees after it
  const r = 9, gapDeg = n > 1 ? Math.min(25, 360 / n * 0.35) : 0, pt = a => [12 + r * Math.sin(a * Math.PI / 180), 12 - r * Math.cos(a * Math.PI / 180)];
  let arcs = '';
  for (let i = 0; i < n; i++) {
    const a0 = i * 360 / n + gapDeg / 2, a1 = (i + 1) * 360 / n - gapDeg / 2, [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const d = `M${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
    arcs += `<path d="${d}" fill="none" stroke="${i < k ? 'var(--logo)' : 'var(--line-2)'}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  if (n === 1) arcs = `<circle cx="12" cy="12" r="${r}" fill="none" stroke="var(--logo)" stroke-width="2.4"/>`;
  el.innerHTML = `<svg class="mark" viewBox="0 0 24 24" fill="none" role="img" aria-label="${esc(sessDef(sid)?.name || '')}, ${k} of ${n} in the rotation"><title>${esc(sessDef(sid)?.name || '')} · ${k} of ${n}</title>${arcs}<circle cx="12" cy="12" r="2.5" fill="var(--ink)"/></svg>`;
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !editingInView()) render(); }, 60));
const logging = () => ui.tab === 'log' || (ui.tab === 'today' && !!STATE.w[today()]);
function go(tab) {
  if (tab === 'trends') tab = 'body';
  if (tab === 'log' && (!ui.logDate || ui.logDate >= today())) { tab = 'today'; ui.editToday = true; } // today's log lives on Today
  if (ui.tab === 'today' && tab !== 'today') ui.editToday = false;
  if (ui.tab === 'strength' && tab !== 'strength') ui.lift = null; // a picked lift lasts while you stay on Strength
  if (ui.tab === 'log' && ui.logDate && tab !== 'log') dropEmpty(ui.logDate); // an empty past-day log isn't kept
  ui.exNote = null; ui.noteEdit = null; ui.exHist = null; ui.exMore = null;
  if (tab !== ui.tab) { ui.exQ = ''; ui.reo = null; }
  if (tab === 'today') ui.dayOff = 0; // the Today tab always brings you back to today // leaving a tab drops its search and an unfinished reorder ui.restPick = null; // exercise search lasts while you stay on Plan
  if (tab === 'body' && ui.tab !== 'body') { ui.metric = 'rec'; ui.per = 'M'; ui.off = 0; }
  if (tab === 'data' && ui.tab === 'data') tab = ui.prevTab || 'today'; else if (tab === 'data') ui.prevTab = ui.tab;
  if (tab === 'today') ui.logDate = null;
  ui.tab = tab; ui.confirm = null; ui.pickSess = null; ui.editEx = null;
  resetScroll(); render(true); if (logging()) wakeLock();
}
let toastT;
function toast(html, kind) { const t = $('#toast'); t.innerHTML = html; t.className = 'toast show ' + (kind || ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', kind === 'pr' ? 4000 : 2600); }
let wl = null; async function wakeLock() { try { if ('wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => wl = null); } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && logging()) wakeLock(); });

/* ============================================================
   ACTIONS
   ============================================================ */
const logW = () => STATE.w[ui.logDate || today()];
function blankEx(id) { // a "New exercise" made by + Exercise and never filled in or used
  const x = S().ex[id]; if (!x || !/^x/.test(id) || x.name !== 'New exercise' || x.g !== 'other' || (x.base && x.base.r) || x.note) return false;
  return !Object.values(S().prog.sessions).some(sd => sd.items.some(it => it.ex === id)) && !Object.values(STATE.w).some(w => (w.ex || []).some(e => e.id === id));
}
function sweepSettings() { // one-off settings migrations to save, and blank exercises left behind (v1.24)
  let ch = !!ui.migSave; ui.migSave = false;
  for (const id of Object.keys(S().ex)) if (id !== ui.editEx && blankEx(id)) { delete S().ex[id]; ch = true; }
  if (ch) saveSettings();
}
function sweepCardio() { // WHOOP's cardio often lands after a session is done (the sync helper brings it in later), so check recent days whenever data arrives
  const from = addDays(today(), -14);
  for (const w of Object.values(STATE.w)) if (w.date >= from && STATE.d[w.date]?.acts && autoCardio(w)) saveW(w.date);
}
function sweepEmpty() { for (const d of Object.keys(STATE.w)) if (d < today()) dropEmpty(d); } // sessions started and never used on earlier days
function dropEmpty(date) { if (emptyW(STATE.w[date])) { delete STATE.w[date]; saveW(date); return true; } return false; }
const ACT = {
  go: el => go(el.dataset.tab),
  start: el => {
    const date = ui.tab === 'log' ? (ui.logDate || today()) : today(), sid = el.dataset.id;
    const open = () => { if (date === today()) { ui.editToday = true; go('today'); } else { ui.logDate = date; go('log'); } };
    if (STATE.w[date] && !STATE.w[date].rest) { open(); return; }
    if (!sessDef(sid) || isRestSlot(sid)) return;
    const w = newWorkoutAuto(date, sid); w.nw = 1; // marks a fresh start, so an untouched one can be dropped
    STATE.w[date] = w; const rp = (S().restPlan || []).filter(d => d !== date && d >= today());
    if (S().rotOverride || rp.length !== (S().restPlan || []).length) { S().rotOverride = null; S().restPlan = rp; saveSettings(); } // training on a planned rest day drops the plan
    saveW(date); open();
  },
  restday: () => { const date = ui.tab === 'log' ? (ui.logDate || today()) : today(); if (STATE.w[date]) return; STATE.w[date] = restRecord(date); if (ui.tab === 'today') STATE.w[date].fin = true; saveW(date); toast('Rest day logged'); render(true); },
  unrest: () => { const date = ui.tab === 'log' ? (ui.logDate || today()) : today(); if (STATE.w[date]?.rest) { delete STATE.w[date]; saveW(date); } render(true); },
  addrest: () => { const id = 'r' + Date.now().toString(36); S().prog.sessions[id] = { name: 'Rest', focus: 'Recovery', items: [], rest: true }; S().prog.order.push(id); saveSettings(); toast('Rest day added to the end of the rotation'); render(true); reveal(`.sess[data-id="${id}"]`); },
  togglesess: el => { const id = el.dataset.id; ui.openSess.has(id) ? ui.openSess.delete(id) : ui.openSess.add(id); ui.confirm = null; render(true); },
  strippick: el => { ui.restPick = ui.restPick === el.dataset.date ? null : el.dataset.date; render(true); },
  reston: el => setRest(el.dataset.date, true),
  restoff: el => setRest(el.dataset.date, false),
  partial: el => { const d = el.dataset.date, v = el.dataset.v === '1', m = S().partial = S().partial || {}; if (m[d] === v) delete m[d]; else m[d] = v; saveSettings(); render(true); }, // tap the chosen answer again to clear it
  restplan: () => { ui.restPlanOpen = !ui.restPlanOpen; ui.restPick = null; render(true); },
  picktoday: () => { ui.pickSess = 'today'; render(true); },
  setnext: el => { S().rotOverride = { id: el.dataset.id, from: today() }; ui.pickSess = null; saveSettings(); render(true); },
  picksess: el => { ui.pickSess = el.dataset.id; render(true); },
  logday: el => { if (ui.logDate) dropEmpty(ui.logDate); const d = addDays(ui.logDate || today(), +el.dataset.n); if (d >= today()) { go('today'); return; } ui.logDate = d; ui.pickSess = null; ui.confirm = null; resetScroll(); render(true); },
  openlog: el => { ui.logDate = el.dataset.d; go('log'); },
  goal: el => { if (el.dataset.v === 'grow' && S().goal !== 'grow') S().growFrom = today(); S().goal = el.dataset.v; saveSettings(); render(true); },
  goalflip: () => { S().goal = S().goal === 'grow' ? 'hold' : 'grow'; if (S().goal === 'grow') S().growFrom = today(); saveSettings(); toast(S().goal === 'grow' ? `Aim set to overload, +${fmt((S().progRate ?? 0.005) * 100, 2)}% a week` : 'Aim set to maintenance'); render(true); },
  prograte: el => { S().progRate = +el.dataset.v; if (S().goal === 'grow') S().growFrom = today(); saveSettings(); render(true); },
  update: () => { location.replace(location.pathname + '?v=' + encodeURIComponent(ui.update || Date.now())); },
  updlater: () => { ui.updLater = ui.update; renderUpdate(); },
  edittoday: () => { ui.editToday = true; render(true); },
  pastlog: () => { ui.logDate = addDays(today(), -1); ui.pickSess = null; go('log'); },
  exhist: el => { const i = +el.dataset.e; ui.exHist = ui.exHist === i ? null : i; render(true); },
  liftsel: el => { if (ui.lift === el.dataset.id) { ui.lift = null; render(true); return; } ui.lift = el.dataset.id; render(true); const c = $('#liftchart'); if (c && c.getBoundingClientRect().top < ($('.top')?.getBoundingClientRect().bottom || 0)) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  liftgo: el => { ui.lift = el.dataset.id; go('strength'); },
  addset: el => { const w = logW(), e = w.ex[+el.dataset.e]; const l = e.sets[e.sets.length - 1]; e.sets.push({ w: null, r: null, pw: l ? (l.w ?? l.pw) : null, pr: l ? (l.r ?? l.pr) : null, done: false }); saveW(w.date); render(true); setTimeout(() => $(`#r${el.dataset.e}_${e.sets.length - 1}`)?.focus(), 30); },
  settype: el => { const w = logW(), e = w?.ex[+el.dataset.e], st = e?.sets[+el.dataset.s]; if (!st) return; // Normal → Warm-up → Drop → Normal
    st.t = !st.t ? 'w' : st.t === 'w' ? 'd' : undefined; if (!st.t) delete st.t; saveW(w.date); render(true); },
  addwarm: el => { const w = logW(), e = w.ex[+el.dataset.e]; const n = e.sets.filter(x => x.t === 'w').length; e.sets.splice(n, 0, { w: null, r: null, done: false, t: 'w' }); saveW(w.date); render(true); }, // warm-ups go before the working sets
  step: el => { // − / + beside a field: weight by the lift's step, reps by one; an empty field starts from its Aim
    const i = +el.dataset.e, j = +el.dataset.s, k = el.dataset.k, inp = $(`#${k}${i}_${j}`), w = logW(), e = w?.ex[i]; if (!inp || !e) return;
    const cur = num(inp.value) ?? num(inp.placeholder) ?? 0, d = +el.dataset.d, st = k === 'w' ? exStep(e.id) : 1;
    const v = Math.max(0, +(cur + (inp.value === '' ? 0 : d * st)).toFixed(3)); inp.value = k === 'w' ? fmt(v, 3).replace(/,/g, '') : String(Math.round(v));
    if (k === 'w' && $(`#r${i}_${j}`)?.value === '') { saveW(w.date); const s = e.sets[j]; s.w = v; return; } // weight alone doesn't tick the set
    setInput(inp, true); },
  remwarm: el => { const w = logW(), e = w?.ex[+el.dataset.e], j = +el.dataset.s; if (e?.sets[j]?.t !== 'w') return; e.sets.splice(j, 1); saveW(w.date); render(true); }, // a warm-up added by mistake (v1.40)
  remset: el => { const w = logW(), e = w.ex[+el.dataset.e]; if (e.sets.length > 1) e.sets.pop(); saveW(w.date); render(true); },
  remex: el => { const w = logW(), i = +el.dataset.e, e = w.ex[i]; if (doneSets(e).length && ui.confirm !== 'remex' + i) { ui.confirm = 'remex' + i; toast('Tap Remove again to drop logged sets'); return; } w.ex.splice(i, 1); ui.confirm = null; ui.exMore = null; saveW(w.date); render(true); },
  cardiotype: el => { const w = logW(), name = el.dataset.v, wm = Math.round(sum(whoopCardio(w.date, name).map(a => a.min || 0)));
    w.cardioOff = false; w.cardio = { ...(w.cardio || { min: S().cardio.min, lvl: null, done: false }), name, manual: true }; if (wm) { w.cardio.min = wm; w.cardio.done = true; w.cardio.src = 'whoop'; }
    saveW(w.date); render(true); },
  cardiorem: () => { const w = logW(); w.cardio = null; w.cardioOff = true; saveW(w.date); render(true); },
  cardiowhoop: el => { const w = logW(); w.cardio = w.cardio || { name: S().cardio.name }; w.cardio.min = +el.dataset.v; w.cardio.done = true; w.cardio.src = 'whoop'; saveW(w.date); render(true); },
  cardio: () => { const w = logW(); w.cardio = w.cardio || { name: S().cardio.name, min: S().cardio.min }; w.cardio.min = num($('#cmin')?.value) ?? w.cardio.min; w.cardio.done = !w.cardio.done; w.cardio.manual = true; saveW(w.date); render(true); },
  confirm: el => { ui.confirm = el.dataset.v || null; render(true); },
  cancelw: () => { const d = ui.logDate || today(); if (!emptyW(STATE.w[d])) return; delete STATE.w[d]; saveW(d); ui.editToday = false; toast('Session cancelled'); if (ui.tab === 'log') go('history'); else { resetScroll(); render(true); } },
  exmore: el => { const i = +el.dataset.e; ui.exMore = ui.exMore === i ? null : i; ui.confirm = null; render(true); },
  delw: () => { const d = ui.logDate || today(); delete STATE.w[d]; ui.confirm = null; ui.delArm = 0; saveW(d); toast('Session deleted'); render(true); },
  delw1: el => { // two taps: the first arms it for 3 s (v1.36)
    if (ui.delArm && Date.now() - ui.delArm < 3000) { ACT.delw(); return; }
    ui.delArm = Date.now(); el.textContent = 'Tap again to delete'; el.classList.add('armed');
    setTimeout(() => { if (Date.now() - ui.delArm >= 2900) { ui.delArm = 0; el.textContent = 'Delete this session'; el.classList.remove('armed'); } }, 3000); },
  addexid: el => { const id = el.dataset.id, w = logW(); if (!id || !w) return; w.ex.push({ id, sets: prefill(id, 2, w.date) }); ui.pick = null; saveW(w.date); render(true); reveal('#ex' + (w.ex.length - 1)); },
  pickopen: () => { ui.pick = ui.pick ? null : { q: '' }; render(true); if (ui.pick) setTimeout(() => $('#pickq')?.focus(), 30); },
  per: el => { ui.per = el.dataset.v; ui.off = 0; render(true); },
  poff: el => { ui.off = Math.max(0, (ui.off || 0) + +el.dataset.n); render(true); },
  reorder: () => { if (ui.reo) return ACT.reodone(); ui.reo = { tab: ui.tab, cards: cardOrder(ui.tab, CARD_KEYS[ui.tab] || []), cols: wkCols() }; resetScroll(); render(true); },
  reodone: () => { const r = ui.reo; if (!r) return; S().layout = { ...(S().layout || {}), [r.tab]: r.cards, ...(r.tab === 'body' ? { wkcols: r.cols } : {}) }; ui.reo = null; saveSettings(); resetScroll(); render(true); toast('Order saved'); },
  reoreset: () => { if (!ui.reo) return; ui.reo.cards = (CARD_KEYS[ui.reo.tab] || []).slice(); ui.reo.cols = Object.keys(WKCOLS); render(true); },
  plantab: el => { ui.planTab = el.dataset.v; resetScroll(); render(true); },
  liftm: el => { ui.liftM = el.dataset.v; render(true); },
  liftsall: () => { ui.liftsAll = !ui.liftsAll; render(true); },
  calmon: el => { ui.calOff = Math.min(0, (ui.calOff || 0) + +el.dataset.n); render(true); },
  histsess: el => { ui.histS = el.dataset.v || ''; document.querySelectorAll('[data-act="histsess"]').forEach(b => b.classList.toggle('on', (b.dataset.v || '') === ui.histS)); filterHist(); },
  dayoff: el => { const n = +el.dataset.n; ui.dayOff = n === 0 ? 0 : Math.max(-365, Math.min(28, (ui.dayOff || 0) + n)); ui.restPick = null; resetScroll(); render(true); },
  nextset: () => {
    const r = firstEmptySet(); if (!r) return;
    fabHid = true; fabQuiet = Date.now() + 900; renderFab(); // our own scroll doesn't bring it back
    const box = r.getBoundingClientRect(), top = ($('.top')?.getBoundingClientRect().bottom || 0), bot = ($('.tabs')?.getBoundingClientRect().top || innerHeight);
    scrollToY(Math.max(0, scrollY0() + box.top - (top + bot) / 2 + box.height / 2), true);
    r.classList.remove('seek'); void r.offsetWidth; r.classList.add('seek'); setTimeout(() => r.classList.remove('seek'), 1600);
  },
  logdone: () => {
    const a = document.activeElement; if (a && a.blur) a.blur(); // make sure the last edit is saved
    if (dropEmpty(ui.logDate || today())) { toast('Nothing logged, so the session wasn’t kept'); ui.editToday = false; if (ui.tab === 'today') { resetScroll(); render(true); } else go('history'); return; }
    const w = logW(); if (w && !w.rest) { const st = wStats(w); toast(`${esc(sessName(w))} saved · ${st.sets} set${st.sets === 1 ? '' : 's'}`); }
    if (ui.tab === 'today') { if (w) { w.fin = true; saveW(w.date); } ui.editToday = false; ui.justDone = true; resetScroll(); render(true); } else go('history');
  },
  histview: el => { ui.hist = el.dataset.v; ui.noteEdit = null; render(true); },
  notefilter: el => { ui.noteG = el.dataset.v; ui.noteEdit = null; render(true); },
  notenew: () => { ui.noteNew = !ui.noteNew; render(true); },
  noteadd: () => { const t = ($('#nt')?.value || '').trim(); if (!t) { toast('Write the note first', 'bad'); return; } notebook().general.push({ id: Date.now().toString(36), g: $('#ng').value, text: t, date: today() }); ui.noteNew = false; saveSettings(); toast('Note added'); render(true); },
  noteedit: el => { ui.noteEdit = el.dataset.k || null; render(true); },
  notesave: el => { const k = el.dataset.k, t = ($('#ne_' + el.dataset.id)?.value || '').trim(), nb = notebook();
    if (k.startsWith('g|')) { const n = nb.general.find(x => 'g|' + x.id === k); if (n) n.text = t || n.text; } else nb.edits[k] = t;
    ui.noteEdit = null; saveSettings(); render(true); },
  notedel: el => { const k = el.dataset.k, nb = notebook();
    if (k.startsWith('g|')) nb.general = nb.general.filter(x => 'g|' + x.id !== k); else { nb.hidden[k] = true; delete nb.edits[k]; toast('Removed from Notes. The session keeps its note.'); }
    ui.noteEdit = null; saveSettings(); render(true); },
  exnote: el => { ui.exNote = +el.dataset.e; render(true); setTimeout(() => $('#xn' + el.dataset.e)?.focus(), 30); },
  weeksall: () => { ui.weeksAll = !ui.weeksAll; render(true); },
  range: el => { ui.range = +el.dataset.v; render(true); },
  preset: el => { if (progSig(PRESETS[el.dataset.id]) === progSig(S().prog)) return; ui.confirm = 'preset:' + el.dataset.id; render(true); }, // already your split exactly: nothing to switch to
  usepreset: el => {
    const p = PRESETS[el.dataset.id]; S().preset = el.dataset.id; S().prog = { order: p.order.slice(), sessions: clone(p.sessions) };
    for (const sd of Object.values(S().prog.sessions)) for (const it of sd.items) if (!S().ex[it.ex] && EXLIB[it.ex]) S().ex[it.ex] = clone(EXLIB[it.ex]);
    S().rotOverride = null; ui.confirm = null; saveSettings(); toast(`Switched to ${esc(p.name)}`); render(true);
  },
  addsess: () => { const id = 's' + Date.now().toString(36); ui.openSess.add(id); S().prog.sessions[id] = { name: 'New session', focus: '', items: [] }; S().prog.order.push(id); saveSettings(); render(true); reveal(`.sess[data-id="${id}"]`); },
  delsess: el => { const id = el.dataset.id; S().prog.order = S().prog.order.filter(x => x !== id); delete S().prog.sessions[id]; ui.confirm = null; saveSettings(); render(true); },
  remitem: el => { sessDef(el.dataset.id).items.splice(+el.dataset.j, 1); saveSettings(); render(true); },
  newex: () => { // one blank at a time: a second tap goes back to the one already made
    let id = Object.keys(S().ex).find(blankEx);
    if (!id) { id = 'x' + Date.now().toString(36); S().ex[id] = { ...X('New exercise', 'other', 'kg', 90, 8, 12, null, null), fresh: 1 }; saveSettings(); }
    ui.editEx = id; render(true); reveal('#exlist [data-edit]');
  },
  exqclear: () => { ui.exQ = ''; const i = $('#exq'); if (i) { i.value = ''; i.focus(); } filterEx(); },
  editex: el => { const prev = ui.editEx; ui.editEx = el.dataset.id || null; if (prev && prev !== ui.editEx && (blankEx(prev) || S().ex[prev]?.fresh)) { delete S().ex[prev]; saveSettings(); } render(true); }, // leaving a new exercise unsaved (Discard, or opening another) drops it
  saveex: el => {
    const x = S().ex[el.dataset.id]; if (!x) return; delete x.fresh;
    x.name = ($('#xe_n').value || '').trim() || x.name; x.g = $('#xe_g').value; x.u = $('#xe_u').value;
    const lo = parseInt($('#xe_lo').value, 10), hi = parseInt($('#xe_hi').value, 10), bw = num($('#xe_bw').value), br = parseInt($('#xe_br').value, 10);
    if (lo > 0) x.lo = lo; if (hi >= x.lo) x.hi = hi; else x.hi = x.lo; x.note = ($('#xe_note').value || '').trim();
    x.base = br > 0 ? { w: bw ?? (x.u === 'bw' ? 0 : null), r: br } : null;
    const inc = num($('#xe_inc').value), rir = parseInt($('#xe_rir').value, 10);
    if (inc > 0) x.inc = inc; else delete x.inc;
    if (rir >= 0 && rir <= 5) x.rir = rir; else delete x.rir;
    const bwf = $('#xe_bwf') ? num($('#xe_bwf').value) : null; if (x.u === 'bw' && bwf > 0 && bwf <= 100) x.bwf = bwf / 100; else if ($('#xe_bwf') || x.u !== 'bw') delete x.bwf;
    ui.editEx = null; saveSettings(); render(true);
  },
  delex: el => { delete S().ex[el.dataset.id]; ui.editEx = null; saveSettings(); render(true); },
  doimport: el => { const src = el.dataset.v, p = ui.imp[src]; if (!p) return; const months = applyImport(p); saveMonths('dy', months);
    if (src === 'whoop') for (const w of Object.values(STATE.w)) if (p.days[w.date] && autoCardio(w)) saveW(w.date); saveSettings(); delete ui.imp[src]; toast(`Imported ${Object.keys(p.days).length} days from ${{ whoop: 'WHOOP', mf: 'MacroFactor', ah: 'Apple Health' }[src]}`); render(true); },
  cancelimp: el => { delete ui.imp[el.dataset.v]; render(true); },
  export: el => el.dataset.v === 'csv' ? offerFile(`orbit-sets-${today()}.csv`, exportCsv()) : offerFile(`orbit-backup-${today()}.json`, exportJson()),
  copyexport: async () => { const ta = $('#exporttext'); try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (e) { ta.select(); toast('Selected. Copy it with your keyboard or the share menu.'); } },
  reset: async () => { await resetAll(); ui.confirm = null; toast('Everything deleted'); go('today'); },
};
let navAt = 0;
document.addEventListener('pointerdown', ev => {
  const b = ev.target.closest('.tabs [data-tab], #gear'); if (!b || ev.button > 0) return;
  ev.preventDefault(); navAt = Date.now(); go(b.dataset.tab);
}, true);
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (el.matches('.tabs [data-tab], #gear') && Date.now() - navAt < 800) { ev.preventDefault(); return; } // already handled on touch-down
  const f = ACT[el.dataset.act]; if (f) { ev.preventDefault(); f(el); }
});

function setRest(date, on) { // plan or unplan a one-off rest day; past dates drop off the list
  const t = today(); if (!date || date < t) return;
  const a = (S().restPlan || []).filter(d => d >= t && d !== date); if (on) a.push(date);
  S().restPlan = a.sort(); ui.restPick = null; saveSettings();
  toast(on ? `Rest planned for ${esc(fmtDow(date))} ${esc(fmtDate(date))}` : 'Planned rest removed'); render(true);
}
const INP = {
  restadd: el => { if (el.value) setRest(el.value, true); },
  w: el => setInput(el, true),
  r: el => setInput(el, true),
  swapex: el => { const id = el.value, w = logW(), e = w?.ex[+el.dataset.e]; if (!id || !e) return; const from = exDef(e.id).name;
    w.ex[+el.dataset.e] = { id, sets: prefill(id, e.sets.length, w.date) }; ui.exMore = null; ui.exHist = null; saveW(w.date); toast(`Swapped ${esc(from)} for ${esc(exDef(id).name)}`); render(true); },
  addex: el => { const id = el.value; if (!id) return; const w = logW(); w.ex.push({ id, sets: prefill(id, 2, w.date) }); saveW(w.date); render(true); reveal('#ex' + (w.ex.length - 1)); },
  note: el => { const w = logW(); w.note = el.value; saveW(w.date); },
  exnote: el => { const w = logW(), e = w.ex[+el.dataset.e]; const v = el.value.trim(); if (v) e.note = el.value; else delete e.note; ui.exNote = null; saveW(w.date); },
  durmin: el => { const w = logW(), n = parseInt(el.value, 10); if (n > 0) w.durMin = n; else delete w.durMin; saveW(w.date); render(); },
  cmin: el => { const w = logW(); w.cardio = w.cardio || { name: S().cardio.name, done: false }; w.cardio.min = num(el.value); w.cardio.manual = true; saveW(w.date); },
  clvl: el => { const w = logW(); w.cardio = w.cardio || { name: S().cardio.name, min: S().cardio.min, done: false }; w.cardio.lvl = el.value.trim() || null; saveW(w.date); },
  lift: el => { ui.lift = el.value; render(true); },
  proglift: el => { ui.progLift = el.value; render(true); },
  metric: el => { ui.metric = el.value; ui.off = 0; render(true); },
  sname: el => { const sd = sessDef(el.dataset.id); sd.name = el.value.trim() || sd.name; saveSettings(); },
  sfocus: el => { sessDef(el.dataset.id).focus = el.value.trim(); saveSettings(); },
  isets: el => { const n = parseInt(el.value, 10); if (n >= 1 && n <= 12) { sessDef(el.dataset.id).items[+el.dataset.j].sets = n; saveSettings(); render(); } },
  additem: el => { if (!el.value) return; const sid = el.dataset.id; sessDef(sid).items.push({ ex: el.value, sets: 2 }); saveSettings(); render(true); reveal(`#sa_${sid}`, 0); },
  cname: el => { S().cardio.name = el.value; saveSettings(); },
  cmindef: el => { const n = parseInt(el.value, 10); if (n > 0) { S().cardio.min = n; saveSettings(); } },
  platekg: el => { const n = num(el.value); if (n > 0) { S().plateKg = n; saveSettings(); } },
  suggest: el => { S().suggest = el.value === '1'; saveSettings(); },
  proteint: el => { const n = num(el.value); S().proteinT = n > 0 ? n : null; saveSettings(); },
  fwhoop: el => readFiles(el, readWhoopFiles),
  fmf: el => readFiles(el, readMfFiles),
  fah: el => readFiles(el, readAhFiles),
  fbackup: async el => {
    const f = el.files?.[0]; if (!f) return;
    try { const n = restoreBackup(JSON.parse(await f.text())); toast(`Restored ${n} sessions`); go('today'); }
    catch (e) { toast(esc(e.message || 'That file couldn’t be read.'), 'bad'); el.value = ''; }
  },
};
async function readFiles(el, reader) {
  const files = [...(el.files || [])]; if (!files.length) return;
  toast('Reading…');
  try { const p = await reader(files); ui.imp[p.src] = p; $('#toast').className = 'toast'; render(true); setTimeout(() => $('#imp-' + p.src)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }
  catch (e) { console.warn(e); toast(esc(e.message || 'That file couldn’t be read.'), 'bad'); el.value = ''; }
}
/* ---------- drag to reorder (sessions, exercises within a session, exercises in a day's log) ----------
   Positions are worked out in content space (pointer travel plus how far the page has scrolled since the drag began),
   so the list can auto-scroll under a still finger at the header or tab bar edge and the maths stays right. */
let flushedEl = null; // a field saved by hand as a drag starts: its own change event (fired on blur) is skipped
function flushField() { // save whatever field is being typed in, against the order it was typed in, then let go of it
  const a = document.activeElement; if (!editingInView()) return;
  const f = a.matches('.set .in') ? () => setInput(a, true) : INP[a.dataset?.in];
  if (f) { f(a); flushedEl = a; }
  a.blur();
}
document.addEventListener('pointerdown', ev => {
  const g = ev.target.closest('[data-grip]'); if (!g || ev.button > 0) return;
  const el = g.closest('[data-dragitem]'), list = el?.parentElement; if (!el || !list) return;
  const sibs = [...list.children].filter(c => c.hasAttribute('data-dragitem')); if (sibs.length < 2) return;
  ev.preventDefault();
  if (g.dataset.grip === 'ex') flushField(); // a set or note mid-typing is saved before anything moves (v1.39)
  const rects = sibs.map(s => s.getBoundingClientRect());
  const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8;
  drag = { el, list, sibs, rects, gap, from: sibs.indexOf(el), to: sibs.indexOf(el), y0: ev.clientY, y: ev.clientY, sy0: scrollY0(), kind: g.dataset.grip, pid: ev.pointerId, raf: 0 };
  try { g.setPointerCapture(ev.pointerId); } catch (e) { }
  el.classList.add('dragging'); document.body.classList.add('is-dragging');
});
function dragLayout() {
  const { rects, from, sibs, el, gap } = drag;
  const top = rects[0].top, bot = rects[rects.length - 1].bottom;
  const dy = Math.max(top - rects[from].top, Math.min(bot - rects[from].bottom, drag.y - drag.y0 + scrollY0() - drag.sy0));
  el.style.transform = `translateY(${dy}px)`;
  const mid = i => rects[i].top + rects[i].height / 2; // the dragged edge passing a neighbour's middle swaps them, so cards of any height can reach either end
  let to = from;
  for (let i = from + 1; i < rects.length; i++) if (rects[from].bottom + dy > mid(i)) to = i;
  for (let i = from - 1; i >= 0; i--) if (rects[from].top + dy < mid(i)) to = i;
  drag.to = to;
  const shift = rects[from].height + gap;
  sibs.forEach((s, i) => { if (i === from) return; const t = from < to && i > from && i <= to ? -shift : from > to && i >= to && i < from ? shift : 0; s.style.transform = t ? `translateY(${t}px)` : ''; });
}
function dragEdge() { // auto-scroll while the finger rests at the header or the tab bar
  if (!drag) return; drag.raf = 0;
  const hb = $('.top')?.getBoundingClientRect().bottom || 60, tb = Math.min(window.innerHeight - 90, ($('.tabs')?.getBoundingClientRect().top || window.innerHeight) - 24);
  const v = drag.y < hb + 24 ? -Math.min(16, 4 + (hb + 24 - drag.y) / 3) : drag.y > tb ? Math.min(16, 4 + (drag.y - tb) / 3) : 0;
  if (!v) return;
  const y = scrollY0(); scroller().scrollBy(0, v); if (scrollY0() === y) return; // at the end already
  dragLayout(); drag.raf = requestAnimationFrame(dragEdge);
}
document.addEventListener('pointermove', ev => {
  if (!drag || ev.pointerId !== drag.pid) return;
  drag.y = ev.clientY; dragLayout();
  if (!drag.raf) drag.raf = requestAnimationFrame(dragEdge);
});
function endDrag(ev) {
  if (!drag || (ev && ev.pointerId !== drag.pid)) return;
  const { from, to, kind, list, sibs, raf } = drag; drag = null; cancelAnimationFrame(raf); flushedEl = null;
  const y = scrollY0(), keep = () => { if (Math.abs(scrollY0() - y) > 1) scrollToY(y); };
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  requestAnimationFrame(keep); setTimeout(keep, 80); setTimeout(keep, 250); // iOS can jump to the top after the dragged row is replaced
  document.body.classList.remove('is-dragging'); sibs.forEach(s => { s.style.transform = ''; s.classList.remove('dragging'); });
  if (from === to || !ev || ev.type === 'pointercancel') { render(true); return; }
  if (kind === 'card' || kind === 'col') { // reorder mode: a draft until Done
    const keys = sibs.map(s => s.dataset.k), [m] = keys.splice(from, 1); keys.splice(to, 0, m);
    if (kind === 'col') ui.reo.cols = keys; else ui.reo.cards = [...keys, ...ui.reo.cards.filter(k => !keys.includes(k))];
    render(true); return;
  }
  if (kind === 'ex') { // that day's log only; open history, More and note fields follow their exercise
    const w = logW(); if (!w || !moveEx(w, from, to)) { render(true); return; }
    ui.exHist = movedIdx(ui.exHist, from, to); ui.exMore = movedIdx(ui.exMore, from, to); ui.exNote = movedIdx(ui.exNote, from, to);
    if (/^remex\d+$/.test(ui.confirm || '')) ui.confirm = null;
    saveW(w.date); render(true); return;
  }
  if (kind === 'sess') { const ids = sibs.map(s => s.dataset.id); const [m] = ids.splice(from, 1); ids.splice(to, 0, m); S().prog.order = ids; }
  else { const items = sessDef(list.dataset.id).items; const [m] = items.splice(from, 1); items.splice(to, 0, m); }
  saveSettings(); render(true);
}
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);

/* ---------- set rows: saved and counted as you type ---------- */
function setInput(el, final) {
  const w = logW(); if (!w) return; const i = +el.dataset.e, j = +el.dataset.s, e = w.ex[i], s = e?.sets[j]; if (!s) return;
  const def = exDef(e.id), wasDone = s.done, prevBest = final ? Math.max(bestBefore(e.id, w.date), ...e.sets.filter((x, k) => k !== j && x.done && x.r > 0).map(x => setScore(e.id, x, w.date))) : 0;
  setFromInputs(s, num($(`#w${i}_${j}`)?.value), parseInt($(`#r${i}_${j}`)?.value, 10), def.u, rowAim(e, j, w.date)?.w);
  const row = $(`#row${i}_${j}`); if (row) row.classList.toggle('done', s.done);
  if (final && s.done && s.w != null && $(`#w${i}_${j}`) && $(`#w${i}_${j}`).value === '') $(`#w${i}_${j}`).value = fmt(s.w, 2).replace(/,/g, '');
  const st = wStats(w), sm = $('.sess-top .t small'); if (sm) sm.textContent = sm.textContent.replace(/\d+ sets?/, `${st.sets} set${st.sets === 1 ? '' : 's'}`);
  saveW(w.date); renderFab(); // the count of empty sets changes as you fill them
  if (final && s.done && s.t !== 'w' && hasRef(e.id, w.date) && setScore(e.id, s, w.date) > prevBest + 1e-9) { row?.classList.add('pr'); toast(`New best · ${esc(def.name)} ${esc(fmtSet(e.id, s))}`, 'pr'); }
  else if (final && row && !s.done) row.classList.remove('pr');
}
document.addEventListener('input', ev => { const el = ev.target; if (el.matches && el.matches('.set .in')) setInput(el, false); });
/* ---------- a picked day in Coming up: any other tap drops it and today is highlighted again ----------
   Done in place (no re-render) and only once the tap's click has landed, so whatever you tapped still works. */
let pickTap = null, pickT = null;
function unpick() {
  clearTimeout(pickT); pickT = null; if (!ui.restPick) return; ui.restPick = null;
  $('.pickrow')?.remove(); document.querySelectorAll('.strip .sd.pick').forEach(e => e.classList.remove('pick'));
  document.querySelectorAll('.strip .sd[data-now]').forEach(e => e.classList.add('now'));
}
document.addEventListener('pointerdown', ev => { pickTap = ui.restPick ? { x: ev.clientX, y: ev.clientY } : null; }, true);
document.addEventListener('pointerup', ev => {
  const p = pickTap; pickTap = null; if (!p || !ui.restPick || Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 10) return; // a scroll isn't a tap
  if (ev.target.closest('.strip button.sd, .pickrow [data-act]')) return; // other days and the row's own button handle themselves
  clearTimeout(pickT); pickT = setTimeout(unpick, 350); // fallback when the tap lands on something with no click
}, true);
document.addEventListener('click', () => { if (pickT) unpick(); }, true);
/* ---------- a picked lift on Strength: tapping it again or anywhere outside the chart card drops it; a scroll doesn't ---------- */
let liftTap = null, liftT = null;
function unpickLift() { clearTimeout(liftT); liftT = null; if (!ui.lift || ui.tab !== 'strength') return; ui.lift = null; render(true); }
document.addEventListener('pointerdown', ev => { liftTap = ui.tab === 'strength' && ui.lift ? { x: ev.clientX, y: ev.clientY } : null; }, true);
document.addEventListener('pointerup', ev => {
  const p = liftTap; liftTap = null; if (!p || !ui.lift || Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 10) return; // a scroll isn't a tap
  if (ev.target.closest('#liftchart, .tbl.lifts tr[data-act], .tabs, #gear')) return; // the chart card, rows (they toggle) and navigation handle themselves
  clearTimeout(liftT); liftT = setTimeout(unpickLift, 350); // fallback when the tap lands on something with no click
}, true);
document.addEventListener('click', () => { if (liftT) setTimeout(unpickLift, 0); }, true); // after the tap's own click has run
/* ---------- exercise search (Plan): filters rows in place so the input keeps focus ---------- */
function filterEx() {
  const list = $('#exlist'); if (!list) return; let n = 0;
  for (const li of list.children) { const on = !!li.dataset.edit || exMatch(li.dataset.q || '', ui.exQ); li.hidden = !on; if (on) n++; }
  const x = $('#exqx'); if (x) x.hidden = !ui.exQ; const none = $('#exnone'); if (none) none.hidden = n > 0;
}
document.addEventListener('input', ev => { if (ev.target.id === 'exq') { ui.exQ = ev.target.value; filterEx(); } });
/* Swipe the Today header left or right to step a day (v1.36); vertical moves are scrolls and are ignored. */
let swipe0 = null;
document.addEventListener('touchstart', ev => { const h = ev.target.closest && ev.target.closest('.page-h.day'); swipe0 = h && ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY } : null; }, { passive: true });
document.addEventListener('touchend', ev => { if (!swipe0 || ui.tab !== 'today') return; const t = ev.changedTouches[0], dx = t.clientX - swipe0.x, dy = t.clientY - swipe0.y; swipe0 = null;
  if (Math.abs(dx) > 50 && Math.abs(dy) < 30) ACT.dayoff({ dataset: { n: dx < 0 ? '1' : '-1' } }); }, { passive: true });
function fadeCheck(el) { (el ? [el] : document.querySelectorAll('.tblwrap.fade')).forEach(w => w.classList.toggle('end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 2)); } // the fade marks more columns to the right
document.addEventListener('scroll', ev => { const t = ev.target; if (t && t.classList && t.classList.contains('fade')) fadeCheck(t); }, true);
window.addEventListener('resize', () => fadeCheck());
function filterHist() { // History search and session filter, in place; a week heading hides with its last visible row
  const q = ui.histQ || '', sid = ui.histS || ''; let any = false;
  document.querySelectorAll('#view .hist').forEach(g => { let n = 0;
    g.querySelectorAll('.hrow').forEach(r => { const hit = (!sid || r.dataset.s === sid) && exMatch(r.dataset.q || '', q); r.hidden = !hit; if (hit) n++; });
    g.hidden = !n; const h = g.previousElementSibling; if (h && h.classList.contains('sec-h')) h.hidden = !n; if (n) any = true; });
  const e = $('.histempty'); if (e) e.hidden = any;
}
document.addEventListener('input', ev => { if (ev.target.id === 'hq') { ui.histQ = ev.target.value; filterHist(); } });
function filterPick() { // in place, so the keyboard stays up; a group label hides when none of its rows match
  const q = ui.pick?.q || ''; let any = false, lab = null, labAny = false;
  const done = () => { if (lab) lab.hidden = !labAny; };
  document.querySelectorAll('.picklist > li').forEach(li => { if (li.classList.contains('pg')) { done(); lab = li; labAny = false; return; } const hit = exMatch(li.dataset.q || '', q); li.hidden = !hit; if (hit) { any = true; labAny = true; } });
  done(); const e = $('.pickempty'); if (e) e.hidden = any;
}
document.addEventListener('input', ev => { if (ev.target.id === 'pickq' && ui.pick) { ui.pick.q = ev.target.value; filterPick(); } });
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'exq') { ev.preventDefault(); ev.target.blur(); } });
['pointerdown', 'mousedown'].forEach(t => document.addEventListener(t, ev => { if (ev.target.closest('#exqx')) ev.preventDefault(); })); // keep the keyboard up while clearing
document.addEventListener('change', ev => { const el = ev.target.closest('[data-in]'); if (!el) return; if (el === flushedEl) { flushedEl = null; return; } const f = INP[el.dataset.in]; if (f) f(el); });
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' || !ev.target.matches('.set .in')) return;
  ev.preventDefault(); const all = [...document.querySelectorAll('.set .in')], k = all.indexOf(ev.target);
  if (all[k + 1]) all[k + 1].focus(); else ev.target.blur();
});

/* ============================================================
   BOOT
   ============================================================ */
(function boot() {
  try { history.scrollRestoration = 'manual'; } catch (e) { }
  const top = () => { window.scrollTo(0, 0); if (SBOX) scrollToY(0); }; // opening the app always starts at the top
  // iOS home-screen launches can sit at an offset that a plain scrollTo(0, 0) treats as already done; a 1px nudge forces a real scroll
  window.addEventListener('load', () => setTimeout(() => { window.scrollTo(0, 1); window.scrollTo(0, 0); }, 60));
  window.addEventListener('pageshow', top); window.addEventListener('load', top);
  const loc = loadLocal();
  if (loc) { STATE.settings = migrateSettings(loc.settings); STATE.w = loc.w || {}; STATE.d = loc.d || {}; }
  const h = (location.hash || '').slice(1), hh = h === 'trends' ? 'body' : h; if (VIEWS[hh] && hh !== 'log') ui.tab = hh;
  render(true); top(); requestAnimationFrame(top);
  connectCloud();
  setTimeout(() => { sweepEmpty(); sweepCardio(); sweepSettings(); render(); }, 0); // after sync code has loaded, so the deletes sync too
})();
