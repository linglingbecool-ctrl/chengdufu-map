const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const logic=source.slice(source.indexOf('function memoryLikeCount('),source.indexOf('function renderPublicArchiveCards('));
function harness() {
  const memory={id:'a',likeCount:0,likedByMe:false}, status={textContent:''};
  const button={dataset:{publicLike:'a'},disabled:false,textContent:'',getBoundingClientRect:()=>({top:10}),setAttribute(key,val){this[key]=val;},focus(){},closest:()=>card};
  const card={dataset:{publicMemoryId:'a'},querySelector:selector=>selector==='[data-like-status]'?status:button};
  const content={scrollTop:0,querySelectorAll:()=>[card],appendChild(){}};
  const panel={querySelector:()=>content};
  const doc={activeElement:button,querySelector:()=>panel,querySelectorAll:()=>[button]};
  let resolve, reject, calls=0;
  const context=vm.createContext({document:doc,publicLikePending:new Map(),publicReadEpoch:0,publicAccountEpoch:0,publicArchivePlaces:new Map(),approvedMemoriesByPoint:new Map([['point',[memory]]]),cloudReady:true,cloudApp:{callFunction:()=>{calls++;return new Promise((res,rej)=>{resolve=res;reject=rej;});}},normalizeFunctionResult:x=>x});
  vm.runInContext(logic,context);
  return {context,memory,button,status,calls:()=>calls,resolve:r=>resolve(r),reject:e=>reject(e)};
}
(async()=>{
  let h=harness();const first=h.context.setPublicMemoryLike(h.button);await h.context.setPublicMemoryLike(h.button);
  assert.equal(h.calls(),1);assert.equal(h.button.disabled,true);assert.equal(h.memory.likeCount,0);
  h.resolve({ok:true,likeCount:1,likedByMe:true});await first;
  assert.equal(h.memory.likeCount,1);assert.equal(h.button['aria-pressed'],'true');assert.equal(h.button.disabled,false);
  const cancel=h.context.setPublicMemoryLike(h.button);h.resolve({ok:true,likeCount:0,likedByMe:false});await cancel;assert.equal(h.memory.likeCount,0);
  h=harness();const bad=h.context.setPublicMemoryLike(h.button);h.reject(new Error('网络断开'));await bad;
  assert.equal(h.memory.likeCount,0);assert.equal(h.button.disabled,false);assert.equal(h.status.textContent,'网络断开');
  const retry=h.context.setPublicMemoryLike(h.button);h.resolve({ok:true,likeCount:1,likedByMe:true});await retry;assert.equal(h.memory.likeCount,1);
  h=harness();const stale=h.context.setPublicMemoryLike(h.button);h.context.publicAccountEpoch++;h.resolve({ok:true,likeCount:1,likedByMe:true});await stale;assert.equal(h.memory.likeCount,0);
  console.log('PASS: duplicate click guard, authoritative count, cancel, network retry and account-switch stale response');
})().catch(error=>{console.error(error);process.exitCode=1;});
