/**
 * The IELTS template the teachers asked for on 2026-10-09 ("review"), and
 * the update that turns a lesson into it (ieltsDoc.js planIeltsTemplateUpdate):
 *
 *   | Intro: <student>          |          (the lesson's own table, one per prompt)
 *   | Bài chữa 1 | Bài cải thiện 1 |        (ONE table per exercise, a row each)
 *   Nhận xét chung                          (the comments go below these)
 *   Lời khuyên cải thiện
 *
 * and a "GV chữa/nhận xét" column on short-sentence tables. Converted on the
 * small Docs model (helpers/ieltsColumnsDoc.js), whose table indexes follow
 * what the real API was measured to do; then graded, read back and cleared.
 */
import { describe, expect, it } from "vitest";

import {
  KIND_IELTS_SENTENCES,
  LAYOUT_REVIEW,
  LAYOUT_SENTENCES,
  buildIeltsClearRequests,
  buildIeltsFeedbackRequests,
  collectIeltsRows,
  exerciseKind,
  ieltsTargetsAlreadyFilled,
  matchesOwnIeltsFeedback,
  planIeltsTemplateUpdate,
  selectIeltsItemsToGrade,
} from "../src/lib/ieltsDoc.js";
import { makeColumnsTab } from "./helpers/ieltsColumnsDoc.js";

/** A lesson tab of the course's own doc, before any template. */
const original = ({
  intro = "Intro: The graph shows fish.",
  feedbackRow = null,
} = {}) => [
  "Exercise 1: Điền từ phù hợp vào chỗ trống",
  "The chart (1) ____ how much ...",
  { table: [["peak – rose – how much"]] },
  "Exercise 2: Viết Intro và Overview cho đề sau đây",
  "The graph below shows the consumption of fish and meat.",
  { image: "chart1" },
  {
    table: [
      [intro],
      ["Overview: Overall, chicken rose."],
      ...(feedbackRow === null ? [] : [[feedbackRow]]),
    ],
  },
  "Gợi ý:",
  "Fish là danh từ đếm được không?",
  "Exercise 3: Viết câu mô tả số liệu của các đối tượng trong biểu đồ",
  { image: "chart2" },
  "VD: Mô tả số liệu của Spain (1970 - 1980)",
  {
    table: [
      ["Sđơn vị… + V + adv: The fruit production in Spain increased slightly."],
    ],
  },
  "1, Mô tả số liệu của Spain (1980 - 2010) - Giảm đều",
  {
    table: [
      ["Sđơn vị… + V + adv: The fruit production in Spain decrease steadily."],
      ["Sgiả (There) …:"],
    ],
    widths: [770],
  },
  "2, Mô tả số liệu của Sports",
  {
    table: [
      ["Loại chủ ngữ", "Câu mô tả"],
      ["Chủ ngữ đơn vị", "The percentage of boys was higher."],
      ["Chủ ngữ người", ""],
    ],
  },
  "Gợi ý từ vựng",
  {
    table: [
      ["Từ/cụm tiếng Anh", "Nghĩa tiếng Việt"],
      ["leisure activities", "hoạt động giải trí"],
    ],
  },
  "Exercise 4: Hãy nối các problems này với reasons, sau đó gợi ý MỘT solutions",
  {
    table: [
      ["Problems", "Reasons", "Matching"],
      ["1. Stress", "A. Work", ""],
    ],
  },
  "Sau khi viết xong, hãy tích vào các ô sau đây",
];

/** Exercise 2 with two prompts, as buổi 2: "Viết Intro và Overview cho 2 đề". */
const twoPrompts = () => {
  const spec = original();
  spec.splice(
    7,
    0,
    "The bar chart shows young people in education.",
    { image: "chart3" },
    {
      table: [["Intro: The bar chart shows people."], ["Overview: More men."]],
    },
  );
  return spec;
};

