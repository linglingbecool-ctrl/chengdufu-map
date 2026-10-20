"use strict";
const numbers = require("./memory-numbers");

const cloudbase = require(
  "@cloudbase/node-sdk"
);

const app = cloudbase.init({
  env:
    cloudbase.SYMBOL_CURRENT_ENV,
  timeout: 60000,
});

const db = app.database();
const auth = app.auth();

function cleanText(
  value,
  maxLength
) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

exports.main = async (
  event = {}
) => {
  const submissionId =
    cleanText(
      event.submissionId,
      120
    );

  if (!submissionId) {
    return {
      ok: false,
      code:
        "MISSING_SUBMISSION_ID",
      message:
        "缺少 submissionId",
    };
  }

  const userInfo =
    auth.getUserInfo();

  const callerId =
    userInfo?.uid ||
    userInfo?.openId ||
    userInfo?.customUserId ||
    "";

  if (!callerId) {
    return {
      ok: false,
      code:
        "NOT_LOGIN",
      message:
        "当前调用没有有效登录身份",
    };
  }

  const documentRef =
    db
      .collection(
        "contributions"
      )
      .doc(
        submissionId
      );

  try {
    const queryResult =
      await documentRef
        .get();

    const contribution =
      Array.isArray(
        queryResult?.data
      )
        ? queryResult.data[0]
        : queryResult?.data;

    if (!contribution) {
      return {
        ok: false,
        code:
          "CONTRIBUTION_NOT_FOUND",
        message:
          `未找到投稿：${submissionId}`,
      };
    }

    if (
      contribution.userId &&
      contribution.userId !==
        callerId
    ) {
      return {
        ok: false,
        code:
          "SUBMISSION_OWNER_MISMATCH",
        message:
          "该投稿不属于当前用户",
      };
    }

    const originalContent =
      cleanText(
        contribution
          .originalContent,
        1200
      );

    const summary =
      originalContent
        ? `投稿包含 ${originalContent.length} 个字，等待馆员人工审核。`
        : "投稿以影像材料为主，等待馆员人工审核。";

    const manualReview = {
      suggestion:
        "review",
      riskLevel:
        "medium",
      relevance:
        null,
      summary,
      reason:
        "当前项目未启用生成式模型服务，本条投稿未经过 AI 判断，须由馆员依据原始材料进行人工审核。",
      tags: [],
      risks: {
        privacy: false,
        copyright: false,
        offensive: false,
        advertising: false,
        irrelevant: false,
      },
      humanReviewRequired:
        true,
      generatedBy:
        "manual-review-fallback",
    };

    const processed = await numbers.withRegistry(db, async (tx, registry) => {
      const ref=tx.collection("contributions").doc(submissionId);
      const current=numbers.row(await ref.get());
      if (!current || (current.userId || current._openid) !== callerId) {
        throw Object.assign(new Error("该投稿不属于当前用户"), {code:"SUBMISSION_OWNER_MISMATCH"});
      }
      const memoryNumber=numbers.ensureMemory(registry,submissionId);
      // A repeated processing request must never reset a curator's final review.
      if (["approved","rejected"].includes(current.status)) return {memoryNumber,status:current.status};
      numbers.checked(await ref.update({
        userId:
          callerId,

        status:
          "processing",

        processingStartedAt:
          db.serverDate(),

        processorVersion:
          "processContribution-no-model-v1",

        aiReviewStatus:
          "skipped_no_model",

        aiReview:
          manualReview,

        aiReviewModel:
          "none",

        aiReviewRaw:
          "",

        aiReviewUsage:
          null,

        aiReviewedAt:
          db.serverDate(),

        humanReviewRequired:
          true,
      }));
      return {memoryNumber,status:"processing"};
    });

    return {
      ok: true,
      message:
        "投稿已保存，当前未启用模型服务，已转入馆员人工审核。",
      submissionId,
      memoryNumber: processed.memoryNumber,
      status: processed.status,
      aiReviewStatus:
        "skipped_no_model",
      modelServiceRequired:
        false,
      humanReviewRequired:
        true,
    };
  }

  catch (error) {
    console.error(
      "processContribution no-model failed:",
      error
    );

    return {
      ok: false,
      code:
        error?.code ||
        "PROCESSING_FAILED",
      message:
        error?.message ||
        "处理投稿失败",
    };
  }
};
