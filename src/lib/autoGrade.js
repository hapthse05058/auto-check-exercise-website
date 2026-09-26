/**
 * Scheduled grading, the non-visual parts: validating the two deadlines,
 * turning the backend's error codes and run states into words, and mapping a
 * saved schedule back onto the form. The components live in
 * components/AutoGradeSchedule*.jsx.
 */
import { fromVnInput, toVnInput } from "./scheduleTime.js";

const HOUR = 60 * 60 * 1000;
/** Same limits as the backend (gradingSchedules DEFAULTS.minGapMs / maxGapMs). */
export const MIN_GAP_MS = 2 * HOUR;
export const MAX_GAP_MS = 7 * 24 * HOUR;

/** Client-side check of the two deadlines; returns an i18n key or null. */
export function validateDeadlines({ student, grader }) {
  const s = fromVnInput(student);
  const g = fromVnInput(grader);
  if (!Number.isFinite(s) || !Number.isFinite(g))
    return "autoGrade.bothRequired";
  if (g - s < MIN_GAP_MS) return "autoGrade.error.deadline_gap_too_short";
  if (g - s > MAX_GAP_MS) return "autoGrade.error.deadline_gap_too_long";
  return null;
}

/** An error from the schedule API, in words. */
export function scheduleErrorText(error, t) {
  const key = `autoGrade.error.${error?.message}`;
  const text = t(key, { minHours: error?.params?.minHours ?? 2 });
  return text === key
    ? t("autoGrade.error.generic", { code: error?.message })
    : text;
}

/** The deadlines a saved schedule is shown with: its next week, else its first. */
export function scheduleToValue(schedule) {
  if (!schedule) return { student: "", grader: "" };
  const student = schedule.next?.studentDeadlineAt ?? schedule.anchorStudentAt;
  const grader =
    schedule.next?.graderDeadlineAt ??
    schedule.anchorStudentAt + schedule.gapMs;
  return { student: toVnInput(student), grader: toVnInput(grader) };
}

/** One line on how the schedule's last week went. */
export function lastRunText(lastRun, t) {
  if (!lastRun) return "";
  return t(`autoGrade.state.${lastRun.state}`, {
    runKey: lastRun.runKey,
    lesson: lastRun.lessonName,
    submitted: lastRun.submitted,
    total: lastRun.total,
    written: lastRun.result?.written ?? 0,
  });
}
