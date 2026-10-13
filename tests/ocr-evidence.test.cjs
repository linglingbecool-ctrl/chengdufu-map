const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('cloud-functions/askEvidenceQuestion/index.js', 'utf8');
function harness(records, cache = []) {
  let modelPayload;
  const db = {command:{inc:n=>n},serverDate:()=>new Date(),collection(name){
    let skip=0,limit=1000,id;
    return {orderBy(){return this},skip(n){skip=n;return this},limit(n){limit=n;return this},where(){return this},doc(v){id=v;return this},
      async get(){return {data:name==='source_fragments'?records.slice(skip,skip+limit):cache.filter(x=>!id||x._id===id)}},async set(){},async update(){}};
  }};
  const ctx = {exports:{},console,Date,require:name=>name==='crypto'?require(name):name==='@cloudbase/node-sdk'?{init:()=>({database:()=>db})}:{PROVIDER_CONFIG:{modelId:'test'},callModel:async messages=>{modelPayload=JSON.parse(messages[1].content);throw new Error('MODEL_BUSY')}}};
  vm.runInNewContext(source,ctx);return {ctx,main:ctx.exports.main,getPayload:()=>modelPayload};
}
(async()=>{
  const records=Array.from({length:1001},(_,i)=>({_id:`other${i}`,fragment_id:`other${i}`,normalized_summary:'不相关材料'}));
  const ocr={_id:'ocr_test',fragment_id:'ocr_test',record_type:'ocr_chunk',source_title:'《成都街巷志》',source_edition:'2010年版',section:'支矶石街',source_sha256:'v1',source_line_start:101,source_line_end:109,excerpt:'支矶石街的名称来自支矶石。',verification_status:'OCR待核，未逐页校勘',evidence_level:'C'};
  records.push(ocr);
  const h=harness(records);const r=await h.main({question:'支矶石街的名称由来',pointId:'wuhouci'});
  assert.equal(r.ok,true);assert.ok(r.evidenceIds.includes('ocr_test'),'records after page one are searched');
  assert.match(r.answer,/OCR原文件第101—109行/);assert.match(r.answer,/OCR待核/);assert.doesNotMatch(r.answer,/PDF第101/);
  assert.ok(h.getPayload().evidence_records_json.some(x=>x.evidenceText.includes('来自支矶石')));
  const revision=(await h.ctx.loadCorpus()).revision;
  assert.notEqual(revision,(await harness([...records,{...ocr,_id:'new',source_sha256:'v2'}]).ctx.loadCorpus()).revision);
  const stale={_id:h.ctx.cacheId('wuhouci',h.ctx.normalizeQuestion('支矶石街的名称由来'),revision),answer:'旧无证据答案',corpusRevision:'old',questionTokens:h.ctx.buildTokens('支矶石街的名称由来')};
  assert.equal(await harness(records,[stale]).ctx.findCachedAnswer('wuhouci',h.ctx.normalizeQuestion('支矶石街的名称由来'),stale.questionTokens,revision),null);
  assert.equal((await h.main({question:'火星天气预报'})).route,'out-of-scope');
  const newBook = {...ocr,_id:'photo_book',fragment_id:'photo_book',source_title:'《成都百年影像》',source_edition:'扫描本',pdf_page_start:11,pdf_page_end:11,pdf_side:'right',section:'引言',excerpt:'成都百年影像中记载大慈寺的照片。'};
  const fresh = harness([ocr,newBook]);
  const result = await fresh.ctx.retrieveEvidence('《成都百年影像》中大慈寺有什么记载？','wuhouci');
  assert.deepEqual(Array.from(result.evidence,x=>x.fragmentId),['photo_book']);
  assert.equal(result.evidence[0].page,'PDF第11页（右页）');
  assert.ok(!result.tokens.includes('成都百年影像'));
  const wrongBookCache={answer:'另一本书的回答',corpusRevision:result.revision,sourceScope:'成都街巷志',questionTokens:Array.from(result.tokens)};
  assert.equal(await harness([ocr,newBook],[wrongBookCache]).ctx.findCachedAnswer('', 'different-normalized-question', result.tokens, result.revision, result.sourceScope),null);

  console.log('PASS: pagination, all-book retrieval, OCR excerpt and honest citation, corpus cache invalidation, unrelated questions');
})().catch(e=>{console.error(e);process.exitCode=1});
