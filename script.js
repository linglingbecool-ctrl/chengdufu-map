// ===============================================
// 成都府图：50点导览 + CloudBase 城市记忆投稿
// + 审核通过后点亮地标
// 版本：2026-08-10-01
// ===============================================

const APP_VERSION = "20260810-01";

const CLOUDBASE_ENV_ID =
  "chengdufu-map-d4g459au02132689e";

const CLOUDBASE_REGION =
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

let allPoints = [];

let approvedMemoriesByPoint =
  new Map();

/*
 * 当前浏览器用户自己的投稿数据。
 *
 * 注意：
 * - “个人足迹”在投稿进入后台后即可显示；
 * - “公共点亮”仍然只由 approved 投稿触发。
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

/*
 * 六个重点释读点位。
 *
 * 直接复用 Citywalk 的六个核心点位，不需要改 points.json。
 * 视觉上与其余 44 个基础标注点区分开。
 */
const featuredPointIds =
  new Set(
    citywalkOrder
  );

function isFeaturedPoint(
  point
) {
  return featuredPointIds
    .has(
      point?.id
    );
}

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
    cloudApp =
      window.cloudbase.init({
        env: CLOUDBASE_ENV_ID,
        region: CLOUDBASE_REGION
      });

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

    return true;
  }

  catch (error) {
    cloudReady = false;
    cloudDb = null;

    console.error(
      "CloudBase 连接失败：",
      error
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
          ${Number(
            summary.litPoints
          ) || 0}
        </strong>

        <span>
          点亮地点
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
            该点位已被城市记忆点亮 · 已收录 ${count} 份
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
            等待第一份审核通过的城市记忆
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
            如果你有与此地有关的老照片、家庭故事或现场观察，可以提交材料，审核通过后将在这里展示并点亮地图标记。
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

          const textHtml =
            memory.originalContent
              ? `
                <p
                  class="memory-card__text"
                >
                  ${escapeHtml(
                    memory.originalContent
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

      /*
       * 六个重点释读点位使用更高视觉层级。
       * 这里只增加前端样式类，不改变点位状态与数据库逻辑。
       */
      if (
        isFeaturedPoint(
          point
        )
      ) {
        button.classList.add(
          "map-marker-featured"
        );

        button.dataset.featured =
          "true";
      }

      const memoryCount =
        getPointMemories(
          point.id
        ).length;

      const myPointState =
        getMyPointState(
          point.id
        );

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

      if (
        memoryCount > 0
      ) {
        button.classList.add(
          "memory-lit"
        );

        button.dataset.memoryCount =
          String(memoryCount);
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
            ? `｜已收录${memoryCount}份城市记忆`
            : ""
        }${
          isFeaturedPoint(
            point
          )
            ? "｜重点释读点位"
            : ""
        }${
          myPointState === "approved"
            ? "｜我的记忆已公开"
            : (
                myPointState === "processing" ||
                myPointState === "pending"
              )
              ? "｜我的记忆审核中"
              : ""
        }`;

      button.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".map-marker"
            )
            .forEach(
              (marker) =>
                marker
                  .classList
                  .remove(
                    "active"
                  )
            );

          button
            .classList
            .add(
              "active"
            );

          renderDetail(
            point,
            true
          );
        }
      );

      markersEl
        .appendChild(
          button
        );

      if (
        index === 0
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

          return `
            <li
              class="route-card ${
                memoryCount > 0
                  ? "has-memory"
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
                memoryCount > 0
                  ? `
                    <span
                      class="route-memory-note"
                    >
                      ✦ 已收录 ${memoryCount} 份城市记忆
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
    "contribution-modal";

  modal.hidden =
    true;

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

      <p
        class="detail-kicker"
      >
        Public Contribution
      </p>

      <h2
        id="contributionModalTitle"
      >
        留下城市记忆
      </h2>

      <p
        class="contribution-modal__point"
        id="contributionPointName"
      ></p>

      <form
        id="contributionForm"
      >
        <label
          class="contribution-field"
        >
          <span>
            文字说明
          </span>

          <textarea
            id="contributionContent"
            rows="5"
            maxlength="1200"
            placeholder="写下你的现场观察、家庭记忆、口述线索或照片说明。"
          ></textarea>
        </label>

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

        <label
          class="contribution-field"
        >
          <span>
            上传照片（最多3张）
          </span>

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
            提交城市记忆
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
          activeContributionPoint,
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
            activeContributionPoint.id,

          pointName:
            activeContributionPoint.nameModern,

          originalContent:
            content,

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

      /*
       * 投稿进入后台后立即刷新“我的城市记忆”。
       * 公共地图仍然只有审核通过后才正式点亮。
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
    }

    catch (
      processingError
    ) {
      console.error(
        "自动处理启动失败：",
        processingError
      );

      statusElement.textContent =
        "投稿已经保存，但自动处理暂未启动，管理员可稍后重新处理。";

      statusElement
        .classList
        .add(
          "is-error"
        );
    }

    setTimeout(
      () => {
        closeContributionModal();

        alert(
          processingStarted
            ? "记忆已保存到“我的城市记忆”。\n\n当前状态：审核中。\n审核通过后将正式进入公众展示，并解锁相应共建者身份与徽章。"
            : `投稿已保存：共上传 ${imageFileIds.length} 张照片，但自动处理暂未启动。`
        );
      },
      700
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
      "提交城市记忆";
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
       * 审核中的投稿只显示为“个人足迹”，
       * 不影响公共点亮状态。
       */
      await loadMyContributions();

      /*
       * 再渲染一次：
       * - approved 公共投稿显示公共点亮；
       * - 当前用户投稿显示个人足迹状态。
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
