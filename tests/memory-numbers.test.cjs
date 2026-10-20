const assert=require('node:assert/strict'),n=require('../cloud-functions/shared/memory-numbers');
const initial=()=>({schema:1,ready:true,memoryNext:1,badgeNext:1,historyReliable:true,memories:{},badges:{},aliases:{},retired:[]});
let state={memoryNumberRegistry:{main:initial()},contributions:{},memoryAccountLinks:{}},queue=Promise.resolve(),failWrites=false;
const collection=(store,name)=>({doc(id){return {
  async get(){return {data:structuredClone(store[name]?.[id]||null)};},
  async set(value){if(failWrites)return {code:'WRITE_FAILED'};store[name]??={};store[name][id]=structuredClone(value);return {updated:1};},
  async update(value){if(failWrites)return {code:'WRITE_FAILED'};Object.assign(store[name][id],structuredClone(value));return {updated:1};}
};}});
const db={runTransaction(fn){const p=queue.then(async()=>{const draft=structuredClone(state);await fn({collection:name=>collection(draft,name)});state=draft;});queue=p.catch(()=>{});return p;}};
const item=(id,userId='reader')=>({_id:id,userId,status:'processing',pointId:'sichuandaxue',consentToPublish:true,rightsConfirmed:true});
(async()=>{
  for(let i=0;i<40;i++)state.contributions[`m${i}`]=item(`m${i}`,`u${i}`);
  await Promise.all(Array.from({length:40},(_,i)=>n.review(db,`m${i}`,'staff','approved','')));
  const r=state.memoryNumberRegistry.main;
  assert.equal(new Set(Object.values(r.memories)).size,40);
  assert.equal(new Set(Object.values(r.badges).map(x=>x.number)).size,40);
  const before=JSON.stringify(state);
  await assert.rejects(n.review(db,'m0','staff','approved',''),{code:'ALREADY_REVIEWED'});
  assert.equal(JSON.stringify(state),before);
  const decorated=await n.decorate(db,'u0',[state.contributions.m0]);
  assert.equal(decorated.numbers.m0,'CD-000001');assert.equal(decorated.badge.label,'第001位');
  await Promise.all(Array.from({length:20},()=>n.decorate(db,'u0',[state.contributions.m0])));
  assert.equal(state.memoryNumberRegistry.main.memoryNext,41);
  state.contributions.again=item('again','u0');await n.review(db,'again','staff','approved','');
  assert.equal(state.memoryNumberRegistry.main.badgeNext,41);
  state.contributions.bad=item('bad');state.contributions.bad.rightsConfirmed=false;
  await assert.rejects(n.review(db,'bad','staff','approved',''),{code:'PUBLICATION_CONSENT_MISSING'});
  state.contributions.reject=item('reject');await n.review(db,'reject','staff','rejected','');
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'reader'),null);
  state.contributions.pending=item('pending');await n.decorate(db,'reader',[state.contributions.pending]);
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'reader'),null);
  await n.withRegistry(db,async(tx,s)=>n.merge(s,'u0','phone'));
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'phone').number,1);
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'u0').number,1);
  await n.withRegistry(db,async(tx,s)=>n.merge(s,'u1','phone'));
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'u1').number,1);
  assert.deepEqual(state.memoryNumberRegistry.main.retired,[2]);
  const snap=JSON.stringify(state);failWrites=true;
  await assert.rejects(n.review(db,'pending','staff','approved',''),{code:'NUMBER_DATABASE_ERROR'});
  assert.equal(JSON.stringify(state),snap);failWrites=false;
  state.memoryNumberRegistry.main.historyReliable=false;
  await n.review(db,'pending','staff','approved','');
  assert(n.publicBadge(state.memoryNumberRegistry.main,'reader').label.startsWith('拾光编号'));
  state.contributions.linked=item('linked','anonymous');
  state.memoryAccountLinks[n.key('anonymous')]={sourceUid:'anonymous',targetUid:'phone'};
  await n.review(db,'linked','staff','approved','');
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'anonymous').number,1);
  console.log('PASS: concurrent allocation, retries, same-owner multiple memories, consent, rejected/pending, stable linkage, alias merge, no reuse, rollback and uncertain chronology label.');
})().catch(e=>{console.error(e);process.exitCode=1;});
