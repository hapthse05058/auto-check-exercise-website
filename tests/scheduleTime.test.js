import { describe, expect, it } from "vitest";

import {
  formatDateTimeVn,
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
    expect(formatVn(T0)).toBe("29/09/2026 20:00");
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

describe("formatDateTimeVn", () => {
  it("is day/month/year in Vietnam time, whatever the input form", () => {
    expect(formatDateTimeVn("2026-10-02T10:39:40.000Z")).toBe(
      "02/10/2026 17:39",
    );
    expect(formatDateTimeVn(Date.UTC(2026, 9, 2, 10, 39, 40))).toBe(
      "02/10/2026 17:39",
    );
    expect(
      formatDateTimeVn("2026-10-02T10:39:40.000Z", { seconds: true }),
    ).toBe("02/10/2026 17:39:40");
  });
  it("crosses midnight in Vietnam time, not UTC", () => {
    expect(formatDateTimeVn("2026-12-31T17:05:00Z")).toBe("01/01/2027 00:05");
  });
  it("— when empty; the raw value when unparsable", () => {
    expect(formatDateTimeVn(null)).toBe("—");
    expect(formatDateTimeVn("")).toBe("—");
    expect(formatDateTimeVn("not a date")).toBe("not a date");
  });
});
