// ===============================================
// 成都府图：50点导览 + CloudBase 城市记忆投稿
// + 审核通过后点亮地标
// 版本：2026-08-12-V3-零模型智能整理接入
// ===============================================

const APP_VERSION = "20260916-textcover02";

const CLOUDBASE_ENV_ID =
  window.TUHUI_CONFIG?.envId ||
  "chengdufu-map-d4g459au02132689e";

const CLOUDBASE_REGION =
  window.TUHUI_CONFIG?.region ||
  "ap-shanghai";

let cloudApp = null;
let cloudDb = null;
let cloudReady = false;

let markersEl = null;
let detailEl = null;
let routeListEl = null;

let activeContributionPoint = null;

let previewObjectUrls = [];
let selectedContributionFiles = [];
let contributionStep = 0;
let contributionDraftKey = "";
let contributionReturnFocus = null;
let contributionOpenToken = 0;
let myMemoryFilter = "all";

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
    id: "childvoice",
    mark: "童",
    name: "童言童语",
    tagline: "好奇 · 直白 · 小发现",
    description: "用孩子般清楚、短句的口吻整理真实经历；不添加原文没有的想象和事实。"
  },
  {
    id: "simaxiangru",
    mark: "相",
    name: "司马相如",
    tagline: "铺陈 · 城阙 · 雅正",
    description: "强调地点、行程与城市空间的铺陈感；只调整表达，不仿写原作。"
  },
  {
    id: "dufu",
    mark: "杜",
    name: "杜甫",
    tagline: "沉静 · 时地 · 深情",
    description: "适合老地方、成长、离别与时间变化中的真实感受。"
  },
  {
    id: "xuetao",
    mark: "薛",
    name: "薛涛",
    tagline: "清丽 · 细节 · 含蓄",
    description: "突出人与地点之间细小、清晰的感受；不增添原文没有的景物。"
  },
  {
    id: "sushi",
    mark: "苏",
    name: "苏轼",
    tagline: "清旷 · 日常 · 有味",
    description: "适合出游、朋友与日常生活中的细小滋味；不仿写原作。"
  },
  {
    id: "guomoruo",
    mark: "郭",
    name: "郭沫若",
    tagline: "历史 · 抒情 · 联想",
    description: "强调个人经历与城市时间的关联；不增加未经提供的历史事实。"
  },
  {
    id: "lijieren",
    mark: "劼",
    name: "李劼人",
    tagline: "街巷 · 市井 · 成都",
    description: "保留口语与市井节奏，适合老街、商铺、邻里和成都日常。"
  },
  {
    id: "alai",
    mark: "阿",
    name: "阿来",
    tagline: "地方 · 自然 · 时间",
    description: "让地点和时间成为叙事线索，以平静的地方经验组织记忆。"
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
let rewriteAutoTimer = 0;

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
let personalReadEpoch = 0;

let myContributionPointState =
  new Map();

const statusClass = {
  "存续点": "status-existing",
  "变迁点": "status-changed",
  "不确定点": "status-uncertain",
  "新增点": "status-added",
  "今地点位": "status-campus",

  existing: "status-existing",
  changed: "status-changed",
  uncertain: "status-uncertain"
};

const statusLabel = {
  "存续点": "存续点",
  "变迁点": "变迁点",
  "不确定点": "待考点",
  "新增点": "新增点",
  "今地点位": "今地点位",

  existing: "存续点",
  changed: "变迁点",
  uncertain: "待考点"
};

const citywalkOrder = [
  "jiuyanqiao",
  "wuhouci",
  "qingyanggong",
  "wenshuyuan",
  "mancheng",
  "hongpailou"
];

const CORE_POINT_KNOWLEDGE = {
  jiuyanqiao: {
    grade: "B",
    timeline: [
      ["1593", "洪济桥始建，历时五年建成"],
      ["天启年间", "改名锁江桥"],
      ["1788", "补修与九眼桥名称沿用，两书表述有别"],
      ["1992", "明清旧桥拆除"],
      ["2001", "异地仿建九孔石拱桥落成"]
    ],
    sources: [
      ["《成都通览》", "PDF第33页", "A"],
      ["《成都街巷志》", "PDF第126—131页", "A"]
    ],
    caution: "古图“九贤桥”与今日“九眼桥”的对应关系仍需地图与文字学复核。"
  },
  wuhouci: {
    grade: "B",
    timeline: [
      ["1849", "刘沅主持调整与重塑祠内雕塑"],
      ["1902", "赵藩撰写“攻心联”"],
      ["清末文献", "昭烈陵衣冠陵与诸葛铜鼓均作为旧说记录"]
    ],
    sources: [
      ["《成都通览》", "PDF第40页", "A"],
      ["《成都街巷志》", "PDF第299—300、678页", "A"]
    ],
    caution: "古代祠庙空间不能直接等同今日武侯祠博物馆与周边文旅街区。"
  },
  wenshuyuan: {
    grade: "B",
    timeline: [
      ["清代", "与延庆寺、大慈寺、石犀寺并列为成都四大寺院"],
      ["清末至民国", "头福街西段因寺院改称文殊院街"]
    ],
    sources: [
      ["《成都街巷志》", "PDF第676、708—709页", "A"]
    ],
    caution: "现有材料不足以可靠说明文殊院早期创建年代；现代文殊坊不等同古图寺院范围。"
  },
  qingyanggong: {
    grade: "A",
    timeline: [
      ["883", "扩建后正式称青羊宫"],
      ["1723", "单角铜羊由张鹏翮购赠"],
      ["1829", "双角铜羊在成都铸造"],
      ["清末", "花会、劝工会与劝业会形成公共文化空间"]
    ],
    sources: [
      ["《成都通览》", "PDF第39页", "A"],
      ["《成都街巷志》", "PDF第529—538页", "A"]
    ],
    caution: "青羊降临、张天师传道等属于传说；古图建筑形态不等同今日多次重建后的格局。"
  },
  mancheng: {
    grade: "B",
    timeline: [
      ["1718", "安排八旗官兵长期驻防成都"],
      ["1721", "驻防新城开始修筑"],
      ["1912—1935", "满城城墙陆续拆除"],
      ["近现代", "宽、窄、井巷子转化为公共文化街区"]
    ],
    sources: [
      ["《成都通览》", "PDF第37页", "A"],
      ["《成都街巷志》", "PDF第28—32、883—884页", "A"]
    ],
    caution: "1718可指安排驻防，1721可指筑城动工；宽窄巷子只是满城局部遗存。"
  },
  hongpailou: {
    grade: "C",
    timeline: [
      ["20世纪40年代", "“成都外南红牌楼”地名已明确使用"],
      ["旧建筑线索", "目录将红牌楼北街归入“以昔建筑命名”"]
    ],
    sources: [
      ["《成都街巷志》", "PDF第65页", "A"],
      ["《成都街巷志》目录", "PDF第1097页", "C"]
    ],
    caution: "创建年代、形制、用途与精确原址仍缺直接证据；嘉靖建牌楼等说法不得作为定论。"
  }
};

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
      const existing = typeof cloudApp.auth.getSession === "function"
        ? await cloudApp.auth.getSession() : null;
      if (existing?.error) throw existing.error;
      const result = existing?.data?.session
        ? existing : await cloudApp.auth.signInAnonymously();

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
  const isCampusPoint =
    point.detailLevel === "campus";

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

        ${
          isCampusPoint
            ? ""
            : `<figcaption>
                今日影像
              </figcaption>`
        }
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
    <div class="point-media${
      figures.length === 1
        ? " point-media--single"
        : ""
    }${
      isCampusPoint
        ? " point-media--campus"
        : ""
    }">
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

function getEvidenceRecordsForPoint(
  pointId
) {
  const records =
    window.TUHUI_EVIDENCE
      ?.byPoint?.[pointId];

  return Array.isArray(records)
    ? records
    : [];
}

