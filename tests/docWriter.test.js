import { describe, expect, it } from "vitest";
import { IS_CORRECT_ANSWER } from "../src/lib/docParser.js";
import {
  buildFeedbackRequests,
  createStyledTextRequests,
  generateOverallFeedback,
  parseAiResponse,
} from "../src/lib/docWriter.js";
import { makeNormalLessonTab } from "./fixtures.js";

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

  it("returns no requests when the AI response has no table", () => {
    const exercise = makeNormalLessonTab({ answered: true });
    expect(buildFeedbackRequests([], exercise, "t.x", [0])).toEqual([]);
  });
});
