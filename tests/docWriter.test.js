import { describe, expect, it } from "vitest";
import { IS_CORRECT_ANSWER } from "../src/lib/docParser.js";
import {
  buildFeedbackRequests,
  createStyledTextRequests,
  formatFeedbackForDoc,
  generateOverallFeedback,
  parseAiResponse,
} from "../src/lib/docWriter.js";
import {
  P,
  makeNormalLessonTab,
  makeTabWithRows,
  questionRow,
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
      exercise,
      "t.x",
      [0],
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
      exercise,
      "t.x",
      [0],
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
    expect(buildFeedbackRequests([], exercise, "t.x", [0])).toEqual([]);
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
        exercise,
        "t.x",
        [0],
      );
      const texts = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText.text);
      expect(texts, numbering).toContain(IS_CORRECT_ANSWER);
    }
  });
});
