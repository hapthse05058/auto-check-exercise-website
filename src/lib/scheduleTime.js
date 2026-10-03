/**
 * Time helpers for scheduled grading. Schedules live in Vietnam time (UTC+7,
 * no daylight saving), whatever timezone the browser is in, so the
 * `datetime-local` value is read and written as Vietnam wall-clock time here
 * instead of trusting the browser's zone. Mirrors vnParts() in
 * auto-check-exercise-be/backend/lib/gradingSchedules.js.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Midnight (Vietnam) of the day `ms` falls on. */
export function vnDayStart(ms) {
  return Math.floor((ms + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
}

/** epoch ms → "YYYY-MM-DD" (Vietnam date) for <input type="date">. */
export function toVnDate(ms) {
  return toVnInput(ms).slice(0, 10);
}

/** "YYYY-MM-DD" → that day's midnight in Vietnam (epoch ms), NaN if invalid. */
export function fromVnDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return NaN;
  const ms = fromVnInput(`${value}T00:00`);
  return toVnDate(ms) === value ? ms : NaN; // not 2026-09-31
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
  return formatDateTimeVn(ms);
}

/**
 * A full timestamp the Vietnamese way, in Vietnam time whatever the browser's
 * locale or timezone: "02/10/2026 17:39" ("…:40" with `seconds`). Takes an
 * ISO string or epoch ms; "—" when there is none, the input when unparsable.
 */
export function formatDateTimeVn(value, { seconds = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return String(value);
  const d = new Date(ms + VN_OFFSET_MS);
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` +
    (seconds ? `:${pad(d.getUTCSeconds())}` : "")
  );
}

/** "Thứ 3 20:00" / "Tuesday 20:00" from {weekday, time}. */
export function weekdayTime({ weekday, time }, t) {
  return `${t(`autoGrade.weekday${weekday}`)} ${time}`;
}
