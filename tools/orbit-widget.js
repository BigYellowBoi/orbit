// Orbit home screen widget for Scriptable (medium, 4 x 2): recovery, strain, HRV, calories, the Orbit streak, the
// rotation mark and Garmin Body Battery, from the Orbit sync helper's /widget route (worker/orbit-sync.js). Laid out from his WHOOP widget
// screenshot (15 Nov 2026), measured in points on a 364 x 170 medium widget.
// Setup: paste into a new Scriptable script, run it once in the app and enter the helper address and SYNC_KEY
// (kept in the iOS Keychain, never in this file), then add a medium Scriptable widget and pick this script.
// To change the address or key later, run it in the app with the widget parameter "reset".
const KC = 'orbit-widget', CACHE = 'orbit-widget.json', OPEN = 'https://bigyellowboi.github.io/orbit/';
const W = 364, H = 170;
const C = { bg0: '#383f45', bg1: '#1b1f22', track: '#43474a', blue: '#428fdb', grey: '#95999b', white: '#ffffff', purple: '#b388ff', purpleIn: '#e2d3ff', markOff: '#4b535d',
  green: '#16ec06', yellow: '#f5de54', red: '#ff0026' };
const FLAME = [[[12.6,2.3],[12.66,3.15],[12.61,4],[12.44,4.83],[12.15,5.63],[11.75,6.38],[11.28,7.09],[10.75,7.75],[10.18,8.39],[9.6,9.01],[9.02,9.63],[8.46,10.28],[7.95,10.95],[7.49,11.67],[7.11,12.43],[6.83,13.24],[6.66,14.07],[6.6,14.92],[6.65,15.77],[6.84,16.59],[7.15,17.38],[7.59,18.11],[8.13,18.77],[8.77,19.33],[9.49,19.78],[10.27,20.12],[11.1,20.32],[11.95,20.4],[12.79,20.34],[13.62,20.15],[14.41,19.83],[15.14,19.39],[15.79,18.85],[16.35,18.2],[16.8,17.48],[17.13,16.7],[17.33,15.87],[17.4,15.03],[17.35,14.18],[17.2,13.34],[16.96,12.53],[16.62,11.75],[16.2,11],[15.72,10.3],[15.34,10.23],[15.09,11.04],[14.68,11.78],[14.09,12.39],[13.63,12.43],[13.68,11.58],[13.7,10.73],[13.68,9.88],[13.63,9.03],[13.55,8.18],[13.45,7.33],[13.34,6.49],[13.21,5.65],[13.07,4.81],[12.91,3.97],[12.76,3.14]],[[12,21],[11.61,20.98],[11.23,20.9],[10.87,20.78],[10.52,20.61],[10.2,20.4],[9.9,20.14],[9.64,19.86],[9.42,19.54],[9.25,19.19],[9.12,18.83],[9.03,18.45],[9,18.07],[9.02,17.68],[9.07,17.3],[9.18,16.92],[9.32,16.57],[9.51,16.22],[9.71,15.9],[9.95,15.59],[10.19,15.29],[10.45,15],[10.71,14.72],[10.97,14.43],[11.11,14.73],[11.27,15.08],[11.47,15.41],[11.71,15.72],[11.99,15.99],[12.3,16.21],[12.65,16.38],[12.78,16.07],[12.83,15.69],[12.85,15.3],[12.83,14.92],[12.77,14.53],[12.74,14.23],[13.05,14.46],[13.35,14.7],[13.63,14.97],[13.89,15.25],[14.14,15.55],[14.36,15.87],[14.55,16.2],[14.71,16.56],[14.84,16.92],[14.93,17.3],[14.99,17.68],[15,18.07],[14.97,18.45],[14.88,18.83],[14.75,19.19],[14.58,19.54],[14.36,19.86],[14.1,20.14],[13.8,20.4],[13.48,20.61],[13.13,20.78],[12.77,20.9],[12.39,20.98]]]; // Orbit's flame icon (24-unit box): outer shape, inner tongue

async function settings() {
  if (args.widgetParameter === 'reset' && config.runsInApp) Keychain.remove(KC);
  if (Keychain.contains(KC)) return JSON.parse(Keychain.get(KC));
  if (!config.runsInApp) return null;
  const a = new Alert(); a.title = 'Orbit widget'; a.message = 'Your Orbit sync helper address (as on Orbit’s Data screen) and its SYNC_KEY.';
  a.addTextField('https://orbit-sync.….workers.dev'); a.addSecureTextField('SYNC_KEY'); a.addAction('Save'); a.addCancelAction('Cancel');
  if (await a.present() === -1) return null;
  const c = { url: a.textFieldValue(0).trim().replace(/\/+$/, ''), key: a.textFieldValue(1).trim() };
  Keychain.set(KC, JSON.stringify(c)); return c;
}
async function load(c) { // fresh numbers, or the last good ones when offline
  const fm = FileManager.local(), p = fm.joinPath(fm.documentsDirectory(), CACHE);
  try {
    const r = new Request(c.url + '/widget'); r.headers = { 'x-sync-key': c.key }; r.timeoutInterval = 15;
    const j = await r.loadJSON(); if (j && j.d) { fm.writeString(p, JSON.stringify(j)); return j; }
  } catch (e) {}
  return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : null;
}

