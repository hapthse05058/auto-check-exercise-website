/**
 * End-to-end grading pipeline: fetch each student's doc tab, extract the
 * answered part-IV questions, send them to the AI grader, and write the
 * feedback back into the doc. Port of processDocs/autoCheckExercises from
 * extension/popup.js.
 *
 * Nothing here touches the UI. A run reports itself once, through the value it
 * returns — the screen only shows a spinner while it is in flight, so streaming
 * per-doc progress would be text written and never read.
 */
import {
  describeGradedState,
  extractQuestionIndex,
  getQuesAndAnsFromRows,
  getUnreadableQuestions,
  makeAnswerKey,
  parseDocLinks,
} from "./docParser.js";
import { collectExerciseRows } from "./docTableDetect.js";
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
 * @param {Function} params.t           Translator from the caller (GradePage).
 * @returns {Promise<{graded: number, warnings: string[], error: ?string,
 *                    notice: ?string}>}
 *   `graded` is how many students were actually written to. `error` is set when
 *   something stopped the whole run, `notice` when there was simply nothing to
 *   do, and `warnings` holds per-doc problems that did not stop the run. Every
 *   string is already translated.
 */
export async function processDocs({
  docLinksText,
  classId,
  classType,
  lessonName,
  lessonId,
  useCache = true,
  t = (key) => key, // translator from the caller (GradePage)
}) {
  const warnings = [];
  const warn = (text) => warnings.push(text);

  const links = await resolveDocRefs(docLinksText, classId);
  if (!links.length) {
    alert(t("grading.noDocs"));
    return { graded: 0, warnings, error: null, notice: null };
  }

  let accessToken;
  const studentsExerciseList = [];
  for (const student of links) {
    try {
      // The Google Docs API needs a REAL Google token, not the backend JWT.
      // Re-check before every call: long doc lists can outlive a token.
      accessToken = await ensureValidGoogleToken();

      const doc = await getTabContent(student.docId, accessToken, lessonName);
      if (!doc) {
        // Either the doc has no tab for this lesson or the fetch failed. Both
        // leave this student ungraded, so say so; details go to the console.
        warn(t("grading.tabMissing", { docId: student.docId }));
        continue;
      }
      student.exercise = doc;
      student.tabId = doc.tabProperties.tabId;
      // Nhận diện lại theo TỪNG doc: vị trí bảng có thể khác nhau giữa các học
      // sinh, nên không được tính một lần từ doc đầu rồi dùng cho cả lớp.
      const { rows, unclassifiedWithQuestions } = collectExerciseRows(
        doc,
        classType,
      );
      student.rows = rows;

      if (!rows.length) {
        warn(t("grading.noTable", { docId: student.docId }));
        continue;
      }
      // Bảng đầy câu hỏi mà không nhận ra được loại thì phải BÁO. Im lặng chính
      // là thứ đã khiến buổi 06/07/08 chấm không ra gì suốt nhiều tháng.
      if (unclassifiedWithQuestions.length) {
        warn(
          t("grading.unclassifiedTable", {
            docId: student.docId,
            list: unclassifiedWithQuestions.map((i) => i + 1).join(", "),
          }),
        );
      }

      const quesAndAnsArr = getQuesAndAnsFromRows(rows);
      if (quesAndAnsArr && quesAndAnsArr.length > 0) {
        studentsExerciseList.push({
          quesAndAnsArr: quesAndAnsArr,
          student: student,
        });
      }
      // Rows holding text we could not turn into an answer are skipped, not
      // guessed at — tell the teacher so they can check those by hand.
      const unreadable = getUnreadableQuestions(rows);
      if (unreadable.length) {
        warn(
          t("grading.unreadableAnswers", {
            docId: student.docId,
            list: unreadable
              .map(({ tableIdx, questionIndex }) =>
                t("grading.tableQuestionRef", {
                  table: tableIdx + 1,
                  question: questionIndex,
                }),
              )
              .join(", "),
          }),
        );
      }
    } catch (err) {
      console.error(err);
      warn(t("grading.failedDoc", { docId: student.docId, msg: err.message }));
    }
  }

  const result = await autoCheckExercises({
    studentsExerciseList,
    classId,
    lessonId,
    useCache,
    warn,
    t,
  });
  return { ...result, warnings };
}

