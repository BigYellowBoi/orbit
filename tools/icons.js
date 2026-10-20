// Renders tools/icon.html to the icons at the repo root.
// Full-bleed square: apple-touch-icon, icon-192, icon-512 (maskable). Rounded tile on transparent: icon-any-*.png (desktop/taskbar).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path'), root = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const jobs = [[180, 'apple-touch-icon.png', ''], [192, 'icon-192.png', ''], [512, 'icon-512.png', ''],
    [32, 'icon-any-32.png', '?desktop'], [192, 'icon-any-192.png', '?desktop'], [512, 'icon-any-512.png', '?desktop']];
  for (const [s, f, q] of jobs) {
    const p = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: s / 1024 });
    await p.goto('file://' + path.join(__dirname, 'icon.html') + q);
    await p.screenshot({ path: path.join(root, f), clip: { x: 0, y: 0, width: 1024, height: 1024 }, omitBackground: true });
  }
  await b.close();
})();
