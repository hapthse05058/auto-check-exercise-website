import { describe, expect, it } from "vitest";
import {
  extractQuestionIndex,
  findTabByTitle,
  getCellLines,
  getQesAndAnsFromPartIVOfTheTargetTab,
  getUnreadableQuestions,
  hasAnswer,
  isPromptInstruction,
  parseDocLinks,
  startsWithArrow,
  startsWithNumberDot,
  wasExerciseReviewedByAI,
} from "../src/lib/docParser.js";
import {
  CLASS_TYPE_BASIC_BEFORE_31032026,
  CLASS_TYPE_BASIC_SINCE_01042026,
  getTableIndexOfExercise,
} from "../src/lib/docTables.js";
import {
  P,
  PRuns,
  makeNormalLessonTab,
  makeTabWithRows,
  questionRow,
} from "./fixtures.js";

/** Builds a one-table tab out of cell-0 paragraphs, one array per row. */
const tabOf = (...rowParagraphs) =>
  makeTabWithRows(rowParagraphs.map((paragraphs) => questionRow(paragraphs)));

/** Question/answer pairs of a single exercise row. */
const parseRow = (...paragraphs) =>
  getQesAndAnsFromPartIVOfTheTargetTab(tabOf(paragraphs), [0]);

describe("parseDocLinks", () => {
  it("extracts docId and tabId from a full URL", () => {
    const text =
      "https://docs.google.com/document/d/1qcO8zJLzD9E3MGN-lYjwegx3L8TZpX2wBClnXUjG8mI/edit?pli=1&tab=t.s4p7o0dwc0bs";
    expect(parseDocLinks(text)).toEqual([
      {
        docId: "1qcO8zJLzD9E3MGN-lYjwegx3L8TZpX2wBClnXUjG8mI",
        tabId: "t.s4p7o0dwc0bs",
      },
    ]);
  });

  it("defaults tabId to t.0 when the link has no tab param (extension bug fixed)", () => {
    const text = "https://docs.google.com/document/d/abc123XYZ/edit";
    expect(parseDocLinks(text)).toEqual([{ docId: "abc123XYZ", tabId: "t.0" }]);
  });

  it("parses one link per line and skips blank lines", () => {
    const text = [
      "https://docs.google.com/document/d/doc1/edit?tab=t.1",
      "",
      "https://docs.google.com/document/d/doc2/edit?tab=t.2&x=1",
    ].join("\n");
    expect(parseDocLinks(text)).toEqual([
      { docId: "doc1", tabId: "t.1" },
      { docId: "doc2", tabId: "t.2" },
    ]);
  });

  it("ignores lines without a doc id", () => {
    expect(parseDocLinks("not a link\n")).toEqual([]);
  });
});

describe("hasAnswer", () => {
  it("rejects empty-ish answers", () => {
    expect(hasAnswer(null)).toBe(false);
    expect(hasAnswer(undefined)).toBe(false);
    expect(hasAnswer("")).toBe(false);
    expect(hasAnswer("→ \n")).toBe(false);
    expect(hasAnswer("→")).toBe(false);
    expect(hasAnswer("→ \n\n→ \n")).toBe(false);
    expect(hasAnswer("   \n ")).toBe(false);
  });

  it("rejects an untouched row whatever marker the template uses", () => {
    // Widening the marker set must not turn "-> " into a real answer, or the
    // AI would be asked to grade nothing.
    expect(hasAnswer("-> ")).toBe(false);
    expect(hasAnswer("=> ")).toBe(false);
    expect(hasAnswer("–> ")).toBe(false);
    expect(hasAnswer(">")).toBe(false);
  });

  it("accepts real answers", () => {
    expect(hasAnswer("→ She has lost the phone")).toBe(true);
    expect(hasAnswer("answer")).toBe(true);
  });

  it("keeps a '>' that belongs to the answer itself", () => {
    // Markers are only stripped at the START of a line.
    expect(hasAnswer("→ x > 2")).toBe(true);
  });
});

