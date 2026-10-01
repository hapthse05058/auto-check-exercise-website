/**
 * The teachers' 2-column IELTS layout (buổi 4 of the IELTS docs):
 *
 *   | Bài viết của học viên (Task 1) | GV chữa/nhận xét |
 *   | <the student's writing>        | <AI below it>    |
 *
 * with the prompt and chart above the table. Read → write → read back →
 * clear, on a small Docs model (helpers/ieltsColumnsDoc.js), plus the
 * guarantee that old-layout tables still get docWriter's requests unchanged.
 */
import { describe, expect, it } from "vitest";

import {
  buildClearFeedbackRequests,
  buildFeedbackRequests,
} from "../src/lib/docWriter.js";
import {
  LAYOUT_BELOW,
  LAYOUT_COLUMNS,
  buildIeltsClearRequests,
  buildIeltsFeedbackRequests,
  collectIeltsRows,
  findIeltsTab,
  ieltsTargetsAlreadyFilled,
  matchesOwnIeltsFeedback,
  selectIeltsItemsToGrade,
} from "../src/lib/ieltsDoc.js";
import { makeColumnsTab } from "./helpers/ieltsColumnsDoc.js";

const ESSAY = [
  "The line graph illustrates the number of crimes in a city from 1970 to 2005.",
  "Overall, there was a heavy increase in car theft.",
];
const PROMPT =
  "The graph below shows the number of incidents of car theft, house burglary, and street robbery in a certain city between 1970 and 2005.";

/** Buổi 4, Exercise 2, as the teacher laid it out. */
const lesson4 = ({
  head = "Bài viết của học viên",
  essay = ESSAY,
  fb = "",
} = {}) => [
  "Exercise 1: Phân tích biểu đồ & Trả lời các câu hỏi sau",
  {
    table: [
      ["Phần", "Câu hỏi", "Câu trả lời"],
      ["Intro", "Danh từ?", "đếm được"],
    ],
  },
  "Exercise 2: Dựa vào các thông tin trả lời trong bài tập 1, hãy viết bài hoàn chỉnh miêu tả biểu đồ sau",
  PROMPT,
  { image: "chart1" },
  "",
  {
    table: [
      [
        [`**${head}**`, "", ...essay].join("\n"),
        [`**GV chữa/nhận xét**`, ...(fb ? [fb] : [])].join("\n"),
      ],
    ],
  },
  "Sau khi viết xong, hãy tích vào các ô sau đây",
  {
    table: [
      ["Mục", "Câu hỏi kiểm tra", "Check"],
      ["Intro", "Paraphrase?", ""],
    ],
  },
];

const FEEDBACK =
  "**1. BẢN CHỮA**\nThe line graph illustrates the number of **crimes → incidents** (từ của đề).\n**3. NHẬN XÉT**\nEm viết khá tốt nha.";

const results = (rows, text = FEEDBACK) =>
  rows.map((r) => ({
    rowKey: `${r.tableIdx}:${r.rowIdx}`,
    questionIndex: null,
    aiFeedback: text,
  }));

