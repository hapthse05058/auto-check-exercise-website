/**
 * End-to-end grading pipeline: fetch each student's doc tab, extract the
 * answered part-IV questions, send them to the AI grader, and write the
 * feedback back into the doc. Port of processDocs/autoCheckExercises from
 * extension/popup.js.
 */
import {
  extractQuestionIndex,
  getQesAndAnsFromPartIVOfTheTargetTab,
  getUnreadableQuestions,
  makeAnswerKey,
  parseDocLinks,
  wasExerciseReviewedByAI,
} from "./docParser.js";
import { getTableIndexOfExercise } from "./docTables.js";
import { formatFeedbackForDoc, writeGradingResultsToDoc } from "./docWriter.js";
import {
  consumePoints,
  fetchMyPoint,
  fetchStudentDocRefs,
  gradeAnswers,
} from "../api/backend.js";
import { getTabContent } from "../api/googleDocs.js";
import { ensureValidGoogleToken } from "../auth/tokens.js";

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
  t = (key) => key, // translator from the caller (GradePage)
}) {
  let links = [];
  const trimmed = (docLinksText || "").trim();
  if (trimmed) {
    links = parseDocLinks(trimmed);
  } else {
    links = await fetchStudentDocRefs(classId);
  }
  if (!links.length) {
    alert(t("grading.noDocs"));
    return false;
  }

  let accessToken;
  let tableIndex = [];
  const studentsExerciseList = [];
  for (const student of links) {
    onStatus.set(t("grading.processingDoc", { docId: student.docId }));
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
        tableIndex = getTableIndexOfExercise(
          doc.tabProperties.title,
          classType,
        );
      }
      const quesAndAnsArr = getQesAndAnsFromPartIVOfTheTargetTab(
        doc,
        tableIndex,
      );
      if (quesAndAnsArr && quesAndAnsArr.length > 0) {
        studentsExerciseList.push({
          quesAndAnsArr: quesAndAnsArr,
          student: student,
        });
      }
      // Rows holding text we could not turn into an answer are skipped, not
      // guessed at — tell the teacher so they can check those by hand.
      const unreadable = getUnreadableQuestions(doc, tableIndex);
      if (unreadable.length) {
        onStatus.append(
          t("grading.unreadableAnswers", {
            docId: student.docId,
            list: unreadable.join(", "),
          }),
        );
      }
    } catch (err) {
      console.error(err);
      onStatus.set(
        t("grading.failedDoc", { docId: student.docId, msg: err.message }),
      );
    }
  }
  if (studentsExerciseList.length) {
    onStatus.set(t("grading.finishedFetch"));
  }

  await autoCheckExercises(
    studentsExerciseList,
    tableIndex,
    onStatus,
    useCache,
    isAdmin,
    t,
  );
  return true;
}

async function autoCheckExercises(
  studentsExerciseList,
  tableIndex,
  onStatus,
  useCache = true,
  isAdmin = false,
  t = (key) => key,
) {
  if (!studentsExerciseList.length) return;

  // 1. Skip docs that were already graded; only work on the rest.
  const pending = [];
  for (const item of studentsExerciseList) {
    if (wasExerciseReviewedByAI(item.student.exercise, tableIndex)) {
      onStatus.append(
        t("grading.alreadyChecked", { docId: item.student.docId }),
      );
    } else {
      pending.push(item);
    }
  }
  if (!pending.length) {
    onStatus.append(t("grading.allChecked"));
    return;
  }

  // 1b. Point gate (non-admins only): block the whole batch when the teacher
  //     doesn't have enough points for every pending doc (1 point per doc).
  if (!isAdmin) {
    let balance = 0;
    try {
      balance = await fetchMyPoint();
    } catch (err) {
      console.error(err);
      onStatus.set(t("grading.pointCheckFailed"));
      return;
    }
    if (balance < pending.length) {
      onStatus.set(
        t("grading.notEnough", { need: pending.length, have: balance }),
      );
      return;
    }
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
    onStatus.append(t("grading.noAnswers"));
    return;
  }

  // 3. Grade on the backend (gradingCache lookup + AI for misses, unless
  //    caching is disabled — then every answer goes straight to the AI).
  if (isAdmin) {
    onStatus.set(
      t("grading.gradingN", {
        n: studentAnswerArr.length,
        cache: useCache ? "" : t("grading.cacheOff"),
      }),
    );
  } else {
    onStatus.set(t("grading.gradingAnswers"));
  }
  let graded;
  try {
    graded = await gradeAnswers(studentAnswerArr, useCache);
  } catch (err) {
    console.error(err);
    onStatus.set(t("grading.gradingFailed", { msg: err.message }));
    return;
  }

  // 4. Map feedback back by the SAME (question, answer) key. The AI answers on
  //    a single line (one Markdown table cell); formatFeedbackForDoc moves the
  //    "(giải thích lý do.)" part onto its own line before it reaches the doc.
  //    Cached feedback goes through this too, so old entries also get the
  //    line break without being re-graded.
  const feedbackByKey = new Map();
  for (const g of graded) {
    if (g && g.feedback !== null && g.feedback !== undefined) {
      feedbackByKey.set(
        makeAnswerKey(g.question, g.answer),
        formatFeedbackForDoc(g.feedback),
      );
    }
  }

  // 5. Write each pending student's feedback into their doc, targeting rows by
  //    question index (unique within a doc). Never guess: an answer without a
  //    matched feedback or a parseable index is skipped.
  const CONCURRENCY_LIMIT = 5;
  const chunks = chunkArray(pending, CONCURRENCY_LIMIT);
  let successCount = 0; // student docs whose feedback was written (= points spent)
  try {
    for (const chunk of chunks) {
      // Writing to the doc needs a REAL Google token, not the JWT.
      const googleToken = await ensureValidGoogleToken();
      await Promise.all(
        chunk.map(async ({ quesAndAnsArr, student }) => {
          const gradingResults = [];
          for (const qa of quesAndAnsArr) {
            const feedback = feedbackByKey.get(
              makeAnswerKey(qa.question, qa.answer),
            );
            const questionIndex = extractQuestionIndex(qa.question);
            if (
              feedback !== null &&
              feedback !== undefined &&
              questionIndex !== null &&
              questionIndex !== undefined
            ) {
              gradingResults.push({ questionIndex, aiFeedback: feedback });
            }
          }
          if (!gradingResults.length) {
            onStatus.append(t("grading.noMatch", { docId: student.docId }));
            return;
          }
          try {
            await writeGradingResultsToDoc(
              gradingResults,
              student,
              googleToken,
              tableIndex,
            );
            successCount += 1; // 1 point will be spent for this doc
            onStatus.append(t("grading.wrote", { docId: student.docId }));
          } catch (err) {
            console.error(err);
            onStatus.append(
              t("grading.failedWrite", {
                docId: student.docId,
                msg: err.message,
              }),
            );
          }
        }),
      );
      onStatus.append(t("grading.completeChunk", { n: chunk.length }));
    }
    // Celebrate!
    const sound = new Audio("/successful_sound.mp3");
    await sound
      .play()
      .catch((err) => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("AutoCheck Error:", err);
  }

  // Spend 1 point per successfully written doc (non-admins only).
  if (!isAdmin && successCount > 0) {
    try {
      const remaining = await consumePoints(successCount);
      onStatus.append(t("grading.spent", { n: successCount, remaining }));
    } catch (err) {
      console.error("Consume points failed:", err);
    }
  }

  onStatus.append(t("grading.complete"));
}
