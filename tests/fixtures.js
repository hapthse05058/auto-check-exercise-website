import { collectExerciseRows } from "../src/lib/docTableDetect.js";

/** Shared synthetic Google Doc structures for tests. */

/** Paragraph with a single text run. */
export const P = (text, startIndex = 1) => ({
  paragraph: { elements: [{ textRun: { content: text } }] },
  startIndex,
});

/**
 * Paragraph split across several text runs — what Google Docs produces when
 * part of the line is bold, highlighted or linked.
 */
export const PRuns = (...texts) => ({
  paragraph: { elements: texts.map((content) => ({ textRun: { content } })) },
  startIndex: 1,
});

export const row = (...cells) => ({
  tableCells: cells.map((content) => ({ content })),
});

/**
 * Tab holding a single exercise table whose rows are given verbatim (the two
 * header rows are added for you, since the parser always skips them).
 */
export function makeTabWithRows(rows, title = "BUỔI 10 - Lesson") {
  const headerRow1 = row([P("STT")], [P("Đề bài")], [P("Chữa bài")]);
  const headerRow2 = row([P("")], [P("")], [P("")]);
  return {
    tabProperties: { title, tabId: "t.x" },
    documentTab: {
      body: {
        content: [{ table: { tableRows: [headerRow1, headerRow2, ...rows] } }],
      },
    },
  };
}

/** Exercise row: question/answer paragraphs in cell 0, feedback in the last cell. */
export const questionRow = (paragraphs, feedback = "", startIndex = 50) =>
  row(paragraphs, [P("")], [P(feedback, startIndex)]);

/**
 * Mirrors the real doc layout: rows 0-1 are headers, question rows hold the
 * question and the student's "→" answer as separate paragraphs in the first
 * cell, the feedback column is the last cell, and the overall-feedback row
 * ("Nhận xét chung của Giáo viên") is the LAST row of the table.
 */
export function makeNormalLessonTab({ answered = true, feedback = "" } = {}) {
  const headerRow1 = row([P("STT")], [P("Đề bài")], [P("Chữa bài")]);
  const headerRow2 = row([P("")], [P("")], [P("")]);
  const q1 = row(
    [P("1. Câu hỏi một\n"), P(answered ? "→ My answer one\n" : "→ \n")],
    [P("")],
    [P(feedback, 50)],
  );
  const q2 = row(
    [P("2. Câu hỏi hai\n"), P(answered ? "→ My answer two\n" : "→\n")],
    [P("")],
    [P(feedback, 80)],
  );
  const overallRow = row([P("Nhận xét chung của Giáo viên:", 100)]);
  return {
    tabProperties: { title: "BUỔI 10 - Lesson", tabId: "t.x" },
    documentTab: {
      body: {
        content: [
          {
            table: { tableRows: [headerRow1, headerRow2, q1, q2, overallRow] },
          },
        ],
      },
    },
  };
}

/**
 * Paragraph whose ELEMENTS carry startIndex/endIndex, the way the Docs API
 * actually returns them. `P` above only indexes the paragraph, which is enough
 * for the write path; the clear path resolves ranges from element indexes, so
 * it needs these.
 */
export const PIndexed = (text, start) => ({
  startIndex: start,
  endIndex: start + text.length,
  paragraph: {
    elements: [
      {
        startIndex: start,
        endIndex: start + text.length,
        textRun: { content: text },
      },
    ],
  },
});

/** Paragraph split into several indexed runs, contiguous from `start`. */
export const PIndexedRuns = (start, ...texts) => {
  let cursor = start;
  const elements = texts.map((content) => {
    const el = {
      startIndex: cursor,
      endIndex: cursor + content.length,
      textRun: { content },
    };
    cursor += content.length;
    return el;
  });
  return { startIndex: start, endIndex: cursor, paragraph: { elements } };
};

/** A non-text element (smart chip) occupying real index space. */
export const PRichLink = (start, title) => ({
  startIndex: start,
  endIndex: start + title.length,
  paragraph: {
    elements: [
      {
        startIndex: start,
        endIndex: start + title.length,
        richLink: { richLinkProperties: { title } },
      },
    ],
  },
});

/** Wraps rows in a one-table tab, WITHOUT adding header rows. */
export function makeRawTab(rows, title = "BUỔI 10 - Lesson") {
  return {
    tabProperties: { title, tabId: "t.x" },
    documentTab: {
      body: { content: [{ table: { tableRows: rows } }] },
    },
  };
}

