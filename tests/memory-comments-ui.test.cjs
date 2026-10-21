// Isolated local browser + stubbed cloud. Never submits to production.
const {chromium}=require('/Users/lingling/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
let saved=[],attempts=[],lostOnce=true;
function result(name,data,admin){
  if(name==='memoryComments'){
    if(data.action==='submit'){
      attempts.push(data.requestId);
      if(!saved.some(c=>c.requestId===data.requestId))saved.push({...data,id:'1792483000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',status:'approved',createdAt:1792483000000});
      if(lostOnce){lostOnce=false;throw Error('模拟响应中断');}
      return {ok:true,status:'approved',message:'评论已发表。'};
    }
    if(data.action==='list')return {ok:true,items:saved.filter(c=>c.status==='approved'),nextCursor:null};
    if(data.action==='queue'){assert(admin);return {ok:true,items:saved.filter(c=>data.status==='all'||c.status===data.status).map(c=>({...c,pointName:'四川大学',parentPublic:true,parentText:'用于本地自检的原帖正文。'})),nextCursor:null};}
    if(data.action==='delete'){assert(admin);saved.find(c=>c.id===data.id).status='deleted';return {ok:true,status:'deleted'};}
  }
  if(name==='getReviewQueue')return {ok:true,items:[],stats:{total:0,published:0,notPublished:0,awaiting:0,rejected:0,other:0},matchingCount:0};
  if(name==='siteAnalytics')return {ok:true,pv:0,uv:0,days:[],pages:[]};
  return {ok:true,items:[],memories:[]};
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('commentTestCall',({name,data})=>({result:result(name,data,false)}));
    await page.route('**/cloudbase.full.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.cloudbase={init:()=>({auth:{getSession:async()=>({error:new Error("Local test only")})}})};'}));
    await page.goto(url);
    await page.waitForFunction(()=>document.querySelectorAll('.map-marker').length>0);
    await page.evaluate(()=>{
      cloudApp={callFunction:window.commentTestCall};cloudReady=true;
      approvedMemoriesByPoint=new Map([['sichuandaxue',[{id:'p',pointId:'sichuandaxue',pointName:'四川大学',publicContent:'用于本地自检的校园记忆。',likeCount:0}]]]);
      ensurePublicMemoryPanel();publicArchivePlaces=collectPublicMemoryPlaces();publicMemoriesError='';publicMemoriesLoaded=true;
      document.querySelector('#publicMemoryPanel').hidden=false;document.body.classList.add('modal-open');renderPublicFeed();
    });
    await page.locator('[data-public-comments="p"]').click();
    await page.getByText('暂无公开评论，欢迎留下你的感受。',{exact:true}).waitFor();
    await page.locator('[name=nickname]').fill('<b>读者</b>');
    const text='这段记忆让我想到自己的校园生活。<img src=x onerror=alert(1)>';
    await page.locator('.memory-comment-form textarea').fill(text);
    await page.locator('[name=consent]').check();
    await page.getByRole('button',{name:'发表评论'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-comment-result]').textContent.includes('模拟响应中断'));
    assert.equal(await page.locator('.memory-comment-form textarea').inputValue(),text);
    await page.getByRole('button',{name:'发表评论'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-comment-result]').textContent.includes('评论已发表'));
    assert.equal(attempts[0],attempts[1]);assert.equal(saved.length,1);await page.locator('.memory-comment').waitFor();assert.equal(await page.locator('.memory-comment').count(),1);
    // Curator sees every submitted comment immediately, with original-post context.
    const admin=await browser.newPage({viewport:{width:1440,height:1000}});
    admin.on('pageerror',e=>errors.push(e.message));
    await admin.exposeFunction('commentTestCall',({name,data})=>({result:result(name,data,true)}));
    await admin.route('https://static.cloudbase.net/**',r=>r.fulfill({contentType:'text/javascript',body:'window.cloudbase={init:()=>({auth:()=>({anonymousAuthProvider:()=>({signIn:async()=>{}})}),callFunction:window.commentTestCall})};'}));
    await admin.goto(url+'/admin.html');
    await admin.locator('.comment-review-card').waitFor();
    await admin.locator('.comment-review-card summary').click();
    assert.equal(await admin.locator('.comment-review-text img').count(),0);
    assert.equal(await admin.locator('.comment-review-text').textContent(),text);
    await admin.screenshot({path:'/private/tmp/tuhui-comments-admin-desktop.png'});
    await admin.setViewportSize({width:390,height:844});
    assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await admin.screenshot({path:'/private/tmp/tuhui-comments-admin-mobile.png'});
    assert.equal(await admin.locator('[data-comment-filter]').inputValue(),'all');
    assert.equal(await admin.getByRole('button',{name:'通过并公开',exact:true}).count(),0);
    assert.equal(await admin.getByRole('button',{name:'删除评论',exact:true}).count(),1);
    await page.getByRole('button',{name:'刷新评论',exact:true}).click();
    await page.locator('.memory-comment').waitFor();
    assert.equal(await page.locator('.memory-comment p').textContent(),text);
    assert.equal(await page.locator('.memory-comment img').count(),0);
    assert.equal(await page.locator('.memory-comment strong b').count(),0);
    await page.locator('.memory-comments').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/private/tmp/tuhui-comments-public-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.memory-comments').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/private/tmp/tuhui-comments-public-mobile.png'});
    // Deleting hides the public comment while preserving its entry in the all/deleted lists.
    await admin.getByRole('button',{name:'删除评论'}).waitFor();
    admin.once('dialog',d=>d.accept());
    await admin.getByRole('button',{name:'删除评论'}).click();
    await admin.getByText('评论已删除，公众不再可见，后台记录保留。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'刷新评论',exact:true}).click();
    await page.getByText('暂无公开评论，欢迎留下你的感受。',{exact:true}).waitFor();
    assert.equal(saved[0].status,'deleted');
    assert.equal(await admin.locator('.comment-review-card').count(),1);
    assert.equal(await admin.getByRole('button',{name:'删除评论'}).count(),0);
    await admin.locator('[data-comment-filter]').selectOption('deleted');
    await admin.locator('.comment-review-card').waitFor();
    assert.equal(await admin.locator('.comment-review-text').textContent(),text);
    assert.deepEqual(errors,[]);
    console.log('PASS: post entry, immediate visibility, preserved draft/retry nonce, curator all-comments context/deletion and retained history, escaped text, desktop/mobile layouts and no page errors.');
    await page.evaluate(()=>{
      tuhuiPostcards.open({item:{pointName:'四川大学',pointId:'sichuandaxue',memoryNumber:'CD-000123'},
        text:'编号布局测试，不会提交或公开。',
        badges:[{key:'scuMemoryKeeper',title:'川大拾光者',unlocked:true,numberLabel:'No.010'},
          {key:'chengduLamplighter',title:'成都点灯人',unlocked:true,numberLabel:'No.012'}]});
    });
    await page.waitForFunction(()=>document.querySelector('[data-save]')&&!document.querySelector('[data-save]').disabled);
    assert.match(await page.locator('[data-memory-number]').textContent(),/CD—123/);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/private/tmp/tuhui-numbered-postcard-mobile.png'});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('select[name=badge]').selectOption('chengduLamplighter');
    await page.waitForFunction(()=>!document.querySelector('[data-save]').disabled);
    await page.screenshot({path:'/private/tmp/tuhui-numbered-postcard-desktop.png'});
    console.log('PASS: shortened memory number and multiple numbered badges in real postcard preview, mobile/desktop.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
