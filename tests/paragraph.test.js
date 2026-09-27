import { afterEach, describe, expect, it } from "vitest";
import {
  KIND_PARAGRAPH,
  KIND_VI_EN,
  collectExerciseRows,
  detectTables,
} from "../src/lib/docTableDetect.js";
import {
  describeGradedState,
  getCellText,
  getQuesAndAnsFromRows,
  getUnreadableQuestions,
  selectItemsToGrade,
} from "../src/lib/docParser.js";
import {
  buildClearFeedbackRequests,
  buildFeedbackRequests,
  matchesOwnFeedback,
  targetsAlreadyFilled,
} from "../src/lib/docWriter.js";
import { TABLE_OVERRIDES } from "../src/lib/docTables.js";
import {
  P,
  PIndexed,
  makeLegacyTable,
  makeOverallTable,
  makeParagraphTable,
  makeTabFromTables,
  paragraphFeedbackIndex,
  row,
  rowsOf,
} from "./fixtures.js";

const STUDENT =
  "My favourite hobby are play the guitar.\nI play usually it every weekend.";
const FEEDBACK =
  "My favourite hobby **is playing** the guitar.\n(S “hobby” số ít → “is”; HTTD là be + Ving nhé.)\n\nI **usually play** it every weekend.\n(“Usually” đứng trước V thường nhé.)";

const PARAGRAPH_AT = 500;
const PARAGRAPH_TABLE_IDX = 1; // after the legacy table in `lessonTab`
const PARAGRAPH_ROW_KEY = `${PARAGRAPH_TABLE_IDX}:2`;

/** Legacy sentence table, then a paragraph table, then the overall comment. */
const lessonTab = ({
  sentenceFeedback = "",
  student = STUDENT,
  paragraphFeedback = "",
  mergeMode,
  overall = "",
} = {}) =>
  makeTabFromTables([
    makeLegacyTable(sentenceFeedback),
    makeParagraphTable({
      student,
      feedback: paragraphFeedback,
      mergeMode,
      at: PARAGRAPH_AT,
    }),
    [row([P(`Nhận xét chung của Giáo viên:${overall}`, 2000)])],
  ]);

/** What selectItemsToGrade returns, reduced to what a caller acts on. */
const selected = (tab) =>
  selectItemsToGrade(rowsOf(tab)).map((item) => ({
    type: item.type,
    rowKey: `${item.tableIdx}:${item.rowIdx}`,
  }));