const convert = (spec) => {
  const doc = makeColumnsTab(spec, "Writing buổi 2");
  const plan = planIeltsTemplateUpdate(doc.tab);
  doc.apply(plan.requests);
  return { doc, plan };
};

const sliceFrom = (outline, line, n) => {
  const at = outline.indexOf(line);
  return outline.slice(at, at + n);
};

describe("exerciseKind: which exercises are written", () => {
  it.each([
    ["Exercise 2: Viết Intro và Overview cho 2 đề sau đây", "essay"],
    ["Exercise 3: Lên dàn ý và viết bài hoàn chỉnh cho đề sau", "essay"],
    ["Exercise 2: Xác định paraphrasing … & viết mở bài và kết bài", "essay"],
    ["Exercise 3: Viết câu mô tả số liệu của các đối tượng", "sentences"],
    ["Exercise 4: Kết hợp các câu mô tả ở bài tập 3", "sentences"],
    ["Exercise 2: Hãy gợi ý MỘT solutions cho từng problem", "sentences"],
    ["Exercise 1: Điền từ phù hợp vào chỗ trống", null],
    [
      "Exercise 1: Xác định các ngôn ngữ của dạng Process trong bài viết sau",
      null,
    ],
    [
      "Exercise 1: Hãy nối các problems với reasons. Sau đó gợi ý MỘT solutions",
      null,
    ],
    ["Exercise 1: Chọn luận cứ phù hợp và giải thích lý do", null],
  ])("%s → %s", (text, kind) => {
    expect(exerciseKind(text)).toBe(kind);
  });
});

