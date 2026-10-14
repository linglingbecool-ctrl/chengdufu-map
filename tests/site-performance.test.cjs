// Controlled before/after test, no production writes. Uses the pre-optimization
// release and a delayed local SDK stub; numbers are not a real-user speed claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.env.PERF_BASE_REF || '6b32ed6';
const changed = new Set(['index.html', 'script.js', 'ai-guide.js', 'style.css', 'points.json']);
const sdkURL = 'https://static.cloudbase.net/cloudbase-js-sdk/3.7.1/cloudbase.full.js';
const sdkStub = `window.__sdkLoadedAt=performance.now();window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('isolated performance test')})},callFunction:async()=>({result:{ok:true,answer:'test answer'}})})};`;
async function serve(old) {
  let pointRequests = 0;
  const server = http.createServer(async (req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (file.includes('..')) { res.writeHead(400).end(); return; }
    if (file === 'points.json') pointRequests++;
    try {
      let body;
      if (file === 'test-sdk.js') {
        await new Promise(resolve => setTimeout(resolve, 2500));
        body = Buffer.from(sdkStub);
      } else body = old && changed.has(file)
        ? execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root })
        : fs.readFileSync(path.join(root, file));
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=600');
      if (['.html', '.js', '.css', '.json'].includes(ext)) {
        body = zlib.gzipSync(body.toString().replaceAll(sdkURL, '/test-sdk.js'));
        res.setHeader('Content-Encoding', 'gzip');
      }
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/`, points: () => pointRequests };
}
async function measure(browser, site, old) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 512000, uploadThroughput: 128000 });
    await page.goto(site.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#detailPointSelect').waitFor();
    const ready = await page.evaluate(() => ({ ms: performance.now(), sdk: Boolean(window.cloudbase) }));
    if (!old) assert.equal(ready.sdk, false, 'Map must be usable while SDK is still downloading');
    await page.waitForFunction(() => window.cloudbase);
    await page.waitForLoadState('networkidle');
    const started = Date.now();
    await page.locator('#detailPointSelect').selectOption('jiulidi');
    await page.locator('.point-media img').evaluateAll(images => Promise.all(images.map(img => { img.loading = 'eager'; return img.decode(); })));
    const pointMs = Date.now() - started;
    if (!old) {
      assert.equal(await page.evaluate(() => document.querySelectorAll('script[src="/test-sdk.js"]').length), 1);
      const requests = site.points();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#detailPointSelect').waitFor();
      assert.equal(site.points(), requests, 'Reload should reuse versioned points.json from browser cache');
    }
    assert.deepEqual(errors, []);
    return { mapReadyMs: Math.round(ready.ms), sdkLoadedWhenMapReady: ready.sdk, pointImageMs: pointMs };
  } finally { await context.close(); }
}
(async () => {
  const points = JSON.parse(fs.readFileSync(path.join(root, 'points.json')));
  const original = JSON.parse(execFileSync('git', ['show', `${baseline}:points.json`], { cwd: root }));
  assert.deepEqual(points.map(({ oldImagePreview, currentImagePreview, ...p }) => p), original, 'Original content and image paths must not change');
  for (const p of points) for (const key of ['oldImagePreview', 'currentImagePreview']) {
    if (p[key]) assert(fs.statSync(path.join(root, p[key])).size < 250000, `${p.id}: card image over budget`);
  }
  const oldSite = await serve(true), newSite = await serve(false);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/Users/lingling/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
  const deadline = setTimeout(() => browser.close(), 55000);
  try {
    const before = await measure(browser, oldSite, true), after = await measure(browser, newSite, false);
    assert(after.mapReadyMs < before.mapReadyMs, 'Map startup should improve under the same slow-SDK conditions');
    assert(after.pointImageMs < before.pointImageMs, 'Point image transfer should improve');
    console.log('PASS: unchanged content, image budgets, non-blocking SDK, one SDK request, warm points cache.');
    console.log(JSON.stringify({ conditions: '80ms latency, 512KB/s download, SDK delayed 2500ms; isolated local test', before, after }, null, 2));
  } finally {
    clearTimeout(deadline);
    await browser.close();
    oldSite.server.close(); newSite.server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
