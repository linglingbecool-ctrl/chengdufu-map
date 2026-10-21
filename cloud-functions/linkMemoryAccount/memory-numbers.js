"use strict";
const {createHash}=require("node:crypto");
const COLLECTION="memoryNumberRegistry", DOCUMENT="main";
const key=value=>createHash("sha256").update(String(value)).digest("hex");
const campus=item=>["sichuandaxue","huaxiba"].includes(item.pointId);
const approved=item=>item.status==="approved" && item.consentToPublish===true && item.rightsConfirmed===true && item.humanReview?.decision==="approved";
const EXTRA_BADGES=["chengduLamplighter","familyMemoryKeeper","imageRecorder","placeNameExplorer","oralHistorian","cityWalker"];
function reviewTime(item){
  let value=item.humanReviewedAt||item.humanReview?.reviewedAt;
  if(value?.$date)value=value.$date;
  if(value?.$numberLong)value=Number(value.$numberLong);
  const time=new Date(value).getTime();return Number.isFinite(time)&&time>0?time:null;
}
function awardKind(state,kind,uid,earnedAt){
  const registry=state.badgeKinds[kind],id=canonical(state,uid);
  if(!registry.awards[id])registry.awards[id]={number:sequence(registry.next++),earnedAt,ranked:registry.reliable===true};
}
function recordApproved(state,uid,item,time){
  if(!state.badgeKinds)fail("NUMBER_MAINTENANCE","徽章编号正在更新，请稍后重试审核；原投稿仍保留。");
  const id=canonical(state,uid),points=state.badgeProgress[id]||[];
  if(item.pointId&&!points.includes(item.pointId))points.push(item.pointId);
  state.badgeProgress[id]=points;
  const tags=Array.isArray(item.contributionTags)?item.contributionTags:[];
  const earned={
    chengduLamplighter:true,
    familyMemoryKeeper:item.writingStyleId==="childvoice"||item.writingStyleName==="童言童语",
    imageRecorder:Number(item.imageCount)>0,
    placeNameExplorer:item.memoryType==="place_name"||tags.includes("place_name"),
    oralHistorian:item.memoryType==="oral_history"||tags.includes("oral_history"),
    cityWalker:points.length>=3
  };
  for(const kind of EXTRA_BADGES)if(earned[kind])awardKind(state,kind,uid,time);
}
// One-time backfill takes a complete, bounded metadata snapshot. Existing campus
// and memory allocations are not touched. Production applies the result with CAS.
function initializeAdditionalBadges(state,items){
  if(state.badgeKinds)fail("BADGES_ALREADY_INITIALIZED");
  state.badgeKinds=Object.fromEntries(EXTRA_BADGES.map(kind=>[kind,{next:1,awards:{},retired:[],reliable:false}]));
  state.badgeProgress={};
  const eligible=items.filter(approved).sort((a,b)=>(reviewTime(a)||Infinity)-(reviewTime(b)||Infinity)||a._id.localeCompare(b._id));
  for(const item of eligible){
    const uid=item.userId||item._openid;if(!uid)fail("NUMBER_OWNER_MISSING");
    recordApproved(state,uid,item,reviewTime(item));
  }
  for(const registry of Object.values(state.badgeKinds)){
    const awards=Object.values(registry.awards),times=awards.map(b=>b.earnedAt);
    registry.reliable=times.every(Boolean)&&new Set(times).size===times.length;
    for(const b of awards)b.ranked=registry.reliable;
  }
}
function fail(code,message){throw Object.assign(new Error(message||code),{code});}
function checked(result){if(!result||result.code)fail("NUMBER_DATABASE_ERROR");return result;}
function row(result){checked(result);return Array.isArray(result.data)?result.data[0]:result.data;}
function canonical(state,uid){
  let id=key(uid),seen=new Set();
  while(state.aliases[id]){if(seen.has(id))fail("NUMBER_ALIAS_CYCLE");seen.add(id);id=state.aliases[id];}
  return id;
}
function sequence(value){if(!Number.isSafeInteger(value)||value<1)fail("INVALID_NUMBER_COUNTER");return value;}
function ensureMemory(state,id){
  if(typeof id!=="string"||!id)fail("INVALID_MEMORY_ID");
  const k=key(id);
  if(!state.memories[k]){state.memories[k]=sequence(state.memoryNext);state.memoryNext++;}
  return `CD-${String(sequence(state.memories[k])).padStart(6,"0")}`;
}
function award(state,uid,earnedAt){
  if(!uid)fail("NUMBER_OWNER_MISSING");
  const id=canonical(state,uid);
  if(!state.badges[id]){
    state.badges[id]={number:sequence(state.badgeNext),earnedAt,ranked:state.historyReliable===true};
    state.badgeNext++;
  }
  return state.badges[id];
}
function merge(state,sourceUid,targetUid){
  const source=canonical(state,sourceUid),target=canonical(state,targetUid);
  if(source===target)return;
  const a=state.badges[source],b=state.badges[target];
  // Two previously separate identities retain their earliest award. Retired
  // numbers are never recycled; existing downloaded cards are not rewritten.
  if(a&&(!b||a.number<b.number))state.badges[target]=a;
  if(a&&b)state.retired.push(Math.max(a.number,b.number));
  delete state.badges[source];state.aliases[source]=target;
  if(state.badgeKinds){
    for(const registry of Object.values(state.badgeKinds)){
      const a=registry.awards[source],b=registry.awards[target];
      if(a&&(!b||a.number<b.number))registry.awards[target]=a;
      if(a&&b)registry.retired.push(Math.max(a.number,b.number));
      delete registry.awards[source];
    }
    state.badgeProgress[target]=[...new Set([...(state.badgeProgress[source]||[]),...(state.badgeProgress[target]||[])])];
    delete state.badgeProgress[source];
    if(state.badgeProgress[target].length>=3)awardKind(state,"cityWalker",targetUid,Date.now());
  }
}
function publicBadge(state,uid,kind="scuMemoryKeeper"){
  const id=canonical(state,uid),b=kind==="scuMemoryKeeper"?state.badges[id]:state.badgeKinds?.[kind]?.awards[id];
  if(!b)return null;
  const number=sequence(b.number),digits=String(number).padStart(3,"0");
  return {number,label:`No.${digits}`,ranked:b.ranked===true,earnedAt:b.earnedAt};
}
async function load(tx){
  const state=row(await tx.collection(COLLECTION).doc(DOCUMENT).get());
  if(!state||state.schema!==1||!state.ready)fail("NUMBER_MAINTENANCE","编号服务正在准备，请稍后重试；原投稿仍保留。");
  return state;
}
async function save(tx,state){
  // Single registry serializes allocation for this small public project.
  // Hard ceiling 5000 memories / 2000 aliases; migrate to per-record counters
  // before that scale, rather than silently exceeding document/transaction limits.
  if(Object.keys(state.memories).length>5000||Object.keys(state.aliases).length>2000)fail("NUMBER_CAPACITY","编号容量需扩展，请联系馆员；原投稿仍保留。");
  const {_id,...data}=state;
  checked(await tx.collection(COLLECTION).doc(DOCUMENT).set(data));
}
async function withRegistry(db,work){
  let output;
  await db.runTransaction(async tx=>{
    const state=await load(tx),before=JSON.stringify(state);
    output=await work(tx,state);
    if(JSON.stringify(state)!==before)await save(tx,state);
  });
  return output;
}
async function decorate(db,uid,items){
  return withRegistry(db,async(tx,state)=>({
    badge:publicBadge(state,uid),
    badges:Object.fromEntries(["scuMemoryKeeper",...EXTRA_BADGES].map(kind=>[kind,publicBadge(state,uid,kind)])),
    numbers:Object.fromEntries(items.map(item=>[item._id,ensureMemory(state,item._id)]))
  }));
}
async function review(db,id,reviewer,decision,note){
  return withRegistry(db,async(tx,state)=>{
    const ref=tx.collection("contributions").doc(id),item=row(await ref.get());
    if(!item)fail("CONTRIBUTION_NOT_FOUND","投稿不存在。");
    if(["approved","rejected"].includes(item.status))fail("ALREADY_REVIEWED","该投稿已经完成终审。");
    if(decision==="approved"&&(item.consentToPublish!==true||item.rightsConfirmed!==true))fail("PUBLICATION_CONSENT_MISSING","缺少公开授权或权利确认。");
    const owner=item.userId||item._openid;
    if(!owner)fail("NUMBER_OWNER_MISSING","投稿身份缺失，请先核实。");
    // Also honor links created before this release, including racing logins.
    const link=row(await tx.collection("memoryAccountLinks").doc(key(owner)).get());
    if(link?.targetUid)merge(state,owner,link.targetUid);
    const now=Date.now(),status=decision==="needs_review"?"processing":decision;
    const memoryNumber=ensureMemory(state,id);
    if(status==="approved"){
      recordApproved(state,owner,item,now);
      if(campus(item))award(state,owner,now);
    }
    checked(await ref.update({status,humanReview:{decision,note,reviewedBy:reviewer,reviewedAt:new Date(now)},
      humanReviewedAt:new Date(now),humanReviewRequired:decision==="needs_review",reviewVersion:"librarian-review-number-v2"}));
    return {status,memoryNumber};
  });
}
module.exports={COLLECTION,DOCUMENT,key,canonical,campus,approved,checked,row,ensureMemory,award,merge,publicBadge,load,save,withRegistry,decorate,review,EXTRA_BADGES,initializeAdditionalBadges,recordApproved};