describe("reading the 2-column layout", () => {
  it("finds the table, its writing, prompt, chart and task", () => {
    const { tab } = makeColumnsTab(lesson4());
    const { rows, invalidTables } = collectIeltsRows(tab);
    expect(invalidTables).toEqual([]);
    expect(rows).toHaveLength(1);
    const [entry] = rows;
    expect(entry.layout).toBe(LAYOUT_COLUMNS);
    expect(entry.tableIdx).toBe(1);
    expect(entry.essayText).toBe(ESSAY.join("\n"));
    expect(entry.feedbackText).toBe("");
    expect(entry.imageIds).toEqual(["chart1"]);
    expect(entry.promptText).toMatch(/^Exercise 2: .*hoàn chỉnh/);
    expect(entry.promptText).toContain(PROMPT);
    // No label: a whole essay with a chart is Task 1.
    expect(entry.task).toBe("task1");
    expect(entry.taskFromLabel).toBe(false);
  });

  it("the heading's label names the task", () => {
    for (const [head, task] of [
      ["Bài viết của học viên (Task 1)", "task1"],
      ["Bài viết của học viên (Task 2)", "task2"],
      ["Bài viết của học viên (Đoạn văn)", "paragraph"],
      ["Bài viết của học viên – Task 2", "task2"],
      ["BÀI VIẾT CỦA HỌC VIÊN (TASK 2):", "task2"],
      ["Bài làm (đoạn văn)", "paragraph"],
    ]) {
      const [entry] = collectIeltsRows(
        makeColumnsTab(lesson4({ head })).tab,
      ).rows;
      expect([head, entry?.task, entry?.taskFromLabel]).toEqual([
        head,
        task,
        true,
      ]);
    }
  });

  it("without a label: Intro/Overview is a paragraph, an essay without chart Task 2", () => {
    const intro = [
      "Exercise 2: Viết Intro và Overview cho đề sau đây",
      PROMPT,
      { image: "c" },
      {
        table: [
          [
            "**Bài viết của học viên**\nIntro: The graph shows…",
            "**GV chữa/nhận xét**",
          ],
        ],
      },
    ];
    expect(collectIeltsRows(makeColumnsTab(intro).tab).rows[0].task).toBe(
      "paragraph",
    );
    const task2 = [
      "Exercise 3: Lên dàn ý và viết bài hoàn chỉnh cho đề sau",
      "Some people think that … To what extent do you agree or disagree?",
      {
        table: [
          ["**Bài viết của học viên**\nNowadays…", "**GV chữa/nhận xét**"],
        ],
      },
    ];
    expect(collectIeltsRows(makeColumnsTab(task2).tab).rows[0].task).toBe(
      "task2",
    );
  });

  it("two prompts of one exercise: each table gets its own prompt and chart", () => {
    const spec = [
      "Exercise 2: Viết Intro và Overview cho 2 đề sau đây",
      "The graph below shows the consumption of fish.",
      { image: "fish" },
      {
        table: [["**Bài viết của học viên**\nIntro A", "**GV chữa/nhận xét**"]],
      },
      "Gợi ý:",
      "Fish & meat là danh từ đếm được hay không đếm được? không đếm được",
      "tăng : chicken",
      "The bar chart shows young people in higher education.",
      { image: "edu" },
      {
        table: [["**Bài viết của học viên**\nIntro B", "**GV chữa/nhận xét**"]],
      },
    ];
    const [a, b] = collectIeltsRows(makeColumnsTab(spec).tab).rows;
    expect(a.imageIds).toEqual(["fish"]);
    expect(b.imageIds).toEqual(["edu"]);
    expect(b.promptText).toMatch(/^Exercise 2: /);
    expect(b.promptText).toContain("young people in higher education");
    expect(b.promptText).not.toContain("consumption of fish");
    // The previous prompt's hints are not part of this one.
    expect(b.promptText).not.toMatch(/Gợi ý|Fish & meat|chicken/);
  });

  it("Task 2 (buổi 13–20): the prompt above the outline tables is still found", () => {
    const spec = [
      "Exercise 3: Lên dàn ý và viết bài hoàn chỉnh cho đề sau",
      "Schools should teach students not only academic subjects but also life skills.",
      "To what extent do you agree or disagree?",
      { table: [["Personal - FRESH", "Society - SHEEP"]] },
      "Dàn ý (Tiếng Việt):",
      {
        table: [
          ["View", "Point", "Explain", "Example", "Result"],
          ["Agree", "", "", "", ""],
        ],
      },
      "Bài làm:",
      {
        table: [
          ["**Bài viết của học viên**\nNowadays…", "**GV chữa/nhận xét**"],
        ],
      },
    ];
    const [entry] = collectIeltsRows(makeColumnsTab(spec).tab).rows;
    expect(entry.task).toBe("task2");
    expect(entry.promptText).toContain(
      "academic subjects but also life skills",
    );
    expect(entry.promptText).toContain(
      "To what extent do you agree or disagree?",
    );
    expect(entry.promptText).not.toContain("FRESH");
  });

  it("a hint right above the table stays with its prompt and chart", () => {
    const spec = [
      "Exercise 2: Viết Intro và Overview cho 2 đề sau đây",
      "The graph below shows the consumption of fish.",
      {
        table: [["**Bài viết của học viên**\nIntro A", "**GV chữa/nhận xét**"]],
      },
      "The bar chart shows young people in higher education.",
      { image: "edu" },
      "Gợi ý: young people là danh từ đếm được",
      {
        table: [["**Bài viết của học viên**\nIntro B", "**GV chữa/nhận xét**"]],
      },
    ];
    const [, b] = collectIeltsRows(makeColumnsTab(spec).tab).rows;
    expect(b.imageIds).toEqual(["edu"]);
    expect(b.promptText).toContain("young people in higher education");
  });

  it("words typed on the heading line belong to the writing", () => {
    const spec = lesson4({
      head: "Bài viết của học viên: The line graph shows",
      essay: ["crime."],
    });
    const [entry] = collectIeltsRows(makeColumnsTab(spec).tab).rows;
    expect(entry.essayText).toBe("The line graph shows\ncrime.");
  });

  it("other two-column tables are not taken for one", () => {
    const spec = [
      {
        table: [
          ["Cụm nối-so sánh", "In contrast to…"],
          ["Cụm tổng quan", "overall"],
        ],
      },
      { table: [["Introduction", "It is often argued that …"]] },
      { table: [["**Bài viết của học viên**\nText", "Gợi ý"]] },
    ];
    expect(collectIeltsRows(makeColumnsTab(spec).tab).rows).toEqual([]);
  });

  it("a cell holding only the template's part labels is not written yet", () => {
    const labels = lesson4({
      essay: ["Intro:", "Overview:", "Body 1:", "Body 2 :", "Conclusion"],
    });
    const rows = collectIeltsRows(makeColumnsTab(labels).tab).rows;
    expect(selectIeltsItemsToGrade(rows)).toEqual({ items: [], graded: 0 });
    const started = lesson4({
      essay: ["Intro: The graph shows crime.", "Overview:"],
    });
    const [item] = selectIeltsItemsToGrade(
      collectIeltsRows(makeColumnsTab(started).tab).rows,
    ).items;
    expect(item.answer).toBe("Intro: The graph shows crime.\nOverview:");
  });

  it("an unwritten essay is not graded; anything below the heading means graded", () => {
    const empty = collectIeltsRows(
      makeColumnsTab(lesson4({ essay: [] })).tab,
    ).rows;
    expect(selectIeltsItemsToGrade(empty)).toEqual({ items: [], graded: 0 });
    const noted = collectIeltsRows(
      makeColumnsTab(lesson4({ fb: "Cô: tốt" })).tab,
    ).rows;
    expect(selectIeltsItemsToGrade(noted)).toMatchObject({
      items: [],
      graded: 1,
    });
    const fresh = collectIeltsRows(makeColumnsTab(lesson4()).tab).rows;
    const { items } = selectIeltsItemsToGrade(fresh);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      answer: ESSAY.join("\n"),
      task: "task1",
      imageIds: ["chart1"],
      tableIdx: 1,
      rowIdx: 0,
    });
  });
});

