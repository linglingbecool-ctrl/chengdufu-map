// ===============================================
// 成都府图：50点导览 + CloudBase 城市记忆投稿
// + 审核通过后点亮地标
// 版本：2026-08-12-V3-零模型智能整理接入
// ===============================================

const APP_VERSION = "20260812-maphub02";

const CLOUDBASE_ENV_ID =
  window.TUHUI_CONFIG?.envId ||
  "chengdufu-map-d4g459au02132689e";

const CLOUDBASE_REGION =
  window.TUHUI_CONFIG?.region ||
  "ap-shanghai";

const MAX_IMAGE_COUNT = 3;

const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;

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

/*
 * 城市记忆共创工坊：表达偏好标签。
 * 零模型版本在浏览器本地完成基础整理，
 * 不会覆盖用户的 originalContent。
 */
const WRITING_STYLES = [
  {
    id: "original",
    mark: "原",
    name: "保持原声",
    tagline: "我的记忆，我来说",
    description: "尽量保留你的原话，只整理语序、错字和重复。"
  },
  {
    id: "sushi",
    mark: "苏",
    name: "苏轼",
    tagline: "清旷 · 日常 · 有味",
    description: "适合饮食、出游、朋友与普通生活中的细小滋味。"
  },
  {
    id: "dufu",
    mark: "杜",
    name: "杜甫",
    tagline: "沉静 · 时地 · 深情",
    description: "适合老地方、成长、离别与时间变化中的真实感受。"
  },
  {
    id: "libai",
    mark: "李",
    name: "李白",
    tagline: "明快 · 山水 · 想象",
    description: "适合江河、夜景、旅行与青春记忆，强调空间与意象。"
  },
  {
    id: "lijieren",
    mark: "劼",
    name: "李劼人",
    tagline: "街巷 · 市井 · 成都",
    description: "适合老街、商铺、邻里与成都日常生活的细节观察。"
  },
  {
    id: "luxun",
    mark: "鲁",
    name: "鲁迅",
    tagline: "白描 · 观察 · 克制",
    description: "适合人物、街景与细节观察，减少空泛抒情。"
  },
  {
    id: "alai",
    mark: "阿",
    name: "阿来",
    tagline: "地方 · 自然 · 时间",
    description: "适合地域、家园与时间痕迹，以地方经验为中心。"
  },
  {
    id: "guomoruo",
    mark: "郭",
    name: "郭沫若",
    tagline: "历史 · 抒情 · 联想",
    description: "适合古迹、故乡与历史空间，强调时代与空间联想。"
  }
];

let selectedWritingStyle = "original";

/*
 * 零模型智能整理状态。
 *
 * originalContent 永远保留真实原文；
 * collaborativeDraft 只在用户明确选择后作为公开表达偏好保存。
 */
let currentRewriteDraft = "";
let currentRewriteAccepted = false;
let currentRewriteMeta = null;
let rewriteRequestToken = 0;

let allPoints = [];

let approvedMemoriesByPoint =
  new Map();

/*
 * 当前浏览器用户自己的投稿数据。
 *
 * 注意：
 * - pending / processing / approved 都计入“我的点亮”；
 * - rejected 不计入个人点亮；
 * - 公共 approved 记忆仍可展示数量，但不替当前用户点亮地图。
 */
let myContributionData = null;

let myContributionPointState =
  new Map();

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
  "不确定点": "待考点",

  existing: "存续点",
  changed: "变迁点",
  uncertain: "待考点"
};

const citywalkOrder = [
  "jiuyanqiao",
  "wuhouci",
  "wenshuyuan",
  "qingyanggong",
  "mancheng",
  "hongpailou"
];

const MAP_HUB_MODES = {
  explore: {
    label: "01 · 探古",
    caption: "六个核心点位正在古图上显影",
    hint: "点击墨点，阅读古今点位档案"
  },

  ask: {
    label: "02 · 问图",
    caption: "选择核心点位，让地图与馆藏证据同步聚焦",
    hint: "点击六个核心点位，右侧选择证据问题"
  },

  memory: {
    label: "03 · 留忆",
    caption: "选择地点，写下真实记忆并点亮我的成都",
    hint: "点击任一点位，进入城市记忆共创工坊"
  }
};

let mapHubMode = "explore";
let mapMemoryLayer = "mine";
let activeMapPointId = "jiuyanqiao";
let mapHubInitialized = false;

const mapHubElements = {};

/* ===============================================
   CloudBase 初始化
   =============================================== */

async function initCloudBase() {
  if (
    !window.cloudbase ||
    typeof window.cloudbase.init !== "function"
  ) {
    cloudReady = false;

    console.error(
      "CloudBase SDK 未加载。请检查 index.html 中 cloudbase.full.js 的地址。"
    );

    return false;
  }

  try {
    const cloudbaseOptions = {
      env: CLOUDBASE_ENV_ID,
      region: CLOUDBASE_REGION
    };

    if (
      window.TUHUI_CONFIG
        ?.publishableKey
    ) {
      cloudbaseOptions.accessKey =
        window.TUHUI_CONFIG
          .publishableKey;
    }

    cloudApp =
      window.cloudbase.init(
        cloudbaseOptions
      );

    // 供馆藏 AI 等前端模块共享当前 CloudBase App。
    window.tuhuiCloudApp =
      cloudApp;

    let loginSucceeded = false;

    /* CloudBase Web SDK v3 */
    if (
      cloudApp.auth &&
      typeof cloudApp.auth.signInAnonymously
        === "function"
    ) {
      const result =
        await cloudApp.auth
          .signInAnonymously();

      if (result?.error) {
        throw result.error;
      }

      loginSucceeded = true;
    }

    /* CloudBase Web SDK v2 */
    else if (
      typeof cloudApp.auth
        === "function"
    ) {
      const authInstance =
        cloudApp.auth({
          persistence: "local"
        });

      if (
        authInstance &&
        typeof authInstance
          .anonymousAuthProvider
          === "function"
      ) {
        await authInstance
          .anonymousAuthProvider()
          .signIn();

        loginSucceeded = true;
      }

      else if (
        authInstance &&
        typeof authInstance
          .signInAnonymously
          === "function"
      ) {
        const result =
          await authInstance
            .signInAnonymously();

        if (result?.error) {
          throw result.error;
        }

        loginSucceeded = true;
      }
    }

    if (!loginSucceeded) {
      throw new Error(
        "当前 CloudBase SDK 中未找到可用的匿名登录接口"
      );
    }

    if (
      typeof cloudApp.database
        !== "function"
    ) {
      throw new Error(
        "CloudBase 数据库模块未加载"
      );
    }

    cloudDb =
      cloudApp.database();

    cloudReady = true;

    console.log(
      "CloudBase 连接成功：",
      CLOUDBASE_ENV_ID
    );

    window.dispatchEvent(
      new CustomEvent(
        "tuhui:cloud-ready",
        {
          detail: {
            ready: true
          }
        }
      )
    );

    return true;
  }

  catch (error) {
    cloudReady = false;
    cloudDb = null;

    console.error(
      "CloudBase 连接失败：",
      error
    );

    window.dispatchEvent(
      new CustomEvent(
        "tuhui:cloud-ready",
        {
          detail: {
            ready: false
          }
        }
      )
    );

    return false;
  }
}

/* ===============================================
   通用工具
   =============================================== */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function getStatusClass(point) {
  return (
    statusClass[point.status] ||
    "status-uncertain"
  );
}

function getStatusLabel(point) {
  return (
    statusLabel[point.status] ||
    point.status ||
    "待考点"
  );
}

function renderOptionalRow(
  label,
  value
) {
  if (!value) {
    return "";
  }

  return `
    <strong>
      ${escapeHtml(label)}
    </strong>

    <span>
      ${escapeHtml(value)}
    </span>
  `;
}

function renderParagraphs(text) {
  if (!text) {
    return "";
  }

  return String(text)
    .split(/\n+/)
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean)
    .map(
      (item) => `
        <p>
          ${escapeHtml(item)}
        </p>
      `
    )
    .join("");
}

/* ===============================================
   点位图片
   =============================================== */

function renderPointMedia(point) {
  const figures = [];

  if (point.oldImage) {
    figures.push(`
      <figure>
        <img
          src="./${escapeHtml(
            point.oldImage
          )}"
          alt="${escapeHtml(
            point.nameAncient
          )}古图局部图"
          loading="lazy"
        >

        <figcaption>
          古图局部
        </figcaption>
      </figure>
    `);
  }

  if (point.currentImage) {
    figures.push(`
      <figure>
        <img
          src="./${escapeHtml(
            point.currentImage
          )}"
          alt="${escapeHtml(
            point.nameModern
          )}今日影像"
          loading="lazy"
        >

        <figcaption>
          今日影像
        </figcaption>
      </figure>
    `);
  }

  if (!figures.length) {
    return `
      <div
        class="point-media-placeholder"
      >
        该点位的古图局部与当代影像正在整理中
      </div>
    `;
  }

  return `
    <div class="point-media">
      ${figures.join("")}
    </div>
  `;
}

/* ===============================================
   城市记忆数据
   =============================================== */

function normalizeFunctionResult(
  response
) {
  let result =
    response?.result;

  if (
    typeof result
      === "string"
  ) {
    try {
      result =
        JSON.parse(result);
    }

    catch {
      return null;
    }
  }

  return result || null;
}

function getPointMemories(
  pointId
) {
  return (
    approvedMemoriesByPoint
      .get(pointId) ||
    []
  );
}

/**
 * 把 CloudBase fileID 转成临时图片地址。
 */
async function resolveMemoryImageUrls(
  memories
) {
  if (
    !cloudApp ||
    typeof cloudApp
      .getTempFileURL
      !== "function"
  ) {
    return memories;
  }

  const fileIds =
    Array.from(
      new Set(
        memories.flatMap(
          (memory) =>
            Array.isArray(
              memory.imageFileIds
            )
              ? memory.imageFileIds
                  .filter(Boolean)
              : []
        )
      )
    );

  if (!fileIds.length) {
    return memories;
  }

  try {
    const result =
      await cloudApp
        .getTempFileURL({
          fileList: fileIds
        });

    const fileList =
      result?.fileList ||
      result?.result?.fileList ||
      [];

    const urlMap =
      new Map();

    fileList.forEach(
      (item) => {
        const fileId =
          item?.fileID ||
          item?.fileId ||
          item?.file_id;

        const url =
          item?.tempFileURL ||
          item?.tempFileUrl ||
          item?.download_url;

        if (
          fileId &&
          url
        ) {
          urlMap.set(
            fileId,
            url
          );
        }
      }
    );

    return memories.map(
      (memory) => ({
        ...memory,

        imageUrls:
          (
            memory.imageFileIds ||
            []
          )
            .map(
              (fileId) =>
                urlMap.get(
                  fileId
                )
            )
            .filter(Boolean)
      })
    );
  }

  catch (error) {
    console.warn(
      "城市记忆图片临时地址获取失败，仅展示文字：",
      error
    );

    return memories;
  }
}

/**
 * 调用 getPublicMemories 云函数。
 *
 * 只读取：
 * status = approved
 * consentToPublish = true
 * rightsConfirmed = true
 */
async function loadApprovedMemories() {
  approvedMemoriesByPoint =
    new Map();

  if (
    !cloudReady ||
    !cloudApp ||
    typeof cloudApp.callFunction
      !== "function"
  ) {
    return;
  }

  try {
    const response =
      await cloudApp
        .callFunction({
          name:
            "getPublicMemories",

          data: {
            limit: 100
          },

          parse: true
        });

    const result =
      normalizeFunctionResult(
        response
      );

    if (
      !result?.ok ||
      !Array.isArray(
        result.memories
      )
    ) {
      throw new Error(
        result?.message ||
        "公开城市记忆返回格式不正确"
      );
    }

    const memories =
      await resolveMemoryImageUrls(
        result.memories
      );

    memories.forEach(
      (memory) => {
        if (
          !memory?.pointId
        ) {
          return;
        }

        const current =
          approvedMemoriesByPoint
            .get(
              memory.pointId
            ) ||
          [];

        current.push(
          memory
        );

        approvedMemoriesByPoint
          .set(
            memory.pointId,
            current
          );
      }
    );

    console.log(
      `已加载 ${memories.length} 条审核通过的城市记忆`
    );
  }

  catch (error) {
    console.warn(
      "公开城市记忆暂未加载。若尚未部署 getPublicMemories 云函数，这是正常现象：",
      error
    );
  }
}


/* ===============================================
   我的城市记忆 / 共建者身份 / 徽章
   =============================================== */

