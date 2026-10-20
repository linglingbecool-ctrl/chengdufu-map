const cloudbase = require("@cloudbase/node-sdk");
const numbers = require("./memory-numbers");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const auth = app.auth();

/**
 * 验证当前调用者是否为馆员管理员。
 *
 * Web 匿名登录优先使用 uid。
 */
async function requireAdmin() {
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
      message: "当前调用没有有效登录身份"
    };
  }

  const result = await db
    .collection("users")
    .where({
      openid: callerId,
      role: "admin",
      enabled: true
    })
    .limit(1)
    .get();

  const admins = Array.isArray(result?.data)
    ? result.data
    : [];

  if (!admins.length) {
    return {
      ok: false,
      code: "NO_ADMIN_PERMISSION",
      message:
        `当前身份未配置为馆员管理员。当前用户ID：${callerId}`
    };
  }

  return {
    ok: true,
    callerId
  };
}

/**
 * 馆员人工终审
 *
 * decision:
 *
 * approved
 *   → 批准公开
 *
 * needs_review
 *   → 继续核验
 *
 * rejected
 *   → 不予公开
 */
exports.main = async (event) => {
  const submissionId =
    typeof event?.submissionId === "string"
      ? event.submissionId.trim()
      : "";

  const decision =
    typeof event?.decision === "string"
      ? event.decision.trim()
      : "";

  const note =
    typeof event?.note === "string"
      ? event.note
          .trim()
          .slice(0, 500)
      : "";

  const allowedDecisions = [
    "approved",
    "needs_review",
    "rejected"
  ];

  /*
   * 基础参数检查
   */
  if (!submissionId) {
    return {
      ok: false,
      code: "MISSING_SUBMISSION_ID",
      message: "缺少 submissionId"
    };
  }

  if (
    !allowedDecisions.includes(
      decision
    )
  ) {
    return {
      ok: false,
      code: "INVALID_DECISION",
      message: "审核决定无效"
    };
  }

  try {
    /*
     * 第一步：
     * 验证当前调用者是不是馆员管理员
     */
    const adminAuth =
      await requireAdmin();

    if (!adminAuth.ok) {
      return adminAuth;
    }

    /*
     * 第二步：
     * 读取投稿
     */
    const documentRef = db
      .collection("contributions")
      .doc(submissionId);

    const queryResult =
      await documentRef.get();

    const contribution =
      Array.isArray(queryResult?.data)
        ? queryResult.data[0]
        : queryResult?.data;

    if (!contribution) {
      return {
        ok: false,

        code:
          "CONTRIBUTION_NOT_FOUND",

        message:
          `未找到投稿：${submissionId}`
      };
    }

    /*
     * 第三步：
     * 防止重复审核已结束的记录
     */
    if (
      contribution.status === "approved" ||
      contribution.status === "rejected"
    ) {
      return {
        ok: false,

        code:
          "ALREADY_REVIEWED",

        message:
          `该投稿当前状态为 ${contribution.status}，已完成终审。`
      };
    }

    /*
     * 第四步：
     * 批准公开前再次检查授权
     */
    if (
      decision === "approved" &&
      (
        contribution
          .consentToPublish !== true ||
        contribution
          .rightsConfirmed !== true
      )
    ) {
      return {
        ok: false,

        code:
          "PUBLICATION_CONSENT_MISSING",

        message:
          "该投稿缺少公开授权或权利确认，不能批准公开。"
      };
    }

    /*
     * 第五步：
     * 根据馆员决定生成最终状态
     */
    const nextStatus =
      decision === "approved"
        ? "approved"
        : decision === "rejected"
          ? "rejected"
          : "processing";

    /*
     * 第六步：
     * 写回人工审核结果
     */
    // Approval and number allocation commit together; retries cannot double-award.
    const numbered = await numbers.review(db, submissionId, adminAuth.callerId, decision, note);

    /*
     * 第七步：
     * 返回前端提示
     */
    const messageMap = {
      approved:
        "已批准公开。该投稿将在公众端城市记忆中展示，并点亮对应地标。",

      needs_review:
        "已标记为继续核验，投稿仍保留在待审队列。",

      rejected:
        "已标记为不予公开，该投稿不会进入公众展示。"
    };

    return {
      ok: true,

      submissionId,
      memoryNumber: numbered.memoryNumber,

      decision,

      status:
        nextStatus,

      message:
        messageMap[decision]
    };
  } catch (error) {
    console.error(
      "reviewContribution failed:",
      error
    );

    return {
      ok: false,

      code:
        error?.code ||
        "REVIEW_OPERATION_FAILED",

      message:
        error?.message ||
        "馆员审核操作失败"
    };
  }
};
