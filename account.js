/* Phone OTP uses the installed CloudBase v3 SDK. No SMS code is stored. */
(() => {
  "use strict";
  const PROOF_KEY = "tuhui-memory-account-proof-v1";
  let user = null, dialog, returnFocus, verifier = null, sending = false, verifying = false, resendAt = 0;
  const app = () => window.tuhuiCloudApp;
  const signedIn = () => Boolean(user?.phone);
  const readProof = () => {
    try { return JSON.parse(localStorage.getItem(PROOF_KEY) || "null"); } catch { return null; }
  };
  const mask = phone => String(phone || "").replace(/[^0-9]/g, "").slice(-11).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
  const markup = () => `<div class="memory-account-note" data-account-note>
    <div><strong>${signedIn() ? `已登录 · ${mask(user.phone)}` : "让电脑和手机记住同一个你"}</strong>
    <p>${readProof() && signedIn() ? "旧记忆尚待关联，请点击重试；无需重新投稿。" : signedIn() ? "其他设备使用同一手机号登录，即可查看账号中的记忆。" : "建议用手机号验证码绑定账号。在原投稿浏览器完成绑定，可关联这里的旧记忆。"}</p></div>
    <button type="button" class="btn ghost" data-account-open>${signedIn() ? "账号与旧记忆" : "绑定／登录"}</button></div>`;
  window.tuhuiAccount = { markup };
  function refreshNotes() {
    document.querySelectorAll("[data-account-note]").forEach(el => { el.outerHTML = markup(); });
  }
  function status(message) { dialog.querySelector("[data-account-status]").textContent = message; }
  async function refreshUser() {
    const result = await app().auth.getUser();
    if (result.error) throw result.error;
    user = result.data?.user || null;
    refreshNotes();
  }
  async function callLink(data) {
    const response = await app().callFunction({ name: "linkMemoryAccount", data, parse: true });
    let result = response.result ?? response;
    if (typeof result === "string") result = JSON.parse(result);
    if (!result?.ok) throw Object.assign(new Error(result?.message || "旧记忆关联暂未完成，请稍后重试。"), { code: result?.code });
    return result;
  }
  async function redeem() {
    const proof = readProof();
    if (!proof) return;
    await callLink({ action: "redeem", token: proof.token });
    localStorage.removeItem(PROOF_KEY);
  }
  function changed() {
    refreshNotes();
    window.dispatchEvent(new Event("tuhui:account-changed"));
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "memory-account-dialog";
    dialog.setAttribute("aria-labelledby", "accountTitle");
    dialog.innerHTML = `<button type="button" class="memory-account-close" aria-label="关闭账号窗口" data-account-close>×</button>
      <p class="detail-kicker">MY CITY MEMORY</p><h2 id="accountTitle">用手机号找回你的记忆</h2>
      <p class="memory-account-intro">请在原来投稿的电脑或手机浏览器中操作。验证后，这里的旧投稿会关联到账号；两端都投稿过，就在两端分别操作一次。无需再次投稿。</p>
      <form data-account-form>
        <label>中国大陆手机号<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="11" pattern="1[3-9][0-9]{9}" required placeholder="请输入 11 位手机号"></label>
        <button type="button" class="memory-account-change" data-account-change hidden>更换手机号</button>
        <label>短信验证码<div class="memory-account-code"><input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="6 位验证码"><button type="button" class="btn ghost" data-account-send>获取验证码</button></div></label>
        <p class="memory-account-fine">点击登录即将本浏览器的旧投稿关联到该手机号。重复投稿会完整保留，由馆员核实处理。手机号仅用于账号验证，不会公开展示。</p>
        <button class="btn primary" type="submit" data-account-submit disabled>登录并关联旧记忆</button>
      </form>
      <div data-account-manage hidden><p data-account-current></p><button type="button" class="btn primary" data-account-retry>重试关联旧记忆</button><button type="button" class="btn ghost" data-account-signout>退出当前账号</button></div>
      <p class="memory-account-status" data-account-status role="status" aria-live="polite"></p>`;
    document.body.append(dialog);
    dialog.addEventListener("keydown", e => { e.stopPropagation(); });
    dialog.addEventListener("close", () => {
      const fallback = [...document.querySelectorAll("[data-account-open]")].find(el => el.getClientRects().length);
      (returnFocus?.isConnected ? returnFocus : fallback)?.focus();
    });
    dialog.addEventListener("cancel", e => { if (sending || verifying) e.preventDefault(); });
    dialog.querySelector("[data-account-close]").onclick = () => { if (!sending && !verifying) dialog.close(); };
    dialog.querySelector("[data-account-send]").onclick = sendCode;
    dialog.querySelector("[data-account-change]").onclick = () => {
      if (sending || verifying) return;
      verifier = null;
      dialog.querySelector('[name="phone"]').readOnly = false;
      dialog.querySelector('[name="phone"]').focus();
      dialog.querySelector('[name="code"]').value = "";
      dialog.querySelector("[data-account-submit]").disabled = true;
      dialog.querySelector("[data-account-change]").hidden = true;
      status("请填写新的手机号，并重新获取验证码。");
    };
    dialog.querySelector("[data-account-form]").onsubmit = verifyCode;
    dialog.querySelector("[data-account-retry]").onclick = retryLink;
    dialog.querySelector("[data-account-signout]").onclick = signOut;
    setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      const button = dialog.querySelector("[data-account-send]");
      button.disabled = sending || verifying || remaining > 0;
      button.textContent = remaining ? `${remaining} 秒后重发` : sending ? "正在发送…" : "获取验证码";
    }, 500);
  }
  function showMode() {
    const logged = signedIn();
    dialog.querySelector("[data-account-form]").hidden = logged;
    dialog.querySelector("[data-account-manage]").hidden = !logged;
    dialog.querySelector("[data-account-current]").textContent = logged ? `当前账号：${mask(user.phone)}` : "";
    dialog.querySelector("[data-account-retry]").hidden = !readProof();
    dialog.querySelector("[data-account-signout]").disabled = Boolean(readProof());
  }
  async function open(trigger) {
    if (document.querySelector("#contributionSubmit")?.textContent.includes("正在提交")) return;
    ensureDialog();
    returnFocus = trigger;
    if (!dialog.open) dialog.showModal();
    status("正在核对登录状态…");
    try {
      if (!app()?.auth?.getUser) throw new Error("账号服务尚未连接，请稍后重试。");
      await refreshUser(); showMode();
      status(signedIn() ? readProof() ? "已登录，旧记忆尚待关联。请点击重试，不需要再投稿。" : "已关联的记忆可在“我的记忆”查看。" : "");
    } catch { status("账号服务暂时无法连接，请稍后重试。"); }
  }
  function failure(error) {
    const message = String(error?.message || "");
    if (/quota|balance|resource|limit exceeded|欠费|额度|资源包/i.test(message)) return "短信额度不足或发送达到限制，请稍后重试或联系馆员。旧投稿仍保留。";
    if (/invalid.*(code|token)|验证码|verification.*(invalid|expired)/i.test(message)) return "验证码不正确或已过期，请核对后重试。";
    if (/too.*(many|frequent)|rate|频繁/i.test(message)) return "验证码发送较频繁，请稍后再试。";
    if (error?.code && ["CURATOR_ACCOUNT", "NOT_ANONYMOUS", "PHONE_REQUIRED", "PHONE_MISMATCH", "PROOF_MISMATCH", "PROOF_EXPIRED", "PROOF_NOT_FOUND"].includes(error.code)) return message;
    return "暂未完成，请稍后重试。旧投稿仍保留，不需要再投稿。";
  }
  async function sendCode() {
    if (sending || verifying || Date.now() < resendAt) return;
    const phoneInput = dialog.querySelector('[name="phone"]');
    phoneInput.value = phoneInput.value.trim();
    if (!phoneInput.reportValidity()) return;
    const phone = phoneInput.value;
    sending = true; verifier = null;
    dialog.querySelector("[data-account-send]").disabled = true;
    dialog.querySelector("[data-account-submit]").disabled = true;
    phoneInput.readOnly = true;
    status("正在保存旧记忆的关联凭据…");
    try {
      await refreshUser();
      if (signedIn()) { showMode(); throw new Error("当前已登录，请查看账号状态。"); }
      let proof = readProof();
      if (!proof || proof.sourceUid !== user?.id) {
        proof = { token: [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join(""), sourceUid: user?.id };
      }
      // Persist before any login can replace the anonymous session. If storage
      // is unavailable, stop before sending an SMS or changing the identity.
      localStorage.setItem(PROOF_KEY, JSON.stringify(proof));
      try { await callLink({ action: "prepare", token: proof.token, phone }); }
      catch (error) {
        if (error.code !== "ALREADY_LINKED") throw error;
        localStorage.removeItem(PROOF_KEY);
      }
      const result = await app().auth.signInWithOtp({ phone });
      if (result.error) throw result.error;
      if (typeof result.data?.verifyOtp !== "function") throw new Error("验证码服务未返回验证入口。");
      verifier = result.data.verifyOtp;
      dialog.querySelector("[data-account-change]").hidden = false;
      resendAt = Date.now() + 60000;
      status("验证码已发送。请输入验证码完成登录和旧记忆关联。");
      dialog.querySelector("[data-account-submit]").disabled = false;
      dialog.querySelector('[name="code"]').focus();
    } catch (error) { phoneInput.readOnly = false; status(failure(error)); }
    finally { sending = false; }
  }
  async function verifyCode(event) {
    event.preventDefault();
    if (!verifier || verifying || sending) return;
    verifying = true;
    const button = dialog.querySelector("[data-account-submit]");
    button.disabled = true; status("正在验证并关联旧记忆…");
    try {
      const result = await verifier({ token: dialog.querySelector('[name="code"]').value.trim() });
      if (result.error) throw result.error;
      verifier = null;
      await refreshUser();
      await redeem();
      status("登录成功，旧记忆已关联。另一台设备使用同一手机号登录即可查看。重复投稿仍然保留。");
    } catch (error) { status(signedIn() ? "登录成功，旧记忆尚未关联完成。请点击“重试关联旧记忆”，无需再次投稿。" : failure(error)); }
    finally { verifying = false; button.disabled = !verifier; showMode(); changed(); }
  }
  async function retryLink() {
    if (verifying) return;
    verifying = true; status("正在关联旧记忆…");
    try { await refreshUser(); await redeem(); status("旧记忆已关联，可以在“我的记忆”查看。重复投稿全部保留。"); }
    catch (error) { status(failure(error)); }
    finally { verifying = false; showMode(); changed(); }
  }
  async function signOut() {
    if (verifying || readProof()) return;
    verifying = true;
    try {
      const result = await app().auth.signOut();
      if (result.error) throw result.error;
      user = null; changed();
      const anonymous = await app().auth.signInAnonymously();
      if (anonymous.error) throw anonymous.error;
      await refreshUser(); verifier = null;
      dialog.querySelector("[data-account-form]").reset();
      dialog.querySelector('[name="phone"]').readOnly = false;
      status("已退出。账号中的投稿仍然保留。");
    } catch { status("退出或重新连接暂未完成，请刷新页面重试。"); }
    finally { verifying = false; showMode(); changed(); }
  }
  document.addEventListener("click", e => {
    const trigger = e.target.closest("[data-account-open]");
    if (trigger) open(trigger);
  });
  document.addEventListener("keydown", e => {
    if (dialog?.open && e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!sending && !verifying) dialog.close();
    }
  }, true);
  window.addEventListener("tuhui:cloud-ready", async e => {
    if (!e.detail?.ready) return;
    try { await refreshUser(); } catch { /* Existing reading remains available. */ }
  });
})();