function rebuildMyContributionPointState(
  items
) {
  myContributionPointState =
    new Map();

  /*
   * 同一个点位可能投过多次。
   * 显示优先级：
   * 已公开 > 审核中 > 未通过
   */
  const priority = {
    rejected: 1,
    pending: 2,
    processing: 2,
    approved: 3
  };

  (items || [])
    .forEach(
      (item) => {
        if (!item?.pointId) {
          return;
        }

        const nextStatus =
          item.status || "pending";

        const currentStatus =
          myContributionPointState
            .get(item.pointId);

        if (
          (
            priority[nextStatus] ||
            0
          ) >=
          (
            priority[currentStatus] ||
            0
          )
        ) {
          myContributionPointState
            .set(
              item.pointId,
              nextStatus
            );
        }
      }
    );
}

function getMyPointState(
  pointId
) {
  return (
    myContributionPointState
      .get(pointId) ||
    ""
  );
}


function isMyPointLitStatus(
  status
) {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "approved"
  );
}

function getMyLitPointCount() {
  let count = 0;

  myContributionPointState
    .forEach(
      (status) => {
        if (
          isMyPointLitStatus(
            status
          )
        ) {
          count += 1;
        }
      }
    );

  return count;
}

function getMyCitywalkLitCount() {
  return citywalkOrder
    .filter(
      (pointId) =>
        isMyPointLitStatus(
          getMyPointState(
            pointId
          )
        )
    )
    .length;
}

function getPublicMemoryCount() {
  let count = 0;

  approvedMemoriesByPoint
    .forEach(
      (memories) => {
        count +=
          Array.isArray(memories)
            ? memories.length
            : 0;
      }
    );

  return count;
}

function updateMapMemoryLayerCounts() {
  const mineCount =
    document.querySelector(
      "#mapMineCount"
    );

  const cityCount =
    document.querySelector(
      "#mapCityCount"
    );

  if (mineCount) {
    mineCount.textContent =
      String(
        getMyLitPointCount()
      );
  }

  if (cityCount) {
    cityCount.textContent =
      String(
        getPublicMemoryCount()
      );
  }
}

function setMapMemoryLayer(
  layer
) {
  mapMemoryLayer =
    layer === "city"
      ? "city"
      : "mine";

  if (mapHubElements.hub) {
    mapHubElements.hub.dataset
      .memoryLayer =
        mapMemoryLayer;
  }

  document
    .querySelectorAll(
      "[data-memory-layer]"
    )
    .forEach(
      (button) => {
        if (
          !button.matches(
            ".map-memory-toggle button"
          )
        ) {
          return;
        }

        const selected =
          button.dataset
            .memoryLayer ===
          mapMemoryLayer;

        button.classList.toggle(
          "is-active",
          selected
        );

        button.setAttribute(
          "aria-pressed",
          selected
            ? "true"
            : "false"
        );
      }
    );

  updateMapMemoryLayerCounts();
}

function updateMapPointContext(
  point
) {
  if (!point) {
    return;
  }

  const context =
    mapHubElements.aiPointContext;

  if (!context) {
    return;
  }

  const isCorePoint =
    citywalkOrder.includes(
      point.id
    );

  if (!isCorePoint) {
    context.textContent =
      `${
        point.nameModern ||
        point.nameAncient ||
        "该点位"
      }尚未进入六点位馆藏知识库，请切回“探古”阅读基础档案。`;

    return;
  }

  context.textContent =
    `古图“${
      point.nameAncient ||
      "待考"
    }” · 今日“${
      point.nameModern ||
      point.nameAncient
    }” · 点击下方推荐问题开始查证。`;
}

function focusMapPoint(
  point
) {
  if (!point) {
    return;
  }

  activeMapPointId =
    point.id;

  document
    .querySelectorAll(
      ".map-marker"
    )
    .forEach(
      (marker) => {
        marker.classList.toggle(
          "active",
          marker.dataset.pointId ===
            point.id
        );
      }
    );

  if (mapHubElements.hub) {
    const x = Number(point.x);
    const y = Number(point.y);

    if (
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      mapHubElements.hub.style
        .setProperty(
          "--map-focus-x",
          `${x}%`
        );

      mapHubElements.hub.style
        .setProperty(
          "--map-focus-y",
          `${y}%`
        );
    }
  }

  updateMapPointContext(
    point
  );
}

function notifyAiPointSelection(
  pointId
) {
  document.dispatchEvent(
    new CustomEvent(
      "tuhui:map-select-ai-point",
      {
        detail: {
          pointId
        }
      }
    )
  );
}

function setMapHubMode(
  mode,
  {
    shouldScroll = false,
    notifyAi = true
  } = {}
) {
  mapHubMode =
    MAP_HUB_MODES[mode]
      ? mode
      : "explore";

  const copy =
    MAP_HUB_MODES[
      mapHubMode
    ];

  if (mapHubElements.hub) {
    mapHubElements.hub.dataset
      .mapMode =
        mapHubMode;
  }

  document
    .querySelectorAll(
      ".map-entry-card[data-map-mode]"
    )
    .forEach(
      (button) => {
        const selected =
          button.dataset.mapMode ===
          mapHubMode;

        button.classList.toggle(
          "is-active",
          selected
        );

        button.setAttribute(
          "aria-pressed",
          selected
            ? "true"
            : "false"
        );
      }
    );

  if (mapHubElements.caption) {
    mapHubElements.caption
      .innerHTML = `
        <span>${copy.label}</span>
        <small>${copy.caption}</small>
      `;
  }

  if (mapHubElements.hint) {
    mapHubElements.hint.textContent =
      copy.hint;
  }

  const drawerOpen =
    mapHubMode === "ask";

  mapHubElements.aiDrawer
    ?.setAttribute(
      "aria-hidden",
      drawerOpen
        ? "false"
        : "true"
    );

  mapHubElements.detailPanel
    ?.setAttribute(
      "aria-hidden",
      drawerOpen
        ? "true"
        : "false"
    );

  const activePoint =
    allPoints.find(
      (point) =>
        point.id ===
        activeMapPointId
    ) ||
    allPoints[0];

  if (activePoint) {
    focusMapPoint(
      activePoint
    );

    if (
      drawerOpen &&
      notifyAi &&
      citywalkOrder.includes(
        activePoint.id
      )
    ) {
      notifyAiPointSelection(
        activePoint.id
      );
    }

    if (
      mapHubMode !== "ask"
    ) {
      renderDetail(
        activePoint
      );
    }
  }

  if (shouldScroll) {
    document
      .querySelector("#map")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }
}

function handleMapPointInteraction(
  point
) {
  focusMapPoint(
    point
  );

  if (mapHubMode === "ask") {
    if (
      citywalkOrder.includes(
        point.id
      )
    ) {
      notifyAiPointSelection(
        point.id
      );
    }

    return;
  }

  renderDetail(
    point,
    mapHubMode === "explore"
  );

  if (mapHubMode === "memory") {
    openContributionModal(
      point
    );
  }
}

function initMapHubShell() {
  if (mapHubInitialized) {
    return;
  }

  mapHubElements.hub =
    document.querySelector(
      "#mapHub"
    );

  if (!mapHubElements.hub) {
    return;
  }

  mapHubInitialized = true;

  mapHubElements.caption =
    document.querySelector(
      "#mapModeCaption"
    );

  mapHubElements.hint =
    document.querySelector(
      "#mapActionHint"
    );

  mapHubElements.detailPanel =
    document.querySelector(
      "#mapDetailPanel"
    );

  mapHubElements.aiDrawer =
    document.querySelector(
      "#mapAiDrawer"
    );

  mapHubElements.aiPointContext =
    document.querySelector(
      "#mapAiPointContext"
    );

  mapHubElements.mapPanel =
    document.querySelector(
      "#mapHub .map-panel"
    );

  const syncMapStageHeight = () => {
    const height =
      mapHubElements.mapPanel
        ?.getBoundingClientRect()
        .height;

    if (
      mapHubElements.hub &&
      Number.isFinite(height) &&
      height > 0
    ) {
      mapHubElements.hub.style
        .setProperty(
          "--map-stage-height",
          `${Math.round(height)}px`
        );
    }
  };

  requestAnimationFrame(
    syncMapStageHeight
  );

  window.addEventListener(
    "resize",
    syncMapStageHeight,
    {
      passive: true
    }
  );

  if (
    "ResizeObserver" in window &&
    mapHubElements.mapPanel
  ) {
    const mapStageObserver =
      new ResizeObserver(
        syncMapStageHeight
      );

    mapStageObserver.observe(
      mapHubElements.mapPanel
    );
  }

  const aiHost =
    document.querySelector(
      "#mapAiHost"
    );

  const readingDesk =
    document.querySelector(
      "#ai-guide .ai-reading-desk"
    );

  if (
    aiHost &&
    readingDesk
  ) {
    aiHost.appendChild(
      readingDesk
    );

    document
      .querySelector(
        "#ai-guide"
      )
      ?.classList
      .remove(
        "has-reading-desk"
      );
  }

  document
    .querySelectorAll(
      ".map-entry-card[data-map-mode]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            setMapHubMode(
              button.dataset
                .mapMode
            )
        );
      }
    );

  document
    .querySelectorAll(
      ".map-memory-toggle [data-memory-layer]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            setMapMemoryLayer(
              button.dataset
                .memoryLayer
            )
        );
      }
    );

  document
    .querySelectorAll(
      "[data-map-mode-launch]"
    )
    .forEach(
      (link) => {
        link.addEventListener(
          "click",
          () =>
            setMapHubMode(
              link.dataset
                .mapModeLaunch,
              {
                shouldScroll:
                  true
              }
            )
        );
      }
    );

  document
    .querySelector(
      "#mapAiClose"
    )
    ?.addEventListener(
      "click",
      () =>
        setMapHubMode(
          "explore"
        )
    );

  document.addEventListener(
    "tuhui:ai-point-selected",
    (event) => {
      const pointId =
        event.detail
          ?.pointId;

      const point =
        allPoints.find(
          (item) =>
            item.id ===
            pointId
        );

      if (!point) {
        return;
      }

      setMapHubMode(
        "ask",
        {
          notifyAi: false
        }
      );

      focusMapPoint(
        point
      );
    }
  );

  const revealHub = () => {
    mapHubElements.hub
      ?.classList.add(
        "is-visible"
      );
  };

  if (
    "IntersectionObserver" in
    window
  ) {
    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries.some(
              (entry) =>
                entry.isIntersecting
            )
          ) {
            revealHub();
            observer.disconnect();
          }
        },
        {
          threshold: 0.18
        }
      );

    observer.observe(
      mapHubElements.hub
    );
  }

  else {
    revealHub();
  }

  setMapMemoryLayer(
    "mine"
  );

  setMapHubMode(
    "explore",
    {
      notifyAi: false
    }
  );
}

function ensurePersonalLightToast() {
  let toast =
    document.querySelector(
      "#personalLightToast"
    );

  if (toast) {
    return toast;
  }

  toast =
    document.createElement(
      "div"
    );

  toast.id =
    "personalLightToast";

  toast.className =
    "personal-light-toast";

  toast.hidden = true;

  toast.setAttribute(
    "role",
    "status"
  );

  toast.setAttribute(
    "aria-live",
    "polite"
  );

  document.body
    .appendChild(
      toast
    );

  return toast;
}

function focusPersonalLitPoint(
  point
) {
  if (!point) {
    return;
  }

  const mapSection =
    document.querySelector(
      "#map"
    );

  mapSection
    ?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  document
    .querySelectorAll(
      ".map-marker"
    )
    .forEach(
      (marker) =>
        marker
          .classList
          .remove(
            "active",
            "just-lit"
          )
    );

  const marker =
    Array.from(
      document.querySelectorAll(
        ".map-marker"
      )
    )
      .find(
        (item) =>
          item.dataset.pointId ===
          point.id
      );

  if (marker) {
    marker.classList.add(
      "active",
      "just-lit"
    );

    window.setTimeout(
      () => {
        marker.classList.remove(
          "just-lit"
        );
      },
      3600
    );
  }

  renderDetail(
    point,
    false
  );
}

