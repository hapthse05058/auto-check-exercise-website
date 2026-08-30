/**
 * Builds Google Docs batchUpdate requests that write AI feedback into the
 * "Chữa bài" column. Direct port of the extension logic (extension/popup.js).
 */
import {
  IS_CORRECT_ANSWER,
  containsCorrectMark,
  extractQuestionIndex,
  getTablesWhichContainStudentExercise,
  startsWithNumberDot,
} from "./docParser.js";
import { batchUpdateDoc } from "../api/googleDocs.js";

/** Parses the AI's markdown table response into {questionIndex, aiFeedback}. */
export function parseAiResponse(agentResponse) {
  const responseLines = agentResponse.split("\n");
  const results = [];
  for (const line of responseLines) {
    if (line.includes("|") && !line.includes("---")) {
      const cleanLine = line.trim().replace(/^\||\|$/g, "");
      const columns = cleanLine.split("|").map((col) => col.trim());
      if (
        columns.length >= 4 &&
        (columns[0] === "" || /^\d+$/.test(columns[0]))
      ) {
        results.push({
          questionIndex: columns[0],
          aiFeedback: columns[3],
        });
      }
    }
  }
  return results;
}

/** Generates the teacher's overall comment from the per-question results. */
export function generateOverallFeedback(gradingResults) {
  if (!gradingResults || gradingResults.length === 0) return "";
  const isAllCorrect = gradingResults.every(
    (item) => item.aiFeedback === IS_CORRECT_ANSWER,
  );
  // Case 1: everything correct.
  if (isAllCorrect) {
    return " Làm tốt lắm, hãy cố gắng phát huy phong độ này nhé!💯🔥";
  }
  const hasAnyCorrect = gradingResults.some(
    (item) => item.aiFeedback === IS_CORRECT_ANSWER,
  );
  // Case 2: nothing correct.
  if (!hasAnyCorrect) {
    return "  Cô đã chữa bài rồi, hãy rút kinh nghiệm và cố gắng hơn nữa nhé!🔥🔥";
  }
  const hasAnyWrong = gradingResults.some(
    (item) => item.aiFeedback !== IS_CORRECT_ANSWER && item.aiFeedback,
  );
  // Case 3: mixed results.
  if (hasAnyCorrect && hasAnyWrong) {
    return " Hãy rút kinh nghiệm và cố gắng hơn nữa nhé!🔥🔥";
  }
  return "";
}

// What may follow a reason: nothing (bar punctuation), or the next graded form.
const REASON_ENDS_TEXT = /^[.,;:!?\s]*$/;
const REASON_BEFORE_NEXT_FORM = /^[.,;:!?\s]*Câu (đơn|phức)\b/i;
// The "câu phức" half of a buổi 15/16/17 cell. The delimiter is only optional
// after "đúng là", which is unambiguous on its own — otherwise a bare
// explanation like "Câu phức là IC + DC, thiếu sub" would be split mid-sentence.
const COMPLEX_FORM_PREFIX =
  /^Câu[ \t]+phức(?:[ \t]+đúng[ \t]+là[ \t]*[:.\-–—]?|[ \t]*[:.\-–—])/i;

