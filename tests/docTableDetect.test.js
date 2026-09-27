import { describe, expect, it } from "vitest";
import {
  KIND_ACTIVE_PASSIVE,
  KIND_VI_EN,
  collectExerciseRows,
  detectTables,
} from "../src/lib/docTableDetect.js";
import { getCellText } from "../src/lib/docParser.js";
import {
  makeBareSttTable,
  makeLegacyTable,
  makeOverallTable,
  makePassiveTable,
  makeTabFromTables,
  makeTranslationTable4Col,
  makeVocabTable,
} from "./fixtures.js";

const kinds = (tab) => detectTables(tab).tables.map((t) => t.kind);
const indexes = (tab) => detectTables(tab).tables.map((t) => t.tableIdx);

describe("detectTables", () => {
  it("classifies the legacy 3-column table as a translation exercise", () => {
    expect(kinds(makeTabFromTables([makeLegacyTable()]))).toEqual([KIND_VI_EN]);
  });

  it('classifies a table whose feedback column is misspelled "Chữa phải"', () => {
    // Lỗi gõ có thật trong template buổi 14 (cả ba đời template). Trước khi sửa,
    // nó làm cả buổi không chấm được cho mọi học viên.
    const tab = makeTabFromTables([makeLegacyTable("", "Chữa phải")]);
    const { tables, unclassifiedWithQuestions } = detectTables(tab);
    expect(tables.map((x) => x.kind)).toEqual([KIND_VI_EN]);
    expect(unclassifiedWithQuestions).toEqual([]);
  });

  it('accepts any "Chữa …" heading, not just the one typo that was reported', () => {
    const tab = makeTabFromTables([makeLegacyTable("", "Chữa lỗi")]);
    expect(kinds(tab)).toEqual([KIND_VI_EN]);
  });

  it('still refuses "Bài làm của học viên" — bài tập TỰ CHỌN is never graded', () => {
    // Chốt chặn cho mọi lần nới FEEDBACK_HEADER về sau: bảng BÀI TẬP TỰ CHỌN
    // dùng đúng header này và tuyệt đối không được chấm.
    const tab = makeTabFromTables([
      makeLegacyTable("", "Bài làm của học viên"),
    ]);
    expect(detectTables(tab).tables).toEqual([]);
  });

  it("does not warn about bài tập TỰ CHỌN the students answered, nor absorb it", () => {
    // Buổi 02 lớp KTN707: bảng TỰ CHỌN (bảng 10) có bài làm của học viên nên
    // từng bị báo "không nhận ra được là bảng bài tập" cho cả 24 học viên.
    // Đứng ngay sau một bảng bài tập cùng số cột, nó cũng không được bị coi là
    // mảnh ngắt trang của bảng đó.
    const tab = makeTabFromTables([
      makeLegacyTable(),
      makeLegacyTable("", "Bài làm của học viên"),
    ]);
    const { tables, unclassifiedWithQuestions } = detectTables(tab);
    expect(tables.map((x) => x.tableIdx)).toEqual([0]);
    expect(unclassifiedWithQuestions).toEqual([]);
  });

  it("classifies the 4-column 'Tiếng Việt → Tiếng Anh' table as translation", () => {
    const tab = makeTabFromTables([makeTranslationTable4Col()]);
    expect(kinds(tab)).toEqual([KIND_VI_EN]);
  });

  it("classifies the 'Câu Chủ động → Câu Bị động' table as active→passive", () => {
    const tab = makeTabFromTables([makePassiveTable()]);
    expect(kinds(tab)).toEqual([KIND_ACTIVE_PASSIVE]);
  });

  it("does not let the 'thành lập công thức … bị động' band fake a passive table", () => {
    // The formula band alone says "bị động" but never "Câu Chủ động", so a
    // table carrying only that band must not be read as a dạng-2 exercise.
    const table = makePassiveTable().slice(0, 3);
    expect(detectTables(makeTabFromTables([table])).tables).toEqual([]);
  });

  it("ignores a reference table that has no feedback column", () => {
    expect(detectTables(makeTabFromTables([makeVocabTable()])).tables).toEqual(
      [],
    );
  });

  it("finds the overall-feedback row inside its merged single-cell row", () => {
    const tab = makeTabFromTables([makeLegacyTable(), makeOverallTable()]);
    expect(detectTables(tab).overall).toEqual({ tableIdx: 1, rowIdx: 0 });
  });

  it("picks every exercise table of a mixed tab, and only those", () => {
    const tab = makeTabFromTables([
      makeLegacyTable(),
      makeVocabTable(),
      makeTranslationTable4Col(),
      makeOverallTable(),
    ]);
    expect(indexes(tab)).toEqual([0, 2]);
    expect(kinds(tab)).toEqual([KIND_VI_EN, KIND_VI_EN]);
    expect(detectTables(tab).overall.tableIdx).toBe(3);
  });

  it("lets a headerless continuation inherit the previous table's kind", () => {
    // A table split by a page break: the second half keeps the questions but
    // loses the header row.
    const full = makePassiveTable();
    const continuation = full.slice(4);
    const tab = makeTabFromTables([full, continuation]);
    const { tables, unclassifiedWithQuestions } = detectTables(tab);
    expect(tables.map((t) => t.kind)).toEqual([
      KIND_ACTIVE_PASSIVE,
      KIND_ACTIVE_PASSIVE,
    ]);
    expect(tables[1].continuation).toBe(true);
    expect(unclassifiedWithQuestions).toEqual([]);
  });

  it("reports a table full of questions it could not classify", () => {
    // Different column count than anything before it, so it cannot inherit.
    const orphan = [
      row2("1. Câu mồ côi", "→ answer"),
      row2("2. Câu mồ côi nữa", "→ answer"),
    ];
    const tab = makeTabFromTables([orphan]);
    expect(detectTables(tab).unclassifiedWithQuestions).toEqual([0]);
  });

  it("honours TABLE_OVERRIDES when one matches the tab", async () => {
    const { TABLE_OVERRIDES } = await import("../src/lib/docTables.js");
    const tab = makeTabFromTables([
      makeVocabTable(),
      makeLegacyTable(),
      makeTranslationTable4Col(),
    ]);
    TABLE_OVERRIDES.push({ tabName: "BUỔI 04", tableIndex: [1] });
    try {
      expect(indexes(tab)).toEqual([1]);
    } finally {
      TABLE_OVERRIDES.length = 0;
    }
  });
});

