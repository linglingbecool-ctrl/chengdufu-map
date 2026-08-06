// ===============================================
// 成都府图：50点原型 + CloudBase 图文城市记忆投稿
// 版本：2026-08-07-01
// ===============================================

const APP_VERSION = "20260807-01";
const CLOUDBASE_ENV_ID = "chengdufu-map-d4g459au02132689e";
const CLOUDBASE_REGION = "ap-shanghai";

const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

let cloudApp = null;
let cloudDb = null;
let cloudReady = false;

let markersEl = null;
let detailEl = null;
let routeListEl = null;

let activeContributionPoint = null;
let previewObjectUrls = [];

const statusClass = {
  "存续点": "status-existing",
  "变迁点": "status-changed",
  "不确定点": "status-uncertain",
  existing: "status-existing",
  changed: "status-changed",
  uncertain: "status-uncertain"
};

const statusLabel = {
  "存续点": "存续点",
  "变迁点": "变迁点",
  "不确定点": "不确定点",
  existing: "存续点",
  changed: "变迁点",
  uncertain: "不确定点"
};

const citywalkOrder = [
  "jiuyanqiao",
  "wuhouci",
  "wenshuyuan",
  "qingyanggong",
  "mancheng",
  "hongpailou"
];

/**
 * 初始化 CloudBase。
 * 兼容 CloudBase Web SDK v2 和 v3 的匿名登录接口。
 */