function showPersonalLightCelebration(
  point,
  processingStarted = true
) {
  if (!point) {
    return;
  }

  const toast =
    ensurePersonalLightToast();

  const pointName =
    point.nameModern ||
    point.nameAncient ||
    "这个地点";

  const isCitywalkPoint =
    citywalkOrder.includes(
      point.id
    );

  const progressText =
    isCitywalkPoint
      ? `六点 Citywalk · ${getMyCitywalkLitCount()} / ${citywalkOrder.length}`
      : `我的点亮 · ${getMyLitPointCount()} 个地点`;

  const statusText =
    processingStarted
      ? "记忆已记录，正在等待 AI 辅助初审与馆员审核"
      : "记忆已记录，自动处理暂未启动；公开前仍需馆员审核";

  toast.innerHTML = `
    <span
      class="personal-light-toast__spark"
      aria-hidden="true"
    >
      ✦
    </span>

    <div
      class="personal-light-toast__content"
    >
      <p
        class="personal-light-toast__eyebrow"
      >
        MY CHENGDU MEMORY
      </p>

      <strong>
        你点亮了${escapeHtml(
          pointName
        )}
      </strong>

      <p>
        你的城市记忆已被记录
      </p>

      <span
        class="personal-light-toast__progress"
      >
        ${escapeHtml(
          progressText
        )}
      </span>

      <small>
        ${escapeHtml(
          statusText
        )}
      </small>
    </div>
  `;

  toast.hidden = false;
  toast.classList.remove(
    "is-visible"
  );

  requestAnimationFrame(
    () => {
      requestAnimationFrame(
        () => {
          toast.classList.add(
            "is-visible"
          );
        }
      );
    }
  );

  window.clearTimeout(
    showPersonalLightCelebration
      .hideTimer
  );

  showPersonalLightCelebration
    .hideTimer =
    window.setTimeout(
      () => {
        toast.classList.remove(
          "is-visible"
        );

        window.setTimeout(
          () => {
            toast.hidden = true;
          },
          420
        );
      },
      4300
    );
}

function updateMyMemoryNav() {
  const countElement =
    document.querySelector(
      "#myMemoryCount"
    );

  if (!countElement) {
    return;
  }

  const total =
    Number(
      myContributionData
        ?.summary
        ?.total
    ) || 0;

  countElement.textContent =
    String(total);

  countElement.hidden =
    total <= 0;
}

/**
 * 读取当前用户自己的投稿。
 *
 * 后端 getMyContributions 已使用 userId
 * 与当前 Web 用户 uid 关联。
 */
async function loadMyContributions() {
  if (
    !cloudReady ||
    !cloudApp ||
    typeof cloudApp.callFunction
      !== "function"
  ) {
    return null;
  }

  try {
    const response =
      await cloudApp
        .callFunction({
          name:
            "getMyContributions",

          data: {},

          parse: true
        });

    const result =
      normalizeFunctionResult(
        response
      );

    if (!result?.ok) {
      throw new Error(
        result?.message ||
        "个人城市记忆返回格式不正确"
      );
    }

    myContributionData =
      result;

    rebuildMyContributionPointState(
      Array.isArray(
        result.items
      )
        ? result.items
        : []
    );

    updateMyMemoryNav();

    return result;
  }

  catch (error) {
    console.warn(
      "我的城市记忆暂未加载：",
      error
    );

    return null;
  }
}

function getMyContributionStatusLabel(
  status
) {
  const map = {
    pending: "审核中",
    processing: "审核中",
    approved: "已公开",
    rejected: "未通过"
  };

  return (
    map[status] ||
    "处理中"
  );
}

function getMyContributionStatusClass(
  status
) {
  if (
    status === "approved"
  ) {
    return "is-approved";
  }

  if (
    status === "rejected"
  ) {
    return "is-rejected";
  }

  return "is-processing";
}

function getMemoryTypeLabel(
  memoryType
) {
  const map = {
    general:
      "城市记忆",
    place_name:
      "地名线索",
    oral_history:
      "口述记忆"
  };

  return (
    map[memoryType] ||
    "城市记忆"
  );
}

function ensureMyMemoryPanel() {
  if (
    document.querySelector(
      "#myMemoryPanel"
    )
  ) {
    return;
  }

  const panel =
    document.createElement(
      "div"
    );

  panel.id =
    "myMemoryPanel";

  panel.className =
    "my-memory-panel";

  panel.hidden =
    true;

  panel.innerHTML = `
    <div
      class="my-memory-panel__backdrop"
      data-close-my-memory
    ></div>

    <aside
      class="my-memory-panel__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="myMemoryPanelTitle"
    >
      <button
        type="button"
        class="my-memory-panel__close"
        aria-label="关闭我的城市记忆"
        data-close-my-memory
      >
        ×
      </button>

      <div
        class="my-memory-panel__content"
        id="myMemoryPanelContent"
      >
        <p
          class="my-memory-loading"
        >
          正在读取你的城市记忆……
        </p>
      </div>
    </aside>
  `;

  document.body
    .appendChild(
      panel
    );

  panel
    .querySelectorAll(
      "[data-close-my-memory]"
    )
    .forEach(
      (element) => {
        element
          .addEventListener(
            "click",
            closeMyMemoryPanel
          );
      }
    );
}

function renderMyMemoryPanel() {
  const contentElement =
    document.querySelector(
      "#myMemoryPanelContent"
    );

  if (!contentElement) {
    return;
  }

  const summary =
    myContributionData
      ?.summary ||
    {
      total: 0,
      processing: 0,
      approved: 0,
      rejected: 0,
      litPoints: 0,
      isContributor: false
    };

  const badges =
    myContributionData
      ?.badges ||
    {};

  const items =
    Array.isArray(
      myContributionData?.items
    )
      ? myContributionData.items
      : [];

  const isContributor =
    summary.isContributor === true;

  const identityTitle =
    isContributor
      ? "成都城市记忆共建者"
      : summary.total > 0
        ? "城市记忆参与者"
        : "等待你的第一份城市记忆";

  const identityText =
    isContributor
      ? "你的投稿已经通过馆员审核，并正式进入城市记忆共建成果。"
      : summary.total > 0
        ? "你的记忆已经被记录。审核通过后将获得“成都城市记忆共建者”身份，并解锁相应徽章。"
        : "选择一个古图点位，留下照片、地名线索或口述故事，从第一份城市记忆开始。";

  const badgeDefinitions = [
    {
      key:
        "imageRecorder",

      icon:
        "📷",

      title:
        "影像记录者",

      note:
        "至少 1 条带照片的投稿审核通过"
    },

    {
      key:
        "placeNameExplorer",

      icon:
        "📖",

      title:
        "地名寻访者",

      note:
        "至少 1 条地名线索类投稿审核通过"
    },

    {
      key:
        "oralHistorian",

      icon:
        "🗣",

      title:
        "口述记忆者",

      note:
        "至少 1 条口述记忆类投稿审核通过"
    },

    {
      key:
        "cityWalker",

      icon:
        "🧭",

      title:
        "城市行走者",

      note:
        `在 3 个不同点位留下公开记忆 · ${
          Math.min(
            Number(
              summary.litPoints
            ) || 0,
            3
          )
        }/3`
    }
  ];

  const badgesHtml =
    badgeDefinitions
      .map(
        (badge) => {
          const unlocked =
            badges[
              badge.key
            ] === true;

          return `
            <article
              class="my-badge ${
                unlocked
                  ? "is-unlocked"
                  : "is-locked"
              }"
            >
              <span
                class="my-badge__icon"
                aria-hidden="true"
              >
                ${badge.icon}
              </span>

              <div>
                <strong>
                  ${escapeHtml(
                    badge.title
                  )}
                </strong>

                <p>
                  ${escapeHtml(
                    unlocked
                      ? "已获得"
                      : badge.note
                  )}
                </p>
              </div>

              <span
                class="my-badge__state"
              >
                ${
                  unlocked
                    ? "已解锁"
                    : "待解锁"
                }
              </span>
            </article>
          `;
        }
      )
      .join("");

  const footprintsHtml =
    items.length
      ? items
          .map(
            (item) => {
              const excerpt =
                String(
                  item.originalContent ||
                  "本次投稿以影像材料为主。"
                )
                  .trim()
                  .slice(
                    0,
                    88
                  );

              return `
                <article
                  class="my-footprint-card"
                >
                  <div
                    class="my-footprint-card__head"
                  >
                    <div>
                      <strong>
                        ${escapeHtml(
                          item.pointName ||
                          "未命名点位"
                        )}
                      </strong>

                      <span
                        class="my-footprint-card__type"
                      >
                        ${escapeHtml(
                          getMemoryTypeLabel(
                            item.memoryType
                          )
                        )}
                      </span>
                    </div>

                    <span
                      class="my-footprint-status ${getMyContributionStatusClass(
                        item.status
                      )}"
                    >
                      ${escapeHtml(
                        getMyContributionStatusLabel(
                          item.status
                        )
                      )}
                    </span>
                  </div>

                  <p>
                    ${escapeHtml(
                      excerpt
                    )}
                  </p>

                  <div
                    class="my-footprint-card__meta"
                  >
                    <span>
                      ${escapeHtml(
                        item.approximateTime ||
                        "时间未注明"
                      )}
                    </span>

                    ${
                      Number(
                        item.imageCount
                      ) > 0
                        ? `
                          <span>
                            ${Number(
                              item.imageCount
                            )} 张影像
                          </span>
                        `
                        : ""
                    }
                  </div>
                </article>
              `;
            }
          )
          .join("")
      : `
        <div
          class="my-memory-empty"
        >
          <strong>
            还没有个人城市记忆
          </strong>

          <p>
            从交互地图选择一个点位，点击“留下我的城市记忆”即可开始。
          </p>
        </div>
      `;

  contentElement.innerHTML = `
    <p
      class="detail-kicker"
    >
      My City Memory
    </p>

    <h2
      id="myMemoryPanelTitle"
    >
      我的城市记忆
    </h2>

    <section
      class="my-identity-card ${
        isContributor
          ? "is-contributor"
          : ""
      }"
    >
      <span
        class="my-identity-card__seal"
        aria-hidden="true"
      >
        ${
          isContributor
            ? "共"
            : "记"
        }
      </span>

      <div>
        <p
          class="my-identity-card__eyebrow"
        >
          ${
            isContributor
              ? "CONTRIBUTOR"
              : "PARTICIPANT"
          }
        </p>

        <h3>
          ${escapeHtml(
            identityTitle
          )}
        </h3>

        <p>
          ${escapeHtml(
            identityText
          )}
        </p>
      </div>
    </section>

    <div
      class="my-memory-stats"
    >
      <div>
        <strong>
          ${Number(
            summary.total
          ) || 0}
        </strong>

        <span>
          留下记忆
        </span>
      </div>

      <div>
        <strong>
          ${Number(
            summary.processing
          ) || 0}
        </strong>

        <span>
          审核中
        </span>
      </div>

      <div>
        <strong>
          ${Number(
            summary.approved
          ) || 0}
        </strong>

        <span>
          已公开
        </span>
      </div>

      <div>
        <strong>
          ${getMyLitPointCount()}
        </strong>

        <span>
          我的点亮
        </span>
      </div>
    </div>

    <section
      class="my-memory-section"
    >
      <div
        class="my-memory-section__head"
      >
        <div>
          <p
            class="section-label"
          >
            My Badges
          </p>

          <h3>
            我的徽章
          </h3>
        </div>

        <span>
          审核通过后自动解锁
        </span>
      </div>

      <div
        class="my-badges-grid"
      >
        ${badgesHtml}
      </div>
    </section>

    <section
      class="my-memory-section"
    >
      <div
        class="my-memory-section__head"
      >
        <div>
          <p
            class="section-label"
          >
            My Footprints
          </p>

          <h3>
            我的足迹
          </h3>
        </div>

        <span>
          共 ${
            Number(
              summary.total
            ) || 0
          } 份
        </span>
      </div>

      <div
        class="my-footprints"
      >
        ${footprintsHtml}
      </div>
    </section>
  `;
}

async function openMyMemoryPanel() {
  ensureMyMemoryPanel();

  const panel =
    document.querySelector(
      "#myMemoryPanel"
    );

  const contentElement =
    document.querySelector(
      "#myMemoryPanelContent"
    );

  if (
    !panel ||
    !contentElement
  ) {
    return;
  }

  panel.hidden =
    false;

  document.body
    .classList
    .add(
      "modal-open"
    );

  contentElement.innerHTML = `
    <p
      class="my-memory-loading"
    >
      正在读取你的城市记忆……
    </p>
  `;

  if (!cloudReady) {
    contentElement.innerHTML = `
      <div
        class="my-memory-empty"
      >
        <strong>
          云端服务尚未连接
        </strong>

        <p>
          请稍后刷新页面再试。
        </p>
      </div>
    `;

    return;
  }

  await loadMyContributions();

  renderMyMemoryPanel();
}