describe("writing, reading back and clearing", () => {
  const graded = () => {
    const doc = makeColumnsTab(lesson4());
    const { rows } = collectIeltsRows(doc.tab);
    const res = results(rows);
    doc.apply(
      buildIeltsFeedbackRequests(res, rows, doc.tab.tabProperties.tabId),
    );
    return { doc, res };
  };

  it("writes below the heading, keeps the heading and the writing", () => {
    const { doc } = graded();
    expect(doc.cell(1, 0, 1)).toBe(
      "GV chữa/nhận xét\n1. BẢN CHỮA\nThe line graph illustrates the number of crimes → incidents (từ của đề).\n3. NHẬN XÉT\nEm viết khá tốt nha.",
    );
    expect(doc.cell(1, 0, 0)).toBe(
      ["Bài viết của học viên", "", ...ESSAY].join("\n"),
    );
    // Heading still bold; the feedback is bold only where "**" said so.
    expect(doc.boldOf(1, 0, 1)).toBe(
      "GV chữa/nhận xét" + "1. BẢN CHỮA" + "crimes → incidents" + "3. NHẬN XÉT",
    );
  });

  it("recognises its own write afterwards, and refuses to write twice", () => {
    const { doc, res } = graded();
    const { rows } = collectIeltsRows(doc.tab);
    expect(ieltsTargetsAlreadyFilled(res, rows)).toBe(true);
    expect(matchesOwnIeltsFeedback(res, rows, doc.tab)).toBe(true);
    expect(selectIeltsItemsToGrade(rows)).toMatchObject({
      items: [],
      graded: 1,
    });
    // A different feedback is not "ours".
    expect(matchesOwnIeltsFeedback(results(rows, "khác"), rows, doc.tab)).toBe(
      false,
    );
  });

  it("Xóa feedback removes only the AI's text: heading and teacher's note stay", () => {
    const { doc } = graded();
    doc.type(1, 0, 1, "\nCô: em chú ý thì của động từ nhé.");
    const plan = buildIeltsClearRequests(doc.tab);
    expect(plan.count).toBe(1);
    doc.apply(plan.requests);
    expect(doc.cell(1, 0, 1)).toBe(
      "GV chữa/nhận xét\nCô: em chú ý thì của động từ nhé.",
    );
    expect(doc.cell(1, 0, 0)).toBe(
      ["Bài viết của học viên", "", ...ESSAY].join("\n"),
    );
    expect(doc.tab.documentTab.namedRanges).toEqual({});
    // Nothing left to clear: a second run asks for nothing.
    expect(buildIeltsClearRequests(doc.tab)).toMatchObject({
      requests: [],
      count: 0,
      rows: 1,
    });
  });

  it("clearing an untouched write gives back the template exactly", () => {
    const { doc } = graded();
    doc.apply(buildIeltsClearRequests(doc.tab).requests);
    const blank = makeColumnsTab(lesson4());
    expect(doc.cell(1, 0, 1)).toBe(blank.cell(1, 0, 1));
    expect(doc.tab.documentTab.body).toEqual(blank.tab.documentTab.body);
  });

  it("a feedback the teacher edited is kept, not deleted", () => {
    const { doc } = graded();
    doc.edit(1, 0, 1, "Em viết khá tốt nha.", "Em viết tốt, cô sửa thêm.");
    const plan = buildIeltsClearRequests(doc.tab);
    expect(plan).toMatchObject({ requests: [], count: 0 });
  });
});

