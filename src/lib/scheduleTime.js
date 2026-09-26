/**
 * Time helpers for scheduled grading. Schedules live in Vietnam time (UTC+7,
 * no daylight saving), whatever timezone the browser is in, so the
 * `datetime-local` value is read and written as Vietnam wall-clock time here
 * instead of trusting the browser's zone. Mirrors vnParts() in
 * auto-check-exercise-be/backend/lib/gradingSchedules.js.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

/** epoch ms → "YYYY-MM-DDTHH:mm" (Vietnam wall clock) for datetime-local. */
export function toVnInput(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + VN_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/** "YYYY-MM-DDTHH:mm" read as Vietnam wall clock → epoch ms (NaN if invalid). */
export function fromVnInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return NaN;
  const [, y, mo, d, h, mi] = match.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - VN_OFFSET_MS;
}

/** Weekday (0 = Sunday) and "HH:mm" of an instant, in Vietnam. */
export function vnWeekTime(ms) {
  const d = new Date(ms + VN_OFFSET_MS);
  return {
    weekday: d.getUTCDay(),
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

/** "HH:mm dd/MM" in Vietnam. */
export function formatVn(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + VN_OFFSET_MS);
  return (
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ` +
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
  );
}

/** "Thứ 3 20:00" / "Tuesday 20:00" from {weekday, time}. */
export function weekdayTime({ weekday, time }, t) {
  return `${t(`autoGrade.weekday${weekday}`)} ${time}`;
}
