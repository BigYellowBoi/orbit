// Renders tools/orbit-widget.js in Chromium through a small stand-in for Scriptable's drawing API, to check the layout.
// Fonts differ from iOS (no DIN Alternate or SF here), so check sizes on the phone. Run: PLAYWRIGHT=… node test/widget-preview.js out.png
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright'); const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../tools/orbit-widget.js'), 'utf8');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ deviceScaleFactor: 3, viewport: { width: 420, height: 220 } });
  await p.setContent('<body style="margin:0;background:#000"><canvas id=c width=1092 height=510 style="width:364px;height:170px;margin:20px 28px;border-radius:22px"></canvas>');
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.evaluate(async ({ src, data }) => {
    const cv = document.getElementById('c'), g = cv.getContext('2d'); g.scale(3, 3);
    window.Point = class { constructor(x, y) { this.x = x; this.y = y; } }; window.Size = class { constructor(w, h) { this.width = w; this.height = h; } };
    window.Rect = class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } };
    window.Color = class { constructor(h, a = 1) { this.css = h + Math.round(a * 255).toString(16).padStart(2, '0'); } };
    window.Font = class { constructor(n, s) { this.css = `700 ${s}px ${/DIN/.test(n) ? '"DejaVu Sans Condensed", "Arial Narrow", sans-serif' : 'system-ui, sans-serif'}`; this.size = s; } static boldSystemFont(s) { return new Font('sys', s); } };
    window.Path = class { constructor() { this.ops = []; } addLines(ps) { ps.forEach((q, i) => this.ops.push([i ? 'l' : 'm', q])); } closeSubpath() { this.ops.push(['z']); } addRoundedRect(r, a) { this.ops.push(['rr', r, a]); } };
    window.DrawContext = class { constructor() { this.al = 'left'; } addPath(p) { g.beginPath(); for (const [o, q] of p.ops) o === 'm' ? g.moveTo(q.x, q.y) : o === 'l' ? g.lineTo(q.x, q.y) : o === 'rr' ? g.roundRect(q.x, q.y, q.width, q.height, 1.8) : g.closePath(); }
      setStrokeColor(c) { g.strokeStyle = c.css; } setFillColor(c) { g.fillStyle = c.css; } setLineWidth(w) { g.lineWidth = w; } strokePath() { g.lineCap = 'butt'; g.stroke(); } fillPath() { g.fill(); }
      fillRect(r) { g.fillRect(r.x, r.y, r.width, r.height); } fillEllipse(r) { g.beginPath(); g.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, 7); g.fill(); }
      setFont(f) { this.f = f; } setTextColor(c) { this.tc = c.css; } setTextAlignedLeft() { this.al = 'left'; } setTextAlignedRight() { this.al = 'right'; } setTextAlignedCenter() { this.al = 'center'; }
      drawTextInRect(s, r) { g.font = this.f.css; g.fillStyle = this.tc; g.textAlign = this.al; g.textBaseline = 'alphabetic'; g.fillText(s, this.al === 'left' ? r.x : this.al === 'right' ? r.x + r.width : r.x + r.width / 2, r.y + 0.95 * this.f.size); }
      getImage() { return 'img'; } };
    const font = f => f.css; // a DOM version of Scriptable's stacks, laid over the canvas
    class Stack { constructor(el) { this.el = el; el.style.cssText += ';display:flex;flex-direction:row;align-items:center;min-width:0'; }
      addStack() { const e = document.createElement('div'); this.el.appendChild(e); return new Stack(e); } layoutVertically() { this.el.style.flexDirection = 'column'; this.el.style.alignItems = 'stretch'; }
      addSpacer(n) { const e = document.createElement('div'); e.style.flex = n == null ? '1 1 auto' : `0 0 ${n}px`; this.el.appendChild(e); }
      addText(s) { const e = document.createElement('span'); e.textContent = s; e.style.whiteSpace = 'pre'; this.el.appendChild(e); const t = {}; return new Proxy(t, { set(o, k, v) { if (k === 'font') e.style.font = font(v); if (k === 'textColor') e.style.color = v.css; o[k] = v; return true; } }); }
      set size(z) { if (z.width) this.el.style.width = z.width + 'px'; if (z.height) this.el.style.height = z.height + 'px'; this.el.style.flex = '0 0 auto'; }
      bottomAlignContent() { this.el.style.alignItems = 'flex-end'; } topAlignContent() { this.el.style.alignItems = 'flex-start'; } centerAlignContent() { this.el.style.alignItems = 'center'; } setPadding() {} }
    window.ListWidget = class extends Stack { constructor() { const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:28px;top:20px;width:364px;height:170px'; document.body.appendChild(e); super(e); this.layoutVertically(); } async presentMedium() {} };
    window.Keychain = { contains: () => true, get: () => '{"url":"x","key":"k"}', remove() {}, set() {} };
    window.Request = class { async loadJSON() { return data; } }; window.FileManager = { local: () => ({ joinPath: (a, b) => b, documentsDirectory: () => '', writeString() {}, fileExists: () => false }) };
    window.config = { runsInApp: true, runsInWidget: false }; window.args = {}; window.Script = { setWidget() {}, complete() {} };
    await (new Function(`return (async () => { ${src} })()`))();
  }, { src, data: { d: '2026-11-15', rec: 46, str: 15.4, hrv: 101, kb: 2371, streak: 730, rot: { k: 2, n: 4 }, bb: 50 } });
  await p.screenshot({ path: process.argv[2] || 'widget.png', clip: { x: 20, y: 12, width: 380, height: 186 } });
  console.log(errs.length ? errs : 'rendered'); await b.close();
})();
