// ===============================================
// 舆上·成都：馆员审核台
// 版本：2026-08-07-admin1
// ===============================================

const CLOUDBASE_ENV_ID = "chengdufu-map-d4g459au02132689e";
const CLOUDBASE_REGION = "ap-shanghai";

let cloudApp = null;
let cloudReady = false;
let queue = [];
let stats = null;
let loadingQueue = false;
let checkingStats = false;
let queueGeneration = 0;
let hasMore = false;
let queueOffset = 0;
let observedTotal = null;
let unseenCount = 0;
let pollingTimer = null;
let adminVerified = false;
let notificationsEnabled = false;
const reviewNotes = new Map();
const baseTitle = document.title;

const dashboard = document.querySelector("#dashboard");
const reviewList = document.querySelector("#reviewList");
const queueMessage = document.querySelector("#queueMessage");
const refreshButton = document.querySelector("#refreshButton");
const suggestionFilter = document.querySelector("#suggestionFilter");
const connectionDot = document.querySelector("#connectionDot");
const connectionText = document.querySelector("#connectionText");
const authMessage = document.querySelector("#authMessage");
const loadMoreButton = document.querySelector("#loadMoreButton");
const notificationButton = document.querySelector("#notificationButton");
const notificationStatus = document.querySelector("#notificationStatus");
const newSubmissions = document.querySelector("#newSubmissions");
const viewNewButton = document.querySelector("#viewNewButton");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeFunctionResult(response) {
  let result = response?.result;

  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      return null;
    }
  }

  return result || null;
}

function setConnectionState(type, title, message) {
  connectionDot.className = `status-dot ${type || ""}`.trim();
  connectionText.textContent = title;
  authMessage.textContent = message;
}

async function initCloudBase() {
  if (!window.cloudbase || typeof window.cloudbase.init !== "function") {
    throw new Error("CloudBase SDK 未加载");
  }

  cloudApp = window.cloudbase.init({
    env: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION
  });

  let loginSucceeded = false;

  if (cloudApp.auth && typeof cloudApp.auth.signInAnonymously === "function") {
    const result = await cloudApp.auth.signInAnonymously();
    if (result?.error) throw result.error;
    loginSucceeded = true;
  } else if (typeof cloudApp.auth === "function") {
    const authInstance = cloudApp.auth({ persistence: "local" });

    if (authInstance && typeof authInstance.anonymousAuthProvider === "function") {
      await authInstance.anonymousAuthProvider().signIn();
      loginSucceeded = true;
    } else if (authInstance && typeof authInstance.signInAnonymously === "function") {
      const result = await authInstance.signInAnonymously();
      if (result?.error) throw result.error;
      loginSucceeded = true;
    }
  }

  if (!loginSucceeded) {
    throw new Error("匿名登录失败");
  }

  cloudReady = true;
}

async function resolveImageUrls(items) {
  if (!cloudApp || typeof cloudApp.getTempFileURL !== "function") {
    return items;
  }

  const fileIds = Array.from(
    new Set(
      items.flatMap((item) =>
        Array.isArray(item.imageFileIds)
          ? item.imageFileIds.filter(Boolean)
          : []
      )
    )
  );

  if (!fileIds.length) return items;

  try {
    const result = await cloudApp.getTempFileURL({
      fileList: fileIds
    });

    const fileList = result?.fileList || result?.result?.fileList || [];
    const urlMap = new Map();

    fileList.forEach((file) => {
      const fileId = file?.fileID || file?.fileId || file?.file_id;
      const url = file?.tempFileURL || file?.tempFileUrl || file?.download_url;

      if (fileId && url) {
        urlMap.set(fileId, url);
      }
    });

    return items.map((item) => ({
      ...item,
      imageUrls: (item.imageFileIds || [])
        .map((id) => urlMap.get(id))
        .filter(Boolean)
    }));
  } catch (error) {
    console.warn("待审图片临时地址读取失败：", error);
    return items;
  }
}