/** Index of the ")" closing the group opened at `start`, or -1 when unbalanced. */
function findGroupEnd(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Breaks the AI's one-line feedback into the lines the doc should show.
 *
 * Feedback always arrives on ONE line (it is a single Markdown table cell):
 * "<câu tiếng Anh đúng>. (giải thích lý do.)". A line break goes before:
 *   1. every top-level parenthetical acting as the reason — one that ends the
 *      text, or is followed by the next graded form. Trailing punctuation may
 *      sit inside OR outside the parentheses;
 *   2. the "Câu phức..." half of a buổi 15/16/17 cell.
 *
 * Both are only detected OUTSIDE parentheses, so a reason that happens to
 * mention "Câu phức" is never split. A break is skipped when nothing but
 * whitespace precedes it, so the cell never opens with a blank line.
 *
 * Left untouched: "✅ Đúng", feedback without a reason, and parentheses that
 * belong to the sentence itself (they are followed by more sentence text).
 */
export function formatFeedbackForDoc(feedback) {
  const text = String(feedback ?? "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  if (!text) return text;

  let result = "";
  let cursor = 0;
  // One left-to-right walk, so break positions come out in ascending order and
  // a single cursor is enough to reassemble the text.
  const breakHere = (i) => {
    const before = text.slice(cursor, i);
    if (!before.trim()) return; // nothing in front of it — no line to break
    result += `${before.replace(/\s+$/, "")}\n`;
    cursor = i;
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") {
      // Span the whole group so nested parentheses never shift the depth.
      const end = findGroupEnd(text, i);
      if (end === -1) break; // unbalanced: leave the remainder as-is
      const rest = text.slice(end + 1);
      if (REASON_ENDS_TEXT.test(rest) || REASON_BEFORE_NEXT_FORM.test(rest)) {
        breakHere(i);
      }
      i = end; // continue after this group either way
    } else if (
      (text[i] === "C" || text[i] === "c") &&
      COMPLEX_FORM_PREFIX.test(text.slice(i))
    ) {
      breakHere(i);
    }
  }

  if (!result) return text;
  return result + text.slice(cursor);
}

function setStyleForTeacherFeedBack(baseIndex, feedbackText, tabId) {
  return [
    {
      insertText: {
        location: { index: baseIndex, tabId: tabId },
        text: feedbackText,
      },
    },
  ];
}

/**
 * Splits text on **bold** markers and emits insertText + updateTextStyle
 * requests so only the bold spans are bold (italic/underline reset).
 */
export function createStyledTextRequests(text, baseIndex, tabId) {
  const requests = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let currentAbsoluteIndex = baseIndex;
  const resetFields = "bold,italic,underline";
  const stylesToApply = [];
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    const plainTextBefore = text.substring(lastIndex, match.index);
    const boldText = match[1];

    // Plain text before the bold span.
    if (plainTextBefore) {
      const start = currentAbsoluteIndex;
      const end = start + plainTextBefore.length;
      requests.push({
        insertText: {
          location: { index: start, tabId: tabId },
          text: plainTextBefore,
        },
      });
      stylesToApply.push({
        range: { startIndex: start, endIndex: end, tabId: tabId },
        textStyle: { bold: false, italic: false, underline: false },
      });
      currentAbsoluteIndex = end;
    }

    // The bold span itself.
    const boldStart = currentAbsoluteIndex;
    const boldEnd = boldStart + boldText.length;
    requests.push({
      insertText: {
        location: { index: boldStart, tabId: tabId },
        text: boldText,
      },
    });

    stylesToApply.push({
      range: { startIndex: boldStart, endIndex: boldEnd, tabId: tabId },
      textStyle: { bold: true, italic: false, underline: false },
    });

    currentAbsoluteIndex = boldEnd;
    lastIndex = boldRegex.lastIndex;
  }

  // Remaining plain text after the last bold span.
  const remainingText = text.substring(lastIndex);
  if (remainingText) {
    const finalStart = currentAbsoluteIndex;
    const finalEnd = finalStart + remainingText.length;
    requests.push({
      insertText: {
        location: { index: finalStart, tabId: tabId },
        text: remainingText.replaceAll(/\\n/g, ""),
      },
    });
    stylesToApply.push({
      range: { startIndex: finalStart, endIndex: finalEnd, tabId: tabId },
      textStyle: { bold: false, italic: false, underline: false },
    });
  }

  // All updateTextStyle requests go AFTER every insertText request.
  for (const style of stylesToApply) {
    requests.push({
      updateTextStyle: {
        range: style.range,
        textStyle: style.textStyle,
        fields: resetFields,
      },
    });
  }

  return requests;
}

/**
 * Builds the full batchUpdate request list for one student's doc: feedback
 * per answered question plus the overall teacher comment row.
 */
