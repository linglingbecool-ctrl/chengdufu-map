const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../script.js'),'utf8');
const prompt='请用一两句话介绍照片拍摄的地点、时间或画面内容。';
const nodes=new Map();let focused=false,saved=0,steps=[];
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,textContent:'',classList:{remove(){},add(){}},focus(){focused=true;}});return nodes.get(id);};
const modal={querySelector:node};
const ctx=vm.createContext({
 document:{querySelector:id=>id==='#contributionModal'?modal:node(id)},
 contributionStep:0,selectedContributionFiles:[{}],activeContributionPoint:{id:'test'},
 currentRewriteAccepted:false,currentRewriteDraft:'',selectedWritingStyle:'original',
 getSelectedImages:()=>ctx.selectedContributionFiles,getWritingStyle:()=>({}),
 saveContributionDraft(){saved++},showMemoryStep(step){ctx.contributionStep=step;steps.push(step);node('#contributionStatus').textContent='';},
 isValidContributionContact:()=>true,pointPickerName:()=>'',renderPostCover:()=>'',
});
vm.runInContext(source.slice(source.indexOf('function validateContributionContent('),source.indexOf('function clearPreviewUrls(')),ctx);
vm.runInContext(source.slice(source.indexOf('function syncMemoryCover('),source.indexOf('function showMemoryStep(')),ctx);
// Compile the actual submit handler without running the rest of the application.
const start=source.indexOf('async function handleContributionSubmit(');
const handler=source.slice(start,source.indexOf('async function loadPoints(',start));
vm.runInContext(handler,ctx);
(async()=>{
 for(const blank of ['', ' \n\t　']){
  node('#contributionContent').value=blank;ctx.contributionStep=0;focused=false;
  ctx.advanceMemoryStep();assert.equal(ctx.contributionStep,0);assert.equal(node('#contributionStatus').textContent,prompt);assert(focused);
  ctx.contributionStep=1;
  await ctx.handleContributionSubmit({preventDefault(){}});
  assert.equal(ctx.contributionStep,0,'final submit must reject blank captions before upload or DB access');
  assert.equal(node('#contributionStatus').textContent,prompt);
 }
 node('#contributionContent').value='2024年秋天拍摄的望江校区荷花池。';
 ctx.advanceMemoryStep();assert.equal(ctx.contributionStep,1);assert.equal(saved,1);
 ctx.syncMemoryCover();assert.equal(node('#contributionContentLabel').textContent,'图片说明（必填）');assert.equal(node('#contributionContentHelp').hidden,false);assert.equal(node('#contributionContent').placeholder,prompt);
 const story=node('#contributionContent').value;
 ctx.selectedContributionFiles=[];ctx.syncMemoryCover();assert.equal(node('#contributionContent').value,story);assert.equal(node('#contributionContentHelp').hidden,true);
 ctx.contributionStep=0;ctx.advanceMemoryStep();assert.equal(ctx.contributionStep,1,'text-only stories still work');
 ctx.contributionStep=0;node('#contributionContent').value='';ctx.advanceMemoryStep();assert.equal(node('#contributionStatus').textContent,'请填写一段记忆。');
 console.log('PASS: blank/whitespace captions blocked at both steps before upload; existing stories accepted; photo/text labels switch without clearing text');
})().catch(e=>{console.error(e);process.exitCode=1});
