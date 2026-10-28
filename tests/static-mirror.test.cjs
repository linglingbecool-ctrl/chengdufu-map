// Read-only browser check of the real static mirror from the production origin.
// MIRROR_PREVIEW=1 replaces only HTML with the local release candidate; cloud calls are isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),points=JSON.parse(fs.readFileSync(path.join(root,'points.json')));
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const url='https://tuhuichengdu.cn/?v=20261028-desktop02';
 if(process.env.MIRROR_PREVIEW==='1')await p.route(url,r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8')}));
 await p.route('**/cloudbase.full.js*',r=>r.fulfill({contentType:'text/javascript',body:"window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('read-only mirror check')})}})};"}));
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('#detailPointSelect').waitFor();await p.locator('.map-image').evaluate(e=>e.decode());
 console.log('Map ready (ms)',await p.evaluate(()=>Math.round(performance.now())));
 assert.equal(await p.locator('.map-marker').count(),29);
 assert(await p.evaluate(async()=>{const f=await document.fonts.load('11px "Chengdu Map Kai"');return f.length>0&&f.every(x=>x.status==='loaded')}));
 for(const point of points){
  await p.locator('#detailPointSelect').selectOption(point.id);
  const imgs=p.locator('.point-media img');
  await imgs.evaluateAll(els=>Promise.all(els.map(e=>{e.loading='eager';return e.decode()})));
  for(const src of await imgs.evaluateAll(els=>els.map(e=>e.src)))assert(!src.includes('/https://'),'No relative prefix before an absolute asset URL');
 }
 const cover=await p.evaluate(()=>renderPostCover({imageFileIds:['pending']},{oldImagePreview:'https://example.com/preview.webp',nameModern:'test'}));
 assert(cover.includes('src="https://example.com/preview.webp"'));
 await p.setViewportSize({width:390,height:844});await p.reload({waitUntil:'domcontentloaded'});await p.locator('#detailPointSelect').waitFor();await p.locator('.map-image').evaluate(e=>e.decode());
 assert((await p.locator('.map-image').evaluate(e=>e.currentSrc)).endsWith('chengdu-map-960.webp'));
 const first=p.locator('.map-marker').first();const style=await first.evaluate(e=>({font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}));
 assert(style.font.includes('Chengdu Map Kai'));assert.equal(style.size,'9px');assert.equal(style.color,'rgb(255, 255, 255)');
 assert.deepEqual(errors,[]);console.log('PASS: live mirror CORS, Kai font, all 29 point images decode, public covers, desktop/mobile map variants and preserved label style.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
