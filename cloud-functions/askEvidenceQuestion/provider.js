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

function getRetryDelay(response) {
  const seconds = Number(
    response.headers.get("retry-after")
  );

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 2000);
  }

  return 1200;
}

async function requestOnce(messages) {
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
    PROVIDER_CONFIG.timeoutMs
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
          model: PROVIDER_CONFIG.modelId,
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

    if (response.status === 429) {
      throw createProviderError(
        "MODEL_BUSY",
        "免费模型当前请求较多",
        { retryAfterMs: getRetryDelay(response) }
      );
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw createProviderError(
        response.status === 401 || response.status === 403
          ? "MODEL_AUTH_FAILED"
          : "MODEL_UNAVAILABLE",
        `模型接口返回 HTTP ${response.status}`,
        {
          status: response.status,
          responsePreview: responseText.slice(0, 240)
        }
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
      usage: payload?.usage || null
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
  // 一次请求最多18秒；繁忙时直接交还已有证据，避免重试跨过前端等待上限。
  return requestOnce(messages);
}

module.exports = {
  PROVIDER_CONFIG,
  callModel
};
