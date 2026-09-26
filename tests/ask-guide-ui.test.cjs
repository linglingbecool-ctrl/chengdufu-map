// 本地预览须已启动。使用已有 Playwright，无生产写入。
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stub = `
window.__askTest={mode:'success',calls:[],pending:[]};
const originalTimeout=window.setTimeout;
window.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===28000&&window.__askTest.mode==='timeout'?80:ms,...args);
window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error('isolated UI test')})},callFunction:async({name,data})=>{
 if(name!=='askEvidenceQuestion')return {result:{ok:true,memories:[]}};
 const test=window.__askTest;test.calls.push(data);
 if(test.mode==='network')throw new Error('network request error');
 if(test.mode==='timeout')return new Promise(()=>{});
 if(test.mode==='hold')return new Promise(resolve=>test.pending.push(resolve));
 if(test.mode==='invalid')return {result:'invalid-json'};
 if(test.mode==='empty')return {result:{ok:true,answer:''}};
 if(test.mode.startsWith('MODEL_'))return {result:{ok:false,code:test.mode}};
 return {result:{ok:true,route:'realtime-model',sourceLabel:'实时检索生成',evidenceCount:1,answer:'结论\\n武侯祠攻心联由赵藩撰写。\\n\\n文献依据\\n1｜《成都街巷志》｜PDF第299—300页\\n1902年赵藩撰写攻心联。\\n证据 A'}};
}})};`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/Users/lingling/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/cloudbase.full.js*',route=>route.fulfill({contentType:'text/javascript',body:stub}));
 await page.goto(process.env.ASK_PREVIEW_URL || 'http://127.0.0.1:8775/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'02 问图 让馆藏证据与地图联动'}).click();
 await page.locator('#aiPointSelect').selectOption('wuhouci');
 const input=page.locator('#aiQuestionInput'),send=page.locator('#aiSendButton'),latest=page.locator('.is-latest-answer');
 assert.equal(await page.locator('#aiSuggestions,#aiToggleSuggestions').count(),0);
 await input.fill('武侯祠攻心联是谁写的？');
 await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});
 assert.equal(await page.evaluate(()=>window.__askTest.calls.length),0);
 await send.click();await latest.getByText('武侯祠攻心联由赵藩撰写。',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__askTest.calls[0].pointId),'wuhouci');
 // 原页入口仍可用。
 assert.ok(await latest.locator('[data-open-evidence]').count()>0);
 for(const mode of ['network','MODEL_TIMEOUT','MODEL_BUSY','empty','invalid','timeout']) {
   await page.evaluate(mode=>window.__askTest.mode=mode,mode);
   await input.fill('武侯祠的攻心联是什么时候出现的？');await send.click();
   await latest.getByRole('button',{name:'重试这一问'}).waitFor();
   assert.match(await latest.innerText(),/赵藩/);
   assert.match(await latest.innerText(),/尚未判定能否回答/);
   assert.equal(await input.isEnabled(),true);
 }
 await page.evaluate(()=>window.__askTest.mode='success');
 await input.fill('这是一段尚未发送的草稿');
 await latest.getByRole('button',{name:'重试这一问'}).click();
 await latest.getByText('武侯祠攻心联由赵藩撰写。',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'这是一段尚未发送的草稿');
 // 同地点相似问法不会误用古图那道预置答案。
 await input.fill('九眼桥名称由来和历史长度是多少？');await send.click();
 await latest.getByText('武侯祠攻心联由赵藩撰写。',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__askTest.calls.at(-1).question),'九眼桥名称由来和历史长度是多少？');
 await page.evaluate(()=>window.__askTest.mode='hold');
 await input.fill('武侯祠的第一问');await send.click();
 await input.fill('武侯祠的第二问');await send.click();
 await page.locator('#aiPointSelect').selectOption('qingyanggong');
 await input.fill('青羊宫的第三问');await send.click();
 await input.fill('不能丢失的第四问');await send.click();
 assert.equal(await input.inputValue(),'不能丢失的第四问');
 await page.locator('#aiClearConversation').click();assert.match(await page.locator('#aiConnectionStatus').innerText(),/请等待/);
 await page.evaluate(()=>{window.__askTest.mode='success';window.__askTest.pending.shift()({result:{ok:true,answer:'第一问完成'}})});
 await page.waitForFunction(()=>window.__askTest.calls.at(-1)?.question==='青羊宫的第三问');
 const calls=await page.evaluate(()=>window.__askTest.calls.slice(-3));
 assert.deepEqual(calls.map(c=>c.pointId),['wuhouci','wuhouci','qingyanggong']);
 // 排队处理不得擦掉尚未提交的第四问。
 assert.equal(await input.inputValue(),'不能丢失的第四问');
 for(const [width,height] of [[1440,1000],[390,844],[320,640]]) {
   await page.setViewportSize({width,height});await page.locator('#mapAiDrawer').scrollIntoViewIfNeeded();
   const box=await page.locator('#aiMessages').boundingBox();assert.ok(box.height>=240,JSON.stringify(box));
   const form=await page.locator('#aiAskForm').boundingBox();assert.ok(form.x>=0&&form.x+form.width<=width);
   assert.ok(await input.isVisible());
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: real UI init, IME, 6 failure paths, retry/draft preservation, queue/context, 3 viewports');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