describe("sentence helpers", () => {
  it("detects question numbering and answer arrows", () => {
    expect(startsWithNumberDot("12. Câu hỏi")).toBe(true);
    expect(startsWithNumberDot("Câu hỏi")).toBe(false);
    expect(startsWithArrow("→ trả lời")).toBe(true);
    expect(startsWithArrow("trả lời")).toBe(false);
  });

  it("accepts the numbering students actually type", () => {
    expect(startsWithNumberDot(" 12. Câu hỏi")).toBe(true);
    expect(startsWithNumberDot("12 . Câu hỏi")).toBe(true);
    expect(startsWithNumberDot("12) Câu hỏi")).toBe(true);
  });

  it("accepts every arrow/label variant students type instead of →", () => {
    for (const line of [
      "-> answer",
      "--> answer",
      "->> answer",
      "=> answer",
      "> answer",
      "–> answer", // en-dash, Google Docs autocorrects "-" into "–"
      "—> answer",
      "->answer", // no space at all
      "  → answer",
      " → answer", // non-breaking space
      "Trả lời: answer",
      "Ans: answer",
      "Answer: answer",
      "Đáp án: answer",
      ": answer",
    ]) {
      expect(startsWithArrow(line), line).toBe(true);
    }
  });

  it("does not mistake ordinary text for an answer marker", () => {
    expect(startsWithArrow("answer")).toBe(false);
    expect(startsWithArrow("Câu phức: Một công ty…")).toBe(false);
    expect(startsWithArrow("12. Rút gọn DCN trong câu sau:")).toBe(false);
  });

  it("extracts a bare numeric index, whatever the punctuation", () => {
    // docWriter locates the row with this value, so it must stay digits-only.
    expect(extractQuestionIndex("7. Câu hỏi")).toBe("7");
    expect(extractQuestionIndex("7 . Câu hỏi")).toBe("7");
    expect(extractQuestionIndex("7) Câu hỏi")).toBe("7");
    expect(extractQuestionIndex("Câu hỏi")).toBeNull();
  });

  it("only treats a Vietnamese imperative as an instruction line", () => {
    expect(isPromptInstruction("12. Rút gọn DCN trong câu sau:")).toBe(true);
    expect(isPromptInstruction("Viết lại câu sau")).toBe(true);
    // An English answer must never pass, or rule 4 would swallow the line
    // after it into the question.
    expect(isPromptInstruction("Use a smartphone to call her")).toBe(false);
    expect(isPromptInstruction("Rewrite the sentence")).toBe(false);
    // …nor an ordinary Vietnamese sentence that merely contains such a verb.
    expect(isPromptInstruction("3. Tôi đã sửa xe hôm qua.")).toBe(false);
  });
});

describe("getCellLines", () => {
  it("joins every text run so formatting cannot hide the marker", () => {
    // Bold/highlight/link split one line into several runs.
    const cell = { content: [PRuns("→ A company that ", "viewed", " my CV")] };
    expect(getCellLines(cell)).toEqual(["→ A company that viewed my CV"]);
  });

  it("reads smart chips, which carry no textRun", () => {
    const cell = {
      content: [
        {
          paragraph: {
            elements: [
              { textRun: { content: "→ see " } },
              { richLink: { richLinkProperties: { title: "Grammar doc" } } },
            ],
          },
        },
      ],
    };
    expect(getCellLines(cell)).toEqual(["→ see Grammar doc"]);
  });

  it("splits soft line breaks (Shift+Enter) and drops blank lines", () => {
    const cell = { content: [P("1. Câu hỏi\v→ My answer\n"), P("   ")] };
    expect(getCellLines(cell)).toEqual(["1. Câu hỏi", "→ My answer"]);
  });

  it("survives cells with no paragraph at all", () => {
    expect(getCellLines({ content: [{ table: {} }, {}] })).toEqual([]);
    expect(getCellLines(undefined)).toEqual([]);
  });
});

