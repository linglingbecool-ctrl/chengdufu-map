const cloudbase = require("@cloudbase/node-sdk");
const { createHash } = require("node:crypto");
const receiptId = (id, uid) => createHash("sha256").update(JSON.stringify([id, uid])).digest("hex");

const app = cloudbase.init({
  env: "chengdufu-map-d4g459au02132689e"
});

const db = app.database();

exports.main = async (event, context) => {
  try {
    const requestedLimit = Number.isFinite(Number(event?.limit)) ? Math.floor(Number(event.limit)) : 100;
    const cursor = event?.cursor ?? "";
    if (typeof cursor !== "string" || cursor.length > 128) return { ok: false, message: "分页参数无效", memories: [] };

    const limit = Math.max(
      1,
      Math.min(requestedLimit, 100)
    );

    const result = await db
      .collection("contributions")
      .where({
        status: "approved",
        consentToPublish: true,
        rightsConfirmed: true,
        ...(cursor ? { _id: db.command.gt(cursor) } : {})
      })
      .orderBy("_id", "asc")
      .limit(limit)
      .get();

    if (!Array.isArray(result?.data)) throw new Error("公开记忆读取未完成");
    const data = result.data;
    const identity = app.auth().getUserInfo();
    const uid = identity?.uid || identity?.openId || identity?.customUserId;
    const ids = data.map(item => item._id);
    const [totals, receipts] = ids.length ? await Promise.all([
      db.collection("memoryLikeTotals").where({ _id: db.command.in(ids) }).limit(100).get(),
      uid ? db.collection("memoryLikes").where({ _id: db.command.in(ids.map(id => receiptId(id, uid))) }).limit(100).get() : { data: [] }
    ]) : [{ data: [] }, { data: [] }];
    if (!Array.isArray(totals?.data) || !Array.isArray(receipts?.data)) throw new Error("赞数读取未完成");
    const counts = new Map(totals.data.map(item => [item._id, item.count]));
    const likedIds = new Set(receipts.data.filter(item => item.liked === true).map(item => item.memoryId));

    const memories = data.map((item) => {
      const useCollaborativeDraft =
        item.collaborativeDraftAccepted === true &&
        typeof item.collaborativeDraft === "string" &&
        item.collaborativeDraft.trim();

      const publicContent =
        useCollaborativeDraft
          ? item.collaborativeDraft.trim()
          : String(
              item.originalContent || ""
            ).trim();

      const originalContent =
        String(
          item.originalContent || ""
        ).trim();

      return {
        id: item._id || "",
        likeCount: Number.isSafeInteger(counts.get(item._id)) && counts.get(item._id) >= 0 ? counts.get(item._id) : 0,
        likedByMe: likedIds.has(item._id),
        pointId: item.pointId || "",
        pointName: item.pointName || "",

        // 已获公开授权并经馆员终审的记录，作为公共档案同时展示
        // 用户真实原文与其明确采纳的协作整理稿。
        originalContent,
        collaborativeDraft:
          useCollaborativeDraft
            ? item.collaborativeDraft.trim()
            : "",
        publicContent,
        contentSource:
          useCollaborativeDraft
            ? "collaborativeDraft"
            : "originalContent",

        approximateTime: item.approximateTime || "",
        materialType: item.materialType || "text",
        coverStyle: item.coverStyle === "current" ? "current" : "map",
        memoryType: item.memoryType || "general",
        writingStyleName: item.writingStyleName || "",
        status: "approved",
        reviewStatusLabel: "馆员终审通过",
        // 公开时间只认馆员实际补录的 publishedAt，不以审核或更新时间代替。
        publishedAt:
          item.publishedAt || null,
        approvedAt: item.approvedAt || null,
        reviewedAt: item.reviewedAt || null,
        createdAt: item.createdAt || null,

        imageFileIds: Array.isArray(item.imageFileIds)
          ? item.imageFileIds.slice(0, 3)
          : [],

        imageCount: Number(item.imageCount) || 0
      };
    });

    return {
      ok: true,
      count: memories.length,
      nextCursor: data.length === limit ? data[data.length - 1]._id : null,
      memories
    };
  } catch (error) {
    console.error(
      "getPublicMemories failed:",
      error
    );

    return {
      ok: false,
      message:
        error?.message ||
        "读取公开城市记忆失败",
      memories: []
    };
  }
};
