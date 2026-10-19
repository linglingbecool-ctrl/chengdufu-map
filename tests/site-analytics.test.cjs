const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
let state = { users: {admin:{openid:'staff',role:'admin',enabled:true}}, siteAnalyticsCounters:{}, siteAnalyticsVisitors:{}, siteAnalyticsEvents:{} };
let queue=Promise.resolve(), failWrite=false, failRead=false, time=Date.parse('2026-10-19T15:59:00Z');
const FakeDate=class extends Date { static now(){return time;} };
function collection(store,name){return {
  doc(id){return {
    async get(){if(failRead&&name==='siteAnalyticsCounters')return {code:'ERROR'};return {data:store[name][id]||null};},
    async set(value){if(failWrite&&name==='siteAnalyticsCounters')return {code:'ERROR'};store[name][id]={_id:id,...value};return {updated:1};}
  };},
  where(q){return {limit(){return this;},async get(){return {data:Object.values(store[name]).filter(item=>Object.entries(q).every(([k,v])=>item[k]===v))};}};}
};}
const db={collection:name=>collection(state,name),runTransaction(fn){
  const run=queue.then(async()=>{const draft=structuredClone(state);await fn({collection:name=>collection(draft,name)});state=draft;});queue=run.catch(()=>{});return run;
}};
function load(uid){const context={exports:{},Date:FakeDate,require:name=>name==='@cloudbase/node-sdk'?{init:()=>({database:()=>db,auth:()=>({getUserInfo:()=>uid?{uid}:{}})})}:require(name)};vm.runInNewContext(fs.readFileSync('cloud-functions/siteAnalytics/index.js','utf8'),context);return context.exports.main;}
(async()=>{
  const visitor=load('reader'), staff=load('staff'), unauth=load();
  const a=randomUUID(),b=randomUUID();
  const event={action:'track',visitorId:a,eventId:randomUUID(),page:'home',pv:999};
  assert.equal((await unauth(event)).code,'NOT_LOGIN');
  assert.equal((await visitor({action:'summary'})).code,'NO_ADMIN_PERMISSION');
  assert.equal((await visitor({...event,page:'admin'})).code,'INVALID_INPUT');
  assert.equal((await visitor({...event,visitorId:{bad:true}})).code,'INVALID_INPUT');
  assert.equal((await staff(event)).status,'excluded_admin');
  const results=await Promise.all([visitor(event),visitor(event),visitor({...event,visitorId:b,eventId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='recorded').length,2);
  assert.equal(state.siteAnalyticsCounters.all.pv,2);assert.equal(state.siteAnalyticsCounters.all.uv,2);
  await visitor({...event,eventId:randomUUID(),page:'copyright'});
  assert.equal(state.siteAnalyticsCounters.all.pv,3);assert.equal(state.siteAnalyticsCounters.all.uv,2);
  time+=120000; // UTC+8 midnight
  assert.equal((await visitor(event)).status,'duplicate');
  await visitor({...event,eventId:randomUUID()});
  const summary=await staff({action:'summary'});
  assert.equal(summary.pv,4);assert.equal(summary.uv,2);
  assert.equal(summary.days.at(-1).day,'2026-10-20');
  assert.equal(summary.days.at(-1).uv,1);assert.equal(summary.days.at(-2).uv,2);
  assert.equal(summary.days[0].tracked,false);assert.equal(summary.days.at(-1).tracked,true);
  assert.equal(summary.pages.reduce((n,p)=>n+p.pv,0),summary.pv);
  failWrite=true;const before=JSON.stringify(state);
  assert.equal((await visitor({...event,eventId:randomUUID()})).ok,false);
  assert.equal(JSON.stringify(state),before);failWrite=false;
  failRead=true;assert.equal((await staff({action:'summary'})).ok,false);failRead=false;
  for(let i=0;i<119;i++)await visitor({...event,eventId:randomUUID()});
  assert.equal((await visitor({...event,eventId:randomUUID()})).status,'rate_limited');
  const json=JSON.stringify(state);assert(!json.includes(a));assert(!json.includes('reader'));
  console.log('PASS: authorization, validation, staff exclusion, concurrent/retried events, lifetime/daily UV, UTC+8 rollover, rollback, rate bound and pseudonymous records');
})().catch(error=>{console.error(error);process.exitCode=1;});