describe("planIeltsTemplateUpdate on the course's own doc", () => {
  it("adds the review table + its two lines under the writing, a column to sentence tables", () => {
    const { doc, plan } = convert(original());
    expect(plan.changes.map((c) => [c.kind, c.tableIdx, c.written])).toEqual([
      ["essay", 1, true],
      ["sentences", 3, true],
      ["sentences", 4, true],
    ]);
    expect(doc.outline()).toEqual([
      "¶ Exercise 1: Điền từ phù hợp vào chỗ trống",
      "¶ The chart (1) ____ how much ...",
      "[peak – rose – how much]",
      "¶ Exercise 2: Viết Intro và Overview cho đề sau đây",
      "¶ The graph below shows the consumption of fish and meat.",
      "¶ [image]",
      "[Intro: The graph shows fish.]",
      "[Overview: Overall, chicken rose.]",
      "¶ ",
      "[Bài chữa 1 | Bài cải thiện 1]",
      "¶ Nhận xét chung",
      "¶ Lời khuyên cải thiện",
      "¶ Gợi ý:",
      "¶ Fish là danh từ đếm được không?",
      "¶ Exercise 3: Viết câu mô tả số liệu của các đối tượng trong biểu đồ",
      "¶ [image]",
      "¶ VD: Mô tả số liệu của Spain (1970 - 1980)",
      "[Sđơn vị… + V + adv: The fruit production in Spain increased slightly.]",
      "¶ 1, Mô tả số liệu của Spain (1980 - 2010) - Giảm đều",
      "[Câu của học viên | GV chữa/nhận xét]",
      "[Sđơn vị… + V + adv: The fruit production in Spain decrease steadily. | ]",
      "[Sgiả (There) …: | ]",
      "¶ 2, Mô tả số liệu của Sports",
      "[Loại chủ ngữ | Câu mô tả | GV chữa/nhận xét]",
      "[Chủ ngữ đơn vị | The percentage of boys was higher. | ]",
      "[Chủ ngữ người |  | ]",
      "¶ Gợi ý từ vựng",
      "[Từ/cụm tiếng Anh | Nghĩa tiếng Việt]",
      "[leisure activities | hoạt động giải trí]",
      "¶ Exercise 4: Hãy nối các problems này với reasons, sau đó gợi ý MỘT solutions",
      "[Problems | Reasons | Matching]",
      "[1. Stress | A. Work | ]",
      "¶ Sau khi viết xong, hãy tích vào các ô sau đây",
    ]);
    // Headings bold; the fixed-width table shared out again (45% comments).
    expect(doc.boldOf(2, 0, 0)).toBe("Bài chữa 1");
    expect(doc.boldOf(2, 0, 1)).toBe("Bài cải thiện 1");
    expect(doc.boldParagraphs()).toBe(
      "Nhận xét chung" + "Lời khuyên cải thiện",
    );
    expect(doc.widths(4)).toEqual([423.5, 346.5]);
  });

  it("an exercise with two prompts gets ONE table, a row per prompt", () => {
    const { doc, plan } = convert(twoPrompts());
    expect(plan.changes.filter((c) => c.kind === "essay").length).toBe(2);
    expect(
      sliceFrom(doc.outline(), "[Intro: The bar chart shows people.]", 7),
    ).toEqual([
      "[Intro: The bar chart shows people.]",
      "[Overview: More men.]",
      "¶ ",
      "[Bài chữa 1 | Bài cải thiện 1]",
      "[Bài chữa 2 | Bài cải thiện 2]",
      "¶ Nhận xét chung",
      "¶ Lời khuyên cải thiện",
    ]);
    expect(doc.boldOf(3, 1, 0)).toBe("Bài chữa 2");
    expect(doc.boldOf(3, 1, 1)).toBe("Bài cải thiện 2");
  });

  it("runs once: the converted tab plans nothing", () => {
    for (const spec of [original(), twoPrompts()]) {
      const { doc } = convert(spec);
      const again = planIeltsTemplateUpdate(doc.tab);
      expect(again.requests).toEqual([]);
      expect(again.changes).toEqual([]);
    }
  });

  it("reads the converted tab: the writing, its prompt, the sentences", () => {
    const { doc } = convert(original());
    const { rows } = collectIeltsRows(doc.tab);
    const review = rows.find((r) => r.layout === LAYOUT_REVIEW);
    expect(review).toMatchObject({
      tableIdx: 2,
      rowIdx: 0,
      task: "paragraph",
      essayText:
        "Intro: The graph shows fish.\nOverview: Overall, chicken rose.",
      promptText:
        "Exercise 2: Viết Intro và Overview cho đề sau đây\nThe graph below shows the consumption of fish and meat.",
      imageIds: ["chart1"],
      feedbackText: "",
    });
    expect(review.review.generalAt).not.toBeNull();
    expect(review.review.adviceAt).toBeGreaterThan(review.review.generalAt);
    const sentences = rows.filter((r) => r.layout === LAYOUT_SENTENCES);
    expect(
      sentences.map((r) => [r.tableIdx, r.rowIdx, r.cells, r.answered]),
    ).toEqual([
      [
        4,
        1,
        [
          "Sđơn vị… + V + adv: The fruit production in Spain decrease steadily.",
        ],
        true,
      ],
      [4, 2, ["Sgiả (There) …:"], false],
      [5, 1, ["Chủ ngữ đơn vị", "The percentage of boys was higher."], true],
      [5, 2, ["Chủ ngữ người", ""], false],
    ]);
    // A table's prompt: the exercise, its own item line, the exercise's chart.
    expect(sentences[0].promptText).toBe(
      "Exercise 3: Viết câu mô tả số liệu của các đối tượng trong biểu đồ\nVD: Mô tả số liệu của Spain (1970 - 1980)\n1, Mô tả số liệu của Spain (1980 - 2010) - Giảm đều",
    );
    expect(sentences[0].imageIds).toEqual(["chart2"]);
    expect(sentences[2].promptText).toMatch(/\n2, Mô tả số liệu của Sports$/);

    const { items } = selectIeltsItemsToGrade(rows);
    expect(
      items.map((i) => [i.type, i.tableIdx, i.sentences?.map((s) => s.rowIdx)]),
    ).toEqual([
      ["ielts_writing", 2, undefined],
      [KIND_IELTS_SENTENCES, 4, [1]],
      [KIND_IELTS_SENTENCES, 5, [1]],
    ]);
    expect(items[2].columns).toEqual(["Loại chủ ngữ", "Câu mô tả"]);
  });

  it("two prompts: each row reads its own writing, prompt and chart", () => {
    const { doc } = convert(twoPrompts());
    const rows = collectIeltsRows(doc.tab).rows.filter(
      (r) => r.layout === LAYOUT_REVIEW,
    );
    expect(
      rows.map((r) => [r.tableIdx, r.rowIdx, r.essayText, r.imageIds]),
    ).toEqual([
      [
        3,
        0,
        "Intro: The graph shows fish.\nOverview: Overall, chicken rose.",
        ["chart1"],
      ],
      [
        3,
        1,
        "Intro: The bar chart shows people.\nOverview: More men.",
        ["chart3"],
      ],
    ]);
    expect(rows[0].promptText).toBe(
      "Exercise 2: Viết Intro và Overview cho đề sau đây\nThe graph below shows the consumption of fish and meat.",
    );
    expect(rows[1].promptText).toBe(
      "Exercise 2: Viết Intro và Overview cho đề sau đây\nThe bar chart shows young people in education.",
    );
  });

  it("an exercise without a table is reported", () => {
    const doc = makeColumnsTab([
      "Exercise 3: Viết câu mô tả sự thay đổi trong bản đồ dưới đây",
      "1, Mô tả Trees",
      "→",
      "Exercise 4: Viết bài hoàn chỉnh miêu tả Maps sau",
      "The maps below show …",
    ]);
    expect(
      planIeltsTemplateUpdate(doc.tab).skipped.map((s) => s.reason),
    ).toEqual(["noTable", "noTable"]);
  });
});