async function initCloudBase() {
  if (!window.cloudbase || typeof window.cloudbase.init !== "function") {
    cloudReady = false;
    console.error(
      "CloudBase SDK 未加载。请检查 index.html 中 cloudbase.full.js 的地址。"
    );
    return false;
  }

  try {
    cloudApp = window.cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      region: CLOUDBASE_REGION
    });

    let loginSucceeded = false;

    // CloudBase Web SDK v3
    if (
      cloudApp.auth &&
      typeof cloudApp.auth.signInAnonymously === "function"
    ) {
      const loginResult = await cloudApp.auth.signInAnonymously();

      if (loginResult?.error) {
        throw loginResult.error;
      }

      loginSucceeded = true;
      console.log("CloudBase v3 匿名登录成功");
    }

    // CloudBase Web SDK v2 / 兼容模式
    else if (typeof cloudApp.auth === "function") {
      const authInstance = cloudApp.auth({
        persistence: "local"
      });

      if (
        authInstance &&
        typeof authInstance.anonymousAuthProvider === "function"
      ) {
        await authInstance
          .anonymousAuthProvider()
          .signIn();

        loginSucceeded = true;
        console.log("CloudBase 兼容模式匿名登录成功");
      } else if (
        authInstance &&
        typeof authInstance.signInAnonymously === "function"
      ) {
        const loginResult =
          await authInstance.signInAnonymously();

        if (loginResult?.error) {
          throw loginResult.error;
        }

        loginSucceeded = true;
        console.log("CloudBase 兼容模式匿名登录成功");
      }
    }

    if (!loginSucceeded) {
      throw new Error(
        "当前 CloudBase SDK 中未找到可用的匿名登录接口"
      );
    }

    if (typeof cloudApp.database !== "function") {
      throw new Error("CloudBase 数据库模块未加载");
    }

    cloudDb = cloudApp.database();
    cloudReady = true;

    console.log(
      "CloudBase 数据库连接成功：",
      CLOUDBASE_ENV_ID
    );

    return true;
  } catch (error) {
    cloudReady = false;
    cloudDb = null;

    console.error("CloudBase 连接失败：", error);
    console.warn(
      "地图与50个点位仍可正常浏览。投稿功能请检查匿名登录、安全来源、云存储权限和 contributions 权限。"
    );

    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusClass(point) {
  return statusClass[point.status] || "status-uncertain";
}

function getStatusLabel(point) {
  return statusLabel[point.status] || point.status || "待校核";
}

function renderOptionalRow(label, value) {
  if (!value) return "";

  return `
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(value)}</span>
  `;
}

function renderPointMedia(point) {
  const figures = [];

  if (point.oldImage) {
    figures.push(`
      <figure>
        <img
          src="./${escapeHtml(point.oldImage)}"
          alt="${escapeHtml(point.nameAncient)}古图局部图"
          loading="lazy"
        >
        <figcaption>古图局部图</figcaption>
      </figure>
    `);
  }

  if (point.currentImage) {
    figures.push(`
      <figure>
        <img
          src="./${escapeHtml(point.currentImage)}"
          alt="${escapeHtml(point.nameModern)}今景图"
          loading="lazy"
        >
        <figcaption>今景图</figcaption>
      </figure>
    `);
  }

  if (!figures.length) {
    return `
      <div class="point-media-placeholder">
        此候选点位的古图局部与当代影像待补充
      </div>
    `;
  }

  return `
    <div class="point-media">
      ${figures.join("")}
    </div>
  `;
}

function renderParagraphs(text) {
  if (!text) return "";

  return String(text)
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderDetail(point, shouldScroll = false) {
  if (!detailEl) return;

  const isBasicPoint = point.detailLevel === "basic";

  const detailLevelText = isBasicPoint
    ? "资料整理中"
    : "官方点位介绍";

  const title = point.nameModern || point.nameAncient || "历史点位";

  const coreMetaHtml = `
    <div class="meta-grid">
      <strong>点位类型</strong>
      <span>${escapeHtml(point.type || "历史点位")}</span>

      <strong>点位状态</strong>
      <span>${escapeHtml(getStatusLabel(point))}</span>

      <strong>古图标注</strong>
      <span>${escapeHtml(point.nameAncient || "待校核")}</span>

      <strong>今日名称</strong>
      <span>${escapeHtml(point.nameModern || "待校核")}</span>

      ${point.routeNote ? `
        <strong>城市线索</strong>
        <span>${escapeHtml(point.routeNote)}</span>
      ` : ""}
    </div>
  `;

  const basicMetaHtml = `
    <div class="meta-grid">
      <strong>点位类型</strong>
      <span>${escapeHtml(point.type || "历史点位")}</span>

      <strong>点位状态</strong>
      <span>资料整理中</span>

      <strong>古图标注</strong>
      <span>${escapeHtml(point.nameAncient || "待校核")}</span>

      <strong>今日名称</strong>
      <span>${escapeHtml(point.nameModern || "待校核")}</span>
    </div>
  `;

  const basicContentHtml = `
    <div class="empty-state">
      <p>
        该点位已完成地图标注，基础历史资料正在整理中。
        公众仍可提交与此地有关的照片、故事或口述线索。
      </p>
    </div>
  `;

  const coreContentHtml = `
    ${point.quick ? `
      <div class="official-summary">
        <h4>点位导读</h4>
        <p>${escapeHtml(point.quick)}</p>
      </div>
    ` : ""}

    ${point.extended ? `
      <div class="official-intro">
        <h4>历史简介</h4>
        ${renderParagraphs(point.extended)}
      </div>
    ` : ""}
  `;

  detailEl.innerHTML = `
    <div class="point-card ${isBasicPoint ? "point-card-basic" : "point-card-core"}">
      <span class="type-pill">
        ${escapeHtml(point.type || "历史点位")}
      </span>

      <div>
        <p class="detail-kicker">
          ${detailLevelText}
        </p>
        <h3>${escapeHtml(title)}</h3>
      </div>

      ${isBasicPoint ? "" : renderPointMedia(point)}

      ${isBasicPoint ? basicMetaHtml : coreMetaHtml}

      ${isBasicPoint ? basicContentHtml : coreContentHtml}

      <button
        type="button"
        class="memory-btn"
        data-memory-button
      >
        留下我的城市记忆
      </button>

      <p class="memory-help">
        可提交文字、现场照片、家庭留影或旧照片线索；每次最多3张图片。
      </p>
    </div>
  `;

  const memoryButton =
    detailEl.querySelector("[data-memory-button]");

  if (memoryButton) {
    memoryButton.addEventListener("click", () => {
      openContributionModal(point);
    });
  }

  if (shouldScroll) {
    const detailPanel =
      detailEl.closest(".detail-panel") || detailEl;

    const rect = detailPanel.getBoundingClientRect();

    const panelOutsideViewport =
      rect.top >= window.innerHeight ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth;

    if (panelOutsideViewport) {
      window.requestAnimationFrame(() => {
        detailPanel.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }
  }
}

function renderMarkers(points) {
  if (!markersEl) return;

  markersEl.innerHTML = "";

  points.forEach((point, index) => {
    const x = Number(point.x);
    const y = Number(point.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      console.warn("点位坐标无效，已跳过：", point);
      return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.className =
      `map-marker ${getStatusClass(point)}`;
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;

    button.setAttribute(
      "aria-label",
      point.nameModern ||
        point.nameAncient ||
        "历史点位"
    );

    button.setAttribute(
      "title",
      `${
        point.nameModern ||
        point.nameAncient ||
        "历史点位"
      }｜${getStatusLabel(point)}`
    );

    if (point.detailLevel === "basic") {
      button.classList.add("map-marker-basic");
    }

    button.addEventListener("click", () => {
      document
        .querySelectorAll(".map-marker")
        .forEach((marker) => {
          marker.classList.remove("active");
        });

      button.classList.add("active");
      renderDetail(point, true);
    });

    markersEl.appendChild(button);

    if (index === 0) {
      button.classList.add("active");
      renderDetail(point);
    }
  });
}

function renderRoute(points) {
  if (!routeListEl) return;

  const pointMap = new Map(
    points.map((point) => [point.id, point])
  );

  routeListEl.innerHTML = citywalkOrder
    .map((id) => pointMap.get(id))
    .filter(Boolean)
    .map(
      (point) => `
        <li class="route-card">
          <h3>${escapeHtml(point.nameModern)}</h3>
          <p>${escapeHtml(point.routeNote)}</p>
        </li>
      `
    )
    .join("");
}

/* ===============================================
   图文投稿弹窗
   =============================================== */

function ensureContributionModal() {
  if (document.querySelector("#contributionModal")) {
    return;
  }

  const modal = document.createElement("div");
  modal.id = "contributionModal";
  modal.className = "contribution-modal";
  modal.hidden = true;

  modal.innerHTML = `
    <div
      class="contribution-modal__backdrop"
      data-close-contribution-modal
    ></div>

    <section
      class="contribution-modal__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contributionModalTitle"
    >
      <button
        type="button"
        class="contribution-modal__close"
        aria-label="关闭投稿窗口"
        data-close-contribution-modal
      >
        ×
      </button>

      <p class="detail-kicker">
        Public Contribution
      </p>

      <h2 id="contributionModalTitle">
        留下城市记忆
      </h2>

      <p
        class="contribution-modal__point"
        id="contributionPointName"
      ></p>

      <form id="contributionForm">
        <label class="contribution-field">
          <span>文字说明</span>
          <textarea
            id="contributionContent"
            rows="5"
            maxlength="1200"
            placeholder="写下你的现场观察、家庭记忆、口述线索或照片说明。"
          ></textarea>
        </label>

        <label class="contribution-field">
          <span>大约时间</span>
          <input
            id="contributionTime"
            type="text"
            maxlength="80"
            placeholder="例如：2000年前后、童年时期、2026年7月"
          >
        </label>

        <label class="contribution-field">
          <span>上传照片（最多3张）</span>
          <input
            id="contributionImages"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
          >
          <small>
            支持 JPG、PNG、WebP；每张不超过5MB。
          </small>
        </label>
<label class="contribution-consent">
  <input
    id="consentToPublish"
    type="checkbox"
  >
  <span>
    我同意该投稿经审核后在本项目中公开展示
  </span>
</label>

<label class="contribution-consent">
  <input
    id="rightsConfirmed"
    type="checkbox"
  >
  <span>
    我确认上传的文字、照片由本人提供，或已获得相关权利人的授权
  </span>
</label>
        <div
          class="contribution-preview"
          id="contributionPreview"
          aria-live="polite"
        ></div>

        <p
          class="contribution-status"
          id="contributionStatus"
          aria-live="polite"
        ></p>

        <div class="contribution-actions-row">
          <button
            type="button"
            class="btn ghost"
            data-close-contribution-modal
          >
            取消
          </button>

          <button
            type="submit"
            class="btn primary"
            id="contributionSubmit"
          >
            提交城市记忆
          </button>
        </div>
      </form>
    </section>
  `;

  document.body.appendChild(modal);

  modal
    .querySelectorAll("[data-close-contribution-modal]")
    .forEach((element) => {
      element.addEventListener("click", closeContributionModal);
    });

  modal
    .querySelector("#contributionImages")
    .addEventListener("change", handleImageSelection);

  modal
    .querySelector("#contributionForm")
    .addEventListener("submit", handleContributionSubmit);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !modal.hidden
    ) {
      closeContributionModal();
    }
  });
}

function openContributionModal(point) {
  if (!cloudReady || !cloudDb || !cloudApp) {
    alert(
      "云端投稿服务尚未连接。\n\n" +
      "地图和点位可以正常浏览，请稍后再试。"
    );
    return;
  }

  ensureContributionModal();

  activeContributionPoint = point;

  const modal =
    document.querySelector("#contributionModal");

  const form =
    modal.querySelector("#contributionForm");

  form.reset();
  clearPreviewUrls();

  modal.querySelector("#contributionPreview").innerHTML = "";
  modal.querySelector("#contributionStatus").textContent = "";
  modal.querySelector("#contributionPointName").textContent =
    `当前点位：${point.nameModern}`;

  modal.hidden = false;
  document.body.classList.add("modal-open");

  window.requestAnimationFrame(() => {
    modal
      .querySelector("#contributionContent")
      .focus();
  });
}

function closeContributionModal() {
  const modal =
    document.querySelector("#contributionModal");

  if (!modal) return;

  modal.hidden = true;
  activeContributionPoint = null;
  document.body.classList.remove("modal-open");
  clearPreviewUrls();
}

function clearPreviewUrls() {
  previewObjectUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  previewObjectUrls = [];
}

function getSelectedImages() {
  const input =
    document.querySelector("#contributionImages");

  return input
    ? Array.from(input.files || [])
    : [];
}

function validateImages(files) {
  if (files.length > MAX_IMAGE_COUNT) {
    throw new Error(
      `每次最多上传${MAX_IMAGE_COUNT}张照片。`
    );
  }

  files.forEach((file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error(
        `“${file.name}”格式不支持，请使用 JPG、PNG 或 WebP。`
      );
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        `“${file.name}”超过5MB，请压缩后再上传。`
      );
    }
  });
}

