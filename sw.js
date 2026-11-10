/* Orbit service worker (v1.79, Pages only): lets the home-screen app open with no signal.
   - The page: network first, so a new build arrives exactly as before; the last good copy is kept and used when the
     network fails or takes over 4 s.
   - Icons, manifest and vendor/ libraries: from the cache once fetched (new build = new cache, so they refresh then).
   - Google Fonts: the cached copy straight away, refreshed in the background.
   - Everything else (GitHub, the sync helper, friends' files, version.json) is left alone: always the network. */
const VER = '1.79', CACHE = 'orbit-' + VER, SHELL = ['./', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-any-32.png', 'icon-any-192.png', 'icon-192.png'];
const PAGE = new URL('./', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('orbit-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function page(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req).then(r => { if (r.ok) c.put(PAGE, r.clone()); return r; });
  const slow = new Promise(res => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, slow]); if (r) return r;
    const hit = await c.match(PAGE) || await caches.match(PAGE, { ignoreSearch: true }); // an older build's copy beats a blank screen
    return hit || await net;
  } catch (err) {
    const hit = await c.match(PAGE) || await caches.match(PAGE, { ignoreSearch: true });
    if (hit) return hit; throw err;
  }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit;
  const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r;
}
async function fonts(req, e) {
  const c = await caches.open('fonts-v1'), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
  if (hit) { e.waitUntil(net.catch(() => { })); return hit; }
  return net;
}
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url); if (req.method !== 'GET') return;
  if (req.mode === 'navigate' && u.origin === location.origin) { e.respondWith(page(req)); return; }
  if (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com') { e.respondWith(fonts(req, e)); return; }
  if (u.origin === location.origin && (/\/vendor\//.test(u.pathname) || /\.(png|webmanifest)$/.test(u.pathname))) { e.respondWith(cacheFirst(req)); return; }
});