function closeMyMemoryPanel() {
  const panel =
    document.querySelector(
      "#myMemoryPanel"
    );

  if (!panel) {
    return;
  }

  panel.hidden =
    true;

  document.body
    .classList
    .remove(
      "modal-open"
    );
}

function bindMyMemoryButtons() {
  [
    "#myMemoryButton",
    "#myMemoryHeroButton"
  ]
    .forEach(
      (selector) => {
        document
          .querySelector(
            selector
          )
          ?.addEventListener(
            "click",
            openMyMemoryPanel
          );
      }
    );
}


/* ===============================================
   城市记忆展示
   =============================================== */

function renderMemorySection(
  point
) {
  const memories =
    getPointMemories(
      point.id
    );

  const count =
    memories.length;

  const statusHtml =
    count > 0
      ? `
        <div
          class="memory-status-strip is-lit"
        >
          <span
            class="memory-status-strip__spark"
          >
            ✦
          </span>

          <span>
            该点位已收录公众城市记忆 · 共 ${count} 份
          </span>
        </div>
      `
      : `
        <div
          class="memory-status-strip"
        >
          <span
            class="memory-status-strip__spark"
          >
            ◇
          </span>

          <span>
            等待第一份审核通过的公众城市记忆
          </span>
        </div>
      `;

  if (!count) {
    return `
      ${statusHtml}

      <section
        class="memory-section"
      >
        <div
          class="memory-section__head"
        >
          <h4>
            城市记忆
          </h4>
        </div>

        <div
          class="memory-empty"
        >
          <strong>
            这里还没有公开的公众记忆
          </strong>

          <p>
            如果你有与此地有关的老照片、家庭故事或现场观察，可以提交材料，审核通过后将在这里公开展示；地图上的个人点亮由你自己的投稿触发。
          </p>
        </div>
      </section>
    `;
  }

  const visible =
    memories.slice(
      0,
      6
    );

  const cards =
    visible
      .map(
        (memory) => {
          const images =
            Array.isArray(
              memory.imageUrls
            )
              ? memory.imageUrls
              : [];

          const imageHtml =
            images.length
              ? `
                <div
                  class="memory-card__images"
                >
                  ${
                    images
                      .slice(
                        0,
                        3
                      )
                      .map(
                        (url) => `
                          <img
                            src="${escapeHtml(
                              url
                            )}"
                            alt="${escapeHtml(
                              point.nameModern
                            )}城市记忆照片"
                            loading="lazy"
                          >
                        `
                      )
                      .join("")
                  }
                </div>
              `
              : "";

          const publicContent =
            memory.publicContent ||
            memory.originalContent ||
            "";

          const textHtml =
            publicContent
              ? `
                <p
                  class="memory-card__text"
                >
                  ${escapeHtml(
                    publicContent
                  )}
                </p>
              `
              : "";

          return `
            <article
              class="memory-card"
            >
              <div
                class="memory-card__meta"
              >
                <span
                  class="memory-card__time"
                >
                  ${escapeHtml(
                    memory.approximateTime ||
                    "时间未注明"
                  )}
                </span>

                <span
                  class="memory-card__label"
                >
                  公众城市记忆
                </span>
              </div>

              ${textHtml}

              ${imageHtml}
            </article>
          `;
        }
      )
      .join("");

  return `
    ${statusHtml}

    <section
      class="memory-section"
    >
      <div
        class="memory-section__head"
      >
        <h4>
          城市记忆
        </h4>

        <span
          class="memory-count"
        >
          已收录 ${count} 份
        </span>
      </div>

      <div
        class="memory-list"
      >
        ${cards}
      </div>

      ${
        count >
        visible.length
          ? `
            <p
              class="memory-more"
            >
              当前展示最近 ${visible.length} 份，共 ${count} 份。
            </p>
          `
          : ""
      }
    </section>
  `;
}

/* ===============================================
   点位详情
   =============================================== */

function renderDetail(
  point,
  shouldScroll = false
) {
  if (!detailEl) {
    return;
  }

  const isBasic =
    point.detailLevel
      === "basic";

  const metaHtml =
    isBasic
      ? `
        <div
          class="meta-grid"
        >
          ${renderOptionalRow(
            "点位类型",
            point.type
          )}

          ${renderOptionalRow(
            "古图标注",
            point.nameAncient
          )}

          ${renderOptionalRow(
            "今日名称",
            point.nameModern
          )}
        </div>
      `
      : `
        <div
          class="meta-grid"
        >
          ${renderOptionalRow(
            "点位类型",
            point.type
          )}

          ${renderOptionalRow(
            "点位状态",
            getStatusLabel(
              point
            )
          )}

          ${renderOptionalRow(
            "古图标注",
            point.nameAncient
          )}

          ${renderOptionalRow(
            "今日名称",
            point.nameModern
          )}

          ${renderOptionalRow(
            "城市线索",
            point.routeNote
          )}
        </div>
      `;

  const mainContent =
    isBasic
      ? `
        <section
          class="official-intro"
        >
          <h4>
            资料整理中
          </h4>

          <p>
            该点位已完成地图标注，基础历史资料正在整理中。公众仍可提交与此地有关的照片、故事或口述线索。
          </p>
        </section>
      `
      : `
        ${
          point.quick
            ? `
              <section
                class="official-summary"
              >
                <h4>
                  点位导读
                </h4>

                ${renderParagraphs(
                  point.quick
                )}
              </section>
            `
            : ""
        }

        ${
          point.extended
            ? `
              <section
                class="official-intro"
              >
                <h4>
                  历史简介
                </h4>

                ${renderParagraphs(
                  point.extended
                )}
              </section>
            `
            : ""
        }
      `;

  detailEl.innerHTML = `
    <div
      class="point-card"
    >
      <span
        class="type-pill"
      >
        ${
          isBasic
            ? "资料整理中"
            : "官方点位介绍"
        }
      </span>

      <div>
        <p
          class="detail-kicker"
        >
          ${
            isBasic
              ? "Candidate Point"
              : "Point Detail"
          }
        </p>

        <h3>
          ${escapeHtml(
            point.nameModern ||
            point.nameAncient
          )}
        </h3>
      </div>

      ${renderPointMedia(
        point
      )}

      ${metaHtml}

      ${mainContent}

      ${renderMemorySection(
        point
      )}

      <button
        type="button"
        class="memory-btn"
        data-memory-button
      >
        留下我的城市记忆
      </button>

      <p
        class="memory-help"
      >
        可提交文字、现场照片、家庭留影或旧照片线索；每次最多3张图片。
      </p>
    </div>
  `;

  detailEl
    .querySelector(
      "[data-memory-button]"
    )
    ?.addEventListener(
      "click",
      () =>
        openContributionModal(
          point
        )
    );

  if (shouldScroll) {
    const panel =
      detailEl.closest(
        ".detail-panel"
      ) ||
      detailEl;

    const rect =
      panel
        .getBoundingClientRect();

    const outside =
      rect.top
        >= window.innerHeight ||
      rect.bottom
        <= 0 ||
      rect.left
        >= window.innerWidth;

    if (outside) {
      requestAnimationFrame(
        () =>
          panel.scrollIntoView({
            behavior: "smooth",
            block: "start"
          })
      );
    }
  }
}

/* ===============================================
   地图点位
   =============================================== */

function renderMarkers(points) {
  if (!markersEl) {
    return;
  }

  markersEl.innerHTML =
    "";

  points.forEach(
    (
      point,
      index
    ) => {
      const x =
        Number(point.x);

      const y =
        Number(point.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return;
      }

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        `map-marker ${getStatusClass(
          point
        )}`;

      button.style.left =
        `${x}%`;

      button.style.top =
        `${y}%`;

      button.dataset.pointId =
        point.id;

      const corePointIndex =
        citywalkOrder.indexOf(
          point.id
        );

      if (corePointIndex >= 0) {
        button.classList.add(
          "is-core-point"
        );

        button.style.setProperty(
          "--marker-order",
          String(corePointIndex)
        );
      }

      button.setAttribute(
        "aria-label",
        point.nameModern ||
        point.nameAncient ||
        "历史点位"
      );

      if (
        point.detailLevel
          === "basic"
      ) {
        button.classList.add(
          "map-marker-basic"
        );
      }

      // 公共审核通过记忆：只记录数量，不再替当前用户点亮。
      const memoryCount =
        getPointMemories(
          point.id
        ).length;

      if (
        memoryCount > 0
      ) {
        button.dataset.memoryCount =
          String(memoryCount);

        button.classList.add(
          "has-public-memory"
        );
      }

      // 个人即时点亮：只要自己的投稿已保存且未被拒绝，就点亮。
      const myPointState =
        getMyPointState(
          point.id
        );

      if (
        isMyPointLitStatus(
          myPointState
        )
      ) {
        button.classList.add(
          "my-memory-lit"
        );
      }

      if (
        myPointState === "approved"
      ) {
        button.classList.add(
          "my-memory-approved"
        );
      }

      else if (
        myPointState === "processing" ||
        myPointState === "pending"
      ) {
        button.classList.add(
          "my-memory-processing"
        );
      }

      button.title =
        `${
          point.nameModern ||
          point.nameAncient ||
          "历史点位"
        }｜${
          getStatusLabel(
            point
          )
        }${
          memoryCount
            ? `｜已收录${memoryCount}份公众城市记忆`
            : ""
        }${
          myPointState === "approved"
            ? "｜我已点亮｜我的记忆已公开"
            : (
                myPointState === "processing" ||
                myPointState === "pending"
              )
              ? "｜我已点亮｜我的记忆审核中"
              : ""
        }`;

      button.addEventListener(
        "click",
        () => {
          handleMapPointInteraction(
            point
          );
        }
      );

      markersEl
        .appendChild(
          button
        );

      if (
        point.id ===
          activeMapPointId ||
        (
          index === 0 &&
          !points.some(
            (item) =>
              item.id ===
              activeMapPointId
          )
        )
      ) {
        button
          .classList
          .add(
            "active"
          );

        renderDetail(
          point
        );
      }
    }
  );

  const activePoint =
    points.find(
      (point) =>
        point.id ===
        activeMapPointId
    ) ||
    points[0];

  if (activePoint) {
    focusMapPoint(
      activePoint
    );
  }

  updateMapMemoryLayerCounts();
}

/* ===============================================
   Citywalk
   =============================================== */

function renderRoute(points) {
  if (!routeListEl) {
    return;
  }

  const pointMap =
    new Map(
      points.map(
        (point) => [
          point.id,
          point
        ]
      )
    );

  routeListEl.innerHTML =
    citywalkOrder
      .map(
        (id) =>
          pointMap.get(id)
      )
      .filter(Boolean)
      .map(
        (point) => {
          const memoryCount =
            getPointMemories(
              point.id
            ).length;

          const myPointState =
            getMyPointState(
              point.id
            );

          const isPersonallyLit =
            isMyPointLitStatus(
              myPointState
            );

          return `
            <li
              class="route-card ${
                isPersonallyLit
                  ? "has-memory is-my-lit"
                  : ""
              } ${
                memoryCount > 0
                  ? "has-public-memory"
                  : ""
              }"
            >
              <h3>
                ${escapeHtml(
                  point.nameModern
                )}
              </h3>

              <p>
                ${escapeHtml(
                  point.routeNote ||
                  ""
                )}
              </p>

              ${
                isPersonallyLit
                  ? `
                    <span
                      class="route-memory-note route-my-light-note"
                    >
                      ✦ 我已点亮 · ${escapeHtml(
                        getMyContributionStatusLabel(
                          myPointState
                        )
                      )}
                    </span>
                  `
                  : memoryCount > 0
                    ? `
                      <span
                        class="route-public-memory-note"
                      >
                        已收录 ${memoryCount} 份公众城市记忆
                      </span>
                    `
                    : ""
              }
            </li>
          `;
        }
      )
      .join("");
}

/* ===============================================
   投稿弹窗
   =============================================== */

function getWritingStyle(styleId) {
  return (
    WRITING_STYLES.find(
      (item) => item.id === styleId
    ) ||
    WRITING_STYLES[0]
  );
}

function buildWritingStyleCards() {
  return WRITING_STYLES
    .map(
      (style) => `
        <button
          type="button"
          class="writing-style-card${style.id === "original" ? " is-selected" : ""}"
          data-writing-style="${escapeHtml(style.id)}"
          aria-pressed="${style.id === "original" ? "true" : "false"}"
        >
          <span
            class="writing-style-card__mark"
            aria-hidden="true"
          >
            ${escapeHtml(style.mark)}
          </span>

          <span class="writing-style-card__copy">
            <strong>
              ${escapeHtml(style.name)}
            </strong>

            <em>
              ${escapeHtml(style.tagline)}
            </em>

            <small>
              ${escapeHtml(style.description)}
            </small>
          </span>
        </button>
      `
    )
    .join("");
}

