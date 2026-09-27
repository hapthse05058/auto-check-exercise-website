/**
 * hsDoc.js — reading HS lesson tabs against the blank form and writing the
 * AI's corrections back, on real Docs API dumps (tests/fixtures/hs):
 *   blank      the blank form every student doc is a copy of
 *   graded-a/b/c  three student docs a teacher has partly corrected
 * Student typing and the AI's writes are applied with tests/helpers/fakeDocs.
 */
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  alignParagraphs,
  buildHsClearRequests,
  buildHsFeedbackRequests,
  collectHsItems,
  findHsTab,
  formatHsFeedback,
  hsLessonFor,
  matchesOwnHsFeedback,
  planHsWrites,
  selectHsItemsToGrade,
  splitBySlots,
} from "../src/lib/hsDoc.js";
import { HS_LESSONS } from "../src/lib/hsTemplate.js";
import {
  RED,
  applyRequests,
  findCell,
  findParagraph,
  loadHsFixture,
  paraText,
  styleWord,
  tabByTitle,
  typeInCell,
  typeInto,
} from "./helpers/fakeDocs.js";

const read = (tab, lessonName = tab.tabProperties.title) =>
  collectHsItems(tab, { lessonName });

const items = (tab, exerciseId) =>
  read(tab).items.filter((i) => !exerciseId || i.exerciseId === exerciseId);

/** Every paragraph text of a tab, tables included, for before/after diffs. */
function tabTexts(tab) {
  const out = [];
  const walk = (content) => {
    for (const b of content || []) {
      if (b.paragraph) out.push(paraText(b));
      if (b.table) {
        b.table.tableRows.forEach((r) =>
          r.tableCells.forEach((c) => walk(c.content)),
        );
      }
    }
  };
  walk(tab.documentTab.body.content);
  return out;
}

/** A verdict for every item: odd-numbered right, even-numbered wrong. */
const verdicts = (list) =>
  new Map(
    list.map((i) => [
      i.key,
      i.n % 2
        ? { correct: true }
        : {
            correct: false,
            corrected: "Fixed **here**.",
            explanation: "S số ít nhé",
            expected: "here",
          },
    ]),
  );

/** Grades `list` and writes the result into `doc`, like a job would. */
function gradeAndWrite(doc, tab, list) {
  const fresh = read(tab).items;
  const { writes } = planHsWrites(fresh, verdicts(list));
  applyRequests(doc, buildHsFeedbackRequests(writes, tab.tabProperties.tabId));
  return writes;
}

// ---------------------------------------------------------------------------

describe("the catalogue (hsTemplate.js) against the blank form", () => {
  const blank = loadHsFixture("blank");

  it("has the 24 lessons and the 2 reviews, with canonical ids", () => {
    expect(HS_LESSONS.map((l) => l.id)).toEqual([
      ...Array.from(
        { length: 24 },
        (_, i) => `hsLesson${String(i + 1).padStart(2, "0")}`,
      ),
      "hsReview1",
      "hsReview2",
    ]);
  });

  it("declares exactly `expected` items per exercise, with unique keys", () => {
    const keys = new Set();
    for (const lesson of HS_LESSONS) {
      for (const ex of lesson.exercises) {
        expect(ex.items.length, `${lesson.id} ${ex.id}`).toBe(ex.expected);
        for (const item of ex.items) {
          expect(keys.has(item.key), item.key).toBe(false);
          keys.add(item.key);
          expect(item.key.startsWith(`${lesson.id}|${ex.id}|`)).toBe(true);
        }
      }
    }
    // A few counts named in the plan.
    const count = (id, ex) =>
      HS_LESSONS.find((l) => l.id === id).exercises.find((e) => e.id === ex)
        .items.length;
    expect(count("hsLesson01", "ex1")).toBe(5);
    expect(count("hsLesson01", "ex2")).toBe(15);
    expect(count("hsLesson09", "ex2")).toBe(16);
    expect(count("hsLesson14", "ex2")).toBe(10);
  });

  it("reads every tab of the blank form: all exercises found, nothing answered", () => {
    expect(blank.tabs).toHaveLength(26);
    for (const tab of blank.tabs) {
      const { lesson, items: list, warnings } = read(tab);
      expect(lesson, tab.tabProperties.title).not.toBeNull();
      expect(warnings, tab.tabProperties.title).toEqual([]);
      const expected = lesson.exercises.reduce((n, e) => n + e.expected, 0);
      expect(list).toHaveLength(expected);
      expect(list.filter((i) => i.unreadable)).toEqual([]);
      expect(list.filter((i) => i.answered)).toEqual([]);
      expect(list.filter((i) => i.graded)).toEqual([]);
    }
  });
});

