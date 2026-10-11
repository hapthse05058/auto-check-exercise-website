/**
 * Scheduled grading, the non-visual parts: validating the weekly slots (a
 * class may be graded on several days a week, each in the morning, afternoon
 * or evening — the admin sets the actual time of each part), turning the
 * backend's error codes and run states into words, and mapping a saved
 * schedule back onto the form. The components live in
 * components/AutoGradeSchedule*.jsx.
 */
import { fromVnDate, toVnDate, vnDayStart } from "./scheduleTime.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Same limit as the backend (gradingSchedules DEFAULTS). */
export const MAX_SLOTS = 7;
/** The parts of a day a teacher picks from (backend PARTS). */
export const PARTS = ["morning", "afternoon", "evening"];
/** Tabler icon of each part. */
export const PART_ICONS = {
  morning: "ti-sunrise",
  afternoon: "ti-sun",
  evening: "ti-moon",
};

/**
 * DeepSeek's peak hours, Vietnam time, [from, to) in minutes of the day: Monday
 * to Friday 9:00–12:00 and 14:00–18:00 Beijing time. Any other time, weekends
 * and Chinese holidays included, is off-peak at half the price.
 */
export const PEAK_RANGES = [
  { from: 8 * 60, to: 11 * 60 },
  { from: 13 * 60, to: 17 * 60 },
];

/** Whether a time ("HH:mm", Vietnam) falls in DeepSeek's weekday peak hours. */
export function isPeakTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return PEAK_RANGES.some((r) => minutes >= r.from && minutes < r.to);
}

// Each form slot carries an id of its own, so removing one in the middle
// does not hand its inputs to the next.
let slotSeq = 0;
const slotId = () => `slot-${++slotSeq}`;

/** An empty form slot. */
export function emptySlot() {
  return { id: slotId(), date: "", part: "morning" };
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" in Vietnam, or null. */
export function weekdayOf(date) {
  const ms = fromVnDate(date);
  return Number.isFinite(ms) ? new Date(ms + 7 * HOUR).getUTCDay() : null;
}

/** Client-side check of one slot; an i18n key or null. */
export function validateSlot({ date, part }) {
  if (!Number.isFinite(fromVnDate(date))) return "autoGrade.dateRequired";
  if (!PARTS.includes(part)) return "autoGrade.error.invalid_part";
  return null;
}

/**
 * Every slot, then one grading day per weekday — the backend's rule. Returns
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
    const key = validateSlot(slot);
    if (key) return { key, params: { slot: i + 1 } };
  }
  const seen = new Map();
  for (const [i, slot] of slots.entries()) {
    const weekday = weekdayOf(slot.date);
    if (seen.has(weekday)) {
      return {
        key: "autoGrade.error.slots_same_day",
        params: { slot: seen.get(weekday), other: i + 1 },
      };
    }
    seen.set(weekday, i + 1);
  }
  return null;
}

/** The form's slots as the API body. */
export function slotsToBody(slots) {
  return {
    slots: slots.map(({ date, part }) => ({ date, part })),
  };
}

/** A new slot: the one before it two days later, same part, or an empty one. */
export function nextSlotAfter(slot) {
  const day = fromVnDate(slot?.date);
  if (!Number.isFinite(day)) return emptySlot();
  return {
    id: slotId(),
    date: toVnDate(day + 2 * DAY),
    part: slot.part || "morning",
  };
}

/** An error from the schedule API (or validateSlots), in words. */
export function scheduleErrorText(error, t) {
  const code = error?.message;
  const params = error?.params || {};
  const key = `autoGrade.error.${code}`;
  const text = t(key, {
    max: params.max ?? MAX_SLOTS,
    slot: params.slot ?? "",
    other: params.other ?? "",
    part: params.part ? t(`autoGrade.part.${params.part}`) : "",
    from: params.from ?? "",
    to: params.to ?? "",
  });
  if (text === key) return t("autoGrade.error.generic", { code });
  return params.slot && code !== "slots_same_day"
    ? `${t("autoGrade.slotTitle", { n: params.slot })}: ${text}`
    : text;
}

/** A validateSlots() result in words, naming the slot when there are several. */
export function slotErrorText(invalid, t) {
  if (!invalid) return "";
  const params = { max: MAX_SLOTS, ...(invalid.params || {}) };
  const text = t(invalid.key, params);
  return invalid.params?.slot &&
    invalid.key !== "autoGrade.error.slots_same_day"
    ? `${t("autoGrade.slotTitle", { n: invalid.params.slot })}: ${text}`
    : text;
}

/**
 * The form's slots for a saved schedule, in week order: each slot's first
 * grading day from the schedule's next one on (so a day already graded this
 * week shows next week's date), else from today. A schedule from before
 * grading days comes back as the day and part its grading falls in.
 */
export function scheduleToValue(schedule, now = Date.now()) {
  const slots = schedule?.slots || [];
  if (!slots.length) return [emptySlot()];
  // Grading runs from 04:00 on, so 4 hours back lands on its day — and an
  // old schedule's after-midnight run on the evening before.
  const from = vnDayStart(
    Number.isFinite(schedule.next?.runAt)
      ? schedule.next.runAt - 4 * HOUR
      : now,
  );
  return slots.map(({ anchorDayAt, part }) => {
    const weeks = Math.max(0, Math.ceil((from - anchorDayAt) / WEEK));
    return {
      id: slotId(),
      date: toVnDate(anchorDayAt + weeks * WEEK),
      part: PARTS.includes(part) ? part : "morning",
    };
  });
}

/** "Sáng Thứ 4, Tối Thứ 6" — when the class is graded, each week. */
export function scheduleSummary(schedule, t) {
  return (schedule?.slots || [])
    .map((slot) => partDay(slot.part, slot.weekday, t))
    .join(", ");
}

/** "Sáng Thứ 4" / "Wednesday morning". */
export function partDay(part, weekday, t) {
  return t("autoGrade.partDay", {
    part: t(`autoGrade.part.${PARTS.includes(part) ? part : "morning"}`),
    weekday: t(`autoGrade.weekday${weekday}`),
  });
}

/** A run key ("2026-09-26-2231", or a day "2026-09-26") as "22:31 26/09". */
export function runLabel(runKey) {
  // A re-grade on the same day ends in -r2, -r3…: "04/10/2026 (#2)".
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?(?:-r(\d+))?$/.exec(
      String(runKey || ""),
    );
  if (!match) return String(runKey || "");
  const [, year, month, day, hh, mm, retake] = match;
  const date = hh
    ? `${day}/${month}/${year} ${hh}:${mm}`
    : `${day}/${month}/${year}`;
  return retake ? `${date} (#${retake})` : date;
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
