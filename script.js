// ===============================================
// 成都府图：50点原型 + CloudBase 城市记忆投稿
// 版本：2026-07-29-2
// ===============================================

const APP_VERSION = "20260729-2";
const CLOUDBASE_ENV_ID = "chengdufu-map-d4g459au02132689e";
const CLOUDBASE_REGION = "ap-shanghai";

let cloudApp = null;
let cloudDb = null;
let cloudReady = false;

let markersEl = null;
let detailEl = null;
let routeListEl = null;

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
 * CloudBase 连接失败不会阻止地图、点位详情和投稿按钮显示。
 */
async function initCloudBase() {
  if (!window.cloudbase || typeof window.cloudbase.init !== "function") {
    console.warn(
      "CloudBase SDK 未加载。地图仍可浏览，但投稿服务暂不可用。"
    );
    return false;
  }

  try {
    cloudApp = window.cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      region: CLOUDBASE_REGION
    });

    if (
      !cloudApp.auth ||
      typeof cloudApp.auth.signInAnonymously !== "function"
    ) {
      throw new Error(
        "当前 CloudBase SDK 中未找到匿名登录接口 signInAnonymously"
      );
    }

    const { error } = await cloudApp.auth.signInAnonymously();

    if (error) {
      throw error;
    }

    cloudDb = cloudApp.database();
    cloudReady = true;

    console.log("CloudBase 已连接：", CLOUDBASE_ENV_ID);
    return true;
  } catch (error) {
    cloudReady = false;
    cloudDb = null;

    console.error("CloudBase 初始化失败：", error);
    console.warn(
      "地图和50个点位仍可正常浏览；投稿功能需要检查匿名登录、安全来源及数据库权限。"
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

function renderDetail(point, shouldScroll = false) {
  if (!detailEl) return;

  const detailLevelText =
    point.detailLevel === "basic" ? "Candidate Point" : "Point Detail";

  detailEl.innerHTML = `
    <div class="point-card">
      <span class="type-pill">${escapeHtml(point.type)}</span>

      <div>
        <p class="detail-kicker">${detailLevelText}</p>
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

      ${
        point.source
          ? `
            <p class="source">
              来源：${escapeHtml(point.source)}
            </p>
          `
          : ""
      }

      <button
        type="button"
        class="memory-btn"
        data-memory-button
      >
        留下我的城市记忆
      </button>

      <p class="memory-help">
        可提交现场观察、家庭留影、旧照片线索或口述记忆。
      </p>
    </div>
  `;

  // 按钮使用 data-memory-button 属性，不能再用不存在的 #memoryButton。
   const memoryButton =
    detailEl.querySelector("[data-memory-button]");

  if (memoryButton) {
    memoryButton.addEventListener("click", () => {
      submitMemory(point);
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
    button.className = `map-marker ${getStatusClass(point)}`;
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.setAttribute(
      "aria-label",
      point.nameModern || point.nameAncient || "历史点位"
    );
    button.setAttribute(
      "title",
      `${point.nameModern || point.nameAncient || "历史点位"}｜${getStatusLabel(point)}`
    );

    if (point.detailLevel === "basic") {
      button.classList.add("map-marker-basic");
    }

    button.addEventListener("click", () => {
      document
        .querySelectorAll(".map-marker")
        .forEach((marker) => marker.classList.remove("active"));

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

async function submitMemory(point) {
  if (!cloudReady || !cloudDb) {
    alert(
      "云端投稿服务尚未连接。\n\n地图和点位可以正常浏览。请检查 CloudBase 匿名登录、安全来源和 contributions 集合权限后再提交。"
    );
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
    const result = await cloudDb.collection("contributions").add({
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

    console.log("城市记忆提交成功：", result);
    alert("提交成功。该内容已进入城市记忆待处理队列。");
  } catch (error) {
    console.error("投稿失败：", error);

    alert(
      "提交失败。\n\n请检查：\n1. contributions 集合是否允许匿名用户新增本人数据；\n2. 匿名登录是否开启；\n3. GitHub Pages 域名是否加入安全来源。"
    );
  }
}

async function loadPoints() {
  const pointsUrl = `./points.json?v=${APP_VERSION}`;

  const response = await fetch(pointsUrl, {
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

  const points = await response.json();

  if (!Array.isArray(points)) {
    throw new TypeError(
      "points.json 的最外层必须是数组"
    );
  }

  if (points.length < 50) {
    console.warn(
      `当前只读取到 ${points.length} 个点位；预期为50个。请确认 points.json 已完成部署。`
    );
  } else {
    console.log(`已读取 ${points.length} 个点位`);
  }

  return points;
}

async function init() {
  markersEl = document.querySelector("#mapMarkers");
  detailEl = document.querySelector("#pointDetail");
  routeListEl = document.querySelector("#routeList");

  if (!markersEl || !detailEl || !routeListEl) {
    console.error(
      "页面缺少必要元素：#mapMarkers、#pointDetail 或 #routeList"
    );
    return;
  }

  try {
    // 先加载并显示地图；CloudBase失败不会阻止50点展示。
    const points = await loadPoints();

    renderMarkers(points);
    renderRoute(points);

    // 地图渲染完成后再连接云端。
    await initCloudBase();
  } catch (error) {
    detailEl.innerHTML = `
      <p class="empty-state">
        点位数据暂时无法加载。请检查 points.json 是否位于仓库根目录，以及JSON格式是否正确。
      </p>
    `;

    routeListEl.innerHTML = "";
    console.error("网站初始化失败：", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