/** Exercise 2 on the 2026-10-07 template: its writing, then the pair table. */
const onPairTemplate = (feedback = "") => {
  const spec = original();
  spec.splice(
    7,
    0,
    "",
    {
      table: [[`**GV chữa/nhận xét**${feedback}`, "**BẢN CẢI THIỆN**"]],
    },
    "NHẬN XÉT",
  );
  return spec;
};

describe("planIeltsTemplateUpdate on the older templates", () => {
  it("'GV chữa/nhận xét' row below, still empty: the row goes, the review table comes", () => {
    const { doc } = convert(original({ feedbackRow: "**GV chữa/nhận xét**" }));
    expect(
      sliceFrom(doc.outline(), "[Intro: The graph shows fish.]", 6),
    ).toEqual([
      "[Intro: The graph shows fish.]",
      "[Overview: Overall, chicken rose.]",
      "¶ ",
      "[Bài chữa 1 | Bài cải thiện 1]",
      "¶ Nhận xét chung",
      "¶ Lời khuyên cải thiện",
    ]);
  });

  it("a row below that holds feedback was graded: left as it is", () => {
    const doc = makeColumnsTab(
      original({ feedbackRow: "**GV chữa/nhận xét**\nBẢN CHỮA\nEm viết tốt." }),
    );
    const plan = planIeltsTemplateUpdate(doc.tab);
    expect(plan.changes.map((c) => c.kind)).toEqual(["sentences", "sentences"]);
    expect(plan.skipped).toEqual([
      {
        exercise: "Exercise 2: Viết Intro và Overview cho đề sau đây",
        reason: "graded",
      },
    ]);
  });

  it("the 2026-10-07 pair table, still empty, is replaced by the review table", () => {
    const { doc, plan } = convert(onPairTemplate());
    expect(plan.changes.map((c) => c.kind)).toEqual([
      "essay",
      "sentences",
      "sentences",
    ]);
    expect(
      sliceFrom(doc.outline(), "[Intro: The graph shows fish.]", 7),
    ).toEqual([
      "[Intro: The graph shows fish.]",
      "[Overview: Overall, chicken rose.]",
      "¶ ",
      "[Bài chữa 1 | Bài cải thiện 1]",
      "¶ Nhận xét chung",
      "¶ Lời khuyên cải thiện",
      "¶ Gợi ý:",
    ]);
    expect(doc.outline().join("\n")).not.toMatch(/BẢN CẢI THIỆN|NHẬN XÉT/);
    expect(planIeltsTemplateUpdate(doc.tab).requests).toEqual([]);
  });

  it("a pair table that holds feedback was graded: left as it is", () => {
    const doc = makeColumnsTab(onPairTemplate("\nEm viết tốt."));
    const plan = planIeltsTemplateUpdate(doc.tab);
    expect(plan.skipped).toEqual([
      {
        exercise: "Exercise 2: Viết Intro và Overview cho đề sau đây",
        reason: "graded",
      },
    ]);
  });

  it("the teachers' 2-column table: its empty feedback column goes", () => {
    const { doc } = convert([
      "Exercise 2: Dựa vào bài tập 1, hãy viết bài hoàn chỉnh miêu tả biểu đồ sau",
      "The graph below shows car theft.",
      { image: "chart1" },
      {
        table: [
          [
            "**Bài viết của học viên (Task 1)**\nThe line graph shows crimes.",
            "**GV chữa/nhận xét**",
          ],
        ],
        widths: [385, 385],
      },
      "Sau khi viết xong, hãy tích vào các ô sau đây",
    ]);
    expect(doc.outline().slice(3, 8)).toEqual([
      "[Bài viết của học viên (Task 1)⏎The line graph shows crimes.]",
      "¶ ",
      "[Bài chữa 1 | Bài cải thiện 1]",
      "¶ Nhận xét chung",
      "¶ Lời khuyên cải thiện",
    ]);
    expect(doc.widths(0)).toEqual([770]);
    const review = collectIeltsRows(doc.tab).rows[0];
    expect(review).toMatchObject({
      layout: LAYOUT_REVIEW,
      task: "task1",
      taskFromLabel: true,
      essayText: "The line graph shows crimes.",
    });
  });
});