describe("paragraph table detection", () => {
  for (const mergeMode of ["real", "placeholder", "omitted"]) {
    it(`finds the student cell and the feedback cell (${mergeMode} merge)`, () => {
      const tab = makeTabFromTables([
        makeParagraphTable({ student: STUDENT, mergeMode }),
      ]);
      const { rows, unclassifiedWithQuestions } = collectExerciseRows(tab);

      expect(unclassifiedWithQuestions).toEqual([]);
      expect(rows).toHaveLength(1);
      const [entry] = rows;
      expect(entry.kind).toBe(KIND_PARAGRAPH);
      expect(entry.rowIdx).toBe(2);
      expect(getCellText(entry.qCell)).toBe(STUDENT);
      expect(entry.fbCell.content[0].startIndex).toBe(paragraphFeedbackIndex());
      expect(entry.promptText).toBe(
        "Chủ đề: Hobbies\nĐoạn văn mẫu:\nMy favourite hobby is playing the guitar.\nI play it every weekend.",
      );
    });
  }

  it("is found even before the student has written anything", () => {
    const tab = makeTabFromTables([makeParagraphTable()]);
    expect(detectTables(tab).tables.map((t) => t.kind)).toEqual([
      KIND_PARAGRAPH,
    ]);
  });

  it("strips the combining underline used in the buổi 03 sample", () => {
    const tab = makeTabFromTables([
      makeParagraphTable({ sample: "H̲e̲y̲! Let me introduce myself." }),
    ]);
    expect(rowsOf(tab)[0].promptText).toContain("Hey! Let me introduce");
  });

  it("does not let the table after it inherit the paragraph kind", () => {
    // Bảng câu KHÔNG header, cùng 3 cột, đứng ngay sau bảng đoạn văn: nếu kế
    // thừa loại, nó sẽ bị chấm như đoạn văn.
    // Bảng câu 3 cột ĐỨNG TRƯỚC là thứ có thể "truyền" loại vi_en qua bảng
    // đoạn văn (cũng 3 cột) xuống bảng mồ côi nếu không reset.
    const orphan = [
      row([P("1. Câu hỏi một\n"), P("→ My answer\n")], [P("")], [P("", 900)]),
    ];
    const tab = makeTabFromTables([
      makeLegacyTable(),
      makeParagraphTable(),
      orphan,
    ]);
    const { tables, unclassifiedWithQuestions } = detectTables(tab);
    expect(tables.map((t) => [t.tableIdx, t.kind])).toEqual([
      [0, KIND_VI_EN],
      [1, KIND_PARAGRAPH],
    ]);
    // Không lặng lẽ bỏ: nó được báo là bảng không nhận ra.
    expect(unclassifiedWithQuestions).toEqual([2]);
  });

  it("needs a feedback header — a lookalike without one is ignored", () => {
    const [header, ...rest] = makeParagraphTable();
    const noFeedback = [{ tableCells: header.tableCells.slice(0, 1) }, ...rest];
    const tab = makeTabFromTables([noFeedback]);
    expect(detectTables(tab).tables).toEqual([]);
  });

  it("anchors the student label to the whole cell", () => {
    // "Học viên viết lại câu…" là đề bài của bảng câu, không phải nhãn dòng.
    const table = makeParagraphTable({ student: STUDENT });
    table[2].tableCells[0].content = [
      PIndexed("Học viên viết lại câu sau\n", 900),
    ];
    const tab = makeTabFromTables([table]);
    expect(detectTables(tab).tables).toEqual([]);
  });

  it("never grades the BÀI TẬP TỰ CHỌN table next to it", () => {
    const optional = [
      row([P("Câu")], [P("Bài làm của học viên")]),
      row([P("1. baseball / like / I\n"), P("→ I like baseball\n")], [P("")]),
    ];
    const tab = makeTabFromTables([makeParagraphTable(), optional]);
    const { tables, unclassifiedWithQuestions } = detectTables(tab);
    expect(tables.map((t) => t.tableIdx)).toEqual([0]);
    expect(unclassifiedWithQuestions).toEqual([]);
  });
});

describe("paragraph tables and TABLE_OVERRIDES", () => {
  afterEach(() => {
    TABLE_OVERRIDES.length = 0;
  });

  it("still finds a paragraph table after an overridden sentence table", () => {
    TABLE_OVERRIDES.push({ tabName: "BUỔI 04", tableIndex: [0] });
    const tab = makeTabFromTables([
      makeLegacyTable(),
      makeParagraphTable({ student: STUDENT }),
    ]);
    expect(detectTables(tab).tables.map((t) => [t.tableIdx, t.kind])).toEqual([
      [0, KIND_VI_EN],
      [1, KIND_PARAGRAPH],
    ]);
  });

  it("keeps the paragraph kind when the override points at it", () => {
    TABLE_OVERRIDES.push({ tabName: "BUỔI 04", tableIndex: [1] });
    const tab = makeTabFromTables([
      makeLegacyTable(),
      makeParagraphTable({ student: STUDENT }),
    ]);
    expect(detectTables(tab).tables.map((t) => [t.tableIdx, t.kind])).toEqual([
      [1, KIND_PARAGRAPH],
    ]);
  });
});