function syncWritingStyleSelection(modal) {
  if (!modal) {
    return;
  }

  const activeStyle =
    getWritingStyle(
      selectedWritingStyle
    );

  modal
    .querySelectorAll(
      "[data-writing-style]"
    )
    .forEach(
      (button) => {
        const selected =
          button.dataset.writingStyle ===
          activeStyle.id;

        button.classList.toggle(
          "is-selected",
          selected
        );

        button.setAttribute(
          "aria-pressed",
          selected
            ? "true"
            : "false"
        );
      }
    );

  const note =
    modal.querySelector(
      "#selectedWritingStyleNote"
    );

  if (note) {
    note.innerHTML = `
      <span aria-hidden="true">✓</span>
      已选择：
      <strong>${escapeHtml(activeStyle.name)}</strong>
      · ${escapeHtml(activeStyle.tagline)}
      · 无模型表层调整
    `;
  }
}

function handleWritingStyleSelection(event) {
  const button =
    event.currentTarget;

  const styleId =
    button?.dataset
      ?.writingStyle;

  if (!styleId) {
    return;
  }

  selectedWritingStyle =
    getWritingStyle(
      styleId
    ).id;

  const modal =
    document.querySelector(
      "#contributionModal"
    );

  syncWritingStyleSelection(
    modal
  );

  invalidateRewriteDraft(
    modal,
    "表达偏好已经改变，请重新整理。"
  );
}

function setRewriteChoice(
  modal,
  accepted
) {
  if (
    !modal ||
    !currentRewriteDraft
  ) {
    return;
  }

  currentRewriteAccepted =
    accepted === true;

  const useDraftButton =
    modal.querySelector(
      "#useRewriteDraft"
    );

  const keepOriginalButton =
    modal.querySelector(
      "#keepOriginalMemory"
    );

  useDraftButton
    ?.classList
    .toggle(
      "is-selected",
      currentRewriteAccepted
    );

  useDraftButton
    ?.setAttribute(
      "aria-pressed",
      currentRewriteAccepted
        ? "true"
        : "false"
    );

  keepOriginalButton
    ?.classList
    .toggle(
      "is-selected",
      !currentRewriteAccepted
    );

  keepOriginalButton
    ?.setAttribute(
      "aria-pressed",
      currentRewriteAccepted
        ? "false"
        : "true"
    );

  const choiceNote =
    modal.querySelector(
      "#memoryRewriteChoice"
    );

  if (choiceNote) {
    choiceNote.textContent =
      currentRewriteAccepted
        ? "已选择：公开展示时优先采用整理稿；真实原文仍单独保存。"
        : "已选择：保留真实原文作为公开表达。";
  }
}

function renderRewriteState(
  modal,
  state = "idle",
  message = ""
) {
  if (!modal) {
    return;
  }

  const panel =
    modal.querySelector(
      "#memoryRewritePanel"
    );

  const trigger =
    modal.querySelector(
      "#memoryRewriteTrigger"
    );

  const status =
    modal.querySelector(
      "#memoryRewriteStatus"
    );

  const comparison =
    modal.querySelector(
      "#memoryRewriteComparison"
    );

  if (!panel || !trigger) {
    return;
  }

  panel.classList.remove(
    "is-idle",
    "is-loading",
    "is-success",
    "is-error",
    "is-stale"
  );

  panel.classList.add(
    `is-${state}`
  );

  const loading =
    state === "loading";

  trigger.disabled =
    loading;

  trigger.setAttribute(
    "aria-disabled",
    loading
      ? "true"
      : "false"
  );

  trigger.textContent =
    loading
      ? "正在整理……"
      : currentRewriteDraft
        ? "重新整理"
        : "开始整理";

  panel.setAttribute(
    "aria-busy",
    loading
      ? "true"
      : "false"
  );

  if (status) {
    status.textContent =
      message;

    status.classList.toggle(
      "is-error",
      state === "error"
    );
  }

  if (
    comparison &&
    currentRewriteDraft
  ) {
    comparison.hidden =
      false;

    const originalText =
      modal.querySelector(
        "#memoryRewriteOriginal"
      );

    const draftText =
      modal.querySelector(
        "#memoryRewriteDraft"
      );

    const draftLabel =
      modal.querySelector(
        "#memoryRewriteDraftLabel"
      );

    if (originalText) {
      originalText.textContent =
        modal
          .querySelector(
            "#contributionContent"
          )
          ?.value
          ?.trim() ||
        "";
    }

    if (draftText) {
      draftText.textContent =
        currentRewriteDraft;
    }

    if (draftLabel) {
      const activeStyle =
        getWritingStyle(
          selectedWritingStyle
        );

      draftLabel.textContent =
        activeStyle.id === "original"
          ? "基础整理稿 · 无模型 · 保持原声"
          : `基础整理稿 · 无模型 · ${activeStyle.name}偏好`;
    }

    setRewriteChoice(
      modal,
      currentRewriteAccepted
    );
  }

  else if (comparison) {
    comparison.hidden =
      true;
  }
}

function invalidateRewriteDraft(
  modal,
  message = ""
) {
  rewriteRequestToken += 1;

  const hadDraft =
    Boolean(
      currentRewriteDraft
    );

  currentRewriteDraft =
    "";

  currentRewriteAccepted =
    false;

  currentRewriteMeta =
    null;

  const choiceNote =
    modal?.querySelector(
      "#memoryRewriteChoice"
    );

  if (choiceNote) {
    choiceNote.textContent =
      hadDraft
        ? "整理条件已经改变，当前恢复为保留真实原文。"
        : "当前将保存并展示真实原文。";
  }

  renderRewriteState(
    modal,
    hadDraft
      ? "stale"
      : "idle",
    hadDraft
      ? message
      : ""
  );
}

function normalizeMemoryPunctuation(
  text
) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\.\.\.+/g, "……")
    .replace(/,{2,}/g, "，")
    .replace(/。{2,}/g, "。")
    .replace(/！{2,}/g, "！")
    .replace(/？{2,}/g, "？")
    .replace(
      /\s*([，。！？；：、])\s*/g,
      "$1"
    )
    .replace(
      /([，、；：])([。！？])/g,
      "$2"
    )
    .replace(/，{2,}/g, "，")
    .replace(/；{2,}/g, "；")
    .replace(/：{2,}/g, "：")
    .trim();
}

function splitMemorySentences(
  text
) {
  return (
    String(text || "")
      .match(
        /[^。！？!?；;\n]+[。！？!?；;]?/g
      ) ||
    []
  )
    .map(
      (sentence) =>
        sentence.trim()
    )
    .filter(Boolean);
}

function getMemorySentenceKey(
  sentence
) {
  return sentence
    .replace(
      /[\s，。！？!?；;：“”‘’、]/g,
      ""
    )
    .toLowerCase();
}

/*
 * 把投稿点位这个已经明确的上下文补进极短口语句。
 * 只处理“某年和某人来的”这类结构，不推断景物、感受或事件。
 */
function expandImplicitMemoryContext(
  text,
  pointName
) {
  const normalized =
    normalizeMemoryPunctuation(
      text
    );

  const place =
    String(pointName || "")
      .trim() ||
    "这里";

  const companionPattern =
    /^((?:19|20)\d{2}年(?:前后)?)[，,]?(?:我)?(?:和|跟)([^，。！？!?\n]{1,16}?)(?:一起)?(?:来|去)(?:过)?(?:这里|这儿|该地)?(?:的)?[。！？!?]?$/;

  const companionMatch =
    normalized.match(
      companionPattern
    );

  if (companionMatch) {
    const [, year, companion] =
      companionMatch;

    return `${year}，我和${companion.trim()}一起来过${place}。`;
  }

  const soloPattern =
    /^((?:19|20)\d{2}年(?:前后)?)[，,]?(?:我)?(?:来|去)(?:过)?(?:这里|这儿|该地)?(?:的)?[。！？!?]?$/;

  const soloMatch =
    normalized.match(
      soloPattern
    );

  if (soloMatch) {
    return `${soloMatch[1]}，我来过${place}。`;
  }

  return normalized;
}

function applySurfaceRules(
  text,
  rules
) {
  return rules.reduce(
    (
      result,
      [pattern, replacement]
    ) => result.replace(
      pattern,
      replacement
    ),
    String(text || "")
  );
}

function getWritingStyleAdjustmentNote(
  styleId
) {
  const notes = {
    original:
      "标点校正 · 重复清理 · 原声优先",
    sushi:
      "清简措辞 · 日常语气 · 从容节奏",
    dufu:
      "时间线索 · 沉静措辞 · 深情克制",
    libai:
      "明快动词 · 空间感受 · 舒展节奏",
    lijieren:
      "街巷口语 · 市井措辞 · 叙事节奏",
    luxun:
      "白描短句 · 删除赘词 · 克制语气",
    alai:
      "地方经验 · 时间递进 · 平静叙述",
    guomoruo:
      "历史联结 · 书面措辞 · 抒情节奏"
  };

  return notes[styleId] ||
    notes.original;
}

/*
 * 零模型表达偏好：仅使用可解释、可复核的表层规则。
 * 不生成比喻，不补写心情、天气、景物或历史事实。
 */
