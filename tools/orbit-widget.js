// Orbit home screen widget for Scriptable (medium, 4 x 2): recovery, strain, HRV, calories, the Orbit streak, the
// rotation mark and Garmin Body Battery, from the Orbit sync helper's /widget route (worker/orbit-sync.js). Laid out from his WHOOP widget
// screenshot (15 Nov 2026), measured in points on a 364 x 170 medium widget.
// Setup: paste into a new Scriptable script, run it once in the app and enter the helper address and SYNC_KEY
// (kept in the iOS Keychain, never in this file), then add a medium Scriptable widget and pick this script.
// To change the address or key later, run it in the app with the widget parameter "reset".
// No tap URL: Safari can't open the home screen web app. iOS always opens Scriptable on a widget tap, so keep the
// widget's When Interacting setting on Open App.
const KC = 'orbit-widget', CACHE = 'orbit-widget.json';
const W = 364, H = 170; // the layout below is measured on a 364 x 170 pt widget
// Sharpness. The canvas is sized in POINTS with respectScreenScale on, so getImage() returns a true @3x image (scale 3,
// e.g. 1092 x 510 px) that iOS maps 1:1 onto screen pixels. The old way (a big canvas in pixels, respectScreenScale off)
// gave a scale-1 image that iOS treats as ~1274 pt wide and resamples down, and Scriptable/WidgetKit also shrink oversized
// widget images, so it stayed soft whatever K was.
// WIDGET_W: the widget's real width in points. Large home screen icons make it bigger than 364. To measure: take a home
// screen screenshot, measure the widget's width in pixels, divide by 3. The whole layout scales to fit exactly.
const WIDGET_W = 364;
const K = WIDGET_W / W, P = (x, y) => new Point(x * K, y * K), RR = (x, y, w, h) => new Rect(x * K, y * K, w * K, h * K);
const SC = Device.screenScale(); // 3 on current iPhones
const PALETTE = 'whoop'; // 'whoop': yellow, blue and grey as sampled from the WHOOP widget; 'orbit': the app's own (--warn, --strain, --ink-2)
// v1.105: WHOOP's colours converted from his screenshots' Display P3 to sRGB (Scriptable draws in sRGB); green and red were already sRGB
const C = { bg0: '#363f46', bg1: '#1a1f22', track: '#42474a', blue: '#0792e6', grey: '#94999b', white: '#ffffff', purple: '#b388ff', purpleIn: '#e2d3ff', markOff: '#4b535d',
  green: '#16ec06', yellow: '#ffde00', red: '#ff0026' };
if (PALETTE === 'orbit') Object.assign(C, { yellow: '#ffde00', blue: '#0093e7', grey: '#a5adb8' });
// Text weight. iOS has no DIN as heavy or wide as WHOOP's, so all text is drawn into the image: each string is drawn
// a few times shifted right by up to FAUX points (thicker strokes), then stretched sideways by STRETCH (wider letters).
// Each string is drawn at TK = 2x screen pixels first and shrunk into place, so the 1.15 stretch never upsamples.
const FAUX = 0.5, STRETCH = 1.15, TK = 2 * SC * K;
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
function txt(dc, s, ff, size, color, x, capTop, align, stretch = STRETCH) { // ff: (size, px per pt) => Font; x: the right edge (right), left edge (left) or centre; capTop: top of the capitals
  const tw = 240, th = Math.ceil(size * 1.6), t = new DrawContext(); t.size = new Size(tw * TK, th * TK); t.opaque = false; t.respectScreenScale = false;
  t.setFont(ff(size, TK)); t.setTextColor(new Color(color));
  if (align === 'right') t.setTextAlignedRight(); else if (align === 'center') t.setTextAlignedCenter(); else t.setTextAlignedLeft();
  for (const o of FAUX ? [0, FAUX / 2, FAUX] : [0]) t.drawTextInRect(s, new Rect(o * TK, 0, (tw - FAUX) * TK, th * TK));
  const w = tw * stretch, rx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  dc.drawImageInRect(t.getImage(), RR(rx, capTop - 0.24 * size, w, th));
}
function arc(dc, cx, cy, r, f0, f1, color, width, alpha = 1) { // fractions of a turn from 12 o'clock, clockwise (DrawContext has no arcs, so short lines)
  if (f1 <= f0) return; const pts = [], n = Math.max(2, Math.ceil((f1 - f0) * 180));
  for (let i = 0; i <= n; i++) { const a = (f0 + (f1 - f0) * i / n) * 2 * Math.PI; pts.push(P(cx + r * Math.sin(a), cy - r * Math.cos(a))); }
  const p = new Path(); p.addLines(pts); dc.addPath(p); dc.setStrokeColor(new Color(color, alpha)); dc.setLineWidth(width * K); dc.strokePath();
}
function band(dc, cx, cy, r, width, f0, f1, color, rc = 1.2, alpha = 1) { // a filled ring segment with slightly rounded corners, as WHOOP's
  if (f1 - f0 < 1e-4) return; const ro = r + width / 2, ri = r - width / 2, A = f => f * 2 * Math.PI;
  rc = Math.min(rc, width / 2, (f1 - f0) * Math.PI * ri); const a0 = A(f0), a1 = A(f1), dO = rc / ro, dI = rc / ri;
  const Q = (rr, a) => P(cx + rr * Math.sin(a), cy - rr * Math.cos(a)), p = new Path(), n = Math.max(2, Math.ceil((f1 - f0) * 360));
  p.move(Q(ro, a0 + dO)); for (let i = 1; i <= n; i++) p.addLine(Q(ro, a0 + dO + (a1 - a0 - 2 * dO) * i / n));
  p.addQuadCurve(Q(ro - rc, a1), Q(ro, a1)); p.addLine(Q(ri + rc, a1)); p.addQuadCurve(Q(ri, a1 - dI), Q(ri, a1));
  for (let i = 1; i <= n; i++) p.addLine(Q(ri, a1 - dI - (a1 - a0 - 2 * dI) * i / n));
  p.addQuadCurve(Q(ri + rc, a0), Q(ri, a0)); p.addLine(Q(ro - rc, a0)); p.addQuadCurve(Q(ro, a0 + dO), Q(ro, a0)); p.closeSubpath();
  dc.addPath(p); dc.setFillColor(new Color(color, alpha)); dc.fillPath();
}
function poly(dc, pts, x, y, s, color) { const p = new Path(); p.addLines(pts.map(([a, b]) => P(x + a * s, y + b * s))); p.closeSubpath(); dc.addPath(p); dc.setFillColor(new Color(color)); dc.fillPath(); }