it("hsTemplate.js is what the generator makes from the blank form", () => {
  // Throws (exit 1) when someone edited the catalogue but not the output.
  execFileSync(process.execPath, ["scripts/buildHsTemplate.mjs", "--check"], {
    stdio: "pipe",
  });
});

describe("lessons and tabs", () => {
  const blank = loadHsFixture("blank");

  it("maps course lessons to the form by id or by number", () => {
    expect(hsLessonFor({ lessonId: "hsLesson09" }).title).toBe("Buổi 09");
    expect(hsLessonFor({ lessonName: "BUỔI 9" }).id).toBe("hsLesson09");
    expect(hsLessonFor({ lessonName: "Ôn tập thêm 2" }).id).toBe("hsReview2");
    expect(hsLessonFor({ lessonName: "Lesson 5" })).toBeNull();
  });

  it("finds the tab despite spacing and case (the form has 'Buổi  09')", () => {
    expect(findHsTab(blank.tabs, "Buổi 09").tabProperties.title).toBe(
      "Buổi  09",
    );
    expect(findHsTab(blank.tabs, "BUỔI 9").tabProperties.title).toBe(
      "Buổi  09",
    );
    expect(findHsTab(blank.tabs, "x", "hsLesson10").tabProperties.title).toBe(
      "Buổi 10",
    );
    expect(findHsTab(blank.tabs, "Ôn tập thêm 1").tabProperties.title).toBe(
      "Ôn tập thêm 1",
    );
    expect(findHsTab(blank.tabs, "Buổi 30")).toBeNull();
  });
});

describe("splitBySlots — what the student wrote in each blank", () => {
  const form = "My friend often _____________(study) in the library.";
  const fills = (student, f = form) =>
    splitBySlots(f, student)?.fills.map((x) => x.text);

  it("reads one word, several words, extra spaces", () => {
    expect(
      fills("My friend often ____studies____(study) in the library."),
    ).toEqual(["studies"]);
    expect(
      fills("My friend often does not study (study) in the library."),
    ).toEqual(["does not study"]);
    expect(
      fills("My friend often    studies     (study)   in the library."),
    ).toEqual(["studies"]);
  });

  it("reads a blank whose underscores were deleted or kept around the answer", () => {
    expect(fills("My friend often studies(study) in the library.")).toEqual([
      "studies",
    ]);
    expect(fills("My friend often ___studies (study) in the library.")).toEqual(
      ["studies"],
    );
  });

  it("reads an untouched blank as empty, and several blanks in order", () => {
    expect(fills(form)).toEqual([""]);
    const two =
      "If you __________ (study) hard, you __________ (pass) the exam.";
    expect(
      fills("If you study (study) hard, you will pass (pass) the exam.", two),
    ).toEqual(["study", "will pass"]);
    expect(
      fills("If you study (study) hard, you ______ (pass) the exam.", two),
    ).toEqual(["study", ""]);
  });

  it("reads an answer after a trailing arrow and keeps text after the sentence apart", () => {
    const f = "There aren’t some books on the desk. → _________________";
    const split = splitBySlots(
      f,
      "There aren't some books on the desk. → There aren't any books on the desk.",
    );
    expect(split.fills[0].text).toBe("There aren't any books on the desk.");
    const extra = splitBySlots(
      form,
      "My friend often studies (study) in the library. I like it",
    );
    expect(extra.trailing.text).toBe("I like it");
  });

  it("reads the first copy when the sentence was written twice", () => {
    const f = "1. There are ______ games in the museum today.";
    const split = splitBySlots(
      f,
      "1. There are some games in the museum today. There are many games in the museum today.",
    );
    expect(split.fills.map((x) => x.text)).toEqual(["some"]);
    expect(split.trailing.text).toBe(
      "There are many games in the museum today.",
    );
  });

  it("refuses to guess when the question itself was changed", () => {
    expect(
      splitBySlots(form, "My friend usually studies in the library."),
    ).toBeNull();
    expect(splitBySlots(form, "He studies (study) in the library.")).toBeNull();
  });
});