function renderPointEvidenceCards(
  point
) {
  const records =
    getEvidenceRecordsForPoint(
      point.id
    );

  if (!records.length) {
    return "";
  }

  return `
    <section class="detail-source-section">
      <p class="detail-section-label">馆藏证据</p>
      <div class="detail-source-list">
        ${records.map((record, index) => {
          const isInCopyright =
            record.sourceType === "in-copyright";
          const isPublicDomain =
            record.sourceType === "public-domain";

          return `
          <article class="detail-source-card ${isInCopyright ? "is-citation-evidence" : ""}">
            <div class="detail-source-card__head">
              <span>
                <small>${String(index + 1).padStart(2, "0")}</small>
                <strong>${escapeHtml(record.title)}</strong>
              </span>
              <em>${escapeHtml(record.pageLabel)}</em>
            </div>
            <p>${escapeHtml(isInCopyright ? record.proves : record.excerpt)}</p>
            <div class="detail-source-card__footer">
              <span class="source-grade">
                证据 ${escapeHtml(record.grade)} · ${escapeHtml(record.verification)}
                ${isInCopyright ? " · 合理引用" : isPublicDomain ? " · 公版原页" : ""}
              </span>
              <button type="button" data-open-evidence="${escapeHtml(record.id)}">
                ${isInCopyright ? "查看引用式证据卡" : record.pages?.length ? "查看原页" : "查看核验记录"} ↗
              </button>
            </div>
          </article>
        `;
        }).join("")}
      </div>
    </section>
  `;
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
    const fileList = [];
    for(let index=0; index<fileIds.length; index+=50) {
      const result = await cloudApp.getTempFileURL({fileList:fileIds.slice(index,index+50)});
      fileList.push(...(result?.fileList || result?.result?.fileList || []));
    }

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

    return memories.map(memory => ({
      ...memory,
      imageUrls: (memory.imageFileIds || [])
        .map(fileId => urlMap.get(fileId))
        .filter(Boolean)
    }));
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
let publicMemoriesLoad = null;
let publicReadEpoch = 0;
let publicAccountEpoch = 0;
let publicMemoriesLoadEpoch = -1;
let publicMemoriesLoaded = false;
let publicMemoriesError = "";

async function loadApprovedMemories() {
  if (publicMemoriesLoad) {
    const epoch = publicMemoriesLoadEpoch;
    const result = await publicMemoriesLoad;
    return epoch === publicReadEpoch ? result : loadApprovedMemories();
  }
  if (!cloudReady || !cloudApp) {
    publicMemoriesError = "公开记忆暂未连接，请稍后重试。";
    return false;
  }
  const epoch = publicReadEpoch;
  publicMemoriesLoadEpoch = epoch;
  publicMemoriesLoad = (async () => {
    try {
      const collected = new Map();
      const seenCursors = new Set();
      let cursor = "";
      do {
        const result = normalizeFunctionResult(await cloudApp.callFunction({ name: "getPublicMemories", data: { limit: 100, cursor }, parse: true }));
        if (!result?.ok || !Array.isArray(result.memories)) throw new Error("公开记忆读取失败，请稍后重试。");
        const page = await resolveMemoryImageUrls(result.memories);
        page.forEach(memory => {
          if (memory.status === "approved" && memory.id) collected.set(memory.id, memory);
        });
        cursor = result.nextCursor || "";
        if (cursor && (typeof cursor !== "string" || seenCursors.has(cursor))) throw new Error("公开记忆读取未完成，请稍后重试。");
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      const grouped = new Map();
      collected.forEach(memory => {
        const pointId = memory.pointId || "__unmapped__";
        const items = grouped.get(pointId) || [];
        items.push(memory);
        grouped.set(pointId, items);
      });
      if (epoch !== publicReadEpoch) return false;
      approvedMemoriesByPoint = grouped;
      publicMemoriesLoaded = true;
      publicMemoriesError = "";
      updateMapMemoryLayerCounts();
      return true;
    } catch (error) {
      if (epoch === publicReadEpoch) publicMemoriesError = error.message || "公开记忆读取失败，请稍后重试。";
      return false;
    }
  })();
  try { return await publicMemoriesLoad; } finally { publicMemoriesLoad = null; }
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
  const publicCount = document.querySelector("#publicMemoryCount");
  if (publicCount) publicCount.textContent = publicMemoriesLoaded ? String(getPublicMemoryCount()) : "—";
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

  document
    .querySelectorAll(
      "[data-archive-public-memory-count]"
    )
    .forEach((element) => {
      element.textContent =
        String(
          getPublicMemoryCount()
        );
    });
}

function updateArchiveMetrics() {
  const records =
    window.TUHUI_EVIDENCE
      ?.records || [];

  const values = {
    "[data-archive-map-count]": 1,
    "[data-archive-source-count]": new Set(
      records
        .filter((record) =>
          record.sourceKey !== "project"
        )
        .map((record) => record.title)
    ).size,
    "[data-archive-fragment-count]": records.length,
    "[data-archive-profile-count]": citywalkOrder.length,
    "[data-archive-point-count]": allPoints.length
  };

  Object.entries(values)
    .forEach(([selector, value]) => {
      document
        .querySelectorAll(selector)
        .forEach((element) => {
          element.textContent =
            String(value);
        });
    });

  ["A", "B", "C"]
    .forEach((grade) => {
      const count = records.filter(
        (record) =>
          record.grade === grade
      ).length;

      document
        .querySelectorAll(
          `[data-archive-grade="${grade}"]`
        )
        .forEach((element) => {
          element.textContent =
            String(count);
        });
    });

  updateMapMemoryLayerCounts();
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
  const selectedLabel = document.querySelector("#pointPickerCurrent");
  if (selectedLabel) selectedLabel.textContent = `当前地点：${pointPickerName(point)}`;
  document.querySelectorAll("[data-find-point]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.findPoint === point.id)));

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

let pointPickerStatus = "";

function pointPickerName(point) {
  if (point.id === "sichuandaxue") return "四川大学（望江校区）";
  if (point.id === "huaxiba") return "华西坝（华西校区）";
  return point.nameModern || point.nameAncient || "未命名地点";
}

function renderPointPicker() {
  const list = document.querySelector("#pointPickerList");
  if (!list) return;
  const matches = allPoints.filter(point => getStatusClass(point) === pointPickerStatus);
  const label = document.querySelector(`[data-point-status="${pointPickerStatus}"]`)?.textContent.replace("⌄", "").trim() || "地点";
  document.querySelector("#pointPickerCount").textContent = allPoints.length ? `${label} · ${matches.length} 处` : "点位正在加载，请稍候。";
  list.innerHTML = matches.map(point => `<button type="button" data-find-point="${escapeHtml(point.id)}" aria-pressed="${point.id === activeMapPointId}">${escapeHtml(pointPickerName(point))}</button>`).join("");
}

function closePointPicker() {
  document.querySelector("#pointPicker").hidden = true;
  document.querySelectorAll("[data-point-status]").forEach(button => button.setAttribute("aria-expanded", "false"));
}

function positionPointPicker() {
  const panel = document.querySelector("#pointPicker");
  if (panel.hidden) return;
  panel.style.left = "0px";
  // 下拉框贴近当前按钮，同时保持在地图容器与窄屏内。
  const bounds = document.querySelector("#mapHub").getBoundingClientRect();
  const rect = panel.getBoundingClientRect();
  const shift = Math.min(0, Math.min(window.innerWidth - 12, bounds.right - 12) - rect.right);
  panel.style.left = `${Math.max(shift, Math.max(12, bounds.left + 12) - rect.left)}px`;
}

function bindPointPicker() {
  const panel = document.querySelector("#pointPicker");
  document.querySelectorAll("[data-point-status]").forEach(button => {
    button.addEventListener("click", () => {
      const wasOpen = button.getAttribute("aria-expanded") === "true";
      closePointPicker();
      if (wasOpen) return;
      pointPickerStatus = button.dataset.pointStatus;
      button.parentElement.appendChild(panel);
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      renderPointPicker();
      positionPointPicker();
    });
    button.addEventListener("keydown", event => {
      if (event.key === "Escape") closePointPicker();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (button.getAttribute("aria-expanded") !== "true") button.click();
        panel.querySelector("[data-find-point]")?.focus();
      }
    });
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePointPicker();
      document.querySelector(`[data-point-status="${pointPickerStatus}"]`)?.focus();
    }
    const items = Array.from(panel.querySelectorAll("[data-find-point]"));
    const index = items.indexOf(document.activeElement);
    if (index >= 0 && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  });
  const closeOutside = event => {
    if (!panel.hidden && !panel.parentElement.contains(event.target)) closePointPicker();
  };
  document.addEventListener("click", closeOutside);
  document.addEventListener("focusin", closeOutside);
  window.addEventListener("resize", positionPointPicker);
  // 从浏览器缓存返回时收起旧菜单，地点列表不会控制地图显隐。
  window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    pointPickerStatus = "";
    closePointPicker();
    renderPointPicker();
  });
  document.querySelector("#pointPickerList").addEventListener("click", event => {
    const button = event.target.closest("[data-find-point]");
    const point = allPoints.find(item => item.id === button?.dataset.findPoint);
    if (!point) return;
    closePointPicker();
    document.querySelector(`[data-point-status="${pointPickerStatus}"]`).focus({ preventScroll: true });
    // 馆藏问图只支持六个核心点位，其他地点选中后进入其可用的探古档案。
    if (mapHubMode === "ask" && !citywalkOrder.includes(point.id)) setMapHubMode("explore");
    handleMapPointInteraction(point);
  });
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
  const epoch = personalReadEpoch;
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

    if (Array.isArray(result.items)) {
      const resolved = [];
      for (let i = 0; i < result.items.length; i += 30) resolved.push(...await resolveMemoryImageUrls(result.items.slice(i, i + 30)));
      result.items = resolved;
    }
    if (epoch !== personalReadEpoch) return null;
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

function getMaterialTypeLabel(
  materialType
) {
  const map = {
    text: "文字记忆",
    image: "影像记忆",
    text_image: "图文记忆"
  };

  return (
    map[materialType] ||
    "城市记忆"
  );
}

function toContributionDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return toContributionDate(
      value.toDate()
    );
  }

  const cloudDate =
    value?.$date ??
    value?._seconds ??
    value?.seconds ??
    value;

  const numericDate =
    typeof cloudDate === "number" &&
    cloudDate < 100000000000
      ? cloudDate * 1000
      : cloudDate;

  const date = new Date(numericDate);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatPublicArchiveDate(value) {
  const date = toContributionDate(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}年${month}月${day}日`;
}

function getFirstPublicMemoryDate(
  items
) {
  const approvedDates = (items || [])
    .filter(
      (item) =>
        item?.status === "approved"
    )
    .map(
      (item) =>
        toContributionDate(
          item.publishedAt ||
          item.approvedAt ||
          item.reviewedAt ||
          item.updatedAt ||
          item.createdAt
        )
    )
    .filter(Boolean)
    .sort(
      (first, second) =>
        first.getTime() -
        second.getTime()
    );

  return approvedDates[0] || null;
}

function getFirstContributionDate(
  items
) {
  const contributionDates =
    (items || [])
      .map(
        (item) =>
          toContributionDate(
            item.createdAt ||
            item.updatedAt
          )
      )
      .filter(Boolean)
      .sort(
        (first, second) =>
          first.getTime() -
          second.getTime()
      );

  return contributionDates[0] || null;
}

function formatBadgeUnlockMonth(
  date
) {
  if (!date) {
    return "首份记忆已公开";
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  return `${year}.${month}`;
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

  if (!myContributionData) {
    contentElement.innerHTML = `<h2 id="myMemoryPanelTitle">我的城市记忆</h2>
      ${window.tuhuiAccount?.markup() || ""}
      <div class="my-memory-empty" role="status"><strong>暂时无法读取你的记忆</strong>
      <p>旧投稿仍然保留，不需要重新投稿。请稍后重试读取。</p>
      <button type="button" class="btn ghost" data-retry-my-memory>重试读取</button></div>`;
    contentElement.querySelector("[data-retry-my-memory]").onclick = openMyMemoryPanel;
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

  const approvedCount =
    Number(summary.approved) ||
    items.filter(
      (item) =>
        item?.status === "approved"
    ).length;

  const isContributor =
    summary.isContributor === true ||
    approvedCount > 0;

  const firstLightUnlocked =
    approvedCount > 0;

  const firstPublicMemoryDate =
    getFirstPublicMemoryDate(items) ||
    (firstLightUnlocked
      ? new Date()
      : null);

  const sichuanUniversityItems =
    items.filter(
      (item) =>
        [
          "sichuandaxue",
          "huaxiba"
        ].includes(item?.pointId) &&
        [
          "pending",
          "processing",
          "approved"
        ].includes(item?.status)
    );

  const sichuanUniversityUnlocked =
    sichuanUniversityItems.length > 0;

  const sichuanUniversityUnlockDate =
    getFirstContributionDate(
      sichuanUniversityItems
    );

  const familyMemoryItems =
    items.filter(
      (item) =>
        item?.status ===
          "approved" &&
        (
          item?.writingStyleId ===
            "childvoice" ||
          item?.writingStyleName ===
            "童言童语"
        )
    );

  const familyMemoryUnlocked =
    familyMemoryItems.length > 0;

  const familyMemoryUnlockDate =
    getFirstPublicMemoryDate(
      familyMemoryItems
    );

  const litPointCount =
    getMyLitPointCount();

  const identityTitle =
    isContributor
      ? "成都城市记忆共建者"
      : summary.total > 0
        ? "城市记忆参与者"
        : "等待你的第一份城市记忆";

  const identityText =
    isContributor
      ? "这些照片与故事，记录着与成都的相遇。"
      : summary.total > 0
        ? "你的记忆已经被记录，可以在下方查看。"
        : "选择一个古图点位，留下照片、地名线索或口述故事，从第一份城市记忆开始。";

  const badgeDefinitions = [
    {
      key:
        "chengduLamplighter",

      icon:
        "✦",

      title:
        "成都点灯人",

      note:
        "完成第一次城市记忆公开",

      unlocked:
        firstLightUnlocked,

      unlockedNote:
        `已解锁 · ${formatBadgeUnlockMonth(
          firstPublicMemoryDate
        )}`,

      foundation:
        true
    },

    {
      key:
        "scuMemoryKeeper",

      icon:
        "川",

      title:
        "川大拾光者",

      note:
        "在川大或华西坝点位提交一份城市记忆",

      unlocked:
        sichuanUniversityUnlocked,

      unlockedNote:
        `已解锁 · ${formatBadgeUnlockMonth(
          sichuanUniversityUnlockDate
        )}`,

      campus:
        true
    },

    {
      key:
        "familyMemoryKeeper",

      icon:
        "童",

      title:
        "亲子拾光者",

      note:
        "一份童言童语记忆经馆员审核公开",

      unlocked:
        familyMemoryUnlocked,

      unlockedNote:
        `已解锁 · ${formatBadgeUnlockMonth(
          familyMemoryUnlockDate
        )}`,

      family:
        true
    },

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
            typeof badge.unlocked ===
            "boolean"
              ? badge.unlocked
              : badges[
                  badge.key
                ] === true;

          return `
            <article
              class="my-badge ${
                unlocked
                  ? "is-unlocked"
                  : "is-locked"
              }${
                badge.foundation
                  ? " is-foundation"
                  : ""
              }${
                badge.campus
                  ? " is-campus"
                  : ""
              }${
                badge.family
                  ? " is-family"
                  : ""
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
                      ? badge.unlockedNote ||
                        "已获得"
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

  const likedItems = Array.from(approvedMemoriesByPoint.values()).flat().filter(item => item.likedByMe === true);
  const filteredItems = (myMemoryFilter === "liked" ? likedItems : items).filter(item => myMemoryFilter === "all" || myMemoryFilter === "liked" || (myMemoryFilter === "processing" ? ["pending", "processing"].includes(item.status) : myMemoryFilter === "lit" ? ["pending", "processing", "approved"].includes(item.status) : item.status === myMemoryFilter));
  const footprintsHtml =
    filteredItems.length
      ? filteredItems
          .map(
            (item) => {
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

                    </div>
                  </div>

                  ${(item.imageUrls || []).length ? `<div class="my-memory-photos">${item.imageUrls.map(url => `<button type="button" data-my-image="${escapeHtml(url)}" aria-label="放大查看记忆照片"><img src="${escapeHtml(url)}" alt="${escapeHtml(item.pointName || "记忆")}照片" loading="lazy"></button>`).join("")}</div>` : Number(item.imageCount) > 0 ? '<p>照片暂未加载，可关闭后重新打开重试。</p>' : ""}
                  ${memoryDisplayText(item) ? `<section class="my-footprint-text"><p>${escapeHtml(memoryDisplayText(item))}</p></section>` : ""}

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
            此分类暂无记忆
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

    ${window.tuhuiAccount?.markup() || ""}

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

    <div class="my-memory-stats" role="group" aria-label="筛选我的记忆">
      ${[["all", "留下记忆", items.length], ["processing", "审核中", items.filter(i=>["pending","processing"].includes(i.status)).length], ["approved", "已公开", approvedCount], ["lit", "我的点亮", litPointCount], ["liked", "已点赞", likedItems.length]].map(([key,label,count])=>`<button type="button" data-my-filter="${key}" aria-pressed="${myMemoryFilter===key}"><strong>${count}</strong><span>${label}</span></button>`).join("")}
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
          达到对应条件后自动解锁
        </span>
      </div>

      <p class="my-badge-progress">
        <span aria-hidden="true">✦</span>
        你已点亮
        <strong>${litPointCount}</strong>
        处成都记忆
      </p>

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
          共 ${filteredItems.length} 份
        </span>
      </div>

      <div
        class="my-footprints"
      >
        ${footprintsHtml}
      </div>
    </section>
  `;
  contentElement.querySelectorAll("[data-my-filter]").forEach(button => button.onclick = () => {
    myMemoryFilter = button.dataset.myFilter;
    renderMyMemoryPanel();
    const target = contentElement.querySelector(`[data-my-filter="${myMemoryFilter}"]`);
    target.focus({preventScroll:true});
    contentElement.querySelector(".my-footprints").scrollIntoView({block:"nearest"});
  });
  contentElement.querySelectorAll("[data-my-image]").forEach(button => button.onclick = () => {
    let viewer = document.querySelector("#myPhotoDialog");
    if (!viewer) {
      viewer = document.createElement("dialog"); viewer.id = "myPhotoDialog";
      viewer.innerHTML = '<button type="button" aria-label="关闭照片">关闭 ×</button><img alt="我的记忆照片">';
      document.body.append(viewer); viewer.querySelector("button").onclick = () => viewer.close();
      viewer.addEventListener("keydown", e => e.stopPropagation());
    }
    viewer.querySelector("img").src = button.dataset.myImage; viewer.showModal();
  });

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

  await Promise.all([loadMyContributions(), loadApprovedMemories()]);

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

let publicArchiveReturnFocus = null;
let publicArchiveViewToken = 0;
let publicArchivePlaces = new Map();
let publicArchivePlaceScroll = 0;
let publicArchiveSelectedPlace = "";
const publicLikePending = new Map();
let publicMemoryImageReturnFocus = null;
let publicMemoryImageState = null;

function memoryLikeCount(memory) {
  return Number.isSafeInteger(memory.likeCount) && memory.likeCount >= 0 ? memory.likeCount : 0;
}

function sortPublicMemories(memories) {
  // Sort only after all cursor pages have loaded. Ties retain the stable ID order.
  return [...memories].sort((a, b) => memoryLikeCount(b) - memoryLikeCount(a) || a.id.localeCompare(b.id));
}

function publicLikeLabel(memory) {
  return `${memory.likedByMe ? "♥ 已赞" : "♡ 点赞"} ${memoryLikeCount(memory)}`;
}

function findPublicMemory(memoryId) {
  return Array.from(approvedMemoriesByPoint.values())
    .flat()
    .find(memory => memory.id === memoryId);
}

function renderPublicMemoryImageViewer() {
  const viewer = document.querySelector("#publicMemoryImageViewer");
  if (!viewer || !publicMemoryImageState) return;
  const { urls, pointName } = publicMemoryImageState;
  const index = Math.max(0, Math.min(publicMemoryImageState.index, urls.length - 1));
  publicMemoryImageState.index = index;
  const image = viewer.querySelector("#publicMemoryImageFull");
  image.src = urls[index];
  image.alt = `${pointName}城市记忆照片，第${index + 1}张，共${urls.length}张`;
  viewer.querySelector("#publicMemoryImageTitle").textContent = `${pointName} · 城市记忆照片`;
  viewer.querySelector("#publicMemoryImageCounter").textContent = `${index + 1} / ${urls.length}`;
  viewer.querySelector("[data-public-image-previous]").disabled = index === 0;
  viewer.querySelector("[data-public-image-next]").disabled = index === urls.length - 1;
}

function openPublicMemoryImageViewer(button) {
  const memory = findPublicMemory(button.dataset.publicMemoryImage);
  const urls = Array.isArray(memory?.imageUrls) ? memory.imageUrls.filter(Boolean) : [];
  if (!urls.length) return;
  publicMemoryImageReturnFocus = button;
  publicMemoryImageState = {
    urls,
    index: Math.max(0, Math.min(Number(button.dataset.publicImageIndex) || 0, urls.length - 1)),
    pointName: memory.pointName || "成都"
  };
  const viewer = document.querySelector("#publicMemoryImageViewer");
  viewer.hidden = false;
  viewer.setAttribute("aria-hidden", "false");
  renderPublicMemoryImageViewer();
  viewer.querySelector("[data-close-public-memory-image]").focus();
}

function closePublicMemoryImageViewer({ restoreFocus = true } = {}) {
  const viewer = document.querySelector("#publicMemoryImageViewer");
  if (!viewer || viewer.hidden) return;
  viewer.hidden = true;
  viewer.setAttribute("aria-hidden", "true");
  viewer.querySelector("#publicMemoryImageFull").removeAttribute("src");
  if (restoreFocus) publicMemoryImageReturnFocus?.focus({ preventScroll: true });
  publicMemoryImageReturnFocus = null;
  publicMemoryImageState = null;
}

async function setPublicMemoryLike(button) {
  const id = button.dataset.publicLike;
  if (publicLikePending.has(id)) return;
  const memory = Array.from(approvedMemoriesByPoint.values()).flat().find(item => item.id === id);
  if (!memory) return;
  const epoch = publicAccountEpoch;
  const request = Symbol(id);
  publicLikePending.set(id, request);
  button.disabled = true;
  const card = button.closest("[data-public-memory-id]");
  const status = card.querySelector("[data-like-status]");
  status.textContent = "正在保存…";
  try {
    if (!cloudReady || !cloudApp) throw new Error("云端暂未连接，请稍后重试。");
    const result = normalizeFunctionResult(await cloudApp.callFunction({ name: "setMemoryLike", data: { memoryId: id, liked: !memory.likedByMe }, parse: true }));
    if (!result?.ok || !Number.isSafeInteger(result.likeCount) || result.likeCount < 0 || typeof result.likedByMe !== "boolean") {
      throw new Error(result?.message || "点赞未完成，请重试。");
    }
    if (epoch !== publicAccountEpoch) return;
    publicReadEpoch += 1; // Discard any older list response that could undo this vote.
    [memory, ...Array.from(approvedMemoriesByPoint.values()).flat(), ...Array.from(publicArchivePlaces.values()).flatMap(place => place.memories)].filter(item => item.id === id).forEach(item => {
      item.likeCount = result.likeCount;
      item.likedByMe = result.likedByMe;
    });
    const panel = document.querySelector("#publicMemoryPanel");
    const content = panel.querySelector("#publicMemoryPanelContent");
    const visibleCards = Array.from(content.querySelectorAll("[data-public-memory-id]"));
    const currentCard = visibleCards.find(item => item.dataset.publicMemoryId === id);
    const currentButton = currentCard?.querySelector("[data-public-like]");
    if (currentButton) {
      const top = currentButton.getBoundingClientRect().top;
      const hadFocus = document.activeElement === currentButton;
      currentButton.textContent = publicLikeLabel(memory);
      currentButton.setAttribute("aria-pressed", String(memory.likedByMe));
      currentCard.querySelector("[data-like-status]").textContent = memory.likedByMe ? "已点赞" : "已取消点赞";
      const ranks = new Map(sortPublicMemories(Array.from(approvedMemoriesByPoint.values()).flat()).map((item, index) => [item.id, index]));
      const columns=content.querySelectorAll(".memory-feed-column");
      visibleCards.sort((a, b) => ranks.get(a.dataset.publicMemoryId) - ranks.get(b.dataset.publicMemoryId)).forEach((item,index) => (columns.length===2 ? columns[index%2] : currentCard.parentElement || content).appendChild(item));
      content.scrollTop += currentButton.getBoundingClientRect().top - top;
      currentButton.disabled = false;
      if (hadFocus) currentButton.focus({ preventScroll: true });
    }
  } catch (error) {
    if (epoch === publicAccountEpoch) {
      const current = Array.from(document.querySelectorAll("[data-public-like]")).find(item => item.dataset.publicLike === id);
      (current?.closest("[data-public-memory-id]").querySelector("[data-like-status]") || status).textContent = error.message || "点赞未完成，请重试。";
    }
  } finally {
    if (publicLikePending.get(id) === request) {
      publicLikePending.delete(id);
      document.querySelectorAll("[data-public-like]").forEach(item => { if (item.dataset.publicLike === id) item.disabled = false; });
    }
    button.disabled = false;
  }
}

function renderPublicArchiveCards(
  point,
  memories
) {
  return sortPublicMemories(memories)
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
                      (url, index) => `
                        <button
                          type="button"
                          class="memory-card__image-button"
                          data-public-memory-image="${escapeHtml(memory.id)}"
                          data-public-image-index="${index}"
                          aria-label="放大查看${escapeHtml(point.nameModern)}城市记忆照片，第${index + 1}张"
                        >
                          <img
                            src="${escapeHtml(url)}"
                            alt="${escapeHtml(point.nameModern)}城市记忆照片"
                            loading="lazy"
                          >
                          <span aria-hidden="true">放大查看</span>
                        </button>
                      `
                    )
                    .join("")
                }
              </div>
            `
            : "";

        const content = memoryDisplayText(memory);

        return `
          <article
            class="memory-card public-archive-card"
            data-public-memory-id="${escapeHtml(memory.id)}"
          >
${imageHtml || renderPostCover(memory, point)}
            <h3 class="memory-post-title">${escapeHtml(memory.pointName || point.nameModern)}</h3>

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


            </div>

            ${content ? `<section class="public-archive-card__text"><p>${escapeHtml(content)}</p></section>` : ""}

            <div class="public-memory-like-row">
              <button type="button" class="public-memory-like" data-public-like="${escapeHtml(memory.id)}" aria-pressed="${memory.likedByMe === true}" ${publicLikePending.has(memory.id) ? "disabled" : ""}>${publicLikeLabel(memory)}</button>
              <span data-like-status role="status" aria-live="polite"></span>
            </div>


            ${allPoints.some(item => item.id === memory.pointId) ? `<button type="button" class="public-archive-map-link" data-public-map-point="${escapeHtml(memory.pointId)}">在地图查看此地点</button>` : ""}
          </article>
        `;
      }
    )
    .join("");
}

function ensurePublicMemoryPanel() {
  if (
    document.querySelector(
      "#publicMemoryPanel"
    )
  ) {
    return;
  }

  const panel = document.createElement("div");
  panel.id = "publicMemoryPanel";

  panel.className =
    "public-memory-panel";

  panel.hidden =
    true;

  panel.innerHTML = `
    <button
      type="button"
      class="public-memory-panel__backdrop"
      data-close-public-memory
      aria-label="关闭城市公共记忆档案"
    ></button>

    <aside
      class="public-memory-panel__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publicMemoryPanelTitle"
      aria-describedby="publicMemoryPanelSummary"
    >
      <header class="public-memory-panel__head">
        <div>
          <button type="button" class="public-memory-back" data-public-back hidden>← 返回帖子</button>
          <p>PUBLIC MEMORY ARCHIVE</p>
          <h2 id="publicMemoryPanelTitle">城市公共记忆档案</h2>
          <span id="publicMemoryPanelSummary">仅展示馆员终审通过并公开的内容</span>
        </div>

        <button
          type="button"
          class="public-memory-panel__close"
          data-close-public-memory
          aria-label="关闭城市公共记忆档案"
        >
          <span class="public-memory-close-icon" aria-hidden="true">×</span>
          <span class="public-memory-close-label">关闭</span>
        </button>
        <div class="public-feed-controls">
          <label>地点<select id="publicFeedPlace" aria-label="选择公众记忆地点"><option value="">全部地点</option></select></label>
          <button type="button" class="btn primary" data-feed-contribute>＋ 留下记忆</button>
        </div>
      </header>

      <div
        class="public-memory-panel__content"
        id="publicMemoryPanelContent"
      ></div>

      <section
        class="public-memory-image-viewer"
        id="publicMemoryImageViewer"
        hidden
        aria-hidden="true"
      >
        <button type="button" class="public-memory-image-viewer__backdrop" data-close-public-memory-image aria-label="关闭大图"></button>
        <div class="public-memory-image-viewer__surface" role="dialog" aria-modal="true" aria-labelledby="publicMemoryImageTitle">
          <header>
            <div>
              <small>PUBLIC MEMORY IMAGE</small>
              <strong id="publicMemoryImageTitle">城市记忆照片</strong>
            </div>
            <button type="button" data-close-public-memory-image aria-label="关闭大图">×</button>
          </header>
          <div class="public-memory-image-viewer__stage">
            <img id="publicMemoryImageFull" alt="">
          </div>
          <footer>
            <div class="public-memory-image-viewer__nav">
              <button type="button" data-public-image-previous>← 上一张</button>
              <span id="publicMemoryImageCounter" aria-live="polite">1 / 1</span>
              <button type="button" data-public-image-next>下一张 →</button>
            </div>
          </footer>
        </div>
      </section>
    </aside>
  `;

  document.body
    .appendChild(
      panel
    );

  panel.addEventListener("click", event => {
    const imageButton = event.target.closest("[data-public-memory-image]");
    if (imageButton) { openPublicMemoryImageViewer(imageButton); return; }
    if (event.target.closest("[data-close-public-memory-image]")) { closePublicMemoryImageViewer(); return; }
    if (event.target.closest("[data-public-image-previous]")) {
      publicMemoryImageState.index -= 1;
      renderPublicMemoryImageViewer();
      return;
    }
    if (event.target.closest("[data-public-image-next]")) {
      publicMemoryImageState.index += 1;
      renderPublicMemoryImageViewer();
      return;
    }
    const likeButton = event.target.closest("[data-public-like]");
    if (likeButton) { void setPublicMemoryLike(likeButton); return; }
    const postButton = event.target.closest("[data-public-post]");
    if (postButton) { showPublicMemoryPost(postButton.dataset.publicPost); return; }
    if (event.target.closest("[data-feed-contribute]")) {
      const point = publicArchivePlaces.get(publicArchiveSelectedPlace)?.point;
      closePublicMemoryPanel(); void openContributionModal(point?.id ? point : null); return;
    }
    const placeButton = event.target.closest("[data-public-place]");
    if (placeButton) {
      publicArchivePlaceScroll = panel.querySelector("#publicMemoryPanelContent").scrollTop;
      showPublicMemoryPlace(placeButton.dataset.publicPlace);
      return;
    }
    if (event.target.closest("[data-public-back]")) {
      renderPublicFeed(publicArchiveSelectedPlace, true);
      return;
    }
    const button = event.target.closest("[data-public-map-point]");
    const point = allPoints.find(item => item.id === button?.dataset.publicMapPoint);
    if (!point) return;
    closePublicMemoryPanel();
    setMapHubMode("explore");
    focusMapPoint(point);
    renderDetail(point);
    const marker = Array.from(document.querySelectorAll(".map-marker")).find(item => item.dataset.pointId === point.id);
    document.querySelector("#mapCanvas").scrollIntoView({ block: "center", behavior: "smooth" });
    marker?.focus({ preventScroll: true });
  });
  panel.addEventListener("keydown", event => {
    const viewer = panel.querySelector("#publicMemoryImageViewer");
    if (!viewer.hidden && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePublicMemoryImageViewer();
      return;
    }
    if (!viewer.hidden && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = publicMemoryImageState.index + direction;
      if (nextIndex >= 0 && nextIndex < publicMemoryImageState.urls.length) {
        event.preventDefault();
        publicMemoryImageState.index = nextIndex;
        renderPublicMemoryImageViewer();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusRoot = viewer.hidden ? panel.querySelector(".public-memory-panel__dialog") : viewer;
    const items = Array.from(focusRoot.querySelectorAll("button:not([disabled]), a[href], select")).filter(item => item.getClientRects().length);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  panel.querySelector("#publicFeedPlace").addEventListener("change", event => renderPublicFeed(event.target.value));
  panel
    .querySelectorAll(
      "[data-close-public-memory]"
    )
    .forEach(
      (element) => {
        element
          .addEventListener(
            "click",
            closePublicMemoryPanel
          );
      }
    );
}

function collectPublicMemoryPlaces() {
  const places = new Map();
  Array.from(approvedMemoriesByPoint.values()).flat().forEach(memory => {
    const key = memory.pointId ? `id:${memory.pointId}` : `name:${memory.pointName || "地点未注明"}`;
    if (!places.has(key)) {
      const point = allPoints.find(item => item.id === memory.pointId) || { nameModern: memory.pointName || "地点未注明" };
      places.set(key, { key, point, name: pointPickerName(point), memories: [] });
    }
    places.get(key).memories.push(memory);
  });
  return places;
}

function publicMemoryWarning() {
  return publicMemoriesError ? `<p role="status">${escapeHtml(publicMemoriesError)}${publicMemoriesLoaded ? " 以下为上次成功读取的内容。" : ""}</p>` : "";
}

// Public API content is authoritative; private records show only the version adopted by their owner.
function memoryDisplayText(memory) {
  if (typeof memory.publicContent === "string" && memory.publicContent.trim()) return memory.publicContent.trim();
  const adopted = memory.collaborativeDraftAccepted === true || memory.contentSource === "collaborativeDraft";
  return String((adopted && memory.collaborativeDraft?.trim()) || memory.originalContent || "").trim();
}

// Cover contains a bounded excerpt; the post keeps its complete text for reading and accessibility.
// Approximate glyph widths avoid a font/canvas dependency; fixed CJK typography fits 10 lines.
function memoryTextCover(text, place = "成都") {
  const characters = Array.from(String(text || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim());
  const lines=[]; let line="", width=0, index=0;
  for (; index<characters.length; index++) {
    const char=characters[index], size=/[\x20-\x7e]/.test(char) ? .62 : 1;
    if(char==="\n" || width+size>14) {
      lines.push(line); line=""; width=0;
      if(lines.length===10)break;
      if(char==="\n")continue;
    }
    line+=char; width+=size;
  }
  if(line && lines.length<10)lines.push(line);
  const truncated=index<characters.length;
  if(truncated)lines[9]=Array.from(lines[9]).slice(0,-1).join("")+"…";
  const heading=Array.from(place).slice(0,18).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#f4eddf"/><path d="M54 118H586" stroke="#b9ab90"/><text x="54" y="82" fill="#58705b" font-size="25" font-family="sans-serif">${escapeHtml(heading)}</text><g fill="#302e27" font-size="36" font-family="PingFang SC,Microsoft YaHei,sans-serif">${lines.map((value,i)=>`<text x="54" y="${183+i*51}">${escapeHtml(value)}</text>`).join("")}</g><text x="54" y="756" fill="#87795e" font-size="20" font-family="sans-serif">${truncated ? "点开阅读完整记忆 →" : "舆上·成都 · 城市记忆"}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg).replace(/%E2%86%92/g, "");
}

function renderPostCover(memory, point = {}) {
  const actual=memory.imageUrls?.[0], content=memoryDisplayText(memory);
  const place=memory.pointName || point.nameModern || "成都";
  // A temporarily unavailable uploaded photo must not be mistaken for a text-only contribution.
  const textOnly=!actual && !(memory.imageFileIds?.length || Number(memory.imageCount)) && Boolean(content);
  const image=actual || (textOnly ? memoryTextCover(content,place) : `./${point.oldImage || "chengdu-map-original.jpg"}`);
  const label=actual || textOnly ? "" : "古图配图";
  return `<div class="memory-post-cover${textOnly ? " is-text-cover" : actual ? "" : " is-illustration"}"><img src="${escapeHtml(image)}" alt="${escapeHtml(place)}${textOnly ? "文字封面" : label || "记忆照片"}" loading="lazy">${label ? `<span>${label}</span>` : ""}</div>`;
}

function renderPublicPostCards(memories) {
  const cards = sortPublicMemories(memories).map(memory => {
    const point = allPoints.find(p => p.id === memory.pointId) || {};
    const text = memoryDisplayText(memory) || "一份关于这里的影像记忆";
    return `<article class="memory-post" data-public-memory-id="${escapeHtml(memory.id)}">
      <button type="button" class="memory-post-open" data-public-post="${escapeHtml(memory.id)}" aria-label="阅读${escapeHtml(memory.pointName || "成都")}的记忆：${escapeHtml(text.slice(0,36))}">
        ${renderPostCover(memory, point)}<div class="memory-post-copy"><h3>${escapeHtml(text.slice(0,56))}${text.length>56 ? "…" : ""}</h3><span>${escapeHtml(memory.pointName || point.nameModern || "成都")}</span></div>
      </button>
      <div class="public-memory-like-row"><small>${escapeHtml(memory.approximateTime || "城市记忆")}</small><button type="button" class="public-memory-like" data-public-like="${escapeHtml(memory.id)}" aria-pressed="${memory.likedByMe === true}" ${publicLikePending.has(memory.id) ? "disabled" : ""}>${publicLikeLabel(memory)}</button><span data-like-status role="status" aria-live="polite"></span></div>
    </article>`;
  });
  return `<div class="memory-feed-grid">${[0,1].map(column=>`<div class="memory-feed-column">${cards.filter((card,index)=>index%2===column).join("")}</div>`).join("")}</div>`;
}

function renderPublicFeed(key = "", restorePosition = false) {
  const panel = document.querySelector("#publicMemoryPanel"), content = panel.querySelector("#publicMemoryPanelContent");
  publicArchiveSelectedPlace = publicArchivePlaces.has(key) ? key : "";
  const place = publicArchivePlaces.get(publicArchiveSelectedPlace);
  const memories = place ? place.memories : Array.from(approvedMemoriesByPoint.values()).flat();
  panel.querySelector("#publicMemoryPanelTitle").textContent = place ? `${place.name} · 公众记忆` : "公众记忆";
  panel.querySelector("#publicMemoryPanelSummary").textContent = `${memories.length} 份公开记忆 · 按点赞数排序`;
  panel.querySelector("[data-public-back]").hidden = true;
  panel.querySelector(".public-feed-controls").hidden = false;
  const picker = panel.querySelector("#publicFeedPlace");
  picker.innerHTML = '<option value="">全部地点</option>' + Array.from(publicArchivePlaces.values()).map(p=>`<option value="${escapeHtml(p.key)}">${escapeHtml(p.name)} · ${p.memories.length}</option>`).join("");
  picker.value = publicArchiveSelectedPlace;
  content.innerHTML = publicMemoryWarning() + (memories.length ? renderPublicPostCards(memories) : '<p role="status">这里还没有公开记忆，欢迎留下第一份故事。</p>');
  content.scrollTop = restorePosition ? publicArchivePlaceScroll : 0;
  if (restorePosition) (Array.from(content.querySelectorAll("[data-public-post]")).find(b=>b.dataset.publicPost===publicArchiveSelectedPost) || panel.querySelector(".public-memory-panel__close")).focus({preventScroll:true});
}
let publicArchiveSelectedPost = "";
function renderPublicMemoryPlaces(restorePosition = false) { renderPublicFeed("", restorePosition); }
function showPublicMemoryPlace(key) { renderPublicFeed(key); }
function showPublicMemoryPost(id) {
  const memory = findPublicMemory(id); if (!memory) return;
  const panel = document.querySelector("#publicMemoryPanel"), content = panel.querySelector("#publicMemoryPanelContent");
  publicArchivePlaceScroll = content.scrollTop; publicArchiveSelectedPost = id;
  panel.querySelector(".public-feed-controls").hidden = true;
  const back = panel.querySelector("[data-public-back]"); back.hidden = false;
  panel.querySelector("#publicMemoryPanelTitle").textContent = memory.pointName || "城市记忆";
  panel.querySelector("#publicMemoryPanelSummary").textContent = "一段真实经历，一份成都记忆";
  content.innerHTML = renderPublicArchiveCards(allPoints.find(p=>p.id===memory.pointId) || {nameModern:memory.pointName}, [memory]);
  content.scrollTop = 0; back.focus();
}


async function openPublicMemoryPanel(point, trigger) {
  ensurePublicMemoryPanel();
  const token = ++publicArchiveViewToken;
  const panel = document.querySelector("#publicMemoryPanel");
  const content = panel.querySelector("#publicMemoryPanelContent");
  publicArchiveReturnFocus = trigger || null;
  publicArchivePlaceScroll = 0;
  publicArchiveSelectedPlace = "";
  panel.querySelector("#publicMemoryPanelTitle").textContent = "公众记忆";
  panel.querySelector("#publicMemoryPanelSummary").textContent = "仅展示馆员终审通过并公开的内容";
  panel.querySelector("[data-public-back]").hidden = true;
  panel.querySelector(".public-feed-controls").hidden = false;
  content.innerHTML = "<p>正在读取公开记忆…</p>";
  content.scrollTop = 0;
  panel.hidden = false;
  document.body.classList.add("modal-open");
  panel.querySelector(".public-memory-panel__close").focus();
  if (await loadApprovedMemories() && allPoints.length) renderMarkers(allPoints);
  if (token !== publicArchiveViewToken || panel.hidden) return;
  publicArchivePlaces = collectPublicMemoryPlaces();
  if (point && publicArchivePlaces.has(`id:${point.id}`)) showPublicMemoryPlace(`id:${point.id}`);
  else renderPublicMemoryPlaces();
}

function closePublicMemoryPanel() {
  publicArchiveViewToken += 1;
  const panel =
    document.querySelector(
      "#publicMemoryPanel"
    );

  if (
    !panel ||
    panel.hidden
  ) {
    return;
  }

  closePublicMemoryImageViewer({ restoreFocus: false });

  panel.hidden =
    true;

  document.body
    .classList
    .remove(
      "modal-open"
    );

  publicArchiveReturnFocus
    ?.focus();

  publicArchiveReturnFocus =
    null;
}

function renderMemorySection(point) {
  const count = getPointMemories(point.id).length;
  return `<button type="button" class="detail-memory-link" data-open-public-archive aria-haspopup="dialog">公众记忆 <strong>${count}</strong><span>查看大家的照片与故事</span></button>`;
}

/* ===============================================
   点位详情
   =============================================== */

function pointSelectOptions(placeholder = "请选择地点") {
  const labels=["存续点","变迁点","待考点","新增点"];
  return `<option value="">${escapeHtml(placeholder)}</option>` + labels.map(label=>`<optgroup label="${label}">${allPoints.filter(p=>getStatusLabel(p)===label).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(pointPickerName(p))}</option>`).join("")}</optgroup>`).join("");
}

function renderDetail(point, shouldScroll = false) {
  if (!detailEl) return;
  const knowledge = CORE_POINT_KNOWLEDGE[point.id];
  const meta = `<div class="meta-grid">${renderOptionalRow("点位类型", point.type)}${renderOptionalRow("点位状态", getStatusLabel(point))}${renderOptionalRow("古图标注", point.nameAncient)}${renderOptionalRow("今日名称", point.nameModern)}</div>`;
  const timeline = knowledge?.timeline?.length ? `<details class="detail-facts"><summary>时间变化</summary><ol class="detail-timeline">${knowledge.timeline.map(([period, content]) => `<li><time>${escapeHtml(period)}</time><p>${escapeHtml(content)}</p></li>`).join("")}</ol></details>` : "";
  const caution = knowledge?.caution || point.note;
  detailEl.innerHTML = `<article class="point-card point-card--compact">
    <span class="type-pill">官方点位介绍</span><h3>${escapeHtml(point.nameModern || point.nameAncient)}</h3>
    <label class="detail-point-select">切换点位<select id="detailPointSelect" aria-label="选择点位查看介绍">${pointSelectOptions()}</select></label>
    <details class="detail-facts"><summary>地点信息</summary>${meta}</details>${timeline}
    ${renderPointMedia(point)}
    <section class="official-intro"><h4>历史导读</h4>${renderParagraphs(point.extended || point.quick || "基础历史资料正在整理中，欢迎留下与此地有关的真实记忆。")}</section>
    ${caution ? `<p class="detail-caution"><strong>资料说明</strong>${escapeHtml(caution)}</p>` : ""}
    <button type="button" class="memory-btn" data-memory-button>留下我的城市记忆</button>
    ${renderMemorySection(point)}
  </article>`;
  const pointSelect=detailEl.querySelector("#detailPointSelect");pointSelect.value=point.id;
  pointSelect.onchange=event=>{const selected=allPoints.find(p=>p.id===event.target.value);if(!selected)return;focusMapPoint(selected);renderDetail(selected);detailEl.querySelector("#detailPointSelect").focus({preventScroll:true});};
  detailEl.querySelector("[data-memory-button]").onclick = () => openContributionModal(point);
  const archive = detailEl.querySelector("[data-open-public-archive]");
  archive.onclick = () => openPublicMemoryPanel(point, archive);
  if (shouldScroll) {
    const panel = detailEl.closest(".detail-panel") || detailEl, rect = panel.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0 || rect.left >= window.innerWidth) panel.scrollIntoView({behavior:"smooth",block:"start"});
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

        button.dataset.publicMemoryLabel =
          `已有${memoryCount}份成都记忆在这里公开`;

        button.setAttribute(
          "aria-label",
          `${
            point.nameModern ||
            point.nameAncient ||
            "历史点位"
          }，${button.dataset.publicMemoryLabel}`
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
            ? `｜已有${memoryCount}份成都记忆在这里公开`
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

  renderPointPicker();
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
   三场景体验：项目抽屉 / 全屏 Citywalk
   =============================================== */

let activeWalkStopIndex = 0;
let lastSceneTrigger = null;
let lastEvidenceTrigger = null;
let lastWorkflowTrigger = null;

function syncSceneOverlayBody() {
  const hasOpenOverlay =
    Boolean(
      document.querySelector(
        ".project-drawer.is-open, .ai-workflow-drawer.is-open, .evidence-viewer.is-open, .walk-scene.is-open"
      )
    );

  document.body.classList.toggle(
    "scene-overlay-open",
    hasOpenOverlay
  );
}

function getEvidenceStatusLabel(record) {
  const labels = {
    visually_verified: "原页目视核验",
    text_layer_verified: "文字层与原页复核",
    project_note: "项目核验记录"
  };

  return (
    labels[record.verificationCode] ||
    record.verification ||
    "待复核"
  );
}

function renderEvidenceViewer(record) {
  const content =
    document.querySelector(
      "#evidenceViewerContent"
    );

  if (!content) {
    return;
  }

  const pages =
    Array.isArray(record.pages)
      ? record.pages
      : [];

  const isPublicDomain =
    record.sourceType === "public-domain";
  const isInCopyright =
    record.sourceType === "in-copyright";

  const sourcePresentation = isPublicDomain && pages.length
    ? `
      <section class="evidence-scan-section">
        <div class="evidence-viewer__section-head">
          <div>
            <span>SCAN</span>
            <h3>扫描原页</h3>
          </div>
          <small>点击图片可单独查看清晰原页</small>
        </div>
        <div class="evidence-page-grid ${pages.length > 1 ? "has-multiple-pages" : ""}">
          ${pages.map((page) => `
            <figure class="evidence-page">
              <a href="${escapeHtml(page.src)}" target="_blank" rel="noopener">
                <img src="${escapeHtml(page.src)}" alt="${escapeHtml(record.title)} PDF第${Number(page.page)}页扫描原页" loading="eager">
              </a>
              <figcaption>PDF第${Number(page.page)}页${record.originalPage && page.page === record.pageStart ? ` · 原书第${escapeHtml(record.originalPage)}页` : ""}</figcaption>
            </figure>
          `).join("")}
        </div>
      </section>
    `
    : isInCopyright
      ? `
      <section class="evidence-citation-section" aria-label="引用式证据">
        <div class="evidence-viewer__section-head">
          <div>
            <span>CITATION EVIDENCE</span>
            <h3>引用式证据卡</h3>
          </div>
          <small>书目信息 · 页码定位 · 内容转述</small>
        </div>
        <div class="evidence-citation-statement">
          <span>内容转述</span>
          <p>${escapeHtml(record.proves || "待进一步核验。")}</p>
        </div>
        <p class="evidence-copyright-notice">本条依据当代出版物，依合理引用原则仅标注出处与要点转述，不展示原书影像。</p>
      </section>
    `
      : `
      <section class="evidence-note-preview">
        <img src="./chengdu-map-original.jpg" alt="馆藏成都府图" loading="eager">
        <div>
          <span>RESEARCH NOTE</span>
          <strong>此条为项目核验记录</strong>
          <p>${escapeHtml(record.note || "此记录用于标明证据边界，不冒充原书页证据。")}</p>
        </div>
      </section>
    `;

  const originalExcerpt = isPublicDomain
    ? `
      <section class="evidence-excerpt">
        <span>对应原文 · 已定位</span>
        <blockquote><mark>${escapeHtml(record.excerpt || "原文片段待补录")}</mark></blockquote>
        <p>高亮文本为知识库节录；判断时仍以同屏原页和上下文为准。</p>
      </section>
    `
    : "";

  const sourceTypeLabel = isPublicDomain
    ? "公版文献 · 可查看原页"
    : isInCopyright
      ? "当代出版物 · 合理引用"
      : "项目研究记录";

  content.innerHTML = `
    <article class="evidence-record">
      <header class="evidence-record__title">
        <div>
          <span>证据 ${escapeHtml(record.grade || "C")}</span>
          <h3>${escapeHtml(record.title)}</h3>
          <p>${escapeHtml(record.pageLabel || "项目记录")}</p>
        </div>
        <strong>${escapeHtml(getEvidenceStatusLabel(record))}</strong>
      </header>

      <dl class="evidence-bibliography">
        <div><dt>书名</dt><dd>${escapeHtml(record.title)}</dd></div>
        <div><dt>作者</dt><dd>${escapeHtml(record.author || "待补录")}</dd></div>
        <div><dt>出版社</dt><dd>${escapeHtml(record.publisher || "项目自建资料")}</dd></div>
        <div><dt>出版年</dt><dd>${escapeHtml(record.publicationYear || "未标注")}</dd></div>
        <div><dt>版次</dt><dd>${escapeHtml(record.editionStatement || record.edition || "待补录")}</dd></div>
        <div><dt>页码</dt><dd>${escapeHtml(record.pageLabel || "无PDF页码")}</dd></div>
        <div><dt>证据等级</dt><dd><span class="evidence-grade evidence-grade--${escapeHtml(String(record.grade || "C").toLowerCase())}">${escapeHtml(record.grade || "C")}</span></dd></div>
        <div><dt>核验状态</dt><dd>${escapeHtml(getEvidenceStatusLabel(record))}</dd></div>
        <div><dt>呈现方式</dt><dd>${escapeHtml(sourceTypeLabel)}</dd></div>
      </dl>

      ${sourcePresentation}

      ${originalExcerpt}

      <div class="evidence-boundary-grid">
        <section>
          <span>CAN PROVE</span>
          <h3>此材料能证明什么</h3>
          <p>${escapeHtml(record.proves || "待进一步核验。")}</p>
        </section>
        <section>
          <span>CANNOT PROVE</span>
          <h3>此材料不能证明什么</h3>
          <p>${escapeHtml(record.limits || "不得超出原文证据范围作结论。")}</p>
        </section>
      </div>
    </article>
  `;
}

function setEvidenceViewer(open, evidenceId = "") {
  const viewer =
    document.querySelector(
      "#evidenceViewer"
    );

  if (!viewer) {
    return;
  }

  if (open) {
    const record =
      window.TUHUI_EVIDENCE
        ?.byId?.[evidenceId];

    if (!record) {
      return;
    }

    renderEvidenceViewer(record);
    const title = viewer.querySelector("#evidenceViewerTitle");
    if (title) {
      title.textContent =
        record.sourceType === "in-copyright"
          ? "引用式证据卡"
          : record.sourceType === "public-domain"
            ? "文献原页"
            : "核验记录";
    }
    viewer.hidden = false;
    viewer.setAttribute(
      "aria-hidden",
      "false"
    );
    requestAnimationFrame(() => {
      viewer.classList.add(
        "is-open"
      );
      syncSceneOverlayBody();
    });
    viewer.querySelector(
      "[data-close-evidence-viewer]"
    )?.focus();
  } else {
    viewer.classList.remove(
      "is-open"
    );
    viewer.setAttribute(
      "aria-hidden",
      "true"
    );
    window.setTimeout(() => {
      viewer.hidden = true;
      syncSceneOverlayBody();
    }, 300);
    lastEvidenceTrigger?.focus?.();
  }
}

function setAiWorkflowDrawer(open) {
  const drawer =
    document.querySelector(
      "#aiWorkflowDrawer"
    );

  if (!drawer) {
    return;
  }

  if (open) {
    drawer.hidden = false;
    drawer.setAttribute(
      "aria-hidden",
      "false"
    );
    requestAnimationFrame(() => {
      drawer.classList.add(
        "is-open"
      );
      syncSceneOverlayBody();
    });
    drawer.querySelector(
      "[data-close-ai-workflow]"
    )?.focus();
  } else {
    drawer.classList.remove(
      "is-open"
    );
    drawer.setAttribute(
      "aria-hidden",
      "true"
    );
    window.setTimeout(() => {
      drawer.hidden = true;
      syncSceneOverlayBody();
    }, 300);
    lastWorkflowTrigger?.focus?.();
  }
}

function getCitywalkPoints() {
  const pointMap =
    new Map(
      allPoints.map(
        (point) => [
          point.id,
          point
        ]
      )
    );

  return citywalkOrder
    .map((id) => pointMap.get(id))
    .filter(Boolean);
}

function renderProjectDrawerContent() {
  const target =
    document.querySelector(
      "#projectDrawerContent"
    );

  if (!target || target.childElementCount) {
    return;
  }

  const archive =
    document.querySelector(
      "#archive"
    );

  const about =
    document.querySelector(
      "#about"
    );

  const appendCleanClone = (source) => {
    const clone = source.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("aria-labelledby");
    clone
      .querySelectorAll("[id]")
      .forEach((element) =>
        element.removeAttribute("id")
      );
    target.appendChild(clone);
  };

  if (archive) {
    appendCleanClone(archive);
  }

  if (about) {
    appendCleanClone(about);
  }

  updateArchiveMetrics();
}

function setProjectDrawer(open) {
  const drawer =
    document.querySelector(
      "#projectDrawer"
    );

  if (!drawer) {
    return;
  }

  if (open) {
    renderProjectDrawerContent();
    drawer.hidden = false;
    drawer.setAttribute(
      "aria-hidden",
      "false"
    );
    document.body.classList.add(
      "scene-overlay-open"
    );
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
    });
    drawer
      .querySelector(
        "[data-close-project]"
      )
      ?.focus();
  } else {
    drawer.classList.remove("is-open");
    drawer.setAttribute(
      "aria-hidden",
      "true"
    );
    window.setTimeout(() => {
      drawer.hidden = true;
    }, 300);

    if (
      document
        .querySelector("#walkScene")
        ?.hidden
    ) {
      document.body.classList.remove(
        "scene-overlay-open"
      );
    }

    lastSceneTrigger?.focus?.();
  }
}

function renderWalkScene() {
  const points =
    getCitywalkPoints();

  if (!points.length) {
    return;
  }

  activeWalkStopIndex =
    Math.max(
      0,
      Math.min(
        activeWalkStopIndex,
        points.length - 1
      )
    );

  const point =
    points[activeWalkStopIndex];

  const routePoints =
    points
      .map(
        (item) =>
          `${Number(item.x)},${Number(item.y)}`
      )
      .join(" ");

  const progressPoints =
    points
      .slice(
        0,
        activeWalkStopIndex + 1
      )
      .map(
        (item) =>
          `${Number(item.x)},${Number(item.y)}`
      )
      .join(" ");

  const base =
    document.querySelector(
      "#walkRouteBase"
    );

  const progress =
    document.querySelector(
      "#walkRouteProgress"
    );

  if (base) {
    base.setAttribute(
      "points",
      routePoints
    );
  }

  if (progress) {
    progress.setAttribute(
      "points",
      progressPoints
    );
  }

  const markers =
    document.querySelector(
      "#walkRouteMarkers"
    );

  if (markers) {
    markers.innerHTML =
      points.map(
        (item, index) => `
          <button
            type="button"
            class="walk-route-marker ${
              index < activeWalkStopIndex
                ? "is-visited"
                : index === activeWalkStopIndex
                  ? "is-active"
                  : ""
            }"
            style="left:${Number(item.x)}%;top:${Number(item.y)}%"
            data-walk-stop="${index}"
            aria-label="第${index + 1}站：${escapeHtml(item.nameModern)}"
          >
            <span>${String(index + 1).padStart(2, "0")}</span>
          </button>
        `
      ).join("");
  }

  const card =
    document.querySelector(
      "#walkStopCard"
    );

  const facts =
    document.querySelector(
      "#walkStopFacts"
    );

  const knowledge =
    CORE_POINT_KNOWLEDGE[
      point.id
    ];

  const memories =
    getPointMemories(
      point.id
    );

  if (card) {
    card.querySelector(
      ".walk-stop-card__eyebrow"
    ).textContent =
      `CITYWALK · ${String(activeWalkStopIndex + 1).padStart(2, "0")} / ${String(points.length).padStart(2, "0")}`;

    card.querySelector("h2")
      .textContent =
        point.nameModern;
  }

  const progressLabel = document.querySelector("#walkProgressLabel");
  if (progressLabel) {
    progressLabel.textContent = `第 ${activeWalkStopIndex + 1} / ${points.length} 站 · ${point.nameModern}`;
  }

  if (facts) {
    facts.innerHTML = `
      <section>
        <small>古图怎么画</small>
        <strong>${escapeHtml(point.nameAncient || "待考")}</strong>
        <p>古图中的${escapeHtml(point.type || "城市点位")}，证据等级 ${escapeHtml(knowledge?.grade || "C")}。</p>
      </section>
      <section>
        <small>今天在哪里</small>
        <strong>${escapeHtml(point.nameModern || point.nameAncient)}</strong>
        <p>${escapeHtml(point.quick || point.routeNote || "古今关系仍待进一步核查。")}</p>
      </section>
      <section>
        <small>到现场看什么</small>
        <p>${escapeHtml(point.routeNote || "观察地名、道路与城市空间的延续和变化。")}</p>
      </section>
      <section class="walk-memory-fact ${memories.length ? "has-memory" : ""}">
        <small>有没有人留下记忆</small>
        <strong>${memories.length} 条公开记忆</strong>
        <button type="button" data-walk-memory>在古图留下我的记忆 →</button>
      </section>
    `;
  }

  const previous =
    document.querySelector(
      "#walkPrevious"
    );

  const next =
    document.querySelector(
      "#walkNext"
    );

  if (previous) {
    previous.disabled =
      activeWalkStopIndex === 0;
  }

  if (next) {
    next.textContent =
      activeWalkStopIndex ===
        points.length - 1
        ? "完成路线"
        : "下一站 →";
  }

  const walkMap =
    document.querySelector(
      "#walkMap"
    );

  if (walkMap) {
    walkMap.style.setProperty(
      "--walk-focus-x",
      `${Number(point.x)}%`
    );
    walkMap.style.setProperty(
      "--walk-focus-y",
      `${Number(point.y)}%`
    );
  }


  const layout = document.querySelector(".walk-scene__layout");
  if (layout?.scrollTop) layout.scrollTo({ top: 0, behavior: "smooth" });
}

function changeWalkStop(direction) {
  const points = getCitywalkPoints();
  const nextIndex = activeWalkStopIndex + direction;
  if (nextIndex < 0) return;
  if (nextIndex >= points.length) {
    setWalkScene(false);
    return;
  }
  activeWalkStopIndex = nextIndex;
  renderWalkScene();
}

function setWalkScene(open) {
  const scene =
    document.querySelector(
      "#walkScene"
    );

  if (!scene) {
    return;
  }

  if (open) {
    activeWalkStopIndex = 0;
    renderWalkScene();
    scene.hidden = false;
    scene.setAttribute(
      "aria-hidden",
      "false"
    );
    document.body.classList.add(
      "scene-overlay-open"
    );
    requestAnimationFrame(() => {
      scene.classList.add("is-open");
    });
  } else {
    scene.classList.remove("is-open");
    scene.setAttribute(
      "aria-hidden",
      "true"
    );
    window.setTimeout(() => {
      scene.hidden = true;
    }, 360);
    document.body.classList.remove(
      "scene-overlay-open"
    );
    document
      .querySelector("#map")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }
}

function bindSceneExperience() {
  document.addEventListener(
    "click",
    (event) => {
      const evidenceButton =
        event.target.closest(
          "[data-open-evidence]"
        );

      if (evidenceButton) {
        lastEvidenceTrigger =
          evidenceButton;
        setEvidenceViewer(
          true,
          evidenceButton.dataset
            .openEvidence
        );
        return;
      }

      const workflowButton =
        event.target.closest(
          "[data-open-ai-workflow]"
        );

      if (workflowButton) {
        lastWorkflowTrigger =
          workflowButton;
        setAiWorkflowDrawer(true);
      }
    }
  );

  document
    .querySelectorAll(
      "[data-close-evidence-viewer]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => setEvidenceViewer(false)
      );
    });

  document
    .querySelectorAll(
      "[data-close-ai-workflow]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => setAiWorkflowDrawer(false)
      );
    });

  document
    .querySelectorAll(
      "[data-open-project]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          lastSceneTrigger = button;
          setProjectDrawer(true);
        }
      );
    });

  document
    .querySelectorAll(
      "[data-close-project]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => setProjectDrawer(false)
      );
    });

  document
    .querySelectorAll(
      "[data-open-citywalk]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          lastSceneTrigger = button;
          setWalkScene(true);
        }
      );
    });

  document
    .querySelector(
      "[data-close-citywalk]"
    )
    ?.addEventListener(
      "click",
      () => setWalkScene(false)
    );

  document
    .querySelector(
      "#walkPrevious"
    )
    ?.addEventListener(
      "click",
      () => changeWalkStop(-1)
    );

  document
    .querySelector(
      "#walkNext"
    )
    ?.addEventListener(
      "click",
      () => changeWalkStop(1)
    );

  document
    .querySelector(
      "#walkRouteMarkers"
    )
    ?.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-walk-stop]"
          );

        if (!button) {
          return;
        }

        activeWalkStopIndex =
          Number(
            button.dataset.walkStop
          ) || 0;
        renderWalkScene();
      }
    );

  document
    .querySelector(
      "#walkStopFacts"
    )
    ?.addEventListener(
      "click",
      (event) => {
        if (
          !event.target.closest(
            "[data-walk-memory]"
          )
        ) {
          return;
        }

        const point =
          getCitywalkPoints()[
            activeWalkStopIndex
          ];

        if (!point) {
          return;
        }

        setWalkScene(false);
        setMapHubMode("memory");
        focusMapPoint(point);
        window.setTimeout(
          () => openContributionModal(point),
          380
        );
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      const walkScene = document.querySelector("#walkScene");
      const walkSceneBlocked = ["#publicMemoryPanel", "#evidenceViewer", "#aiWorkflowDrawer", "#projectDrawer"]
        .some(selector => document.querySelector(selector)?.hidden === false);
      if (!walkScene?.hidden && !walkSceneBlocked && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        changeWalkStop(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key !== "Escape") {
        return;
      }

      if (
        !document
          .querySelector(
            "#publicMemoryPanel"
          )
          ?.hidden
      ) {
        closePublicMemoryPanel();
      } else if (
        !document
          .querySelector(
            "#evidenceViewer"
          )
          ?.hidden
      ) {
        setEvidenceViewer(false);
      } else if (
        !document
          .querySelector(
            "#aiWorkflowDrawer"
          )
          ?.hidden
      ) {
        setAiWorkflowDrawer(false);
      } else if (
        !document
          .querySelector(
            "#projectDrawer"
          )
          ?.hidden
      ) {
        setProjectDrawer(false);
      } else if (
        !document
          .querySelector(
            "#walkScene"
          )
          ?.hidden
      ) {
        setWalkScene(false);
      }
    }
  );
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
  return WRITING_STYLES.map(style => `<button type="button" class="writing-style-card${style.id === "original" ? " is-selected" : ""}" data-writing-style="${escapeHtml(style.id)}" aria-pressed="${style.id === "original"}">${escapeHtml(style.name)}</button>`).join("");
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

  const originalContent =
    modal
      ?.querySelector(
        "#contributionContent"
      )
      ?.value
      ?.trim() ||
    "";

  if (
    selectedWritingStyle !==
      "original" &&
    originalContent.length >= 10
  ) {
    handleMemoryRewrite();
  }
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
  saveContributionDraft();
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

  const submitButton =
    modal.querySelector(
      "#contributionSubmit"
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

  if (submitButton) {
    submitButton.disabled =
      loading;
  }

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
  window.clearTimeout(
    rewriteAutoTimer
  );

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
    simaxiangru:
      "地点铺陈 · 行程秩序 · 雅正节奏",
    sushi:
      "清简措辞 · 日常语气 · 从容节奏",
    dufu:
      "时间线索 · 沉静措辞 · 深情克制",
    xuetao:
      "细节提炼 · 清丽语气 · 含蓄节奏",
    childvoice:
      "短句整理 · 直白口吻 · 小小发现",
    lijieren:
      "街巷口语 · 市井措辞 · 叙事节奏",
    alai:
      "地方经验 · 时间递进 · 平静叙述",
    guomoruo:
      "历史联结 · 书面措辞 · 抒情节奏"
  };

  return notes[styleId] ||
    notes.original;
}

function frameMemoryByWritingStyle(
  text,
  styleId,
  pointName
) {
  if (styleId === "original") {
    return normalizeMemoryPunctuation(
      text
    );
  }

  const place =
    String(pointName || "这里")
      .trim() ||
    "这里";

  const sentenceBodies =
    splitMemorySentences(text)
      .map(
        (sentence) =>
          sentence
            .replace(
              /[。！？!?；;]+$/g,
              ""
            )
            .trim()
      )
      .filter(Boolean);

  if (!sentenceBodies.length) {
    return normalizeMemoryPunctuation(
      text
    );
  }

  const profiles = {
    simaxiangru: {
      opening:
        `循着这段行程回望，${place}便从记忆中铺展开来：`,
      separator:
        "；"
    },
    dufu: {
      opening:
        `旧地重提，至今记得${place}。`,
      separator:
        "。"
    },
    xuetao: {
      opening:
        `关于${place}，那些细小的片段至今清楚：`,
      separator:
        "；"
    },
    sushi: {
      opening:
        `回想${place}，寻常日子自有值得记住的滋味：`,
      separator:
        "；"
    },
    guomoruo: {
      opening:
        `个人的行迹，也落在${place}这一处城市坐标上：`,
      separator:
        "；"
    },
    lijieren: {
      opening:
        `说起${place}，先想起的总是当时的光景：`,
      separator:
        "。"
    },
    alai: {
      opening:
        `地点是${place}。时间从这里经过，留下这段记忆：`,
      separator:
        "。"
    },
    childvoice: {
      opening:
        `我想讲讲${place}。`,
      separator:
        "。"
    }
  };

  const profile =
    profiles[styleId];

  if (!profile) {
    return normalizeMemoryPunctuation(
      text
    );
  }

  return normalizeMemoryPunctuation(
    `${profile.opening}${sentenceBodies.join(
      profile.separator
    )}。`
  );
}

/*
 * 零模型表达偏好：仅使用可解释、可复核的表层规则。
 * 不生成比喻，不补写心情、天气、景物或历史事实。
 */
function applyWritingStylePreference(
  text,
  styleId,
  pointName = ""
) {
  const source =
    String(text || "");

  let draft = source;

  switch (styleId) {
    case "childvoice":
      draft = applySurfaceRules(
        draft,
        [
          [/我与/g, "我跟"],
          [/一同/g, "一起"],
          [/我只记得/g, "我记得最清楚的是"],
          [/我当时年纪还小/g, "那时候我还小"],
          [/并不了解|尚不了解/g, "还不懂"],
          [/很多年以后|多年以后/g, "过了好多年"],
          [/如今再看到|现在重新看到/g, "现在再看到"],
          [/我才意识到|我才明白/g, "我才发现"],
          [/停留片刻|稍作停留/g, "停了一会儿"],
          [/缓步而行|缓缓前行|缓缓走着/g, "慢慢走"],
          [/格外/g, "特别"]
        ]
      );
      break;

    case "simaxiangru":
      draft = applySurfaceRules(
        draft,
        [
          [/我和/g, "我与"],
          [/一起来过/g, "一同来到"],
          [/慢慢走/g, "缓步而行"],
          [/很多年以后/g, "多年之后"],
          [/现在重新看到/g, "如今再看到"]
        ]
      );
      break;

    case "xuetao":
      draft = applySurfaceRules(
        draft,
        [
          [/我只记得/g, "我记得"],
          [/一直牵着我的手/g, "始终牵着我的手"],
          [/停了一会儿/g, "停留片刻"],
          [/很多年以后/g, "多年以后"],
          [/一直留在我的记忆里/g, "仍留在我的记忆里"],
          [/现在重新看到/g, "如今再看到"]
        ]
      );
      break;

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

  return frameMemoryByWritingStyle(
    normalizedDraft,
    styleId,
    pointName
  );
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
      styleId,
      pointName
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

    currentRewriteAccepted =
      selectedWritingStyle !==
      "original";

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
      currentRewriteAccepted
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
  window.clearTimeout(
    rewriteAutoTimer
  );

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
    <div class="contribution-modal__backdrop" data-close-contribution-modal></div>
    <section class="contribution-modal__dialog contribution-workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="contributionModalTitle">
      <button type="button" class="contribution-modal__close" aria-label="关闭投稿窗口" data-close-contribution-modal>×</button>
      <p class="detail-kicker">LEAVE A MEMORY</p><h2 id="contributionModalTitle">留下城市记忆</h2>
      <p id="contributionPointName" class="contribution-modal__point"></p>
      <p id="contributionDraftStatus" role="status">草稿仅保存在本浏览器，照片刷新后需重新选择。</p>
      <form id="contributionForm" novalidate>
        <p class="memory-step-progress" id="contributionStepProgress" aria-live="polite"></p>
        <section class="memory-wizard-step" data-memory-step="0" hidden><h3 tabindex="-1">写记忆、选地点和照片</h3>
          <label class="contribution-field"><span>记忆发生的地点</span><select id="contributionPlace" required></select></label>
          <label class="contribution-field"><span>添加真实照片（可多次选择，最多3张）</span><input id="contributionImages" type="file" accept="image/*,.heic,.heif" multiple aria-describedby="contributionImageHelp contributionImageStatus"><small id="contributionImageHelp">每张最多20MB，上传前自动处理较大照片；不支持的格式会提示重选。</small></label>
          <p id="contributionImageStatus" class="contribution-status" role="status"></p><div class="contribution-preview" id="contributionPreview"></div>
          <label class="contribution-field"><span>我的原始记忆</span><textarea id="contributionContent" rows="6" maxlength="1200" placeholder="那年，和谁一起，发生了什么……也可以只上传照片。"></textarea><small>原文单独保留，整理稿不会覆盖它。</small></label>
          <div id="memoryCoverOptions"><p>不传照片，文字会自动生成封面图。</p><div id="memoryCoverPreview"></div></div>
          <h4>表达偏好</h4>
          <div class="writing-style-grid" id="writingStyleGrid" role="group" aria-label="表达偏好选择">${buildWritingStyleCards()}</div>
          <p id="selectedWritingStyleNote" class="writing-style-selected"></p>
          <details id="writingIntentDetails" class="memory-optional"><summary>补充表达方向（选填）</summary><label class="contribution-field"><span>希望保留的感觉</span><textarea id="contributionWritingIntent" rows="2" maxlength="300"></textarea></label></details>
          <div id="memoryRewritePanel" class="ai-writing-preview is-idle" aria-busy="false"><p>只做基础表达整理，原文始终保留。</p><button type="button" id="memoryRewriteTrigger" class="ai-writing-trigger">开始整理</button></div>
          <p id="memoryRewriteStatus" class="memory-rewrite-status" role="status"></p>
          <div id="memoryRewriteComparison" class="memory-rewrite-comparison" hidden>
            <article><span>真实原文</span><p id="memoryRewriteOriginal"></p></article>
            <article class="is-draft"><span id="memoryRewriteDraftLabel">整理稿</span><p id="memoryRewriteDraft"></p></article>
            <div class="memory-rewrite-choice"><button type="button" id="keepOriginalMemory" class="is-selected" aria-pressed="true">保留原文</button><button type="button" id="useRewriteDraft" aria-pressed="false">采用整理稿</button></div>
          </div>
          <details class="memory-optional"><summary>补充时间与线索（选填）</summary>
            <label class="contribution-field"><span>大约时间</span><input id="contributionTime" maxlength="80" placeholder="例如：童年时期、2000年前后"></label>
            <label class="contribution-field"><span>记忆类型</span><select id="contributionMemoryType"><option value="general">城市记忆 / 现场观察</option><option value="place_name">地名线索</option><option value="oral_history">口述记忆</option></select></label>
            <label class="contribution-field"><span>联系方式（选填，不公开）</span><input id="contributionContact" maxlength="120" placeholder="手机号或邮箱"></label>
          </details>
        </section>
        <section class="memory-wizard-step" data-memory-step="1" hidden><h3 tabindex="-1">确认这份记忆</h3><div id="memoryFinalPreview"></div><p id="memoryRewriteChoice" role="status"></p><p>保存后点亮个人地图，经馆员审核后公开。</p>
          <label class="contribution-consent"><input id="consentToPublish" type="checkbox"><span>我已阅读并同意<a href="./copyright-20260908.html" target="_blank" rel="noopener">《版权与使用授权声明》</a>，同意本投稿经审核后公开展示，并按声明约定使用。</span></label>
          <label class="contribution-consent"><input id="rightsConfirmed" type="checkbox"><span>我确认有权按声明授权使用所提交内容；涉及他人著作权、肖像、隐私或个人信息的，已取得依法所需的授权或同意。</span></label>
</section>
        <p id="contributionStatus" class="contribution-status" role="status" aria-live="polite"></p>
        <div class="contribution-actions-row">
          <button type="button" class="btn ghost" data-save-memory-draft>暂存并关闭</button>
          <button type="button" class="btn ghost" id="memoryPreviousStep" hidden>上一步</button>
          <button type="button" class="btn primary" id="memoryNextStep">下一步</button>
          <button type="submit" class="btn primary" id="contributionSubmit" hidden>确认投稿并点亮</button>
        </div>
      </form>
      <section id="memorySubmissionSuccess" hidden></section>
    </section>`;

  document.body
    .appendChild(
      modal
    );

  modal.querySelector("#memoryNextStep").onclick = () => advanceMemoryStep();
  modal.querySelector("#memoryPreviousStep").onclick = () => showMemoryStep(contributionStep - 1);
  modal.querySelector("[data-save-memory-draft]").onclick = () => closeContributionModal();
  modal.querySelector("#contributionPlace").onchange = event => {
    activeContributionPoint = allPoints.find(p=>p.id===event.target.value) || null;
    invalidateRewriteDraft(modal, "地点已改变，可重新整理。"); syncMemoryCover(); saveContributionDraft();
  };
  modal.querySelector("#contributionForm").addEventListener("input", () => queueMicrotask(saveContributionDraft));
  modal.querySelector("#contributionForm").addEventListener("change", saveContributionDraft);
  modal.querySelector("#contributionForm").addEventListener("click", () => queueMicrotask(saveContributionDraft));
  modal.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const buttons = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea, select, a[href]')].filter(e=>e.getClientRects().length);
    const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  });
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
          () => {
            invalidateRewriteDraft(
              modal,
              "原文或整理条件已经改变，请重新整理。"
            );

            window.clearTimeout(
              rewriteAutoTimer
            );

            if (
              selector ===
                "#contributionContent" &&
              selectedWritingStyle !==
                "original" &&
              modal
                .querySelector(
                  "#contributionContent"
                )
                ?.value
                ?.trim()
                .length >= 10
            ) {
              rewriteAutoTimer =
                window.setTimeout(
                  handleMemoryRewrite,
                  420
                );
            }
          }
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

async function openContributionModal(point) {
  ensureContributionModal();
  const token = ++contributionOpenToken;
  contributionReturnFocus = document.activeElement;
  const modal = document.querySelector("#contributionModal"), form=modal.querySelector("#contributionForm");
  contributionDraftKey = "";
  try {
    const result = await cloudApp?.auth?.getUser();
    if (result?.data?.user?.id) contributionDraftKey = `tuhui-memory-draft-v1:${result.data.user.id}`;
  } catch { /* Offline writing remains possible; don't expose another account's draft. */ }
  if (token !== contributionOpenToken) return;
  form.reset(); form.hidden = false; modal.querySelector("#memorySubmissionSuccess").hidden=true;
  form.querySelectorAll("input,textarea,select,button").forEach(el=>el.disabled=false);
  selectedContributionFiles=[]; clearPreviewUrls();
  resetWritingWorkshop(modal);
  activeContributionPoint = point || null;
  modal.querySelector("#contributionPlace").innerHTML = pointSelectOptions();
  let saved;
  try { saved=JSON.parse(localStorage.getItem(contributionDraftKey)||"null"); } catch {}
  if (saved && typeof saved === "object") {
    // One draft per browser identity. Reopening from another map point never silently moves it.
    activeContributionPoint = allPoints.find(p=>p.id===saved.pointId) || activeContributionPoint;
    for (const id of ["contributionContent","contributionTime","contributionContact","contributionMemoryType","contributionWritingIntent"]) {
      if (typeof saved[id] === "string") modal.querySelector(`#${id}`).value=saved[id];
    }
    selectedWritingStyle=getWritingStyle(saved.style).id;
    if (typeof saved.draft === "string") {currentRewriteDraft=saved.draft;currentRewriteAccepted=saved.accepted===true;currentRewriteMeta=saved.meta || null;}
  }
  modal.querySelector("#contributionPlace").value=activeContributionPoint?.id || "";
  modal.querySelector("#contributionDraftStatus").textContent = saved ? `已恢复文字草稿${saved.photoCount ? `，原先 ${saved.photoCount} 张照片请重新选择` : ""}。可在这里更换地点。` : "草稿仅保存在本浏览器，照片刷新或重开后需重新选择。";
  modal.querySelector("#contributionStatus").textContent="";
  renderSelectedMemoryImages(); syncWritingStyleSelection(modal);
  if(currentRewriteDraft) { renderRewriteState(modal,"success"); setRewriteChoice(modal,currentRewriteAccepted); }
  if(!contributionDraftKey) modal.querySelector("#contributionDraftStatus").textContent="账号服务暂未连接，目前无法暂存；关闭前请复制文字。";
  modal.hidden=false; document.body.classList.add("modal-open"); showMemoryStep(0);
}

function closeContributionModal() {
  if (document.querySelector("#contributionSubmit")?.disabled) return;
  const modal=document.querySelector("#contributionModal"); if(!modal) return;
  saveContributionDraft(); contributionOpenToken++;
  modal.hidden=true; activeContributionPoint=null; contributionDraftKey="";
  document.body.classList.remove("modal-open"); resetWritingWorkshop(modal); clearPreviewUrls();
  contributionReturnFocus?.focus({preventScroll:true});
}

function saveContributionDraft() {
  const modal=document.querySelector("#contributionModal");
  if (!modal || modal.hidden || modal.querySelector("#contributionForm").hidden) return;
  syncMemoryCover();
  if (!contributionDraftKey) return;
  const data={pointId:activeContributionPoint?.id || "",style:selectedWritingStyle,draft:currentRewriteDraft,accepted:currentRewriteAccepted,meta:currentRewriteMeta,photoCount:selectedContributionFiles.length};
  for(const id of ["contributionContent","contributionTime","contributionContact","contributionMemoryType","contributionWritingIntent"]) data[id]=modal.querySelector(`#${id}`).value;
  try {
    localStorage.setItem(contributionDraftKey, JSON.stringify(data));
    modal.querySelector("#contributionDraftStatus").textContent="文字草稿已暂存本浏览器；照片重开后需重新选择。";
  } catch { modal.querySelector("#contributionDraftStatus").textContent="本浏览器无法暂存草稿，请先复制文字，暂勿关闭窗口。"; }
}
function syncMemoryCover() {
  const modal=document.querySelector("#contributionModal");
  const content=currentRewriteAccepted && currentRewriteDraft ? currentRewriteDraft : modal.querySelector("#contributionContent").value;
  modal.querySelector("#contributionPointName").textContent=activeContributionPoint ? `记忆地点：${pointPickerName(activeContributionPoint)}` : "选择记忆发生的地点";
  modal.querySelector("#memoryCoverOptions").hidden=selectedContributionFiles.length>0;
  modal.querySelector("#memoryCoverPreview").innerHTML=content.trim() ? renderPostCover({originalContent:content},activeContributionPoint || {}) : "";
}
function showMemoryStep(step) {
  contributionStep=Math.max(0,Math.min(1,step));
  const modal=document.querySelector("#contributionModal");
  modal.querySelectorAll("[data-memory-step]").forEach(el=>el.hidden=Number(el.dataset.memoryStep)!==contributionStep);
  modal.querySelector("#memoryPreviousStep").hidden=contributionStep===0;
  modal.querySelector("#memoryNextStep").hidden=contributionStep===1;
  modal.querySelector("#contributionSubmit").hidden=contributionStep!==1;
  modal.querySelector("#memoryNextStep").textContent="下一步";
  modal.querySelector("#contributionStepProgress").textContent=`${contributionStep + 1} / 2 · ${["编辑记忆","确认发布"][contributionStep]}`;
  modal.querySelector("#contributionStatus").textContent="";
  if(contributionStep===1) {
    const content=currentRewriteAccepted ? currentRewriteDraft : modal.querySelector("#contributionContent").value;
    modal.querySelector("#memoryFinalPreview").innerHTML=`<strong>${escapeHtml(pointPickerName(activeContributionPoint || {}))}</strong>${!selectedContributionFiles.length ? renderPostCover({originalContent:content},activeContributionPoint || {}) : ""}<p>${escapeHtml(content || "本次以照片记录记忆。")}</p>${selectedContributionFiles.length ? `<small>${selectedContributionFiles.length} 张照片</small>` : ""}`;
  }
  modal.querySelector(`[data-memory-step="${contributionStep}"] h3`).focus();
  modal.querySelector(".contribution-modal__dialog").scrollTop=0;
}
function advanceMemoryStep() {
  const modal=document.querySelector("#contributionModal"), status=modal.querySelector("#contributionStatus");
  if(contributionStep===0) {
    const contact=modal.querySelector("#contributionContact").value.trim();
    if(contact && !isValidContributionContact(contact)){status.textContent="请检查联系方式，或留空。";return;}
  }
  if(contributionStep===0 && (!activeContributionPoint || (!modal.querySelector("#contributionContent").value.trim() && !selectedContributionFiles.length))) {status.textContent="请选择地点，并至少填写一段记忆或添加一张照片。";return;}
  saveContributionDraft(); showMemoryStep(contributionStep+1);
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

function getSelectedImages() { return selectedContributionFiles.slice(); }
function validateImages(files) {
  if (!window.tuhuiImages) throw new Error("照片处理功能未加载，请保留文字并稍后重试。");
  window.tuhuiImages.validate(files);
}
function setContributionImageStatus(message, isError = false) {
  const element=document.querySelector("#contributionImageStatus"); if(!element)return;
  element.textContent=message; element.classList.toggle("is-error",isError);
}
function renderSelectedMemoryImages() {
  clearPreviewUrls();
  const preview=document.querySelector("#contributionPreview"); preview.innerHTML="";
  selectedContributionFiles.forEach((file,index)=>{
    const url=URL.createObjectURL(file);previewObjectUrls.push(url);
    const figure=document.createElement("figure");
    figure.innerHTML=`<img src="${url}" alt="${escapeHtml(file.name)}预览"><button type="button" aria-label="删除第${index+1}张照片">×</button><figcaption>${escapeHtml(file.name)}</figcaption>`;
    figure.querySelector("button").onclick=()=>{if(document.querySelector("#contributionSubmit").disabled)return;selectedContributionFiles.splice(index,1);renderSelectedMemoryImages();saveContributionDraft();};
    preview.appendChild(figure);
  });
  setContributionImageStatus(selectedContributionFiles.length ? `已选 ${selectedContributionFiles.length}/3 张，可继续添加或删除。` : "");
  syncMemoryCover();
}
function handleImageSelection() {
  const input=document.querySelector("#contributionImages"), added=Array.from(input.files || []);
  if(!added.length)return; // Cancelling the picker must not erase previous selections.
  const next=selectedContributionFiles.slice();
  for(const file of added) if(!next.some(old=>old.name===file.name && old.size===file.size && old.lastModified===file.lastModified)) next.push(file);
  input.value=""; input.setCustomValidity("");
  try {validateImages(next);} catch(error) {setContributionImageStatus(`${error.message} 已有照片仍保留。`,true);return;}
  selectedContributionFiles=next; renderSelectedMemoryImages();saveContributionDraft();
}


/* ===============================================
   图片上传
   =============================================== */

function getFileExtension(file) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type] || "jpg";
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
  const fileIDs = [];
  const report = message => {
    statusElement.textContent = message;
    setContributionImageStatus(message);
  };
  // Validate/prepare every file before sending any, so a bad later photo does
  // not leave earlier uploads without a contribution record.
  const preparedFiles = [];
  for (let index = 0; index < files.length; index += 1) {
    report(`正在检查并处理第 ${index + 1}/${files.length} 张照片……`);
    preparedFiles.push(await window.tuhuiImages.prepare(files[index]));
  }

  for (
    let index = 0;
    index < files.length;
    index += 1
  ) {
    const file =
      preparedFiles[index];

    const extension =
      getFileExtension(
        file
      );

    const cloudPath =
      `contributions/images/${point.id}/` +
      `${Date.now()}_${index + 1}_${createRandomId()}.${extension}`;

    report(`正在上传第 ${index + 1}/${files.length} 张照片……`);

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

            report(`正在上传第 ${index + 1}/${files.length} 张照片：${percent}%`);
          }
        }).catch(error => {
          throw new Error(`第 ${index + 1} 张照片上传失败：${error.message || "网络连接中断，请检查网络后重试。"}`);
        });

    if (result?.error) throw result.error;
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

  report(`已上传 ${fileIDs.length} 张照片，正在保存投稿……`);
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

function isValidContributionContact(
  value
) {
  const contact =
    String(value || "")
      .trim();

  if (!contact) {
    return true;
  }

  const isEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(contact);

  const phone =
    contact.replace(
      /[\s()（）-]/g,
      ""
    );

  const isPhone =
    /^\+?\d{7,20}$/
      .test(phone);

  return isEmail || isPhone;
}

/* ===============================================
   提交城市记忆
   =============================================== */

async function handleContributionSubmit(
  event
) {
  event.preventDefault();
  if (document.querySelector("#contributionSubmit")?.disabled) return;
  if (contributionStep !== 1) { advanceMemoryStep(); return; }

  if (
    !activeContributionPoint
  ) {
    return;
  }

  let submissionSaved = false;
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

  const contactInfo =
    document
      .querySelector(
        "#contributionContact"
      )
      ?.value
      ?.trim() ||
    "";

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
      "请阅读并同意《版权与使用授权声明》，确认投稿经审核后公开展示，并按声明约定使用。";

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
      "请确认有权按声明授权使用所提交内容，并已取得依法所需的授权或同意。";

    statusElement
      .classList
      .add(
        "is-error"
      );

    return;
  }

  if (
    contactInfo &&
    !isValidContributionContact(
      contactInfo
    )
  ) {
    statusElement.textContent =
      "联系方式格式不正确，请填写有效的手机号码或邮箱。";

    statusElement
      .classList
      .add(
        "is-error"
      );

    return;
  }

  try {
    if (!cloudReady || !cloudDb) throw new Error("投稿服务尚未连接，草稿已保留，请稍后重试。");
    validateImages(files);
    document.querySelector("#contributionForm").querySelectorAll("input,textarea,select,button").forEach(el=>el.disabled=true);

    submitButton.disabled =
      true;

    submitButton.textContent =
      "正在提交……";
    document.querySelector("#contributionImages").disabled = true;
    document.querySelectorAll("[data-close-contribution-modal]").forEach(button => { button.disabled = true; });

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

          contactInfo,

          materialType,

          memoryType,

          imageFileIds,

          imageCount:
            imageFileIds.length,

          videoFileIds: [],

          consentToPublish,

          rightsConfirmed,

          copyrightStatementVersion: "20260908",

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

    submissionSaved = true;
    try { localStorage.removeItem(contributionDraftKey); } catch {}
    contributionDraftKey = "";
    statusElement.textContent = "投稿已保存，正在启动自动处理流程……";

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

    renderWalkScene();

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

    const modal=document.querySelector("#contributionModal");
    modal.querySelector("#contributionForm").hidden=true;
    const success=modal.querySelector("#memorySubmissionSuccess");success.hidden=false;
    success.innerHTML=`<h3 tabindex="-1">记忆已保存，已点亮${escapeHtml(submittedPoint.nameModern)}</h3><p>无需重复投稿，馆员审核后会出现在公众记忆。</p>${window.tuhuiAccount?.markup() || ""}<button type="button" class="btn primary" data-memory-finish>返回地图</button>`;
    success.querySelector("[data-memory-finish]").onclick=()=>{closeContributionModal();focusPersonalLitPoint(submittedPoint);showPersonalLightCelebration(submittedPoint,processingStarted);};
    selectedContributionFiles=[];

  }

  catch (error) {
    console.error(
      "图文投稿失败：",
      error
    );

    statusElement.textContent =
      `${submissionSaved ? "投稿已保存，页面刷新暂未完成。请关闭后查看我的记忆，不要重复投稿。" : "提交失败："}${
        error.message ||
        "请稍后重试"
      }`;

    statusElement
      .classList
      .add(
        "is-error"
      );
    if (submissionSaved) {
      const modal=document.querySelector("#contributionModal"), success=modal.querySelector("#memorySubmissionSuccess");
      success.hidden=false;
      success.innerHTML='<h3>投稿已保存</h3><p>页面刷新暂未完成，请关闭后查看“我的记忆”，无需重复投稿。</p><button type="button" class="btn primary" data-saved-close>关闭</button>';
      success.querySelector("[data-saved-close]").onclick=closeContributionModal;
    } else if (files.length) setContributionImageStatus(statusElement.textContent + " 已选照片和文字仍保留，请重试。", true);
  }

  finally {
    document.querySelector("#contributionForm").querySelectorAll("input,textarea,select,button").forEach(el=>el.disabled=false);
    if(submissionSaved) {
      document.querySelector("#contributionForm").hidden=true;
      const modal=document.querySelector("#contributionModal"), dialog=modal.querySelector(".contribution-modal__dialog");
      const heading=modal.querySelector("#memorySubmissionSuccess h3");
      heading.tabIndex=-1; heading.focus({preventScroll:true});
      // The long form has disappeared: discard its scroll offset, including Safari scroll anchoring.
      dialog.scrollTop=0;
      requestAnimationFrame(()=>{if(!modal.hidden)dialog.scrollTop=0;});
    }
    document.querySelector("#contributionImages").disabled = false;
    document.querySelectorAll("[data-close-contribution-modal]").forEach(button => { button.disabled = false; });
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

  bindSceneExperience();

  ensureContributionModal();

  ensurePublicMemoryPanel();

  ensureMyMemoryPanel();

  bindMyMemoryButtons();
  bindPointPicker();
  document.querySelector("#publicMemoryHeroButton").addEventListener("click", event => openPublicMemoryPanel(null, event.currentTarget));
  document.querySelector("#publicMemoryButton").addEventListener("click", event => openPublicMemoryPanel(null, event.currentTarget));

  try {
    allPoints =
      await loadPoints();

    updateArchiveMetrics();

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

      renderWalkScene();
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

window.addEventListener("tuhui:account-changed", async () => {
  const workshop=document.querySelector("#contributionModal");
  if(workshop && !workshop.hidden && !workshop.querySelector("#contributionForm").hidden) closeContributionModal();
  myMemoryFilter="all";
  publicAccountEpoch += 1;
  publicReadEpoch += 1;
  publicLikePending.clear();
  Array.from(approvedMemoriesByPoint.values()).flat().forEach(memory => { memory.likedByMe = false; });
  const publicPanel = document.querySelector("#publicMemoryPanel");
  if (publicPanel && !publicPanel.hidden) closePublicMemoryPanel();
  personalReadEpoch += 1;
  myContributionData = null;
  rebuildMyContributionPointState([]);
  updateMyMemoryNav();
  const panel = document.querySelector("#myMemoryPanel");
  if (panel && !panel.hidden) document.querySelector("#myMemoryPanelContent").innerHTML = '<p role="status">正在读取账号中的城市记忆…</p>';
  renderMarkers(allPoints);
  await loadMyContributions();
  renderMarkers(allPoints);
  renderRoute(allPoints);
  renderWalkScene();
  if (panel && !panel.hidden) renderMyMemoryPanel();
});
