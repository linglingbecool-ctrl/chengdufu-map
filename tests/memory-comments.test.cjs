const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=1792483000000,failWrite=false,queue=Promise.resolve();
let state={contributions:{p:{_id:'p',status:'approved',consentToPublish:true,rightsConfirmed:true,pointName:'四川大学',originalContent:'原帖正文'}},
  users:{staff:{_id:'staff',openid:'staff',role:'admin',enabled:true}},memoryComments:{},memoryCommentRequests:{}};
const match=(item,query)=>Object.entries(query).every(([k,v])=>v?.lt?item[k]<v.lt:v?.in?v.in.includes(item[k]):item[k]===v);
function collection(store,name){
  return {doc(id){return {
    async get(){return {data:store[name][id]||null};},
    async set(data){if(failWrite&&name==='memoryCommentRequests')return {code:'WRITE_FAILED'};store[name][id]={_id:id,...data};return {updated:1};},
    async update(data){if(failWrite)return {code:'WRITE_FAILED'};Object.assign(store[name][id],data);return {updated:1};}
  };},where(query){let limit=100,desc=false;return {orderBy(key,direction){desc=direction==='desc';return this;},limit(n){limit=n;return this;},
    async get(){return {data:Object.values(store[name]).filter(item=>match(item,query)).sort((a,b)=>(desc?-1:1)*a._id.localeCompare(b._id)).slice(0,limit)};}
  };}};
}
const db={collection:name=>collection(state,name),command:{lt:x=>({lt:x}),in:x=>({in:x})},runTransaction(fn){
  const p=queue.then(async()=>{const draft=structuredClone(state);await fn({collection:name=>collection(draft,name)});state=draft;});
  queue=p.catch(()=>{});return p;
}};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function client(uid){
  const c={exports:{},Date:Clock,require:n=>n==='@cloudbase/node-sdk'?{init:()=>({database:()=>db,auth:()=>({getUserInfo:()=>uid?{uid}:{}})})}:require(n)};
  vm.runInNewContext(fs.readFileSync('cloud-functions/memoryComments/index.js','utf8'),c);return c.exports.main;
}
let nonce=0;
const submit=(extra={})=>({action:'submit',memoryId:'p',text:'这段校园记忆很动人。',nickname:'读者甲',consent:true,requestId:`00000000-0000-0000-0000-${String(++nonce).padStart(12,'0')}`,...extra});
(async()=>{
  const a=client('alice'),b=client('bob'),staff=client('staff');
  assert.equal((await client()({action:'list',memoryId:'p'})).code,'NOT_LOGIN');
  assert.equal((await a({action:'queue',uid:'staff'})).code,'NO_ADMIN_PERMISSION');
  assert.equal((await a(submit({text:'  '}))).code,'INVALID_INPUT');
  assert.equal((await a(submit({text:'字'.repeat(501)}))).code,'INVALID_INPUT');
  assert.equal((await a(submit({nickname:'名'.repeat(21)}))).code,'INVALID_INPUT');
  assert.equal((await a(submit({consent:false}))).code,'INVALID_INPUT');
  assert.equal((await a(submit({memoryId:{$ne:''}}))).code,'INVALID_INPUT');
  const input=submit({status:'pending',uid:'staff',reviewedBy:'staff'});
  const responses=await Promise.all([a(input),a(input),a(input)]);
  assert(responses.every(r=>r.ok&&r.status==='approved'));assert.equal(new Set(responses.map(r=>r.id)).size,1);
  const id=responses[0].id;
  assert.equal(Object.keys(state.memoryComments).length,1);assert.equal(state.memoryComments[id].status,'approved');assert.equal(state.memoryComments[id].userId,'alice');
  assert.equal(state.memoryComments[id].reviewedBy,undefined);
  assert.equal((await a({...input,text:'changed'})).code,'REQUEST_CONFLICT');
  const visible=(await b({action:'list',memoryId:'p'})).items[0];
  assert.equal(visible.text,input.text);assert.equal(Object.keys(visible).sort().join(','),'createdAt,id,nickname,text');
  assert.equal((await staff({action:'queue'})).items[0].parentText,'原帖正文');
  assert.equal((await a(submit())).code,'TOO_FAST');
  const remove={action:'delete',id,expectedStatus:'approved'};
  assert.equal((await b({...remove,uid:'staff'})).code,'NO_ADMIN_PERMISSION');
  assert.equal((await staff({...remove,expectedStatus:'pending'})).code,'COMMENT_CONFLICT');
  failWrite=true;const beforeDelete=JSON.stringify(state);
  assert.equal((await staff(remove)).code,'DATABASE_ERROR');assert.equal(JSON.stringify(state),beforeDelete);failWrite=false;
  assert((await staff(remove)).ok);assert((await staff(remove)).ok);
  assert.equal(state.memoryComments[id].history.length,1);assert.equal(state.memoryComments[id].deletedBy,'staff');
  assert.equal((await b({action:'list',memoryId:'p'})).items.length,0);
  assert.equal((await staff({action:'queue'})).items[0].status,'deleted');
  assert.equal((await a(input)).status,'deleted'); // Retry cannot resurrect a removed comment.
  assert.equal((await staff({action:'review',id,decision:'approved',expectedStatus:'deleted'})).code,'INVALID_ACTION');
  now+=31000;failWrite=true;const before=JSON.stringify(state);
  assert.equal((await a(submit())).code,'DATABASE_ERROR');assert.equal(JSON.stringify(state),before);failWrite=false;
  const next=await a(submit());assert(next.ok);
  state.contributions.p.status='rejected';
  assert.equal((await b({action:'list',memoryId:'p'})).code,'NOT_PUBLIC');
  assert.equal((await b(submit())).code,'NOT_PUBLIC');
  assert((await staff({...remove,id:next.id})).ok); // Curator may also remove an orphaned/hidden post's comment.
  state.contributions.p.status='approved';
  // Historical statuses remain visible only to curators; deletion works for each.
  for(const status of ['pending','rejected']){
    now++;const legacyId=`${now}-${'b'.repeat(32)}`;
    state.memoryComments[legacyId]={_id:legacyId,memoryId:'missing',text:'旧评论',nickname:'旧读者',status,createdAt:now};
    assert((await staff({action:'queue'})).items.some(c=>c.id===legacyId&&!c.parentPublic));
    assert.equal((await staff({action:'queue',status})).items.length,1);
    assert((await staff({action:'delete',id:legacyId,expectedStatus:status})).ok);
  }
  for(let i=0;i<23;i++){now++;assert((await client('visitor'+i)(submit({text:'分页 '+i}))).ok);}
  const page1=await b({action:'list',memoryId:'p'}),page2=await b({action:'list',memoryId:'p',cursor:page1.nextCursor});
  assert.equal(page1.items.length,20);assert.equal(page2.items.length,3);assert.equal(page2.nextCursor,null);
  assert.equal(page1.items[0].text,'分页 22');
  assert.equal(new Set([...page1.items,...page2.items].map(c=>c.id)).size,23);
  const all1=await staff({action:'queue'}),all2=await staff({action:'queue',cursor:all1.nextCursor});
  assert.equal(all1.items.length+all2.items.length,27);assert.equal(new Set([...all1.items,...all2.items].map(c=>c.id)).size,27);
  assert.equal((await staff({action:'queue',status:'deleted'})).items.length,4);
  assert.equal((await b({action:'list',memoryId:'p',cursor:{$lt:''}})).code,'INVALID_INPUT');
  assert.equal((await staff({action:'queue',status:{$ne:'deleted'}})).code,'INVALID_INPUT');
  const daily=client('daily');for(let i=0;i<20;i++){now+=31000;assert((await daily(submit())).ok);}
  now+=31000;assert.equal((await daily(submit())).code,'DAILY_LIMIT');
  console.log('PASS: instant public comments, admin-only idempotent deletion, retained records, all-status queue, escaped inputs boundary, retry without resurrection, failed-write rollback, parent visibility, descending pagination and rate limits.');
})().catch(e=>{console.error(e);process.exitCode=1;});
