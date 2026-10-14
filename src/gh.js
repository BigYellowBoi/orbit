/* ============================================================
   GITHUB SYNC (GitHub Pages build only)
   Data lives in a private repo the owner controls:
     orbit/settings.json, orbit/wk/YYYY-MM.json, orbit/dy/YYYY-MM.json
   Each sync: read the branch head; if it moved, fetch only changed files and merge
   them in (dates edited here and not yet pushed win); then commit everything
   edited here as one commit. A rejected ref update means another device pushed
   first, so pull again and retry. The token is kept in this browser only.
   ============================================================ */
window.GH_SYNC = true;
const GH_CFG = 'orbit-gh-cfg', GH_META = 'orbit-gh-meta', GH_API = 'https://api.github.com';
/* Three-way merge of settings (v1.49). b is what both sides started from (NOBASE when unknown: then a union).
   A side that didn't change a value takes the other's; objects merge key by key, so an exercise added on one device and
   a setting changed on another both survive. A value changed on both sides: this device wins; an edit beats a delete. */
const NOBASE = Symbol('nobase');
function merge3(b, l, r) {
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v), eq = (x, y) => JSON.stringify(x) === JSON.stringify(y), cp = v => v === undefined ? undefined : clone(v);
  if (eq(l, r)) return cp(l);
  if (b !== NOBASE && eq(b, l)) return cp(r);
  if (b !== NOBASE && eq(b, r)) return cp(l);
  if (isObj(l) && isObj(r)) { const out = {}; for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) { const v = merge3(b === NOBASE ? NOBASE : isObj(b) ? b[k] : undefined, l[k], r[k]); if (v !== undefined) out[k] = v; } return out; }
  return l === undefined ? cp(r) : cp(l);
}
function b64(text) { const by = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(s); }
const GH = {
  cfg: null, meta: null, busy: false, again: false, timer: null, poll: null,
  state: 'off', err: null, // off | syncing | ok | offline | error
  load() {
    try { this.cfg = JSON.parse(localStorage.getItem(GH_CFG) || 'null'); } catch (e) { this.cfg = null; }
    try { this.meta = JSON.parse(localStorage.getItem(GH_META) || 'null'); } catch (e) { this.meta = null; }
    if (!this.meta || !this.cfg || this.meta.repo !== this.repoKey()) this.meta = this.freshMeta();
  },
  repoKey() { return this.cfg ? `${this.cfg.owner}/${this.cfg.repo}`.toLowerCase() : ''; },
  freshMeta() { return { repo: this.repoKey(), head: null, tree: null, known: {}, dirty: {}, first: true, at: null }; },
  saveMeta() { try { localStorage.setItem(GH_META, JSON.stringify(this.meta)); } catch (e) { } },
  on() { return !!(this.cfg && this.cfg.token); },

  /* ---------- paths ---------- */
  path(kind, ym) { return kind === 'settings' ? 'orbit/settings.json' : `orbit/${kind}/${ym}.json`; },
  parse(p) { const m = /^orbit\/(wk|dy)\/(\d{4}-\d{2})\.json$/.exec(p); return m ? { kind: m[1], ym: m[2] } : p === 'orbit/settings.json' ? { kind: 'settings' } : null; },
  content(p) { const o = this.parse(p); if (!o) return null; if (o.kind === 'settings') return JSON.stringify(STATE.settings); const it = monthItems(o.kind, o.ym); return Object.keys(it).length ? JSON.stringify({ items: it }) : null; },

  /* ---------- local edits ---------- */
  changed(kind, key, whole) {
    if (!this.meta) return;
    this.mark(kind, key, whole); this.saveMeta();
    if (!this.on()) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 1500);
    if (this.state !== 'error') this.setState('syncing');
  },
  mark(kind, key, whole) {
    const d = this.meta.dirty;
    if (kind === 'settings') d[this.path('settings')] = true;
    else {
      const ym = key.slice(0, 7), p = this.path(kind, ym);
      if (whole || d[p] === '*') d[p] = '*';
      else {
        const set = new Set(Array.isArray(d[p]) ? d[p] : []);
        if (key.length === 10) set.add(key); else for (const k in monthItems(kind, ym)) set.add(k);
        d[p] = [...set];
      }
    }
  },

  /* ---------- HTTP ---------- */
  async req(method, url, body) {
    const t0 = performance.now(), sent = body ? JSON.stringify(body) : undefined;
    const r = await fetch(GH_API + url, { method, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.cfg.token, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: sent });
    const txt = await r.text().catch(() => ''); netNote('gh', t0, nbytes(sent), nbytes(txt), r);
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { }
    if (!r.ok) { const e = new Error(data?.message || 'HTTP ' + r.status); e.status = r.status; e.ratelimit = r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0'; throw e; }
    return data;
  },
  repoUrl(rest) { return `/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}${rest}`; },
  branch() { return this.cfg.branch || 'main'; },
  async head() { // null when the repo has no commits yet
    // Asked with the last ETag, so an unchanged repo answers 304, which GitHub doesn't count against the hourly rate limit (polled every 15 s)
    const h = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.cfg.token, 'X-GitHub-Api-Version': '2022-11-28' };
    const url = GH_API + this.repoUrl(`/git/ref/heads/${this.branch()}`);
    if (this.refTag && this.refSha && !this.noTag) h['If-None-Match'] = this.refTag;
    let r, t0 = performance.now(); try { r = await fetch(url, { cache: 'no-store', headers: h }); }
    catch (e) { if (!h['If-None-Match']) throw e; this.noTag = true; delete h['If-None-Match']; t0 = performance.now(); r = await fetch(url, { cache: 'no-store', headers: h }); } // header refused: plain requests from now on
    if (r.status === 304) { netNote('gh', t0, 0, 0, r); return this.refSha; }
    const txt = await r.text().catch(() => ''); netNote('gh', t0, 0, nbytes(txt), r);
    if (r.ok) { const j = JSON.parse(txt); this.refSha = j.object.sha; this.refTag = r.headers.get('etag'); return this.refSha; }
    this.refTag = this.refSha = null;
    if (r.status === 409 || r.status === 404) { if (r.status === 404) await this.req('GET', this.repoUrl('')); return null; }
    let data = null; try { data = JSON.parse(txt); } catch (e) { }
    const e = new Error(data?.message || 'HTTP ' + r.status); e.status = r.status; e.ratelimit = r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0'; throw e;
  },
  async blobText(sha) { const b = await this.req('GET', this.repoUrl(`/git/blobs/${sha}`)); const bin = atob((b.content || '').replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); },
  async gitSha(text) { const bytes = new TextEncoder().encode(text), hdr = new TextEncoder().encode(`blob ${bytes.length}\0`), all = new Uint8Array(hdr.length + bytes.length); all.set(hdr); all.set(bytes, hdr.length); const h = await crypto.subtle.digest('SHA-1', all); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); },

  /* ---------- pull + merge ---------- */
  async pull() {
    const m = this.meta, head = await this.head();
    if (!head) { // empty repo: everything here is new
      if (m.first) this.markAllLocal();
      m.head = null; m.tree = null; m.known = {}; m.first = false; return false;
    }
    if (head === m.head && !m.first) return false;
    const commit = await this.req('GET', this.repoUrl(`/git/commits/${head}`));
    const tree = await this.req('GET', this.repoUrl(`/git/trees/${commit.tree.sha}?recursive=1`));
    const remote = {}; for (const t of tree.tree || []) if (t.type === 'blob' && this.parse(t.path)) remote[t.path] = t.sha;
    const fetchList = Object.keys(remote).filter(p => remote[p] !== m.known[p]);
    const texts = {}; let i = 0;
    await Promise.all(Array.from({ length: Math.min(6, fetchList.length) }, async () => { while (i < fetchList.length) { const p = fetchList[i++]; texts[p] = await this.blobText(remote[p]); } }));
    const sp = this.path('settings'); this.baseSet = NOBASE; // v1.49: the version this device last synced, so edits on both sides can be merged
    if (texts[sp] && m.dirty[sp] && !m.first && m.known[sp]) { try { this.baseSet = JSON.parse(await this.blobText(m.known[sp])); } catch (e) { } }
    let ch = false;
    for (const p of fetchList) { let o = null; try { o = JSON.parse(texts[p]); } catch (e) { continue; } if (this.merge(p, o)) ch = true; }
    if (!m.first) for (const p in m.known) if (!remote[p] && this.removeRemote(p)) ch = true; // deleted on another device
    if (m.first) this.markLocalOnly(remote);
    m.head = head; m.tree = commit.tree.sha; m.known = remote; m.first = false;
    if (ch) { sweepEmpty(); sweepCardio(); sweepSettings(); bump(); cacheLocal(); render(); pulseMark(); }
    return ch;
  },
  merge(p, o) {
    const info = this.parse(p), dirty = this.meta.dirty[p], first = this.meta.first;
    if (info.kind === 'settings') {
      if (dirty && !first) { // edited on both sides: merge field by field against the last synced version (v1.49; was whole-file, this device wins, which dropped an exercise added elsewhere)
        const b = this.baseSet === NOBASE ? NOBASE : migrateSettings(this.baseSet), next = merge3(b, STATE.settings, migrateSettings(o));
        if (JSON.stringify(next) === JSON.stringify(STATE.settings)) return false;
        STATE.settings = next; return true; // stays dirty, so the merged copy goes up
      }
      if (JSON.stringify(o) === JSON.stringify(STATE.settings)) return false;
      STATE.settings = migrateSettings(o); delete this.meta.dirty[p]; return true;
    }
    if (dirty === '*') return false; // replaced wholesale here (restore / delete all)
    const tgt = STATE[KIND[info.kind]], items = o?.items || {}, local = monthItems(info.kind, info.ym);
    const keep = new Set(Array.isArray(dirty) ? dirty : []);
    const next = { ...items };
    if (first) { for (const k in local) if (!items[k]) { next[k] = local[k]; keep.add(k); } } // first connect: union, the repo wins on overlaps
    else for (const k of keep) { if (!local[k]) delete next[k]; else next[k] = info.kind === 'dy' && items[k] ? { ...items[k], ...local[k] } : local[k]; } // day data: fields from the sync helper and this device combine
    if (JSON.stringify(next) === JSON.stringify(local)) return false;
    for (const k in local) delete tgt[k];
    Object.assign(tgt, clone(next));
    if (first && keep.size) this.meta.dirty[p] = [...keep];
    return true;
  },
  removeRemote(p) {
    const info = this.parse(p); if (!info || info.kind === 'settings' || this.meta.dirty[p]) return false;
    const tgt = STATE[KIND[info.kind]]; let ch = false;
    for (const k in monthItems(info.kind, info.ym)) { delete tgt[k]; ch = true; }
    return ch;
  },
  markAllLocal() {
    this.meta.dirty[this.path('settings')] = true;
    for (const kind of ['wk', 'dy']) for (const k in STATE[KIND[kind]]) this.mark(kind, k);
  },
  markLocalOnly(remote) {
    if (!remote[this.path('settings')]) this.meta.dirty[this.path('settings')] = true;
    for (const kind of ['wk', 'dy']) { const months = new Set(Object.keys(STATE[KIND[kind]]).map(k => k.slice(0, 7))); for (const ym of months) if (!remote[this.path(kind, ym)]) this.mark(kind, ym); }
  },

  /* ---------- push ---------- */
  async push() {
    const m = this.meta, paths = Object.keys(m.dirty); if (!paths.length) return true;
    const taking = m.dirty; m.dirty = {};
    try {
      const entries = [], newKnown = { ...m.known };
      for (const p of paths) {
        const text = this.content(p);
        if (text == null) { if (m.known[p]) { entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); delete newKnown[p]; } continue; }
        const sha = await this.gitSha(text); if (sha === m.known[p]) continue;
        entries.push({ path: p, mode: '100644', type: 'blob', content: text }); newKnown[p] = sha;
      }
      if (!entries.length) { this.saveMeta(); return true; }
      if (!m.head) { // the Git Data API refuses empty repos, so seed the first commit through the contents API
        const first = entries.find(e => e.content) || { path: 'orbit/settings.json', content: JSON.stringify(STATE.settings) };
        const r = await this.req('PUT', this.repoUrl(`/contents/${first.path}`), { message: 'Orbit: start sync', content: b64(first.content), branch: this.branch() });
        m.head = r.commit.sha; m.tree = r.commit.tree.sha; m.known = { [first.path]: r.content.sha };
        this.restore(taking); this.saveMeta(); return false; // the rest goes as one commit next round
      }
      const tree = await this.req('POST', this.repoUrl('/git/trees'), { base_tree: m.tree, tree: entries });
      const commit = await this.req('POST', this.repoUrl('/git/commits'), { message: `Orbit: ${entries.length} file${entries.length === 1 ? '' : 's'} from ${this.device()}`, tree: tree.sha, parents: [m.head] });
      await this.req('PATCH', this.repoUrl(`/git/refs/heads/${this.branch()}`), { sha: commit.sha, force: false });
      m.head = commit.sha; m.tree = tree.sha; m.known = newKnown; this.saveMeta(); return true;
    } catch (e) {
      this.restore(taking); this.saveMeta();
      if (e.status === 422 || e.status === 409) return false; // another device got there first
      throw e;
    }
  },
  restore(taking) { const d = this.meta.dirty; for (const p in taking) { const cur = d[p], t = taking[p]; d[p] = cur === undefined ? t : (cur === '*' || t === '*') ? '*' : (cur === true || t === true) ? true : [...new Set([...t, ...cur])]; } },
  device() { return /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'phone' : 'browser'; },

  /* ---------- loop ---------- */
  async sync() {
    if (!this.on()) return;
    if (this.busy) { this.again = true; return; }
    if (navigator.onLine === false) { this.setState('offline'); return; }
    this.busy = true; clearTimeout(this.timer); this.setState('syncing');
    try {
      for (let tries = 0; tries < 4; tries++) { await this.pull(); if (await this.push()) break; }
      this.meta.at = Date.now(); this.err = null; this.saveMeta();
      this.setState(Object.keys(this.meta.dirty).length ? 'syncing' : 'ok');
    } catch (e) {
      console.warn('GitHub sync', e.status || '', e.message);
      if (!e.status) this.setState('offline');
      else { this.err = e.status === 401 ? 'GitHub rejected the token. It may have expired: make a new one and reconnect.' : e.status === 404 ? 'Repo not found, or the token can’t see it.' : e.ratelimit ? 'GitHub rate limit reached. Sync resumes shortly.' : e.status === 403 ? 'The token can’t write to this repo. Give it Contents: read and write.' : 'GitHub said: ' + e.message; this.setState('error'); }
    } finally {
      this.busy = false; this.saveMeta();
      if (this.again) { this.again = false; setTimeout(() => this.sync(), 300); }
      else if (Object.keys(this.meta.dirty).length && this.state === 'syncing') { clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 1500); }
    }
  },
  setState(s) { this.state = s; const el = $('#ghstat'); if (el) el.innerHTML = this.pill(); const at = $('#ghat'); if (at) at.textContent = this.atText(); const er = $('#gherr'); if (er) { er.textContent = this.state === 'error' ? this.err || '' : ''; er.hidden = this.state !== 'error'; } },
  pill() { return ({ ok: pill('good', 'Synced'), syncing: pill('', 'Syncing'), offline: pill('warn', 'Offline'), error: pill('bad', 'Not synced'), off: pill('', 'This browser') })[this.on() ? this.state : 'off']; },
  atText() { const a = this.meta?.at; if (!a) return 'Not synced yet'; const s = (Date.now() - a) / 1000; return 'Last synced ' + (s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(a).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })); },

  async connect(owner, repo, token) {
    this.cfg = { owner, repo, token, branch: 'main' };
    let r;
    try { r = await this.req('GET', this.repoUrl('')); }
    catch (e) { this.cfg = null; throw new Error(e.status === 401 ? 'GitHub rejected that token.' : e.status === 404 ? `Can’t find ${owner}/${repo} with that token.` : 'Couldn’t reach GitHub. Check your connection.'); }
    if (!r.private) { this.cfg = null; throw new Error(`${owner}/${repo} is public. Make it private first: your health data would be visible to anyone.`); }
    if (r.permissions && !r.permissions.push) { this.cfg = null; throw new Error('That token can read the repo but not write to it. Give it Contents: read and write.'); }
    this.cfg.branch = r.default_branch || 'main';
    try { localStorage.setItem(GH_CFG, JSON.stringify(this.cfg)); } catch (e) { }
    this.meta = this.freshMeta(); this.saveMeta();
    this.start(); await this.sync();
  },
  disconnect() { this.stop(); this.cfg = null; this.meta = this.freshMeta(); try { localStorage.removeItem(GH_CFG); localStorage.removeItem(GH_META); } catch (e) { } this.state = 'off'; },
  start() {
    this.stop();
    this.poll = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 15000); // only while the app is on screen; an unchanged check is one tiny request
  },
  stop() { clearInterval(this.poll); clearTimeout(this.timer); },
  boot() {
    this.load();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.sync(); else if (Object.keys(this.meta?.dirty || {}).length) this.sync(); });
    window.addEventListener('online', () => this.sync());
    window.addEventListener('offline', () => { if (this.on()) this.setState('offline'); });
    if (this.on()) { this.start(); this.sync(); }
  },
  card() {
    if (!this.on()) return `<section class="card"><div class="card-h"><h2>Sync</h2><span id="ghstat">${pill('', 'This browser')}</span></div>
      <p class="small dim">Connect your private GitHub repo to keep this phone and your browser in step. Data is saved to <span class="mono">orbit-data</span> as small JSON files, and also kept in this browser.</p>
      <div class="grid2 sec"><label class="fl">GitHub username<input class="in left" id="gh_o" value="${esc(ui.ghO ?? 'BigYellowBoi')}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label class="fl">Data repo<input class="in left" id="gh_r" value="${esc(ui.ghR ?? 'orbit-data')}" autocapitalize="off" autocomplete="off" spellcheck="false"></label></div>
      <label class="fl">Access token<input class="in left" id="gh_t" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
      <p class="xs muted">A fine-grained token with <b>Contents: read and write</b> on the data repo only. It stays in this browser and is sent only to GitHub.</p>
      <div class="btnrow"><button class="btn sm" data-act="ghconnect">Connect</button></div></section>`;
    return `<section class="card"><div class="card-h"><h2>Sync</h2><span id="ghstat">${this.pill()}</span></div>
      <p class="small dim">Saving to <span class="mono">${esc(this.cfg.owner)}/${esc(this.cfg.repo)}</span> and this device. Changes reach your other devices within seconds.</p>
      <p class="xs muted" id="ghat">${esc(this.atText())}</p><p class="small" id="gherr" style="color:var(--bad-ink)" ${this.state === 'error' ? '' : 'hidden'}>${esc(this.err || '')}</p>
      ${ui.confirm === 'ghoff' ? `<p class="small">Stop syncing on this device? Data here and in the repo stays as it is.</p><div class="btnrow"><button class="btn sm danger" data-act="ghoff">Disconnect</button><button class="link dim" data-act="confirm" data-v="">Cancel</button></div>`
      : `<div class="btnrow"><button class="btn sm ghost" data-act="ghnow">Sync now</button><button class="link dim" data-act="confirm" data-v="ghoff" style="margin-left:auto">Disconnect</button></div>`}</section>`;
  },
};
Object.assign(ACT, {
  ghconnect: async el => {
    const o = ($('#gh_o')?.value || '').trim(), r = ($('#gh_r')?.value || '').trim(), t = ($('#gh_t')?.value || '').trim();
    ui.ghO = o; ui.ghR = r;
    if (!o || !r || !t) { toast('Fill in all three fields', 'bad'); return; }
    el.disabled = true; el.textContent = 'Connecting…';
    try { await GH.connect(o, r, t); toast(GH.state === 'error' ? esc(GH.err) : 'Sync is on', GH.state === 'error' ? 'bad' : ''); }
    catch (e) { toast(esc(e.message), 'bad'); }
    render(true);
  },
  ghnow: () => GH.sync(),
  ghoff: () => { GH.disconnect(); ui.confirm = null; toast('Sync is off on this device'); render(true); },
});
/* AUTOMATIC SYNC: the sync helper (worker/) reports when it last reached WHOOP and last received Apple Health numbers
   at <helper>/status.json. The Data screen shows that, so a stalled helper is easy to spot. The address is kept in settings. */
