const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('analytics.js','utf8');
function harness({excluded=false,hidden=false,fail=false}={}){
 const listeners={},timers=[],calls=[],storage=new Map(excluded?[['tuhui-analytics-excluded-v1','1']]:[]);
 const document={hidden,addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const window={addEventListener:(name,fn)=>{listeners[name]=fn;},tuhuiCloudApp:{async callFunction(args){calls.push(args);if(fail&&calls.length===1)throw Error('network');return {result:{ok:true,status:'recorded'}};}}};
 const context={window,document,location:{pathname:'/'},navigator:{webdriver:false},crypto:require('node:crypto').webcrypto,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout:fn=>timers.push(fn)};
 vm.runInNewContext(source,context);
 return {listeners,timers,calls,document,storage,ready:()=>listeners['tuhui:cloud-ready']?.({detail:{ready:true}})};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const h=harness({fail:true});h.ready();await flush();assert.equal(h.calls.length,1);
 await h.timers.shift()();assert.equal(h.calls.length,2);assert.equal(h.calls[0].data.eventId,h.calls[1].data.eventId);
 h.ready();h.listeners.online();await flush();assert.equal(h.calls.length,2);
 assert.equal(h.calls[0].data.page,'home');assert(h.storage.has('tuhui-analytics-visitor-v1'));
 const x=harness({excluded:true});x.ready();await flush();assert.equal(x.calls.length,0);
 const hidden=harness({hidden:true});hidden.ready();await flush();assert.equal(hidden.calls.length,0);hidden.document.hidden=false;hidden.listeners.visibilitychange();await flush();assert.equal(hidden.calls.length,1);
 console.log('PASS: reused cloud app, stable retry event ID, one event per page, staff-browser exclusion and deferred hidden tabs');
})().catch(error=>{console.error(error);process.exitCode=1;});