const PARTS = {
  corrected:
    "Intro: The graph **shows** → illustrates (từ vựng: illustrate) the consumption of fish.",
  improved: "The line graph illustrates fish consumption.",
  review:
    "**Nhận xét chung:** Em viết rõ ý.\n**Lời khuyên cải thiện:** Em học thêm từ nha.",
  general: "Em viết rõ ý.",
  advice: "Em học thêm từ nha.",
};
const FEEDBACK = `**BẢN CHỮA**\n${PARTS.corrected}\n\n**BẢN CẢI THIỆN**\n${PARTS.improved}\n\n**NHẬN XÉT**\n${PARTS.review}`;

/** Converted, then graded: the review row gets PARTS, sentences a comment each. */
const graded = (spec = original()) => {
  const { doc } = convert(spec);
  const { rows } = collectIeltsRows(doc.tab);
  const review = rows.find((r) => r.layout === LAYOUT_REVIEW);
  const res = [
    {
      rowKey: `${review.tableIdx}:0`,
      questionIndex: null,
      aiFeedback: FEEDBACK,
      parts: PARTS,
    },
    {
      rowKey: "4:1",
      questionIndex: null,
      aiFeedback:
        "The fruit production in Spain **decrease** → decreased (thì) steadily.",
    },
    { rowKey: "5:1", questionIndex: null, aiFeedback: "✅" },
  ];
  const template = doc.outline();
  doc.apply(buildIeltsFeedbackRequests(res, rows, doc.tab.tabProperties.tabId));
  return { doc, res, template };
};