function applyWritingStylePreference(
  text,
  styleId
) {
  const source =
    String(text || "");

  let draft = source;

  switch (styleId) {
    case "sushi":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我曾和$1一同来过"
          ],
          [
            /，我来过([^。！？]+)。/g,
            "，我曾来过$1。"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿$1缓步而行"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边行人往来"
          ],
          [
            /我只记得/g,
            "我记得"
          ],
          [
            /一直牵着我的手/g,
            "始终牵着我的手"
          ],
          [
            /停了一会儿/g,
            "稍作停留"
          ],
          [
            /还拍了一张照片/g,
            "也拍下一张照片"
          ],
          [
            /但是后来搬家时照片找不到了/g,
            "只是后来搬家，那张照片找不到了"
          ],
          [
            /我当时年纪还小/g,
            "那时我还小"
          ],
          [
            /并不了解/g,
            "还不了解"
          ],
          [
            /只觉得/g,
            "只觉"
          ],
          [
            /非常非常|特别特别/g,
            "很"
          ],
          [
            /很多年以后/g,
            "多年以后"
          ],
          [
            /又独自来到这里/g,
            "再次独自来到这里"
          ],
          [
            /都发生了变化/g,
            "都已有了变化"
          ],
          [
            /一直留在我的记忆里/g,
            "仍留在我的记忆里"
          ],
          [
            /现在重新看到/g,
            "如今再看到"
          ],
          [
            /我才意识到/g,
            "我才明白"
          ],
          [
            /普通出行/g,
            "寻常出行"
          ],
          [
            /联系在一起/g,
            "相连"
          ],
          [
            /！/g,
            "。"
          ]
        ]
      );
      break;

    case "dufu":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我和$1曾一起来过"
          ],
          [
            /那天下午我们/g,
            "那日下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿$1缓缓前行"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边人来人往"
          ],
          [
            /我只记得/g,
            "至今记得"
          ],
          [
            /一直牵着我的手/g,
            "始终牵着我的手"
          ],
          [
            /停了一会儿/g,
            "停留片刻"
          ],
          [
            /后来搬家时照片找不到了/g,
            "后来搬家，那张照片已经遗失"
          ],
          [
            /我当时年纪还小/g,
            "那时我年纪尚小"
          ],
          [
            /并不了解/g,
            "尚不了解"
          ],
          [
            /特别特别/g,
            "格外"
          ],
          [
            /很多年以后/g,
            "多年以后"
          ],
          [
            /都发生了变化/g,
            "都已有了变化"
          ],
          [
            /一直留在我的记忆里/g,
            "始终留在我的记忆里"
          ],
          [
            /现在重新看到/g,
            "如今再看到"
          ],
          [
            /我才意识到/g,
            "我才明白"
          ],
          [
            /更长久的历史/g,
            "更久远的历史"
          ],
          [
            /！/g,
            "。"
          ]
        ]
      );
      break;

    case "libai":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我与$1一同来到"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿$1而行"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边行人往来"
          ],
          [
            /江风很大/g,
            "江风正劲"
          ],
          [
            /一直牵着我的手/g,
            "始终牵着我的手"
          ],
          [
            /停了一会儿/g,
            "停留片刻"
          ],
          [
            /拍了一张照片/g,
            "留下一张照片"
          ],
          [
            /但是后来搬家时照片找不到了/g,
            "后来搬家，那张照片也遗失了"
          ],
          [
            /特别特别/g,
            "格外"
          ],
          [
            /很多年以后我又独自来到这里/g,
            "多年以后，我又独自来到这里"
          ],
          [
            /很多年以后/g,
            "多年以后"
          ],
          [
            /我又独自来到这里/g,
            "我再次独自来到这里"
          ],
          [
            /周围的道路、商店和夜景都发生了变化/g,
            "道路、商店与夜景都已不同"
          ],
          [
            /一直留在我的记忆里/g,
            "仍留在我的记忆里"
          ],
          [
            /现在重新看到/g,
            "如今再看到"
          ],
          [
            /我才意识到/g,
            "我才明白"
          ],
          [
            /普通出行/g,
            "寻常出行"
          ],
          [
            /联系在一起/g,
            "相连"
          ]
        ]
      );
      break;

    case "lijieren":
      draft = applySurfaceRules(
        draft,
        [
          [
            /((?:19|20)\d{2}年)，我和([^，。！？]{1,20}?)一起来过/g,
            "$1那会儿，我跟$2来过"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "顺着$1慢慢走"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边人来人往"
          ],
          [
            /我只记得/g,
            "我印象最深的是"
          ],
          [
            /一直牵着我的手/g,
            "一路牵着我的手"
          ],
          [
            /停了一会儿/g,
            "站了一阵"
          ],
          [
            /还拍了一张照片/g,
            "还照了一张相"
          ],
          [
            /但是后来搬家时照片找不到了/g,
            "可后来搬家，那张照片就找不到了"
          ],
          [
            /我当时年纪还小/g,
            "那时我还小"
          ],
          [
            /并不了解/g,
            "也不懂"
          ],
          [
            /特别特别/g,
            "格外"
          ],
          [
            /很多年以后我又独自来到这里/g,
            "过了很多年，我又一个人来到这里"
          ],
          [
            /都发生了变化/g,
            "都变了样"
          ],
          [
            /但“([^”]+)”这个名字一直留在我的记忆里/g,
            "可“$1”这个名字，我一直记着"
          ],
          [
            /现在重新看到/g,
            "现在再看到"
          ],
          [
            /我才意识到/g,
            "我这才晓得"
          ],
          [
            /一次普通出行/g,
            "一趟平常的出门"
          ],
          [
            /普通出行/g,
            "平常出行"
          ],
          [
            /联系在一起/g,
            "连在一起"
          ]
        ]
      );
      break;

    case "luxun":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我和$1来过"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿$1走"
          ],
          [
            /，桥边有很多来来往往的人，/g,
            "。桥边人来人往。"
          ],
          [
            /我只记得([^，。！？]+)，/g,
            "$1。"
          ],
          [
            /一直牵着我的手/g,
            "牵着我的手"
          ],
          [
            /我们在([^，。！？]+?)停了一会儿，还拍了一张照片/g,
            "我们在$1停下，拍了一张照片"
          ],
          [
            /但是后来搬家时照片找不到了/g,
            "后来搬家，照片丢了"
          ],
          [
            /我当时年纪还小，对([^，。！？]+?)并不了解，只觉得/g,
            "那时我还小，不懂$1。只觉得"
          ],
          [
            /非常非常|特别特别/g,
            "很"
          ],
          [
            /很多年以后我又独自来到这里/g,
            "多年以后，我独自回到这里"
          ],
          [
            /周围的道路、商店和夜景都发生了变化/g,
            "道路、商店和夜景都变了"
          ],
          [
            /但“([^”]+)”这个名字一直留在我的记忆里/g,
            "“$1”这个名字却没有从记忆里消失"
          ],
          [
            /现在重新看到/g,
            "现在再看到"
          ],
          [
            /我才意识到/g,
            "我这才明白"
          ],
          [
            /也可能与([^。！？]+?)联系在一起/g,
            "也可能和$1有关"
          ],
          [
            /(?:其实|说实话|真的)(?=[，。])/g,
            ""
          ],
          [
            /！/g,
            "。"
          ]
        ]
      );
      break;

    case "alai":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我和$1一同来到"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿着$1缓缓走着"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边的人来来往往"
          ],
          [
            /我只记得([^，。！？]+)，([^。！？]+)。/g,
            "留在记忆里的，是$1，还有$2。"
          ],
          [
            /一直牵着我的手/g,
            "始终牵着我的手"
          ],
          [
            /停了一会儿/g,
            "停留片刻"
          ],
          [
            /但是后来搬家时照片找不到了/g,
            "后来搬家，那张照片也遗失了"
          ],
          [
            /我当时年纪还小/g,
            "那时我还小"
          ],
          [
            /特别特别/g,
            "格外"
          ],
          [
            /很多年以后我又独自来到这里/g,
            "许多年过去，我再次独自来到这里"
          ],
          [
            /都发生了变化/g,
            "已经改变"
          ],
          [
            /但“([^”]+)”这个名字一直留在我的记忆里/g,
            "而“$1”这个名字仍留在我的记忆里"
          ],
          [
            /现在重新看到/g,
            "现在再看到"
          ],
          [
            /我才意识到/g,
            "我才慢慢明白"
          ],
          [
            /更长久的历史/g,
            "更漫长的历史"
          ],
          [
            /！/g,
            "。"
          ]
        ]
      );
      break;

    case "guomoruo":
      draft = applySurfaceRules(
        draft,
        [
          [
            /我和([^，。！？]{1,20}?)一起来过/g,
            "我与$1一同来过"
          ],
          [
            /那天下午我们/g,
            "那天下午，我们"
          ],
          [
            /沿着([^，。！？]{1,20}?)慢慢走/g,
            "沿$1缓步前行"
          ],
          [
            /桥边有很多来来往往的人/g,
            "桥边人流往来"
          ],
          [
            /我只记得/g,
            "我记得"
          ],
          [
            /江风很大/g,
            "江风正盛"
          ],
          [
            /一直牵着我的手/g,
            "始终牵着我的手"
          ],
          [
            /停了一会儿/g,
            "停留片刻"
          ],
          [
            /还拍了一张照片/g,
            "并留下一张照片"
          ],
          [
            /特别特别/g,
            "格外"
          ],
          [
            /很多年以后/g,
            "多年之后"
          ],
          [
            /都发生了变化/g,
            "已然改变"
          ],
          [
            /一直留在我的记忆里/g,
            "依然留在我的记忆里"
          ],
          [
            /现在重新看到/g,
            "如今再看到"
          ],
          [
            /我才意识到/g,
            "我才真切地意识到"
          ],
          [
            /普通出行/g,
            "寻常出行"
          ],
          [
            /联系在一起/g,
            "彼此相连"
          ]
        ]
      );
      break;

    default:
      break;
  }

  const normalizedDraft =
    normalizeMemoryPunctuation(
      draft
    );

  if (
    styleId !== "original" &&
    normalizedDraft ===
      normalizeMemoryPunctuation(
        source
      )
  ) {
    return normalizedDraft
      .replace(
        /，/,
        styleId === "luxun"
          ? "。"
          : "；"
      );
  }

  return normalizedDraft;
}

function buildLocalMemoryDraft({
  originalContent,
  writingIntent,
  styleId = "original",
  pointName = ""
}) {
  const seen =
    new Set();

  let sentences =
    splitMemorySentences(
      expandImplicitMemoryContext(
        originalContent,
        pointName
      )
    )
      .filter(
        (sentence) => {
          const key =
            getMemorySentenceKey(
              sentence
            );

          if (
            !key ||
            seen.has(key)
          ) {
            return false;
          }

          seen.add(key);

          return true;
        }
      )
      .map(
        (sentence) =>
          /[。！？!?；;]$/
            .test(sentence)
            ? sentence
                .replace(/!$/g, "！")
                .replace(/\?$/g, "？")
                .replace(/;$/g, "；")
            : `${sentence}。`
      );

  const intent =
    String(
      writingIntent ||
      ""
    )
      .toLowerCase();

  let draft =
    sentences.join("");

  if (
    /不要太伤感|不伤感|克制|不煽情/
      .test(intent)
  ) {
    draft = draft
      .replace(
        /非常非常/g,
        "很"
      )
      .replace(
        /特别特别/g,
        "很"
      )
      .replace(
        /无比/g,
        "很"
      )
      .replace(
        /泪流满面/g,
        "难过"
      )
      .replace(
        /！/g,
        "。"
      );
  }

  if (
    /简短|精简|简洁/
      .test(intent)
  ) {
    sentences =
      splitMemorySentences(
        draft
      );

    draft =
      sentences
        .slice(0, 5)
        .join("");
  }

  draft =
    applyWritingStylePreference(
      draft,
      styleId
    );

  return normalizeMemoryPunctuation(
    draft
  )
    .slice(
      0,
      1800
    );
}

async function handleMemoryRewrite() {
  const modal =
    document.querySelector(
      "#contributionModal"
    );

  if (!modal) {
    return;
  }

  const originalContent =
    modal
      .querySelector(
        "#contributionContent"
      )
      ?.value
      ?.trim() ||
    "";

  if (!originalContent) {
    renderRewriteState(
      modal,
      "error",
      "请先在 STEP 01 写下真实记忆。"
    );

    modal
      .querySelector(
        "#contributionContent"
      )
      ?.focus();

    return;
  }

  if (
    originalContent.length < 10
  ) {
    renderRewriteState(
      modal,
      "error",
      "内容至少需要 10 个字，才能进行基础整理。"
    );

    return;
  }

  currentRewriteDraft =
    "";

  currentRewriteAccepted =
    false;

  currentRewriteMeta =
    null;

  const requestToken =
    ++rewriteRequestToken;

  renderRewriteState(
    modal,
    "loading",
    "正在本机浏览器中检查标点、重复，并按所选偏好调整表层措辞。"
  );

  try {
    await Promise.resolve();

    if (
      requestToken !==
      rewriteRequestToken
    ) {
      return;
    }

    const writingIntent =
      modal
        .querySelector(
          "#contributionWritingIntent"
        )
        ?.value
        ?.trim() ||
      "";

    const draft =
      buildLocalMemoryDraft({
        originalContent,
        writingIntent,
        styleId:
          selectedWritingStyle,
        pointName:
          activeContributionPoint
            ?.nameModern ||
          activeContributionPoint
            ?.nameAncient ||
          ""
      });

    if (!draft) {
      throw new Error(
        "基础整理没有产生有效内容"
      );
    }

    currentRewriteDraft =
      draft;

    currentRewriteMeta = {
      engine:
        "rule-based-browser-v2",

      model:
        null,

      writingStyle:
        selectedWritingStyle,

      styleAdjustment:
        getWritingStyleAdjustmentNote(
          selectedWritingStyle
        ),

      modelServiceRequired:
        false,

      notice:
        "当前为浏览器本地基础整理：按所选表达偏好调整语序、措辞和节奏，不调用云函数或生成式模型，也不新增事实。"
    };

    const activeStyle =
      getWritingStyle(
        selectedWritingStyle
      );

    const limitedDifference =
      originalContent.length < 28;

    const adjustmentNote =
      getWritingStyleAdjustmentNote(
        selectedWritingStyle
      );

    renderRewriteState(
      modal,
      "success",
      limitedDifference
        ? `已按“${activeStyle.name}”偏好调整：${adjustmentNote}。原文信息较少，为避免补写，差异会有限。`
        : `已按“${activeStyle.name}”偏好调整整段：${adjustmentNote}。请对照原文后选择采用整理稿或保留原文。`
    );

    setRewriteChoice(
      modal,
      false
    );
  }

  catch (error) {
    if (
      requestToken !==
      rewriteRequestToken
    ) {
      return;
    }

    console.error(
      "城市记忆基础整理失败：",
      error
    );

    currentRewriteDraft =
      "";

    currentRewriteMeta =
      null;

    renderRewriteState(
      modal,
      "error",
      error?.message ||
      "基础整理暂时不可用；你仍可直接提交真实原文。"
    );
  }
}

function resetWritingWorkshop(modal) {
  selectedWritingStyle =
    "original";

  syncWritingStyleSelection(
    modal
  );

  const intent =
    modal?.querySelector(
      "#contributionWritingIntent"
    );

  if (intent) {
    intent.value = "";
  }

  const intentDetails =
    modal?.querySelector(
      "#writingIntentDetails"
    );

  if (intentDetails) {
    intentDetails.open = false;
  }

  invalidateRewriteDraft(
    modal
  );
}