function revokeAdminAccess(message) {
  adminVerified = false;
  window.clearInterval(pollingTimer);
  pollingTimer = null;
  queue = [];
  reviewNotes.clear();
  stats = null;
  observedTotal = null;
  unseenCount = 0;
  reviewList.replaceChildren();
  newSubmissions.hidden = true;
  dashboard.hidden = true;
  document.title = baseTitle;
  setConnectionState("error", "当前身份不是馆员管理员", message || "请使用已授权的馆员身份访问。");
}

function requireResult(response) {
  const result = normalizeFunctionResult(response);
  if (!result?.ok) {
    if (["NO_ADMIN_PERMISSION", "NOT_LOGIN"].includes(result?.code)) revokeAdminAccess(result.message);
    throw new Error(result?.message || "读取审核数据失败");
  }
  return result;
}

function renderStats(nextStats, notify = false) {
  const fields = { statTotal: "total", statPublished: "published", statNotPublished: "notPublished", statAwaiting: "awaiting", statRejected: "rejected", statOther: "other" };
  if (!nextStats || Object.values(fields).some(key => !Number.isSafeInteger(nextStats[key]) || nextStats[key] < 0) ||
      nextStats.total !== nextStats.published + nextStats.notPublished ||
      nextStats.notPublished !== nextStats.awaiting + nextStats.rejected + nextStats.other) {
    document.querySelector("#statsUpdated").textContent = "累计统计暂不可用，请稍后刷新。";
    return;
  }
  stats = nextStats;
  for (const [id, key] of Object.entries(fields)) document.getElementById(id).textContent = stats[key].toLocaleString("zh-CN");
  const updated = new Date(stats.updatedAt);
  document.querySelector("#statsUpdated").textContent = Number.isNaN(updated.getTime()) ? "累计数据已更新" :
    `截至 ${updated.toLocaleString("zh-CN", { hour12: false })}`;
  if (notify && observedTotal !== null && stats.total > observedTotal) announceNewSubmissions(stats.total - observedTotal);
  observedTotal = stats.total;
}

function announceNewSubmissions(count) {
  unseenCount += count;
  document.title = `（${unseenCount}条新投稿）${baseTitle}`;
  document.querySelector("#newSubmissionsText").textContent = `新收到 ${unseenCount} 条投稿，累计 ${stats.total} 条。点击刷新查看，已填写的审核备注会保留。`;
  newSubmissions.hidden = false;
  if (!notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notice = new Notification("舆上·成都 · 新投稿", {
      body: `新收到 ${count} 条投稿，请进入馆员审核台查看。`,
      tag: "tuhui-new-submissions"
    });
    notice.onclick = () => { window.focus(); newSubmissions.scrollIntoView({ block: "center" }); notice.close(); };
    notice.onerror = () => { notificationStatus.textContent = "系统通知发送失败，页面内仍会提醒；请检查浏览器和系统通知设置。"; };
  } catch {
    notificationStatus.textContent = "此浏览器暂不能显示系统通知，页面内仍会提醒。";
  }
}

function updateNotificationButton() {
  if (!("Notification" in window) || !window.isSecureContext) {
    notificationButton.disabled = true;
    notificationButton.textContent = "当前浏览器不支持系统通知";
    return;
  }
  notificationButton.textContent = notificationsEnabled ? "关闭电脑通知" : "开启电脑通知";
}

notificationButton.addEventListener("click", async () => {
  if (!adminVerified || !("Notification" in window)) return;
  if (notificationsEnabled) {
    notificationsEnabled = false;
    notificationStatus.textContent = "电脑通知已关闭；页面仍约每30秒检查新投稿。";
    updateNotificationButton();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    notificationsEnabled = permission === "granted";
    notificationStatus.textContent = notificationsEnabled
      ? "电脑通知已开启；保持此页面打开，约每30秒检查新投稿。"
      : "尚未获准发送系统通知；可在浏览器的网站设置中允许通知，页面内仍会提醒。";
  } catch {
    notificationStatus.textContent = "无法开启系统通知；页面内仍会提醒。";
  }
  updateNotificationButton();
});