function handleImageSelection() {
  const preview =
    document.querySelector("#contributionPreview");

  const status =
    document.querySelector("#contributionStatus");

  const input =
    document.querySelector("#contributionImages");

  const files =
    Array.from(input.files || []);

  clearPreviewUrls();
  preview.innerHTML = "";
  status.textContent = "";

  try {
    validateImages(files);
  } catch (error) {
    input.value = "";
    status.textContent = error.message;
    status.classList.add("is-error");
    return;
  }

  status.classList.remove("is-error");

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    previewObjectUrls.push(url);

    const figure = document.createElement("figure");
    figure.innerHTML = `
      <img
        src="${url}"
        alt="${escapeHtml(file.name)}预览"
      >
      <figcaption>
        ${escapeHtml(file.name)}
      </figcaption>
    `;

    preview.appendChild(figure);
  });
}

function getFileExtension(file) {
  const nameParts = file.name.split(".");
  const extension =
    nameParts.length > 1
      ? nameParts.pop().toLowerCase()
      : "";

  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  return extensionMap[file.type] || extension || "jpg";
}

function createRandomId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto
      .randomUUID()
      .replaceAll("-", "");
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

async function uploadContributionImages(
  point,
  files,
  statusElement
) {
  const fileIDs = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const extension = getFileExtension(file);

    const cloudPath =
      `contributions/images/${point.id}/` +
      `${Date.now()}_${index + 1}_${createRandomId()}.${extension}`;

    statusElement.textContent =
      `正在上传第 ${index + 1}/${files.length} 张照片……`;

    const uploadResult =
      await cloudApp.uploadFile({
        cloudPath,
        filePath: file,
        onUploadProgress(progressEvent) {
          if (!progressEvent.total) return;

          const percent =
            Math.round(
              (progressEvent.loaded * 100) /
              progressEvent.total
            );

          statusElement.textContent =
            `正在上传第 ${index + 1}/${files.length} 张照片：${percent}%`;
        }
      });

    if (uploadResult?.code) {
      throw new Error(
        uploadResult.message ||
        uploadResult.code
      );
    }

    if (!uploadResult?.fileID) {
      throw new Error(
        `第 ${index + 1} 张照片上传后未返回 fileID`
      );
    }

    fileIDs.push(uploadResult.fileID);
  }

  return fileIDs;
}

