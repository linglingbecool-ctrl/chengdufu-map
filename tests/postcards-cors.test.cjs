// Run with Playwright available via NODE_PATH; uses only local HTTP servers.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const requests = [];
const photo = fs.readFileSync(path.join(root, 'sichuandaxue-current.jpeg'));
const images = http.createServer((req, res) => {
  requests.push({path: req.url, cors: Boolean(req.headers.origin)});
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  // Intentionally omit Vary: Origin to reproduce the gallery cache failure.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.url === '/broken.jpg') {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', 'image/jpeg');res.end(photo);
});
const site = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.jpeg':'image/jpeg'};
  fs.readFile(file, (err, data) => {
    if (err) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');res.end(data);
  });
});
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', r));
(async () => {
  await Promise.all([listen(site), listen(images)]);
  let browser;
  try {
    browser = await chromium.launch({headless:true, channel:process.env.CHROME_CHANNEL || 'chrome'});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(`http://127.0.0.1:${site.address().port}/tests/postcards-save.html`);
    await page.click('#run');
    await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.querySelector('#result').textContent));
    assert.match(await page.locator('#result').textContent(), /^PASS/);
    const origin = `http://127.0.0.1:${images.address().port}`;
    const url = origin + '/photo.jpg';
    const cache = await page.evaluate(async url => {
      const load = cors => new Promise(resolve => {
        const img = new Image();if(cors)img.crossOrigin='anonymous';
        img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=url;
      });
      return {ordinary:await load(false), oldExport:await load(true)};
    }, url);
    assert.deepEqual(cache, {ordinary:true,oldExport:false}, 'Must reproduce cached non-CORS image failure');
    await page.evaluate(url => tuhuiPostcards.open({item:{pointName:'照片回归测试',memoryNumber:'CD-000034',imageUrls:[url]},text:'保留城市记忆全文。'}), url);
    const ready = () => page.waitForFunction(() => !document.querySelector('[data-save]').disabled);
    await ready();
    assert(requests.some(r => r.cors && r.path === '/photo.jpg'), 'Export must make a fresh CORS request');
    assert.equal(await page.locator('[name=side]').count(), 0);
    assert.doesNotMatch(await page.locator('.postcard-dialog').textContent(), /明信片|背面|正反面/);
    assert.equal(await page.locator('.postcard-paper img').evaluate(i => i.naturalWidth), 3600);
    await page.click('[data-save]');
    await page.waitForFunction(() => document.querySelector('.postcard-save-dialog img')?.naturalWidth === 3600);
    await page.click('.postcard-save-dialog [data-close]');
    await page.check('[name=layout][value=text]');await ready();
    await page.check('[name=layout][value=photo]');await ready();
    if (process.env.PHOTO_TEST_OUTPUT) {
      fs.mkdirSync(process.env.PHOTO_TEST_OUTPUT,{recursive:true});
      await page.screenshot({path:path.join(process.env.PHOTO_TEST_OUTPUT,'照片生成_桌面.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.click('[data-save]');
    await page.waitForFunction(() => document.querySelector('.postcard-save-dialog img')?.naturalWidth === 3600);
    assert(await page.evaluate(()=>{const d=document.querySelector('.postcard-save-dialog');return d.scrollWidth<=d.clientWidth+1;}));
    if(process.env.PHOTO_TEST_OUTPUT)await page.screenshot({path:path.join(process.env.PHOTO_TEST_OUTPUT,'照片保存_手机.png')});
    await page.evaluate(url => tuhuiPostcards.open({item:{pointName:'失败测试',imageUrls:[url]},text:'原投稿文字仍保留。'}), origin+'/broken.jpg');
    await page.waitForFunction(() => document.querySelector('.postcard-status').textContent.includes('读取失败'));
    assert(await page.locator('[data-save]').isDisabled());
    assert.equal(await page.locator('[data-download]').getAttribute('href'),null);
    await page.check('[name=layout][value=text]');await ready();
    // New uploads still use local File objects without a cloud round trip.
    await page.evaluate(async () => {
      const blob=await (await fetch('./sichuandaxue-current.jpeg')).blob();
      tuhuiPostcards.open({item:{pointName:'本地照片'},files:[new File([blob],'photo.jpg',{type:'image/jpeg'})],text:'本地文件测试'});
    });await ready();
    // A stalled base map must fail visibly in the preview, preserve text, and allow retry.
    await page.locator('.postcard-dialog[open] [data-close]').click();
    await page.waitForFunction(() => !document.querySelector('.postcard-dialog'));
    await page.evaluate(() => {
      window.originalSetTimeout = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 20000 || ms === 15000 ? 300 : ms, ...args);
    });
    let stalledMap;
    await page.route('**/chengdu-map-1800.webp', route => {stalledMap = route;});
    await page.evaluate(() => tuhuiPostcards.open({item:{pointName:'九眼桥',approximateTime:'2000'},text:'2000年，我和妈妈一同来到九眼桥。原投稿文字完整保留。'}));
    await page.waitForFunction(() => document.querySelector('[data-placeholder]').textContent.includes('古地图加载失败'));
    assert(await page.locator('[data-save]').isDisabled());
    assert.equal(await page.locator('[data-download]').getAttribute('href'), null);
    assert.match(await page.locator('[name=story]').inputValue(), /原投稿文字完整保留/);
    await stalledMap.abort();await page.unroute('**/chengdu-map-1800.webp');
    await page.evaluate(() => {window.setTimeout = window.originalSetTimeout;});
    await page.locator('.postcard-editor button[type=submit]').click();await ready();
    // Canvas export is also bounded when the browser never invokes toBlob's callback.
    await page.evaluate(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = () => {};
      window.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 15000 ? 300 : ms, ...args);
    });
    await page.locator('.postcard-editor button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-placeholder]').textContent.includes('导出超时'));
    assert(await page.locator('[data-save]').isDisabled());
    await page.evaluate(() => {HTMLCanvasElement.prototype.toBlob = window.originalToBlob;window.setTimeout = window.originalSetTimeout;});
    await page.locator('.postcard-editor button[type=submit]').click();await ready();
    assert.equal(await page.locator('.postcard-paper img').evaluate(i => i.naturalWidth), 3600);
    console.log('PASS: stalled map and PNG export show visible errors, keep text, disable stale downloads, and recover on retry.');
    console.log('PASS: reproduced old cache failure; fresh CORS export, photo/text switching, mobile save, failed-download guard, local uploads, photo naming and no reverse.');
  } finally {
    await browser?.close();site.close();images.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
