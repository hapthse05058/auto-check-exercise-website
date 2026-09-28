/**
 * Integration cover for one whole lesson tab, end to end through the real
 * modules: detect tables → resolve cells → extract pairs → build the
 * batchUpdate requests.
 *
 * The unit specs each guard one step. What breaks in production is the seams
 * between them, so this drives a tab shaped like a REAL BUỔI 07 document —
 * theory table, the legacy 3-column exercise, the new active→passive table with
 * its B1:/B2: formula band, and the overall-comment row — and asserts the
 * invariants that must hold across the whole chain.
 */
import { describe, expect, it } from "vitest";
import {
  describeGradedState,
  getQuesAndAnsFromRows,
  makeAnswerKey,
} from "../src/lib/docParser.js";
import { collectExerciseRows } from "../src/lib/docTableDetect.js";
import { buildFeedbackRequests } from "../src/lib/docWriter.js";

let cursor = 1000;
const P = (text) => ({
  startIndex: (cursor += 100),
  paragraph: { elements: [{ textRun: { content: text } }] },
});
const row = (...cells) => ({
  tableCells: cells.map((content) => ({ content })),
});

/** A tab shaped like a real BUỔI 07 document. */
function makeLessonTab() {
  cursor = 1000;
  const theory = [
    row([P("Lý thuyết")], [P("Nội dung")]),
    row([P("1. Câu bị động")], [P("be + PII")]),
  ];
  const legacy = [
    row([P("STT")], [P("Đề bài")], [P("Chữa bài")]),
    row([P("")], [P("")], [P("")]),
    row(
      [
        P("1. Tôi học tiếng Anh hàng ngày.\n"),
        P("→ I study English everyday.\n"),
      ],
      [P("")],
      [P("")],
    ),
  ];
  const passive = [
    row([P("Ví dụ: I am learning English → English is being learned by me")]),
    row(
      [P("HTĐ chủ động")],
      [P("Học viên thành lập công thức HTĐ bị động")],
      [P("GV sửa")],
    ),
    row([P("V (s/es)")], [P("B1: S + be\nB2: + PII\n")], [P("")]),
    row([P("Câu Chủ động → Câu Bị động")], [P("Gợi ý")], [P("GV sửa")]),
    row(
      [
        P("1. The teacher checks the lesson every day.\n"),
        P("→ The lesson is check by the teacher.\n"),
      ],
      [P("gợi ý riêng của đề")],
      [P("")],
    ),
    row(
      [
        P("2. The students clean the classrooms every afternoon.\n"),
        P("→ The classrooms are cleaned by the students.\n"),
      ],
      [P("")],
      [P("")],
    ),
  ];
  const overall = [row([P("Nhận xét chung của Giáo viên:")])];

  return {
    tabProperties: { title: "BUỔI 07 - Passive voice", tabId: "t.abc" },
    documentTab: {
      body: {
        content: [theory, legacy, passive, overall].map((tableRows) => ({
          table: { tableRows },
        })),
      },
    },
  };
}

const pairsOf = (tab) =>
  getQuesAndAnsFromRows(collectExerciseRows(tab, "basic_since_01042026").rows);

describe("one lesson tab, end to end", () => {
  it("grades both exercise kinds and nothing else", () => {
    const pairs = pairsOf(makeLessonTab());
    expect(pairs.map((p) => p.type)).toEqual([
      "vi_en",
      "active_passive",
      "active_passive",
    ]);
  });

  it("never sends the B1:/B2: formula row, the hint column or the theory table", () => {
    const blob = pairsOf(makeLessonTab())
      .map((p) => `${p.question}${p.answer}`)
      .join("\n");
    expect(blob).not.toContain("B1:");
    expect(blob).not.toContain("B2:");
    expect(blob).not.toContain("gợi ý riêng của đề");
    expect(blob).not.toContain("Lý thuyết");
    expect(blob).not.toContain("be + PII");
  });

  it("reports no unclassified table for a well-formed tab", () => {
    const { unclassifiedWithQuestions } = collectExerciseRows(
      makeLessonTab(),
      "basic_since_01042026",
    );
    expect(unclassifiedWithQuestions).toEqual([]);
  });

  it("writes each feedback into that row's own last cell, plus the overall comment", () => {
    const tab = makeLessonTab();
    const { rows } = collectExerciseRows(tab, "basic_since_01042026");
    const pairs = getQuesAndAnsFromRows(rows);

    const requests = buildFeedbackRequests(
      pairs.map((p, i) => ({
        rowKey: `${p.tableIdx}:${p.rowIdx}`,
        aiFeedback: `sửa-${i}`,
      })),
      rows,
      "t.abc",
    );
    const written = new Map(
      requests
        .filter((r) => r.insertText)
        .map((r) => [r.insertText.location.index, r.insertText.text]),
    );

    for (const [i, pair] of pairs.entries()) {
      const entry = rows.find(
        (e) => e.tableIdx === pair.tableIdx && e.rowIdx === pair.rowIdx,
      );
      expect(written.get(entry.fbCell.content[0].startIndex)).toBe(`sửa-${i}`);
    }
    expect([...written.values()].join(" ")).toMatch(/Hãy rút kinh nghiệm/);
  });

  it("tells a doc that only holds OLD feedback apart from a fully graded one", () => {
    // Feedback chỉ ở bảng bài tập cũ, bảng bài mới còn trống — đây chính là ca
    // mà thông báo "Tất cả tài liệu đã được chấm" gây hiểu nhầm.
    const tab = makeLessonTab();
    tab.documentTab.body.content[1].table.tableRows[2].tableCells[2].content = [
      {
        startIndex: 9999,
        paragraph: { elements: [{ textRun: { content: "✅ Đúng" } }] },
      },
    ];
    const { rows } = collectExerciseRows(tab, "basic_since_01042026");
    const state = describeGradedState(rows);

    expect(state.reviewed).toBe(true);
    expect([...state.gradedTables]).toEqual([1]);
    expect([...state.ungradedTables]).toEqual([2]); // bảng bài mới
  });

  it("keeps the same English sentence apart across the two exercise kinds", () => {
    const q = "The lesson is checked.";
    const a = "→ x";
    expect(makeAnswerKey(q, a, "vi_en")).not.toBe(
      makeAnswerKey(q, a, "active_passive"),
    );
    // …nhưng khoá của bài dịch phải y hệt lời gọi cũ không truyền loại.
    expect(makeAnswerKey(q, a, "vi_en")).toBe(makeAnswerKey(q, a));
  });
});