describe("paragraph pairs", () => {
  it("sends the prompt and the whole student paragraph as one pair", () => {
    const pairs = getQuesAndAnsFromRows(rowsOf(lessonTab()));
    const paragraph = pairs.find((p) => p.type === KIND_PARAGRAPH);
    expect(paragraph).toEqual({
      question:
        "Chủ đề: Hobbies\nĐoạn văn mẫu:\nMy favourite hobby is playing the guitar.\nI play it every weekend.",
      answer: STUDENT,
      type: KIND_PARAGRAPH,
      tableIdx: PARAGRAPH_TABLE_IDX,
      rowIdx: 2,
    });
  });

  it("produces no pair when the student cell is empty", () => {
    const pairs = getQuesAndAnsFromRows(rowsOf(lessonTab({ student: "" })));
    expect(pairs.map((p) => p.type)).toEqual([KIND_VI_EN, KIND_VI_EN]);
  });

  it("never reports the paragraph as an unreadable question", () => {
    expect(getUnreadableQuestions(rowsOf(lessonTab()))).toEqual([]);
  });
});

describe("selectItemsToGrade", () => {
  const SENTENCES = [
    { type: KIND_VI_EN, rowKey: "0:2" },
    { type: KIND_VI_EN, rowKey: "0:3" },
  ];
  const PARAGRAPH = { type: KIND_PARAGRAPH, rowKey: PARAGRAPH_ROW_KEY };

  it("grades ONLY the paragraph when the sentences already carry feedback", () => {
    // Ca chính: doc đã auto-chấm câu trước khi có loại bài đoạn văn.
    const tab = lessonTab({ sentenceFeedback: "✅ Đúng" });
    expect(describeGradedState(rowsOf(tab)).reviewed).toBe(true);
    expect(selected(tab)).toEqual([PARAGRAPH]);
  });

  it("with two paragraph tables, picks only the one still empty", () => {
    const tab = makeTabFromTables([
      makeLegacyTable("✅ Đúng"),
      makeParagraphTable({ student: STUDENT, feedback: "Đã sửa.", at: 500 }),
      makeParagraphTable({ student: STUDENT, at: 3000 }),
    ]);
    expect(selected(tab)).toEqual([{ type: KIND_PARAGRAPH, rowKey: "2:2" }]);
  });

  it("grades the sentences but not a paragraph that already has feedback", () => {
    const tab = lessonTab({ paragraphFeedback: "Cô đã sửa tay." });
    expect(describeGradedState(rowsOf(tab)).reviewed).toBe(false);
    expect(selected(tab)).toEqual(SENTENCES);
  });

  it("grades everything, in document order, when nothing is graded yet", () => {
    expect(selected(lessonTab())).toEqual([...SENTENCES, PARAGRAPH]);
  });

  it("grades nothing when every cell already has feedback", () => {
    const tab = lessonTab({
      sentenceFeedback: "✅ Đúng",
      paragraphFeedback: "Đã sửa.",
    });
    expect(selected(tab)).toEqual([]);
  });

  it("leaves the sentence state alone when no paragraph was written", () => {
    const tab = lessonTab({ student: "" });
    const state = describeGradedState(rowsOf(tab));
    expect(state.reviewed).toBe(false);
    expect([...state.ungradedTables]).toEqual([0]);
    expect([...state.paragraphRowKeys.pending]).toEqual([]);
    expect(selected(tab)).toEqual(SENTENCES);
  });

  it("keeps paragraph feedback out of the doc-level `reviewed` flag", () => {
    const state = describeGradedState(
      rowsOf(lessonTab({ paragraphFeedback: "Đã sửa." })),
    );
    expect(state.reviewed).toBe(false);
    expect([...state.gradedTables]).toEqual([]);
    expect([...state.paragraphRowKeys.graded]).toEqual([PARAGRAPH_ROW_KEY]);
  });
});

