// Controlled HTTP/1 cold-start test: delays represent a slow static hosting path.
// Cloud service is stubbed; this does not test authenticated backend actions.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { chromium } = require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
async function serve(old) {
  const server = http.createServer(async (req, res) => {
    try {
      const file = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html';
      if (file.includes('..')) return res.writeHead(400).end();
      await new Promise(r => setTimeout(r, 500));
      let body = old && ['index.html', 'style.css'].includes(file)
        ? execFileSync('git', ['show', `b8a0c2f:${file}`], { cwd: root })
        : fs.readFileSync(path.join(root, file));
      if (file === "index.html" && !old) body = Buffer.from(body.toString().replaceAll('https://chengdufu-map-d4g459au02132689e-1459591635.tcloudbaseapp.com/site-assets/20261028-desktop02/', "./"));
      const ext = path.extname(file);
      res.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff':'font/woff'}[ext] || 'application/octet-stream');
      if (['.html','.js','.css','.json'].includes(ext)) {
        body = zlib.gzipSync(body); res.setHeader('Content-Encoding', 'gzip');
      }
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
async function measure(browser, site, old) {
  const context = await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
  try {
    const p = await context.newPage(), errors = [], requests = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('request', r => { if(r.url().startsWith(site.url)) requests.push(r.url()); });
    await p.route('**/*', async r => {
      if(r.request().url().includes('cloudbase.full.js')) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return r.fulfill({contentType:'text/javascript',body:"window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('isolated test')})}})};"});
      }
      if(!r.request().url().startsWith(site.url)) return r.abort();
      return r.continue();
    });
    const c = await context.newCDPSession(p);
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:256000,uploadThroughput:80000});
    await p.goto(site.url,{waitUntil:'domcontentloaded'});
    await p.locator('#detailPointSelect').waitFor();
    await p.locator('.map-image').evaluate(img=>img.decode());
    const result = await p.evaluate(()=>({readyMs:Math.round(performance.now()),sdkReady:!!window.cloudbase,markers:document.querySelectorAll('.map-marker').length,source:document.querySelector('.map-image').currentSrc.split('/').pop()}));
    result.scripts = requests.filter(u=>/\.js(?:\?|$)/.test(u)).length;
    result.styles = requests.filter(u=>/\.css(?:\?|$)/.test(u)).length;
    result.maps = requests.filter(u=>/chengdu-map-.*\.webp/.test(u)).length;
    assert.equal(result.markers,29);
    if(!old) {
      assert.equal(result.scripts,1); assert.equal(result.styles,1); assert.equal(result.maps,1);
      assert.equal(result.sdkReady,false,'Map does not wait for CloudBase');
      assert.equal(result.source,'chengdu-map-1440.webp');
      assert(await p.evaluate(()=>!!(window.tuhuiAccount && window.tuhuiPostcards && window.tuhuiComments && window.tuhuiImages && window.TUHUI_EVIDENCE)),'All bundled modules retain their public APIs');
      await p.locator('#detailPointSelect').selectOption('jiuyanqiao');
      await p.locator('.official-intro summary').click();
      assert(await p.locator('.official-intro details > p').first().isVisible());
      assert.deepEqual(errors,[]);
    }
    return result;
  } finally { await context.close(); }
}
(async()=>{
  const old = await serve(true), current = await serve(false), browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const before = await measure(browser, old, true), after = await measure(browser, current, false);
    console.log(JSON.stringify({conditions:'1440px DPR2, 150ms latency, 256KB/s, 500ms server delay per asset; cold browser',before,after},null,2));
    console.log('PASS: one script, one stylesheet, one desktop map; all modules and map remain usable before cloud service.');
  } finally { await browser.close(); old.server.close(); current.server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