function draw(d) {
  const dc = new DrawContext(); dc.respectScreenScale = true; dc.size = new Size(W * K, H * K); // points, rendered @SC
  const din = (s, k = K) => new Font('DINAlternate-Bold', s * k), lab = (s, k = K) => Font.boldSystemFont(s * k);
  // background: WHOOP's diagonal grey, lighter top left (bands across the diagonal; DrawContext has no gradients)
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  for (let i = 0, N = 90; i < N; i++) { const c0 = i / N * 2, c1 = (i + 1.6) / N * 2, p = new Path();
    p.addLines([P(W * (c0 + 1), -H), P(W * (c1 + 1), -H), P(W * (c1 - 2), 2 * H), P(W * (c0 - 2), 2 * H)]); p.closeSubpath();
    dc.addPath(p); dc.setFillColor(new Color(mix(C.bg0, C.bg1, (i + .5) / N))); dc.fillPath(); }
  // streak: flame + count, top left
  poly(dc, FLAME[0], 19 - 6.6 * 0.646, 21.5 - 2.3 * 0.646, 0.646, C.purple); poly(dc, FLAME[1], 19 - 6.6 * 0.646, 21.5 - 2.3 * 0.646, 0.646, C.purpleIn);
  txt(dc, d ? String(d.streak ?? 0) : '–', din, 11, C.white, 32.8, 23.6, 'left'); // caps centred on the flame (21.5 to 33.6)
  // Body Battery (Garmin), top right where WHOOP shows its strap battery: the number and a figure filled up to it from the
  // bottom (a body being charged, so it doesn't read as the watch's battery). No clipping in DrawContext, so each part is
  // a polygon cut at the fill line by hand.
  if (d?.bb != null) { const lv = Math.max(0, Math.min(100, d.bb)) / 100, fx = 342.3, top = 20.4, bot = 31.6;
    txt(dc, String(Math.round(d.bb)), din, 11, C.white, 335.4, 22.7, 'right');
    const ring = (cx0, cy0, rx, ry, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx0 + rx * Math.cos(a), cy0 + ry * Math.sin(a)]; });
    const head = ring(fx, top + 2.45, 2.45, 2.45, 0, 2 * Math.PI), body = ring(fx, bot, 4.7, 5.4, Math.PI, 2 * Math.PI).concat([[fx + 4.7, bot], [fx - 4.7, bot]]);
    const below = (pts, yl) => { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = a[1] >= yl, ib = b[1] >= yl; // keep the part under the fill line
      if (ia) o.push(a); if (ia !== ib) { const t = (yl - a[1]) / (b[1] - a[1]); o.push([a[0] + (b[0] - a[0]) * t, yl]); } } return o; };
    const fill = (pts, col, al) => { if (pts.length < 3) return; const p = new Path(); p.addLines(pts.map(([x, y]) => P(x, y))); p.closeSubpath(); dc.addPath(p); dc.setFillColor(new Color(col, al)); dc.fillPath(); };
    const yl = bot - lv * (bot - top); for (const sh of [head, body]) { fill(sh, C.white, 0.12); fill(below(sh, yl), C.white, 1);
      const o = new Path(); o.addLines(sh.map(([x, y]) => P(x, y))); o.closeSubpath(); dc.addPath(o); dc.setStrokeColor(new Color(C.white, 0.85)); dc.setLineWidth(1 * K); dc.strokePath(); } }
  // rings: strain outside (of 21), recovery inside, both from 12 o'clock
  const cx = 181.7, cy = 81.9, rc = recCol(d?.rec);
  arc(dc, cx, cy, 51.6, 0, 1, C.track, 6.6); band(dc, cx, cy, 51.6, 6.6, 0, Math.min(1, (d?.str || 0) / 21), C.blue);
  arc(dc, cx, cy, 40.1, 0, 1, C.track, 7); band(dc, cx, cy, 40.1, 7, 0, Math.min(1, (d?.rec || 0) / 100), rc);
  // centre: Orbit's mark, as in the app's header (one segment per rotation slot, done ones purple, round ends)
  const n = d?.rot?.n || 4, k = d?.rot?.k ?? 0, r = 9.75, sw = 2.6, gap = n > 1 ? Math.min(25, 360 / n * 0.35) / 360 : 0;
  // glow on the purple (done) segments only, a soft halo like the header logo's. DrawContext can't blur, so it is GL
  // see-through purple outlines of each done segment, each GLOW / GL wider: they stack to ~.2 at its edge and fade out.
  const GLOW = 1.8, GL = 6, GA = 0.04;
  for (let j = GL; j >= 1; j--) { const gw = sw + 2 * GLOW * j / GL, ext = gw / 2 / (2 * Math.PI * r);
    for (let i = 0; i < Math.min(k, n); i++) band(dc, cx, cy, r, gw, i / n + gap / 2 - ext, (i + 1) / n - gap / 2 + ext, C.purple, gw / 2, GA); }
  const end = (f, col, wd, al) => { const a = f * 2 * Math.PI, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a); dc.setFillColor(new Color(col, al)); dc.fillEllipse(RR(x - wd / 2, y - wd / 2, wd, wd)); };
  const seg = (a0, a1, col, wd, al) => { arc(dc, cx, cy, r, a0, a1, col, wd, al); end(a0, col, wd, al); end(a1, col, wd, al); };
  for (let i = 0; i < n; i++) { const a0 = i / n + gap / 2, a1 = (i + 1) / n - gap / 2; seg(a0, a1, i < k ? C.purple : C.markOff, sw, 1); }
  dc.setFillColor(new Color('#e8ebef')); dc.fillEllipse(RR(cx - 2.8, cy - 2.8, 5.6, 5.6));
  // side columns, measured from the WHOOP widget screenshot. R: right edge of the left column; L: left edge of the right one.
  // The % is drawn on its own at R and the number right-aligned PCT_W before it, so they can't collide.
  const R = 110, L = 253.5, NUM = 17.6, PCT = 13, PCT_W = 8.5, LAB = 10.4, VAL = 14.9, base = 52.8 + 0.7 * NUM;
  txt(dc, num(d?.rec), din, NUM, rc, R - PCT_W, 52.8, 'right'); txt(dc, '%', din, PCT, rc, R, base - 0.7 * PCT, 'right');
  txt(dc, track('RECOVERY'), din, LAB, rc, R, 72.8, 'right');
  txt(dc, track('HRV'), din, LAB, C.grey, R, 94.3, 'right'); txt(dc, num(d?.hrv), din, VAL, C.grey, R, 110.4, 'right');
  txt(dc, num(d?.str, 1), din, NUM, C.blue, L, 52.8, 'left'); txt(dc, track('STRAIN'), din, LAB, C.blue, L, 72.8, 'left');
  txt(dc, track('CALORIES'), din, LAB, C.grey, L, 94.3, 'left'); txt(dc, num(d?.kb), din, VAL, C.grey, L, 110.4, 'left');
  if (!d) txt(dc, 'Run in Scriptable to set up', lab, 10, C.grey, cx, 152, 'center');
  return dc.getImage();
}

const c = await settings(), data = c ? await load(c) : null;
const w = new ListWidget(); w.setPadding(0, 0, 0, 0); w.backgroundColor = new Color(C.bg1);
w.backgroundImage = draw(data);
w.addSpacer(); w.refreshAfterDate = new Date(Date.now() + 10 * 60e3);
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();