describe("writing paragraph feedback", () => {
  const results = [
    { rowKey: PARAGRAPH_ROW_KEY, questionIndex: null, aiFeedback: FEEDBACK },
  ];
  const insertedAt = (requests) =>
    new Map(
      requests
        .filter((r) => r.insertText)
        .map((r) => [r.insertText.location.index, r.insertText.text]),
    );

  it("writes the multi-line feedback, blank line included, into the GV sửa cell", () => {
    const requests = buildFeedbackRequests(
      results,
      rowsOf(lessonTab({ sentenceFeedback: "✅ Đúng", overall: " Cũ." })),
      "t.x",
    );
    const text = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText.text)
      .join("");
    expect(text).toBe(
      "My favourite hobby is playing the guitar.\n(S “hobby” số ít → “is”; HTTD là be + Ving nhé.)\n\nI usually play it every weekend.\n(“Usually” đứng trước V thường nhé.)",
    );
    // Every insert lands inside the paragraph's feedback cell.
    const fbAt = paragraphFeedbackIndex(PARAGRAPH_AT);
    for (const index of insertedAt(requests).keys()) {
      expect(index).toBeGreaterThanOrEqual(fbAt);
    }
    const bold = requests
      .filter((r) => r.updateTextStyle?.textStyle.bold)
      .map((r) => r.updateTextStyle.range);
    expect(bold).toHaveLength(2);
  });

  it("does not append a second overall comment when one is already there", () => {
    const requests = buildFeedbackRequests(
      results,
      rowsOf(lessonTab({ sentenceFeedback: "✅ Đúng", overall: " Cũ." })),
      "t.x",
    );
    expect(insertedAt(requests).has(2000 + "Nhận xét chung".length)).toBe(
      false,
    );
    const texts = [...insertedAt(requests).values()].join("");
    expect(texts).not.toMatch(/rút kinh nghiệm|Làm tốt lắm/);
  });

  it("still writes the overall comment when the label is bare", () => {
    const requests = buildFeedbackRequests(results, rowsOf(lessonTab()), "t.x");
    expect([...insertedAt(requests).values()].join("")).toMatch(
      /rút kinh nghiệm/,
    );
  });

  it("recognises its own paragraph write afterwards", () => {
    const after = lessonTab({
      paragraphFeedback:
        "My favourite hobby is playing the guitar.\n(S “hobby” số ít → “is”; HTTD là be + Ving nhé.)\n\nI usually play it every weekend.\n(“Usually” đứng trước V thường nhé.)",
      overall: " Hãy rút kinh nghiệm và cố gắng hơn nữa nhé!🔥🔥",
    });
    expect(matchesOwnFeedback(results, rowsOf(after))).toBe(true);
  });

  it("tells whether a TARGET cell is filled, ignoring the other cells", () => {
    // Bài câu đã có feedback, ô đoạn văn trống ⇒ vẫn được ghi.
    expect(
      targetsAlreadyFilled(
        results,
        rowsOf(lessonTab({ sentenceFeedback: "✅ Đúng" })),
      ),
    ).toBe(false);
    // Có người ghi vào ô đoạn văn trong lúc chờ ⇒ chặn.
    expect(
      targetsAlreadyFilled(
        results,
        rowsOf(lessonTab({ paragraphFeedback: "Cô sửa tay." })),
      ),
    ).toBe(true);
  });

  it("clears the paragraph feedback cell with Xóa feedback", () => {
    const tab = makeTabFromTables([
      makeParagraphTable({ student: STUDENT, feedback: "Dòng 1\n\nDòng 2" }),
      makeOverallTable(3000),
    ]);
    const ranges = buildClearFeedbackRequests(rowsOf(tab), "t.x").map(
      (r) => r.deleteContentRange.range,
    );
    const fbAt = paragraphFeedbackIndex();
    // "Dòng 1\n" + "\n" + "Dòng 2\n", minus the cell's final newline.
    expect(ranges).toEqual([
      {
        startIndex: fbAt,
        endIndex: fbAt + "Dòng 1\n\nDòng 2".length,
        tabId: "t.x",
      },
    ]);
  });
});