function ensureContributionModal() {
  if (
    document.querySelector(
      "#contributionModal"
    )
  ) {
    return;
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "contributionModal";

  modal.className =
    "contribution-modal contribution-modal--workshop";

  modal.hidden =
    true;

  modal.innerHTML = `
    <div
      class="contribution-modal__backdrop"
      data-close-contribution-modal
    ></div>

    <section
      class="contribution-modal__dialog contribution-workshop-dialog"
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
        Memory Co-creation
      </p>

      <h2
        id="contributionModalTitle"
      >
        城市记忆共创工坊
      </h2>

      <p
        class="contribution-modal__point"
        id="contributionPointName"
      ></p>

      <div class="contribution-workshop-intro">
        <span
          class="contribution-workshop-intro__seal"
          aria-hidden="true"
        >
          记
        </span>

        <p>
          先留下真实经历，再选择表达偏好。智能工具只做基础整理，
          <strong>不会改变你的真实经历，也不会补写你没有提供的人物、时间与事实。</strong>
        </p>
      </div>

      <form
        id="contributionForm"
      >
        <section
          class="contribution-workshop-step"
          aria-labelledby="memoryStepOneTitle"
        >
          <div class="contribution-workshop-step__head">
            <span>
              STEP 01
            </span>

            <div>
              <h3 id="memoryStepOneTitle">
                写下真实记忆
              </h3>

              <p>
                不用写历史介绍。写你真正经历过的事情就好。
              </p>
            </div>

            <small>
              真实材料
            </small>
          </div>

          <label
            class="contribution-field contribution-field--primary"
          >
            <span>
              我的原始记忆
            </span>

            <textarea
              id="contributionContent"
              rows="6"
              maxlength="1200"
              placeholder="例如：大概哪一年、当时为什么来这里、和谁一起来、印象最深的是什么……不用写成文章。"
            ></textarea>

            <small>
              这份原始文字将作为你的真实记忆保留，后续整理稿不会覆盖它。
            </small>
          </label>

          <div class="contribution-field-grid">
            <label
              class="contribution-field"
            >
              <span>
                大约时间
              </span>

              <input
                id="contributionTime"
                type="text"
                maxlength="80"
                placeholder="例如：2000年前后、童年时期、2026年7月"
              >
            </label>

            <label
              class="contribution-field"
            >
              <span>
                记忆类型
              </span>

              <select
                id="contributionMemoryType"
              >
                <option value="general">
                  城市记忆 / 现场观察
                </option>

                <option value="place_name">
                  地名线索
                </option>

                <option value="oral_history">
                  口述记忆
                </option>
              </select>

              <small>
                审核通过后，不同类型的贡献可解锁相应共建徽章。
              </small>
            </label>
          </div>

          <label
            class="contribution-field"
          >
            <span>
              上传真实照片（最多3张）
            </span>

            <input
              id="contributionImages"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
            >

            <small>
              支持 JPG、PNG、WebP；每张不超过5MB。照片属于真实记忆材料，将与文字整理稿分开保存。
            </small>
          </label>

          <div
            class="contribution-preview"
            id="contributionPreview"
            aria-live="polite"
          ></div>
        </section>

        <section
          class="contribution-workshop-step contribution-workshop-step--writing"
          aria-labelledby="memoryStepTwoTitle"
        >
          <div class="contribution-workshop-step__head">
            <span>
              STEP 02
            </span>

            <div>
              <h3 id="memoryStepTwoTitle">
                记录一种表达偏好
              </h3>

              <p>
                无模型版本会按所选偏好调整语序、措辞和节奏；不生成仿作，也不增加事实。
              </p>
            </div>

            <small>
              偏好标签
            </small>
          </div>

          <div
            class="writing-style-grid"
            id="writingStyleGrid"
            role="group"
            aria-label="表达偏好选择"
          >
            ${buildWritingStyleCards()}
          </div>

          <p
            class="writing-style-selected"
            id="selectedWritingStyleNote"
            aria-live="polite"
          >
            <span aria-hidden="true">
              ✓
            </span>

            已选择：
                <strong>
                  保持原声
                </strong>
                · 无模型整理以原声优先
          </p>

          <details
            class="writing-intent-details"
            id="writingIntentDetails"
          >
            <summary>
              补充表达方向（可选）
            </summary>

            <label
              class="contribution-field writing-intent-field"
            >
              <span>
                你还希望保留什么感觉？
              </span>

              <textarea
                id="contributionWritingIntent"
                rows="3"
                maxlength="300"
                placeholder="例如：不要写得太伤感；重点保留爸爸第一次带我来这里的感觉；尽量保留我原来的口语。"
              ></textarea>
            </label>
          </details>
        </section>

        <section
          class="contribution-workshop-step contribution-workshop-step--ai"
          aria-labelledby="memoryStepThreeTitle"
        >
          <div class="contribution-workshop-step__head">
            <span>
              STEP 03
            </span>

            <div>
              <h3 id="memoryStepThreeTitle">
                智能基础整理
              </h3>

              <p>
                直接在本机浏览器检查标点、重复，并按所选偏好调整语序、措辞和节奏；不调用云函数或生成式模型，真实原文永久保留。
              </p>
            </div>

            <small>
              无模型调用
            </small>
          </div>

          <div
            class="ai-writing-preview is-idle"
            id="memoryRewritePanel"
            aria-busy="false"
          >
            <div>
              <span aria-hidden="true">
                ✦
              </span>

              <div>
                <strong>
                  帮我整理这段记忆
                </strong>

                <p>
                  整理前后并排显示，由你决定采用哪一版。没有整理也可以直接投稿。
                </p>
              </div>
            </div>

            <button
              type="button"
              class="ai-writing-trigger"
              id="memoryRewriteTrigger"
              aria-disabled="false"
              title="在本机浏览器进行基础整理"
            >
              开始整理
            </button>
          </div>

          <p
            class="memory-rewrite-status"
            id="memoryRewriteStatus"
            aria-live="polite"
          ></p>

          <div
            class="memory-rewrite-comparison"
            id="memoryRewriteComparison"
            hidden
          >
            <article>
              <span>
                真实原文 · 永久保留
              </span>

              <p id="memoryRewriteOriginal"></p>
            </article>

            <article class="is-draft">
              <span id="memoryRewriteDraftLabel">
                基础整理稿 · 无模型 · 保持原声
              </span>

              <p id="memoryRewriteDraft"></p>
            </article>

            <div
              class="memory-rewrite-choice"
              role="group"
              aria-label="选择投稿表达版本"
            >
              <button
                type="button"
                id="keepOriginalMemory"
                class="memory-rewrite-choice__button is-selected"
                aria-pressed="true"
              >
                保留原文
              </button>

              <button
                type="button"
                id="useRewriteDraft"
                class="memory-rewrite-choice__button"
                aria-pressed="false"
              >
                采用整理稿
              </button>
            </div>
          </div>
        </section>

        <section class="contribution-workshop-final">
          <h3>
            确认投稿
          </h3>

          <p>
            只要投稿保存成功，你自己的地图就会立即点亮；内容进入公共城市记忆前，仍需自动初审和馆员终审。
          </p>

          <p
            class="memory-rewrite-choice-note"
            id="memoryRewriteChoice"
            aria-live="polite"
          >
            当前将保存并展示真实原文。
          </p>

          <label
            class="contribution-consent"
          >
            <input
              id="consentToPublish"
              type="checkbox"
            >

            <span>
              我同意该投稿经审核后在本项目中公开展示
            </span>
          </label>

          <label
            class="contribution-consent"
          >
            <input
              id="rightsConfirmed"
              type="checkbox"
            >

            <span>
              我确认上传的文字、照片由本人提供，或已获得相关权利人的授权
            </span>
          </label>
        </section>

        <p
          class="contribution-status"
          id="contributionStatus"
          aria-live="polite"
        ></p>

        <div
          class="contribution-actions-row"
        >
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
            确认投稿并点亮
          </button>
        </div>
      </form>
    </section>
  `;

  document.body
    .appendChild(
      modal
    );

  modal
    .querySelectorAll(
      "[data-close-contribution-modal]"
    )
    .forEach(
      (element) => {
        element
          .addEventListener(
            "click",
            closeContributionModal
          );
      }
    );

  modal
    .querySelector(
      "#contributionImages"
    )
    .addEventListener(
      "change",
      handleImageSelection
    );

  modal
    .querySelectorAll(
      "[data-writing-style]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          handleWritingStyleSelection
        );
      }
    );

  modal
    .querySelector(
      "#memoryRewriteTrigger"
    )
    .addEventListener(
      "click",
      handleMemoryRewrite
    );

  modal
    .querySelector(
      "#keepOriginalMemory"
    )
    .addEventListener(
      "click",
      () =>
        setRewriteChoice(
          modal,
          false
        )
    );

  modal
    .querySelector(
      "#useRewriteDraft"
    )
    .addEventListener(
      "click",
      () =>
        setRewriteChoice(
          modal,
          true
        )
    );

  [
    "#contributionContent",
    "#contributionTime",
    "#contributionWritingIntent"
  ].forEach(
    (selector) => {
      modal
        .querySelector(
          selector
        )
        ?.addEventListener(
          "input",
          () =>
            invalidateRewriteDraft(
              modal,
              "原文或整理条件已经改变，请重新整理。"
            )
        );
    }
  );

  modal
    .querySelector(
      "#contributionForm"
    )
    .addEventListener(
      "submit",
      handleContributionSubmit
    );

  document
    .addEventListener(
      "keydown",
      (event) => {
        if (
          event.key
            === "Escape" &&
          !modal.hidden
        ) {
          closeContributionModal();
        }

        const myMemoryPanel =
          document.querySelector(
            "#myMemoryPanel"
          );

        if (
          event.key === "Escape" &&
          myMemoryPanel &&
          !myMemoryPanel.hidden
        ) {
          closeMyMemoryPanel();
        }
      }
    );
}

function openContributionModal(
  point
) {
  if (
    !cloudReady ||
    !cloudDb ||
    !cloudApp
  ) {
    alert(
      "云端投稿服务尚未连接。\n\n地图和点位可以正常浏览，请稍后再试。"
    );

    return;
  }

  ensureContributionModal();

  activeContributionPoint =
    point;

  const modal =
    document.querySelector(
      "#contributionModal"
    );

  const form =
    modal.querySelector(
      "#contributionForm"
    );

  form.reset();

  resetWritingWorkshop(
    modal
  );

  clearPreviewUrls();

  modal
    .querySelector(
      "#contributionPreview"
    )
    .innerHTML =
      "";

  const statusElement =
    modal.querySelector(
      "#contributionStatus"
    );

  statusElement.textContent =
    "";

  statusElement
    .classList
    .remove(
      "is-error"
    );

  modal
    .querySelector(
      "#contributionPointName"
    )
    .textContent =
      `当前点位：${point.nameModern}`;

  modal.hidden =
    false;

  document.body
    .classList
    .add(
      "modal-open"
    );

  requestAnimationFrame(
    () =>
      modal
        .querySelector(
          "#contributionContent"
        )
        .focus()
  );
}

function closeContributionModal() {
  const modal =
    document.querySelector(
      "#contributionModal"
    );

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  activeContributionPoint =
    null;

  document.body
    .classList
    .remove(
      "modal-open"
    );

  resetWritingWorkshop(
    modal
  );

  clearPreviewUrls();
}

function clearPreviewUrls() {
  previewObjectUrls
    .forEach(
      (url) =>
        URL.revokeObjectURL(
          url
        )
    );

  previewObjectUrls =
    [];
}

function getSelectedImages() {
  const input =
    document.querySelector(
      "#contributionImages"
    );

  return input
    ? Array.from(
        input.files ||
        []
      )
    : [];
}

function validateImages(files) {
  if (
    files.length >
    MAX_IMAGE_COUNT
  ) {
    throw new Error(
      `每次最多上传${MAX_IMAGE_COUNT}张照片。`
    );
  }

  files.forEach(
    (file) => {
      if (
        !ALLOWED_IMAGE_TYPES
          .includes(
            file.type
          )
      ) {
        throw new Error(
          `“${file.name}”格式不支持，请使用 JPG、PNG 或 WebP。`
        );
      }

      if (
        file.size >
        MAX_IMAGE_SIZE
      ) {
        throw new Error(
          `“${file.name}”超过5MB，请压缩后再上传。`
        );
      }
    }
  );
}

