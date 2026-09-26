// 舆上·成都：馆藏证据问答前端
// 功能：地点选择、馆藏证据问答、网络失败时查阅已有资料。

(function () {
  "use strict";

  const config = window.TUHUI_CONFIG || {};

  const STORAGE_KEY = "tuhui_cloudbase_publishable_key";
  const THREAD_KEY = "tuhui_agent_thread_id";

  const pointQuestions = {
    jiuyanqiao: {
      name: "九眼桥",
      questions: [
        "九眼桥何时修建？请给出文献名和 PDF 页码。",
        "古图上的九贤桥与九眼桥是什么关系？",
        "九眼桥旧桥、新桥和仿古桥经历了哪些变化？"
      ]
    },

    wuhouci: {
      name: "武侯祠",
      questions: [
        "武侯祠在现有文献中有哪些可靠记载？",
        "武侯祠的攻心联是什么时候出现的？请给出处。",
        "关于昭烈陵和诸葛铜鼓，哪些内容只能作为旧说？"
      ]
    },

    wenshuyuan: {
      name: "文殊院",
      questions: [
        "文殊院在清代成都寺院格局中处于什么位置？",
        "文殊院街与头福街是什么关系？",
        "现有资料能否确定文殊院最早创建年代？"
      ]
    },

    qingyanggong: {
      name: "青羊宫",
      questions: [
        "青羊宫有哪些可以直接引用的历史记载？",
        "青羊肆、青羊观和青羊宫是什么关系？",
        "古图上的青羊宫与今天的范围能否直接等同？"
      ]
    },

    mancheng: {
      name: "满城（宽窄巷子）",
      questions: [
        "成都满城是什么时候形成的？请列出不同文献表述。",
        "宽窄巷子能否代表历史上满城的全部范围？",
        "文献记载的满城街巷数量为什么不同？"
      ]
    },

    hongpailou: {
      name: "红牌楼",
      questions: [
        "红牌楼为什么叫红牌楼？现有资料能否确定？",
        "目前能可靠确认的红牌楼历史信息有哪些？",
        "关于红牌楼，哪些流行说法尚无直接文献支持？"
      ]
    }
  };

  // ========================================================
  // 比赛演示：固定三道问题
  // ========================================================

  const demoQuestions = [
    {
      id: "jiuyanqiao-map",
      matchPriority: 20,
      matchAll: [["九眼桥", "九贤桥"]],
      matchAny: ["古图", "图上", "地图", "名称", "称呼", "叫什么", "得名", "由来"],
      label: "古图核证",
      grade: "证据充分",
      pointId: "jiuyanqiao",
      question: "九眼桥在古图中叫什么？请给出文献依据。",
      answer: `结论
在馆藏古图中，该桥标注为“九贤桥”，而非“九眼桥”。“九贤桥”与今日“九眼桥”存在值得继续核查的空间对应线索，但现有材料不足以直接证明二者为同一桥梁或连续桥名。

文献依据
1｜馆藏古图｜古图点位记录
图中标注“九贤桥”。

2｜《成都通览》｜PDF第33页
“九眼桥（古名洪济桥，明名锁江桥，九洞……乾隆五十三年始改名九眼桥）。”

3｜《成都街巷志》｜PDF第126页
据天启《成都府志》记述，明万历二十一年（1593）起建桥，初名洪济桥，天启年间改名锁江桥。

证据边界
能够确认古图标注“九贤桥”，并确认洪济桥—锁江桥—九眼桥的文献沿革；不能确认“九贤桥”与今日九眼桥为同一地点，也不能把“贤/眼”解释为避讳、异体或讹写。`,
      evidenceIds: [
        "jiuyanqiao_map_01",
        "jiuyanqiao_tonglan_p33_01",
        "jiuyanqiao_jiexiang_p126_01"
      ]
    },
    {
      id: "jiuyanqiao-compare",
      matchPriority: 30,
      matchAll: [["九眼桥", "九贤桥"]],
      matchAny: ["成都通览", "成都街巷志", "两书", "对读", "差异", "不同", "分别"],
      label: "文献对读",
      grade: "文献有差异",
      pointId: "jiuyanqiao",
      question:
        "《成都通览》和《成都街巷志》关于九眼桥名称沿革分别怎么记载？两书有哪些不同？",
      answer: `结论
两书都把洪济桥、锁江桥与九眼桥置于同一桥梁沿革中，但对乾隆五十三年（1788）的表述重点不同：一书直接记为“始改名九眼桥”，另一书强调补修以及因九个桥洞形成的民间称呼。应并列保留，不能强行合并为唯一说法。

文献依据
1｜《成都通览》｜PDF第33页
记“古名洪济桥，明名锁江桥”，并称乾隆五十三年“始改名九眼桥”。

2｜《成都街巷志》｜PDF第126页
据地方志记1593年起建洪济桥、天启年间改名锁江桥，并叙清代补修与九孔俗称。

3｜《成都街巷志》｜PDF第127—128页
记录旧桥维修、1986年新桥、1992年旧桥拆除及2001年异地仿建。

证据边界
当前证据不足以判断1788年究竟是正式行政改名，还是补修后沿用民间俗称；仿古桥也不能作为明清旧桥原物。`,
      evidenceIds: [
        "jiuyanqiao_tonglan_p33_01",
        "jiuyanqiao_jiexiang_p126_01",
        "jiuyanqiao_jiexiang_p127_128_01"
      ]
    },
    {
      id: "hongpailou-boundary",
      matchPriority: 40,
      matchAll: [["红牌楼"]],
      matchAny: ["名称", "名字", "得名", "由来", "起源", "为什么叫", "茶马", "朝贡", "嘉靖"],
      decision: "insufficient-evidence",
      label: "证据边界",
      grade: "拒绝定论",
      pointId: "hongpailou",
      question: "红牌楼的名称起源是什么？现有文献能证实吗？",
      answer: `结论
根据当前知识库，红牌楼得名原因不能确定。现有材料只能证明20世纪40年代“成都外南红牌楼”地名已经使用，以及“红牌楼北街”被目录归入“以昔建筑命名”；不能据此写出一段完整的牌楼起源史。

文献依据
1｜《成都街巷志》｜PDF第65页
书中在李家钰将军事迹的括注中使用“成都外南红牌楼”，只能证明当时地名已经明确使用。

2｜《成都街巷志》目录｜PDF第1097页
目录把“红牌楼北街”归入“以昔建筑命名”，只能作为曾有相关建筑的间接线索。

3｜项目研究缺口记录｜无PDF页码
本批两部书没有找到足以证明牌楼创建年代、形制、用途与毁坏过程的直接材料。

证据边界
“明嘉靖年间修建红牌楼”“用于接待藏族朝贡人员”“与茶马互市有关”等流行叙述，本批材料均不能直接支持。AI在证据不足时拒绝下结论，等待补查《华阳县志》原文、地方志与档案。`,
      evidenceIds: [
        "hongpailou_jiexiang_p65_01",
        "hongpailou_jiexiang_outline_01",
        "hongpailou_project_gap_01"
      ]
    }
  ];

  const sourceEvidenceQueues = new Map();

  let activePointId = "jiuyanqiao";
  let aiApp = null;
  let busy = false;
  let conversation = [];
  const questionQueue = [];
  const MAX_QUEUED_QUESTIONS = 2;

  const elements = {};

  // ========================================================
  // ID 与会话
  // ========================================================

  function createId(prefix) {
    const suffix =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `${prefix}-${suffix}`;
  }

  function getThreadId() {
    let threadId = sessionStorage.getItem(THREAD_KEY);

    if (!threadId) {
      threadId = createId("tuhui-thread");
      sessionStorage.setItem(THREAD_KEY, threadId);
    }

    return threadId;
  }

  // ========================================================
  // 文本安全
  // ========================================================

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function inlineMarkup(value) {
    return String(value ?? "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /(《[^》]+》(?:（PDF第[^）]+页）)?)/g,
        '<mark class="ai-citation">$1</mark>'
      )
      .replace(
        /(PDF\s*第\s*\d+(?:\s*[—-]\s*\d+)?\s*页)/g,
        '<span class="ai-page">$1</span>'
      );
  }

  function publicFacingText(value) {
    return String(value ?? "")
      .replace(
        /review_status\s*[:：]?\s*needs_review/gi,
        "仍需复核"
      )
      .replace(
        /review_status\s*[:：]?\s*needs_research/gi,
        "仍需补充研究"
      )
      .replace(
        /verification_status\s*[:：]?\s*needs_review/gi,
        "仍需复核"
      )
      .replace(
        /verification_status\s*[:：]?\s*needs_research/gi,
        "仍需补充研究"
      )
      .replace(/\bneeds_review\b/gi, "仍需复核")
      .replace(/\bneeds_research\b/gi, "仍需补充研究");
  }

  function normalizeHeading(text) {
    return String(text ?? "")
      .replace(/^#{1,4}\s*/, "")
      .replace(/^\*\*/, "")
      .replace(/\*\*$/, "")
      .replace(/^【/, "")
      .replace(/】$/, "")
      .replace(/[：:]$/, "")
      .trim();
  }

  function isSectionHeading(text) {
    const value = String(text ?? "").trim();

    if (/^#{1,4}\s+/.test(value)) {
      return true;
    }

    if (/^\*\*.+\*\*$/.test(value)) {
      return true;
    }

    if (/^【.+】$/.test(value)) {
      const heading = normalizeHeading(value);

      return [
        "结论",
        "文献依据",
        "证据边界",
        "文献记载",
        "待核实信息",
        "后人研究",
        "关系判定",
        "提示",
        "小结"
      ].includes(heading);
    }

    return /^(结论|文献依据|证据边界|文献记载|待核实信息|后人研究|关系判定|提示|小结)(?:（[^）]+）)?[：:]?$/.test(
      value
    );
  }

  // ========================================================
  // 证据卡
  // ========================================================

  function parseSourceHeader(text) {
    const match = String(text ?? "")
      .trim()
      .match(/^(\d+)[｜|]\s*(.+)$/);

    if (!match) {
      return null;
    }

    const number = match[1];
    const rawTitle = match[2].trim();

    const pageMatch = rawTitle.match(
      /(PDF\s*第\s*\d+(?:\s*[—-]\s*\d+)?\s*页)/
    );

    let title = rawTitle;
    let page = "";

    if (pageMatch) {
      page = pageMatch[1];

      title = rawTitle
        .replace(pageMatch[1], "")
        .replace(/[｜|]\s*$/, "")
        .trim();
    }

    return {
      number,
      title,
      page
    };
  }

  function sourceCardHeader(source) {
    const evidenceRecord =
      resolveEvidenceRecord(source);

    return `
      <div class="ai-evidence-card-head">

        <span class="ai-evidence-number">
          ${escapeHtml(source.number)}
        </span>

        <div class="ai-evidence-source">

          <strong>
            ${inlineMarkup(source.title)}
          </strong>

          ${
            source.page
              ? `
                <small>
                  ${inlineMarkup(source.page)}
                </small>
              `
              : ""
          }

        </div>

      </div>

      <div class="ai-evidence-card-tools">
        ${
          evidenceRecord
            ? `
              <span class="ai-evidence-grade ai-evidence-grade--${escapeHtml(
                String(evidenceRecord.grade || "C").toLowerCase()
              )}">
                证据 ${escapeHtml(evidenceRecord.grade || "C")}
              </span>

              <span class="ai-evidence-verification">
                ${escapeHtml(evidenceRecord.verification || "待复核")}
              </span>

              <button
                type="button"
                data-open-evidence="${escapeHtml(evidenceRecord.id)}"
              >
                ${evidenceRecord.sourceType === "in-copyright" ? "查看引用式证据卡" : evidenceRecord.pages?.length ? "查看原页" : "查看核验记录"} ↗
              </button>
            `
            : `
              <span class="ai-evidence-verification">
                来源信息待进一步匹配
              </span>
            `
        }
      </div>

      <div class="ai-evidence-card-body">
    `;
  }

  function normalizeSourceTitle(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&[^;]+;/g, "")
      .replace(/[《》]/g, "")
      .replace(/目录/g, "")
      .replace(/馆藏/g, "")
      .replace(/项目/g, "")
      .replace(/[\s·]/g, "")
      .trim();
  }

  function parsePageRange(value) {
    const match = String(value || "")
      .match(/PDF\s*第\s*(\d+)(?:\s*[—-]\s*(\d+))?\s*页/);

    if (!match) return [];

    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);

    return Array.from(
      { length: Math.max(1, end - start + 1) },
      (_, index) => start + index
    );
  }

  function resolveEvidenceRecord(source) {
    const records = window.TUHUI_EVIDENCE?.records || [];
    const sourceTitle = normalizeSourceTitle(source.title);
    const pages = parsePageRange(`${source.title} ${source.page}`);

    let candidates = records.filter((record) => {
      const recordTitle = normalizeSourceTitle(record.title);

      if (
        sourceTitle.includes("古图") ||
        sourceTitle.includes("点位记录")
      ) {
        return record.id === "jiuyanqiao_map_01";
      }

      if (
        sourceTitle.includes("研究缺口") ||
        sourceTitle.includes("无PDF页码")
      ) {
        return record.id === "hongpailou_project_gap_01";
      }

      if (!recordTitle || !sourceTitle) return false;

      return (
        recordTitle.includes(sourceTitle) ||
        sourceTitle.includes(recordTitle)
      );
    });

    if (pages.length) {
      const pageMatched = candidates.filter((record) =>
        pages.some((page) =>
          Number(record.pageStart) <= page &&
          Number(record.pageEnd || record.pageStart) >= page
        )
      );

      if (pageMatched.length) candidates = pageMatched;
    }

    if (!candidates.length) return null;

    const queueKey = `${activePointId}|${sourceTitle}|${pages.join("-")}`;
    const used = sourceEvidenceQueues.get(queueKey) || 0;
    const record = candidates[used % candidates.length];
    sourceEvidenceQueues.set(queueKey, used + 1);

    return record;
  }

  // ========================================================
  // 回答渲染
  // ========================================================

  function renderAnswer(text) {
    sourceEvidenceQueues.clear();

    const safeText = escapeHtml(
      publicFacingText(text)
    );

    const lines = safeText.split(/\r?\n/);

    const html = [];

    let unorderedListOpen = false;
    let orderedListOpen = false;

    let currentSection = "";
    let evidenceCardOpen = false;

    function closeLists() {
      if (unorderedListOpen) {
        html.push("</ul>");
        unorderedListOpen = false;
      }

      if (orderedListOpen) {
        html.push("</ol>");
        orderedListOpen = false;
      }
    }

    function closeEvidenceCard() {
      closeLists();

      if (evidenceCardOpen) {
        html.push("</div></article>");
        evidenceCardOpen = false;
      }
    }

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        closeLists();
        return;
      }

      // ----------------------------------------
      // 结论 / 文献依据 / 证据边界
      // ----------------------------------------

      if (isSectionHeading(trimmed)) {
        closeEvidenceCard();

        const heading = normalizeHeading(trimmed);
        currentSection = heading;

        let sectionClass = "";

        if (heading === "结论") {
          sectionClass =
            " ai-answer-heading--conclusion";
        }

        if (heading === "文献依据") {
          sectionClass =
            " ai-answer-heading--evidence";
        }

        if (heading === "证据边界") {
          sectionClass =
            " ai-answer-heading--boundary";
        }

        html.push(
          `<h4 class="ai-answer-heading${sectionClass}">
            ${inlineMarkup(heading)}
          </h4>`
        );

        return;
      }

      // ----------------------------------------
      // 文献依据中的 1｜2｜3｜自动生成证据卡
      // ----------------------------------------

      const source =
        parseSourceHeader(trimmed);

      if (
        currentSection === "文献依据" &&
        source
      ) {
        closeEvidenceCard();

        evidenceCardOpen = true;

        html.push(
          `<article class="ai-evidence-card">`
        );

        html.push(
          sourceCardHeader(source)
        );

        return;
      }

      // ----------------------------------------
      // 无序列表
      // ----------------------------------------

      const bulletMatch =
        trimmed.match(/^[-•]\s+(.+)$/);

      if (bulletMatch) {
        if (orderedListOpen) {
          html.push("</ol>");
          orderedListOpen = false;
        }

        if (!unorderedListOpen) {
          html.push("<ul>");
          unorderedListOpen = true;
        }

        html.push(
          `<li>${inlineMarkup(
            bulletMatch[1]
          )}</li>`
        );

        return;
      }

      // ----------------------------------------
      // 普通编号列表
      // ----------------------------------------

      const numberedMatch =
        trimmed.match(/^\d+[.)、]\s*(.+)$/);

      if (numberedMatch) {
        if (unorderedListOpen) {
          html.push("</ul>");
          unorderedListOpen = false;
        }

        if (!orderedListOpen) {
          html.push("<ol>");
          orderedListOpen = true;
        }

        html.push(
          `<li>${inlineMarkup(
            numberedMatch[1]
          )}</li>`
        );

        return;
      }

      closeLists();

      // ----------------------------------------
      // 证据卡正文
      // ----------------------------------------

      if (evidenceCardOpen) {
        html.push(
          `<p>${inlineMarkup(trimmed)}</p>`
        );

        return;
      }

      // ----------------------------------------
      // 证据边界视觉块
      // ----------------------------------------

      if (currentSection === "证据边界") {
        html.push(
          `<p class="ai-boundary-text">
            ${inlineMarkup(trimmed)}
          </p>`
        );

        return;
      }

      // ----------------------------------------
      // 普通正文
      // ----------------------------------------

      html.push(
        `<p>${inlineMarkup(trimmed)}</p>`
      );
    });

    closeEvidenceCard();
    closeLists();

    return html.join("");
  }

  // ========================================================
  // 消息区域
  // ========================================================

  function addMessage(
    role,
    content,
    options = {}
  ) {
    const article =
      document.createElement("article");

    article.className =
      `ai-message ai-message--${role}`;

    const title =
      role === "assistant"
        ? "舆上·成都 · 馆藏 AI"
        : "访客提问";

    article.innerHTML = `
      <div class="ai-message-meta">

        <span>
          ${title}
        </span>

        <time>
          ${escapeHtml(
            options.status || "刚刚"
          )}
        </time>

      </div>

      <div class="ai-message-body">

        ${
          role === "assistant"
            ? renderAnswer(content)
            : `<p>${escapeHtml(content)}</p>`
        }

      </div>
    `;

    elements.messages.appendChild(
      article
    );

    elements.messages.scrollTo({
      top: elements.messages.scrollHeight,
      behavior: "smooth"
    });

    return article;
  }

  function updateAssistantMessage(
    article,
    text,
    status = "刚刚"
  ) {
    const body =
      article.querySelector(
        ".ai-message-body"
      );

    const time =
      article.querySelector("time");

    if (!body || !time) {
      return;
    }

    if (text) {
      body.innerHTML =
        renderAnswer(text);
    } else {
      body.innerHTML = `
        <div class="ai-thinking">

          <i></i>
          <i></i>
          <i></i>

          <span>
            正在查阅点位档案与文献片段
          </span>

        </div>
      `;
    }

    time.textContent = status;

    if (
      article.classList.contains(
        "is-latest-answer"
      )
    ) {
      const messageTop =
        article.getBoundingClientRect().top -
        elements.messages.getBoundingClientRect().top +
        elements.messages.scrollTop;

      elements.messages.scrollTo({
        top: Math.max(0, messageTop - 8),
        behavior:
          status === "已核对知识库"
            ? "smooth"
            : "auto"
      });
    } else {
      elements.messages.scrollTop =
        elements.messages.scrollHeight;
    }
  }

  // ========================================================
  // 连接状态
  // ========================================================

  function setStatus(
    label,
    state = "ready"
  ) {
    if (elements.connectionStatus) {
      elements.connectionStatus.textContent =
        label;
    }

    if (elements.liveDot) {
      elements.liveDot.dataset.state =
        state;
    }
  }

  function getPublishableKey() {
    return String(
      config.publishableKey ||
        localStorage.getItem(
          STORAGE_KEY
        ) ||
        ""
    ).trim();
  }

  function getCloudApp() {
    if (aiApp) {
      return aiApp;
    }

    if (
      !window.cloudbase ||
      typeof window.cloudbase.init !==
        "function"
    ) {
      throw new Error(
        "CloudBase Web SDK 尚未加载"
      );
    }

    const accessKey =
      getPublishableKey();

    const initOptions = {
      env: config.envId,
      region: config.region
    };

    if (accessKey) {
      initOptions.accessKey =
        accessKey;
    }

    aiApp = window.cloudbase.init(
      initOptions
    );

    return aiApp;
  }

  function getAiClient() {
    const app = getCloudApp();

    if (
      !app ||
      typeof app.ai !== "function"
    ) {
      throw new Error(
        "当前 CloudBase SDK 不包含 AI 调用模块"
      );
    }

    return app.ai();
  }

  function normalizeFunctionResult(
    response
  ) {
    let result =
      response?.result ??
      response?.data ??
      response;

    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        return null;
      }
    }

    if (
      result &&
      typeof result === "object" &&
      "data" in result &&
      Object.keys(result).length === 1
    ) {
      result = result.data;
    }

    return result || null;
  }

  async function callEvidenceQuestion(
    question, pointId = activePointId
  ) {
    const app = getCloudApp();

    if (
      !app ||
      typeof app.callFunction !==
        "function"
    ) {
      throw Object.assign(
        new Error("CloudBase 云函数调用模块不可用"),
        { code: "CLOUDBASE_UNAVAILABLE" }
      );
    }

    const request = app.callFunction({
      name: "askEvidenceQuestion",
      data: {
        question,
        pointId,
        requestId: createId("evidence")
      },
      parse: true
    });

    let timeoutId;
    const clientTimeout = new Promise(
      (_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(
            Object.assign(
              new Error("在线问答暂未完成。"),
              { code: "CLIENT_TIMEOUT" }
            )
          );
        }, 28000);
      }
    );

    let response;
    try {
      response = await Promise.race([request, clientTimeout]);
    } finally {
      window.clearTimeout(timeoutId);
    }
    const result =
      normalizeFunctionResult(response);

    if (!result) {
      throw Object.assign(
        new Error("馆藏证据服务未返回有效结果"),
        { code: "INVALID_RESPONSE" }
      );
    }

    if (!result.ok) {
      throw Object.assign(
        new Error(
          result.message ||
            "馆藏证据服务暂时不可用"
        ),
        {
          code:
            result.code ||
            "SERVICE_UNAVAILABLE",
          retryAfterMs:
            result.retryAfterMs || 0
        }
      );
    }

    return result;
  }

  // ========================================================
  // 地点选择
  // ========================================================

  function selectPoint(
    pointId,
    shouldScroll = false,
    notifyMap = true
  ) {
    if (!pointQuestions[pointId]) {
      return;
    }

    activePointId = pointId;

    document
      .querySelectorAll(
        "[data-ai-point]"
      )
      .forEach((button) => {
        button.classList.toggle(
          "is-active",
          button.dataset.aiPoint ===
            pointId
        );
      });

    if (elements.pointSelect) elements.pointSelect.value = activePointId;

    if (notifyMap) {
      document.dispatchEvent(
        new CustomEvent(
          "tuhui:ai-point-selected",
          {
            detail: {
              pointId
            }
          }
        )
      );
    }

    if (elements.input) {
      elements.input.placeholder =
        `向馆藏 AI 询问${pointQuestions[pointId].name}……`;
    }

    if (shouldScroll) {
      document
        .querySelector("#map")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      window.setTimeout(() => {
        elements.input?.focus();
      }, 550);
    }
  }

  // ========================================================
  // 发送问题
  // ========================================================

  function findDemoQuestion(questionId) {
    return demoQuestions.find(
      (item) => item.id === questionId
    );
  }

  function normalizeDemoQuestionText(
    value
  ) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, "");
  }

  function findDemoQuestionByText(
    question
  ) {
    const normalized =
      normalizeDemoQuestionText(
        question
      );

    return demoQuestions.find((item) =>
      normalizeDemoQuestionText(item.question) === normalized
    ) || null;
  }

  function queueQuestion(question, pointId = activePointId) {
    const normalized =
      normalizeDemoQuestionText(question);
    const duplicate =
      questionQueue.some(
        (item) =>
          normalizeDemoQuestionText(item.question) ===
          normalized
      );

    if (!duplicate) {
      if (
        questionQueue.length >=
        MAX_QUEUED_QUESTIONS
      ) {
        setStatus("请先等待前面的回答，当前问题已保留在输入框", "working");
        return;
      }
      questionQueue.push({question, pointId});
    }

    elements.input.value = "";
    setStatus(
      `问题已排队 · 前方 ${Math.max(1, questionQueue.length)} 条`,
      "working"
    );
  }

  function processNextQueuedQuestion() {
    if (busy || !questionQueue.length) {
      return;
    }

    const next = questionQueue.shift();
    window.setTimeout(
      () => sendQuestion(next.question, next.pointId),
      120
    );
  }

  function appendConversationPair(question, answer) {
    conversation.push(
      {
        id: createId("msg"),
        role: "user",
        content: question
      },
      {
        id: createId("msg"),
        role: "assistant",
        content: answer
      }
    );
  }

  async function sendDemoQuestion(demo) {
    if (!demo || busy) return;

    busy = true;
    activePointId = demo.pointId;
    selectPoint(demo.pointId, false, true);

    elements.sendButton.disabled = true;
    elements.input.disabled = true;

    setStatus("查阅已核结果", "working");

    elements.messages
      .querySelectorAll(".is-latest-question, .is-latest-answer")
      .forEach((article) => {
        article.classList.remove("is-latest-question", "is-latest-answer");
      });

    const userArticle = addMessage("user", demo.question);
    const assistantArticle = addMessage("assistant", "", {
      status: "已核结果调取中"
    });

    userArticle.classList.add("is-latest-question");
    assistantArticle.classList.add("is-latest-answer", "is-demo-answer");
    elements.messages.classList.add("has-answer-focus");

    updateAssistantMessage(assistantArticle, "", "已核结果调取中");


    updateAssistantMessage(assistantArticle, demo.answer, "已核验答案");

    const meta = document.createElement("div");
    meta.className = "ai-demo-result-note";
    assistantArticle.dataset.answerRoute =
      demo.decision || "preset-verified";
    meta.innerHTML = `
      <strong>预置核验结果${demo.decision === "insufficient-evidence" ? " · 证据不足" : ""}</strong>
      <span>本答案已经预先核对，非本次实时生成。</span>
    `;
    assistantArticle.querySelector(".ai-message-body")?.appendChild(meta);

    appendConversationPair(demo.question, demo.answer);
    setStatus("已核验答案 · 来源可复核", "ready");

    busy = false;
    elements.sendButton.disabled = false;
    elements.input.disabled = false;
    elements.input.value = "";
    processNextQueuedQuestion();
  }

  function localEvidenceFallback(question, pointId) {
    // 本地只有六点位的少量核验记录；这里只提供查阅材料，不推断问题答案。
    const explicitPoint = Object.keys(pointQuestions).find((id) =>
      question.includes(pointQuestions[id].name.replace(/（.*$/, ""))
    );
    const hasHistoryIntent = /古图|历史|文献|建于|修建|何时|哪年|始建|建成|多大|多长|在哪|哪里|是谁|简介|介绍|来历|年代|沿革|由来|记载|证据|拆除|重建|改名/.test(question);
    const selected = explicitPoint || (hasHistoryIntent ? pointId : "");
    const records = window.TUHUI_EVIDENCE?.byPoint?.[selected] || [];
    const intro = "在线服务暂时未能完成这次问答，请点击下方重试。";
    if (!records.length) return intro + "这不代表问题没有答案，也不代表馆藏没有相关记载。";
    const tokens = question.match(/[\u3400-\u9fff]{2,}/g)?.flatMap((part) =>
      Array.from({length: part.length - 1}, (_, i) => part.slice(i, i + 2))
    ) || [];
    const ranked = records.map((record) => ({record, score: tokens.filter((token) =>
      `${record.excerpt} ${record.proves}`.includes(token)).length
    })).sort((a, b) => b.score - a.score).slice(0, 3);
    return intro + `下面是${pointQuestions[selected].name}已有的本地查阅材料，尚未判定能否回答本次问题。\n\n` +
      ranked.map(({record}) => `${record.title} · ${record.pageLabel}\n${record.excerpt}\n可证明：${record.proves}\n边界：${record.limits}`).join("\n\n");
  }

  async function sendQuestion(question, pointId = activePointId) {
    const cleanedQuestion =
      String(question || "").trim();

    if (!cleanedQuestion) {
      return;
    }

    if (busy) {
      queueQuestion(cleanedQuestion, pointId);
      return;
    }

    const matchedDemo =
      findDemoQuestionByText(
        cleanedQuestion
      );

    if (matchedDemo) {
      const draft = elements.input.value.trim() === cleanedQuestion ? "" : elements.input.value;
      await sendDemoQuestion(matchedDemo);
      elements.input.value = draft;
      return;
    }

    busy = true;

    // 实时检索期间仍允许输入下一问；再次提交时进入长度为2的本地队列。
    elements.sendButton.disabled = false;
    elements.input.disabled = false;
    // 排队问题和重试不能清掉读者正在写的下一问。
    if (elements.input.value.trim() === cleanedQuestion) elements.input.value = "";

    setStatus(
      "正在检索馆藏证据",
      "working"
    );

    elements.messages
      .querySelectorAll(
        ".is-latest-question, .is-latest-answer"
      )
      .forEach((article) => {
        article.classList.remove(
          "is-latest-question",
          "is-latest-answer"
        );
      });

    const userArticle = addMessage(
      "user",
      cleanedQuestion
    );

    const assistantArticle =
      addMessage(
        "assistant",
        "",
        {
          status: "查阅中"
        }
      );

    userArticle.classList.add(
      "is-latest-question"
    );

    assistantArticle.classList.add(
      "is-latest-answer"
    );

    elements.messages.classList.add(
      "has-answer-focus"
    );

    updateAssistantMessage(
      assistantArticle,
      "",
      "查阅中"
    );

    const userMessage = {
      id: createId("msg"),
      role: "user",
      content: cleanedQuestion
    };

    conversation.push(
      userMessage
    );

    try {
      updateAssistantMessage(
        assistantArticle,
        "",
        "证据排序中"
      );

      const result =
        await callEvidenceQuestion(
          cleanedQuestion, pointId
        );
      const answer =
        String(result.answer || "").trim();

      if (!answer) {
        throw Object.assign(
          new Error("馆藏证据服务未返回答案"),
          { code: "EMPTY_ANSWER" }
        );
      }

      conversation.push({
        id: createId("msg"),
        role: "assistant",
        content: answer
      });

      updateAssistantMessage(
        assistantArticle,
        answer,
        result.route === "verified-cache"
          ? "馆员已核验"
          : result.route === "insufficient-evidence"
            ? "相关证据不足"
            : result.route === "out-of-scope"
              ? "证据范围之外"
              : result.route === "raw-evidence"
                ? "仅返回馆藏依据"
                : "实时检索完成"
      );

      assistantArticle.dataset.answerRoute =
        result.route || "realtime-model";

      const sourceNote =
        document.createElement("div");
      sourceNote.className =
        "ai-result-source-note";
      sourceNote.innerHTML = `
        <strong>${escapeHtml(result.sourceLabel || "实时检索生成")}</strong>
        <span>
          ${Number(result.evidenceCount) || 0} 条馆藏依据 · 来源可复核
        </span>
      `;
      assistantArticle
        .querySelector(".ai-message-body")
        ?.appendChild(sourceNote);

      setStatus(
        result.route === "insufficient-evidence"
          ? "已检索 · 证据不足以定论"
          : result.route === "out-of-scope"
            ? "当前知识样本未覆盖"
            : result.route === "raw-evidence"
              ? "模型暂不可用 · 已返回馆藏依据"
              : result.route === "verified-cache"
                ? "馆员核验结果已返回"
                : "实时检索生成完成",
        result.route === "out-of-scope"
          ? "error"
          : "ready"
      );
    }

    catch (error) {
      // 这些错误均已在界面内转成可重试提示，不作为控制台故障上报。
      console.info(
        "AI_GUIDE_FAILED",
        String(error?.code || error?.name || "UNKNOWN"),
        String(error?.message || "未知错误")
      );

      const needsKey =
        !getPublishableKey();

      const fallback = localEvidenceFallback(cleanedQuestion, pointId);
      updateAssistantMessage(assistantArticle, fallback, "在线问答暂不可用");
      assistantArticle.dataset.answerRoute = "local-evidence";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "ai-retry-button";
      retry.textContent = "重试这一问";
      retry.addEventListener("click", () => {
        const draft = elements.input.value;
        sendQuestion(cleanedQuestion, pointId);
        elements.input.value = draft;
      });
      assistantArticle.querySelector(".ai-message-body")?.prepend(retry);

      if (
        elements.setup &&
        needsKey
      ) {
        elements.setup.open =
          true;
      }

      setStatus(
        ["MODEL_TIMEOUT", "CLIENT_TIMEOUT"].includes(error?.code)
          ? "实时检索超时 · 可重新提问"
          : error?.code === "MODEL_BUSY"
            ? "在线服务繁忙 · 可重试"
            : "在线连接未完成 · 可重试",
        "error"
      );

      conversation =
        conversation.filter(
          (message) =>
            message !== userMessage
        );
    }

    finally {
      busy = false;

      elements.sendButton.disabled =
        false;

      elements.input.disabled =
        false;

      elements.input.focus();
      processNextQueuedQuestion();
    }
  }

  // ========================================================
  // 新对话
  // ========================================================

  function clearConversation() {
    if (busy) { setStatus("请等待当前回答后再开启新对话", "working"); return; }
    conversation = [];
    questionQueue.length = 0;

    sessionStorage.removeItem(
      THREAD_KEY
    );

    elements.messages.innerHTML = `
      <article class="ai-message ai-message--assistant">

        <div class="ai-message-meta">

          <span>
            舆上·成都 · 馆藏 AI
          </span>

          <time>
            新对话
          </time>

        </div>

        <div class="ai-message-body">

          <p>
            对话已清空。选择地点，输入想了解的问题。
          </p>

        </div>

      </article>
    `;

    elements.messages.classList.remove(
      "has-answer-focus"
    );

    if (elements.pointSelect) elements.pointSelect.value = activePointId;

    setStatus(
      "馆藏知识库待命",
      "ready"
    );
  }

  // ========================================================
  // 事件
  // ========================================================

  function bindEvents() {
    elements.form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        sendQuestion(
          elements.input.value
        );
      }
    );

    elements.input.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing && event.keyCode !== 229
        ) {
          event.preventDefault();

          elements.form.requestSubmit();
        }
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        const pointButton =
          event.target.closest(
            "[data-ai-point]"
          );

        if (pointButton) {
          selectPoint(
            pointButton.dataset.aiPoint,
            !pointButton.closest(
              "#aiPointTabs"
            )
          );

          return;
        }

        const questionButton =
          event.target.closest(
            "[data-ai-question]"
          );

        if (questionButton) {
          const demo = findDemoQuestion(
            questionButton.dataset.demoQuestion
          );

          if (demo) {
            sendDemoQuestion(demo);
          } else {
            sendQuestion(
              questionButton.dataset
                .aiQuestion
            );
          }
        }
      }
    );

    elements.clearButton.addEventListener(
      "click",
      clearConversation
    );

    elements.pointSelect.addEventListener("change", () => {
      selectPoint(elements.pointSelect.value);
    });

    elements.saveAccessKey.addEventListener(
      "click",
      () => {
        const key =
          elements.accessKeyInput.value.trim();

        if (!key) {
          localStorage.removeItem(
            STORAGE_KEY
          );
        } else {
          localStorage.setItem(
            STORAGE_KEY,
            key
          );
        }

        window.location.reload();
      }
    );

    document.addEventListener(
      "tuhui:map-select-ai-point",
      (event) => {
        const pointId =
          event.detail?.pointId;

        if (!pointQuestions[pointId]) {
          return;
        }

        selectPoint(
          pointId,
          false,
          false
        );
      }
    );
  }

  // ========================================================
  // 初始化
  // ========================================================

  function initAiGuide() {
    elements.messages =
      document.querySelector(
        "#aiMessages"
      );

    elements.pointSelect = document.querySelector("#aiPointSelect");

    elements.form =
      document.querySelector(
        "#aiAskForm"
      );

    elements.input =
      document.querySelector(
        "#aiQuestionInput"
      );

    elements.sendButton =
      document.querySelector(
        "#aiSendButton"
      );

    elements.clearButton =
      document.querySelector(
        "#aiClearConversation"
      );

    elements.connectionStatus =
      document.querySelector(
        "#aiConnectionStatus"
      );

    elements.liveDot =
      document.querySelector(
        ".ai-live-dot"
      );

    elements.setup =
      document.querySelector(
        "#aiSetup"
      );

    elements.accessKeyInput =
      document.querySelector(
        "#aiAccessKeyInput"
      );

    elements.saveAccessKey =
      document.querySelector(
        "#aiSaveAccessKey"
      );

    if (
      Object.values(elements).some(
        (element) => !element
      )
    ) {
      return;
    }

    elements.accessKeyInput.value =
      getPublishableKey();

    bindEvents();

    selectPoint(
      activePointId,
      false,
      false
    );

    if (
      window.cloudbase &&
      typeof window.cloudbase.init ===
        "function"
    ) {
      setStatus(
        "馆藏知识库待命",
        "ready"
      );
    } else {
      setStatus(
        "等待 CloudBase SDK",
        "working"
      );
    }
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initAiGuide
    );
  } else {
    initAiGuide();
  }
})();