describe("paragraph alignment", () => {
  it("does not take a teacher's '⇒ …' line for the next question's '⇒ ____'", () => {
    const form = [
      "golf / plays / He",
      "⇒ ______",
      "bad / always / is",
      "⇒ ______",
    ];
    const student = [
      "golf / plays / He",
      "⇒ He plays golf",
      "⇒ He always plays golf.", // teacher's correction line
      "bad / always / is",
      "⇒ It is always bad.",
    ];
    const { match, extras } = alignParagraphs(form, student);
    expect(match).toEqual([0, 1, 3, 4]);
    expect(extras[1]).toEqual([2]);
  });
});

describe("reading a student's answers", () => {
  it("reads blanks, rewrites, tables and lists typed into the blank form", () => {
    const doc = loadHsFixture("blank");
    const b7 = tabByTitle(doc, "Buổi 07");
    typeInto(doc, b7, "My friend often", "studies", { after: "often " });
    typeInto(
      doc,
      b7,
      "our / She / new",
      "She likes our school's new uniform.",
      { after: "→ " },
    );
    typeInCell(doc, b7, findCell(b7, "STT", 1, 2), "He is my classmate");
    const list = items(b7);
    const blank = list.find((i) => i.exerciseId === "ex2" && i.n === 1);
    expect(blank.answer).toEqual({
      fills: ["studies"],
      sentence: "My friend often studies (study) in the library.",
    });
    expect(list.find((i) => i.exerciseId === "ex3" && i.n === 1).answer).toBe(
      "She likes our school's new uniform.",
    );
    const viEn = list.find((i) => i.exerciseId === "ex1" && i.n === 1);
    expect(viEn).toMatchObject({
      answer: "He is my classmate",
      answered: true,
      graded: false,
    });
    expect(viEn.target.mode).toBe("cell");
    expect(selectHsItemsToGrade(list)).toHaveLength(3);
  });

  it("reads the S/V/O cells of Buổi 01 and skips the pre-filled example row", () => {
    const doc = loadHsFixture("blank");
    const b1 = tabByTitle(doc, "Buổi 01");
    const svo = (c, text) =>
      typeInCell(
        doc,
        b1,
        findCell(b1, "STT", 0, 0) && findSvoCell(b1, 2, c),
        text,
      );
    svo(3, "She");
    svo(4, "reads");
    svo(5, "books");
    const list = items(b1, "ex2");
    expect(list[0].answered).toBe(false); // "Tom plays football" is the form's own example
    expect(list[1].answer).toEqual({
      subject: "She",
      verb: "reads",
      object: "books",
    });
  });

  it("reads Buổi 04's tense tables: the translation, its column and the x marks", () => {
    const doc = loadHsFixture("blank");
    const b4 = tabByTitle(doc, "Buổi 04");
    const cell = (c) => findCell(b4, "Đơn = đơn giản", 2, c);
    typeInCell(doc, b4, cell(1), "I learned English yesterday");
    typeInCell(doc, b4, cell(2), "x");
    const row = items(b4, "ex2").find((i) =>
      i.prompt.startsWith("Tôi đã học Tiếng anh hôm qua"),
    );
    expect(row.answer).toEqual({
      translation: "I learned English yesterday",
      chosenTense: "QK đơn",
      xTenses: ["HT đơn"],
    });
  });

  it("reads each blank of a passage as its own item (Buổi 03 listening)", () => {
    const doc = loadHsFixture("blank");
    const b3 = tabByTitle(doc, "Buổi 03");
    typeInto(doc, b3, "Ben: It's", "small", { after: "It's " });
    typeInto(doc, b3, "Ben: It's", "table", { after: "a small " });
    const list = items(b3, "ex2");
    expect(
      list.filter((i) => i.answered).map((i) => [i.slot, i.answer]),
    ).toEqual([
      [0, "small"],
      [1, "table"],
    ]);
    expect(list.every((i) => i.target.mode === "inline")).toBe(true);
  });

  it("reads which option was marked by formatting — not the form's own bold", () => {
    const doc = loadHsFixture("blank");
    const b9 = tabByTitle(doc, "Buổi  09");
    styleWord(doc, b9, "The students with new", "are", { bold: true, ...RED });
    styleWord(
      doc,
      b9,
      "The teachers at the",
      "teach",
      { backgroundColor: { color: { rgbColor: { green: 1 } } } },
      { after: "(" },
    );
    styleWord(
      doc,
      b9,
      "The books on the shelf",
      "is",
      { underline: true },
      { after: "(" },
    );
    styleWord(
      doc,
      b9,
      "The books on the shelf",
      "are",
      { underline: true },
      { after: "(" },
    );
    const [a, b, c, d] = items(b9, "ex3");
    expect(a.answer.selected).toEqual(["are"]);
    expect(b.answer.selected).toEqual(["teach"]);
    expect(c.answer).toMatchObject({
      selected: ["is", "are"],
      ambiguous: true,
    });
    expect(d.answered).toBe(false);
    // Buổi 12's optional exercise prints its brackets in bold: not a choice.
    const b12 = tabByTitle(doc, "Buổi 12");
    expect(items(b12, "tc").filter((i) => i.answered)).toEqual([]);
    styleWord(
      doc,
      b12,
      "My friends and I go",
      "We",
      { bold: true, foregroundColor: { color: { rgbColor: { blue: 1 } } } },
      { after: "(" },
    );
    expect(items(b12, "tc")[0].answer.selected).toEqual(["We"]);
  });

  it("reads a choice circled with the student's own brackets", () => {
    const doc = loadHsFixture("graded-b");
    const first = items(tabByTitle(doc, "Buổi  09"), "ex3")[0];
    expect(first.answer.selected).toEqual(["is"]);
  });

  it("reads the underlined head nouns, even inside a run, and the translation", () => {
    const doc = loadHsFixture("blank");
    const b9 = tabByTitle(doc, "Buổi  09");
    styleWord(doc, b9, "My classmates from", "classmates", { underline: true });
    styleWord(
      doc,
      b9,
      "My classmates from",
      "back",
      { underline: true },
      { after: "The " },
    );
    typeInto(doc, b9, "Dịch:", " Bạn cùng lớp của tôi luôn giúp tôi.");
    const [item] = items(b9, "ex4");
    expect(item.answer).toEqual({
      underlined: ["classmates", "back"],
      translation: "Bạn cùng lớp của tôi luôn giúp tôi.",
    });
  });
});

