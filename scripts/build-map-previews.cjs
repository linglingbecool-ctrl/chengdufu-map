// Rebuild responsive display copies; archival and photo-export assets stay untouched.
// NODE_PATH may point at the existing workspace runtime containing sharp.
const path=require('node:path'),fs=require('node:fs'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const width of [640,960,1440]){
  const target=path.join(root,`media/optimized/chengdu-map-${width}.webp`);
  await sharp(path.join(root,'chengdu-map-original.jpg')).resize({width,withoutEnlargement:true}).webp({quality:70,effort:6}).toFile(target);
  console.log(width,fs.statSync(target).size,'bytes');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