/* Traffic from this phone, for the Data screen's Traffic card: per service, requests, time to the end of the body and bytes
   each way, plus GitHub's hourly allowance from its rate-limit headers. A browser can't time an upload on its own, so only
   download speed is worked out. */
const NET = { gh: { n: 0, n304: 0, ms: 0, up: 0, down: 0, last: null }, helper: { n: 0, n304: 0, ms: 0, up: 0, down: 0, last: null }, rate: null };
const nbytes = t => t ? new TextEncoder().encode(t).length : 0;
function netNote(svc, t0, up, down, r) {
  const x = NET[svc], ms = Math.max(1, Math.round(performance.now() - t0)); x.n++; if (r.status === 304) x.n304++;
  x.ms += ms; x.up += up; x.down += down; x.last = { ms, up, down, code: r.status, at: Date.now() };
  const left = r.headers.get('x-ratelimit-remaining'); if (svc === 'gh' && left != null) NET.rate = { left: +left, limit: +(r.headers.get('x-ratelimit-limit') || 5000), reset: +(r.headers.get('x-ratelimit-reset') || 0) * 1000 };
}
const Helper = {
  st: null, at: 0, err: null, busy: false,
  url() { return String(S().helper || '').trim().replace(/\/+$/, ''); },
  async refresh(force) {
    const u = this.url(); if (!u || this.busy || (!force && Date.now() - this.at < 60e3)) return;
    this.busy = true;
    try {
      const t0 = performance.now(), r = await fetch(u + '/status.json', { cache: 'no-store' }), txt = await r.text().catch(() => '');
      netNote('helper', t0, 0, nbytes(txt), r);
      if (r.status === 404) throw new Error('The helper needs updating: paste the latest orbit-sync.js into Cloudflare.');
      if (!r.ok) throw new Error('The sync helper answered with an error (' + r.status + ').');
      this.st = JSON.parse(txt); this.err = null;
    } catch (e) { this.err = e instanceof TypeError ? 'Couldn’t reach the sync helper. Check the address, or try again when you’re online.' : e.message; }
    this.busy = false; this.at = Date.now(); if (ui.tab === 'data') render();
  },
  when(t) {
    if (!t) return null;
    const d = new Date(t), day = todayStr(), ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, clock = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    const m = Math.round((Date.now() - t) / 60000), rel = m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : '';
    return `${ds === day ? '' : (ds === addDays(day, -1) ? 'yesterday' : fmtDate(ds)) + ' '}${clock}${rel ? ' · ' + rel : ''}`;
  },
  card() {
    const u = this.url();
    if (!u || ui.helperEdit) return `<section class="card"><div class="card-h"><h2>Automatic sync</h2><span class="eyebrow">sync helper</span></div>
      <p class="small dim">Add your sync helper's address to see when WHOOP and Apple Health last came in.</p>
      <label class="fl">Helper address<input class="in left" id="hl_u" value="${esc(u)}" placeholder="https://orbit-sync.yourname.workers.dev" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <div class="btnrow"><button class="btn sm" data-act="helpersave">Save</button>${u ? '<button class="link dim" data-act="helpercancel">Cancel</button>' : ''}</div></section>`;
    this.refresh();
    const w = this.st?.whoop, h = this.st?.health, wAt = this.when(w?.checkedAt), hAt = this.when(h?.at);
    const wPill = !this.st ? pill('', this.err ? 'Unknown' : 'Checking…') : !w.connected ? pill('warn', 'Not connected') : w.error ? pill('bad', 'Problem') : !w.checkedAt || Date.now() - w.checkedAt > 75 * 60e3 ? pill('warn', 'Behind') : pill('good', 'Running');
    const hPill = !this.st ? '' : !h?.at ? pill('', 'Not set up') : Date.now() - h.at > 36 * 3600e3 ? pill('warn', 'Behind') : pill('good', 'Running');
    return `<section class="card"><div class="card-h"><h2>Automatic sync</h2><span class="eyebrow">sync helper</span></div>
      <ul class="rows"><li><span>WHOOP</span>${wPill}<span class="sub">${this.st ? (wAt ? `Last sync ${esc(wAt)}` : 'Not synced yet') : '&nbsp;'}${w && w.history && w.history !== 'complete' ? ` · history filling in, next ${esc(w.history)}` : ''}</span></li>
        <li><span>Apple Health</span>${hPill}<span class="sub">${this.st ? (hAt ? `Last received ${esc(hAt)}` : 'Nothing received yet') : '&nbsp;'}</span></li>
        ${(() => { const c = [[w?.dataAt, `${w?.dataWhat || 'WHOOP'}${w?.dataWhat ? ' from WHOOP' : ''}`], [h?.dataAt, 'Apple Health']].filter(x => x[0]).sort((a, b) => b[0] - a[0])[0]; return c ? `<li><span>Latest data</span><span class="sub">${esc(this.when(c[0]))} · ${esc(c[1])}</span></li>` : ''; })()}</ul>
      ${w?.error ? `<p class="small" style="color:var(--bad-ink)">${esc(w.error)}</p>` : ''}${this.err ? `<p class="small" style="color:var(--warn-ink)">${esc(this.err)}</p>` : ''}
      
      <div class="btnrow"><button class="link" data-act="helperrefresh">Refresh</button><button class="link dim" data-act="helperedit" style="margin-left:auto">Change address</button></div></section>`;
  },
  traffic() { // usage against limits, speeds per service, and the helper's recent sync log; refreshed in place every 2 s while open
    const st = this.st, u = st?.usage, net = st?.net || {}, kb = b => b == null ? '–' : b < 1024 ? `${b} B` : `${fmt(b / 1024, 1)} KB`;
    const short = n => n >= 1000 ? fmt(n / 1000, n % 1000 ? 1 : 0) + 'k' : String(n);
    const bar = (lab, used, lim, note) => `<li><span class="lab">${esc(lab)}</span><span class="trk"><span class="fill" style="width:${Math.min(100, used / lim * 100)}%;background:var(--${used / lim > .8 ? 'bad' : used / lim > .5 ? 'warn' : 's1'})"></span></span><span class="v">${short(used)} / ${short(lim)}</span></li>${note ? `<li class="hb-note"><span class="xs muted">${note}</span></li>` : ''}`;
    const speed = (down, ms) => down >= 2048 && ms > 0 ? `${fmt(down / 1024 / (ms / 1000), 0)} KB/s` : '–';
    const row = (name, x, scope) => !x || !x.n ? `<tr><td>${name}</td><td class="n muted" colspan="3">no requests yet</td></tr>`
      : `<tr><td>${name}<br><span class="xs muted">${scope}</span></td><td class="n">${fmt(x.ms / x.n, 0)} ms</td><td class="n">${speed(x.down, x.ms)}</td><td class="n">↓${kb(x.down)}<br><span class="xs muted">↑${kb(x.up)}</span></td></tr>`;
    const phoneGh = NET.gh, rate = NET.rate, reset = r => r?.reset ? new Date(r.reset).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : '';
    let h = `<section class="card" id="traffic"><div class="card-h"><h2>Traffic</h2><span class="eyebrow">live</span></div>`;
    h += `<span class="xs muted">Today, against the free limits</span><ul class="hbars use">`;
    if (u) h += bar('WHOOP calls', u.whoop, u.whoopLimit) + bar('Cloudflare writes', u.kv, u.kvLimit);
    if (u && u.ghLeft != null) h += bar('GitHub, helper', u.ghLimit - u.ghLeft, u.ghLimit, `resets ${esc(reset({ reset: u.ghReset }))}`);
    if (rate) h += bar('GitHub, phone', rate.limit - rate.left, rate.limit, `resets ${esc(reset(rate))}`);
    h += `</ul>${u ? `<span class="xs muted">${u.runs} checks, ${u.hooks} WHOOP notifications, ${u.health} Apple Health posts today.</span>` : ''}`;
    h += `<div class="tblwrap"><table class="tbl net"><thead><tr><th>Link</th><th class="n">Response</th><th class="n">↓ Speed</th><th class="n">Data</th></tr></thead><tbody>
      ${row('Phone → GitHub', phoneGh, `${phoneGh.n} request${phoneGh.n === 1 ? '' : 's'} this session${phoneGh.n304 ? `, ${phoneGh.n304} unchanged` : ''}`)}
      ${row('Phone → Helper', NET.helper, `${NET.helper.n} request${NET.helper.n === 1 ? '' : 's'} this session`)}
      ${row('Helper → WHOOP', net.whoop, net.whoop?.at ? `last run ${esc(new Date(net.whoop.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))}` : '')}
      ${row('Helper → GitHub', net.gh, net.gh?.at ? `last run ${esc(new Date(net.gh.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))}` : '')}
    </tbody></table></div><p class="xs muted">Response is the average per request. Speed shows for downloads over 2 KB.</p>`;
    // newest first; an entry a newer one supersedes is dropped (same rule as the helper's logEv)
    const lk = e => e.k === 'notify' ? 'notify:' + e.w : e.k === 'history' ? null : e.k, sup = (n, o) => { const k = lk(o); return k != null && (k === lk(n) || (n.k === 'full' && o.k === 'steps')); };
    const log = (st?.log || []).reduce((a, e) => (a.some(n => sup(n, e)) ? a : [...a, e]), []), lab = e => e.k === 'notify' ? `${e.w[0].toUpperCase() + e.w.slice(1)} (WHOOP notification)` : e.k === 'full' ? 'Full check' : e.k === 'steps' ? 'Steps and strain' : e.k === 'error' ? 'Problem' : e.w;
    if (log.length) h += `<span class="xs muted">Recent syncs by the helper</span><ul class="rows synclog">${log.slice(0, 12).map(e => `<li><span>${esc(lab(e))}</span>${e.k === 'error' ? pill('bad', 'Error') : e.ch ? pill('good', 'New data') : pill('', 'No change')}<span class="sub">${esc(this.when(e.t))}${e.rq ? ` · ${e.rq} request${e.rq === 1 ? '' : 's'}` : ''}${e.k === 'error' ? ' · ' + esc(e.w) : ''}</span></li>`).join('')}</ul>`;
    else if (st && !u) h += `<p class="xs muted">Paste the latest orbit-sync.js into Cloudflare to see the helper's usage and sync log.</p>`;
    return h + `</section>`;
  },
  explain() { // what arrives on its own, and what only comes from a file
    const hae = !!this.st?.health?.at;
    return `<section class="card"><div class="card-h"><h2>What syncs by itself</h2></div>
      <ul class="rows">
        <li><span><b>Automatic</b></span><span class="sub">WHOOP: everything, within a minute (steps and strain every 5 min).<br>Apple Health${hae ? '' : ' (once Health Auto Export is set up)'}: steps, food, weight, headphone level, hourly.<br>Your logs and settings: every device, as you go.</span></li>
        <li><span><b>Needs a file</b></span><span class="sub">MacroFactor's trend weight, expenditure and targets (.xlsx). Orbit estimates the first two until then.<br>Headphone listening time (full Health export).<br>WHOOP journal, e.g. alcohol (WHOOP export).</span></li>
      </ul></section>`;
  },
};
Object.assign(ACT, {
  helpersave: () => {
    let v = ($('#hl_u')?.value || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    if (v && !/^https:\/\/[^\s/]+$/i.test(v)) { toast('Use just the address, like https://orbit-sync.yourname.workers.dev', 'bad'); return; }
    S().helper = v || null; ui.helperEdit = false; Helper.st = null; Helper.err = null; Helper.at = 0; saveSettings(); render(true);
  },
  helpercancel: () => { ui.helperEdit = false; render(true); },
  helperedit: () => { ui.helperEdit = true; render(true); },
  helperrefresh: () => { Helper.refresh(true); },
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ui.tab === 'data') Helper.refresh(true); });
setInterval(() => { // Traffic is live while the Data screen is open: phone numbers every 2 s, the helper's every 15 s
  if (ui.tab !== 'data' || document.visibilityState !== 'visible') return;
  const el = $('#traffic'); if (el) keepAnchor(() => morphHTML(el, Helper.traffic())); // numbers change in place; nothing moves
  if (Date.now() - Helper.at > 15e3) Helper.refresh(true);
}, 2000);
GH.boot();
/* Update check: GitHub Pages and iOS can keep serving an older copy for a while. version.json is fetched past every cache;
   if it names a newer build, Today shows an Update ready button that reloads under a fresh URL. */
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const j = await r.json(); if (j.v && newerVer(j.v, APP_VERSION) && ui.update !== j.v) { ui.update = j.v; renderUpdate(); render(); }
  } catch (e) { }
}
checkUpdate(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); }); setInterval(checkUpdate, 15 * 60 * 1000);
if (ui.tab === 'data') render(true);
