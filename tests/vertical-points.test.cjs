// Read-only browser regression: labels, complete historical text, and existing controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.join(__dirname,'..'),points=JSON.parse(fs.readFileSync(path.join(root,'points.json'),'utf8'));
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.POINT_PREVIEW_URL||'http://127.0.0.1:8780/';
 await page.route('**/*',route=>{
  const u=route.request().url();
  if(u.includes('cloudbase.full.js'))return route.fulfill({contentType:'text/javascript',body:"window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('read-only test')})},callFunction:async()=>({result:{ok:true,memories:[]}})})};"});
  if(!u.startsWith(new URL(url).origin))return route.abort();
  return route.continue();
 });
 for(const width of [1440,768,390,360]){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#detailPointSelect').waitFor();await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#mapMarkers .map-marker').count(),29);
  await page.waitForFunction(()=>document.querySelectorAll('.map-label-lines line').length===29);
  const labels=await page.locator('#mapMarkers .map-marker').evaluateAll(els=>els.map(el=>({text:el.textContent,color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,writing:getComputedStyle(el).writingMode,width:el.offsetWidth,rect:{x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight}})));
  assert(labels.every(x=>x.text&&x.writing==='vertical-rl'));assert.equal(new Set(labels.map(x=>x.color)).size,1);assert.equal(new Set(labels.map(x=>x.bg)).size,4);
  let collisions=0;for(let a=0;a<labels.length;a++)for(let b=a+1;b<labels.length;b++){const x=labels[a].rect,y=labels[b].rect;if(Math.min(x.x+x.w,y.x+y.w)>Math.max(x.x,y.x)&&Math.min(x.y+x.h,y.y+y.h)>Math.max(x.y,y.y))collisions++;}
  const bounds=await page.locator('#mapMarkers').evaluate(el=>({w:el.clientWidth,h:el.clientHeight}));
  assert(labels.every(({rect:r})=>r.x>=0&&r.y>=0&&r.x+r.w<=bounds.w+1&&r.y+r.h<=bounds.h+1));
  await page.locator('.map-panel').screenshot({path:path.join(root,'../../竖排点位上线_20261028',`map-${width}.png`)});
  console.log(width,bounds,'label overlaps',collisions);assert.equal(collisions,0,'Place labels must not overlap');
  for(const p of points){
   await page.locator('#detailPointSelect').selectOption(p.id);
   const intro=page.locator('.official-intro'),full=(p.extended||p.quick).trim();
   const lead=await intro.locator(':scope > p').textContent();
   const rest=await intro.locator('details > p').allTextContents();
   assert.equal((lead+rest.join('')).replace(/\s/g,''),full.replace(/\s/g,''));
   const details=intro.locator('details');
   if(await details.count()) {assert.equal(await details.getAttribute('open'),null);assert.equal((await details.locator('.intro-expand').textContent()).trim(),'•• 展开全文');await details.locator('summary').click();assert(await details.locator('p').first().isVisible());await details.locator('summary').click();}
   assert.equal(await page.locator('.point-media img').count(),Number(!!p.oldImage)+Number(!!p.currentImage));
  }
  await page.locator('#detailPointSelect').selectOption('jiuyanqiao');
  await page.locator('.official-intro').screenshot({path:path.join(root,'../../竖排点位上线_20261028',`reading-${width}.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-point-status="status-existing"]').click();assert(await page.locator('#pointPicker').isVisible());await page.locator('[data-find-point="wuhouci"]').click();assert.equal(await page.locator('#detailPointSelect').inputValue(),'wuhouci');
 }
 assert.deepEqual(errors,[]);console.log('PASS: 29 labels; four fills; uniform text; full source preserved; folding; photos; category picker; responsive bounds.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
