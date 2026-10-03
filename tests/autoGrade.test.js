import { describe, expect, it } from "vitest";

import {
  nextSlotAfter,
  partDay,
  runLabel,
  scheduleSummary,
  scheduleToValue,
  slotErrorText,
  slotsToBody,
  validateSlots,
  weekdayOf,
} from "../src/lib/autoGrade.js";
import { fromVnDate } from "../src/lib/scheduleTime.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
// Wednesday 30/09/2026 morning, Friday 02/10/2026 evening.
const WED = { id: "a", date: "2026-09-30", part: "morning" };
const FRI = { id: "b", date: "2026-10-02", part: "evening" };

describe("validateSlots", () => {
  it("accepts several days a week in any order", () => {
    expect(validateSlots([FRI, WED])).toBe(null);
    expect(weekdayOf(WED.date)).toBe(3);
  });

  it("names the slot without a day, or with an unknown part", () => {
    expect(validateSlots([WED, { date: "", part: "morning" }])).toEqual({
      key: "autoGrade.dateRequired",
      params: { slot: 2 },
    });
    expect(validateSlots([{ date: "2026-09-31", part: "morning" }]).key).toBe(
      "autoGrade.dateRequired",
    );
    expect(validateSlots([{ date: WED.date, part: "night" }]).key).toBe(
      "autoGrade.error.invalid_part",
    );
  });

  it("refuses two parts of the same weekday, across weeks too", () => {
    expect(
      validateSlots([WED, FRI, { date: "2026-10-07", part: "evening" }]),
    ).toEqual({
      key: "autoGrade.error.slots_same_day",
      params: { slot: 1, other: 3 },
    });
  });

  it("caps the number of days", () => {
    expect(validateSlots([]).key).toBe("autoGrade.error.slots_required");
    expect(validateSlots(Array(8).fill(WED)).key).toBe(
      "autoGrade.error.too_many_slots",
    );
  });
});

describe("slots on the form", () => {
  it("sends the days and parts", () => {
    expect(slotsToBody([WED, FRI])).toEqual({
      slots: [
        { date: "2026-09-30", part: "morning" },
        { date: "2026-10-02", part: "evening" },
      ],
    });
  });

  it("a new slot is the last one two days later, same part, with its own id", () => {
    const next = nextSlotAfter(FRI);
    expect(next.date).toBe("2026-10-04");
    expect(next.part).toBe("evening");
    expect(next.id).not.toBe("b");
    expect(nextSlotAfter({ date: "", part: "morning" }).date).toBe("");
  });

  it("a saved schedule shows each day's upcoming date", () => {
    const anchorDayAt = fromVnDate(WED.date);
    const schedule = { slots: [{ anchorDayAt, part: "afternoon" }] };
    const [slot] = scheduleToValue(schedule, anchorDayAt + 3 * WEEK + HOUR);
    expect(slot.date).toBe("2026-10-21");
    expect(slot.part).toBe("afternoon");
    expect(scheduleToValue(null)).toHaveLength(1);
  });

  it("days before the schedule's next one show the week after", () => {
    const wed = fromVnDate(WED.date);
    const fri = fromVnDate(FRI.date);
    const schedule = {
      slots: [
        { anchorDayAt: wed, part: "morning" },
        { anchorDayAt: fri, part: "evening" },
      ],
      // Wednesday is graded; Friday 23:30 is next.
      next: { runAt: fri + 23.5 * HOUR },
    };
    const [a, b] = scheduleToValue(schedule, wed + 8 * HOUR);
    expect(a.date).toBe("2026-10-07");
    expect(b.date).toBe(FRI.date);
  });

  it("an old schedule graded after midnight shows the evening before", () => {
    // Graded Wednesday 00:10 → Tuesday evening.
    const tue = fromVnDate("2026-09-29");
    const schedule = {
      slots: [{ anchorDayAt: tue, part: "evening", kind: "deadlines" }],
      next: { runAt: tue + DAY + 10 * 60 * 1000 },
    };
    expect(scheduleToValue(schedule)[0].date).toBe("2026-09-29");
  });
});

describe("wording", () => {
  const t = (key, p = {}) =>
    ({
      "autoGrade.slotTitle": `Ngày chấm ${p.n}`,
      "autoGrade.dateRequired": "Hãy chọn ngày chấm.",
      "autoGrade.error.slots_same_day": `Ngày chấm ${p.slot} và ${p.other} trùng thứ`,
      "autoGrade.partDay": `${p.part} ${p.weekday}`,
      "autoGrade.part.morning": "Sáng",
      "autoGrade.part.evening": "Tối",
      "autoGrade.weekday3": "Thứ 4",
      "autoGrade.weekday5": "Thứ 6",
    })[key] ?? key;

  it("run keys read as time and day", () => {
    expect(runLabel("2026-09-26-2231")).toBe("26/09/2026 22:31");
    expect(runLabel("2026-09-26")).toBe("26/09/2026");
  });

  it("slot errors name the day, same-weekday errors name both", () => {
    expect(
      slotErrorText({ key: "autoGrade.dateRequired", params: { slot: 2 } }, t),
    ).toBe("Ngày chấm 2: Hãy chọn ngày chấm.");
    expect(
      slotErrorText(
        {
          key: "autoGrade.error.slots_same_day",
          params: { slot: 1, other: 2 },
        },
        t,
      ),
    ).toBe("Ngày chấm 1 và 2 trùng thứ");
  });

  it("a schedule reads as parts and weekdays", () => {
    expect(partDay("morning", 3, t)).toBe("Sáng Thứ 4");
    expect(
      scheduleSummary(
        {
          slots: [
            { part: "morning", weekday: 3 },
            { part: "evening", weekday: 5 },
          ],
        },
        t,
      ),
    ).toBe("Sáng Thứ 4, Tối Thứ 6");
  });
});
