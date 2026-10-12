// Renders tools/icon.html to the home-screen icons at the repo root.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path'), root = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  for (const s of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: s / 1024 });
    await p.goto('file://' + path.join(__dirname, 'icon.html'));
    await p.screenshot({ path: path.join(root, s === 180 ? 'apple-touch-icon.png' : `icon-${s}.png`), clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  }
  await b.close();
})();
