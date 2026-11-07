/** Teacher-facing text of an LMS error (Error.message = backend code). */
export function lmsErrorText(err, t) {
  const code = err?.message || "lms_failed";
  const key = `lms.error.${code}`;
  const text = t(key);
  return text === key ? t("lms.error.generic", { code }) : text;
}

/** "Bỏ qua · chưa nộp" — a student's state with its reason, if known. */
export function lmsStatusText(student, t) {
  const key = `lms.status.${student.status}`;
  const status = t(key) === key ? student.status : t(key);
  if (!student.reason) return status;
  const reasonKey = `lms.reason.${student.reason}`;
  const reason = t(reasonKey) === reasonKey ? student.reason : t(reasonKey);
  return `${status} · ${reason}`;
}

/** Students the teacher may (re)select for "Lưu nháp". */
export const LMS_WRITABLE = new Set([
  "graded",
  "write_failed",
  "insufficient_points",
]);

/** A tone per state for the badge colour. */
export function lmsStatusTone(status) {
  if (status === "draft_saved") return "ok";
  if (status === "graded" || status === "write_queued") return "info";
  if (
    status === "write_failed" ||
    status === "insufficient_points" ||
    status === "changed" ||
    status === "teacher_modified"
  )
    return "warn";
  return "muted";
}