describe("getTableIndexOfExercise", () => {
  it("maps tabs for the new basic class type", () => {
    expect(
      getTableIndexOfExercise("BUỔI 04 - ABC", CLASS_TYPE_BASIC_SINCE_01042026),
    ).toEqual([5, 6, 7, 8, 9]);
  });

  it("maps tabs for the old basic class type", () => {
    expect(
      getTableIndexOfExercise(
        "BUỔI 04 - ABC",
        CLASS_TYPE_BASIC_BEFORE_31032026,
      ),
    ).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("returns null for unknown tab or class type", () => {
    expect(
      getTableIndexOfExercise("BUỔI 99", CLASS_TYPE_BASIC_SINCE_01042026),
    ).toBeNull();
    expect(getTableIndexOfExercise("BUỔI 04", "other_type")).toBeNull();
  });
});

describe("findTabByTitle", () => {
  it("finds nested child tabs", () => {
    const tabs = [
      { tabProperties: { title: "A" } },
      {
        tabProperties: { title: "B" },
        childTabs: [{ tabProperties: { title: "BUỔI 10" } }],
      },
    ];
    expect(findTabByTitle(tabs, "BUỔI 10")).toBe(tabs[1].childTabs[0]);
    expect(findTabByTitle(tabs, "missing")).toBeNull();
  });
});

describe("getQesAndAnsFromPartIVOfTheTargetTab", () => {
  it("extracts answered questions for a normal lesson", () => {
    const tab = makeNormalLessonTab({ answered: true });
    const result = getQesAndAnsFromPartIVOfTheTargetTab(tab, [0]);
    expect(result).toEqual([
      { question: "1. Câu hỏi một", answer: "→ My answer one" },
      { question: "2. Câu hỏi hai", answer: "→ My answer two" },
    ]);
  });

  it("returns empty array when nothing is answered", () => {
    const tab = makeNormalLessonTab({ answered: false });
    expect(getQesAndAnsFromPartIVOfTheTargetTab(tab, [0])).toEqual([]);
  });

  it("returns undefined when tableIndex is missing", () => {
    const tab = makeNormalLessonTab();
    expect(getQesAndAnsFromPartIVOfTheTargetTab(tab, null)).toBeUndefined();
  });

  it("ignores a table index the doc does not have", () => {
    expect(
      getQesAndAnsFromPartIVOfTheTargetTab(makeNormalLessonTab(), [9]),
    ).toEqual([]);
  });
});

describe("reading answers students typed off-format", () => {
  it("reads any arrow variant, glued or padded", () => {
    expect(parseRow(P("1. Câu hỏi"), P("-> My answer"))).toEqual([
      { question: "1. Câu hỏi", answer: "-> My answer" },
    ]);
    expect(parseRow(P("1. Câu hỏi"), P("=>My answer"))).toEqual([
      { question: "1. Câu hỏi", answer: "=>My answer" },
    ]);
    expect(parseRow(P("1. Câu hỏi"), P("  Trả lời: My answer"))).toEqual([
      { question: "1. Câu hỏi", answer: "  Trả lời: My answer" },
    ]);
  });

  it("reads an answer whose arrow the student deleted", () => {
    expect(parseRow(P("1. Tôi sống ở Hà Nội."), P("I live in Hanoi."))).toEqual(
      [{ question: "1. Tôi sống ở Hà Nội.", answer: "I live in Hanoi." }],
    );
  });

  it("reads an answer typed on the line after the arrow", () => {
    expect(
      parseRow(P("1. Tôi sống ở Hà Nội."), P("→"), P("I live in Hanoi.")),
    ).toEqual([
      { question: "1. Tôi sống ở Hà Nội.", answer: "→\nI live in Hanoi." },
    ]);
  });

  it("reads an answer split into runs by bold/highlight/link", () => {
    expect(
      parseRow(
        PRuns("1. ", "Câu hỏi"),
        PRuns("→ A company that ", "viewed", " my CV"),
      ),
    ).toEqual([
      { question: "1. Câu hỏi", answer: "→ A company that viewed my CV" },
    ]);
  });

  it("keeps a bold question number from truncating the question", () => {
    const [pair] = parseRow(
      PRuns("7. ", "Một công ty đã gọi điện."),
      P("→ A company called me."),
    );
    expect(pair.question).toBe("7. Một công ty đã gọi điện.");
  });

  it("keeps a marked line as the answer even when it mixes in Vietnamese", () => {
    expect(
      parseRow(
        P("1. Tôi sống ở Hà Nội."),
        P("→ I live in Hanoi (em chưa chắc)"),
      ),
    ).toEqual([
      {
        question: "1. Tôi sống ở Hà Nội.",
        answer: "→ I live in Hanoi (em chưa chắc)",
      },
    ]);
  });

  it("skips section header rows and rows with no paragraph", () => {
    const tab = makeTabWithRows([
      questionRow([P("TTQH: Where")]),
      questionRow([{ table: {} }]),
      questionRow([P("1. Câu hỏi"), P("→ My answer")]),
    ]);
    expect(getQesAndAnsFromPartIVOfTheTargetTab(tab, [0])).toEqual([
      { question: "1. Câu hỏi", answer: "→ My answer" },
    ]);
  });
});

describe("lessons whose cell holds two sentences (buổi 15/16/17/22)", () => {
  const complexRow = [
    P("7. Một công ty đã gọi điện cho tôi."),
    P("→ A company called me."),
    P("Câu phức: Một công ty mà đã xem CV của tôi đã gọi điện cho tôi."),
    PRuns("→ A company that ", "viewed", " my CV called me."),
  ];

  it("grades the whole cell as one item", () => {
    expect(parseRow(...complexRow)).toEqual([
      {
        question:
          "7. Một công ty đã gọi điện cho tôi.\n" +
          "Câu phức: Một công ty mà đã xem CV của tôi đã gọi điện cho tôi.",
        answer:
          "→ A company called me.\n→ A company that viewed my CV called me.",
      },
    ]);
  });

  it("never grades the 'Câu phức' prompt line as an answer", () => {
    // Even with its own arrow deleted, the prompt half stays in the question.
    const [pair] = parseRow(
      P("7. Một công ty đã gọi điện cho tôi."),
      P("→ A company called me."),
      P("Câu phức: Một công ty mà đã xem CV của tôi đã gọi điện cho tôi."),
    );
    expect(pair.answer).toBe("→ A company called me.");
    expect(pair.question).toContain("Câu phức:");
  });
});

describe("buổi 23, where the prompt itself contains English", () => {
  // "12. Rút gọn DCN trong câu sau:" is followed by the English sentence the
  // student has to reduce — that sentence is the QUESTION, not their answer.
  const lesson23 = (...rows) =>
    getQesAndAnsFromPartIVOfTheTargetTab(
      makeTabWithRows(rows.map(questionRow), "BUỔI 23"),
      [0],
    );

  it("does not grade the English prompt sentence of an unanswered row", () => {
    expect(
      lesson23([
        P("12. Rút gọn DCN trong câu sau:"),
        P("I don't know where I should live."),
        P("→"),
      ]),
    ).toEqual([]);
  });

  it("does not grade it even when the row has no arrow line at all", () => {
    expect(
      lesson23([
        P("13. Rút gọn DCN trong câu sau:"),
        P("My biggest concern is what I should eat."),
      ]),
    ).toEqual([]);
  });

  it("reads the answer that follows the English prompt sentence", () => {
    expect(
      lesson23([
        P("12. Rút gọn DCN trong câu sau:"),
        P("I don't know where I should live."),
        P("→ I don't know where to live."),
      ]),
    ).toEqual([
      {
        question:
          "12. Rút gọn DCN trong câu sau:\nI don't know where I should live.",
        answer: "→ I don't know where to live.",
      },
    ]);
  });

  it("reads it even when the student deleted the arrow", () => {
    const [pair] = lesson23([
      P("12. Rút gọn DCN trong câu sau:"),
      P("I don't know where I should live."),
      P("I don't know where to live."),
    ]);
    expect(pair.answer).toBe("I don't know where to live.");
    expect(pair.question).toContain("I don't know where I should live.");
  });

  it("handles both question shapes inside one table", () => {
    expect(
      lesson23(
        [
          P("5. Tôi không biết tôi nên sống ở đâu."),
          P("→ I don't know where I should live."),
        ],
        [
          P("12. Rút gọn DCN trong câu sau:"),
          P("I don't know where I should live."),
          P("→ I don't know where to live."),
        ],
      ),
    ).toEqual([
      {
        question: "5. Tôi không biết tôi nên sống ở đâu.",
        answer: "→ I don't know where I should live.",
      },
      {
        question:
          "12. Rút gọn DCN trong câu sau:\nI don't know where I should live.",
        answer: "→ I don't know where to live.",
      },
    ]);
  });
});

describe("getUnreadableQuestions", () => {
  it("reports a row whose answer could not be told apart from the prompt", () => {
    // No marker AND answered in Vietnamese — the parser refuses to guess.
    const tab = tabOf([P("5. Tôi sống ở Hà Nội."), P("Tôi sống ở thủ đô.")]);
    expect(getUnreadableQuestions(tab, [0])).toEqual(["5"]);
    expect(getQesAndAnsFromPartIVOfTheTargetTab(tab, [0])).toEqual([]);
  });

  it("stays quiet on an untouched exercise", () => {
    expect(
      getUnreadableQuestions(makeNormalLessonTab({ answered: false }), [0]),
    ).toEqual([]);
  });

  it("stays quiet on a buổi 23 prompt with no arrow line", () => {
    const tab = makeTabWithRows(
      [
        questionRow([
          P("13. Rút gọn DCN trong câu sau:"),
          P("My biggest concern is what I should eat."),
        ]),
      ],
      "BUỔI 23",
    );
    expect(getUnreadableQuestions(tab, [0])).toEqual([]);
  });

  it("stays quiet when the answer was read despite the missing arrow", () => {
    const tab = tabOf([P("5. Tôi sống ở Hà Nội."), P("I live in Hanoi.")]);
    expect(getUnreadableQuestions(tab, [0])).toEqual([]);
  });

  it("returns empty when tableIndex is missing", () => {
    expect(getUnreadableQuestions(makeNormalLessonTab(), null)).toEqual([]);
  });
});

describe("wasExerciseReviewedByAI", () => {
  it("is false when the feedback column is empty", () => {
    const tab = makeNormalLessonTab({ feedback: "" });
    expect(wasExerciseReviewedByAI(tab, [0])).toBe(false);
  });

  it("is true when a question row already has feedback", () => {
    const tab = makeNormalLessonTab({ feedback: "✅ Đúng" });
    expect(wasExerciseReviewedByAI(tab, [0])).toBe(true);
  });
});
