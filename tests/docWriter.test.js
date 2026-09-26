import { describe, expect, it } from "vitest";
import { IS_CORRECT_ANSWER } from "../src/lib/docParser.js";
import {
  buildFeedbackRequests,
  createStyledTextRequests,
  formatFeedbackForDoc,
  generateOverallFeedback,
  matchesOwnFeedback,
  parseAiResponse,
} from "../src/lib/docWriter.js";
import {
  P,
  makeNormalLessonTab,
  makeTabFromTables,
  makeTabWithRows,
  makeTranslationTable4Col,
  questionRow,
  row,
  rowsOf,
} from "./fixtures.js";

const MOCK_AI_RESPONSE = `| STT | Câu tiếng Việt | Câu tiếng Anh sai | Chữa bài |
|-----|----------------|-------------------|----------|
| 1   | Cô ấy đã bị mất điện thoại. | She lost the phone | She **has lost** the phone (giải thích) |
| 2   | Tôi có thể chỉ đường. | I can show the way | ✅ Đúng |

Các câu còn lại đúng rồi em nha!`;

describe("parseAiResponse", () => {
  it("parses the markdown table into question feedback", () => {
    expect(parseAiResponse(MOCK_AI_RESPONSE)).toEqual([
      {
        questionIndex: "1",
        aiFeedback: "She **has lost** the phone (giải thích)",
      },
      { questionIndex: "2", aiFeedback: "✅ Đúng" },
    ]);
  });

  it("skips separator lines and non-table text", () => {
    expect(parseAiResponse("no table here\n|---|---|---|---|")).toEqual([]);
  });
});

describe("generateOverallFeedback", () => {
  it("praises when everything is correct", () => {
    const feedback = generateOverallFeedback([
      { aiFeedback: IS_CORRECT_ANSWER },
      { aiFeedback: IS_CORRECT_ANSWER },
    ]);
    expect(feedback).toContain("Làm tốt lắm");
  });

  it("encourages when nothing is correct", () => {
    const feedback = generateOverallFeedback([
      { aiFeedback: "sai rồi" },
      { aiFeedback: "chưa đúng" },
    ]);
    expect(feedback).toContain("Cô đã chữa bài rồi");
  });

  it("mixes praise and encouragement otherwise", () => {
    const feedback = generateOverallFeedback([
      { aiFeedback: IS_CORRECT_ANSWER },
      { aiFeedback: "chưa đúng" },
    ]);
    expect(feedback).toContain("Hãy rút kinh nghiệm");
  });

  it("returns empty for empty input", () => {
    expect(generateOverallFeedback([])).toBe("");
  });
});

