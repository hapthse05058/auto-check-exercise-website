import { describe, expect, it } from "vitest";

import {
  nextSlotAfter,
  runLabel,
  scheduleToValue,
  slotErrorText,
  slotsToBody,
  validateSlots,
} from "../src/lib/autoGrade.js";
import { fromVnInput } from "../src/lib/scheduleTime.js";

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
// Tuesday 29/09/2026 20:00 → Wednesday 12:00, Thursday 20:00 → Friday 12:00.
const TUE = { student: "2026-09-29T20:00", grader: "2026-09-30T12:00" };
const THU = { student: "2026-10-01T20:00", grader: "2026-10-02T12:00" };

describe("validateSlots", () => {
  it("accepts several lessons a week in any order", () => {
    expect(validateSlots([THU, TUE])).toBe(null);
  });

  it("names the slot with bad deadlines", () => {
    const bad = { student: "2026-10-01T20:00", grader: "2026-10-01T21:00" };
    expect(validateSlots([TUE, bad])).toEqual({
      key: "autoGrade.error.deadline_gap_too_short",
      params: { slot: 2 },
    });
    expect(validateSlots([TUE, { student: "", grader: "" }]).key).toBe(
      "autoGrade.bothRequired",
    );
  });

  it("refuses a lesson whose grading runs into the next one — across the week too", () => {
    const long = { student: "2026-09-29T20:00", grader: "2026-10-02T08:00" };
    expect(validateSlots([long, THU])).toEqual({
      key: "autoGrade.error.slots_overlap",
      params: { slot: 1, other: 2 },
    });
    // Monday 20:00 → next Tuesday 21:00 runs past Tuesday 20:00.
    const monday = { student: "2026-10-05T20:00", grader: "2026-10-06T21:00" };
    expect(validateSlots([TUE, monday]).key).toBe(
      "autoGrade.error.slots_overlap",
    );
  });

  it("caps the number of lessons", () => {
    expect(validateSlots([]).key).toBe("autoGrade.error.slots_required");
    expect(validateSlots(Array(8).fill(TUE)).key).toBe(
      "autoGrade.error.too_many_slots",
    );
  });
});

describe("slots on the form", () => {
  it("sends epoch ms", () => {
    expect(slotsToBody([TUE])).toEqual({
      slots: [
        {
          studentDeadlineAt: fromVnInput(TUE.student),
          graderDeadlineAt: fromVnInput(TUE.grader),
        },
      ],
    });
  });

  it("a new slot is the last one two days later, with its own id", () => {
    const next = nextSlotAfter({ id: "a", ...TUE });
    expect(next.student).toBe(THU.student);
    expect(next.grader).toBe(THU.grader);
    expect(next.id).not.toBe("a");
    expect(nextSlotAfter({ student: "", grader: "" }).student).toBe("");
  });

  it("a saved schedule shows each slot's upcoming week", () => {
    const anchor = fromVnInput(TUE.student);
    const gapMs = fromVnInput(TUE.grader) - anchor;
    const schedule = { slots: [{ anchorStudentAt: anchor, gapMs }] };
    // Three weeks later, after that week's grading deadline.
    const [slot] = scheduleToValue(schedule, anchor + 3 * WEEK + gapMs + HOUR);
    expect(slot.student).toBe("2026-10-27T20:00");
    expect(scheduleToValue(null)).toHaveLength(1);
  });

  it("slots before the schedule's next one show the week after", () => {
    const tue = fromVnInput(TUE.student);
    const thu = fromVnInput(THU.student);
    const gapMs = fromVnInput(TUE.grader) - tue;
    const schedule = {
      slots: [
        { anchorStudentAt: tue, gapMs },
        { anchorStudentAt: thu, gapMs },
      ],
      // Tuesday is graded; Thursday is next.
      next: { studentDeadlineAt: thu },
    };
    const [a, b] = scheduleToValue(schedule, tue + gapMs + HOUR);
    expect(a.student).toBe("2026-10-06T20:00");
    expect(b.student).toBe(THU.student);
  });
});

describe("wording", () => {
  it("run keys read as time and day", () => {
    expect(runLabel("2026-09-26-2231")).toBe("22:31 26/09");
    expect(runLabel("2026-09-26")).toBe("26/09");
  });

  it("slot errors name the lesson, overlaps name both", () => {
    const t = (key, p = {}) =>
      ({
        "autoGrade.slotTitle": `Buổi ${p.n}`,
        "autoGrade.bothRequired": "Chọn cả hai hạn.",
        "autoGrade.error.slots_overlap": `Buổi ${p.slot} và ${p.other} chồng nhau`,
      })[key] ?? key;
    expect(
      slotErrorText({ key: "autoGrade.bothRequired", params: { slot: 2 } }, t),
    ).toBe("Buổi 2: Chọn cả hai hạn.");
    expect(
      slotErrorText(
        {
          key: "autoGrade.error.slots_overlap",
          params: { slot: 1, other: 2 },
        },
        t,
      ),
    ).toBe("Buổi 1 và 2 chồng nhau");
  });
});