describe("grading into the new template", () => {
  it("Bài chữa | Bài cải thiện side by side, mistakes bold, explanations italic, comments under their lines", () => {
    const { doc } = graded();
    expect(doc.cell(2, 0, 0)).toBe(
      "Bài chữa 1\nIntro: The graph shows → illustrates (từ vựng: illustrate) the consumption of fish.",
    );
    expect(doc.boldOf(2, 0, 0)).toBe("Bài chữa 1" + "shows");
    expect(doc.italicOf(2, 0, 0)).toBe("(từ vựng: illustrate)");
    expect(doc.cell(2, 0, 1)).toBe(
      "Bài cải thiện 1\nThe line graph illustrates fish consumption.",
    );
    expect(doc.italicOf(2, 0, 1)).toBe("");
    expect(sliceFrom(doc.outline(), "¶ Nhận xét chung", 5)).toEqual([
      "¶ Nhận xét chung",
      "¶ Em viết rõ ý.",
      "¶ Lời khuyên cải thiện",
      "¶ Em học thêm từ nha.",
      "¶ Gợi ý:",
    ]);
    expect(doc.boldParagraphs()).toBe(
      "Nhận xét chung" + "Lời khuyên cải thiện",
    );
    expect(doc.cell(4, 1, 1)).toBe(
      "The fruit production in Spain decrease → decreased (thì) steadily.",
    );
    expect(doc.boldOf(4, 1, 1)).toBe("decrease");
    expect(doc.cell(5, 1, 2)).toBe("✅");
    expect(doc.cell(4, 2, 1)).toBe(""); // an unwritten row gets nothing
  });

  it("italics: only the explanation right after each fix, never the student's own brackets", () => {
    const { doc } = convert(original());
    const { rows } = collectIeltsRows(doc.tab);
    const corrected =
      "Intro: I **goes** → go (S-V) to (my) school **everyday** → every day (adv: every day (adv)). " +
      "I have **know** → known (HTHT: have + Pii). **teh** → the graph (a chart) rose " +
      "**sharp** → sharply (trạng từ) and **make** → reach (collocation).\n" +
      // Seen on a real essay: the explanation at the end of the sentence.
      "Overview: The changes **of** → in the village of Stokeford in 1930. (giới từ: changes in sth) " +
      "It **grow** → grew fast. (see the map) In my opinion, **I think** → (bỏ) (trùng nghĩa) it is good.";
    doc.apply(
      buildIeltsFeedbackRequests(
        [
          {
            rowKey: "2:0",
            aiFeedback: "x",
            parts: { ...PARTS, corrected },
          },
        ],
        rows,
        doc.tab.tabProperties.tabId,
      ),
    );
    expect(doc.italicOf(2, 0, 0)).toBe(
      "(S-V)" +
        "(adv: every day (adv))" +
        "(HTHT: have + Pii)" +
        "(trạng từ)" +
        "(collocation)" +
        "(giới từ: changes in sth)" +
        "(trùng nghĩa)",
    );
    expect(doc.boldOf(2, 0, 0)).toBe(
      "Bài chữa 1" +
        "goes" +
        "everyday" +
        "know" +
        "teh" +
        "sharp" +
        "make" +
        "of" +
        "grow" +
        "I think",
    );
  });

  it("two prompts: a row each, the comments 'Bài 1: …', 'Bài 2: …'", () => {
    const { doc } = convert(twoPrompts());
    const { rows } = collectIeltsRows(doc.tab);
    const tabId = doc.tab.tabProperties.tabId;
    const two = {
      corrected: "Intro: The bar chart **show** → shows (S-V) people.",
      improved: "The bar chart shows young people.",
      general: "Bài ngắn gọn.",
      advice: "Thêm số liệu.",
    };
    doc.apply(
      buildIeltsFeedbackRequests(
        [
          { rowKey: "3:1", aiFeedback: "x", parts: two },
          { rowKey: "3:0", aiFeedback: "x", parts: PARTS },
        ],
        rows,
        tabId,
      ),
    );
    expect(doc.cell(3, 0, 0)).toMatch(/^Bài chữa 1\nIntro: The graph shows/);
    expect(doc.cell(3, 1, 0)).toBe(
      "Bài chữa 2\nIntro: The bar chart show → shows (S-V) people.",
    );
    expect(doc.cell(3, 1, 1)).toBe(
      "Bài cải thiện 2\nThe bar chart shows young people.",
    );
    expect(sliceFrom(doc.outline(), "¶ Nhận xét chung", 7)).toEqual([
      "¶ Nhận xét chung",
      "¶ Bài 1: Em viết rõ ý.",
      "¶ Bài 2: Bài ngắn gọn.",
      "¶ Lời khuyên cải thiện",
      "¶ Bài 1: Em học thêm từ nha.",
      "¶ Bài 2: Thêm số liệu.",
      "¶ Gợi ý:",
    ]);
    // Read back: both rows graded, nothing planned twice.
    const after = collectIeltsRows(doc.tab).rows;
    expect(
      selectIeltsItemsToGrade(after).items.filter(
        (i) => i.type === "ielts_writing",
      ),
    ).toEqual([]);
  });

  it("recognises its own write; nothing is graded twice", () => {
    const { doc, res } = graded();
    const { rows } = collectIeltsRows(doc.tab);
    expect(matchesOwnIeltsFeedback(res, rows, doc.tab)).toBe(true);
    expect(ieltsTargetsAlreadyFilled(res, rows)).toBe(true);
    expect(selectIeltsItemsToGrade(rows)).toEqual({ items: [], graded: 3 });
  });

  it("the next exercise's prompt never picks up the comments", () => {
    const { doc } = graded();
    const sentences = collectIeltsRows(doc.tab).rows.filter(
      (r) => r.layout === LAYOUT_SENTENCES,
    );
    expect(sentences[0].promptText).not.toMatch(/Nhận xét|Em viết|Lời khuyên/);
  });

  it("without the two lines, the comments follow the corrected writing", () => {
    const { doc } = convert(original());
    const tabId = doc.tab.tabProperties.tabId;
    // The teacher deleted both lines (their text; the paragraphs stay empty).
    for (const text of ["Lời khuyên cải thiện\n", "Nhận xét chung\n"]) {
      const line = doc.tab.documentTab.body.content.find(
        (b) =>
          (b.paragraph?.elements || [])
            .map((e) => e.textRun?.content)
            .join("") === text,
      );
      doc.apply([
        {
          deleteContentRange: {
            range: {
              startIndex: line.startIndex,
              endIndex: line.endIndex - 1,
              tabId,
            },
          },
        },
      ]);
    }
    const { rows } = collectIeltsRows(doc.tab);
    const review = rows.find((r) => r.layout === LAYOUT_REVIEW);
    expect(review.review.generalAt).toBeNull();
    doc.apply(
      buildIeltsFeedbackRequests(
        [
          {
            rowKey: `${review.tableIdx}:0`,
            aiFeedback: FEEDBACK,
            parts: PARTS,
          },
        ],
        rows,
        tabId,
      ),
    );
    expect(doc.cell(2, 0, 0)).toBe(
      [
        "Bài chữa 1",
        "Intro: The graph shows → illustrates (từ vựng: illustrate) the consumption of fish.",
        "",
        "Nhận xét chung: Em viết rõ ý.",
        "Lời khuyên cải thiện: Em học thêm từ nha.",
      ].join("\n"),
    );
  });

  it("Xóa feedback gives back the converted template exactly; a teacher's note stays", () => {
    const { doc, template } = graded();
    doc.type(5, 2, 2, "Cô: em viết thêm câu này nhé.");
    const plan = buildIeltsClearRequests(doc.tab);
    expect(plan.count).toBe(6); // corrected, improved, general, advice, 2 sentences
    doc.apply(plan.requests);
    const expected = template.map((line) =>
      line === "[Chủ ngữ người |  | ]"
        ? "[Chủ ngữ người |  | Cô: em viết thêm câu này nhé.]"
        : line,
    );
    expect(doc.outline()).toEqual(expected);
    expect(Object.keys(doc.tab.documentTab.namedRanges)).toEqual([]);
  });
});