describe("formatFeedbackForDoc", () => {
  it("puts the reason on its own line", () => {
    expect(
      formatFeedbackForDoc("She **has lost** the phone (giải thích)"),
    ).toBe("She **has lost** the phone\n(giải thích)");
  });

  it("leaves a correct answer untouched", () => {
    expect(formatFeedbackForDoc(IS_CORRECT_ANSWER)).toBe(IS_CORRECT_ANSWER);
  });

  it("leaves feedback without a reason untouched", () => {
    expect(formatFeedbackForDoc("The sun rises")).toBe("The sun rises");
  });

  it("breaks before both reasons of a câu đơn + câu phức cell", () => {
    expect(
      formatFeedbackForDoc(
        "Câu đơn đúng là: The man **lost** the key. (Vbqt: lose - lost.) " +
          "Câu phức đúng là: The man who **lost** the key is new. (Vbqt: lose - lost.)",
      ),
    ).toBe(
      "Câu đơn đúng là: The man **lost** the key.\n" +
        "(Vbqt: lose - lost.)\n" +
        "Câu phức đúng là: The man who **lost** the key is new.\n" +
        "(Vbqt: lose - lost.)",
    );
  });

  it("emits the breaks in ascending order: sentence, reason, câu phức, reason", () => {
    expect(
      formatFeedbackForDoc(
        "Câu đơn đúng là: A. (lý do 1) Câu phức đúng là: B. (lý do 2)",
      ),
    ).toBe("Câu đơn đúng là: A.\n(lý do 1)\nCâu phức đúng là: B.\n(lý do 2)");
  });

  it("treats a full stop outside the parentheses the same way", () => {
    expect(
      formatFeedbackForDoc(
        "Câu đơn đúng là: X. (lý do 1). Câu phức đúng là: Y. (lý do 2).",
      ),
    ).toBe("Câu đơn đúng là: X.\n(lý do 1).\nCâu phức đúng là: Y.\n(lý do 2).");
  });

  it("does not open the cell with a blank line when câu phức comes first", () => {
    expect(formatFeedbackForDoc("Câu phức đúng là: Y. (lý do.)")).toBe(
      "Câu phức đúng là: Y.\n(lý do.)",
    );
  });

  it("breaks before câu phức even without any reason", () => {
    expect(formatFeedbackForDoc("Câu đơn: ✅ Đúng Câu phức: ✅ Đúng")).toBe(
      "Câu đơn: ✅ Đúng\nCâu phức: ✅ Đúng",
    );
  });

  it("accepts the loose prefix variants the AI may produce", () => {
    expect(
      formatFeedbackForDoc("Câu đơn: ✅ Đúng Câu phức  đúng  là : Y."),
    ).toBe("Câu đơn: ✅ Đúng\nCâu phức  đúng  là : Y.");
    expect(formatFeedbackForDoc("Câu đơn: ✅ Đúng Câu phức đúng là Y.")).toBe(
      "Câu đơn: ✅ Đúng\nCâu phức đúng là Y.",
    );
    expect(formatFeedbackForDoc("Câu đơn: ✅ Đúng Câu phức - Y.")).toBe(
      "Câu đơn: ✅ Đúng\nCâu phức - Y.",
    );
  });

  it("never splits a reason that merely mentions câu phức", () => {
    // Inside parentheses...
    expect(
      formatFeedbackForDoc(
        "The woman whom I love is my mother. (Câu phức là IC + DC, thiếu sub làm O nhé)",
      ),
    ).toBe(
      "The woman whom I love is my mother.\n(Câu phức là IC + DC, thiếu sub làm O nhé)",
    );
    // ...and bare, with no delimiter after "Câu phức".
    expect(
      formatFeedbackForDoc(
        "The woman whom I love is my mother. Câu phức là IC + DC, thiếu sub làm O nhé",
      ),
    ).toBe(
      "The woman whom I love is my mother. Câu phức là IC + DC, thiếu sub làm O nhé",
    );
  });

  it("ignores parentheses that belong to the sentence, nested ones included", () => {
    expect(
      formatFeedbackForDoc("She (who lives in (Hanoi)) left. (giải thích)"),
    ).toBe("She (who lives in (Hanoi)) left.\n(giải thích)");
  });

  it("keeps a ✅ on one form and breaks before câu phức and the reason", () => {
    expect(
      formatFeedbackForDoc(
        "Câu đơn: ✅ Đúng Câu phức đúng là: The man **who** is wearing a black hat is my teacher. (DCadj đứng sau N nó bổ nghĩa.)",
      ),
    ).toBe(
      "Câu đơn: ✅ Đúng\nCâu phức đúng là: The man **who** is wearing a black hat is my teacher.\n(DCadj đứng sau N nó bổ nghĩa.)",
    );
  });

  it("collapses stray newlines and handles empty input", () => {
    expect(formatFeedbackForDoc("The sun rises\n(S số ít -> V số ít)")).toBe(
      "The sun rises\n(S số ít -> V số ít)",
    );
    expect(formatFeedbackForDoc(null)).toBe("");
    expect(formatFeedbackForDoc("")).toBe("");
  });

  it("never starts the feedback with a line break", () => {
    expect(formatFeedbackForDoc("(chỉ có giải thích)")).toBe(
      "(chỉ có giải thích)",
    );
  });
});

describe("createStyledTextRequests", () => {
  it("splits **bold** spans into insert + style requests", () => {
    const requests = createStyledTextRequests("a **b** c", 10, "t.x");

    const inserts = requests.filter((r) => r.insertText);
    const styles = requests.filter((r) => r.updateTextStyle);

    expect(inserts.map((r) => r.insertText.text)).toEqual(["a ", "b", " c"]);
    expect(inserts.map((r) => r.insertText.location.index)).toEqual([
      10, 12, 13,
    ]);

    // All style updates come after all inserts.
    const lastInsertPos = requests.findLastIndex((r) => r.insertText);
    const firstStylePos = requests.findIndex((r) => r.updateTextStyle);
    expect(firstStylePos).toBeGreaterThan(lastInsertPos);

    const boldStyle = styles.find((r) => r.updateTextStyle.textStyle.bold);
    expect(boldStyle.updateTextStyle.range).toEqual({
      startIndex: 12,
      endIndex: 13,
      tabId: "t.x",
    });
  });

  it("handles text without bold markers", () => {
    const requests = createStyledTextRequests("plain", 5, "t.x");
    expect(requests).toHaveLength(2);
    expect(requests[0].insertText.text).toBe("plain");
    expect(requests[1].updateTextStyle.textStyle.bold).toBe(false);
  });
});

