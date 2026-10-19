/* Anonymous browser counts; no content, phone numbers, IPs or query strings. */
(() => {
  "use strict";
  const page = location.pathname.endsWith("copyright-20260908.html") ? "copyright" : "home";
  const visitorKey = "tuhui-analytics-visitor-v1";
  const excludedKey = "tuhui-analytics-excluded-v1";
  let visitorId, eventId, app, sending = false, done = false, attempts = 0;
  function excluded() {
    try { return localStorage.getItem(excludedKey) === "1"; } catch { return false; }
  }
  if (navigator.webdriver || excluded() || !crypto.randomUUID) return;
  try {
    visitorId = localStorage.getItem(visitorKey);
    if (!/^[a-f0-9-]{36}$/.test(visitorId || "")) {
      visitorId = crypto.randomUUID();
      localStorage.setItem(visitorKey, visitorId);
    }
  } catch {
    // Without persistent storage UV cannot be deduplicated honestly; skip.
    return;
  }
  eventId = crypto.randomUUID();
  async function send() {
    if (!app || done || sending || attempts >= 3 || document.hidden || excluded()) return;
    sending = true; attempts++;
    try {
      const response = await app.callFunction({ name: "siteAnalytics", data: { action: "track", visitorId, eventId, page }, parse: true });
      let result = response.result;
      if (typeof result === "string") result = JSON.parse(result);
      if (!result?.ok) throw new Error("unavailable");
      done = true;
    } catch {
      if (attempts < 3) setTimeout(send, attempts * 3000);
    } finally { sending = false; }
  }
  window.addEventListener("tuhui:cloud-ready", event => {
    if (event.detail?.ready) { app = window.tuhuiCloudApp; void send(); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void send(); });
  window.addEventListener("online", () => void send());
  // Copyright is the only standalone public HTML page. Homepage reuses the
  // existing SDK and signed-in session; map rendering never waits for analytics.
  if (page === "copyright") {
    const sdk = document.createElement("script");
    sdk.src = "https://static.cloudbase.net/cloudbase-js-sdk/3.7.1/cloudbase.full.js";
    sdk.async = true;
    sdk.onload = async () => {
      try {
        const config = window.TUHUI_CONFIG;
        app = window.cloudbase.init({ env: config.envId, region: config.region, accessKey: config.publishableKey });
        const session = await app.auth.getSession();
        if (session.error) return;
        if (!session.data?.session) {
          const login = await app.auth.signInAnonymously();
          if (login.error) return;
        }
        await send();
      } catch { /* Analytics must never interrupt reading. */ }
    };
    document.head.append(sdk);
  }
})();
