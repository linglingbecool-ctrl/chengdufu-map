// Read-only UI verification. Run against a local preview or POINT_PREVIEW_URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const points = JSON.parse(fs.readFileSync('points.json', 'utf8'));
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Users/lingling/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Isolate cloud writes; point content and images still load from the actual site.
    await page.route('**/cloudbase.full.js*', route => route.fulfill({contentType:'text/javascript', body:`window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('read-only image test')})},callFunction:async()=>({result:{ok:true,memories:[]}})})};`}));
    await page.goto(process.env.POINT_PREVIEW_URL || 'http://127.0.0.1:8775/', {waitUntil:'domcontentloaded'});
    await page.locator('#detailPointSelect').waitFor();
    assert.equal(await page.locator('.map-marker').count(), points.length);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height:900});
      for (const point of points) {
        await page.locator('#detailPointSelect').selectOption(point.id);
        const card = page.locator('.point-card--compact');
        assert.equal((await card.locator('.official-intro p').allTextContents()).map(s=>s.trim()).join('\n'), point.extended);
        assert.doesNotMatch(await card.innerText(), /资料说明/);
        assert.equal(await card.locator('.point-media img').count(), Number(!!point.oldImage)+Number(!!point.currentImage));
        await card.locator('.point-media img').evaluateAll(async images => {
          let timer;
          try {
            await Promise.race([
              Promise.all(images.map(async img => { img.loading='eager'; await img.decode(); if(!img.naturalWidth) throw Error(img.src); })),
              new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Point image loading timed out')), 15000); })
            ]);
          } finally { clearTimeout(timer); }
        });
        const sources = await card.locator('.point-media img').evaluateAll(images => images.map(img => new URL(img.src).pathname));
        for (const key of ['oldImage', 'currentImage']) if (point[key]) assert(sources.some(src => src.endsWith('/' + (point[key + 'Preview'] || point[key]))));
        if (point.imageAttribution) assert.equal(await card.locator('.point-media a').count(), 2);
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('#detailPointSelect').selectOption('zhaojuesi');
      await page.locator('.point-card--compact').screenshot({path:`/tmp/chengdu-point-media-${width}.png`});
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 29 point descriptions preserved; images decode; attribution links; no source-note section; desktop/mobile layouts.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