describe("buildFeedbackRequests", () => {
  it("writes per-question feedback bottom-up plus the overall comment", () => {
    const exercise = makeNormalLessonTab({ answered: true });
    const gradingResults = parseAiResponse(MOCK_AI_RESPONSE);

    const requests = buildFeedbackRequests(
      gradingResults,
      rowsOf(exercise),
      "t.x",
    );

    const inserts = requests.filter((r) => r.insertText);
    const texts = inserts.map((r) => r.insertText.text);

    // Overall feedback group (startIndex highest → applied first).
    expect(texts[0]).toContain("Hãy rút kinh nghiệm"); // mixed results
    // Question 2 (✅ Đúng) collapses to the plain correct mark, at index 80.
    expect(texts).toContain(IS_CORRECT_ANSWER);
    // Question 1 keeps its explanation (bold split into separate inserts).
    expect(texts.join("")).toContain("has lost");

    // Groups are applied in descending startIndex order: 133 > 80 > 50.
    const indexes = inserts.map((r) => r.insertText.location.index);
    expect(indexes[0]).toBeGreaterThan(indexes[1]);
    const correctInsert = inserts.find(
      (r) => r.insertText.text === IS_CORRECT_ANSWER,
    );
    expect(correctInsert.insertText.location.index).toBe(80);
  });

  it("keeps a câu đơn + câu phức cell intact, line break included", () => {
    const exercise = makeNormalLessonTab({ answered: true });
    const aiFeedback = formatFeedbackForDoc(
      "Câu đơn: ✅ Đúng Câu phức đúng là: The man **who** is wearing a black hat is my teacher. (DCadj đứng sau N nó bổ nghĩa.)",
    );

    const requests = buildFeedbackRequests(
      [{ questionIndex: "1", aiFeedback }],
      rowsOf(exercise),
      "t.x",
    );

    const written = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText.text)
      .join("");

    // The ✅ on the câu đơn must NOT swallow the câu phức correction.
    expect(written).toContain("Câu phức đúng là:");
    expect(written).toContain("who");
    // Câu phức and the reason each sit on their own line.
    expect(written).toContain("Câu đơn: ✅ Đúng\nCâu phức đúng là:");
    expect(written).toContain(
      "is my teacher.\n(DCadj đứng sau N nó bổ nghĩa.)",
    );
  });

  it("returns no requests when the AI response has no table", () => {
    const exercise = makeNormalLessonTab({ answered: true });
    expect(buildFeedbackRequests([], rowsOf(exercise), "t.x")).toEqual([]);
  });

  it("lands each feedback on its own row when question numbers repeat", () => {
    // Bảng dạng 1: mỗi nhóm thì đánh số lại từ 1, nên "1." và "2." đều xuất
    // hiện hai lần trong CÙNG một bảng.
    const tab = makeTabFromTables([makeTranslationTable4Col()]);
    const rows = rowsOf(tab);
    const results = rows.map((entry, i) => ({
      rowKey: `${entry.tableIdx}:${entry.rowIdx}`,
      questionIndex: String((i % 2) + 1),
      aiFeedback: `sửa ${i}`,
    }));

    const requests = buildFeedbackRequests(results, rows, "t.x");
    const written = new Map(
      requests
        .filter((r) => r.insertText)
        .map((r) => [r.insertText.location.index, r.insertText.text]),
    );

    // Mỗi ô "GV sửa" nhận đúng phần sửa của dòng mình.
    expect(written.get(50)).toBe("sửa 0");
    expect(written.get(80)).toBe("sửa 1");
    expect(written.get(110)).toBe("sửa 2");
    expect(written.get(140)).toBe("sửa 3");
  });

  it("does not shift later rows when an item is dropped mid-run", () => {
    // Đây chính là ca mà con trỏ tiến-một-chiều theo số thứ tự làm sai: bỏ mục
    // thứ hai đi, "1." của nhóm thì sau sẽ bị khớp vào dòng còn trống ở trên.
    const tab = makeTabFromTables([makeTranslationTable4Col()]);
    const rows = rowsOf(tab);
    const results = [rows[0], rows[2], rows[3]].map((entry, i) => ({
      rowKey: `${entry.tableIdx}:${entry.rowIdx}`,
      questionIndex: ["1", "1", "2"][i],
      aiFeedback: `sửa ${i}`,
    }));

    const written = new Map(
      buildFeedbackRequests(results, rows, "t.x")
        .filter((r) => r.insertText)
        .map((r) => [r.insertText.location.index, r.insertText.text]),
    );

    expect(written.get(50)).toBe("sửa 0");
    expect(written.get(110)).toBe("sửa 1"); // nhóm thì sau, KHÔNG phải ô 80
    expect(written.get(140)).toBe("sửa 2");
    expect(written.has(80)).toBe(false); // câu bị rớt: không ghi gì cả
  });

  it("joins several graded pairs that share one cell instead of overwriting", () => {
    const tab = makeTabFromTables([makeTranslationTable4Col()]);
    const rows = rowsOf(tab);
    const written = buildFeedbackRequests(
      [
        { rowKey: "0:2", aiFeedback: "sửa A" },
        { rowKey: "0:2", aiFeedback: "sửa B" },
      ],
      rows,
      "t.x",
    )
      .filter((r) => r.insertText)
      .map((r) => r.insertText.text)
      .join("");
    expect(written).toBe("sửa A\nsửa B");
  });

  it("skips a row whose feedback cell carries no content instead of throwing", () => {
    const rows = [
      { tableIdx: 0, rowIdx: 2, isOverall: false, qCell: null, fbCell: {} },
    ];
    expect(() =>
      buildFeedbackRequests([{ rowKey: "0:2", aiFeedback: "x" }], rows, "t.x"),
    ).not.toThrow();
    expect(
      buildFeedbackRequests([{ rowKey: "0:2", aiFeedback: "x" }], rows, "t.x"),
    ).toEqual([]);
  });

  it("finds the row whatever punctuation follows the question number", () => {
    // A question we could READ must be a question we can WRITE back to: the
    // row lookup uses the same numbering rule as the parser.
    for (const numbering of ["7.", "7 .", "7)"]) {
      const exercise = makeTabWithRows([
        questionRow([P(`${numbering} Câu hỏi bảy`), P("→ My answer")], "", 50),
      ]);
      const requests = buildFeedbackRequests(
        [{ questionIndex: "7", aiFeedback: IS_CORRECT_ANSWER }],
        rowsOf(exercise),
        "t.x",
      );
      const texts = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText.text);
      expect(texts, numbering).toContain(IS_CORRECT_ANSWER);
    }
  });
});

