// Requires the local preview at :8775. All cloud calls are stubbed.
const assert=require('node:assert/strict');
const {chromium}=require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stub=`window.cloudbase={init:()=>({auth:()=>({anonymousAuthProvider:()=>({signIn:async()=>{}})}),callFunction:async({name})=>({result:name==='siteAnalytics'?{ok:true,pv:125,uv:47,startedAt:1792396800000,updatedAt:1792397400000,days:[{day:'2026-10-18',pv:0,uv:0},{day:'2026-10-19',pv:125,uv:47}],pages:[{label:'网站首页',pv:123},{label:'版权声明',pv:2}]}:{ok:true,items:[],stats:{total:63,published:46,notPublished:17,awaiting:15,rejected:2,other:0,updatedAt:new Date().toISOString()},matchingCount:63}})})};`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/lingling/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://static.cloudbase.net/**',route=>route.fulfill({contentType:'application/javascript',body:stub}));
  await page.goto('http://127.0.0.1:8775/admin.html');
  await page.waitForFunction(()=>document.querySelector('#analyticsPv').textContent==='125');
  assert.equal(await page.locator('#analyticsUv').textContent(),'47');
  assert.equal(await page.evaluate(()=>localStorage.getItem('tuhui-analytics-excluded-v1')),'1');
  await page.locator('.analytics-days summary').click();
  assert.equal(await page.locator('#analyticsDays tr').count(),2);
  await page.screenshot({path:'/private/tmp/tuhui-analytics-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/private/tmp/tuhui-analytics-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: admin metrics, daily table, staff-browser exclusion, desktop/mobile layout, no page errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