// ---------------------------------------------------------------------------
// "III. BÀI TẬP VIẾT CÂU" — the exercise block added to BUỔI 04 → 10
// ---------------------------------------------------------------------------

/** Wraps already-built tables into a tab. */
export function makeTabFromTables(tables, title = "BUỔI 04 - Lesson") {
  return {
    tabProperties: { title, tabId: "t.x" },
    documentTab: {
      body: { content: tables.map((tableRows) => ({ table: { tableRows } })) },
    },
  };
}

/**
 * Dạng 1 (BUỔI 04/05/06): 4 columns, the "Thì" column MERGED vertically across
 * each tense group, and question numbering restarting at 1 inside every group.
 *
 * `mergeMode` reproduces the two ways the Google Docs API may report a row
 * covered by a vertical merge — as an empty placeholder cell, or by leaving the
 * cell out entirely. The question then sits in cell 1 or cell 0 respectively,
 * INSIDE THE SAME TABLE, which is exactly what defeats any fixed cell index.
 */
export function makeTranslationTable4Col({ mergeMode = "placeholder" } = {}) {
  const titleRow = row([P("Học viên dịch câu tiếng Việt sang tiếng Anh")]);
  const headerRow = row(
    [P("Thì")],
    [P("Tiếng Việt → Tiếng Anh")],
    [P("Gợi ý từ vựng")],
    [P("GV sửa")],
  );
  const ownerRow = (tense, question, answer, hint, fbIndex) =>
    row(
      [P(tense)],
      [P(`${question}\n`), P(`→ ${answer}\n`)],
      [P(hint)],
      [P("", fbIndex)],
    );
  const mergedRow = (question, answer, hint, fbIndex) => {
    const rest = [
      [P(`${question}\n`), P(`→ ${answer}\n`)],
      [P(hint)],
      [P("", fbIndex)],
    ];
    return mergeMode === "placeholder" ? row([], ...rest) : row(...rest);
  };

  return [
    titleRow,
    headerRow,
    ownerRow(
      "HTĐ",
      "1. Tôi học Tiếng Anh hàng ngày.",
      "I study English every day.",
      "learn (v) học",
      50,
    ),
    mergedRow(
      "2. Cô ấy đọc sách mỗi tối.",
      "She read books every evening.",
      "read (v) đọc",
      80,
    ),
    ownerRow(
      "HTTD",
      "1. Tôi đang học Tiếng Anh bây giờ.",
      "I am studying English now.",
      "now (adv)",
      110,
    ),
    mergedRow(
      "2. Cô ấy đang đọc sách bây giờ.",
      "She is reading a book now.",
      "book (n)",
      140,
    ),
  ];
}

/**
 * Dạng 2 (BUỔI 07/08/09/10): active → passive. Carries the "Học viên thành lập
 * công thức … bị động" band with its B1:/B2: row, which must NEVER be graded —
 * it has no numbered question, so the row-level rule drops it on its own.
 */
export function makePassiveTable() {
  return [
    row([P("Ví dụ: I am learning English → English is being learned by me")]),
    row(
      [P("HTĐ chủ động")],
      [P("Học viên thành lập công thức HTĐ bị động")],
      [P("GV sửa")],
    ),
    row([P("V (s/es)")], [P("B1:\nB2:\n")], [P("", 40)]),
    row([P("Câu Chủ động → Câu Bị động")], [P("Gợi ý")], [P("GV sửa")]),
    row(
      [
        P("1. The teacher checks the lesson every day.\n"),
        P("→ The lesson is check by the teacher.\n"),
      ],
      [P("")],
      [P("", 60)],
    ),
    row(
      [
        P("2. The students clean the classrooms every afternoon.\n"),
        P("→ The classrooms are cleaned by the students.\n"),
      ],
      [P("")],
      [P("", 90)],
    ),
  ];
}

/**
 * The legacy 3-column table every existing lesson still uses.
 *
 * `feedbackHeader` đổi được vì chính tên cột này quyết định bảng có được nhận
 * ra hay không, và nó ĐÃ từng bị gõ sai trong template thật ("Chữa phải" ở
 * buổi 14) — đủ để cả buổi im lặng không chấm cho mọi học viên.
 */
