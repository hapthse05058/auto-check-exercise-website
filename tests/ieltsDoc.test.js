import { describe, expect, it } from "vitest";

import { collectExerciseRows } from "../src/lib/docTableDetect.js";
import {
  buildClearFeedbackRequests,
  buildFeedbackRequests,
  matchesOwnFeedback,
  targetsAlreadyFilled,
} from "../src/lib/docWriter.js";
import {
  KIND_IELTS_WRITING,
  collectIeltsRows,
  findIeltsTab,
  imageIdsInCell,
  imageUri,
  lessonNumberOf,
  resolveIeltsTable,
  selectIeltsItemsToGrade,
} from "../src/lib/ieltsDoc.js";
import {
  P,
  PIndexed,
  makeParagraphTable,
  makeTabFromTables,
} from "./fixtures.js";

const image = (id, startIndex = 1) => ({
  paragraph: { elements: [{ inlineObjectElement: { inlineObjectId: id } }] },
  startIndex,
});
const cell = (...content) => ({ content });
const tableRow = (...cells) => ({ tableCells: cells });

/** The IELTS template table; `start` spaces the cell indexes apart. */
function ieltsTable({
  title = "IELTS WRITING – TASK 1",
  prompt = [P("The chart shows fruit production.")],
  essay = [P("The line graph illustrates fruit production.")],
  feedback = "",
  start = 100,
} = {}) {
  return {
    tableRows: [
      tableRow(cell(P(title, start)), cell(P("", start + 1))),
      tableRow(cell(P("Đề bài", start + 2)), cell(...prompt)),
      tableRow(cell(P("Bài làm", start + 3)), cell(...essay)),
      tableRow(cell(P("GV chữa", start + 4)), cell(P(feedback, start + 50))),
    ],
  };
}

function tabWith(tables, objects = {}) {
  const tab = makeTabFromTables(
    tables.map((table) => table.tableRows),
    "Buổi 12",
  );
  tab.documentTab.inlineObjects = Object.fromEntries(
    Object.entries(objects).map(([id, uri]) => [
      id,
      {
        inlineObjectProperties: {
          embeddedObject: { imageProperties: { contentUri: uri } },
        },
      },
    ]),
  );
  return tab;
}

describe("resolveIeltsTable: which tables are IELTS", () => {
  const cases = [
    ["IELTS WRITING – TASK 1", "task1"],
    ["IELTS WRITING – TASK 2", "task2"],
    ["IELTS WRITING – ĐOẠN VĂN", "paragraph"],
    ["IELTS writing - task 1", "task1"],
    ["Ielts Writing Task 2", "task2"],
  ];
  for (const [title, task] of cases) {
    it(`"${title}" → ${task}`, () => {
      expect(resolveIeltsTable(ieltsTable({ title }))?.task).toBe(task);
    });
  }

  it("a Basic paragraph table that mentions IELTS is not one", () => {
    const basic = {
      tableRows: makeParagraphTable({ topic: "IELTS writing tips" }),
    };
    const resolved = resolveIeltsTable(basic);
    expect(resolved === null || resolved.invalid === true).toBe(true);
    expect(collectIeltsRows(tabWith([basic])).rows).toEqual([]);
  });

  it("a random table is not one", () => {
    const random = {
      tableRows: [tableRow(cell(P("Từ vựng")), cell(P("Nghĩa")))],
    };
    expect(resolveIeltsTable(random)).toBeNull();
  });

  it("an IELTS title without the template rows is reported, not guessed", () => {
    const broken = ieltsTable();
    broken.tableRows.splice(3, 1); // no "GV chữa" row
    expect(resolveIeltsTable(broken)).toEqual({ invalid: true });
    const { rows, invalidTables } = collectIeltsRows(tabWith([broken]));
    expect(rows).toEqual([]);
    expect(invalidTables).toEqual([0]);
  });

  it("an unknown task in the title is reported", () => {
    const table = ieltsTable({ title: "IELTS WRITING" });
    expect(resolveIeltsTable(table)).toEqual({ invalid: true });
  });

  it("the Basic detector does not pick the IELTS table up", () => {
    const tab = tabWith([ieltsTable()]);
    expect(collectExerciseRows(tab, "basic").rows).toEqual([]);
  });
});

