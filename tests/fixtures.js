/** Shared synthetic Google Doc structures for tests. */

/** Paragraph with a single text run. */
export const P = (text, startIndex = 1) => ({
  paragraph: { elements: [{ textRun: { content: text } }] },
  startIndex,
});

export const row = (...cells) => ({
  tableCells: cells.map((content) => ({ content })),
});

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
          { table: { tableRows: [headerRow1, headerRow2, q1, q2, overallRow] } },
        ],
      },
    },
  };
}
