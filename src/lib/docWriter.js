/**
 * Builds Google Docs batchUpdate requests that write AI feedback into the
 * "Chữa bài" column. Direct port of the extension logic (extension/popup.js).
 */
import {
  IS_CORRECT_ANSWER,
  containsCorrectMark,
  extractQuestionIndex,
  getTablesWhichContainStudentExercise,
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
