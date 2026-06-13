import { describe, expect, it } from "vitest";
import {
  findTabByTitle,
  getQesAndAnsFromPartIVOfTheTargetTab,
  hasAnswer,
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
import { makeNormalLessonTab } from "./fixtures.js";

describe("parseDocLinks", () => {
  it("extracts docId and tabId from a full URL", () => {
    const text =
      "https://docs.google.com/document/d/1qcO8zJLzD9E3MGN-lYjwegx3L8TZpX2wBClnXUjG8mI/edit?pli=1&tab=t.s4p7o0dwc0bs";
    expect(parseDocLinks(text)).toEqual([
      { docId: "1qcO8zJLzD9E3MGN-lYjwegx3L8TZpX2wBClnXUjG8mI", tabId: "t.s4p7o0dwc0bs" },
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

  it("accepts real answers", () => {
    expect(hasAnswer("→ She has lost the phone")).toBe(true);
    expect(hasAnswer("answer")).toBe(true);
  });
});

describe("sentence helpers", () => {
  it("detects question numbering and answer arrows", () => {
    expect(startsWithNumberDot("12. Câu hỏi")).toBe(true);
    expect(startsWithNumberDot("Câu hỏi")).toBe(false);
    expect(startsWithArrow("→ trả lời")).toBe(true);
    expect(startsWithArrow("trả lời")).toBe(false);
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
      getTableIndexOfExercise("BUỔI 04 - ABC", CLASS_TYPE_BASIC_BEFORE_31032026),
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
      { question: "1. Câu hỏi một\n", answer: "→ My answer one\n" },
      { question: "2. Câu hỏi hai\n", answer: "→ My answer two\n" },
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
