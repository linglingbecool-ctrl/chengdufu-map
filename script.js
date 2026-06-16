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

const citywalkOrder = ["jiuyanqiao", "wuhouci", "wenshuyuan", "qingyanggong", "mancheng", "hongpailou"];

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
  return statusClass[point.status] || statusClass[statusLabel[point.status]] || "status-uncertain";
}

function renderDetail(point) {
  detailEl.innerHTML = `
    <span class="type-pill">${escapeHtml(point.type)}</span>
    <div>
      <h3>${escapeHtml(point.nameModern)}</h3>
      <div class="meta-grid">
        <strong>古图名</strong><span>${escapeHtml(point.nameAncient)}</span>
        <strong>今名</strong><span>${escapeHtml(point.nameModern)}</span>
        <strong>状态</strong><span>${escapeHtml(point.status)}</span>
      </div>
    </div>
    <p>${escapeHtml(point.quick)}</p>
    <p>${escapeHtml(point.extended)}</p>
    <div class="point-media">
      <figure>
        <img src="${escapeHtml(point.oldImage)}" alt="${escapeHtml(point.nameAncient)}古图局部图" />
        <figcaption>古图局部图</figcaption>
      </figure>
      <figure>
        <img src="${escapeHtml(point.currentImage)}" alt="${escapeHtml(point.nameModern)}今景图" />
        <figcaption>今景图</figcaption>
      </figure>
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
    button.setAttribute("aria-label", point.nameModern);
    button.addEventListener("click", () => {
      document.querySelectorAll(".map-marker").forEach((marker) => marker.classList.remove("active"));
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

async function init() {
  try {
    const response = await fetch("data/points.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const points = await response.json();
    renderMarkers(points);
    renderRoute(points);
  } catch (error) {
    detailEl.innerHTML = `<p class="empty-state">点位数据暂时无法加载。部署到 GitHub Pages 或通过本地服务器打开后即可读取 data/points.json。</p>`;
    routeListEl.innerHTML = "";
    console.error("Failed to load points.json", error);
  }
}

init();