describe("old-layout tables keep docWriter's behaviour byte for byte", () => {
  const oldTable = {
    table: [
      ["IELTS WRITING – TASK 2", ""],
      ["Đề bài", "Some people think … Discuss."],
      ["Bài làm", "Nowadays many people…"],
      ["GV chữa", ""],
    ],
  };

  it("a tab of old tables only: the same requests as docWriter", () => {
    const { tab } = makeColumnsTab([oldTable]);
    const { rows } = collectIeltsRows(tab);
    expect(rows).toHaveLength(1);
    const res = results(rows);
    expect(buildIeltsFeedbackRequests(res, rows, "t.w")).toEqual(
      buildFeedbackRequests(res, rows, "t.w"),
    );
  });

  it("a tab mixing both layouts writes and clears both", () => {
    const doc = makeColumnsTab([oldTable, ...lesson4()]);
    const { rows } = collectIeltsRows(doc.tab);
    expect(rows.map((r) => r.layout)).toEqual(["rows", "columns"]);
    doc.apply(
      buildIeltsFeedbackRequests(results(rows, "Tốt nha."), rows, "t.w"),
    );
    expect(doc.cell(0, 3, 1)).toBe("Tốt nha.");
    expect(doc.cell(2, 0, 1)).toBe("GV chữa/nhận xét\nTốt nha.");
    const after = collectIeltsRows(doc.tab).rows;
    expect(
      matchesOwnIeltsFeedback(results(after, "Tốt nha."), after, doc.tab),
    ).toBe(true);

    const plan = buildIeltsClearRequests(doc.tab);
    expect(plan.count).toBe(2);
    // The old cell is cleared exactly as docWriter clears it.
    const oldOnly = buildClearFeedbackRequests(
      after.filter((r) => r.layout === "rows"),
      "t.w",
    );
    expect(plan.requests).toEqual(expect.arrayContaining(oldOnly));
    doc.apply(plan.requests);
    expect(doc.cell(0, 3, 1)).toBe("");
    expect(doc.cell(2, 0, 1)).toBe("GV chữa/nhận xét");
  });
});

