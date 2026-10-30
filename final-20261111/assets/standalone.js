const ASSET_ROOT="https://chengdufu-map-d4g459au02132689e-1459591635.tcloudbaseapp.com/final-20261111/assets/";
const $=s=>document.querySelector(s),ex=$('#exhibit'),detail=$('#detail');
let focusReturn=null;window.SHOW={};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function button(text,fn){const b=el('button','',text);b.type='button';b.addEventListener('click',fn);return b}
function picture(src,alt){const i=el('img');if(src)i.src=ASSET_ROOT+src;i.alt=alt;i.decoding='async';return i}
// Only visible motion cards request small thumbnails. Four requests at once suits a presentation venue's Wi-Fi.
// Full images are requested only after the visitor opens one story.
const photoCache=new Map(),photoQueue=[];let photoActive=0;
function queueThumbnail(img,file){if(img.dataset.loadingFile===file)return;img.dataset.loadingFile=file;img.dataset.file=file;const url=ASSET_ROOT+'thumbs/'+file.replace(/\.jpg$/,'.webp');
 if(!photoCache.has(url)){let resolve;const ready=new Promise(r=>resolve=r);photoCache.set(url,ready);photoQueue.push({url,resolve});pumpPhotos()}
 photoCache.get(url).then(ok=>{if(ok&&img.dataset.file===file)img.src=url});
}
function pumpPhotos(){while(photoActive<4&&photoQueue.length){const task=photoQueue.shift();photoActive++;const image=new Image();image.onload=()=>done(true);image.onerror=()=>done(false);image.src=task.url;function done(ok){photoActive--;task.resolve(ok);pumpPhotos()}}}
function openEx(){if(typeof stopMotion==='function')stopMotion();focusReturn=document.activeElement;$('#exhibitBody').replaceChildren();if(!ex.open)ex.showModal()}
function head(k,title,meta){const h=el('header','ex-head'),d=el('div');d.append(el('p','eyebrow',k),el('h1','',title));if(meta)d.append(el('p','meta',meta));h.append(d);$('#exhibitBody').append(h);return h}
function memories(){openEx();const h=head('城市记忆 · 公众共建','让每一份记忆，都有回响','公开内容快照 · 2026年10月29日 · 每张卡片对应一条记录');h.append(el('div','stats','76 份公开记忆 / 105 张照片'));
 const f=el('div','filters'),wall=el('div','memorywall');$('#exhibitBody').append(f,wall);const names=['全部',...new Set(MEMORIES.map(x=>x.place))];
 function draw(name){wall.replaceChildren();f.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.textContent===name));MEMORIES.filter(m=>name==='全部'||m.place===name).forEach(m=>{const b=button('',()=>story(m));b.className='memory';b.dataset.id=m.id;b.setAttribute('aria-label',`${m.place}，${m.time}，查看记忆`);if(m.image){const im=picture('thumbs/'+m.image.replace(/\.jpg$/,'.webp'),m.place+'的公开记忆照片');im.loading='lazy';im.width=320;im.height=240;b.append(im)}else b.append(el('div','excerpt',m.text.slice(0,100)));const c=el('span','caption');c.append(el('strong','',m.place),el('small','',`${m.time} · ${m.imageCount?'含'+m.imageCount+'张照片':'文字记忆'}`));b.append(c);wall.append(b)})}
 names.forEach(n=>f.append(button(n,()=>draw(n))));draw('全部');
}
function story(m){if(!m)return;focusReturn=document.activeElement;const d=$('#detailBody');d.replaceChildren();const s=el('article','story'+(m.image?'':' noimage'));if(m.image)s.append(picture(m.image,m.place+'的投稿照片'));const t=el('div');t.append(el('p','eyebrow','公众讲述'),el('h1','',m.place),el('p','meta',m.time),el('p','text',m.text||'这份公开记忆以照片记录当时的画面。'),el('p','meta','经审核公开的原文快照；展示该记录的首张照片。'));s.append(t);d.append(s);if(!detail.open)detail.showModal()}
$('#backMotion').onclick=()=>movingExhibit(document.body.dataset.mode==='helix'?'helix':'scroll');detail.querySelector('.close').onclick=()=>detail.close();detail.addEventListener('close',()=>focusReturn?.focus());ex.addEventListener('cancel',e=>{e.preventDefault();movingExhibit(document.body.dataset.mode==='helix'?'helix':'scroll')});
