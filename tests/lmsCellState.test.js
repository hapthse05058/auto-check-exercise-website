import { describe, expect, test } from "vitest";

import { lmsCellState, lmsSuggestedScore } from "../src/lib/lmsText.js";

const a = (status, extra = {}) => ({
  assignmentId: Math.random(),
  status,
  mcq: false,
  score: null,
  ...extra,
});

describe("lmsCellState", () => {
  test("nothing handed in (or no cell) is none", () => {
    expect(lmsCellState(undefined).state).toBe("none");
    expect(
      lmsCellState({ assignments: [a("notSubmitted"), a("notSubmitted")] }),
    ).toMatchObject({ state: "none", handedIn: 0, total: 2 });
  });

  test("handed in, not marked: pending; with the tool's draft: draft", () => {
    const assignments = [a("submitted"), a("notSubmitted")];
    expect(lmsCellState({ assignments })).toMatchObject({
      state: "pending",
      handedIn: 1,
      total: 2,
      score: null,
    });
    expect(lmsCellState({ assignments, toolDraft: true }).state).toBe("draft");
  });

  test("all handed-in work marked: graded, with the essay score (not the quiz)", () => {
    const c = lmsCellState({
      assignments: [
        a("graded", { mcq: true, score: 8 }),
        a("graded", { score: 4 }),
        a("notSubmitted"),
      ],
      toolDraft: true,
    });
    expect(c).toMatchObject({ state: "graded", score: 4, handedIn: 2 });
  });
});

test("multiple choice (status 0, scored by the LMS) does not keep a marked session pending", () => {
  const c = lmsCellState({
    assignments: [
      { status: "submitted", mcq: true, score: 7 },
      { status: "graded", mcq: false, score: 4 },
    ],
  });
  expect(c).toMatchObject({ state: "graded", score: 4 });
});

test("only multiple choice handed in: its own state, nothing for the teacher to mark", () => {
  const c = lmsCellState({
    assignments: [
      { status: "submitted", mcq: true, score: 7 },
      { status: "notSubmitted", mcq: false, score: null },
    ],
  });
  expect(c).toMatchObject({ state: "mcqOnly", handedIn: 1, total: 2 });
});

describe("lmsSuggestedScore", () => {
  const marks = (right, total) =>
    Array.from({ length: total }, (_, i) => ({ isCorrect: i < right }));
  test("the grading thresholds", () => {
    expect(lmsSuggestedScore(marks(5, 5)).score).toBe(5);
    expect(lmsSuggestedScore(marks(4, 5)).score).toBe(4);
    expect(lmsSuggestedScore(marks(3, 5)).score).toBe(3);
    expect(lmsSuggestedScore(marks(2, 5)).score).toBe(2);
    expect(lmsSuggestedScore(marks(1, 5))).toEqual({
      score: 1,
      correct: 1,
      counted: 5,
    });
    expect(lmsSuggestedScore([])).toBeNull();
  });
});
