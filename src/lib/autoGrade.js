/**
 * Scheduled grading, the non-visual parts: validating the weekly slots (a
 * class may meet several times a week, each meeting with its own two
 * deadlines), turning the backend's error codes and run states into words,
 * and mapping a saved schedule back onto the form. The components live in
 * components/AutoGradeSchedule*.jsx.
 */
import { fromVnInput, toVnInput, weekdayTime } from "./scheduleTime.js";

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
/** Same limits as the backend (gradingSchedules DEFAULTS). */
export const MIN_GAP_MS = 2 * HOUR;
export const MAX_GAP_MS = WEEK;
export const MAX_SLOTS = 7;

// Each form slot carries an id of its own, so removing one in the middle
// does not hand its inputs to the next.
let slotSeq = 0;
const slotId = () => `slot-${++slotSeq}`;

/** An empty form slot. */
export function emptySlot() {
  return { id: slotId(), student: "", grader: "" };
}

/** Client-side check of one slot's two deadlines; an i18n key or null. */
export function validateDeadlines({ student, grader }) {
  const s = fromVnInput(student);
  const g = fromVnInput(grader);
  if (!Number.isFinite(s) || !Number.isFinite(g))
    return "autoGrade.bothRequired";
  if (g - s < MIN_GAP_MS) return "autoGrade.error.deadline_gap_too_short";
  if (g - s > MAX_GAP_MS) return "autoGrade.error.deadline_gap_too_long";
  return null;
}

/**
 * Every slot, then that no slot's grading runs into the next one's — the
 * backend's rule: within the week of the earliest deadline, each grading
 * deadline is at or before the next students' deadline. Returns
 * {key, params} (1-based slot numbers, as the teacher sees them) or null.
 */
export function validateSlots(slots) {
  if (!slots.length) return { key: "autoGrade.error.slots_required" };
  if (slots.length > MAX_SLOTS) {
    return {
      key: "autoGrade.error.too_many_slots",
      params: { max: MAX_SLOTS },
    };
  }
  for (const [i, slot] of slots.entries()) {
    const key = validateDeadlines(slot);
    if (key) return { key, params: { slot: i + 1 } };
  }
  const parsed = slots.map((slot, i) => {
    const s = fromVnInput(slot.student);
    return { s, gap: fromVnInput(slot.grader) - s, n: i + 1 };
  });
  const first = Math.min(...parsed.map((p) => p.s));
  const sorted = parsed
    .map((p) => ({ ...p, s: p.s - Math.floor((p.s - first) / WEEK) * WEEK }))
    .sort((a, b) => a.s - b.s);
  for (const [i, slot] of sorted.entries()) {
    const next =
      i + 1 < sorted.length
        ? sorted[i + 1]
        : { ...sorted[0], s: sorted[0].s + WEEK };
    if (slot.s + slot.gap > next.s) {
      return {
        key: "autoGrade.error.slots_overlap",
        params: { slot: slot.n, other: next.n },
      };
    }
  }
  return null;
}

/** The form's slots as the API body. */
export function slotsToBody(slots) {
  return {
    slots: slots.map((slot) => ({
      studentDeadlineAt: fromVnInput(slot.student),
      graderDeadlineAt: fromVnInput(slot.grader),
    })),
  };
}

/** A new slot: the one before it two days later, or an empty one. */
export function nextSlotAfter(slot) {
  const s = fromVnInput(slot?.student);
  const g = fromVnInput(slot?.grader);
  if (!Number.isFinite(s) || !Number.isFinite(g)) return emptySlot();
  const shift = 2 * 24 * HOUR;
  return {
    id: slotId(),
    student: toVnInput(s + shift),
    grader: toVnInput(g + shift),
  };
}

/** An error from the schedule API (or validateSlots), in words. */
export function scheduleErrorText(error, t) {
  const code = error?.message;
  const params = error?.params || {};
  const key = `autoGrade.error.${code}`;
  const text = t(key, {
    minHours: params.minHours ?? 2,
    max: params.max ?? MAX_SLOTS,
    slot: params.slot ?? "",
    other: params.other ?? "",
  });
  if (text === key) return t("autoGrade.error.generic", { code });
  return params.slot && code !== "slots_overlap"
    ? `${t("autoGrade.slotTitle", { n: params.slot })}: ${text}`
    : text;
}

/** A validateSlots() result in words, naming the slot when there are several. */
export function slotErrorText(invalid, t) {
  if (!invalid) return "";
  const params = { minHours: 2, max: MAX_SLOTS, ...(invalid.params || {}) };
  const text = t(invalid.key, params);
  return invalid.params?.slot && invalid.key !== "autoGrade.error.slots_overlap"
    ? `${t("autoGrade.slotTitle", { n: invalid.params.slot })}: ${text}`
    : text;
}

/**
 * The form's slots for a saved schedule, in week order: each slot's first
 * occurrence from the schedule's next one on (so a slot already graded this
 * week shows next week's dates), else the first whose grading deadline has
 * not passed.
 */
export function scheduleToValue(schedule, now = Date.now()) {
  const slots = schedule?.slots || [];
  if (!slots.length) return [emptySlot()];
  const from = schedule.next?.studentDeadlineAt;
  return slots.map(({ anchorStudentAt, gapMs }) => {
    const weeks = Math.max(
      0,
      Number.isFinite(from)
        ? Math.ceil((from - anchorStudentAt) / WEEK)
        : Math.ceil((now - anchorStudentAt - gapMs) / WEEK),
    );
    const s = anchorStudentAt + weeks * WEEK;
    return {
      id: slotId(),
      student: toVnInput(s),
      grader: toVnInput(s + gapMs),
    };
  });
}

/** "Thứ 3 20:00, Thứ 5 20:00" — when the students hand in, each week. */
export function scheduleSummary(schedule, t) {
  return (schedule?.slots || [])
    .map((slot) => weekdayTime(slot.studentDeadline, t))
    .join(", ");
}

/** A run key ("2026-09-26-2231", or an older "2026-09-26") as "22:31 26/09". */
export function runLabel(runKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?$/.exec(
    String(runKey || ""),
  );
  if (!match) return String(runKey || "");
  const [, , month, day, hh, mm] = match;
  return hh ? `${hh}:${mm} ${day}/${month}` : `${day}/${month}`;
}

/** One line on how the schedule's last grading went. */
export function lastRunText(lastRun, t) {
  if (!lastRun) return "";
  return t(`autoGrade.state.${lastRun.state}`, {
    runKey: runLabel(lastRun.runKey),
    lesson: lastRun.lessonName,
    submitted: lastRun.submitted,
    total: lastRun.total,
    written: lastRun.result?.written ?? 0,
  });
}
