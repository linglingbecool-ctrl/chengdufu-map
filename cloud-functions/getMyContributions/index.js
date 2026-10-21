const cloudbase = require("@cloudbase/node-sdk");
const numbers = require("./memory-numbers");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const auth = app.auth();

exports.main = async () => {
  try {
    const userInfo = auth.getUserInfo();
    const callerId =
      userInfo?.uid ||
      userInfo?.openId ||
      userInfo?.customUserId ||
      "";

    if (!callerId) {
      return {
        ok: false,
        code: "NOT_LOGIN",
        message: "当前没有有效登录身份"
      };
    }

    const links = await db.collection("memoryAccountLinks")
      .where({ targetUid: callerId }).limit(51).get();
    // At most 50 linked browsers per account for this small public project.
    // Raise this with cursor pagination if a real account reaches the limit.
    if (links.data?.length > 50) throw new Error("关联浏览器较多，请联系馆员协助读取全部记录。");
    const ownerIds = [...new Set([callerId, ...(links.data || []).map(link => link.sourceUid).filter(Boolean)])];
    const data = [];
    for (const userId of ownerIds) {
      let cursor = "";
      while (true) {
        const filter = { userId };
        if (cursor) filter._id = db.command.gt(cursor);
        const page = await db.collection("contributions").where(filter)
          .orderBy("_id", "asc").limit(100).get();
        const rows = Array.isArray(page.data) ? page.data : [];
        data.push(...rows);
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1]._id;
      }
    }
    data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const numbered = await numbers.decorate(db, callerId, data);
    const items = data.map((item) => ({
      id: item._id || "",
      memoryNumber: numbered.numbers[item._id] || "",
      humanReviewedAt: item.humanReviewedAt || null,
      pointId: item.pointId || "",
      pointName: item.pointName || "",
      originalContent: item.originalContent || "",
      collaborativeDraft: typeof item.collaborativeDraft === "string" ? item.collaborativeDraft : "",
      collaborativeDraftAccepted: item.collaborativeDraftAccepted === true,
      approximateTime: item.approximateTime || "",
      materialType: item.materialType || "text",
      imageCount: Number(item.imageCount) || 0,
      imageFileIds: Array.isArray(item.imageFileIds)
        ? item.imageFileIds.slice(0, 3)
        : [],
      status: item.status || "pending",
      aiReviewStatus: item.aiReviewStatus || "",
      createdAt: item.createdAt || null,
      memoryType: item.memoryType || "",
      contributionTags: Array.isArray(item.contributionTags)
        ? item.contributionTags
        : [],
      writingStyleId: item.writingStyleId || "original",
      writingStyleName: item.writingStyleName || "保持原声"
    }));

    const approvedItems = items.filter(
      (item) => item.status === "approved"
    );

    const processingItems = items.filter(
      (item) =>
        item.status === "processing" ||
        item.status === "pending"
    );

    const rejectedItems = items.filter(
      (item) => item.status === "rejected"
    );

    const approvedPointIds = [
      ...new Set(
        approvedItems
          .map((item) => item.pointId)
          .filter(Boolean)
      )
    ];

    const badges = {
      imageRecorder: approvedItems.some(
        (item) => item.imageCount > 0
      ),

      placeNameExplorer: approvedItems.some(
        (item) =>
          item.memoryType === "place_name" ||
          item.contributionTags.includes("place_name")
      ),

      oralHistorian: approvedItems.some(
        (item) =>
          item.memoryType === "oral_history" ||
          item.contributionTags.includes("oral_history")
      ),

      cityWalker: approvedPointIds.length >= 3,

      scuMemoryKeeper: Boolean(numbered.badge),

      familyMemoryKeeper: approvedItems.some(
        (item) =>
          item.writingStyleId === "childvoice" ||
          item.writingStyleName === "童言童语"
      )
    };

    return {
      ok: true,
      callerId,
      summary: {
        total: items.length,
        processing: processingItems.length,
        approved: approvedItems.length,
        rejected: rejectedItems.length,
        litPoints: approvedPointIds.length,
        isContributor: approvedItems.length > 0
      },
      badges,
      badgeNumbers: numbered.badges,
      items
    };
  } catch (error) {
    console.error("getMyContributions failed:", error);

    return {
      ok: false,
      code:
        error?.code ||
        "GET_MY_CONTRIBUTIONS_FAILED",
      message:
        error?.message ||
        "读取个人城市记忆失败",
      items: []
    };
  }
};