describe("matchesOwnFeedback", () => {
  // Two answered questions. Row 2's feedback carries **bold** and a reason on
  // its own line; row 3 is correct. That is what a real write looks like.
  const results = [
    {
      rowKey: "0:2",
      questionIndex: "1",
      aiFeedback: "She **has lost** the phone.\n(Sai thì.)",
    },
    { rowKey: "0:3", questionIndex: "2", aiFeedback: IS_CORRECT_ANSWER },
  ];
  const OVERALL = generateOverallFeedback(results);

  /** The doc as a re-read returns it, with the given text in each cell. */
  const docWith = ({ fb1 = [], fb2 = [], overall = "" } = {}) =>
    rowsOf(
      makeTabFromTables([
        [
          row([P("STT")], [P("Đề bài")], [P("Chữa bài")]),
          row([P("")], [P("")], [P("")]),
          row(
            [P("1. Câu hỏi một\n"), P("→ She lost the phone\n")],
            [P("")],
            fb1.length ? fb1.map((t) => P(t, 50)) : [P("\n", 50)],
          ),
          row(
            [P("2. Câu hỏi hai\n"), P("→ I can show the way\n")],
            [P("")],
            fb2.length ? fb2.map((t) => P(t, 80)) : [P("\n", 80)],
          ),
        ],
        [row([P(`Nhận xét chung của Giáo viên:${overall}\n`, 300)])],
      ]),
    );

  const written = {
    // "**" became styling; the reason is its own paragraph.
    fb1: ["She has lost the phone.\n", "(Sai thì.)\n"],
    fb2: [`${IS_CORRECT_ANSWER}\n`],
    overall: OVERALL,
  };

  it("recognises the doc once this run's feedback is in it", () => {
    expect(matchesOwnFeedback(results, docWith(written))).toBe(true);
  });

  it("does not claim a doc before anything was written", () => {
    expect(matchesOwnFeedback(results, docWith())).toBe(false);
  });

  it("refuses feedback somebody else typed into one of the cells", () => {
    const doc = docWith({ ...written, fb1: ["Em xem lại thì nhé.\n"] });
    expect(matchesOwnFeedback(results, doc)).toBe(false);
  });

  it("refuses a doc whose cells match but whose overall comment is missing", () => {
    const doc = docWith({ ...written, overall: "" });
    expect(matchesOwnFeedback(results, doc)).toBe(false);
  });

  it("agrees with buildFeedbackRequests on what goes where", () => {
    // Before the write, the requests carry exactly the strings checked above.
    const inserts = buildFeedbackRequests(results, docWith(), "t.x")
      .filter((r) => r.insertText)
      .map((r) => r.insertText.text);
    expect(inserts).toContain(IS_CORRECT_ANSWER);
    expect(inserts).toContain("has lost");
    expect(inserts).toContain(OVERALL);
  });

  it("never matches when nothing would be written", () => {
    expect(matchesOwnFeedback([], docWith(written))).toBe(false);
  });
});
