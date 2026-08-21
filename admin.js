// ===============================================
// 舆上·成都：馆员审核台
// 版本：2026-08-07-admin1
// ===============================================

const CLOUDBASE_ENV_ID = "chengdufu-map-d4g459au02132689e";
const CLOUDBASE_REGION = "ap-shanghai";

let cloudApp = null;
let cloudReady = false;
let queue = [];

const dashboard = document.querySelector("#dashboard");
const reviewList = document.querySelector("#reviewList");
const queueMessage = document.querySelector("#queueMessage");
const refreshButton = document.querySelector("#refreshButton");
const suggestionFilter = document.querySelector("#suggestionFilter");
const connectionDot = document.querySelector("#connectionDot");
const connectionText = document.querySelector("#connectionText");
const authMessage = document.querySelector("#authMessage");

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

async function loadReviewQueue() {
  if (!cloudReady) return;

  refreshButton.disabled = true;
  refreshButton.textContent = "正在刷新…";

  try {
    const response = await cloudApp.callFunction({
      name: "getReviewQueue",
      data: { limit: 100 },
      parse: true
    });

    const result = normalizeFunctionResult(response);

    if (!result?.ok) {
      if (
        result?.code === "NO_ADMIN_PERMISSION" ||
        result?.code === "NOT_LOGIN"
      ) {
        dashboard.hidden = true;

        setConnectionState(
          "error",
          "已连接，但当前身份不是馆员管理员",
          result.message ||
            "请确认 users 集合中已配置当前 OPENID 的 admin 角色。"
        );

        return;
      }

      throw new Error(result?.message || "读取审核队列失败");
    }

    queue = await resolveImageUrls(
      Array.isArray(result.items) ? result.items : []
    );

    dashboard.hidden = false;

    setConnectionState(
      "ok",
      "CloudBase 已连接 · 馆员身份验证通过",
      `当前有 ${queue.length} 条投稿等待人工终审。`
    );

    renderDashboard();
  } catch (error) {
    dashboard.hidden = true;

    setConnectionState(
      "error",
      "审核台加载失败",
      error.message || "请检查云函数与权限规则。"
    );

    console.error("loadReviewQueue failed:", error);
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "刷新待审队列";
  }
}

function renderDashboard() {
  const suggestions = queue.map(
    (item) => item?.aiReview?.suggestion || "review"
  );

  document.querySelector("#statTotal").textContent = String(queue.length);
  document.querySelector("#statPass").textContent = String(
    suggestions.filter((value) => value === "pass").length
  );
  document.querySelector("#statReview").textContent = String(
    suggestions.filter((value) => value === "review").length
  );
  document.querySelector("#statReject").textContent = String(
    suggestions.filter((value) => value === "reject").length
  );

  renderCards();
}

function renderCards() {
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

refreshButton.addEventListener("click", loadReviewQueue);
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