async function checkSubmissionStats() {
  if (!cloudReady || !adminVerified || loadingQueue || checkingStats) return;
  checkingStats = true;
  const generation = queueGeneration;
  try {
    const result = requireResult(await cloudApp.callFunction({ name: "getReviewQueue", data: { summaryOnly: true }, parse: true }));
    // 手动刷新开始后，丢弃此前发出的自动检查结果，避免旧计数引发重复提醒。
    if (loadingQueue || generation !== queueGeneration || !adminVerified) return;
    renderStats(result.stats, true);
    setConnectionState("ok", "CloudBase 已连接 · 馆员身份验证通过", `待审核 ${stats?.awaiting ?? "—"} 条；页面自动检查新投稿。`);
  } catch {
    if (adminVerified) document.querySelector("#statsUpdated").textContent = "自动更新失败，显示上次成功统计；稍后自动重试。";
  } finally {
    checkingStats = false;
  }
}

function saveReviewNotes() {
  reviewList.querySelectorAll(".review-card").forEach(card => {
    const textarea = card.querySelector(".review-note textarea");
    if (textarea) reviewNotes.set(card.dataset.id, textarea.value);
  });
}

async function loadReviewQueue({ append = false } = {}) {
  if (!cloudReady || loadingQueue) return;
  loadingQueue = true;
  queueGeneration += 1;
  refreshButton.disabled = true;
  loadMoreButton.disabled = true;
  refreshButton.textContent = "正在刷新…";
  const offset = append ? queueOffset : 0;
  try {
    const result = requireResult(await cloudApp.callFunction({
      name: "getReviewQueue", data: { limit: 100, offset }, parse: true
    }));
    const incoming = await resolveImageUrls(Array.isArray(result.items) ? result.items : []);
    saveReviewNotes();
    queue = append ? Array.from(new Map([...queue, ...incoming].map(item => [item.id, item])).values()) : incoming;
    queueOffset = offset + incoming.length;
    hasMore = result.hasMore === true;
    adminVerified = true;
    dashboard.hidden = false;
    renderStats(result.stats, append);
    if (!append) {
      unseenCount = 0;
      newSubmissions.hidden = true;
      document.title = baseTitle;
    }
    setConnectionState("ok", "CloudBase 已连接 · 馆员身份验证通过", `待审核 ${stats?.awaiting ?? queue.length} 条，当前已加载 ${queue.length} 条。`);
    document.querySelector("#queueCount").textContent = `已加载 ${queue.length} 条${hasMore ? "，可继续加载更多" : ""}；累计数字不受队列分页和筛选影响。`;
    renderCards();
    loadMoreButton.hidden = !hasMore;
    // 当前小规模审核台使用30秒轮询；浏览器休眠会暂停。
    // 需要关闭页面后必达或多人高频使用时，升级为服务端通知，不提高轮询频率。
    if (!pollingTimer) pollingTimer = window.setInterval(checkSubmissionStats, 30000);
    updateNotificationButton();
  } catch (error) {
    if (adminVerified) {
      setConnectionState("error", "本次刷新失败，保留上次数据", "请稍后重试；正在填写的审核备注已保留。");
    } else if (!connectionText.textContent.includes("当前身份不是")) {
      setConnectionState("error", "审核台加载失败", error.message || "请检查云函数与权限规则。");
    }
  } finally {
    loadingQueue = false;
    refreshButton.disabled = false;
    loadMoreButton.disabled = false;
    refreshButton.textContent = "刷新数据与队列";
  }
}

function renderCards() {
  saveReviewNotes();
  const filter = suggestionFilter.value;

  const items =
    filter === "all"
      ? queue
      : queue.filter(
          (item) => item?.aiReview?.suggestion === filter
        );

  reviewList.innerHTML = "";

  if (!items.length) {
    queueMessage.hidden = false;
    queueMessage.textContent =
      filter === "all"
        ? "当前没有待人工审核的投稿。"
        : "当前筛选条件下没有待审投稿。";
    return;
  }

  queueMessage.hidden = true;

  items.forEach((item) => {
    reviewList.appendChild(createReviewCard(item));
  });
}