/** Cell c of row r of the S/V/O table (the second table with "STT" first). */
function findSvoCell(tab, r, c) {
  const tables = tab.documentTab.body.content
    .filter((b) => b.table)
    .map((b) => b.table);
  const svo = tables.find((t) => t.columns === 7);
  return svo.tableRows[r].tableCells[c];
}

describe("what counts as already corrected", () => {
  function b19WithAnswer(answer, style) {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 19");
    typeInto(doc, tab, "There is a lamp to the table.", answer, {
      after: "→ ",
      style,
    });
    return items(tab, "ex2")[0];
  }

  it("a tick, a red or struck-through note, a 'Câu đúng:' line", () => {
    expect(b19WithAnswer("There is a lamp on the table. ✅").graded).toBe(true);
    expect(b19WithAnswer("There is a lamp on the table. ❌").graded).toBe(true);
    expect(b19WithAnswer("There is a lamp on the table.", RED).graded).toBe(
      true,
    );
    expect(
      b19WithAnswer("There is a lamp on the table.", { strikethrough: true })
        .graded,
    ).toBe(true);
    expect(
      b19WithAnswer(
        "There is a lamp in the table.\u000bCâu đúng: There is a lamp on the table.",
      ).graded,
    ).toBe(true);
  });

  it("NOT the student's own words that merely look like a correction", () => {
    const cases = [
      "Câu đúng là There is a lamp on the table.",
      "Well-done There is a lamp on the table.",
      "Câu đúng: There is a lamp on the table.", // right after the form's "→"
      "There is a lamp on the table (câu đúng: on).",
    ];
    for (const answer of cases) {
      const item = b19WithAnswer(answer);
      expect(item.graded, answer).toBe(false);
      expect(item.answered, answer).toBe(true);
    }
  });

  it("NOT a ❌ or 'Câu đúng' printed in the question itself", () => {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 19");
    const lesson = structuredClone(hsLessonFor({ lessonName: "Buổi 19" }));
    // Pretend the form printed "❌" and a "Câu đúng:" line in the question.
    const para = findParagraph(tab, "There is a lamp to the table.");
    const run = para.paragraph.elements[0].textRun;
    run.content = run.content.replace("There is", "❌ There is");
    para.paragraph.elements.slice(1).forEach((el) => {
      el.startIndex += 2;
      el.endIndex += 2;
    });
    para.paragraph.elements[0].endIndex += 2;
    const ex = lesson.exercises.find((e) => e.id === "ex2");
    const p = ex.items[0].parts[0].p;
    ex.paras[p].text = ex.paras[p].text.replace("There is", "❌ There is");
    const item = collectHsItems(tab, { lesson }).items.find(
      (i) => i.exerciseId === "ex2" && i.n === 1,
    );
    expect(item.unreadable).toBeUndefined();
    expect(item.graded).toBe(false);
  });

  it("the teacher's corrections in the real graded docs", () => {
    const doc = loadHsFixture("graded-a");
    const b7 = items(tabByTitle(doc, "Buổi 07"), "ex2");
    expect(b7[0].graded).toBe(true); // "… ✅Đúng!"
    expect(b7[1].graded).toBe(true); // a red "Giải thích:" paragraph under it
    const b3 = items(tabByTitle(doc, "Buổi 03"), "ex2");
    expect(b3.map((i) => i.graded)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("partial grading — the teacher corrected some items by hand", () => {
  function setUp() {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 17");
    const ex1 = HS_LESSONS.find((l) => l.id === "hsLesson17").exercises[0];
    // Exercise 1: all 10 sentences (two blanks in some).
    ex1.items.forEach((item) => {
      const prefix = item.formText.slice(0, 18);
      const blanks = (item.formText.match(/_{2,}/g) || []).length;
      for (let b = blanks - 1; b >= 0; b--) {
        const para = findParagraph(tab, prefix);
        const text = paraText(para);
        let at = -1;
        for (let k = 0; k <= b; k++)
          at = text.indexOf(
            "__",
            k ? at + 2 + text.slice(at + 2).search(/[^_]/) : 0,
          );
        typeInto(doc, tab, prefix, `ans${b}`, { after: text.slice(0, at) });
      }
    });
    // Exercise 3: all 9 "⇒ ____" lines; Exercise 4: the first one.
    for (let k = 8; k >= 0; k--)
      typeInto(doc, tab, "⇒", `Sentence ${k}.`, { after: "⇒ ", nth: k });
    typeInto(doc, tab, "(window / the / close)", "Close the window.", {
      after: "→ ",
    });
    // The teacher: ✅ on three, a red correction on two.
    typeInto(doc, tab, "My grandpa", " ✅", { style: RED });
    typeInto(doc, tab, "⇒", " ✅", { nth: 0, style: RED });
    typeInto(doc, tab, "⇒", " ✅", { nth: 4, style: RED });
    typeInto(doc, tab, "⇒", "\u000bCâu đúng: He never does it.", {
      nth: 2,
      style: RED,
    });
    typeInto(
      doc,
      tab,
      "(window / the / close)",
      "\u000bCâu đúng: Close the window, please.",
      { style: RED },
    );
    return { doc, tab };
  }

  it("grades only the 15 untouched items and leaves the teacher's 5 byte for byte", () => {
    const { doc, tab } = setUp();
    const before = read(tab).items;
    expect(before.filter((i) => i.answered)).toHaveLength(20);
    const todo = selectHsItemsToGrade(before);
    expect(todo).toHaveLength(15);

    const teacherLines = tabTexts(tab).filter((t) => /✅|Câu đúng/.test(t));
    expect(teacherLines).toHaveLength(5);
    const writes = gradeAndWrite(doc, tab, todo);
    expect(writes).toHaveLength(15);
    // The teacher's five lines are still there, untouched.
    const after = tabTexts(tab);
    for (const line of teacherLines) expect(after).toContain(line);

    const reread = read(tab).items.filter((i) => i.answered);
    expect(reread.every((i) => i.graded)).toBe(true);
    expect(selectHsItemsToGrade(reread)).toEqual([]);
    expect(matchesOwnHsFeedback(writes, tab)).toBe(true);
  });

  it("sends only written, readable, uncorrected items: 15 inserts for 15 items", () => {
    const { tab } = setUp();
    const todo = selectHsItemsToGrade(read(tab).items);
    const { writes } = planHsWrites(read(tab).items, verdicts(todo));
    const requests = buildHsFeedbackRequests(writes, tab.tabProperties.tabId);
    expect(requests.filter((r) => r.insertText)).toHaveLength(15);
    expect(requests.filter((r) => r.createNamedRange)).toHaveLength(15);
  });

  it("mixed: a teacher's note in the Chữa bài column and an inline one", () => {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 02");
    for (let r = 1; r <= 5; r++)
      typeInCell(doc, tab, findCell(tab, "STT", r, 2), `Answer ${r}`);
    typeInCell(doc, tab, findCell(tab, "STT", 1, 4), "✅Well-done!");
    const grid = (r, c) => findCell(tab, "Hiện tại", r, c);
    typeInCell(doc, tab, grid(1, 0), " V(s/es)");
    typeInCell(doc, tab, grid(1, 1), " Ved");
    typeInCell(doc, tab, grid(1, 2), " will + V");
    typeInCell(doc, tab, grid(2, 0), " am/is/are + Ving");
    typeInCell(doc, tab, grid(1, 1), " ✅", RED);
    const todo = selectHsItemsToGrade(read(tab).items);
    expect(todo.map((i) => `${i.exerciseId}:${i.n}`).sort()).toEqual(
      ["ex1:2", "ex1:3", "ex1:4", "ex1:5", "ex2:1", "ex2:3", "ex2:4"].sort(),
    );
    const teacherCell = paraText(findCell(tab, "STT", 1, 4).content[0]);
    gradeAndWrite(doc, tab, todo);
    expect(paraText(findCell(tab, "STT", 1, 4).content[0])).toBe(teacherCell);
    expect(paraText(findCell(tab, "STT", 2, 4).content[0])).toBe(
      "Câu đúng: Fixed here. (S số ít nhé)\n",
    );
    expect(selectHsItemsToGrade(read(tab).items)).toEqual([]);
  });
});

describe("writing corrections", () => {
  it("formats like the class's teachers: ✅Well-done! / Câu đúng: … (…)", () => {
    const append = { target: { mode: "append" } };
    const cell = { target: { mode: "cell" } };
    const inline = { target: { mode: "inline" } };
    expect(formatHsFeedback(append, { correct: true })).toBe(" ✅Well-done!");
    expect(formatHsFeedback(cell, { correct: true })).toBe("✅Well-done!");
    expect(formatHsFeedback(inline, { correct: true })).toBe("✅");
    expect(
      formatHsFeedback(append, {
        correct: false,
        corrected: "I **am** 18.",
        explanation: "(bỏ have nhé)",
      }),
    ).toBe("\u000bCâu đúng: I **am** 18. (bỏ have nhé)");
    expect(
      formatHsFeedback(cell, {
        correct: false,
        corrected: "A.\nB.",
        explanation: "x",
      }),
    ).toBe("Câu đúng: A.\u000bB. (x)");
    expect(formatHsFeedback(inline, { correct: false, expected: "hall" })).toBe(
      " ❌ → **hall**",
    );
  });

  it("inserts in red, bolds the fix, wraps each insert in a named range, back to front", () => {
    const requests = buildHsFeedbackRequests(
      [
        { key: "k1", index: 100, text: " ✅Well-done!" },
        { key: "k2", index: 300, text: "\u000bCâu đúng: I **am** 18. (x)" },
      ],
      "t.1",
    );
    expect(requests.map((r) => Object.keys(r)[0])).toEqual([
      "insertText",
      "updateTextStyle",
      "updateTextStyle",
      "createNamedRange",
      "insertText",
      "updateTextStyle",
      "createNamedRange",
    ]);
    expect(requests[0].insertText).toEqual({
      location: { index: 300, tabId: "t.1" },
      text: "\u000bCâu đúng: I am 18. (x)",
    });
    expect(requests[1].updateTextStyle.textStyle.foregroundColor).toEqual({
      color: { rgbColor: { red: 1 } },
    });
    expect(requests[1].updateTextStyle.fields).toContain("backgroundColor");
    const bold = requests[2].updateTextStyle.range;
    expect([bold.startIndex, bold.endIndex]).toEqual([300 + 13, 300 + 15]); // "am"
    expect(requests[3].createNamedRange.name).toMatch(/^aiFb:hs:v1:/);
  });

  it("never writes over an item corrected between grading and writing", () => {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 19");
    typeInto(
      doc,
      tab,
      "There is a lamp to the table.",
      "There is a lamp on the table.",
      { after: "→ " },
    );
    typeInto(
      doc,
      tab,
      "The children are playing",
      "The children are playing in the garden.",
      { after: "→ " },
    );
    const todo = selectHsItemsToGrade(read(tab).items);
    expect(todo).toHaveLength(2);
    // The teacher ticks the first one before the job writes.
    typeInto(doc, tab, "There is a lamp to the table.", " ✅", { style: RED });
    const { writes, skipped } = planHsWrites(read(tab).items, verdicts(todo));
    expect(writes.map((w) => w.key)).toEqual([todo[1].key]);
    expect(skipped).toEqual([todo[0].key]);
  });

  it("writes into the real graded doc without touching the teacher's work", () => {
    const doc = loadHsFixture("graded-a");
    const tab = tabByTitle(doc, "Buổi 23");
    const before = tabTexts(tab);
    const todo = selectHsItemsToGrade(read(tab).items);
    expect(todo.length).toBeGreaterThan(10);
    const writes = gradeAndWrite(doc, tab, todo);
    expect(writes).toHaveLength(todo.length);
    // Every original paragraph is still there as a prefix of itself.
    const after = tabTexts(tab);
    expect(after).toHaveLength(before.length);
    before.forEach((text, i) =>
      expect(after[i].startsWith(text.replace(/\n$/, ""))).toBe(true),
    );
    expect(selectHsItemsToGrade(read(tab).items)).toEqual([]);
  });
});

describe("Xóa feedback — only the AI's own, intact text", () => {
  it("removes every AI insert and restores the doc exactly", () => {
    const doc = loadHsFixture("graded-a");
    const tab = tabByTitle(doc, "Buổi 23");
    const before = tabTexts(tab);
    gradeAndWrite(doc, tab, selectHsItemsToGrade(read(tab).items));
    const { requests, removed, kept } = buildHsClearRequests(tab);
    expect(kept).toBe(0);
    expect(removed).toBeGreaterThan(10);
    applyRequests(doc, requests);
    expect(tabTexts(tab)).toEqual(before);
    expect(Object.keys(tab.documentTab.namedRanges || {})).toEqual([]);
  });

  it("keeps an AI insert a teacher has edited into", () => {
    const doc = loadHsFixture("blank");
    const tab = tabByTitle(doc, "Buổi 19");
    typeInto(
      doc,
      tab,
      "There is a lamp to the table.",
      "There is a lamp in the table.",
      { after: "→ " },
    );
    typeInto(
      doc,
      tab,
      "The children are playing",
      "The children are playing on the garden.",
      { after: "→ " },
    );
    const todo = selectHsItemsToGrade(read(tab).items);
    gradeAndWrite(doc, tab, todo);
    // The teacher types right after the first AI note (outside its range),
    // and inside the second one.
    typeInto(doc, tab, "There is a lamp to the table.", " nha", {
      after: "✅Well-done!",
    });
    typeInto(doc, tab, "The children are playing", " rồi", {
      after: "S số ít",
    });
    const plan = buildHsClearRequests(tab);
    expect(plan).toMatchObject({ removed: 1, kept: 1 });
    applyRequests(doc, plan.requests);
    const first = paraText(findParagraph(tab, "There is a lamp to the table."));
    expect(first).not.toContain("Well-done");
    expect(first).toContain(" nha");
    expect(paraText(findParagraph(tab, "The children are playing"))).toContain(
      "S số ít rồi nhé",
    );
  });
});