/** @returns {Promise<{graded: number, error: ?string, notice: ?string}>} */
async function autoCheckExercises({
  studentsExerciseList,
  classId,
  lessonId,
  useCache = true,
  warn = () => {},
  t = (key) => key,
}) {
  // "Nothing to do" and "it broke" read very differently on screen, so they are
  // separate fields rather than one message.
  const nothingToDo = (notice) => ({ graded: 0, error: null, notice });
  const runFailed = (error) => ({ graded: 0, error, notice: null });

  if (!studentsExerciseList.length) return nothingToDo(t("grading.noAnswers"));

  // 1. Skip docs that were already graded; only work on the rest.
  //    Một dòng có feedback là bỏ qua CẢ doc — giữ nguyên quy tắc cũ, vì không
  //    có cách nào phân biệt feedback do AI ghi với chữ giáo viên tự gõ.
  const pending = [];
  let skippedWithUngraded = 0;
  for (const item of studentsExerciseList) {
    const { reviewed, ungradedTables } = describeGradedState(item.student.rows);
    if (!reviewed) {
      pending.push(item);
      continue;
    }
    // Doc đã chấm bài cũ nhưng vẫn còn bảng bài tập trống — gần như chắc chắn
    // là khối bài mới bổ sung. Nói thẳng ra, đừng để giáo viên đọc "tất cả đã
    // được chấm" rồi kết luận tính năng mới hỏng.
    if (ungradedTables.size) {
      skippedWithUngraded += 1;
      warn(
        t("grading.skippedHasOldFeedback", {
          docId: item.student.docId,
          count: ungradedTables.size,
        }),
      );
    }
  }
  if (!pending.length) {
    return nothingToDo(
      skippedWithUngraded
        ? t("grading.allSkippedOldFeedback", { count: skippedWithUngraded })
        : t("grading.allChecked"),
    );
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
    return runFailed(t("grading.pointCheckFailed"));
  }
  if (pending.length > payer.point) {
    return runFailed(
      t("grading.notEnough", {
        need: pending.length,
        have: payer.point,
        teacher: payer.teacherName,
      }),
    );
  }

  // 2. Gather every answer across the class and DEDUPE by (question, answer).
  //    Identical answers (within the class and across past runs via the cache)
  //    are graded only once.
  const uniqueAnswers = new Map(); // key -> {question, answer, type}
  for (const { quesAndAnsArr } of pending) {
    for (const qa of quesAndAnsArr) {
      // `type` thuộc về khoá: cùng một câu tiếng Anh có thể vừa là đáp án của
      // bài dịch vừa là đề của bài bị động, và hai thứ đó chấm khác nhau.
      const key = makeAnswerKey(qa.question, qa.answer, qa.type);
      if (!uniqueAnswers.has(key)) {
        uniqueAnswers.set(key, {
          question: qa.question,
          answer: qa.answer,
          type: qa.type,
        });
      }
    }
  }
  const studentAnswerArr = [...uniqueAnswers.values()];
  if (!studentAnswerArr.length) return nothingToDo(t("grading.noAnswers"));

  // 3. Grade on the backend (gradingCache lookup + AI for misses, unless
  //    caching is disabled — then every answer goes straight to the AI).
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
    return runFailed(t("grading.gradingFailed", { msg: err.message }));
  }

  // 4. Map feedback back by the SAME (question, answer) key. The AI answers on
  //    a single line (one Markdown table cell); formatFeedbackForDoc moves the
  //    "(giải thích lý do.)" part onto its own line before it reaches the doc.
  //    Cached feedback goes through this too, so old entries also get the
  //    line break without being re-graded.
  //    Backend BẮT BUỘC trả lại `taskType` nguyên văn: khoá được dựng lại từ
  //    response, nên thiếu nó là mọi lookup trượt và KHÔNG doc nào được ghi.
  const feedbackByKey = new Map();
  for (const g of graded) {
    if (g && g.feedback !== null && g.feedback !== undefined) {
      feedbackByKey.set(
        makeAnswerKey(g.question, g.answer, g.taskType),
        formatFeedbackForDoc(g.feedback),
      );
    }
  }

  // 5. Write each pending student's feedback into their doc, targeting rows by
  //    question index (unique within a doc). Never guess: an answer without a
  //    matched feedback or a parseable index is skipped.
  const chunks = chunkArray(pending, CONCURRENCY_LIMIT);
  let wroteCount = 0; // docs actually written — the count the teacher is shown
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
        const { charged = 0 } = await consumeDocPoints({
          classId,
          docIds,
          lessonId,
        });
        totalCharged += charged;
        return;
      } catch (err) {
        if (err.message === "INSUFFICIENT_POINTS") {
          stopped = true;
          warn(t("grading.stoppedNoPoints"));
          return;
        }
        console.error(err);
        // Not reported here: these are retried at the end of the run, and only
        // the ones still unsettled after that are worth telling the teacher.
        if (attempt === 1) unsettled.push(...docIds);
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
              makeAnswerKey(qa.question, qa.answer, qa.type),
            );
            if (feedback === null || feedback === undefined) continue;
            // `rowKey` nhắm đúng DÒNG đã đọc ra câu hỏi này, nên số thứ tự
            // trùng nhau giữa các nhóm thì / các bảng không còn đánh lừa được
            // ai. `questionIndex` chỉ còn là đường lùi.
            gradingResults.push({
              rowKey: `${qa.tableIdx}:${qa.rowIdx}`,
              questionIndex: extractQuestionIndex(qa.question),
              aiFeedback: feedback,
            });
          }
          if (!gradingResults.length) {
            warn(t("grading.noMatch", { docId: student.docId }));
            return;
          }
          try {
            await writeGradingResultsToDoc(
              gradingResults,
              student,
              googleToken,
            );
            wroteCount += 1;
            // Bill immediately. From here on, a run that is cancelled (tab
            // closed, network lost) leaves at most ONE written doc unpaid
            // instead of the whole class.
            await noteWritten(student.docId);
          } catch (err) {
            console.error(err);
            warn(
              t("grading.failedWrite", {
                docId: student.docId,
                msg: err.message,
              }),
            );
          }
        }),
      );
    }
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
    warn(t("grading.unsettled", { list: leftover.join(", ") }));
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

  return {
    graded: wroteCount,
    error: null,
    // Every doc failed or matched nothing — otherwise the box would be blank.
    notice: wroteCount ? null : t("grading.noneGraded"),
  };
}