describe("which sentence rows the student wrote", () => {
  const lesson = (vn = "", en = "") => [
    "Exercise 3: Viết luận điểm tiếng Việt & tiếng Anh cho đề bài sau:",
    {
      table: [
        [
          "Khía cạnh",
          "Câu hỏi gợi ý",
          "Luận điểm (tiếng Việt)",
          "Luận điểm (tiếng Anh)",
        ],
        ["R – Relationship", "Công nghệ giúp trẻ kết nối ra sao?", vn, en],
      ],
    },
    "Exercise 2: Viết luận cứ giải thích bằng tiếng Việt & tiếng Anh",
    {
      table: [
        ["Giải thích", "Gợi ý"],
        ["Tiếng Việt:", "Những môn học nào thường có trong kỳ thi?"],
        ["Gợi ý: • Hãy nghĩ về kỳ thi", "Gợi ý: • …"],
      ],
    },
  ];
  const answered = (spec) => {
    const { doc, plan } = convert(spec);
    return {
      planned: plan.changes.map((c) => c.written),
      rows: collectIeltsRows(doc.tab).rows.map((r) => r.answered),
    };
  };

  it("the teacher's columns (questions, hints) and hint rows are not writing", () => {
    expect(answered(lesson())).toEqual({
      planned: [false, false],
      rows: [false, false, false],
    });
  });

  it("a structure to follow ('… + N + in A …') is the teacher's", () => {
    const { doc } = convert([
      "Exercise 3: Viết câu mô tả số liệu",
      {
        table: [
          ["Loại chủ ngữ", "Câu mô tả"],
          [
            "as…as",
            "The amount/number/percentage of + N + in A was as high as that in B, at X.",
          ],
          [
            "the same as",
            "The figure for girls was the same as that for boys, at 15%.",
          ],
        ],
      },
    ]);
    expect(collectIeltsRows(doc.tab).rows.map((r) => r.answered)).toEqual([
      false,
      true,
    ]);
  });

  it("anything in the student's columns is", () => {
    expect(answered(lesson("", "Children keep in touch online."))).toEqual({
      planned: [true, false],
      rows: [true, false, false],
    });
  });
});