const recCol = r => r == null ? C.grey : r >= 67 ? C.green : r >= 34 ? C.yellow : C.red;
const track = s => s.split('').join(' '); // WHOOP's letter-spaced labels
const num = (v, d = 0) => v == null ? '–' : Number(v).toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
function txt(dc, s, font, size, color, x, capTop, align) { // x: the right edge (right), left edge (left) or centre; capTop: top of the capitals
  dc.setFont(font); dc.setTextColor(new Color(color));
  const y = capTop - 0.24 * size, w = 220, r = align === 'right' ? new Rect(x - w, y, w, size * 1.5) : align === 'center' ? new Rect(x - w / 2, y, w, size * 1.5) : new Rect(x, y, w, size * 1.5);
  if (align === 'right') dc.setTextAlignedRight(); else if (align === 'center') dc.setTextAlignedCenter(); else dc.setTextAlignedLeft();
  dc.drawTextInRect(s, r);
}
function arc(dc, cx, cy, r, f0, f1, color, width, alpha = 1) { // fractions of a turn from 12 o'clock, clockwise (DrawContext has no arcs, so short lines)
  if (f1 <= f0) return; const pts = [], n = Math.max(2, Math.ceil((f1 - f0) * 180));
  for (let i = 0; i <= n; i++) { const a = (f0 + (f1 - f0) * i / n) * 2 * Math.PI; pts.push(new Point(cx + r * Math.sin(a), cy - r * Math.cos(a))); }
  const p = new Path(); p.addLines(pts); dc.addPath(p); dc.setStrokeColor(new Color(color, alpha)); dc.setLineWidth(width); dc.strokePath();
}
function poly(dc, pts, x, y, s, color) { const p = new Path(); p.addLines(pts.map(([a, b]) => new Point(x + a * s, y + b * s))); p.closeSubpath(); dc.addPath(p); dc.setFillColor(new Color(color)); dc.fillPath(); }