describe("the lesson's own table with a 'GV chữa/nhận xét' row below", () => {
  const INTRO = "Intro: The line graph illustrates how much fish was eaten.";
  const OVERVIEW = "Overview: Overall, chicken rose while the rest fell.";
  /** Buổi 2, Exercise 2: the old Intro/Overview table plus a last row. */
  const lesson2 = ({
    intro = INTRO,
    overview = OVERVIEW,
    head = "GV chữa/nhận xét (Đoạn văn)",
    fb = "",
  } = {}) => [
    "Exercise 2: Viết Intro và Overview cho 2 đề sau đây",
    "The graph below shows the consumption of fish and different kinds of meat.",
    { image: "fish" },
    {
      table: [
        [intro.replace(/^(Intro:)/, "**$1**")],
        [overview.replace(/^(Overview:)/, "**$1**")],
        [[`**${head}**`, ...(fb ? [fb] : [])].join("\n")],
      ],
    },
    "Gợi ý:",
  ];

  it("reads the rows above as the writing, the last row as the feedback cell", () => {
    const { tab } = makeColumnsTab(lesson2());
    const { rows } = collectIeltsRows(tab);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      layout: LAYOUT_BELOW,
      tableIdx: 0,
      rowIdx: 2,
      task: "paragraph",
      taskFromLabel: true,
      essayText: `${INTRO}\n${OVERVIEW}`,
      feedbackText: "",
      imageIds: ["fish"],
    });
    expect(rows[0].promptText).toContain("consumption of fish");
  });

  it("the task comes from the heading, else it is guessed", () => {
    const label = (head) =>
      collectIeltsRows(makeColumnsTab(lesson2({ head })).tab).rows[0];
    expect(label("GV chữa/nhận xét (Task 1)").task).toBe("task1");
    expect(label("GV chữa/nhận xét – Task 2").task).toBe("task2");
    expect(label("GV chữa/nhận xét")).toMatchObject({
      task: "paragraph",
      taskFromLabel: false,
    });
    expect(label("Nhận xét của GV").layout).toBe(LAYOUT_BELOW);
  });

  it("only the template's labels: not written yet", () => {
    const blank = lesson2({ intro: "Intro:", overview: "Overview:" });
    const rows = collectIeltsRows(makeColumnsTab(blank).tab).rows;
    expect(selectIeltsItemsToGrade(rows)).toEqual({ items: [], graded: 0 });
  });

  it("two-column rows (buổi 11) are read row by row", () => {
    const spec = [
      "Exercise 2: viết mở bài và kết bài cho đề bài sau",
      "1, New technologies have changed the way children spend their free time.",
      {
        table: [
          ["**Introduction:**", "It is often argued that technology…"],
          ["**Conclusion:**", "In conclusion, I believe…"],
          ["**GV chữa/nhận xét (Đoạn văn)**", ""],
        ],
      },
    ];
    const [entry] = collectIeltsRows(makeColumnsTab(spec).tab).rows;
    expect(entry.essayText).toBe(
      "Introduction:\nIt is often argued that technology…\nConclusion:\nIn conclusion, I believe…",
    );
    const blank = [
      ...spec.slice(0, 2),
      {
        table: [
          ["**Introduction:**", ""],
          ["**Conclusion:**", ""],
          ["**GV chữa/nhận xét**", ""],
        ],
      },
    ];
    const rows = collectIeltsRows(makeColumnsTab(blank).tab).rows;
    expect(selectIeltsItemsToGrade(rows).items).toEqual([]);
  });

  it("a teacher's comment row is not a feedback heading", () => {
    const spec = lesson2({ head: "Nhận xét: Intro nhìn chung đúng và rõ ý." });
    expect(collectIeltsRows(makeColumnsTab(spec).tab).rows).toEqual([]);
  });

  it("writes below the heading, clears only the AI's text", () => {
    const doc = makeColumnsTab(lesson2());
    const { rows } = collectIeltsRows(doc.tab);
    const res = results(rows);
    doc.apply(buildIeltsFeedbackRequests(res, rows, "t.w"));
    expect(doc.cell(0, 2, 0)).toBe(
      "GV chữa/nhận xét (Đoạn văn)\n1. BẢN CHỮA\nThe line graph illustrates the number of crimes → incidents (từ của đề).\n3. NHẬN XÉT\nEm viết khá tốt nha.",
    );
    expect(doc.cell(0, 0, 0)).toBe(INTRO);
    expect(doc.cell(0, 1, 0)).toBe(OVERVIEW);
    const after = collectIeltsRows(doc.tab).rows;
    expect(matchesOwnIeltsFeedback(res, after, doc.tab)).toBe(true);
    expect(selectIeltsItemsToGrade(after)).toMatchObject({
      items: [],
      graded: 1,
    });

    doc.type(0, 2, 0, "\nCô: tốt lắm.");
    doc.apply(buildIeltsClearRequests(doc.tab).requests);
    expect(doc.cell(0, 2, 0)).toBe("GV chữa/nhận xét (Đoạn văn)\nCô: tốt lắm.");
    expect(doc.cell(0, 0, 0)).toBe(INTRO);
  });

  it("a 2-column table is still read as columns, not 'below'", () => {
    const { rows } = collectIeltsRows(makeColumnsTab(lesson4()).tab);
    expect(rows.map((r) => r.layout)).toEqual([LAYOUT_COLUMNS]);
  });
});

