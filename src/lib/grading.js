/**
 * Grading a lesson. The work itself — reading every student's doc, grading the
 * answers, writing the feedback back and charging points — runs on the
 * backend as a job (auto-check-exercise-be/backend/lib/gradingJobs.js), so the
 * teacher can close the tab once it has started and is notified when it ends.
 *
 * This module only starts that job and turns what the backend reports into
 * what the grading screen shows.
 */
import { parseDocLinks } from "./docParser.js";
import { createGradingJob, fetchStudentDocRefs } from "../api/backend.js";

/**
 * Which docs an action applies to: the pasted links when the textarea has any,
 * otherwise every student saved on the class. Used by the feedback-clearing
 * flow, which still runs in the browser.
 */
export async function resolveDocRefs(docLinksText, classId) {
  const trimmed = (docLinksText || "").trim();
  return trimmed ? parseDocLinks(trimmed) : fetchStudentDocRefs(classId);
}

/**
 * Starts grading `lessonId` for `classId` — or joins the job already running
 * for them. Pasted links restrict the job to those docs.
 *
 * @returns {Promise<{jobId: string, joined: boolean}>}
 */
export async function startGradingJob({
  docLinksText,
  classId,
  lessonId,
  useCache = true,
}) {
  const trimmed = (docLinksText || "").trim();
  const docIds = trimmed
    ? [...new Set(parseDocLinks(trimmed).map((ref) => ref.docId))]
    : undefined;
  if (trimmed && !docIds.length) throw new Error("no_docs");
  return createGradingJob({ classId, lessonId, docIds, useCache });
}

/** True once the backend will not touch this job again. */
export function isJobFinished(job) {
  return job?.status === "done" || job?.status === "failed";
}

/** One warning the backend recorded, in the viewer's language. */
function translateWarning({ code, params = {} }, t) {
  if (code === "unreadableAnswers") {
    const list = (params.refs || [])
      .map(({ table, question }) =>
        t("grading.tableQuestionRef", { table, question }),
      )
      .join(", ");
    return t("grading.unreadableAnswers", { docId: params.docId, list });
  }
  return t(`grading.${code}`, params);
}

/** Why a job failed, in words — keyed on the backend's error code. */
function describeError(job, t) {
  const params = job.errorParams || {};
  switch (job.error) {
    case "not_enough_points":
      return t("grading.notEnough", params);
    case "google_reauth_required":
      return t("grading.reauthRequired", {
        written: job.written,
        total: job.total,
      });
    case "prepare_failed":
      return t("grading.gradingFailed", { msg: params.msg || "" });
    case "abandoned":
      return t("grading.jobAbandoned");
    case "unknown_grading_profile":
      return t("grading.unknownGradingProfile");
    default:
      return t("grading.jobFailed", { code: job.error });
  }
}

/**
 * What the grading screen shows for a job: a spinner line while it runs, one
 * summary line when it ends, and the per-doc warnings either way.
 *
 * The warnings name doc ids and table layouts — debugging detail that only
 * confuses a teacher, so `showWarnings: false` (non-admins) drops them.
 *
 * @returns {{phase: "running"|"done"|"error", text: string, warnings: string[]}}
 */
export function describeJob(job, t, { showWarnings = true } = {}) {
  const warnings = showWarnings
    ? (job.warnings || []).map((w) => translateWarning(w, t))
    : [];
  const seeBelow = warnings.length ? ` ${t("grading.seeWarnings")}` : "";

  if (!isJobFinished(job)) {
    const processed = job.written + job.skipped + job.failed;
    const text =
      job.status === "writing"
        ? t("grading.jobProgress", { done: processed, total: job.total })
        : t("grading.jobPreparing");
    return { phase: "running", text, warnings };
  }

  if (job.status === "failed") {
    return { phase: "error", text: describeError(job, t), warnings };
  }
  if (job.reauthRequired) {
    return {
      phase: "error",
      text: t("grading.reauthRequired", {
        written: job.written,
        total: job.total,
      }),
      warnings,
    };
  }
  if (job.written > 0) {
    return {
      phase: "done",
      text: t("grading.doneCount", { n: job.written }),
      warnings,
    };
  }
  // Nothing was written — say why rather than claiming "0 students".
  return {
    phase: "done",
    text:
      (job.notice
        ? t(`grading.${job.notice}`, job.noticeParams || {})
        : t("grading.noneGraded")) + seeBelow,
    warnings,
  };
}