function draw(d) {
  const dc = new DrawContext(); dc.size = new Size(W, H); dc.respectScreenScale = true;
  const din = s => new Font('DINAlternate-Bold', s), lab = s => Font.boldSystemFont(s);
  // background: WHOOP's diagonal grey, lighter top left (bands across the diagonal; DrawContext has no gradients)
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  for (let i = 0, N = 90; i < N; i++) { const c0 = i / N * 2, c1 = (i + 1.6) / N * 2, p = new Path();
    p.addLines([new Point(W * (c0 + 1), -H), new Point(W * (c1 + 1), -H), new Point(W * (c1 - 2), 2 * H), new Point(W * (c0 - 2), 2 * H)]); p.closeSubpath();
    dc.addPath(p); dc.setFillColor(new Color(mix(C.bg0, C.bg1, (i + .5) / N))); dc.fillPath(); }
  // streak: flame + count, top left
  poly(dc, FLAME[0], 19 - 6.6 * 0.646, 21.5 - 2.3 * 0.646, 0.646, C.purple); poly(dc, FLAME[1], 19 - 6.6 * 0.646, 21.5 - 2.3 * 0.646, 0.646, C.purpleIn);
  txt(dc, d ? String(d.streak ?? 0) : '–', din(11), 11, C.white, 32.8, 22.7, 'left');
  // Body Battery (Garmin), top right where WHOOP shows its strap battery: the number and a figure filled up to it from the
  // bottom (a body being charged, so it doesn't read as the watch's battery). No clipping in DrawContext, so each part is
  // a polygon cut at the fill line by hand.
  if (d?.bb != null) { const lv = Math.max(0, Math.min(100, d.bb)) / 100, fx = 342.3, top = 20.4, bot = 31.6;
    txt(dc, String(Math.round(d.bb)), din(11), 11, C.white, 335.4, 22.7, 'right');
    const ring = (cx0, cy0, rx, ry, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx0 + rx * Math.cos(a), cy0 + ry * Math.sin(a)]; });
    const head = ring(fx, top + 2.45, 2.45, 2.45, 0, 2 * Math.PI), body = ring(fx, bot, 4.7, 5.4, Math.PI, 2 * Math.PI).concat([[fx + 4.7, bot], [fx - 4.7, bot]]);
    const below = (pts, yl) => { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = a[1] >= yl, ib = b[1] >= yl; // keep the part under the fill line
      if (ia) o.push(a); if (ia !== ib) { const t = (yl - a[1]) / (b[1] - a[1]); o.push([a[0] + (b[0] - a[0]) * t, yl]); } } return o; };
    const fill = (pts, col, al) => { if (pts.length < 3) return; const p = new Path(); p.addLines(pts.map(([x, y]) => new Point(x, y))); p.closeSubpath(); dc.addPath(p); dc.setFillColor(new Color(col, al)); dc.fillPath(); };
    const yl = bot - lv * (bot - top); for (const sh of [head, body]) { fill(sh, C.white, 0.12); fill(below(sh, yl), C.white, 1);
      const o = new Path(); o.addLines(sh.map(([x, y]) => new Point(x, y))); o.closeSubpath(); dc.addPath(o); dc.setStrokeColor(new Color(C.white, 0.85)); dc.setLineWidth(1); dc.strokePath(); } }
  // rings: strain outside (of 21), recovery inside, both from 12 o'clock
  const cx = 181.7, cy = 81.9, rc = recCol(d?.rec);
  arc(dc, cx, cy, 51.6, 0, 1, C.track, 6.6); arc(dc, cx, cy, 51.6, 0, Math.min(1, (d?.str || 0) / 21), C.blue, 6.6);
  arc(dc, cx, cy, 40.1, 0, 1, C.track, 7); arc(dc, cx, cy, 40.1, 0, Math.min(1, (d?.rec || 0) / 100), rc, 7);
  // centre: Orbit's mark, as in the app's header (one segment per rotation slot, done ones purple, round ends; no glow, since DrawContext can't blur)
  const n = d?.rot?.n || 4, k = d?.rot?.k ?? 0, r = 9.75, sw = 2.6, gap = n > 1 ? Math.min(25, 360 / n * 0.35) / 360 : 0;
  const end = (f, col, wd, al) => { const a = f * 2 * Math.PI, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a); dc.setFillColor(new Color(col, al)); dc.fillEllipse(new Rect(x - wd / 2, y - wd / 2, wd, wd)); };
  const seg = (a0, a1, col, wd, al) => { arc(dc, cx, cy, r, a0, a1, col, wd, al); end(a0, col, wd, al); end(a1, col, wd, al); };
  for (let i = 0; i < n; i++) { const a0 = i / n + gap / 2, a1 = (i + 1) / n - gap / 2; seg(a0, a1, i < k ? C.purple : C.markOff, sw, 1); }
  dc.setFillColor(new Color('#e8ebef')); dc.fillEllipse(new Rect(cx - 2.8, cy - 2.8, 5.6, 5.6));
  if (!d) txt(dc, 'Run in Scriptable to set up', lab(10), 10, C.grey, cx, 152, 'center');
  return dc.getImage();
}

const c = await settings(), data = c ? await load(c) : null;
const w = new ListWidget(); w.setPadding(0, 0, 0, 0); w.backgroundColor = new Color(C.bg1);
w.backgroundImage = draw(data);
// the side columns are real text (Scriptable lays it out, so the number and its % can't collide), placed over the rings
const din = s => new Font('DINAlternate-Bold', s), lab = s => Font.boldSystemFont(s), rc = recCol(data?.rec);
const line = (col, right, parts) => { const l = col.addStack(); l.bottomAlignContent(); if (right) l.addSpacer();
  for (const [s, f, c] of parts) { const t = l.addText(s); t.font = f; t.textColor = new Color(c); t.lineLimit = 1; } if (!right) l.addSpacer(); };
w.addSpacer(48.5);
const row = w.addStack(); row.size = new Size(W, 0); row.topAlignContent();
const col = (x, wd, right, rows) => { const c = row.addStack(); c.layoutVertically(); c.size = new Size(wd, 0);
  rows.forEach(([gap, parts]) => { if (gap) c.addSpacer(gap); line(c, right, parts); }); return c; };
col(0, 109.8, true, [[0, [[num(data?.rec), din(17.3), rc], ['%', din(13), rc]]], [0.7, [[track('RECOVERY'), lab(10.3), rc]]],
  [9.2, [[track('HRV'), lab(10.3), C.grey]]], [2.7, [[num(data?.hrv), din(14.6), C.grey]]]]);
row.addSpacer(252.9 - 109.8);
col(252.9, W - 252.9, false, [[0, [[num(data?.str, 1), din(17.3), C.blue]]], [0.7, [[track('STRAIN'), lab(10.3), C.blue]]],
  [9.2, [[track('CALORIES'), lab(10.3), C.grey]]], [2.7, [[num(data?.kb), din(14.6), C.grey]]]]);
w.addSpacer(); w.url = OPEN; w.refreshAfterDate = new Date(Date.now() + 10 * 60e3);
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