describe("images", () => {
  it("no image", () => {
    const { rows } = collectIeltsRows(tabWith([ieltsTable()]));
    expect(rows[0].imageIds).toEqual([]);
  });

  it("one image, several images, image + text in the same cell", () => {
    const table = ieltsTable({
      prompt: [P("The charts below show …"), image("a"), image("b"), P("x")],
    });
    const tab = tabWith([table], { a: "https://a", b: "https://b" });
    const { rows } = collectIeltsRows(tab);
    expect(rows[0].imageIds).toEqual(["a", "b"]);
    expect(rows[0].promptText).toBe("The charts below show …\nx");
    expect(imageUri(tab, "a")).toBe("https://a");
    expect(imageUri(tab, "missing")).toBeNull();
  });

  it("anchored (positioned) images of the cell count too", () => {
    const withAnchor = {
      paragraph: { elements: [], positionedObjectIds: ["p1"] },
      startIndex: 1,
    };
    expect(imageIdsInCell(cell(P("t"), withAnchor))).toEqual(["p1"]);
    const tab = tabWith([ieltsTable()]);
    tab.documentTab.positionedObjects = {
      p1: {
        positionedObjectProperties: {
          embeddedObject: { imageProperties: { contentUri: "https://p" } },
        },
      },
    };
    expect(imageUri(tab, "p1")).toBe("https://p");
  });

  it("images outside the prompt cell are not taken", () => {
    const inEssay = ieltsTable({
      essay: [P("My essay"), image("essay-img")],
    });
    const outside = {
      tableRows: [tableRow(cell(image("other-table-img")), cell(P("x")))],
    };
    const second = ieltsTable({
      title: "IELTS WRITING – TASK 1",
      prompt: [P("Second chart"), image("second")],
      start: 900,
    });
    const tab = tabWith([inEssay, outside, second]);
    tab.documentTab.body.content.unshift({
      paragraph: {
        elements: [{ inlineObjectElement: { inlineObjectId: "body-img" } }],
      },
    });
    const { rows } = collectIeltsRows(tab);
    expect(rows.map((r) => r.imageIds)).toEqual([[], ["second"]]);
  });
});

describe("selectIeltsItemsToGrade", () => {
  it("grades written, empty-feedback tables only", () => {
    const tab = tabWith([
      ieltsTable({ title: "IELTS WRITING – TASK 2", start: 100 }),
      ieltsTable({ essay: [P("")], start: 300 }), // not written
      ieltsTable({ feedback: "Cô đã chữa", start: 500 }), // already graded
    ]);
    const { items, graded } = selectIeltsItemsToGrade(
      collectIeltsRows(tab).rows,
    );
    expect(graded).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: KIND_IELTS_WRITING,
      task: "task2",
      question: "The chart shows fruit production.",
      answer: "The line graph illustrates fruit production.",
      tableIdx: 0,
    });
  });
});

describe("writing the feedback back (docWriter, unchanged)", () => {
  const feedback = "**1. BẢN CHỮA**\nI **go** → went (thì)\n\n**Overall: 6.5**";

  it("writes into the GV chữa cell, bold kept, and recognises it after", () => {
    const tab = tabWith([ieltsTable()]);
    const { rows } = collectIeltsRows(tab);
    const results = [
      {
        rowKey: `${rows[0].tableIdx}:${rows[0].rowIdx}`,
        questionIndex: null,
        aiFeedback: feedback,
      },
    ];
    expect(targetsAlreadyFilled(results, rows)).toBe(false);

    const requests = buildFeedbackRequests(results, rows, "t.x");
    const inserts = requests.filter((r) => r.insertText);
    expect(inserts[0].insertText.location.index).toBe(150); // GV chữa cell
    expect(inserts.map((r) => r.insertText.text).join("")).toBe(
      "1. BẢN CHỮA\nI go → went (thì)\n\nOverall: 6.5",
    );
    const bold = requests
      .filter((r) => r.updateTextStyle?.textStyle.bold)
      .map(
        (r) =>
          r.updateTextStyle.range.endIndex - r.updateTextStyle.range.startIndex,
      );
    expect(bold).toEqual(["1. BẢN CHỮA".length, 2, "Overall: 6.5".length]);
    // No overall-comment row is ever written for IELTS.
    expect(requests.some((r) => r.insertText?.text?.includes("Làm tốt"))).toBe(
      false,
    );

    // Read the doc back as it looks after the write.
    const after = tabWith([
      ieltsTable({
        feedback: "1. BẢN CHỮA\nI go → went (thì)\n\nOverall: 6.5",
      }),
    ]);
    const rowsAfter = collectIeltsRows(after).rows;
    expect(targetsAlreadyFilled(results, rowsAfter)).toBe(true);
    expect(matchesOwnFeedback(results, rowsAfter)).toBe(true);
  });

  it("does not claim a teacher's own notes as its feedback", () => {
    const tab = tabWith([ieltsTable({ feedback: "Cô sẽ chữa sau" })]);
    const { rows } = collectIeltsRows(tab);
    const results = [
      { rowKey: `${rows[0].tableIdx}:${rows[0].rowIdx}`, aiFeedback: feedback },
    ];
    expect(targetsAlreadyFilled(results, rows)).toBe(true);
    expect(matchesOwnFeedback(results, rows)).toBe(false);
  });
});