export function makeLegacyTable(feedback = "", feedbackHeader = "Chữa bài") {
  return [
    row([P("STT")], [P("Đề bài")], [P(feedbackHeader)]),
    row([P("")], [P("")], [P("")]),
    row(
      [P("1. Câu hỏi một\n"), P("→ My answer one\n")],
      [P("")],
      [P(feedback, 200)],
    ),
    row(
      [P("2. Câu hỏi hai\n"), P("→ My answer two\n")],
      [P("")],
      [P(feedback, 230)],
    ),
  ];
}

/** A reference/vocabulary table: numbered rows but NO feedback column. */
export function makeVocabTable() {
  return [
    row([P("Từ vựng")], [P("Nghĩa")]),
    row([P("1. learn")], [P("học")]),
    row([P("2. read")], [P("đọc")]),
  ];
}

/** The teacher's overall-comment table. */
export function makeOverallTable(startIndex = 300) {
  return [row([P("Nhận xét chung của Giáo viên:", startIndex)])];
}

/** Legacy layout whose first cell holds only the bare STT number. */
export function makeBareSttTable() {
  return [
    row([P("STT")], [P("Đề bài")], [P("Chữa bài")]),
    row([P("")], [P("")], [P("")]),
    row([P("1")], [P("Câu hỏi một\n"), P("→ My answer one\n")], [P("", 400)]),
  ];
}

/**
 * Tab → the tagged exercise rows every consumer now takes. Kept here so a test
 * never has to know which module resolves cells.
 */
export function rowsOf(tab) {
  return collectExerciseRows(tab).rows;
}

// ---------------------------------------------------------------------------
// "Bài tập viết đoạn văn" — buổi 02 → 23
// ---------------------------------------------------------------------------

/** One indexed paragraph per line, contiguous from `start`. */
const indexedLines = (text, start) => {
  let cursor = start;
  return String(text)
    .split("\n")
    .map((line) => {
      const content = `${line}\n`;
      const p = PIndexed(content, cursor);
      cursor += content.length;
      return p;
    });
};

/**
 * Bảng đoạn văn, dựng theo JSON thật của Docs API (đã dump từ template
 * "KTN Kaizen mới 20/9", buổi 02 → 23 đều y hệt):
 *
 *   row 0: [tiêu đề, columnSpan 2] [ô giữ chỗ, content = "\n"] [GV sửa]
 *   row 1: [Đoạn văn mẫu] [bài mẫu] ["\n"]
 *   row 2: [Học viên viết] [bài học viên] [ô ghi feedback]
 *
 * `mergeMode` phủ thêm hai cách khác Docs API có thể trả ô bị gộp:
 *   - "real"        ô giữ chỗ CÓ content (đúng như dump)
 *   - "placeholder" ô giữ chỗ KHÔNG có content
 *   - "omitted"     ô giữ chỗ bị lược hẳn khỏi tableCells
 */
export function makeParagraphTable({
  topic = "Hobbies",
  sample = "My favourite hobby is playing the guitar.\nI play it every weekend.",
  student = "",
  feedback = "",
  mergeMode = "real",
  at = 500,
} = {}) {
  const titleCell = {
    content: [PIndexed(`Bài tập viết đoạn văn: ${topic} \n`, at)],
    tableCellStyle: { columnSpan: 2 },
  };
  const header = { tableCells: [titleCell] };
  if (mergeMode === "real") {
    header.tableCells.push({ content: [PIndexed("\n", at + 40)] });
  } else if (mergeMode === "placeholder") {
    header.tableCells.push({});
  }
  header.tableCells.push({ content: [PIndexed("GV sửa\n", at + 42)] });

  const sampleRow = row(
    [PIndexed("Đoạn văn mẫu\n", at + 60)],
    indexedLines(sample, at + 80),
    [PIndexed("\n", at + 380)],
  );
  const studentRow = row(
    [PIndexed("Học viên viết\n", at + 400)],
    student ? indexedLines(student, at + 420) : [PIndexed("\n", at + 420)],
    feedback ? indexedLines(feedback, at + 900) : [PIndexed("\n", at + 900)],
  );
  return [header, sampleRow, studentRow];
}

/** Where the paragraph table's feedback cell starts, for a given `at`. */
export const paragraphFeedbackIndex = (at = 500) => at + 900;
