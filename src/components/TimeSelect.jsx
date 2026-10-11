import { isPeakTime } from "../lib/autoGrade.js";

const pad = (n) => String(n).padStart(2, "0");
/** "HH:mm" → minutes of the day (24:00 allowed as an end), or null. */
const toMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * A 24-hour time ("HH:mm") as two selects, hour and minute, kept within
 * [from, to). Unlike <input type="time">, whose picker stays open on desktop
 * Chrome until the user clicks elsewhere, each select closes on its pick, and
 * a time outside the range cannot be chosen. `markPeak`: hours in DeepSeek's
 * peak are marked ⚠. `allowEmpty`: an empty hour clears the value ("").
 */
export default function TimeSelect({
  value,
  onChange,
  from = "00:00",
  to = "24:00",
  allowEmpty = false,
  disabled = false,
  ariaLabel,
  minuteAriaLabel,
  markPeak = false,
}) {
  const start = toMinutes(from) ?? 0;
  const end = toMinutes(to) ?? 24 * 60;
  const current = toMinutes(value);
  const hour = current === null ? "" : pad(Math.floor(current / 60));
  const minute = current === null ? "" : pad(current % 60);

  const hours = [];
  for (let h = Math.floor(start / 60); h * 60 < end; h++) hours.push(pad(h));
  // A saved value outside the range still shows as it is.
  if (hour && !hours.includes(hour)) hours.push(hour);
  hours.sort();

  // Every 5 minutes inside the range for the chosen hour, plus the saved
  // minute if it is not one of those.
  const minutes = [];
  if (hour) {
    for (let m = 0; m < 60; m += 5) {
      const at = Number(hour) * 60 + m;
      if (at >= start && at < end) minutes.push(pad(m));
    }
    if (!minutes.includes(minute)) minutes.push(minute);
    minutes.sort();
  }

  const pickHour = (h) => {
    if (!h) {
      onChange("");
      return;
    }
    // Keep the minute if it still fits the range; else the first that does.
    let m = Number(minute || 0);
    const at = (mm) => Number(h) * 60 + mm;
    if (at(m) < start) m = start % 60;
    if (at(m) >= end) m = 0;
    onChange(`${h}:${pad(m)}`);
  };

  return (
    <span className="time-select">
      <select
        aria-label={ariaLabel}
        value={hour}
        onChange={(e) => pickHour(e.target.value)}
        disabled={disabled}
      >
        {(allowEmpty || !hour) && <option value="">--</option>}
        {hours.map((h) => {
          const peak = markPeak && isPeakTime(`${h}:00`);
          return (
            <option key={h} value={h}>
              {peak ? `${h} ⚠` : h}
            </option>
          );
        })}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label={minuteAriaLabel}
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        disabled={disabled || !hour}
      >
        {!hour && <option value="">--</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}
