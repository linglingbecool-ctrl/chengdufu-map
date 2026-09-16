"use strict";
const { createHash } = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
function checked(result) {
  if (!result || result.code) fail("LIKE_FAILED", "点赞未完成，请重试。");
  return result;
}
function row(result) {
  checked(result);
  if (!("data" in result)) fail("LIKE_FAILED", "点赞未完成，请重试。");
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
const receiptId = (id, uid) => createHash("sha256").update(JSON.stringify([id, uid])).digest("hex");
function fail(code, message) { throw Object.assign(new Error(message), { code }); }

// Both collections must be ADMINONLY. Never trust counts or identities from clients.
// One transaction per memory serializes votes on that memory; split counters only
// if measured contention at much higher traffic warrants the added complexity.
exports.main = async (event = {}) => {
  try {
    const identity = app.auth().getUserInfo();
    const uid = identity?.uid || identity?.openId || identity?.customUserId;
    if (!uid) fail("NOT_LOGIN", "请等待云端连接后重试。");
    const { memoryId, liked } = event;
    if (typeof memoryId !== "string" || !/^[\w-]{1,128}$/.test(memoryId) || typeof liked !== "boolean") {
      fail("INVALID_INPUT", "点赞参数无效，请刷新后重试。");
    }
    let result;
    // Some supported SDK versions resolve runTransaction with void.
    await db.runTransaction(async transaction => {
      const memory = row(await transaction.collection("contributions").doc(memoryId).get());
      if (memory?.status !== "approved" || memory.consentToPublish !== true || memory.rightsConfirmed !== true) {
        fail("NOT_PUBLIC", "这条记忆暂未公开，不能点赞。");
      }
      const receipt = transaction.collection("memoryLikes").doc(receiptId(memoryId, uid));
      const total = transaction.collection("memoryLikeTotals").doc(memoryId);
      const previous = row(await receipt.get());
      const savedTotal = row(await total.get());
      // Migrate legacy records lazily: their contribution.likeCount becomes
      // the initial total when no memoryLikeTotals row exists yet.
      const count = savedTotal ? savedTotal.count : (Number.isSafeInteger(memory?.likeCount) && memory.likeCount >= 0 ? memory.likeCount : 0);
      if (!Number.isSafeInteger(count) || count < 0 || (previous?.liked === true && count === 0)) {
        fail("COUNT_UNAVAILABLE", "赞数暂不可用，请稍后重试。");
      }
      if ((previous?.liked === true) === liked) {
        result = { likeCount: count, likedByMe: liked };
        return;
      }
      const next = count + (liked ? 1 : -1);
      if (!Number.isSafeInteger(next)) fail("COUNT_UNAVAILABLE", "赞数暂不可用，请稍后重试。");
      checked(await receipt.set({ memoryId, liked, updatedAt: Date.now() }));
      checked(await total.set({ count: next }));
      result = { likeCount: next, likedByMe: liked };
    });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, code: error.code || "LIKE_FAILED", message: error.code ? error.message : "点赞未完成，请重试。" };
  }
};