export function buildFeedbackRequests(
  gradingResults,
  exercise,
  tabId,
  tableIndex,
) {
  const contentContainer = getTablesWhichContainStudentExercise(
    exercise,
    tableIndex,
  );
  const groupedRequests = []; // request groups, one per graded question

  let currentRowPointer = 0;
  for (const item of gradingResults) {
    let feedbackText;
    let targetStartIndex = -1;

    for (let j = currentRowPointer; j < contentContainer.length; j++) {
      if (j === 1) {
        // Handle the last row to add the teacher's overall feedback.
        const row = contentContainer.at(-1);
        const firstCellText = row.tableCells[0].content
          .map((p) =>
            p?.paragraph?.elements
              ?.map((e) => e.textRun?.content || "")
              .join(""),
          )
          .join("")
          .trim();

        if (firstCellText.includes("Nhận xét chung của Giáo viên")) {
          const targetCell = row.tableCells[0];
          targetStartIndex =
            targetCell.content[0].startIndex + firstCellText.length;
          feedbackText = generateOverallFeedback(gradingResults);
          if (targetStartIndex !== -1) {
            const styledReqs = setStyleForTeacherFeedBack(
              targetStartIndex,
              feedbackText,
              tabId,
            );
            groupedRequests.push({
              startIndex: targetStartIndex,
              subRequests: styledReqs,
            });
          }
        }
      } else {
        const row = contentContainer[j];
        const firstCellText = row.tableCells[0].content
          .map((p) =>
            p?.paragraph?.elements
              ?.map((e) => e.textRun?.content || "")
              .join(""),
          )
          .join("")
          .trim();

        // Same numbering rule as the parser, so a question we could READ is a
        // question we can WRITE back to — including "7 ." and "7)".
        if (
          firstCellText === item.questionIndex ||
          extractQuestionIndex(firstCellText) === item.questionIndex
        ) {
          // Buổi 15/16/17 grade two forms in one cell, so a ✅ on one of them
          // must NOT collapse the whole cell (that would drop the correction).
          const isDualSentenceFeedback = /Câu (đơn|phức)/i.test(
            item.aiFeedback,
          );
          feedbackText =
            !isDualSentenceFeedback && containsCorrectMark(item.aiFeedback)
              ? IS_CORRECT_ANSWER
              : item.aiFeedback;
          const cellIndex = row.tableCells.length - 1;
          const targetCell = row.tableCells[cellIndex];

          // Safe startIndex (inside the cell's first paragraph).
          targetStartIndex = targetCell.content[0].startIndex;
          currentRowPointer = j + 1;
          break;
        }
      }
    }

    if (targetStartIndex !== -1 && feedbackText !== undefined) {
      // Newlines are kept on purpose: formatFeedbackForDoc puts the reason on
      // its own line, and the Docs API counts "\n" as a single index unit.
      const styledReqs = createStyledTextRequests(
        feedbackText,
        targetStartIndex,
        tabId,
      );
      groupedRequests.push({
        startIndex: targetStartIndex,
        subRequests: styledReqs,
      });
    }
  }

  // Apply groups bottom-up so earlier inserts don't shift later indexes.
  groupedRequests.sort((a, b) => b.startIndex - a.startIndex);

  return groupedRequests.flatMap((group) => group.subRequests);
}

/**
 * Writes pre-computed grading results into the student's Google Doc.
 * `gradingResults` is `[{questionIndex, aiFeedback}]` in doc (question) order;
 * each row is targeted by its questionIndex, which is unique within the doc.
 * `student` carries {docId, tabId, exercise}; `tableIndex` locates the
 * exercise tables for the lesson/class type.
 */
