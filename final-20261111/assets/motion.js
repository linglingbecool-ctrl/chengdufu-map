// A single clock drives both exhibits. Dialogs pause the clock, so close resumes at the exact position.
let motionRun=null;
function stopMotion(){if(motionRun){cancelAnimationFrame(motionRun.raf);motionRun=null}ex.classList.remove('motion-exhibit')}
function movingExhibit(mode='scroll'){
 openEx();stopMotion();ex.classList.add('motion-exhibit');
 const root=el('section','motion-room '+mode),intro=el('div','motion-intro');
 intro.append(el('p','motion-overline','舆上·成都  /  城市记忆展'),el('h1','',mode==='scroll'?'把生活\n写进长卷':'与一座城的\n记忆相遇'),el('p','motion-description',mode==='scroll'?'照片随画轴徐徐展开。\n轻触一张，读一段成都往事。':'循着照片漫游。\n从别人的故事，遇见自己的成都。'));
 const counts=el('p','motion-count');counts.innerHTML='<strong>76</strong> 份公开记忆<br><span>105 张照片 · 截至2026年10月29日</span>';intro.append(counts);
 const stage=el('div','motion-stage');stage.setAttribute('aria-label',mode==='scroll'?'持续展开的照片画轴':'持续旋转的立体照片环廊');
 const world=el('div','motion-world');stage.append(world);const floor=el('div','motion-floor');stage.append(floor);
 const controls=el('nav','motion-controls');controls.setAttribute('aria-label','动态展示控制');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const run={mode,phase:0,last:performance.now(),manual:reduced,raf:0,cards:[],dragging:false};motionRun=run;
 const pause=button(reduced?'继续流动':'暂停流动',()=>{run.manual=!run.manual;sync()});
 const switcher=button(mode==='scroll'?'切换立体环廊':'切换流动画轴',()=>movingExhibit(mode==='scroll'?'helix':'scroll'));
 const previous=button('上一组',()=>{run.phase-=1.4;paint()}),next=button('下一组',()=>{run.phase+=1.4;paint()});
 controls.append(pause,switcher,previous,next,button('全部记忆',memories));
 const hint=el('p','motion-hint','点击照片暂停阅读，关闭后继续 · 拖动可浏览');const status=el('span','motion-status','');status.setAttribute('aria-live','polite');controls.append(status);
 root.append(intro,stage,controls,hint);$('#exhibitBody').append(root);
 // 60 photo-bearing records, one first photo per record. Never duplicate records to imply extra participation.
 const sourcePhotos=MEMORIES.filter(m=>m.image);const photos=sourcePhotos.map((_,i)=>sourcePhotos[(i*17)%sourcePhotos.length]);const family=photos.findIndex(m=>m.text.includes('1978年川大荷花池'));if(family>0)photos.unshift(photos.splice(family,1)[0]);const n=mode==='scroll'?15:27;
 for(let i=0;i<n;i++){const card=button('',()=>{if(run.dragged)return;card.classList.add('extracted');story(card.record);detail.classList.add('drawn-card');sync()});card.className='motion-card';card.append(picture(null,''));const caption=el('span','motion-caption');card.append(caption);world.append(card);run.cards.push(card)}
 function sync(){const stopped=run.manual||detail.open;root.classList.toggle('is-paused',stopped);pause.textContent=run.manual?'继续流动':'暂停流动';status.textContent=detail.open?'阅读中 · 画面已暂停':run.manual?'已暂停':'正在流动'}
 function paint(){if(motionRun!==run)return;const w=stage.clientWidth,h=stage.clientHeight,mobile=w<620,scale=Math.min(w/950,h/760,1.12);world.style.transform=`scale(${scale})`;
  const spacing=mode==='scroll'?190:114,span=n*spacing,travel=run.phase*spacing;
  run.cards.forEach((card,i)=>{const base=i*spacing-travel,wrap=Math.floor((base+span/2)/span),y=base-wrap*span;
   const index=((i-wrap*n)%photos.length+photos.length)%photos.length,m=photos[index];
   if(card.record!==m){card.record=m;card.querySelector('img').dataset.file=m.image;card.querySelector('img').alt=m.place+'的公开记忆照片';card.querySelector('.motion-caption').textContent=m.place+'  /  '+m.time;card.setAttribute('aria-label',m.place+'，'+m.time+'，暂停并阅读故事');card.dataset.record=m.id}
   let x,z,ry,rx,rz=0;
   if(mode==='scroll'){
    const a=y/460;x=Math.sin(a)*220;z=Math.cos(a)*140;ry=-Math.cos(a)*24;rx=Math.sin(a)*40;rz=Math.cos(a)*-7;
    card.style.width='350px';card.style.height='204px';
   }else{const a=i*(Math.PI/3.25)-run.phase*.45;x=Math.sin(a)*365;z=Math.cos(a)*275;ry=Math.sin(a)*-32;rx=-7;rz=Math.sin(a)*5;card.style.width='245px';card.style.height='183px';}
   const edge=Math.max(0,Math.min(1,(660-Math.abs(y))/150));const depth=mode==='helix'?.37+.63*((z+275)/550):1;
   if(edge>.05)queueThumbnail(card.querySelector('img'),m.image);
   card.style.transform=`translate3d(${x}px,${y}px,${z}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg)`;
   card.style.opacity=edge*depth;card.style.filter=mode==='helix'&&z<-120?'saturate(.65) brightness(.68)':'none';card.style.visibility=edge===0?'hidden':'visible';card.style.pointerEvents=edge>.45?'auto':'none';card.tabIndex=edge>.6&&z>-50?0:-1;
  });root.dataset.phase=run.phase.toFixed(4);
 }
 function frame(now){const dt=Math.min((now-run.last)/1000,.05);run.last=now;if(motionRun!==run)return;if(!run.manual&&!detail.open&&!document.hidden&&!run.dragging)run.phase+=dt*(mode==='scroll'?.29:.34);paint();run.raf=requestAnimationFrame(frame)}
 let down=null;stage.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,phase:run.phase};run.dragged=false});
 stage.addEventListener('pointermove',e=>{if(!down||detail.open)return;const d=(e.clientY-down.y)+(e.clientX-down.x)*.45;if(Math.abs(d)>8){run.dragged=true;run.dragging=true;run.phase=down.phase-d/170;paint()}});
 const release=()=>{down=null;run.dragging=false;setTimeout(()=>run.dragged=false,0)};stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('pointerleave',release);
 stage.addEventListener('wheel',e=>{e.preventDefault();run.phase+=e.deltaY/450;paint()},{passive:false});
 run.sync=sync;sync();paint();run.raf=requestAnimationFrame(frame);
}
ex.addEventListener('close',stopMotion);
detail.addEventListener('close',()=>{detail.classList.remove('drawn-card');document.querySelectorAll('.extracted').forEach(e=>e.classList.remove('extracted'));if(motionRun){motionRun.last=performance.now();motionRun.sync()}});
window.SHOW.movingExhibit=movingExhibit;
movingExhibit(document.body.dataset.mode==='helix'?'helix':'scroll');
