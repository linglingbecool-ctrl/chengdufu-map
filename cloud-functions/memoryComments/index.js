"use strict";
const {createHash}=require("node:crypto");
const cloudbase=require("@cloudbase/node-sdk");
const app=cloudbase.init({env:cloudbase.SYMBOL_CURRENT_ENV}),db=app.database();
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const isPublic=m=>m?.status==="approved"&&m.consentToPublish===true&&m.rightsConfirmed===true;
const validMemory=x=>typeof x==="string"&&/^[\w-]{1,128}$/.test(x);
const validComment=x=>typeof x==="string"&&/^\d{13}-[a-f0-9]{32}$/.test(x);
function fail(code,message){throw Object.assign(new Error(message),{code});}
function checked(r){if(!r||r.code)fail("DATABASE_ERROR","评论服务暂不可用，请稍后重试。");return r;}
function row(r){checked(r);if(!("data" in r))fail("DATABASE_ERROR","评论服务暂不可用。");return Array.isArray(r.data)?r.data[0]:r.data;}
function rows(r){checked(r);if(!Array.isArray(r.data))fail("DATABASE_ERROR","评论列表读取失败。");return r.data;}
const publicFields=c=>({id:c._id,nickname:c.nickname,text:c.text,createdAt:c.createdAt});
async function requireAdmin(uid){
  const admins=rows(await db.collection("users").where({openid:uid,role:"admin",enabled:true}).limit(1).get());
  if(!admins.length)fail("NO_ADMIN_PERMISSION","仅馆员可以管理评论。");
}
// Both memoryComments and memoryCommentRequests must be ADMINONLY.
// Public fields are allowlisted here; client-supplied uid/status/reviewer are ignored.
// Pagination is by server timestamp + hash ID (stable even for simultaneous posts).
exports.main=async(event={})=>{
  try{
    const identity=app.auth().getUserInfo(),uid=identity?.uid||identity?.openId||identity?.customUserId;
    if(!uid)fail("NOT_LOGIN","请等待网站连接后重试。");
    const {action}=event;
    if(!["list","submit","queue","delete"].includes(action))fail("INVALID_ACTION","不支持的评论操作。");
    if(["queue","delete"].includes(action))await requireAdmin(uid);
    if(["list","submit"].includes(action)&&!validMemory(event.memoryId))fail("INVALID_INPUT","帖子编号无效。");
    if(["list","queue"].includes(action)){
      const cursor=event.cursor||"";
      if(typeof cursor!=="string"||(cursor&&!validComment(cursor)))fail("INVALID_INPUT","分页参数无效。");
      const status=action==="list"?"approved":event.status||"all";
      if(!["all","pending","approved","rejected","deleted"].includes(status))fail("INVALID_INPUT","评论状态无效。");
      const filter=action==="list"?{memoryId:event.memoryId,status}:{...(status==="all"?{}:{status})};
      if(action==="list"&&!isPublic(row(await db.collection("contributions").doc(event.memoryId).get())))fail("NOT_PUBLIC","这篇记忆暂未公开。");
      if(cursor)filter._id=db.command.lt(cursor);
      const found=rows(await db.collection("memoryComments").where(filter).orderBy("_id","desc").limit(21).get());
      const batch=found.slice(0,20);
      let items=batch.map(publicFields);
      if(action==="queue"){
        const ids=[...new Set(batch.map(c=>c.memoryId))];
        const parents=ids.length?rows(await db.collection("contributions").where({_id:db.command.in(ids)}).limit(20).get()):[];
        const byId=new Map(parents.map(p=>[p._id,p]));
        items=batch.map(c=>{
          const parent=byId.get(c.memoryId);
          const adopted=parent?.collaborativeDraftAccepted===true&&parent.collaborativeDraft?.trim();
          return {...publicFields(c),memoryId:c.memoryId,status:c.status,note:c.note||"",reviewedAt:c.reviewedAt||null,deletedAt:c.deletedAt||null,
            parentPublic:isPublic(parent),pointName:parent?.pointName||"原帖已不可用",
            parentText:String(adopted||parent?.originalContent||"（影像记忆，无文字正文）").slice(0,1200)};
        });
      }
      return {ok:true,items,nextCursor:found.length>20?batch[batch.length-1]._id:null};
    }
    if(action==="submit"){
      const {text,nickname="",requestId,consent}=event;
      if(typeof text!=="string"||!text.trim()||text.trim().length>500||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||typeof nickname!=="string"||
        nickname.trim().length>20||/[\u0000-\u001f]/.test(nickname)||
        typeof requestId!=="string"||!/^[a-f0-9-]{36}$/i.test(requestId)||consent!==true)
        fail("INVALID_INPUT","请填写 1—500 字评论、20 字以内称呼，并同意公开。");
      const body={memoryId:event.memoryId,text:text.trim(),nickname:nickname.trim()||"读者",consent:true};
      const fingerprint=hash(body),requestKey=hash([uid,requestId]);let result;
      await db.runTransaction(async tx=>{
        const requests=tx.collection("memoryCommentRequests"),receipt=requests.doc(`request-${requestKey}`);
        const previous=row(await receipt.get());
        if(previous){
          if(previous.fingerprint!==fingerprint)fail("REQUEST_CONFLICT","该提交凭据已使用，请重新打开评论区后提交。");
          const existing=row(await tx.collection("memoryComments").doc(previous.commentId).get());
          result={id:previous.commentId,status:existing?.status||"deleted"};return;
        }
        const parent=row(await tx.collection("contributions").doc(event.memoryId).get());
        if(!isPublic(parent))fail("NOT_PUBLIC","这篇记忆暂未公开，不能评论。");
        const rateRef=requests.doc(`user-${hash(uid)}`),rate=row(await rateRef.get());
        const now=Date.now(),day=new Date(now+8*3600000).toISOString().slice(0,10);
        if(rate&&now-rate.lastAt<30000)fail("TOO_FAST","请稍等 30 秒再提交下一条评论。");
        const count=rate?.day===day?rate.count:0;
        if(!Number.isSafeInteger(count)||count<0)fail("DATABASE_ERROR","评论服务暂不可用。");
        // Small-site abuse bound: 20 comments per login identity/day. Anonymous
        // identity limits are not bot-proof; add captcha if actual abuse warrants it.
        if(count>=20)fail("DAILY_LIMIT","今天评论较多，请明天再来分享。");
        const id=`${now}-${requestKey.slice(0,32)}`;
        checked(await tx.collection("memoryComments").doc(id).set({...body,userId:uid,status:"approved",createdAt:now,publishedAt:now}));
        checked(await receipt.set({commentId:id,fingerprint,createdAt:now}));
        checked(await rateRef.set({lastAt:now,day,count:count+1}));
        result={id,status:"approved"};
      });
      return {ok:true,...result,message:result.status==="approved"?"评论已发表。":result.status==="deleted"?"这条评论已删除。":"这条评论已提交。"};
    }
    const {id,expectedStatus}=event;
    if(!validComment(id)||!["pending","approved","rejected","deleted"].includes(expectedStatus))
      fail("INVALID_INPUT","删除参数无效。");
    await db.runTransaction(async tx=>{
      const ref=tx.collection("memoryComments").doc(id),comment=row(await ref.get());
      if(!comment)fail("NOT_FOUND","评论不存在。");
      if(comment.status==="deleted")return; // Lost-response retries must not duplicate audit entries.
      if(comment.status!==expectedStatus)fail("COMMENT_CONFLICT","这条评论已被处理，请刷新列表。");
      const at=Date.now(),change={from:comment.status,to:"deleted",by:uid,at};
      // Soft deletion removes public visibility while preserving the librarian's record.
      checked(await ref.update({status:"deleted",deletedAt:at,deletedBy:uid,
        history:[...(comment.history||[]),change]}));
    });
    return {ok:true,id,status:"deleted"};
  }catch(error){
    return {ok:false,code:error.code||"COMMENTS_FAILED",message:error.code?error.message:"评论操作未完成，请稍后重试。"};
  }
};
