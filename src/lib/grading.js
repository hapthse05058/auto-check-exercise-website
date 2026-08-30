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
  consumeDocPoints,
  fetchPayerPoint,
  fetchStudentDocRefs,
  gradeAnswers,
  recordGradingSummary,
} from "../api/backend.js";
import { getTabContent } from "../api/googleDocs.js";
import { ensureValidGoogleToken } from "../auth/tokens.js";

/** Student docs written in parallel within one chunk. */
const CONCURRENCY_LIMIT = 5;

/**
 * Docs billed per charge. Every charge hits the same TeacherPoint document, so
 * pairing them halves that write pressure; the cost is that a run cancelled
 * mid-pair leaves at most ONE written doc unpaid.
 */
const CHARGE_BATCH_SIZE = 2;

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Which docs an action applies to: the pasted links when the textarea has any,
 * otherwise every student saved on the class. Shared with the feedback-clearing
 * flow so both act on exactly the same set.
 */
export async function resolveDocRefs(docLinksText, classId) {
  const trimmed = (docLinksText || "").trim();
  return trimmed ? parseDocLinks(trimmed) : fetchStudentDocRefs(classId);
}

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
  lessonId,
  onStatus,
  useCache = true,
  isAdmin = false,
  t = (key) => key, // translator from the caller (GradePage)
}) {
  const links = await resolveDocRefs(docLinksText, classId);
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

  await autoCheckExercises({
    studentsExerciseList,
    tableIndex,
    onStatus,
    classId,
    lessonId,
    useCache,
    isAdmin,
    t,
  });
  return true;
}

async function autoCheckExercises({
  studentsExerciseList,
  tableIndex,
  onStatus,
  classId,
  lessonId,
  useCache = true,
  isAdmin = false,
  t = (key) => key,
}) {
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

  // 1b. Point gate: 1 point per doc that still needs grading. `pending` is
  //     already filtered by wasExerciseReviewedByAI, so it is exactly the
  //     number of docs about to be written — and the number of points to spend.
  //     The payer is the CLASS's teacher, which is not the caller when an admin
  //     is grading, so admins are gated too. Nothing has been written yet, so
  //     stopping here costs nothing.
  let payer;
  try {
    payer = await fetchPayerPoint(classId);
  } catch (err) {
    console.error(err);
    onStatus.set(t("grading.pointCheckFailed"));
    return;
  }
  if (pending.length > payer.point) {
    onStatus.set(
      t("grading.notEnough", {
        need: pending.length,
        have: payer.point,
        teacher: payer.teacherName,
      }),
    );
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
    graded = await gradeAnswers(studentAnswerArr, {
      useCache,
      classId,
      lessonId,
      pendingCount: pending.length,
    });
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
  const chunks = chunkArray(pending, CONCURRENCY_LIMIT);
  let totalCharged = 0; // points actually spent, for the run's audit line
  let stopped = false; // the payer ran out mid-run — stop writing more docs
  const unbilled = []; // written, waiting for a pair to complete
  const unsettled = []; // a charge failed; retried at the end of the run

  // Every charge lands on the SAME TeacherPoint document, and Firestore only
  // sustains ~1 write/sec per document. Funnel charges through one chain so at
  // most one is ever in flight, even though 5 docs are written in parallel.
  let chargeTail = Promise.resolve();
  const enqueueCharge = (task) => {
    const run = chargeTail.then(task, task);
    chargeTail = run.catch(() => {});
    return run;
  };

  /**
   * Settles `docIds`, retrying once. Retrying is safe because the backend keys
   * a ledger receipt per doc: a repeat call for a doc that was already charged
   * bills nothing.
   */
  async function chargeDocs(docIds) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { charged = 0, point } = await consumeDocPoints({
          classId,
          docIds,
          lessonId,
        });
        totalCharged += charged;
        if (charged > 0) {
          onStatus.append(
            t("grading.spentBatch", { n: charged, remaining: point }),
          );
        }
        return;
      } catch (err) {
        if (err.message === "INSUFFICIENT_POINTS") {
          stopped = true;
          onStatus.append(t("grading.stoppedNoPoints"));
          return;
        }
        console.error(err);
        if (attempt === 1) {
          unsettled.push(...docIds);
          onStatus.append(
            t("grading.chargeFailed", { list: docIds.join(", ") }),
          );
        }
      }
    }
  }

  /** Records a written doc and bills as soon as a pair is complete. */
  function noteWritten(docId) {
    unbilled.push(docId);
    // Out of points already: hold the doc back rather than firing a charge that
    // can only fail again. It is reported as unsettled at the end of the run.
    if (stopped) return Promise.resolve();
    if (unbilled.length < CHARGE_BATCH_SIZE) return Promise.resolve();
    // splice() runs before any await, so two docs finishing at the same moment
    // can never grab the same pair.
    const pair = unbilled.splice(0, CHARGE_BATCH_SIZE);
    return enqueueCharge(() => chargeDocs(pair));
  }

  try {
    for (const chunk of chunks) {
      if (stopped) break;
      // Writing to the doc needs a REAL Google token, not the JWT.
      const googleToken = await ensureValidGoogleToken();
      await Promise.all(
        chunk.map(async ({ quesAndAnsArr, student }) => {
          if (stopped) return;
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
            onStatus.append(t("grading.wrote", { docId: student.docId }));
            // Bill immediately. From here on, a run that is cancelled (tab
            // closed, network lost) leaves at most ONE written doc unpaid
            // instead of the whole class.
            await noteWritten(student.docId);
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

  // Settle the leftovers OUTSIDE the loop's try/catch, so an error mid-run can
  // never skip them: the odd doc of an incomplete pair, then a retry of any
  // charge that failed. Skipped once the payer is out of points — another
  // charge would only fail the same way.
  if (!stopped && unbilled.length) {
    const rest = unbilled.splice(0, unbilled.length);
    await enqueueCharge(() => chargeDocs(rest));
  }
  if (!stopped && unsettled.length) {
    for (const batch of chunkArray(
      unsettled.splice(0, unsettled.length),
      CHARGE_BATCH_SIZE,
    )) {
      await enqueueCharge(() => chargeDocs(batch));
    }
  }
  const leftover = [...unbilled, ...unsettled];
  if (leftover.length) {
    onStatus.append(t("grading.unsettled", { list: leftover.join(", ") }));
  }

  // One audit line for the whole run. The per-doc money trail is the backend's
  // TeacherPointLedger, so the individual charges are not audited.
  if (totalCharged > 0) {
    await recordGradingSummary({
      classId,
      lessonId,
      totalPoints: totalCharged,
    });
  }

  onStatus.append(t("grading.complete"));
}
