import { describe, expect, it } from "vitest";
import {
  OVERALL_FEEDBACK_LABEL,
  buildClearFeedbackRequests,
} from "../src/lib/docWriter.js";
import {
  PIndexed,
  PIndexedRuns,
  PRichLink,
  makeRawTab,
  row,
} from "./fixtures.js";

/** Shorthand: the {startIndex, endIndex} of each emitted delete request. */
const rangesOf = (requests) =>
  requests.map((r) => ({
    start: r.deleteContentRange.range.startIndex,
    end: r.deleteContentRange.range.endIndex,
  }));

const header = () =>
  row(
    [PIndexed("STT\n", 1)],
    [PIndexed("Đề bài\n", 6)],
    [PIndexed("Chữa bài\n", 14)],
  );
const spacer = () =>
  row([PIndexed("\n", 24)], [PIndexed("\n", 26)], [PIndexed("\n", 28)]);

/** Question row: number cell, empty middle, feedback in the LAST cell. */
const qRow = (num, numAt, feedback, feedbackAt) =>
  row(
    [PIndexed(`${num}. Câu hỏi\n`, numAt)],
    [PIndexed("\n", numAt + 40)],
    [PIndexed(feedback, feedbackAt)],
  );

describe("buildClearFeedbackRequests", () => {
  it("clears the last cell of every numbered row, bottom-up", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      qRow(1, 30, "She has lost the phone\n", 50),
      qRow(2, 100, "✅ Đúng\n", 120),
    ]);

    const ranges = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    // Descending, and each stops one short of the cell-terminating newline.
    expect(ranges).toEqual([
      { start: 120, end: 120 + "✅ Đúng".length },
      { start: 50, end: 50 + "She has lost the phone".length },
    ]);
  });

  it("skips the two header rows", () => {
    const tab = makeRawTab([header(), spacer()]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("is a true no-op on an already-cleared cell", () => {
    // What the doc looks like after the first clear: only the terminator left.
    const tab = makeRawTab([header(), spacer(), qRow(1, 30, "\n", 50)]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("emits nothing for a cell holding only whitespace", () => {
    const tab = makeRawTab([header(), spacer(), qRow(1, 30, "   \n", 50)]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("keeps the overall-comment label and cuts only what follows it", () => {
    const praise = " Làm tốt lắm, hãy cố gắng phát huy phong độ này nhé!💯🔥";
    const tab = makeRawTab([
      header(),
      spacer(),
      row([PIndexed(`${OVERALL_FEEDBACK_LABEL}:${praise}\n`, 200)]),
    ]);

    const [range] = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    // Starts after the label AND its colon — both belong to the template.
    expect(range.start).toBe(200 + OVERALL_FEEDBACK_LABEL.length + 1);
    // UTF-16 length, so the 💯🔥 surrogate pairs are counted the way Docs does.
    expect(range.end).toBe(200 + `${OVERALL_FEEDBACK_LABEL}:${praise}`.length);
  });

  it("emits nothing when the label has no comment appended yet", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      row([PIndexed(`${OVERALL_FEEDBACK_LABEL}:\n`, 200)]),
    ]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("covers the paragraph break inside a multi-paragraph feedback cell", () => {
    // Exactly what formatFeedbackForDoc produces: reason on its own line.
    const tab = makeRawTab([
      header(),
      spacer(),
      row(
        [PIndexed("1. Câu hỏi\n", 30)],
        [PIndexed("\n", 45)],
        [PIndexed("She has lost\n", 50), PIndexed("(giải thích)\n", 63)],
      ),
    ]);

    const [range] = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    expect(range.start).toBe(50);
    // Spans the mid-cell "\n" at 62 and stops before the terminator at 75.
    expect(range.end).toBe(63 + "(giải thích)".length);
  });

  it("leaves exactly one newline when the cell ends with two", () => {
    const tab = makeRawTab([header(), spacer(), qRow(1, 30, "abc\n\n", 50)]);
    const [range] = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));
    // "abc\n" goes, the final "\n" stays — proves /\n+$/ is not used.
    expect(range).toEqual({ start: 50, end: 54 });
  });

  it("handles an overall comment that wraps onto another paragraph", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      row([
        PIndexed(`${OVERALL_FEEDBACK_LABEL}: tốt\n`, 200),
        PIndexed(
          "thêm dòng nữa\n",
          200 + `${OVERALL_FEEDBACK_LABEL}: tốt\n`.length,
        ),
      ]),
    ]);

    const [range] = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    expect(range.start).toBe(200 + OVERALL_FEEDBACK_LABEL.length + 1);
    expect(range.end).toBe(
      200 + `${OVERALL_FEEDBACK_LABEL}: tốt\n`.length + "thêm dòng nữa".length,
    );
  });

  it("resolves the label offset across several runs in one paragraph", () => {
    // Bold/highlight splits a line into runs; the label straddles two of them.
    const tab = makeRawTab([
      header(),
      spacer(),
      row([
        PIndexedRuns(200, "Nhận xét chung ", "của Giáo viên", ": tốt lắm\n"),
      ]),
    ]);

    const [range] = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    expect(range.start).toBe(200 + OVERALL_FEEDBACK_LABEL.length + 1);
    expect(range.end).toBe(
      200 + "Nhận xét chung của Giáo viên: tốt lắm".length,
    );
  });

  it("refuses to guess when a smart chip precedes the label", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      row([
        PRichLink(200, "chip"),
        PIndexed(`${OVERALL_FEEDBACK_LABEL}: tốt\n`, 204),
      ]),
    ]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("never touches a one-cell row that is not the overall comment", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      row([PIndexed("1. Câu hỏi\n", 30)]),
    ]);
    expect(buildClearFeedbackRequests(tab, "t.x", [0])).toEqual([]);
  });

  it("returns disjoint ranges in strictly descending order", () => {
    const tab = makeRawTab([
      header(),
      spacer(),
      qRow(1, 30, "feedback một\n", 50),
      qRow(2, 100, "feedback hai\n", 120),
      row([PIndexed(`${OVERALL_FEEDBACK_LABEL}: tốt\n`, 200)]),
    ]);

    const ranges = rangesOf(buildClearFeedbackRequests(tab, "t.x", [0]));

    expect(ranges.length).toBe(3);
    for (let i = 0; i < ranges.length - 1; i++) {
      // Sorted high→low, and the next range ends before this one begins.
      expect(ranges[i].start).toBeGreaterThan(ranges[i + 1].start);
      expect(ranges[i + 1].end).toBeLessThanOrEqual(ranges[i].start);
    }
  });

  it("carries the tabId onto every range", () => {
    const tab = makeRawTab([header(), spacer(), qRow(1, 30, "abc\n", 50)]);
    const [req] = buildClearFeedbackRequests(tab, "t.abc", [0]);
    expect(req.deleteContentRange.range.tabId).toBe("t.abc");
  });

  it("returns [] when the lesson has no table index", () => {
    const tab = makeRawTab([header(), spacer(), qRow(1, 30, "abc\n", 50)]);
    expect(buildClearFeedbackRequests(tab, "t.x", null)).toEqual([]);
  });
});