/** Minimal 2-cell row helper for the orphan-table case. */
function row2(question, answer) {
  return {
    tableCells: [
      {
        content: [
          {
            paragraph: {
              elements: [{ textRun: { content: `${question}\n` } }],
            },
          },
          {
            paragraph: { elements: [{ textRun: { content: `${answer}\n` } }] },
          },
        ],
      },
      {
        content: [{ paragraph: { elements: [{ textRun: { content: "" } }] } }],
      },
    ],
  };
}

describe("collectExerciseRows", () => {
  it.each(["placeholder", "omitted"])(
    "resolves the question cell under merge mode %s",
    (mergeMode) => {
      const tab = makeTabFromTables([makeTranslationTable4Col({ mergeMode })]);
      const { rows } = collectExerciseRows(tab);
      const questions = rows.map((r) => getCellText(r.qCell).split("\n")[0]);
      expect(questions).toEqual([
        "1. Tôi học Tiếng Anh hàng ngày.",
        "2. Cô ấy đọc sách mỗi tối.",
        "1. Tôi đang học Tiếng Anh bây giờ.",
        "2. Cô ấy đang đọc sách bây giờ.",
      ]);
    },
  );

  it.each(["placeholder", "omitted"])(
    "never lets the hint column reach the caller under merge mode %s",
    (mergeMode) => {
      const tab = makeTabFromTables([makeTranslationTable4Col({ mergeMode })]);
      const { rows } = collectExerciseRows(tab);
      for (const entry of rows) {
        expect(getCellText(entry.qCell)).not.toContain("learn (v) học");
        expect(getCellText(entry.qCell)).not.toContain("read (v) đọc");
      }
    },
  );

  it("skips the B1:/B2: formula row of a passive table", () => {
    const tab = makeTabFromTables([makePassiveTable()]);
    const { rows } = collectExerciseRows(tab);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === KIND_ACTIVE_PASSIVE)).toBe(true);
    for (const entry of rows) {
      expect(getCellText(entry.qCell)).not.toContain("B1:");
    }
  });

  it("keeps duplicate question numbers apart by their own row", () => {
    const tab = makeTabFromTables([makeTranslationTable4Col()]);
    const { rows } = collectExerciseRows(tab);
    const keys = rows.map((r) => `${r.tableIdx}:${r.rowIdx}`);
    expect(new Set(keys).size).toBe(rows.length);
  });

  it("resolves the legacy bare-STT layout to the question cell beside it", () => {
    const tab = makeTabFromTables([makeBareSttTable()]);
    const { rows } = collectExerciseRows(tab);
    expect(rows).toHaveLength(1);
    expect(getCellText(rows[0].qCell)).toContain("Câu hỏi một");
    expect(getCellText(rows[0].numberCell).trim()).toBe("1");
  });

  it("marks the overall-feedback row and gives no question cell for it", () => {
    const tab = makeTabFromTables([makeLegacyTable(), makeOverallTable()]);
    const { rows } = collectExerciseRows(tab);
    const overall = rows.filter((r) => r.isOverall);
    expect(overall).toHaveLength(1);
    expect(overall[0].qCell).toBeNull();
    expect(getCellText(overall[0].overallCell)).toContain(
      "Nhận xét chung của Giáo viên",
    );
  });
});
