/* Moderated text comments. No client-side status can make a comment public. */
(()=>{
  "use strict";
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date=x=>new Date(x).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});
  let epoch=0;
  window.addEventListener("tuhui:account-changed",()=>{epoch++;document.querySelectorAll(".memory-comments form").forEach(f=>f.reset());});
  async function call(app,data){
    if(!app?.callFunction)throw Error("网站尚未连接，请稍后重试。");
    const response=await app.callFunction({name:"memoryComments",data,parse:true});
    // Web SDK v3 may return a function's error envelope directly; v2 wraps it.
    let result=response?.result??response;if(typeof result==="string")result=JSON.parse(result);
    if(!result?.ok)throw Error(result?.message||"评论服务暂不可用，请稍后重试。");
    return result;
  }
  function markup(id){
    const prefix=`comment-${id}`;
    return `<section class="memory-comments" data-comment-memory="${esc(id)}" aria-label="这篇记忆的评论">
      <div class="memory-comments__heading"><h3>评论 · 记忆的回声</h3><button type="button" data-comments-refresh>刷新评论</button></div>
      <p class="memory-comments__hint">每条评论都经馆员审核后公开。</p>
      <div data-comments-list></div><p data-comments-status role="status" aria-live="polite"></p>
      <button type="button" data-comments-more hidden>查看更多评论</button>
      <form class="memory-comment-form">
        <label for="${esc(prefix)}-name">你的称呼（选填，公开展示）</label>
        <input id="${esc(prefix)}-name" name="nickname" maxlength="20" autocomplete="off" placeholder="不填则显示“读者”">
        <label for="${esc(prefix)}-text">留下你的感受</label>
        <textarea id="${esc(prefix)}-text" name="text" rows="4" maxlength="500" required placeholder="分享与这份记忆有关的感受或补充，最多 500 字。"></textarea>
        <label class="memory-comment-consent"><input type="checkbox" name="consent" required><span>我同意将评论及称呼在馆员审核通过后公开，不填写电话、住址等私人信息。</span></label>
        <button type="submit">提交评论，等待审核</button>
        <p data-comment-result role="status" aria-live="polite"></p>
      </form></section>`;
  }
  function mount(section,app){
    if(!section||section.dataset.mounted)return;
    section.dataset.mounted="true";
    const current=epoch,memoryId=section.dataset.commentMemory,alive=()=>current===epoch&&section.isConnected;
    const list=section.querySelector("[data-comments-list]"),status=section.querySelector("[data-comments-status]");
    const more=section.querySelector("[data-comments-more]"),refresh=section.querySelector("[data-comments-refresh]");
    const form=section.querySelector("form"),outcome=section.querySelector("[data-comment-result]");
    let cursor=null,loading=false,sending=false,request=null,items=[];
    async function load(append=false){
      if(loading)return;loading=true;more.disabled=refresh.disabled=true;status.textContent="正在读取评论…";
      try{
        const result=await call(app,{action:"list",memoryId,cursor:append?cursor||"":""});
        if(!alive())return;
        if(!Array.isArray(result.items))throw Error("评论列表读取失败。");
        items=append?[...items,...result.items]:result.items;cursor=result.nextCursor;
        items=[...new Map(items.map(c=>[c.id,c])).values()];
        list.innerHTML=items.map(c=>`<article class="memory-comment"><header><strong>${esc(c.nickname)}</strong><time>${esc(date(c.createdAt))}</time></header><p>${esc(c.text)}</p></article>`).join("");
        status.textContent=items.length?`已显示 ${items.length} 条公开评论。`:"暂无公开评论，欢迎留下你的感受。";
        more.hidden=!cursor;
      }catch(e){if(alive())status.textContent=`${e.message} 已有内容保留，可点击“刷新评论”重试。`;}
      finally{loading=false;if(alive())more.disabled=refresh.disabled=false;}
    }
    refresh.onclick=()=>load();more.onclick=()=>load(true);
    form.onsubmit=async event=>{
      event.preventDefault();if(sending||!form.reportValidity())return;
      const body={memoryId,text:form.elements.text.value.trim(),nickname:form.elements.nickname.value.trim(),consent:form.elements.consent.checked};
      if(!body.text){outcome.textContent="请先填写评论内容。";return;}
      const signature=JSON.stringify(body);
      if(request?.signature!==signature)request={signature,id:crypto.randomUUID()};
      sending=true;Array.from(form.elements).forEach(el=>el.disabled=true);outcome.textContent="正在提交，请稍候…";
      try{
        await call(app,{action:"submit",...body,requestId:request.id});
        if(!alive())return;
        form.reset();request=null;outcome.textContent="评论已保存，馆员审核通过后公开，无需重复提交。";
      }catch(e){if(alive())outcome.textContent=`${e.message} 文字已保留，重试不会重复提交。`;}
      finally{sending=false;if(alive())Array.from(form.elements).forEach(el=>el.disabled=false);}
    };
    void load();
  }
  function mountAdmin(section,app){
    if(!section||section.dataset.mounted)return;section.dataset.mounted="true";
    const list=section.querySelector("[data-comment-queue]"),status=section.querySelector("[data-comment-queue-status]");
    const filter=section.querySelector("[data-comment-filter]"),refresh=section.querySelector("[data-comment-queue-refresh]"),more=section.querySelector("[data-comment-queue-more]");
    let items=[],cursor=null,busy=false;const notes=new Map();
    const preserve=()=>list.querySelectorAll("[data-comment-note]").forEach(el=>notes.set(el.dataset.commentNote,el.value));
    const render=()=>{
      list.innerHTML=items.map(c=>`<article class="comment-review-card" data-comment-id="${esc(c.id)}">
        <header><h3>${esc(c.pointName)}</h3><span>${esc({pending:"待审核",approved:"已公开",rejected:"不予公开"}[c.status])}</span></header>
        <details><summary>查看原帖文字 · ${c.parentPublic?"当前公开":"当前未公开"}</summary><p>${esc(c.parentText)}</p><small>帖子编号：${esc(c.memoryId)}</small></details>
        <p class="comment-review-author">${esc(c.nickname)} · ${esc(date(c.createdAt))}</p>
        <p class="comment-review-text">${esc(c.text)}</p>
        ${c.status!=="rejected"?`<label>审核备注（不公开）<textarea data-comment-note="${esc(c.id)}" maxlength="300" rows="2">${esc(notes.get(c.id)||"")}</textarea></label>
        <div class="review-actions">${c.status==="pending"?`<button class="btn primary" type="button" data-comment-decision="approved" ${!c.parentPublic?"disabled":""}>通过并公开</button>`:""}<button class="btn ghost" type="button" data-comment-decision="rejected">${c.status==="approved"?"撤回公开":"不予公开"}</button></div>`:""}
        ${c.reviewedAt?`<p>处理时间：${esc(date(c.reviewedAt))}${c.note?` · ${esc(c.note)}`:""}</p>`:""}
        <p data-comment-review-result role="status" aria-live="polite"></p>
      </article>`).join("");
    };
    async function load(append=false){
      if(busy)return;busy=true;preserve();filter.disabled=refresh.disabled=more.disabled=true;
      status.textContent="正在读取评论审核列表…";
      try{
        const result=await call(app,{action:"queue",status:filter.value,cursor:append?cursor||"":""});
        if(!Array.isArray(result.items))throw Error("评论列表读取失败。");
        items=append?[...items,...result.items]:result.items;cursor=result.nextCursor;render();
        more.hidden=!cursor;status.textContent=items.length?`当前已加载 ${items.length} 条评论。`:"当前分类暂无评论。";
      }catch(e){status.textContent=e.message+"；保留上次列表和备注，请刷新重试。";}
      finally{busy=false;filter.disabled=refresh.disabled=more.disabled=false;}
    }
    list.addEventListener("click",async event=>{
      const button=event.target.closest("[data-comment-decision]");if(!button||busy)return;
      const card=button.closest("[data-comment-id]"),item=items.find(c=>c.id===card.dataset.commentId),decision=button.dataset.commentDecision;
      if(item.status==="approved"&&!window.confirm("确认撤回这条已公开评论？原文和审核记录会保留。"))return;
      preserve();busy=true;filter.disabled=refresh.disabled=more.disabled=true;
      list.querySelectorAll("button").forEach(b=>b.disabled=true);
      const result=card.querySelector("[data-comment-review-result]");result.textContent="正在保存审核结果…";
      try{
        await call(app,{action:"review",id:item.id,decision,expectedStatus:item.status,note:notes.get(item.id)||""});
        notes.delete(item.id);items=items.filter(c=>c.id!==item.id);render();
        status.textContent=decision==="approved"?"评论已审核通过并公开。":"评论已设为不予公开；原文和审核记录保留。";
        refresh.focus({preventScroll:true});
      }catch(e){result.textContent=e.message+"；备注保留，可重试或刷新。";}
      finally{
        busy=false;filter.disabled=refresh.disabled=more.disabled=false;
        list.querySelectorAll("[data-comment-decision]").forEach(b=>{
          const c=items.find(x=>x.id===b.closest("[data-comment-id]").dataset.commentId);
          b.disabled=b.dataset.commentDecision==="approved"&&!c?.parentPublic;
        });
      }
    });
    refresh.onclick=()=>load();filter.onchange=()=>load();more.onclick=()=>load(true);
    void load();
  }
  window.tuhuiComments={markup,mount,mountAdmin};
})();
