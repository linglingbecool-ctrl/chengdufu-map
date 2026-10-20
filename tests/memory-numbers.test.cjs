const assert=require('node:assert/strict'),n=require('../cloud-functions/shared/memory-numbers');
const initial=()=>{const s={schema:1,ready:true,memoryNext:1,badgeNext:1,historyReliable:true,memories:{},badges:{},aliases:{},retired:[]};n.initializeAdditionalBadges(s,[]);return s;};
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
  assert.equal(decorated.numbers.m0,'CD-000001');assert.equal(decorated.badge.label,'No.001');
  assert.equal(decorated.badges.chengduLamplighter.label,'No.001');
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
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'reader').ranked,false);
  assert(n.publicBadge(state.memoryNumberRegistry.main,'reader').label.startsWith('No.'));
  state.contributions.linked=item('linked','anonymous');
  state.memoryAccountLinks[n.key('anonymous')]={sourceUid:'anonymous',targetUid:'phone'};
  await n.review(db,'linked','staff','approved','');
  assert.equal(n.publicBadge(state.memoryNumberRegistry.main,'anonymous').number,1);
  const historical=initial();delete historical.badgeKinds;delete historical.badgeProgress;
  n.award(historical,'old',123);n.ensureMemory(historical,'old-memory');
  const preserved=JSON.stringify([historical.badges,historical.memories,historical.badgeNext,historical.memoryNext]);
  const h=(id,uid,pointId,time,extra={})=>({...item(id,uid),pointId,status:'approved',humanReview:{decision:'approved'},humanReviewedAt:time,...extra});
  n.initializeAdditionalBadges(historical,[
    h('a','one','a',1000,{imageCount:1,writingStyleId:'childvoice',memoryType:'oral_history',contributionTags:['place_name']}),
    h('b','one','b',2000),h('c','one','c',3000),h('d','two','d',4000),h('e','two','e',5000)
  ]);
  assert.equal(JSON.stringify([historical.badges,historical.memories,historical.badgeNext,historical.memoryNext]),preserved);
  for(const kind of n.EXTRA_BADGES)assert.equal(n.publicBadge(historical,'one',kind).number,1);
  assert.equal(n.publicBadge(historical,'two','chengduLamplighter').number,2);
  assert.equal(n.publicBadge(historical,'two','cityWalker'),null);
  n.merge(historical,'one','two');
  for(const kind of n.EXTRA_BADGES)assert.equal(n.publicBadge(historical,'two',kind).number,1);
  assert.deepEqual(historical.badgeKinds.chengduLamplighter.retired,[2]);
  assert.throws(()=>n.initializeAdditionalBadges(historical,[]),{code:'BADGES_ALREADY_INITIALIZED'});
  console.log('PASS: concurrent allocation, retries, same-owner multiple memories, consent, rejected/pending, stable linkage, alias merge, no reuse, rollback and uncertain chronology label.');
})().catch(e=>{console.error(e);process.exitCode=1;});
