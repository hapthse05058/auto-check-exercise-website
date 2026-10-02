import { describe, expect, it } from "vitest";

import {
  formatVn,
  fromVnDate,
  fromVnInput,
  toVnDate,
  toVnInput,
  vnDayStart,
  vnWeekTime,
} from "../src/lib/scheduleTime.js";

// Tuesday 29/09/2026 20:00 in Vietnam = 13:00 UTC.
const T0 = Date.UTC(2026, 8, 29, 13, 0);

describe("schedule time (Vietnam wall clock, whatever the browser zone)", () => {
  it("round-trips a datetime-local value as Vietnam time", () => {
    expect(toVnInput(T0)).toBe("2026-09-29T20:00");
    expect(fromVnInput("2026-09-29T20:00")).toBe(T0);
  });

  it("an evening in Vietnam can be the previous day in UTC", () => {
    const early = fromVnInput("2026-09-30T05:30");
    expect(new Date(early).getUTCDate()).toBe(29);
    expect(vnWeekTime(early)).toEqual({ weekday: 3, time: "05:30" });
  });

  it("weekday and display text", () => {
    expect(vnWeekTime(T0)).toEqual({ weekday: 2, time: "20:00" });
    expect(formatVn(T0)).toBe("20:00 29/09");
  });

  it("rejects empty or malformed input", () => {
    expect(Number.isNaN(fromVnInput(""))).toBe(true);
    expect(Number.isNaN(fromVnInput("29/09/2026 20:00"))).toBe(true);
    expect(toVnInput(NaN)).toBe("");
  });

  it("dates are Vietnam days: midnight there, the evening before in UTC", () => {
    const wed = fromVnDate("2026-09-30");
    expect(wed).toBe(Date.UTC(2026, 8, 29, 17, 0));
    expect(toVnDate(wed + 23 * 60 * 60 * 1000)).toBe("2026-09-30");
    expect(vnDayStart(T0)).toBe(fromVnDate("2026-09-29"));
    expect(Number.isNaN(fromVnDate("2026-09-31"))).toBe(true);
    expect(Number.isNaN(fromVnDate(""))).toBe(true);
  });
});