describe("clearing the feedback (feedbackClear, IELTS class)", () => {
  /** An IELTS table whose "GV chữa" cell holds `paragraphs` (indexed). */
  function gradedTable(start, paragraphs) {
    const table = ieltsTable({ start });
    table.tableRows[3].tableCells[1] = cell(...paragraphs);
    return table;
  }

  it("deletes the whole GV chữa text of every IELTS table, bottom-up", () => {
    const tab = tabWith([
      gradedTable(100, [
        PIndexed("1. BẢN CHỮA\n", 150),
        PIndexed("I go → went\n", 162),
      ]),
      gradedTable(300, [PIndexed("Overall: 6.0\n", 350)]),
    ]);
    const requests = buildClearFeedbackRequests(
      collectIeltsRows(tab).rows,
      "t.x",
    );
    expect(requests.map((r) => r.deleteContentRange.range)).toEqual([
      { startIndex: 350, endIndex: 362, tabId: "t.x" },
      // The cell's last newline stays: it terminates the cell.
      { startIndex: 150, endIndex: 173, tabId: "t.x" },
    ]);
  });

  it("an empty GV chữa cell asks for nothing", () => {
    const tab = tabWith([gradedTable(100, [PIndexed("\n", 150)])]);
    expect(
      buildClearFeedbackRequests(collectIeltsRows(tab).rows, "t.x"),
    ).toEqual([]);
  });

  it("the Basic reader finds nothing to clear in an IELTS tab", () => {
    const tab = tabWith([gradedTable(100, [PIndexed("1. BẢN CHỮA\n", 150)])]);
    for (const classType of ["basic", "basic_since_20072026", undefined]) {
      expect(collectExerciseRows(tab, classType).rows).toEqual([]);
    }
  });
});

describe("findIeltsTab: the lesson's tab in a real IELTS doc", () => {
  /** A tab (with child tabs) titled `title`; `ielts` = holds an IELTS table. */
  const tabNamed = (title, { ielts = false, children = [] } = {}) => ({
    ...makeTabFromTables(ielts ? [ieltsTable().tableRows] : [], title),
    childTabs: children,
  });
  // The ES7.0 layout: "Buổi N" with child tabs "Writing buổi N", "Speaking…".
  const doc = (writingHasTable = true) => [
    tabNamed("Nội quy và Tài liệu"),
    tabNamed("Buổi 2", {
      children: [tabNamed("Writing -DCadj"), tabNamed("Reading - DCadj")],
    }),
    tabNamed("Buổi 12", {
      children: [
        tabNamed("Writing buổi 12", { ielts: writingHasTable }),
        tabNamed("Speaking buổi 12"),
      ],
    }),
    tabNamed("Buổi 1", {
      children: [tabNamed("Writing buổi 1", { ielts: true })],
    }),
  ];
  const titleOf = (tab) => tab?.tabProperties.title ?? null;

  it("lesson BUỔI 12 → the child tab 'Writing buổi 12'", () => {
    expect(titleOf(findIeltsTab(doc(), "BUỔI 12"))).toBe("Writing buổi 12");
    expect(titleOf(findIeltsTab(doc(), "Buổi 012"))).toBe("Writing buổi 12");
  });

  it("matches the number exactly: BUỔI 1 is not BUỔI 12", () => {
    expect(titleOf(findIeltsTab(doc(), "BUỔI 01"))).toBe("Writing buổi 1");
  });

  it("with no IELTS table anywhere, still returns the Writing tab (→ 'no table', not 'no tab')", () => {
    expect(titleOf(findIeltsTab(doc(false), "BUỔI 12"))).toBe(
      "Writing buổi 12",
    );
  });

  it("falls back to 'Buổi N' when that is where the table is", () => {
    const tabs = [
      tabNamed("Buổi 5", {
        ielts: true,
        children: [tabNamed("Writing buổi 5")],
      }),
    ];
    expect(titleOf(findIeltsTab(tabs, "BUỔI 05"))).toBe("Buổi 5");
  });

  it("a tab titled exactly like the lesson still works; none → null", () => {
    expect(
      titleOf(findIeltsTab([tabNamed("BUỔI 04", { ielts: true })], "BUỔI 04")),
    ).toBe("BUỔI 04");
    expect(findIeltsTab(doc(), "BUỔI 07")).toBeNull();
    expect(findIeltsTab(doc(), "Lesson without number")).toBeNull();
  });

  it("lessons 1–2: a 'Writing…' tab without a number, as child or next sibling", () => {
    // As children of "Buổi 2" (the doc() layout above).
    const nested = doc().map((tab) =>
      titleOf(tab) === "Buổi 2"
        ? {
            ...tab,
            childTabs: [tabNamed("Writing -DCadj", { ielts: true })],
          }
        : tab,
    );
    expect(titleOf(findIeltsTab(nested, "BUỔI 02"))).toBe("Writing -DCadj");
    // As flat siblings: "Buổi 1", "Reading", "Writing", "Buổi 2", "Writing".
    const flat = [
      tabNamed("Buổi 1"),
      tabNamed("Reading"),
      tabNamed("Writing", { ielts: true }),
      tabNamed("Buổi 2"),
      tabNamed("Writing -DCadj"),
    ];
    expect(titleOf(findIeltsTab(flat, "BUỔI 01"))).toBe("Writing");
    // Lesson 2's writing tab has no table: still ITS tab, never lesson 1's.
    expect(titleOf(findIeltsTab(flat, "BUỔI 02"))).toBe("Writing -DCadj");
  });

  it("lessonNumberOf reads the number in any case, with leading zeros", () => {
    expect(lessonNumberOf("BUỔI 04")).toBe(4);
    expect(lessonNumberOf("Writing buổi 21")).toBe(21);
    expect(lessonNumberOf("Nội quy")).toBeNull();
  });
});
