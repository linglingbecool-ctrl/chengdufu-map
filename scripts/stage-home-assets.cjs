// Stage public display assets only; never copy credentials, backend code, or the repository.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),destination=process.argv[2];
if(!destination)throw new Error('Usage: node scripts/stage-home-assets.cjs /absolute/staging-directory');
const target=path.resolve(destination);
if(target===root||target.startsWith(root+path.sep))throw new Error('Use a staging directory outside the repository');
execFileSync(process.execPath,[path.join(__dirname,'build-home-assets.cjs'),'--check'],{stdio:'inherit'});
for(const file of ['home.bundle.js','home.bundle.css','points.json','media/optimized','media/fonts/chengdu-map-kai.woff']){
 const output=path.join(target,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.cpSync(path.join(root,file),output,{recursive:true});
}
console.log('Staged public assets:',target);
