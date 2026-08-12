// 图绘成都：馆藏证据问答前端
// 功能：六点位切换、三道固定示范问题、CloudBase Agent 流式回答。
// 公众界面只渲染 Agent 最终文字，不展示工具调用 JSON。

(function () {
  "use strict";

  const config = window.TUHUI_CONFIG || {};

  const STORAGE_KEY = "tuhui_cloudbase_publishable_key";
  const THREAD_KEY = "tuhui_agent_thread_id";

  // 六个核心点位。
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
      name: "满城",
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
      label: "古图核证",
      question: "九眼桥在古图中叫什么？请给出文献依据。"
    },
    {
      label: "文献对读",
      question:
        "《成都通览》和《成都街巷志》关于九眼桥名称沿革分别怎么记载？两书有哪些不同？"
    },
    {
      label: "证据边界",
      question: "红牌楼的名称起源是什么？现有文献能证实吗？"
    }
  ];

  let activePointId = "jiuyanqiao";
  let aiApp = null;
  let busy = false;
  let conversation = [];

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

      <div class="ai-evidence-card-body">
    `;
  }

  // ========================================================
  // 回答渲染
  // ========================================================

  function renderAnswer(text) {
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
          sectionClass = " ai-answer-heading--conclusion";
        }

        if (heading === "文献依据") {
          sectionClass = " ai-answer-heading--evidence";
        }

        if (heading === "证据边界") {
          sectionClass = " ai-answer-heading--boundary";
        }

        html.push(
          `<h4 class="ai-answer-heading${sectionClass}">
            ${inlineMarkup(heading)}
          </h4>`
        );

        return;
      }

      // ----------------------------------------
      // 文献依据中的 1｜2｜3｜ 自动生成证据卡
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
        ? "图绘成都 · AI 馆员"
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

    elements.messages.scrollTop =
      elements.messages.scrollHeight;
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

  function getAiClient() {
    if (
      aiApp &&
      typeof aiApp.ai === "function"
    ) {
      return aiApp.ai();
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

    aiApp =
      window.cloudbase.init(
        initOptions
      );

    if (
      !aiApp ||
      typeof aiApp.ai !== "function"
    ) {
      throw new Error(
        "当前 CloudBase SDK 不包含 AI 调用模块"
      );
    }

    return aiApp.ai();
  }

  // ========================================================
  // 三道比赛示范问题
  // ========================================================

  function renderDemoQuestions() {
    if (!elements.suggestions) {
      return;
    }

    elements.suggestions.innerHTML =
      demoQuestions
        .map(
          (item, index) => `
            <button
              type="button"
              class="ai-demo-question"
              data-ai-question="${escapeHtml(
                item.question
              )}"
              title="${escapeHtml(
                item.question
              )}"
            >

              <span>
                0${index + 1}
              </span>

              ${escapeHtml(
                item.label
              )}｜${escapeHtml(
                item.question
              )}

            </button>
          `
        )
        .join("");
  }

  // ========================================================
  // 左侧六点位
  // ========================================================

  function selectPoint(
    pointId,
    shouldScroll = false
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

    // 固定显示三道比赛演示题
    renderDemoQuestions();

    if (elements.input) {
      elements.input.placeholder =
        `向 AI 馆员询问${pointQuestions[pointId].name}……`;
    }

    if (shouldScroll) {
      document
        .querySelector("#ai-guide")
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

  async function sendQuestion(question) {
    const cleanedQuestion =
      String(question || "").trim();

    if (
      !cleanedQuestion ||
      busy
    ) {
      return;
    }

    busy = true;

    elements.sendButton.disabled =
      true;

    elements.input.disabled =
      true;

    setStatus(
      "正在检索馆藏证据",
      "working"
    );

    addMessage(
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

    let answer = "";

    try {
      const ai =
        getAiClient();

      const response =
        await ai.bot.sendMessage({
          botId: config.agentId,
          threadId: getThreadId(),
          runId: createId("run"),
          messages: conversation,
          tools: [],
          context: [],
          state: {},
          forwardedProps: {}
        });

      // ----------------------------------------
      // AG-UI dataStream
      // ----------------------------------------

      if (
        response.dataStream &&
        response.dataStream[
          Symbol.asyncIterator
        ]
      ) {
        for await (
          const event of
          response.dataStream
        ) {
          // 只接收最终自然语言文字。
          // 工具调用 JSON 不进入公众页面。
          if (
            event.type ===
            "TEXT_MESSAGE_CONTENT"
          ) {
            answer +=
              event.delta || "";

            updateAssistantMessage(
              assistantArticle,
              answer,
              "证据生成中"
            );
          }

          if (
            event.type ===
            "RUN_ERROR"
          ) {
            throw new Error(
              event.message ||
                "Agent 返回错误"
            );
          }
        }
      }

      // ----------------------------------------
      // 兼容 textStream
      // ----------------------------------------

      else if (
        response.textStream &&
        response.textStream[
          Symbol.asyncIterator
        ]
      ) {
        for await (
          const delta of
          response.textStream
        ) {
          answer +=
            String(delta || "");

          updateAssistantMessage(
            assistantArticle,
            answer,
            "证据生成中"
          );
        }
      }

      else {
        throw new Error(
          "未获得流式回答"
        );
      }

      if (!answer.trim()) {
        throw new Error(
          "Agent 未返回文字回答"
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
        "已核对知识库"
      );

      setStatus(
        "馆藏知识库已连接",
        "ready"
      );
    }

    catch (error) {
      console.error(
        "AI_GUIDE_FAILED",
        {
          name: error?.name,
          message: error?.message
        }
      );

      const needsKey =
        !getPublishableKey();

      const friendlyMessage =
        needsKey
          ? "网页尚未配置 CloudBase Publishable Key，请检查网页公开连接配置。"
          : "馆藏 AI 暂时未能完成检索，请稍后重试。地图与点位资料仍可正常浏览。";

      updateAssistantMessage(
        assistantArticle,
        friendlyMessage,
        "连接未完成"
      );

      if (
        elements.setup &&
        needsKey
      ) {
        elements.setup.open =
          true;
      }

      setStatus(
        "馆藏 AI 等待连接",
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

      elements.input.value = "";

      elements.input.focus();
    }
  }

  // ========================================================
  // 新对话
  // ========================================================

  function clearConversation() {
    conversation = [];

    sessionStorage.removeItem(
      THREAD_KEY
    );

    elements.messages.innerHTML = `
      <article class="ai-message ai-message--assistant">

        <div class="ai-message-meta">

          <span>
            图绘成都 · AI 馆员
          </span>

          <time>
            新对话
          </time>

        </div>

        <div class="ai-message-body">

          <p>
            对话已清空。请选择点位，或点击下方示范问题，开始一次新的馆藏证据检索。
          </p>

        </div>

      </article>
    `;

    renderDemoQuestions();

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
          !event.shiftKey
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
          sendQuestion(
            questionButton.dataset
              .aiQuestion
          );
        }
      }
    );

    elements.clearButton.addEventListener(
      "click",
      clearConversation
    );

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
  }

  // ========================================================
  // 初始化
  // ========================================================

  function initAiGuide() {
    elements.messages =
      document.querySelector(
        "#aiMessages"
      );

    elements.suggestions =
      document.querySelector(
        "#aiSuggestions"
      );

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

    selectPoint(activePointId);

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