function createReviewCard(item) {
  const template = document.querySelector("#reviewCardTemplate");
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".review-card");

  card.dataset.id = item.id;
  fragment.querySelector(".review-note textarea").value = reviewNotes.get(item.id) || "";

  const ai = item.aiReview || {};

  const suggestion = ["pass", "review", "reject"].includes(ai.suggestion)
    ? ai.suggestion
    : "review";

  const riskLevel = ["low", "medium", "high"].includes(ai.riskLevel)
    ? ai.riskLevel
    : "medium";

  fragment.querySelector(".review-point").textContent =
    `${item.pointName || "未知点位"} · ${item.materialType || "投稿"}`;

  fragment.querySelector(".review-time").textContent =
    item.approximateTime || "时间未注明";

  fragment.querySelector(".review-badges").innerHTML = `
    <span class="badge ${suggestion}">
      ${suggestion.toUpperCase()}
    </span>
    <span class="badge ${riskLevel}">
      风险 ${riskLevel.toUpperCase()}
    </span>
  `;

  const originalContent =
    item.originalContent ||
    "该投稿未填写文字说明。";

  const collaborativeDraft =
    item.collaborativeDraft ||
    "";

  const draftAccepted =
    item.collaborativeDraftAccepted === true &&
    Boolean(
      collaborativeDraft.trim()
    );

  fragment.querySelector(".submission-text").innerHTML = `
    <div class="submission-version">
      <span>真实原文 · 永久保留</span>
      <p>${escapeHtml(originalContent)}</p>
    </div>

    ${
      collaborativeDraft
        ? `
          <div class="submission-version submission-version--draft">
            <span>浏览器基础整理稿 · 无模型</span>
            <p>${escapeHtml(collaborativeDraft)}</p>
          </div>
        `
        : ""
    }

    <p class="submission-choice">
      ${
        draftAccepted
          ? "用户选择：公开时采用基础整理稿"
          : "用户选择：公开时保留真实原文"
      }
    </p>
  `;

  const imageContainer = fragment.querySelector(".submission-images");
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];

  if (imageUrls.length) {
    imageContainer.innerHTML = imageUrls
      .slice(0, 3)
      .map(
        (url) => `
          <img
            src="${escapeHtml(url)}"
            alt="${escapeHtml(item.pointName || "投稿")}投稿图片"
            loading="lazy"
          >
        `
      )
      .join("");
  } else {
    imageContainer.remove();
  }

  fragment.querySelector(".submission-meta").innerHTML = `
    <div>
      <dt>点位</dt>
      <dd>${escapeHtml(item.pointName || "-")}</dd>
    </div>
    <div>
      <dt>材料类型</dt>
      <dd>${escapeHtml(item.materialType || "-")}</dd>
    </div>
    <div>
      <dt>联系方式</dt>
      <dd>${escapeHtml(item.contactInfo || "未填写")}</dd>
    </div>
    <div>
      <dt>图片数量</dt>
      <dd>${Number(item.imageCount) || 0}</dd>
    </div>
    <div>
      <dt>公开授权</dt>
      <dd>${item.consentToPublish ? "已同意" : "未同意"}</dd>
    </div>
    <div>
      <dt>权利确认</dt>
      <dd>${item.rightsConfirmed ? "已确认" : "未确认"}</dd>
    </div>
    <div>
      <dt>表达偏好</dt>
      <dd>${escapeHtml(item.writingStyleName || "保持原声")}</dd>
    </div>
    <div>
      <dt>整理引擎</dt>
      <dd>${escapeHtml(item.rewriteEngine || "未使用")}</dd>
    </div>
  `;

  fragment.querySelector(".ai-score").innerHTML = `
    <div class="score-box">
      <span>点位相关度</span>
      <strong>${
        Number.isFinite(Number(ai.relevance))
          ? `${Number(ai.relevance)}%`
          : "-"
      }</strong>
    </div>
    <div class="score-box">
      <span>初筛状态</span>
      <strong>${suggestion.toUpperCase()}</strong>
    </div>
  `;

  fragment.querySelector(".ai-summary").textContent =
    ai.summary || "暂无自动摘要，请直接查看原始材料。";

  fragment.querySelector(".ai-reason").textContent =
    ai.reason || "当前未启用模型服务，请进行人工审核。";

  const tags = Array.isArray(ai.tags) ? ai.tags : [];

  fragment.querySelector(".ai-tags").innerHTML = tags.length
    ? tags
        .map(
          (tag) => `
            <span class="ai-tag">
              ${escapeHtml(tag)}
            </span>
          `
        )
        .join("")
    : `<span class="ai-tag">无标签</span>`;

  const risks = ai.risks || {};

  const riskItems = [
    ["隐私", risks.privacy],
    ["版权", risks.copyright],
    ["不当内容", risks.offensive],
    ["广告营销", risks.advertising],
    ["点位无关", risks.irrelevant]
  ];

  fragment.querySelector(".risk-grid").innerHTML = riskItems
    .map(
      ([label, hit]) => `
        <div class="risk-item">
          <span>${escapeHtml(label)}</span>
          <span class="${hit ? "risk-hit" : "risk-ok"}">
            ${hit ? "需关注" : "未发现"}
          </span>
        </div>
      `
    )
    .join("");

  fragment
    .querySelectorAll("[data-decision]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        handleReviewAction(card, item, button.dataset.decision)
      );
    });

  return fragment;
}

