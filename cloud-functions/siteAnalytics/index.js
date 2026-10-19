"use strict";
const { createHash } = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const hash = value => createHash("sha256").update(value).digest("hex");
const dayOf = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const pages = { home: "网站首页", copyright: "版权声明" };
function fail(code) { throw Object.assign(new Error(code), { code }); }
function checked(result) { if (!result || result.code) fail("DATABASE_ERROR"); return result; }
function row(result) {
  checked(result);
  if (!("data" in result)) fail("DATABASE_ERROR");
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_COUNTER");
  return value;
}
function increment(value = 0, delta = 1) { return count(count(value) + delta); }

exports.main = async (event = {}) => {
  try {
    const identity = app.auth().getUserInfo();
    const uid = identity?.uid || identity?.openId || identity?.customUserId;
    if (!uid) fail("NOT_LOGIN");
    if (!["track", "summary"].includes(event.action)) fail("INVALID_ACTION");
    if (event.action === "track" &&
        (!/^[a-f0-9-]{36}$/.test(event.visitorId || "") || !/^[a-f0-9-]{36}$/.test(event.eventId || "") ||
        typeof event.visitorId !== "string" || typeof event.eventId !== "string" ||
        !Object.hasOwn(pages, event.page))) fail("INVALID_INPUT");
    const admins = checked(await db.collection("users").where({ openid: uid, role: "admin", enabled: true }).limit(1).get());
    if (!Array.isArray(admins.data)) fail("DATABASE_ERROR");
    const admin = admins.data.length > 0;
    if (event.action === "summary") {
      if (!admin) fail("NO_ADMIN_PERMISSION");
      const now = Date.now();
      // One transaction gives consistent cumulative and daily counters.
      let summary;
      await db.runTransaction(async tx => {
        const counters = tx.collection("siteAnalyticsCounters");
        const total = row(await counters.doc("all").get()) || { pv: 0, uv: 0, startedAt: null };
        const days = [];
        for (let i = 29; i >= 0; i--) {
          const day = dayOf(now - i * 86400000);
          const saved = row(await counters.doc(`day-${day}`).get());
          days.push({ day, tracked: Boolean(total.startedAt && day >= dayOf(total.startedAt)), pv: count(saved?.pv ?? 0), uv: count(saved?.uv ?? 0) });
        }
        const pageViews = [];
        for (const [id, label] of Object.entries(pages)) {
          const saved = row(await counters.doc(`page-${id}`).get());
          pageViews.push({ id, label, pv: count(saved?.pv || 0) });
        }
        summary = { pv: count(total.pv), uv: count(total.uv), startedAt: total.startedAt, updatedAt: now, days, pages: pageViews };
      });
      return { ok: true, ...summary };
    }
    if (admin) return { ok: true, status: "excluded_admin" };
    const visitor = hash(event.visitorId);
    const eventKey = hash(`${event.visitorId}:${event.eventId}`);
    let status;
    // For this small site, a single transactional total prevents lost counts.
    // If write contention rises, migrate to sharded counters + aggregation.
    await db.runTransaction(async tx => {
      const now = Date.now(), day = dayOf(now);
      const receipts = tx.collection("siteAnalyticsEvents").doc(eventKey);
      if (row(await receipts.get())) { status = "duplicate"; return; }
      const visitorRef = tx.collection("siteAnalyticsVisitors").doc(visitor);
      const dayVisitorRef = tx.collection("siteAnalyticsVisitors").doc(`${day}-${visitor}`);
      const known = row(await visitorRef.get());
      const knownToday = row(await dayVisitorRef.get());
      // Basic abuse bound, not bot-proof analytics: at most 120 recorded loads
      // per browser per minute. Normal refreshes still count as page views.
      const minute = Math.floor(now / 60000);
      const recent = known?.minute === minute ? known.minuteCount : 0;
      if (recent >= 120) { status = "rate_limited"; return; }
      const counters = tx.collection("siteAnalyticsCounters");
      const totalRef = counters.doc("all"), dayRef = counters.doc(`day-${day}`), pageRef = counters.doc(`page-${event.page}`);
      const total = row(await totalRef.get()), daily = row(await dayRef.get()), page = row(await pageRef.get());
      checked(await totalRef.set({ pv: increment(total?.pv), uv: increment(total?.uv, known ? 0 : 1), startedAt: total?.startedAt || now, updatedAt: now }));
      checked(await dayRef.set({ day, pv: increment(daily?.pv), uv: increment(daily?.uv, knownToday ? 0 : 1) }));
      checked(await pageRef.set({ page: event.page, pv: increment(page?.pv) }));
      checked(await visitorRef.set({ firstSeen: known?.firstSeen || now, minute, minuteCount: recent + 1 }));
      if (!knownToday) checked(await dayVisitorRef.set({ day }));
      checked(await receipts.set({ day, page: event.page, createdAt: now }));
      status = "recorded";
    });
    return { ok: true, status };
  } catch (error) {
    const allowed = ["NOT_LOGIN", "INVALID_ACTION", "INVALID_INPUT", "NO_ADMIN_PERMISSION", "INVALID_COUNTER", "DATABASE_ERROR"];
    return { ok: false, code: allowed.includes(error.code) ? error.code : "ANALYTICS_UNAVAILABLE" };
  }
};
