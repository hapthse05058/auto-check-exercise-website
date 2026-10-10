import { describe, expect, it } from "vitest";
import {
  PARAGRAPH_ALL_CORRECT,
  isCorrectFeedback,
  makeAnswerKey,
  selectItemsToGrade,
} from "../src/lib/docParser.js";
import {
  collectExerciseRows,
  sectionHeadingOf,
} from "../src/lib/docTableDetect.js";
import {
  generateOverallFeedback,
  paragraphFeedbackForDoc,
} from "../src/lib/docWriter.js";
import { P, makeTabFromTables, row } from "./fixtures.js";

const question = (n, answer) =>
  row(
    [P(`${n}. Câu hỏi ${n}\n`), P(`→ ${answer}\n`)],
    [P("gợi ý")],
    [P("\n", 100 + n * 10)],
  );
const heading = (text) => row([P(`${text}\n`)], [P("\n")], [P("\n")]);
const HEADER = row([P("Đề bài")], [P("Gợi ý")], [P("Chữa bài")]);

const sectionsOf = (tab) =>
  collectExerciseRows(tab)
    .rows.filter((r) => !r.isOverall)
    .map((r) => r.section ?? null);

describe("section headings", () => {
  it("gives each question the heading row above it", () => {
    const tab = makeTabFromTables([
      [
        HEADER,
        question(1, "I eat rice"),
        heading("Be going to: Tương lai gần có dự định trước"),
        question(6, "I will play football tonight"),
        question(7, "I am going to visit you"),
        heading("THỂ BỊ ĐỘNG"),
        row([P("Ví dụ: The cake was eaten.\n")], [P("\n")], [P("\n")]),
        question(8, "The house was built"),
      ],
    ]);
    expect(sectionsOf(tab)).toEqual([
      null,
      "Be going to: Tương lai gần có dự định trước",
      "Be going to: Tương lai gần có dự định trước",
      "THỂ BỊ ĐỘNG",
    ]);
    const items = selectItemsToGrade(collectExerciseRows(tab).rows);
    expect(items.map((i) => i.section ?? null)).toEqual(sectionsOf(tab));
  });

  it("is not fooled by text in the feedback column, an example or a header", () => {
    expect(
      sectionHeadingOf(row([P("\n")], [P("\n")], [P("Cô chữa ở dưới\n")])),
    ).toBe(null);
    expect(sectionHeadingOf(row([P("Ví dụ: She sings.\n")], [P("\n")]))).toBe(
      null,
    );
    expect(sectionHeadingOf(HEADER)).toBe(null);
    expect(sectionHeadingOf(row([P("x".repeat(200))], [P("\n")]))).toBe(null);
    // A full-width merged row (one cell) is a heading.
    expect(sectionHeadingOf(row([P("DC adv chỉ sự nhượng bộ\n")]))).toBe(
      "DC adv chỉ sự nhượng bộ",
    );
  });

  it("never takes a question cell for a heading", () => {
    // A cell whose first line is not numbered is skipped by resolveRowCells
    // (unchanged); it must not become the heading of the questions after it.
    const tab = makeTabFromTables([
      [
        HEADER,
        row(
          [
            P("TTQH: Where\n"),
            P("1. Tôi biết nơi anh ấy sống.\n"),
            P("→ I know where he lives\n"),
          ],
          [P("\n")],
          [P("\n", 300)],
        ),
        question(2, "I know where she works"),
      ],
    ]);
    expect(sectionsOf(tab)).toEqual([null]);
  });

  it("starts over in a new table but carries on across a page break", () => {
    const tab = makeTabFromTables([
      [HEADER, heading("Will: tương lai đơn"), question(1, "I will go")],
      // Page-break fragment: no header, same columns → continues table 0.
      [question(2, "I will come")],
      [HEADER, question(1, "I go home")],
    ]);
    expect(sectionsOf(tab)).toEqual([
      "Will: tương lai đơn",
      "Will: tương lai đơn",
      null,
    ]);
  });

  it("keys an item by its heading, and leaves keys without one unchanged", () => {
    const plain = makeAnswerKey("6. Tôi sẽ đá bóng.", "→ I will play", "vi_en");
    expect(
      makeAnswerKey("6. Tôi sẽ đá bóng.", "→ I will play", "vi_en", undefined),
    ).toBe(plain);
    expect(
      makeAnswerKey("6. Tôi sẽ đá bóng.", "→ I will play", "vi_en", ""),
    ).toBe(plain);
    expect(
      makeAnswerKey(
        "6. Tôi sẽ đá bóng.",
        "→ I will play",
        "vi_en",
        "Be going to",
      ),
    ).not.toBe(plain);
  });
});

describe("isCorrectFeedback", () => {
  it("agrees with what the cell writer collapses to ✅ Đúng", () => {
    expect(isCorrectFeedback("✅ Đúng")).toBe(true);
    expect(isCorrectFeedback("✅ Đúng.")).toBe(true);
    expect(isCorrectFeedback(PARAGRAPH_ALL_CORRECT)).toBe(true);
    expect(isCorrectFeedback("Câu đơn: ✅ Đúng Câu phức đúng là: X.")).toBe(
      false,
    );
    expect(isCorrectFeedback("I **go** home.")).toBe(false);
    expect(isCorrectFeedback("")).toBe(false);
  });

  it("counts an all-correct paragraph as right in the overall comment", () => {
    expect(
      generateOverallFeedback([
        { aiFeedback: "✅ Đúng" },
        { aiFeedback: PARAGRAPH_ALL_CORRECT },
      ]),
    ).toMatch(/Làm tốt lắm/);
    expect(
      generateOverallFeedback([
        { aiFeedback: "✅ Đúng" },
        { aiFeedback: "I **go** home." },
      ]),
    ).toMatch(/rút kinh nghiệm/);
  });

  it("turns an old cached paragraph ✅ Đúng into the teachers' sentence", () => {
    expect(paragraphFeedbackForDoc("✅ Đúng")).toBe(PARAGRAPH_ALL_CORRECT);
    expect(paragraphFeedbackForDoc("A **is** b.\n(lý do.)")).toBe(
      "A **is** b.\n(lý do.)",
    );
  });
});
