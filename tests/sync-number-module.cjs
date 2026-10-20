// Package one tested source into the independently deployed cloud functions.
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..','cloud-functions');
for(const name of ['getMyContributions','reviewContribution','processContribution','linkMemoryAccount']){
  fs.copyFileSync(path.join(root,'shared','memory-numbers.js'),path.join(root,name,'memory-numbers.js'));
}
console.log('Shared numbering module synchronized.');
