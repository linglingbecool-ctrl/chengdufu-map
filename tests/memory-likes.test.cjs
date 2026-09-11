const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const publicMemory = {_id:'memory-a',status:'approved',consentToPublish:true,rightsConfirmed:true};
let state = {contributions:{'memory-a':publicMemory},memoryLikes:{},memoryLikeTotals:{}};
let queue = Promise.resolve(), failWrite = false, failRead = false;
const collection = (store, name) => ({
  doc(id) { return {
    async get() { if (failRead && name === 'memoryLikeTotals') return {code:'READ_ERROR'}; return {data:store[name][id] || null}; },
    async set(value) { if (failWrite && name === 'memoryLikeTotals') return {code:'WRITE_ERROR'}; store[name][id] = {_id:id,...value}; return {updated:1}; }
  };},
  where(query) { let limit=100; return {
    orderBy(){return this;}, limit(n){limit=n; return this;},
    async get() { return {data:Object.values(store[name]).filter(item => Object.entries(query).every(([key,val]) => val?.in ? val.in.includes(item[key]) : val?.gt ? item[key]>val.gt : item[key]===val)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit)}; }
  };}
});
const db = {
  collection(name){return collection(state,name);},
  command:{in:values=>({in:values}),gt:value=>({gt:value})},
  runTransaction(fn) {
    const run = queue.then(async () => { const draft = structuredClone(state); await fn({collection:name=>collection(draft,name)}); state=draft; });
    queue=run.catch(()=>{}); return run; // SDK may resolve void, not callback result.
  }
};
function load(path, uid) {
  const context={exports:{},console:{error(){}},require:name=>name==='@cloudbase/node-sdk'?{init:()=>({database:()=>db,auth:()=>({getUserInfo:()=>uid?{uid}:{}})})}:require(name)};
  vm.runInNewContext(fs.readFileSync(path,'utf8'),context);return context.exports.main;
}
(async()=>{
  const a=load('cloud-functions/setMemoryLike/index.js','alice');
  const b=load('cloud-functions/setMemoryLike/index.js','bob');
  const anon=load('cloud-functions/setMemoryLike/index.js');
  assert.equal((await anon({memoryId:'memory-a',liked:true,uid:'alice'})).code,'NOT_LOGIN');
  assert.equal((await a({memoryId:{$ne:''},liked:true})).code,'INVALID_INPUT');
  assert.equal((await a({memoryId:'missing',liked:true})).code,'NOT_PUBLIC');
  assert.equal((await a({memoryId:'memory-a',liked:false})).likeCount,0);
  const votes=await Promise.all([a({memoryId:'memory-a',liked:true}),a({memoryId:'memory-a',liked:true}),b({memoryId:'memory-a',liked:true,uid:'alice',likeCount:999})]);
  assert(votes.every(result=>result.ok));assert.equal(state.memoryLikeTotals['memory-a'].count,2);
  assert.equal(Object.values(state.memoryLikes).length,2);
  const readA=load('cloud-functions/getPublicMemories/index.js','alice');
  const readOther=load('cloud-functions/getPublicMemories/index.js','visitor');
  assert.equal((await readA({})).memories[0].likedByMe,true);
  assert.equal((await readOther({})).memories[0].likedByMe,false);
  assert.equal((await readOther({})).memories[0].likeCount,2);
  const unlike=await a({memoryId:'memory-a',liked:false});assert.equal(unlike.likeCount,1);
  assert.equal((await a({memoryId:'memory-a',liked:false})).likeCount,1);
  state.contributions['memory-a'].status='processing';
  assert.equal((await b({memoryId:'memory-a',liked:false})).code,'NOT_PUBLIC');
  assert.equal((await readA({})).memories.length,0);
  state.contributions['memory-a'].status='approved';
  failWrite=true;const before=JSON.stringify(state);assert.equal((await a({memoryId:'memory-a',liked:true})).ok,false);assert.equal(JSON.stringify(state),before);failWrite=false;
  failRead=true;assert.equal((await a({memoryId:'memory-a',liked:true})).ok,false);assert.equal(JSON.stringify(state),before);failRead=false;
  await b({memoryId:'memory-a',liked:false}); assert.equal(state.memoryLikeTotals['memory-a'].count,0);
  const script=fs.readFileSync('script.js','utf8');
  const helpers=script.slice(script.indexOf('function memoryLikeCount('),script.indexOf('async function setPublicMemoryLike('));
  const context=vm.createContext({});vm.runInContext(helpers,context);
  const sorted=context.sortPublicMemories([{id:'z',likeCount:2},{id:'b',likeCount:2},{id:'a',likeCount:-1},{id:'n'},{id:'h',likeCount:9}]);
  assert.equal(sorted.map(x=>x.id).join(','),'h,b,z,a,n');
  console.log('PASS: identity, public visibility, concurrent/idempotent votes, unlike, rollback, personalized reads and stable sorting');
})().catch(error=>{console.error(error);process.exitCode=1;});
