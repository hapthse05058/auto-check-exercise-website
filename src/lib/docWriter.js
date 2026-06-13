/**
 * Builds Google Docs batchUpdate requests that write AI feedback into the
 * "Chữa bài" column. Direct port of the extension logic (extension/popup.js).
 */
import { batchUpdateDoc } from "../api/googleDocs.js";
import {
  IS_CORRECT_ANSWER,
  containsCorrectMark,
  getTablesWhichContainStudentExercise,
} from "./docParser.js";

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
export function buildFeedbackRequests(gradingResults, exercise, tabId, tableIndex) {
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
            p?.paragraph?.elements?.map((e) => e.textRun?.content || "").join(""),
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
            p?.paragraph?.elements?.map((e) => e.textRun?.content || "").join(""),
          )
          .join("")
          .trim();

        if (
          firstCellText === item.questionIndex ||
          firstCellText.startsWith(`${item.questionIndex}.`)
        ) {
          feedbackText = containsCorrectMark(item.aiFeedback)
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
      const styledReqs = createStyledTextRequests(
        feedbackText.replace(/\n/g, ""),
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
 * Writes the AI feedback into the student's Google Doc.
 * `student` carries {docId, tabId, exercise}; `tableIndex` locates the
 * exercise tables for the lesson/class type.
 */
export async function writeToGGDocFile(
  agentResponse,
  student,
  accessToken,
  tableIndex,
) {
  try {
    const gradingResults = parseAiResponse(agentResponse);
    if (gradingResults.length === 0) return;

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
