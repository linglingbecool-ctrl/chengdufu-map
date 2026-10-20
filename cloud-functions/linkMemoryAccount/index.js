"use strict";
const crypto = require("node:crypto");
const numbers = require("./memory-numbers");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database(), auth = app.auth();
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const phoneDigits = value => String(value || "").replace(/[\s+-]/g, "").replace(/^86(?=1\d{10}$)/, "");
const row = result => Array.isArray(result?.data) ? result.data[0] : result?.data;
function fail(code, message) { throw Object.assign(new Error(message), { code }); }

// This collection must be ADMINONLY. Only this function can issue or redeem
// ownership proofs. Original contributions, files and curator roles never move.
exports.main = async (event = {}) => {
  try {
    const identity = auth.getUserInfo();
    const uid = identity?.uid || identity?.openId || identity?.customUserId;
    if (!uid) fail("NOT_LOGIN", "请等待云端连接后重试。");
    if (!["prepare", "redeem"].includes(event.action)) fail("INVALID_ACTION", "不支持的账号操作。");
    if (typeof event.token !== "string" || !/^[a-f0-9]{64}$/.test(event.token)) fail("INVALID_PROOF", "关联凭据无效，请回原投稿浏览器重新绑定。");
    const tokenHash = hash(event.token);

    if (event.action === "prepare") {
      if (!identity.isAnonymous) fail("NOT_ANONYMOUS", "当前已经是正式账号，请使用当前账号查看记忆。");
      const phone = phoneDigits(event.phone);
      if (!/^1[3-9]\d{9}$/.test(phone)) fail("INVALID_PHONE", "请输入正确的中国大陆手机号。");
      const admin = await db.collection("users").where({ openid: uid, role: "admin", enabled: true }).limit(1).get();
      if (admin.data?.length) fail("CURATOR_ACCOUNT", "馆员身份请继续使用审核台；读者登录请使用另一个浏览器。");
      const id = hash(uid), now = Date.now();
      await db.runTransaction(async transaction => {
        const ref = transaction.collection("memoryAccountLinks").doc(id);
        const existing = row(await ref.get());
        if (existing?.targetUid) {
          if (existing.phoneHash !== hash(phone)) fail("PHONE_MISMATCH", "这个浏览器已绑定过账号，请使用最初绑定的手机号登录。");
          fail("ALREADY_LINKED", "这个浏览器的旧记忆已关联过账号，请登录原手机号。");
        }
        // A repeated request with the same proof is safe after a lost response.
        await ref.set({ sourceUid: uid, tokenHash, phoneHash: hash(phone), expiresAt: now + 7 * 86400000, preparedAt: now });
      });
      return { ok: true };
    }

    if (identity.isAnonymous) fail("PHONE_REQUIRED", "请先完成手机号验证码登录。");
    const detail = await auth.getEndUserInfo(uid);
    if (detail?.code) fail("IDENTITY_UNAVAILABLE", "暂时无法核验账号，请稍后重试关联。");
    const user = detail?.userInfo;
    const phone = phoneDigits(user?.phone || user?.phoneNumber || user?.phone_number);
    if (!/^1[3-9]\d{9}$/.test(phone)) fail("PHONE_REQUIRED", "请先完成手机号验证码登录。");
    const match = await db.collection("memoryAccountLinks").where({ tokenHash }).limit(1).get();
    const proof = row(match);
    if (!proof) fail("PROOF_NOT_FOUND", "关联凭据已失效，请回原投稿浏览器重新绑定；旧投稿仍然保留。");
    await numbers.withRegistry(db, async (transaction, registry) => {
      const ref = transaction.collection("memoryAccountLinks").doc(proof._id);
      const current = row(await ref.get());
      if (!current || current.tokenHash !== tokenHash || current.phoneHash !== hash(phone)) fail("PROOF_MISMATCH", "请使用绑定时填写的手机号登录。");
      if (current.targetUid) {
        if (current.targetUid !== uid) fail("ALREADY_LINKED", "旧记忆已经关联到另一个账号，请联系馆员核实。");
        numbers.merge(registry, current.sourceUid, uid);
        return; // Same-account retries must succeed even after proof expiry.
      }
      if (current.expiresAt < Date.now()) fail("PROOF_EXPIRED", "关联凭据已过期，旧投稿仍然保留，请联系馆员核实。");
      numbers.checked(await ref.update({ targetUid: uid, linkedAt: Date.now() }));
      numbers.merge(registry, current.sourceUid, uid);
    });
    return { ok: true, message: "本浏览器的旧记忆已关联。重复投稿全部保留，由馆员核实处理。" };
  } catch (error) {
    // Never log proofs, phone numbers or submitted content.
    return { ok: false, code: error.code || "LINK_FAILED", message: error.code ? error.message : "账号关联暂未完成，旧记忆仍保留，请稍后重试。" };
  }
};
