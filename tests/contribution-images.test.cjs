// Run: node tests/contribution-images.test.cjs
// The browser codec/canvas is mocked. Real phone decoding still needs a device check.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const images = require("../contribution-images.js");
const MB = 1024 * 1024;
const jpeg = Uint8Array.from([255,216,255,224,1,2,3]);
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
const heic = Uint8Array.from([0,0,0,24,...Buffer.from("ftypheic"),0,0,0,0,...Buffer.from("mif1heic")]);
const photo = (type = "image/jpeg", name = "相册.JPG", bytes = jpeg) => new File([bytes], name, { type });
let decodeFails = false, encodeFails = false, decoded = 0, drawn = [], revoked = 0;
const originalRevoke = URL.revokeObjectURL;
URL.revokeObjectURL = url => { revoked++; originalRevoke(url); };
global.Image = class {
  naturalWidth = 4032; naturalHeight = 3024;
  set src(value) {
    if (!value) return;
    decoded++;
    queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.());
  }
};
global.document = { createElement() {
  return { width: 0, height: 0,
    getContext() { return { fillRect() {}, drawImage(...args) { drawn.push(args.slice(-2)); } }; },
    toBlob(callback, type) { callback(encodeFails ? null : new Blob([jpeg], { type })); }
  };
} };

(async () => {
  const small = photo();
  assert.equal(await images.prepare(small), small); // Original bytes retained below 5 MB.
  assert.equal(drawn.length, 0);
  assert.equal((await images.prepare(photo(""))).type, "image/jpeg");
  assert.equal((await images.prepare(photo("application/octet-stream"))).type, "image/jpeg");
  assert.equal((await images.prepare(photo("image/jpg"))).type, "image/jpeg");
  assert.throws(() => images.validate([small,small,small,small]), /最多选择3/);
  assert.throws(() => images.validate([photo("image/jpeg","empty.jpg",[])]), /没有读到/);
  assert.throws(() => images.validate([{ name:"huge.jpg",type:"image/jpeg",size:21*MB }]), /超过20MB/);
  assert.doesNotThrow(() => images.validate([{ name:"camera.jpg",type:"image/jpeg",size:20*MB }]));
  assert.throws(() => images.validate([photo("image/svg+xml","x.svg")]), /格式不支持/);
  const beforeSpoof = decoded;
  await assert.rejects(images.prepare(photo("image/jpeg","fake.jpg",Buffer.from("<svg></svg>"))), /不是支持/);
  assert.equal(decoded, beforeSpoof); // Extension/MIME spoof rejected before decode/upload.
  assert.equal(images.detectType(png), "image/png");
  assert.equal(images.detectType(Uint8Array.from(Buffer.from("RIFF1234WEBP"))), "image/webp");
  const big = new File([jpeg, new Uint8Array(6*MB)], "big.jpg", { type:"image/jpeg" });
  const compressed = await images.prepare(big);
  assert.equal(compressed.type,"image/jpeg");
  assert.ok(compressed.size <= 5*MB);
  assert.deepEqual(drawn.at(-1),[2048,1536]);
  const converted = await images.prepare(photo("image/heic","IMG.HEIC",heic));
  assert.equal(converted.type,"image/jpeg"); assert.equal(converted.name,"IMG.jpg");
  decodeFails = true;
  const beforeFailure = revoked;
  await assert.rejects(images.prepare(photo("image/heic","IMG.HEIC",heic)), /HEIC.*JPG/);
  assert.equal(revoked,beforeFailure+1);
  decodeFails = false; encodeFails = true;
  await assert.rejects(images.prepare(big), /压缩未完成/);
  encodeFails = false;

  const script = fs.readFileSync(require.resolve("../script.js"),"utf8");
  const selection = script.slice(script.indexOf("function validateImages("), script.indexOf("function getFileExtension("));
  const nodes = Object.fromEntries(["#contributionPreview","#contributionStatus","#contributionImages","#contributionImageStatus"].map(id => [id,{textContent:"",innerHTML:"",classList:{remove(){},add(){},toggle(){}},setCustomValidity(value){this.validity=value;}}]));
  nodes["#contributionImages"].files=[{ name:"huge.jpg",type:"image/jpeg",size:21*MB }];
  nodes["#contributionImages"].value="selected-photo";
  const sel = vm.createContext({document:{querySelector:id=>nodes[id]},window:{tuhuiImages:images},clearPreviewUrls(){},Array,Error,selectedContributionFiles:[small]});
  vm.runInContext(selection,sel);
  let renders=0,saves=0;
  sel.renderSelectedMemoryImages=()=>renders++;
  sel.saveContributionDraft=()=>saves++;
  sel.handleImageSelection();
  assert.equal(sel.selectedContributionFiles.length,1);
  assert.match(nodes["#contributionImageStatus"].textContent,/超过20MB/);
  const input=nodes["#contributionImages"];
  input.files=[photo("image/jpeg","two.jpg")];sel.handleImageSelection();
  assert.equal(sel.selectedContributionFiles.length,2);
  input.files=[];sel.handleImageSelection();assert.equal(sel.selectedContributionFiles.length,2);
  input.files=[sel.selectedContributionFiles[1]];sel.handleImageSelection();assert.equal(sel.selectedContributionFiles.length,2);
  input.files=[photo("image/jpeg","three.jpg")];sel.handleImageSelection();assert.equal(sel.selectedContributionFiles.length,3);
  input.files=[photo("image/jpeg","four.jpg")];sel.handleImageSelection();assert.equal(sel.selectedContributionFiles.length,3);
  assert.match(nodes["#contributionImageStatus"].textContent,/最多选择3/);
  assert.equal(renders,3);assert.equal(saves,3);

  const source = script.slice(script.indexOf("async function uploadContributionImages("),script.indexOf("async function triggerContributionProcessing("));
  let uploads=0;
  const context=vm.createContext({window:{tuhuiImages:images},cloudApp:{async uploadFile(){uploads++;return {fileID:"cloud://test"};}},setContributionImageStatus(){},getFileExtension:()=>"jpg",createRandomId:()=>"test",Date,Error});
  vm.runInContext(source,context);
  await assert.rejects(context.uploadContributionImages({id:"test"},[small,photo("image/jpeg","fake.jpg",Buffer.from("bad"))],{}),/不是支持/);
  assert.equal(uploads,0); // A bad later photo cannot trigger partial uploads.
  const status={};
  await context.uploadContributionImages({id:"test"},[small],status);
  assert.equal(uploads,1);assert.match(status.textContent,/已上传 1/);
  context.cloudApp.uploadFile=async()=>{throw new Error("NETWORK_ERROR");};
  await assert.rejects(context.uploadContributionImages({id:"test"},[small],{}),/第 1 张照片上传失败.*NETWORK_ERROR/);
  console.log("PASS: size/count/type boundaries, MIME fallback, signature spoof, conversion/compression, codec errors, URL cleanup, retained selection, and upload sequencing");
})().catch(error=>{console.error(error);process.exitCode=1;});