async function handleReviewAction(card, item, decision) {
  const decisionLabel = {
    approved: "批准公开",
    needs_review: "继续核验",
    rejected: "不予公开"
  }[decision];

  if (!decisionLabel) return;

  const note = card
    .querySelector(".review-note textarea")
    .value
    .trim();

  if (
    (decision === "approved" || decision === "rejected") &&
    !window.confirm(
      `确认对“${item.pointName}”这条投稿执行：${decisionLabel}？`
    )
  ) {
    return;
  }

  const buttons = Array.from(
    card.querySelectorAll("[data-decision]")
  );

  const statusEl = card.querySelector(".card-status");

  buttons.forEach((button) => {
    button.disabled = true;
  });

  statusEl.classList.remove("error");
  statusEl.textContent = `正在执行“${decisionLabel}”…`;

  try {
    const response = await cloudApp.callFunction({
      name: "reviewContribution",
      data: {
        submissionId: item.id,
        decision,
        note
      },
      parse: true
    });

    const result = normalizeFunctionResult(response);

    if (!result?.ok) {
      throw new Error(result?.message || "人工审核操作失败");
    }

    reviewNotes.delete(item.id);
    card.querySelector(".review-note textarea").value = "";
    statusEl.textContent =
      result.message || "审核操作成功。";

    window.setTimeout(loadReviewQueue, 450);
  } catch (error) {
    statusEl.classList.add("error");
    statusEl.textContent =
      `操作失败：${error.message || "请稍后重试"}`;

    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

refreshButton.addEventListener("click", () => loadReviewQueue());
viewNewButton.addEventListener("click", () => loadReviewQueue());
loadMoreButton.addEventListener("click", () => loadReviewQueue({ append: true }));
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkSubmissionStats(); });
suggestionFilter.addEventListener("change", renderCards);

async function init() {
  try {
    await initCloudBase();

    setConnectionState(
      "",
      "CloudBase 已连接",
      "正在验证馆员身份并读取待审队列。"
    );

    await loadReviewQueue();
  } catch (error) {
    setConnectionState(
      "error",
      "CloudBase 连接失败",
      error.message || "请检查匿名登录和 SDK 配置。"
    );

    console.error("admin init failed:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