describe("a sentence table with a hint merged down two rows (buổi 13)", () => {
  const lesson = () => [
    "Exercise 2: Viết luận cứ giải thích bằng tiếng Việt & tiếng Anh",
    "Luận điểm 1: Schools should focus on academic subjects.",
    {
      table: [
        ["Giải thích", "Gợi ý"],
        ["Tiếng Việt: Các môn này có trong kỳ thi.", "Những môn học nào …?"],
        ["Tiếng Anh: These subjects appears in exams.", ""],
      ],
      spans: [[1, 1, 2]],
    },
  ];

  it("the new comment column is split back into a cell per row", () => {
    const { doc, plan } = convert(lesson());
    expect(plan.requests.some((r) => r.unmergeTableCells)).toBe(true);
    const { rows } = collectIeltsRows(doc.tab);
    expect(rows.map((r) => [r.rowIdx, r.answered])).toEqual([
      [1, true],
      [2, true],
    ]);
  });

  it("a comment cell left merged hides the row below: no comment goes there", () => {
    const doc = makeColumnsTab(lesson());
    const plan = planIeltsTemplateUpdate(doc.tab);
    doc.apply(plan.requests.filter((r) => !r.unmergeTableCells));
    expect(collectIeltsRows(doc.tab).rows.map((r) => r.rowIdx)).toEqual([1]);
  });
});

describe("a Basic table is never a sentence table", () => {
  it("its 'Chữa bài' column is not the teacher's 'GV chữa/nhận xét'", () => {
    const doc = makeColumnsTab([
      "Exercise 3: Viết câu",
      {
        table: [
          ["STT", "Đề bài", "Chữa bài"],
          ["1", "I go school.", ""],
        ],
      },
    ]);
    expect(collectIeltsRows(doc.tab).rows).toEqual([]);
  });
});
