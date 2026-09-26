const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('cloud-functions/askEvidenceQuestion/index.js', 'utf8');
const fragment = {fragment_id:'wuhouci_1',point_id:'wuhouci',source_title:'《成都街巷志》',pdf_page_start:299,evidence_level:'A',normalized_summary:'1902年赵藩撰写攻心联。',source_type:'in-copyright'};
function harness(code) {
  const query = (data) => ({limit(){return this},where(){return this},doc(){return this},async get(){return {data}},async set(){},async update(){}});
  const db = {command:{inc:n=>n},serverDate:()=>new Date(),collection:name=>query(name==='source_fragments'?[fragment]:[])};
  const context = {exports:{}, console:{warn(){}}, Date, require:name=>name==='crypto'?require(name):name==='@cloudbase/node-sdk'?{init:()=>({database:()=>db})}:{PROVIDER_CONFIG:{modelId:'test'},callModel:async()=>{if(code==='invalid')return {content:'not-json'};if(code==='missing-conclusion')return {content:'{"decision":"supported"}'};throw Object.assign(new Error(code),{code})}}};
  vm.runInNewContext(source,context); return context.exports.main;
}
(async()=>{
  for(const code of ['MODEL_TIMEOUT','MODEL_BUSY','MODEL_NOT_CONFIGURED','MODEL_AUTH_FAILED','MODEL_EMPTY_RESPONSE','invalid','missing-conclusion']) {
    const result = await harness(code)({question:'武侯祠攻心联由谁撰写？',pointId:'wuhouci'});
    assert.equal(result.ok,true,code);assert.equal(result.route,'raw-evidence');assert.match(result.answer,/赵藩/);assert.match(result.answer,/不生成综合结论/);
  }
  assert.equal((await harness('MODEL_BUSY')({question:'哪年建成的？',pointId:'wuhouci'})).route,'raw-evidence');
  assert.equal((await harness('unused')({question:'？'})).code,'INVALID_QUESTION');
  assert.equal((await harness('unused')({question:'火星天气预报'})).route,'out-of-scope');
  // 429只请求一次，不将一次排队拖成两轮完整等待。
  let calls=0,cleared=0;
  const providerContext={module:{exports:{}},process:{env:{ZHIPU_API_KEY:'test-only'}},AbortController,setTimeout:()=>1,clearTimeout:()=>cleared++,fetch:async()=>{calls++;return {status:429,headers:{get:()=>null}}}};
  vm.runInNewContext(fs.readFileSync('cloud-functions/askEvidenceQuestion/provider.js','utf8'),providerContext);
  await assert.rejects(providerContext.module.exports.callModel([]),{code:'MODEL_BUSY'});
  assert.equal(calls,1);assert.equal(cleared,1);
  // 前端本地回退只引用已有记录，不将网络失败等同于没有史料。
  const ui = fs.readFileSync('ai-guide.js','utf8');
  const start=ui.indexOf('  function localEvidenceFallback('),end=ui.indexOf('  async function sendQuestion(',start);
  const local={window:{}};vm.runInNewContext(fs.readFileSync('evidence-data.js','utf8'),local);
  local.pointQuestions={wuhouci:{name:'武侯祠'},jiuyanqiao:{name:'九眼桥'}};
  vm.runInNewContext(ui.slice(start,end),local);
  assert.match(local.localEvidenceFallback('武侯祠攻心联是谁写的','jiuyanqiao'),/赵藩/);
  assert.match(local.localEvidenceFallback('火星天气','wuhouci'),/不代表问题没有答案/);
  assert.doesNotMatch(local.localEvidenceFallback('火星天气','wuhouci'),/赵藩/);
  console.log('PASS: 7 model failure routes, scope/input boundaries, single bounded request, local evidence fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