export async function writeGradingResultsToDoc(
  gradingResults,
  student,
  accessToken,
  tableIndex,
) {
  if (!gradingResults || gradingResults.length === 0) return;
  try {
    const finalRequests = buildFeedbackRequests(
      gradingResults,
      student.exercise,
      student.tabId,
      tableIndex,
    );

    if (finalRequests.length > 0) {
      await batchUpdateDoc(student.docId, finalRequests, accessToken);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Clearing feedback back out of a doc (admin "Xóa feedback")
// ---------------------------------------------------------------------------

/**
 * The one literal marker in the layout. `buildFeedbackRequests` appends the
 * overall comment right after it, so clearing means cutting everything that
 * follows it while leaving the label itself in place.
 */
export const OVERALL_FEEDBACK_LABEL = "Nhận xét chung của Giáo viên";

/**
 * A cell's paragraph elements with the index range Docs reported for each one.
 *
 * Ranges are built ONLY from these API-provided indexes — never by adding a
 * character offset to a container's startIndex, which silently drifts as soon
 * as a cell holds a smart chip or several runs. Elements without a range cannot
 * be located, so they are dropped rather than guessed at.
 *
 * `text` is null for anything that is not a plain text run (richLink, person):
 * such an element still occupies index space but its length cannot be derived
 * from a string, so callers must refuse to do offset arithmetic across it.
 */
function cellElements(cell) {
  return (cell?.content || [])
    .flatMap((entry) => entry?.paragraph?.elements || [])
    .filter((el) => el?.startIndex !== undefined && el?.endIndex !== undefined)
    .map((el) => ({
      start: el.startIndex,
      end: el.endIndex,
      text: el.textRun?.content ?? null,
    }));
}

/**
 * Range covering everything from `els[fromIndex]` to the end of the cell, minus
 * the ONE trailing newline that terminates it — Docs rejects deleting that one.
 *
 * Every other newline is included on purpose: feedback arrives with "\n" in it
 * (formatFeedbackForDoc puts the reason on its own line), and an insertText
 * carrying "\n" splits the cell into extra paragraphs. Those breaks have to go
 * too, or a cleared cell keeps the height of the feedback it used to hold.
 */
function textRange(els, fromIndex = 0) {
  const slice = els.slice(fromIndex);
  if (!slice.length) return null;
  const last = slice.at(-1);
  // Exactly one, not /\n+$/: in "abc\n\n" the first newline is a paragraph
  // break that should go; only the very last one terminates the cell.
  const keep = last.text?.endsWith("\n") ? 1 : 0;
  return { start: slice[0].start, end: last.end - keep };
}

/**
 * Range starting just past the overall-comment label. `labelEnd` is an offset
 * into the cell's concatenated text; it is resolved to (the element holding it)
 * + (the offset WITHIN that element), so the only arithmetic happens inside a
 * single text run, where endIndex - startIndex === content.length holds exactly
 * (UTF-16 units, so surrogate pairs like 💯 stay aligned).
 *
 * Returns null when the label lands in a non-text element, or when nothing but
 * whitespace follows it — a cell already cleared must produce no request at all.
 */
function rangeAfterLabel(els, labelEnd) {
  let seen = 0;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.text === null) return null; // cannot map characters — do not guess
    const next = seen + el.text.length;
    if (labelEnd <= next) {
      const rest =
        el.text.slice(labelEnd - seen) +
        els
          .slice(i + 1)
          .map((e) => e.text ?? "")
          .join("");
      if (!rest.trim()) return null; // nothing appended yet
      const tail = textRange(els, i);
      const start = el.start + (labelEnd - seen);
      return tail && start < tail.end ? { start, end: tail.end } : null;
    }
    seen = next;
  }
  return null;
}

/**
 * batchUpdate requests that strip what grading wrote into one lesson tab: the
 * "Chữa bài" cell of every numbered row, plus whatever was appended after the
 * overall-comment label.
 *
 * Scoping to a single lesson is the CALLER's job — it passes the tab found by
 * title, so other lessons in the same document are never touched.
 *
 * A row only produces a request when its target cell actually holds text, so
 * running this twice is a genuine no-op: the second pass returns [] and the
 * caller skips the API call entirely.
 *
 * Verified against a live document before this was written (see the plan's
 * "Bước 0"): paragraph elements carry startIndex/endIndex, endIndex - startIndex
 * equals content.length, and one deleteContentRange may span paragraph breaks
 * inside a cell.
 */
export function buildClearFeedbackRequests(exercise, tabId, tableIndex) {
  const rows = getTablesWhichContainStudentExercise(exercise, tableIndex) || [];
  const ranges = [];

  for (const row of rows) {
    const cells = row.tableCells || [];
    if (!cells.length) continue;

    const headEls = cellElements(cells[0]);
    const headText = headEls.map((e) => e.text ?? "").join("");

    // The overall-comment row is checked FIRST: it is often a single merged
    // cell, so the "needs a last column" rule below would skip it.
    const at = headText.indexOf(OVERALL_FEEDBACK_LABEL);
    if (at !== -1) {
      let labelEnd = at + OVERALL_FEEDBACK_LABEL.length;
      // The ":" after the label is the document template's own punctuation, not
      // something grading appended (it writes AFTER the existing text). Keeping
      // it is what makes a re-run on a cleared cell produce nothing at all.
      if (headText[labelEnd] === ":") labelEnd += 1;
      const r = rangeAfterLabel(headEls, labelEnd);
      if (r) ranges.push(r);
      continue;
    }

    // Feedback lives in the LAST cell, so a one-cell row has nowhere to hold it.
    if (cells.length < 2) continue;
    // Same rule the parser and wasExerciseReviewedByAI use to spot a question.
    if (!startsWithNumberDot(headText)) continue;

    const els = cellElements(cells.at(-1));
    if (!els.some((e) => (e.text ?? "").trim())) continue; // already empty
    const r = textRange(els);
    if (r && r.end > r.start) ranges.push(r);
  }

  // Delete bottom-up so each range's indexes are still valid when it runs:
  // removing a later range never shifts an earlier one. Same reasoning as the
  // insert path above, and the ranges are disjoint, so one global sort is
  // enough regardless of which cell or column they came from.
  return ranges
    .sort((a, b) => b.start - a.start)
    .map((r) => ({
      deleteContentRange: {
        range: { startIndex: r.start, endIndex: r.end, tabId },
      },
    }));
}