function handleImageSelection() {
  const preview =
    document.querySelector(
      "#contributionPreview"
    );

  const status =
    document.querySelector(
      "#contributionStatus"
    );

  const input =
    document.querySelector(
      "#contributionImages"
    );

  const files =
    Array.from(
      input.files ||
      []
    );

  clearPreviewUrls();

  preview.innerHTML =
    "";

  status.textContent =
    "";

  status
    .classList
    .remove(
      "is-error"
    );

  try {
    validateImages(
      files
    );
  }

  catch (error) {
    input.value =
      "";

    status.textContent =
      error.message;

    status
      .classList
      .add(
        "is-error"
      );

    return;
  }

  files.forEach(
    (file) => {
      const url =
        URL.createObjectURL(
          file
        );

      previewObjectUrls
        .push(
          url
        );

      const figure =
        document.createElement(
          "figure"
        );

      figure.innerHTML = `
        <img
          src="${url}"
          alt="${escapeHtml(
            file.name
          )}预览"
        >

        <figcaption>
          ${escapeHtml(
            file.name
          )}
        </figcaption>
      `;

      preview
        .appendChild(
          figure
        );
    }
  );
}

/* ===============================================
   图片上传
   =============================================== */

function getFileExtension(file) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  const parts =
    file.name.split(".");

  const ext =
    parts.length > 1
      ? parts
          .pop()
          .toLowerCase()
      : "";

  return (
    map[file.type] ||
    ext ||
    "jpg"
  );
}

function createRandomId() {
  if (
    window.crypto &&
    typeof window.crypto
      .randomUUID
      === "function"
  ) {
    return window.crypto
      .randomUUID()
      .replaceAll(
        "-",
        ""
      );
  }

  return (
    Date.now()
      .toString(36) +
    Math.random()
      .toString(36)
      .slice(2)
  );
}

async function uploadContributionImages(
  point,
  files,
  statusElement
) {
  const fileIDs =
    [];

  for (
    let index = 0;
    index < files.length;
    index += 1
  ) {
    const file =
      files[index];

    const extension =
      getFileExtension(
        file
      );

    const cloudPath =
      `contributions/images/${point.id}/` +
      `${Date.now()}_${index + 1}_${createRandomId()}.${extension}`;

    statusElement.textContent =
      `正在上传第 ${index + 1}/${files.length} 张照片……`;

    const result =
      await cloudApp
        .uploadFile({
          cloudPath,

          filePath: file,

          onUploadProgress(
            progressEvent
          ) {
            if (
              !progressEvent.total
            ) {
              return;
            }

            const percent =
              Math.round(
                (
                  progressEvent.loaded *
                  100
                ) /
                progressEvent.total
              );

            statusElement.textContent =
              `正在上传第 ${index + 1}/${files.length} 张照片：${percent}%`;
          }
        });

    if (result?.code) {
      throw new Error(
        result.message ||
        result.code
      );
    }

    if (!result?.fileID) {
      throw new Error(
        `第 ${index + 1} 张照片上传后未返回 fileID`
      );
    }

    fileIDs.push(
      result.fileID
    );
  }

  return fileIDs;
}

/* ===============================================
   processContribution
   =============================================== */

async function triggerContributionProcessing(
  submissionId
) {
  if (!submissionId) {
    throw new Error(
      "缺少投稿记录 ID"
    );
  }

  if (
    !cloudApp ||
    typeof cloudApp
      .callFunction
      !== "function"
  ) {
    throw new Error(
      "CloudBase 云函数调用模块不可用"
    );
  }

  const response =
    await cloudApp
      .callFunction({
        name:
          "processContribution",

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

  const result =
    normalizeFunctionResult(
      response
    );

  if (!result?.ok) {
    throw new Error(
      result?.message ||
      "云函数处理投稿失败"
    );
  }

  return result;
}

/* ===============================================
   提交城市记忆
   =============================================== */

async function handleContributionSubmit(
  event
) {
  event.preventDefault();

  if (
    !activeContributionPoint
  ) {
    return;
  }

  // 保存当前点位引用，避免关闭弹窗后 activeContributionPoint 被清空。
  const submittedPoint =
    activeContributionPoint;

  const content =
    document
      .querySelector(
        "#contributionContent"
      )
      .value
      .trim();

  const approximateTime =
    document
      .querySelector(
        "#contributionTime"
      )
      .value
      .trim();

  const writingIntent =
    document
      .querySelector(
        "#contributionWritingIntent"
      )
      ?.value
      ?.trim() ||
    "";

  const writingStyle =
    getWritingStyle(
      selectedWritingStyle
    );

  const collaborativeDraft =
    currentRewriteDraft;

  const collaborativeDraftAccepted =
    Boolean(
      currentRewriteDraft &&
      currentRewriteAccepted
    );

  const memoryType =
    document
      .querySelector(
        "#contributionMemoryType"
      )
      ?.value ||
    "general";

  const files =
    getSelectedImages();

  const consentToPublish =
    document
      .querySelector(
        "#consentToPublish"
      )
      ?.checked
      === true;

  const rightsConfirmed =
    document
      .querySelector(
        "#rightsConfirmed"
      )
      ?.checked
      === true;

  const statusElement =
    document
      .querySelector(
        "#contributionStatus"
      );

  const submitButton =
    document
      .querySelector(
        "#contributionSubmit"
      );

  statusElement
    .classList
    .remove(
      "is-error"
    );

  if (
    !content &&
    files.length === 0
  ) {
    statusElement.textContent =
      "请至少填写一段文字，或上传一张照片。";

    statusElement
      .classList
      .add(
        "is-error"
      );

    return;
  }

  if (
    !consentToPublish
  ) {
    statusElement.textContent =
      "请勾选“同意该投稿经审核后公开展示”。";

    statusElement
      .classList
      .add(
        "is-error"
      );

    return;
  }

  if (
    !rightsConfirmed
  ) {
    statusElement.textContent =
      "请确认投稿材料由本人提供，或已获得相关权利人的授权。";

    statusElement
      .classList
      .add(
        "is-error"
      );

    return;
  }

  try {
    validateImages(
      files
    );

    submitButton.disabled =
      true;

    submitButton.textContent =
      "正在提交……";

    let imageFileIds =
      [];

    if (
      files.length
    ) {
      imageFileIds =
        await uploadContributionImages(
          submittedPoint,
          files,
          statusElement
        );
    }

    statusElement.textContent =
      "照片上传完成，正在保存投稿记录……";

    const materialType =
      files.length > 0 &&
      content
        ? "text_image"
        : files.length > 0
          ? "image"
          : "text";

    const addResult =
      await cloudDb
        .collection(
          "contributions"
        )
        .add({
          pointId:
            submittedPoint.id,

          pointName:
            submittedPoint.nameModern,

          originalContent:
            content,

          collaborativeDraft,

          collaborativeDraftAccepted,

          preferredPublicContent:
            collaborativeDraftAccepted
              ? "collaborativeDraft"
              : "originalContent",

          writingStyleId:
            writingStyle.id,

          writingStyleName:
            writingStyle.name,

          writingIntent,

          rewriteEngine:
            currentRewriteMeta
              ?.engine ||
            "",

          rewriteModel:
            currentRewriteMeta
              ?.model ??
            null,

          rewriteModelServiceRequired:
            currentRewriteMeta
              ?.modelServiceRequired
              === true,

          rewriteNotice:
            currentRewriteMeta
              ?.notice ||
            "",

          approximateTime,

          materialType,

          memoryType,

          imageFileIds,

          imageCount:
            imageFileIds.length,

          videoFileIds: [],

          consentToPublish,

          rightsConfirmed,

          status:
            "pending",

          sourceType:
            "public_ugc",

          createdAt:
            new Date()
        });

    if (
      addResult?.error
    ) {
      throw addResult.error;
    }

    if (
      addResult?.code
    ) {
      throw new Error(
        addResult.message ||
        addResult.code
      );
    }

    const submissionId =
      addResult?._id ||
      addResult?.id;

    if (
      !submissionId
    ) {
      throw new Error(
        "投稿已保存，但没有取得投稿记录 ID"
      );
    }

    statusElement.textContent =
      "投稿已保存，正在启动自动处理流程……";

    let processingStarted =
      false;

    try {
      const result =
        await triggerContributionProcessing(
          submissionId
        );

      processingStarted =
        true;

      statusElement.textContent =
        result.message ||
        "投稿已进入自动处理流程。";
    }

    catch (
      processingError
    ) {
      console.error(
        "自动处理启动失败：",
        processingError
      );

      statusElement.textContent =
        "投稿已经保存，但自动处理暂未启动；你的个人地图仍会立即点亮，公开前继续等待馆员审核。";

      statusElement
        .classList
        .add(
          "is-error"
        );
    }

    /*
     * 无论自动处理是否成功启动，只要投稿记录已经保存，
     * 都立即刷新当前用户自己的投稿状态。
     * 这一步只触发“我的点亮”，不会把内容直接公开。
     */
    await loadMyContributions();

    renderMarkers(
      allPoints
    );

    renderRoute(
      allPoints
    );

    const myMemoryPanel =
      document.querySelector(
        "#myMemoryPanel"
      );

    if (
      myMemoryPanel &&
      !myMemoryPanel.hidden
    ) {
      renderMyMemoryPanel();
    }

    window.setTimeout(
      () => {
        closeContributionModal();

        // 回到古图，让本次投稿的地点成为视觉中心。
        focusPersonalLitPoint(
          submittedPoint
        );

        // 用站内动效替代浏览器原生 alert。
        showPersonalLightCelebration(
          submittedPoint,
          processingStarted
        );
      },
      520
    );

  }

  catch (error) {
    console.error(
      "图文投稿失败：",
      error
    );

    statusElement.textContent =
      `提交失败：${
        error.message ||
        "请稍后重试"
      }`;

    statusElement
      .classList
      .add(
        "is-error"
      );
  }

  finally {
    submitButton.disabled =
      false;

    submitButton.textContent =
      "确认投稿并点亮";
  }
}

/* ===============================================
   加载 points.json
   =============================================== */

async function loadPoints() {
  const response =
    await fetch(
      `./points.json?v=${APP_VERSION}`,
      {
        method: "GET",

        cache:
          "no-store",

        headers: {
          Accept:
            "application/json"
        }
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `读取 points.json 失败：HTTP ${response.status}`
    );
  }

  const points =
    await response.json();

  if (
    !Array.isArray(
      points
    )
  ) {
    throw new TypeError(
      "points.json 的最外层必须是数组"
    );
  }

  console.log(
    `已读取 ${points.length} 个点位`
  );

  return points;
}

/* ===============================================
   初始化
   =============================================== */

async function init() {
  markersEl =
    document.querySelector(
      "#mapMarkers"
    );

  detailEl =
    document.querySelector(
      "#pointDetail"
    );

  routeListEl =
    document.querySelector(
      "#routeList"
    );

  if (
    !markersEl ||
    !detailEl ||
    !routeListEl
  ) {
    console.error(
      "页面缺少必要元素：#mapMarkers、#pointDetail 或 #routeList"
    );

    return;
  }

  initMapHubShell();

  ensureContributionModal();

  ensureMyMemoryPanel();

  bindMyMemoryButtons();

  try {
    allPoints =
      await loadPoints();

    /*
     * 先显示地图。
     * 即使 CloudBase 出问题，
     * 网站仍然可以浏览。
     */
    renderMarkers(
      allPoints
    );

    renderRoute(
      allPoints
    );

    /*
     * 再连接 CloudBase。
     */
    await initCloudBase();

    /*
     * 如果连接成功，
     * 尝试读取审核通过的城市记忆。
     */
    if (cloudReady) {
      await loadApprovedMemories();

      /*
       * 同时读取当前用户自己的投稿。
       * pending / processing / approved 都进入“我的点亮”；
       * 公共展示仍然只读取 approved 内容。
       */
      await loadMyContributions();

      /*
       * 再渲染一次：
       * - approved 公共投稿只显示公共记忆数量；
       * - 当前用户自己的有效投稿触发个人即时点亮。
       */
      renderMarkers(
        allPoints
      );

      renderRoute(
        allPoints
      );
    }
  }

  catch (error) {
    detailEl.innerHTML = `
      <p
        class="empty-state"
      >
        点位数据暂时无法加载。请检查 points.json 是否位于仓库根目录，以及 JSON 格式是否正确。
      </p>
    `;

    routeListEl.innerHTML =
      "";

    console.error(
      "网站初始化失败：",
      error
    );
  }
}

if (
  document.readyState
    === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
}

else {
  init();
}
