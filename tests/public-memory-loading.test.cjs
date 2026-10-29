// Regression: slow photo URL batches must not block the public list or erase other photos.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function harness(){let clock=100000,calls=0,images=0,active=0,peak=0;const batches=[];
 const context=vm.createContext({URL,console:{warn(){}},Date:{now:()=>clock},cloudReady:true,approvedMemoriesByPoint:new Map(),updateMapMemoryLayerCounts(){},normalizeFunctionResult:x=>x,
 cloudApp:{callFunction:async()=>{calls++;return {ok:true,memories:[{id:'public',status:'approved',pointId:'p',imageFileIds:['cloud://a']},{id:'hidden',status:'pending'}],nextCursor:null}},getTempFileURL:async({fileList})=>{images++;active++;peak=Math.max(peak,active);const d=deferred();batches.push({fileList,...d});const result=await d.promise;active--;return result;}}});
 vm.runInContext(slice('const memoryImageUrlCache =','/* ===============================================\n   我的城市记忆'),context);
 return {c:context,batches,clock:n=>clock+=n,calls:()=>calls,images:()=>images,peak:()=>peak};}
(async()=>{
 let h=harness();assert.equal(await h.c.loadApprovedMemories(),true);assert.equal(h.images(),0,'metadata must not wait for photos');assert.equal(h.c.approvedMemoriesByPoint.get('p').length,1);
 await h.c.loadApprovedMemories();assert.equal(h.calls(),1,'recent same-account list reused');h.clock(30001);await h.c.loadApprovedMemories();assert.equal(h.calls(),2,'refresh latest moderation/likes after 30 seconds');vm.runInContext('publicReadEpoch++',h.c);await h.c.loadApprovedMemories();assert.equal(h.calls(),3,'vote/account epoch invalidates response');
 h=harness();const rows=Array.from({length:101},(_,i)=>({imageFileIds:[`cloud://${i}`]}));const run=h.c.resolveMemoryImageUrls(rows);
 assert.equal(h.batches.length,2);assert(h.batches.every(b=>b.fileList.length<=50));
 const result=b=>({fileList:b.fileList.map(fileID=>({fileID,tempFileURL:`https://example.org/${fileID.slice(8)}`}))});
 h.batches[0].resolve(result(h.batches[0]));h.batches[1].resolve({fileList:[]});await new Promise(r=>setImmediate(r));assert.equal(h.batches.length,3);h.batches[2].resolve(result(h.batches[2]));const resolved=await run;
 assert.equal(h.peak(),2);assert(resolved[0].imageUrls[0]);assert.equal(resolved[50].imageUrls[0],'');assert(resolved[100].imageUrls[0]);assert.equal(rows[0].imageUrls,undefined,'original records unchanged');
 await h.c.resolveMemoryImageUrls([rows[0]]);assert.equal(h.images(),3,'signed URL reused within tab');h.clock(300001);const expired=h.c.resolveMemoryImageUrls([rows[0]]);assert.equal(h.images(),4);h.batches[3].resolve(result(h.batches[3]));await expired;
 const ctx=vm.createContext({URL});vm.runInContext(slice('function memoryPreviewUrl(', 'function renderPostCover('),ctx);
 const original='https://6368-chengdufu-map-d4g459au02132689e-1459591635.tcb.qcloud.la/a.jpg?sign=a%2Fb';assert.equal(ctx.memoryPreviewUrl(original),original+'&imageMogr2/thumbnail/640x/format/webp/quality/80');assert.equal(ctx.memoryPreviewUrl('https://other.example/a.jpg'),'https://other.example/a.jpg');assert.equal(ctx.memoryPreviewUrl('data:image/svg+xml,x'),'data:image/svg+xml,x');
 console.log('PASS: text before photos, 30-second refresh, epoch invalidation, max 50 files/batch and 2 batches in parallel, partial failure isolation, signed URL expiry, original records and signatures preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});
