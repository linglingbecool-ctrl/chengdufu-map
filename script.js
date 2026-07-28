// ===============================================
// 成都府图：50点原型 + CloudBase 投稿入口
// ===============================================

const CLOUDBASE_ENV_ID = "chengdufu-map-d4g459au02132689e";
const CLOUDBASE_REGION = "ap-shanghai";

let cloudApp = null;
let cloudDb = null;
let cloudAuth = null;
let cloudReady = false;

async function initCloudBase() {
  if (!window.cloudbase) {
    console.warn("CloudBase SDK 未加载；地图仍可浏览，但投稿暂不可用。");
    return false;
  }

  try {
    cloudApp = window.cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      region: CLOUDBASE_REGION
    });

    cloudAuth = cloudApp.auth({
      persistence: "local"
    });

    // 匿名登录已在控制台开启。若已有登录态，SDK会复用。
    await cloudAuth.signInAnonymously();

    cloudDb = cloudApp.database();
    cloudReady = true;
    console.log("CloudBase 已连接");
    return true;
  } catch (error) {
    cloudReady = false;
    console.error("CloudBase 初始化失败：", error);
    return false;
  }
}

const statusClass = {
  "存续点": "status-existing",
  "变迁点": "status-changed",
  "不确定点": "status-uncertain",
  existing: "status-existing",
  changed: "status-changed",
  uncertain: "status-uncertain"
};

const statusLabel = {
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

const markersEl = document.querySelector("#mapMarkers");
const detailEl = document.querySelector("#pointDetail");
const routeListEl = document.querySelector("#routeList");

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

  return `<div class="point-media">${figures.join("")}</div>`;
}

function renderDetail(point) {
  detailEl.innerHTML = `
    <div class="point-card">
      <span class="type-pill">${escapeHtml(point.type)}</span>

      <div>
        <p class="detail-kicker">
          ${point.detailLevel === "basic" ? "Candidate Point" : "Point Detail"}
        </p>
        <h3>${escapeHtml(point.nameModern)}</h3>
      </div>

      ${renderPointMedia(point)}

      <div class="meta-grid">
        <strong>古图名</strong>
        <span>${escapeHtml(point.nameAncient)}</span>

        <strong>今名</strong>
        <span>${escapeHtml(point.nameModern)}</span>

        <strong>状态</strong>
        <span>${escapeHtml(getStatusLabel(point))}</span>

        ${renderOptionalRow("可信度", point.confidence)}
        ${renderOptionalRow("判断依据", point.evidence)}
        ${renderOptionalRow("校勘备注", point.note)}
      </div>

      ${point.quick ? `<p>${escapeHtml(point.quick)}</p>` : ""}
      ${point.extended ? `<p>${escapeHtml(point.extended)}</p>` : ""}

      ${point.source ? `
        <p class="source">
          来源：${escapeHtml(point.source)}
        </p>
      ` : ""}

      <button
        type="button"
        class="memory-btn"
        id="memoryButton"
      >
        留下我的城市记忆
      </button>

      <p class="memory-help">
        可提交现场观察、家庭留影、旧照片线索或口述记忆。
      </p>
    </div>
  `;

  const memoryButton = document.querySelector("#memoryButton");
  memoryButton?.addEventListener("click", () => submitMemory(point));
}

function renderMarkers(points) {
  markersEl.innerHTML = "";

  points.forEach((point, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-marker ${getStatusClass(point)}`;
    button.style.left = `${point.x}%`;
    button.style.top = `${point.y}%`;
    button.setAttribute("aria-label", point.nameModern);
    button.setAttribute("title", `${point.nameModern}｜${getStatusLabel(point)}`);

    if (point.detailLevel === "basic") {
      button.classList.add("map-marker-basic");
    }

    button.addEventListener("click", () => {
      document
        .querySelectorAll(".map-marker")
        .forEach((marker) => marker.classList.remove("active"));

      button.classList.add("active");
      renderDetail(point);
    });

    markersEl.appendChild(button);

    if (index === 0) {
      button.classList.add("active");
      renderDetail(point);
    }
  });
}

function renderRoute(points) {
  const pointMap = new Map(points.map((point) => [point.id, point]));

  routeListEl.innerHTML = citywalkOrder
    .map((id) => pointMap.get(id))
    .filter(Boolean)
    .map((point) => `
      <li class="route-card">
        <h3>${escapeHtml(point.nameModern)}</h3>
        <p>${escapeHtml(point.routeNote)}</p>
      </li>
    `)
    .join("");
}

async function submitMemory(point) {
  if (!cloudReady || !cloudDb) {
    alert("云端投稿服务尚未连接。地图可以浏览，请稍后再提交。");
    return;
  }

  const content = window.prompt(
    `请写下你与“${point.nameModern}”有关的记忆或现场观察：`
  );

  if (!content || !content.trim()) return;

  const approximateTime = window.prompt(
    "这段记忆大约发生在什么时间？例如：2000年前后、童年时期、2026年7月"
  );

  try {
    await cloudDb.collection("contributions").add({
      pointId: point.id,
      pointName: point.nameModern,
      originalContent: content.trim(),
      approximateTime: (approximateTime || "").trim(),
      materialType: "text",
      imageFileIds: [],
      videoFileIds: [],
      status: "pending",
      sourceType: "public_ugc",
      createdAt: new Date()
    });

    alert("提交成功。该内容已进入城市记忆待处理队列。");
  } catch (error) {
    console.error("投稿失败：", error);
    alert("提交失败。请检查 contributions 集合权限、匿名登录和安全来源设置。");
  }
}

async function init() {
  try {
    const response = await fetch("./points.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const points = await response.json();

    // 地图先渲染，CloudBase失败也不会影响浏览和按钮显示。
    renderMarkers(points);
    renderRoute(points);

    await initCloudBase();
  } catch (error) {
    detailEl.innerHTML = `
      <p class="empty-state">
        点位数据暂时无法加载。请检查 points.json 是否位于仓库根目录。
      </p>
    `;
    routeListEl.innerHTML = "";
    console.error("Failed to load points.json", error);
  }
}

init();