describe("findIeltsTab: buổi 21–22 of the new doc", () => {
  const tab = (title, children = [], spec = []) => ({
    ...makeColumnsTab(spec, title).tab,
    childTabs: children,
  });
  const table = lesson4();
  const doc = [
    tab("Buổi 20", [
      tab("Writing buổi 20", [], table),
      tab("Speaking buổi 20"),
    ]),
    tab("Buổi 21", [
      tab("Writing (Process)", [], table),
      tab("Speaking buổi 21"),
    ]),
    tab("Buổi 22 (Maps)", [], table),
    tab("Bổ trợ 1", [tab("Ngữ pháp buổi 1")]),
  ];
  const titleOf = (t) => t?.tabProperties.title ?? null;

  it("buổi 21 → 'Writing (Process)'", () => {
    expect(titleOf(findIeltsTab(doc, "BUỔI 21"))).toBe("Writing (Process)");
  });

  it("buổi 22 → its own tab 'Buổi 22 (Maps)'", () => {
    expect(titleOf(findIeltsTab(doc, "BUỔI 22"))).toBe("Buổi 22 (Maps)");
  });

  it("buổi 2 is not 'Buổi 22 (Maps)'", () => {
    expect(findIeltsTab(doc, "BUỔI 02")).toBeNull();
  });
});
