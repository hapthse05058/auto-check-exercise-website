/**
 * End-to-end grading pipeline: fetch each student's doc tab, extract the
 * answered part-IV questions, send them to the AI grader, and write the
 * feedback back into the doc. Port of processDocs/autoCheckExercises from
 * extension/popup.js.
 */
import { fetchStudentDocRefs, gradeAnswers } from "../api/backend.js";
import { getTabContent } from "../api/googleDocs.js";
import { ensureValidGoogleToken } from "../auth/tokens.js";
import {
  extractQuestionIndex,
  getQesAndAnsFromPartIVOfTheTargetTab,
  makeAnswerKey,
  parseDocLinks,
  wasExerciseReviewedByAI,
} from "./docParser.js";
import { getTableIndexOfExercise } from "./docTables.js";
import { writeGradingResultsToDoc } from "./docWriter.js";

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Processes all docs for a lesson.
 *
 * @param {object} params
 * @param {string} params.docLinksText  Raw textarea content (may be empty).
 * @param {string} params.classId       Selected class id.
 * @param {string} params.classType     Selected class type code.
 * @param {string} params.lessonName    Selected lesson name ("BUỔI XX ...").
 * @param {object} params.onStatus      {set(text), append(text)} UI reporter.
 * @returns {boolean} false when there was nothing to process.
 */
export async function processDocs({
  docLinksText,
  classId,
  classType,
  lessonName,
  onStatus,
  useCache = true,
  isAdmin = false,
}) {
  let links = [];
  const trimmed = (docLinksText || "").trim();
  if (trimmed) {
    links = parseDocLinks(trimmed);
  } else {
    links = await fetchStudentDocRefs(classId);
  }
  if (!links.length) {
    alert("No student documents found for this class.");
    return false;
  }

  let accessToken;
  let tableIndex = [];
  const studentsExerciseList = [];
  for (const student of links) {
    onStatus.set(`Processing Doc: ${student.docId}...`);
    try {
      // The Google Docs API needs a REAL Google token, not the backend JWT.
      // Re-check before every call: long doc lists can outlive a token.
      accessToken = await ensureValidGoogleToken();

      const doc = await getTabContent(
        student.docId,
        accessToken,
        lessonName,
        onStatus,
      );
      if (!doc) continue;
      student.exercise = doc;
      student.tabId = doc.tabProperties.tabId;
      if (!tableIndex.length) {
        tableIndex = getTableIndexOfExercise(doc.tabProperties.title, classType);
      }
      const quesAndAnsArr = getQesAndAnsFromPartIVOfTheTargetTab(doc, tableIndex);
      if (quesAndAnsArr && quesAndAnsArr.length > 0) {
        studentsExerciseList.push({
          quesAndAnsArr: quesAndAnsArr,
          student: student,
        });
      }
    } catch (err) {
      console.error(err);
      onStatus.set(`Failed ${student.docId}: ${err.message}`);
    }
  }
  if (studentsExerciseList.length) {
    onStatus.set(
      "Finished fetching content from all docs. Starting auto-check...",
    );
  }

  await autoCheckExercises(studentsExerciseList, tableIndex, onStatus, useCache);
  return true;
}

async function autoCheckExercises(
  studentsExerciseList,
  tableIndex,
  onStatus,
  useCache = true,
) {
  if (!studentsExerciseList.length) return;

  // 1. Skip docs that were already graded; only work on the rest.
  const pending = [];
  for (const item of studentsExerciseList) {
    if (wasExerciseReviewedByAI(item.student.exercise, tableIndex)) {
      onStatus.append(
        `\n This exercise has been checked: ${item.student.docId}. Skip checking it again...`,
      );
    } else {
      pending.push(item);
    }
  }
  if (!pending.length) {
    onStatus.append("\n All docs were already checked. Nothing to grade.");
    return;
  }

  // 2. Gather every answer across the class and DEDUPE by (question, answer).
  //    Identical answers (within the class and across past runs via the cache)
  //    are graded only once.
  const uniqueAnswers = new Map(); // key -> {question, answer}
  for (const { quesAndAnsArr } of pending) {
    for (const qa of quesAndAnsArr) {
      const key = makeAnswerKey(qa.question, qa.answer);
      if (!uniqueAnswers.has(key)) {
        uniqueAnswers.set(key, { question: qa.question, answer: qa.answer });
      }
    }
  }
  const studentAnswerArr = [...uniqueAnswers.values()];
  if (!studentAnswerArr.length) {
    onStatus.append("\n No answered questions found to grade.");
    return;
  }

  // 3. Grade on the backend (gradingCache lookup + AI for misses, unless
  //    caching is disabled — then every answer goes straight to the AI).
  if (isAdmin) {
    onStatus.set(
      `Grading ${studentAnswerArr.length} unique answers${useCache ? "" : " (cache off)"}...`,
    );
  } else {
    onStatus.set("Grading answers...");
  }
  let graded;
  try {
    graded = await gradeAnswers(studentAnswerArr, useCache);
  } catch (err) {
    console.error(err);
    onStatus.set(`Grading failed: ${err.message}`);
    return;
  }

  // 4. Map feedback back by the SAME (question, answer) key.
  const feedbackByKey = new Map();
  for (const g of graded) {
    if (g && g.feedback != null) {
      feedbackByKey.set(makeAnswerKey(g.question, g.answer), g.feedback);
    }
  }

  // 5. Write each pending student's feedback into their doc, targeting rows by
  //    question index (unique within a doc). Never guess: an answer without a
  //    matched feedback or a parseable index is skipped.
  const CONCURRENCY_LIMIT = 5;
  const chunks = chunkArray(pending, CONCURRENCY_LIMIT);
  try {
    for (const chunk of chunks) {
      // Writing to the doc needs a REAL Google token, not the JWT.
      const googleToken = await ensureValidGoogleToken();
      await Promise.all(
        chunk.map(async ({ quesAndAnsArr, student }) => {
          const gradingResults = [];
          for (const qa of quesAndAnsArr) {
            const feedback = feedbackByKey.get(makeAnswerKey(qa.question, qa.answer));
            const questionIndex = extractQuestionIndex(qa.question);
            if (feedback != null && questionIndex != null) {
              gradingResults.push({ questionIndex, aiFeedback: feedback });
            }
          }
          if (!gradingResults.length) {
            onStatus.append(
              `\n No feedback matched for ${student.docId}, skipping.`,
            );
            return;
          }
          try {
            await writeGradingResultsToDoc(
              gradingResults,
              student,
              googleToken,
              tableIndex,
            );
            onStatus.append(`\n Wrote feedback to ${student.docId}.`);
          } catch (err) {
            console.error(err);
            onStatus.append(
              `\n Failed writing to ${student.docId}: ${err.message}`,
            );
          }
        }),
      );
      onStatus.append(`\n Complete handling ${chunk.length} doc, continue...`);
    }
    // Celebrate!
    const sound = new Audio("/successful_sound.mp3");
    await sound.play().catch((err) => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("AutoCheck Error:", err);
  }
  onStatus.append(
    `\n Processing complete!\nGrading student's exercises completed! You can review the result!!`,
  );
}
