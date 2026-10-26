// Regression: 100 posts can exceed CloudBase's 50-file request limit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../admin.js'), 'utf8');
const code = source.slice(source.indexOf('async function resolveImageUrls('), source.indexOf('function revokeAdminAccess('));
const rows = n => Array.from({length:n}, (_,i) => ({id:`post-${i}`,status:i%2?'approved':'pending',imageFileIds:[`cloud://image-${i}`]}));
async function run(items, request) {
  const context = vm.createContext({cloudApp:{getTempFileURL:request},console:{warn(){}}});
  vm.runInContext(code,context);
  return context.resolveImageUrls(items);
}
(async () => {
  for (const count of [0,1,50,51,100,101,300]) {
    const calls=[];
    const input=rows(count), before=JSON.stringify(input);
    const output=await run(input,async ({fileList}) => {
      assert(fileList.length<=50,'CloudBase rejects more than 50 files');
      calls.push(fileList.length);
      return {fileList:fileList.map(fileID=>({fileID,tempFileURL:`https://example.com/${fileID.slice(8)}.jpg`}))};
    });
    assert.equal(calls.length,Math.ceil(count/50));
    assert.equal(output.filter(item=>item.imageUrls.length===1).length,count);
    assert.equal(JSON.stringify(input),before,'must not mutate original records or review status');
  }
  const input=rows(101);input[0].imageFileIds.push(input[0].imageFileIds[0]);
  let calls=0;
  const output=await run(input,async ({fileList})=>{
    calls++;if(calls===2)throw Error('network failed');
    return {result:{fileList:fileList.map(file_id=>({file_id,download_url:`https://example.com/${file_id}`}))}};
  });
  assert.equal(calls,3,'deduplicate requests');
  assert.equal(output[0].imageUrls.length,2,'preserve photo order');
  assert.equal(output[50].imageUrls.length,0);
  assert.equal(output[100].imageUrls.length,1,'failed batch must not prevent later batches');
  const fallback={imageFileIds:['cloud://x'],imageUrls:['https://example.com/existing.jpg']};
  const [kept]=await run([fallback],async()=>({fileList:[{fileID:'cloud://x',code:'FAILED'}]}));
  assert.equal(kept.imageUrls[0],fallback.imageUrls[0],'retain existing URL on per-file error');
  const legacy={imageUrls:['https://example.com/legacy.jpg']};
  assert.equal((await run([legacy],()=>{throw Error('not called')}))[0],legacy);
  console.log('PASS admin images: 0–300 files, 50-file limit, ordering, deduplication, failed batches, fallback, unchanged records');
})().catch(error=>{console.error(error);process.exitCode=1;});