/**
 * 投稿写入 contributions 后，自动调用 processContribution 云函数。
 */
async function triggerContributionProcessing(submissionId) {
  if (!submissionId) {
    throw new Error("缺少投稿记录 ID");
  }

  if (!cloudApp || typeof cloudApp.callFunction !== "function") {
    throw new Error("CloudBase 云函数调用模块不可用");
  }

  const response = await cloudApp.callFunction({
    name: "processContribution",
    data: {
      submissionId
    },
    parse: true
  });

  if (response?.code) {
    throw new Error(
      response.message ||
      response.code
    );
  }

  let result = response?.result;

  // 兼容少数情况下仍返回 JSON 字符串。
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error(
        "云函数返回内容无法解析"
      );
    }
  }

  if (!result?.ok) {
    throw new Error(
      result?.message ||
      "云函数处理投稿失败"
    );
  }

  console.log(
    "投稿自动处理结果：",
    result
  );

  return result;
}

async function handleContributionSubmit(event) {
  event.preventDefault();

  if (!activeContributionPoint) {
    return;
  }

  const content =
    document
      .querySelector("#contributionContent")
      .value
      .trim();

  const approximateTime =
    document
      .querySelector("#contributionTime")
      .value
      .trim();

  const files = getSelectedImages();

  const consentToPublish =
    document.querySelector("#consentToPublish")?.checked === true;

  const rightsConfirmed =
    document.querySelector("#rightsConfirmed")?.checked === true;

  const statusElement =
    document.querySelector("#contributionStatus");

  const submitButton =
    document.querySelector("#contributionSubmit");

  statusElement.classList.remove("is-error");

  if (!content && files.length === 0) {
    statusElement.textContent =
      "请至少填写一段文字，或上传一张照片。";
    statusElement.classList.add("is-error");
    return;
  }

  if (!consentToPublish) {
    statusElement.textContent =
      "请勾选“同意该投稿经审核后公开展示”。";
    statusElement.classList.add("is-error");
    return;
  }

  if (!rightsConfirmed) {
    statusElement.textContent =
      "请确认投稿材料由本人提供，或已获得相关权利人的授权。";
    statusElement.classList.add("is-error");
    return;
  }

  try {
    validateImages(files);

    submitButton.disabled = true;
    submitButton.textContent = "正在提交……";

    let imageFileIds = [];

    if (files.length > 0) {
      imageFileIds =
        await uploadContributionImages(
          activeContributionPoint,
          files,
          statusElement
        );
    }

    statusElement.textContent =
      "照片上传完成，正在保存投稿记录……";

    const materialType =
      files.length > 0 && content
        ? "text_image"
        : files.length > 0
          ? "image"
          : "text";

    const addResult =
      await cloudDb
        .collection("contributions")
        .add({
          pointId: activeContributionPoint.id,
          pointName: activeContributionPoint.nameModern,
          originalContent: content,
          approximateTime,
          materialType,
          imageFileIds,
          imageCount: imageFileIds.length,
          videoFileIds: [],

          consentToPublish,
          rightsConfirmed,

          status: "pending",
          sourceType: "public_ugc",
          createdAt: new Date()
        });

    if (addResult?.error) {
      throw addResult.error;
    }

    if (addResult?.code) {
      throw new Error(
        addResult.message ||
        addResult.code
      );
    }

    const submissionId =
      addResult?._id ||
      addResult?.id;

    if (!submissionId) {
      throw new Error(
        "投稿已保存，但没有取得投稿记录 ID"
      );
    }

    console.log(
      "图文城市记忆保存成功：",
      addResult
    );

    statusElement.textContent =
      "投稿已保存，正在启动自动处理流程……";

    let processingStarted = false;
    let processingMessage = "";

    try {
      const processingResult =
        await triggerContributionProcessing(
          submissionId
        );

      processingStarted = true;
      processingMessage =
        processingResult.message ||
        "投稿已进入自动处理流程。";

      statusElement.textContent =
        processingMessage;
    } catch (processingError) {
      // 云函数调用失败时，不删除已经成功保存的投稿。
      console.error(
        "自动处理启动失败：",
        processingError
      );

      processingMessage =
        "投稿已经保存，但自动处理暂未启动，管理员可稍后重新处理。";

      statusElement.textContent =
        processingMessage;
      statusElement.classList.add("is-error");
    }

    window.setTimeout(() => {
      closeContributionModal();

      if (processingStarted) {
        alert(
          `提交成功：共上传 ${imageFileIds.length} 张照片，投稿已进入自动处理流程。`
        );
      } else {
        alert(
          `投稿已保存：共上传 ${imageFileIds.length} 张照片，但自动处理暂未启动。`
        );
      }
    }, 700);
  } catch (error) {
    console.error(
      "图文投稿失败：",
      error
    );

    statusElement.textContent =
      `提交失败：${error.message || "请稍后重试"}`;
    statusElement.classList.add("is-error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "提交城市记忆";
  }
}

async function loadPoints() {
  const pointsUrl =
    `./points.json?v=${APP_VERSION}`;

  const response =
    await fetch(pointsUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

  if (!response.ok) {
    throw new Error(
      `读取 points.json 失败：HTTP ${response.status}`
    );
  }

  const points =
    await response.json();

  if (!Array.isArray(points)) {
    throw new TypeError(
      "points.json 的最外层必须是数组"
    );
  }

  if (points.length < 50) {
    console.warn(
      `当前只读取到 ${points.length} 个点位；预期为50个。`
    );
  } else {
    console.log(
      `已读取 ${points.length} 个点位`
    );
  }

  return points;
}

async function init() {
  markersEl =
    document.querySelector("#mapMarkers");

  detailEl =
    document.querySelector("#pointDetail");

  routeListEl =
    document.querySelector("#routeList");

  if (!markersEl || !detailEl || !routeListEl) {
    console.error(
      "页面缺少必要元素：#mapMarkers、#pointDetail 或 #routeList"
    );
    return;
  }

  ensureContributionModal();

  try {
    const points =
      await loadPoints();

    renderMarkers(points);
    renderRoute(points);

    await initCloudBase();
  } catch (error) {
    detailEl.innerHTML = `
      <p class="empty-state">
        点位数据暂时无法加载。请检查 points.json 是否位于仓库根目录，以及JSON格式是否正确。
      </p>
    `;

    routeListEl.innerHTML = "";

    console.error(
      "网站初始化失败：",
      error
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}
