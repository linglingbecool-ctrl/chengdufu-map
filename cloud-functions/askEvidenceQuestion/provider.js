"use strict";

/*
 * 模型服务商配置集中在这一处。更换免费服务商时，只改默认值或环境变量，
 * 检索、缓存与前端业务代码无需改动。
 */
const PROVIDER_CONFIG = Object.freeze({
  providerName:
    process.env.MODEL_PROVIDER_NAME || "zhipu",
  apiUrl:
    process.env.MODEL_API_URL ||
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  modelId:
    process.env.MODEL_ID || "glm-4.7-flash",
  apiKeyEnvName:
    process.env.MODEL_API_KEY_ENV || "ZHIPU_API_KEY",
  timeoutMs: Math.max(
    5000,
    Math.min(Number(process.env.MODEL_TIMEOUT_MS) || 15000, 18000)
  )
});

function createProviderError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function getApiKey() {
  return String(
    process.env[PROVIDER_CONFIG.apiKeyEnvName] || ""
  ).trim();
}

async function requestOnce(messages, modelId, timeoutMs) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw createProviderError(
      "MODEL_NOT_CONFIGURED",
      `云函数环境变量 ${PROVIDER_CONFIG.apiKeyEnvName} 尚未配置`
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(
      PROVIDER_CONFIG.apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: false,
          temperature: 0.2,
          max_tokens: 1000,
          thinking: {
            type: "disabled"
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      let payload = {};
      try { payload = JSON.parse(await response.text()); } catch (_) { /* 非JSON错误仍按HTTP状态处理。 */ }
      const providerCode = String(payload?.error?.code || "");
      const quotaLimited = ["1113", "1308", "1309", "1310"].includes(providerCode);
      throw createProviderError(
        providerCode === "1301" ? "MODEL_CONTENT_FILTERED" : quotaLimited ? "MODEL_QUOTA_EXCEEDED"
          : response.status === 401 || response.status === 403 ? "MODEL_AUTH_FAILED"
          : response.status === 429 ? "MODEL_BUSY" : "MODEL_UNAVAILABLE",
        quotaLimited ? "模型服务额度或套餐受限"
          : response.status === 429 ? "模型当前请求受限" : `模型接口返回 HTTP ${response.status}`,
        { status: response.status, providerCode }
      );
    }

    const payload = await response.json();
    const content =
      payload?.choices?.[0]?.message?.content;

    if (!String(content || "").trim()) {
      throw createProviderError(
        "MODEL_EMPTY_RESPONSE",
        "模型未返回可用文字"
      );
    }

    return {
      content: String(content).trim(),
      usage: payload?.usage || null,
      model: modelId
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createProviderError(
        "MODEL_TIMEOUT",
        "实时模型响应时间较长，请稍后重试。"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callModel(messages) {
  const startedAt = Date.now();
  try {
    return await requestOnce(messages, PROVIDER_CONFIG.modelId, PROVIDER_CONFIG.timeoutMs);
  } catch (error) {
    const remainingMs = PROVIDER_CONFIG.timeoutMs - (Date.now() - startedAt);
    // 只处理已确认的智谱容量错误1305；不绕过账号额度/权限限制。
    // 两次请求共享最多18秒预算，备用也是官方免费模型，禁止跨服务商转发密钥。
    const canFallback = error?.providerCode === "1305" && error?.code === "MODEL_BUSY" &&
      PROVIDER_CONFIG.apiUrl === "https://open.bigmodel.cn/api/paas/v4/chat/completions" &&
      PROVIDER_CONFIG.modelId.toLowerCase() === "glm-4.7-flash" && remainingMs >= 3000;
    if (!canFallback) throw error;
    return requestOnce(messages, "glm-4-flash-250414", remainingMs);
  }
}

module.exports = {
  PROVIDER_CONFIG,
  callModel
};
