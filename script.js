const statusClass = {
  "存续点": "status-existing",
  "变迁点": "status-changed",
  "不确定点": "status-uncertain"
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
  const status = point.status;
  const chineseStatus = statusLabel[status] || status;

  return statusClass[chineseStatus] || "status-uncertain";
}

function getStatusText(point) {
  return statusLabel[point.status] || point.status || "不确定点";
}

function renderDetail(point) {
  const oldImage = point.oldImage ? escapeHtml(point.oldImage) : "";
  const currentImage = point.currentImage ? escapeHtml(point.currentImage) : "";

  detailEl.innerHTML = `
    <span class="type-pill">${escapeHtml(point.type || getStatusText(point))}</span>

    <div>
      <h3>${escapeHtml(point.nameModern)}</h3>

      <div class="meta-grid">
        <strong>古图名</strong>
        <span>${escapeHtml(point.nameAncient)}</span>

        <strong>今名</strong>
        <span>${escapeHtml(point.nameModern)}</span>

        <strong>状态</strong>
        <span>${escapeHtml(getStatusText(point))}</span>
      </div>
    </div>

    <p>${escapeHtml(point.quick)}</p>
    <p>${escapeHtml(point.extended)}</p>

    <div class="point-media">
      ${
        oldImage
          ? `
            <figure>
              <img src="${oldImage}" alt="${escapeHtml(point.nameAncient)}古图局部图" loading="lazy" />
              <figcaption>古图局部图</figcaption>
            </figure>
          `
          : ""
      }

      ${
        currentImage
          ? `
            <figure>
              <img src="${currentImage}" alt="${escapeHtml(point.nameModern)}今景图" loading="lazy" />
              <figcaption>今景图</figcaption>
            </figure>
          `
          : ""
      }
    </div>

    <p class="source">来源：${escapeHtml(point.source)}</p>
  `;
}

function renderMarkers(points) {
  markersEl.innerHTML = "";

  points.forEach((point, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = `map-marker ${getStatusClass(point)}`;
    button.style.left = `${point.x}%`;
    button.style.top = `${point.y}%`;
    button.setAttribute("aria-label", point.nameModern || point.nameAncient || "地图点位");
    button.title = point.nameModern || point.nameAncient || "地图点位";

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
    .map(
      (point) => `
        <li class="route-card">
          <h3>${escapeHtml(point.nameModern)}</h3>
          <p>${escapeHtml(point.routeNote || point.quick || "")}</p>
        </li>
      `
    )
    .join("");
}

async function init() {
  try {
    const response = await fetch("./points.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const points = await response.json();

    if (!Array.isArray(points) || points.length === 0) {
      throw new Error("points.json 数据为空或格式不正确");
    }

    renderMarkers(points);
    renderRoute(points);
  } catch (error) {
    detailEl.innerHTML = `
      <p class="empty-state">
        点位数据暂时无法加载。请检查 GitHub 仓库根目录中是否存在
        <code>points.json</code>，并确认 <code>script.js</code> 中使用的是
        <code>fetch("./points.json")</code>。
      </p>
    `;

    routeListEl.innerHTML = "";

    console.error("Failed to load points.json", error);
  }
}

init();
