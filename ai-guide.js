// 图绘成都：六点位馆藏证据问答界面
// 只渲染 Agent 的最终文字增量，调试用工具 JSON 不进入公众界面。

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

  let activePointId = "jiuyanqiao";
  let aiApp = null;
  let busy = false;
  let conversation = [];

  const elements = {};

  function createId(prefix) {
    const suffix = window.crypto?.randomUUID
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function inlineMarkup(value) {
    return value
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /(《[^》]+》(?:（PDF第[^）]+页）)?)/g,
        '<mark class="ai-citation">$1</mark>'
      )
      .replace(
        /(PDF第\d+(?:—\d+)?页)/g,
        '<span class="ai-page">$1</span>'
      );
  }

  function publicFacingText(value) {
    return String(value ?? "")
      .replace(/review_status\s*为\s*needs_review/gi, "核查状态为“仍需复核”")
      .replace(/review_status\s*为\s*needs_research/gi, "核查状态为“仍需补充研究”")
      .replace(/verification_status\s*为\s*needs_review/gi, "核验状态为“仍需复核”")
      .replace(/verification_status\s*为\s*needs_research/gi, "核验状态为“仍需补充研究”")
      .replace(/\bneeds_review\b/gi, "仍需复核")
      .replace(/\bneeds_research\b/gi, "仍需补充研究");
  }

  function renderAnswer(text) {
    const lines = escapeHtml(publicFacingText(text)).split(/\r?\n/);
    const html = [];
    let listOpen = false;

    const closeList = () => {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        return;
      }

      const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
      const boldHeading = trimmed.match(/^\*\*(.+)\*\*$/);
      const plainHeading = trimmed.match(
        /^(文献记载|待核实信息|后人研究|关系判定|小结|提示)(?:（[^）]+）)?[：:]?$/
      );
      if (heading || boldHeading || plainHeading) {
        closeList();
        html.push(`<h4>${inlineMarkup((heading || boldHeading || plainHeading)[0].replace(/^#+\s+/, "").replace(/^\*\*|\*\*$/g, ""))}</h4>`);
        return;
      }

      const bullet = trimmed.match(/^[-•]\s+(.+)$/);
      if (bullet) {
        if (!listOpen) {
          html.push("<ul>");
          listOpen = true;
        }
        html.push(`<li>${inlineMarkup(bullet[1])}</li>`);
        return;
      }

      closeList();
      html.push(`<p>${inlineMarkup(trimmed)}</p>`);
    });

    closeList();
    return html.join("");
  }

  function addMessage(role, content, options = {}) {
    const article = document.createElement("article");
    article.className = `ai-message ai-message--${role}`;
    article.innerHTML = `
      <div class="ai-message-meta">
        <span>${role === "assistant" ? "图绘成都 · AI 馆员" : "访客提问"}</span>
        <time>${options.status || "刚刚"}</time>
      </div>
      <div class="ai-message-body">${
        role === "assistant" ? renderAnswer(content) : `<p>${escapeHtml(content)}</p>`
      }</div>
    `;
    elements.messages.appendChild(article);
    elements.messages.scrollTo({ top: elements.messages.scrollHeight, behavior: "smooth" });
    return article;
  }

  function updateAssistantMessage(article, text, status) {
    article.querySelector(".ai-message-body").innerHTML = text
      ? renderAnswer(text)
      : '<div class="ai-thinking"><i></i><i></i><i></i><span>正在查阅点位档案与文献片段</span></div>';
    article.querySelector("time").textContent = status;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function setStatus(label, state = "ready") {
    elements.connectionStatus.textContent = label;
    elements.liveDot.dataset.state = state;
  }

  function getPublishableKey() {
    return String(config.publishableKey || localStorage.getItem(STORAGE_KEY) || "").trim();
  }

  function getAiClient() {
    if (aiApp?.ai) return aiApp.ai();
    if (!window.cloudbase?.init) {
      throw new Error("CloudBase Web SDK 尚未加载");
    }

    const accessKey = getPublishableKey();
    const initOptions = { env: config.envId, region: config.region };
    if (accessKey) initOptions.accessKey = accessKey;

    aiApp = window.cloudbase.init(initOptions);
    if (typeof aiApp.ai !== "function") {
      throw new Error("当前 CloudBase SDK 不包含 AI 调用模块");
    }
    return aiApp.ai();
  }

  function selectPoint(pointId, shouldScroll = false) {
    if (!pointQuestions[pointId]) return;
    activePointId = pointId;

    document.querySelectorAll("[data-ai-point]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.aiPoint === pointId);
    });

    elements.suggestions.innerHTML = pointQuestions[pointId].questions
      .map(
        (question, index) => `
          <button type="button" data-ai-question="${escapeHtml(question)}">
            <span>0${index + 1}</span>${escapeHtml(question)}
          </button>
        `
      )
      .join("");

    elements.input.placeholder = `向 AI 馆员询问${pointQuestions[pointId].name}……`;
    if (shouldScroll) {
      document.querySelector("#ai-guide")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => elements.input.focus(), 550);
    }
  }

  async function sendQuestion(question) {
    const cleanedQuestion = String(question || "").trim();
    if (!cleanedQuestion || busy) return;

    busy = true;
    elements.sendButton.disabled = true;
    elements.input.disabled = true;
    setStatus("正在检索馆藏证据", "working");

    addMessage("user", cleanedQuestion);
    const assistantArticle = addMessage("assistant", "", { status: "查阅中" });
    updateAssistantMessage(assistantArticle, "", "查阅中");

    const userMessage = { id: createId("msg"), role: "user", content: cleanedQuestion };
    conversation.push(userMessage);
    let answer = "";

    try {
      const ai = getAiClient();
      const response = await ai.bot.sendMessage({
        botId: config.agentId,
        threadId: getThreadId(),
        runId: createId("run"),
        messages: conversation,
        tools: [],
        context: [],
        state: {},
        forwardedProps: {}
      });

      if (response.dataStream?.[Symbol.asyncIterator]) {
        for await (const event of response.dataStream) {
          if (event.type === "TEXT_MESSAGE_CONTENT") {
            answer += event.delta || "";
            updateAssistantMessage(assistantArticle, answer, "证据生成中");
          } else if (event.type === "RUN_ERROR") {
            throw new Error(event.message || "Agent 返回错误");
          }
        }
      } else if (response.textStream?.[Symbol.asyncIterator]) {
        for await (const delta of response.textStream) {
          answer += String(delta || "");
          updateAssistantMessage(assistantArticle, answer, "证据生成中");
        }
      } else {
        throw new Error("未获得流式回答");
      }

      if (!answer.trim()) throw new Error("Agent 未返回文字回答");

      conversation.push({ id: createId("msg"), role: "assistant", content: answer });
      updateAssistantMessage(assistantArticle, answer, "已核对知识库");
      setStatus("馆藏知识库已连接", "ready");
    } catch (error) {
      console.error("AI_GUIDE_FAILED", { name: error?.name, message: error?.message });
      const needsKey = !getPublishableKey();
      const friendlyMessage = needsKey
        ? "网页尚未配置 CloudBase Publishable Key。请展开左侧“连接设置”，填写网页公开密钥后重试。请勿填写管理员 API Key。"
        : "馆藏 AI 暂时未能完成检索，请稍后重试。地图与点位资料仍可正常浏览。";
      updateAssistantMessage(assistantArticle, friendlyMessage, "连接未完成");
      elements.setup.open = needsKey;
      setStatus("馆藏 AI 等待连接", "error");
      conversation = conversation.filter((message) => message !== userMessage);
    } finally {
      busy = false;
      elements.sendButton.disabled = false;
      elements.input.disabled = false;
      elements.input.value = "";
      elements.input.focus();
    }
  }

  function clearConversation() {
    conversation = [];
    sessionStorage.removeItem(THREAD_KEY);
    elements.messages.innerHTML = `
      <article class="ai-message ai-message--assistant">
        <div class="ai-message-meta"><span>图绘成都 · AI 馆员</span><time>新对话</time></div>
        <div class="ai-message-body"><p>对话已清空。请选择点位，开始一次新的馆藏证据检索。</p></div>
      </article>
    `;
  }

  function bindEvents() {
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendQuestion(elements.input.value);
    });

    elements.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements.form.requestSubmit();
      }
    });

    document.addEventListener("click", (event) => {
      const pointButton = event.target.closest("[data-ai-point]");
      if (pointButton) {
        selectPoint(pointButton.dataset.aiPoint, !pointButton.closest("#aiPointTabs"));
        return;
      }

      const questionButton = event.target.closest("[data-ai-question]");
      if (questionButton) sendQuestion(questionButton.dataset.aiQuestion);
    });

    elements.clearButton.addEventListener("click", clearConversation);

    elements.saveAccessKey.addEventListener("click", () => {
      const key = elements.accessKeyInput.value.trim();
      if (!key) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, key);
      }
      window.location.reload();
    });
  }

  function initAiGuide() {
    elements.messages = document.querySelector("#aiMessages");
    elements.suggestions = document.querySelector("#aiSuggestions");
    elements.form = document.querySelector("#aiAskForm");
    elements.input = document.querySelector("#aiQuestionInput");
    elements.sendButton = document.querySelector("#aiSendButton");
    elements.clearButton = document.querySelector("#aiClearConversation");
    elements.connectionStatus = document.querySelector("#aiConnectionStatus");
    elements.liveDot = document.querySelector(".ai-live-dot");
    elements.setup = document.querySelector("#aiSetup");
    elements.accessKeyInput = document.querySelector("#aiAccessKeyInput");
    elements.saveAccessKey = document.querySelector("#aiSaveAccessKey");

    if (Object.values(elements).some((element) => !element)) return;

    elements.accessKeyInput.value = getPublishableKey();
    bindEvents();
    selectPoint(activePointId);

    if (window.cloudbase?.init) {
      setStatus("馆藏知识库待命", "ready");
    } else {
      setStatus("等待 CloudBase SDK", "working");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAiGuide);
  } else {
    initAiGuide();
  }
})();
