/**
 * Clearing AI feedback back out of student docs (the admin-only "Xóa feedback"
 * button). The inverse of the write half of the grading pipeline.
 *
 * Scope is the tab whose title matches the selected lesson, in the tables the
 * selected class type maps to — so other lessons living in the same document
 * are never touched. An IELTS class (course gradingProfile "ielts") has no
 * class-type tables: its IELTS WRITING tables (ieltsDoc.js) are cleared
 * instead, i.e. their "GV chữa" cell. Nothing here spends points or reads the
 * grading cache.
 *
 * Split into a read pass and a write pass on purpose: the "Chữa bài" column is
 * shared by the AI and anything a teacher typed by hand, and the two cannot be
 * told apart, so the admin gets to see the real numbers before committing.
 *
 * Like the grading pipeline, both passes report once through their return value
 * rather than streaming progress the screen never shows.
 */
import { collectExerciseRows } from "./docTableDetect.js";
import { buildClearFeedbackRequests } from "./docWriter.js";
import { resolveDocRefs } from "./grading.js";
import { collectIeltsRows } from "./ieltsDoc.js";
import { batchUpdateDoc, getTabContent } from "../api/googleDocs.js";
import { ensureValidGoogleToken } from "../auth/tokens.js";

/**
 * Reads one doc's lesson tab and works out what clearing it would remove.
 * Returns null when the doc has no tab for this lesson, the fetch failed, or
 * the lesson has no table mapping for this class type.
 *
 * The token is returned alongside the requests because the caller must write
 * with the same one it read with — a long run can outlive a token otherwise.
 */
async function scanDoc(
  ref,
  { classType, gradingProfile, lessonName, warn, t },
) {
  // Re-checked per doc: the Docs API needs a REAL Google token, not the JWT.
  const token = await ensureValidGoogleToken();
  const tab = await getTabContent(ref.docId, token, lessonName);
  if (!tab) {
    warn(t("clearFeedback.tabMissing", { docId: ref.docId }));
    return null;
  }

  const { rows } =
    gradingProfile === "ielts"
      ? collectIeltsRows(tab)
      : collectExerciseRows(tab, classType);
  if (!rows.length) {
    warn(t("clearFeedback.noTable", { docId: ref.docId }));
    return null;
  }
  return {
    token,
    requests: buildClearFeedbackRequests(rows, tab.tabProperties.tabId),
  };
}

/**
 * Read-only first pass: how much would actually be deleted, per doc.
 * Returns null when there is no document to work on at all.
 *
 * @returns {Promise<?{plans: Array<{docId: string, cells: number}>,
 *                     cells: number, warnings: string[]}>}
 */
export async function planFeedbackClear({
  docLinksText,
  classId,
  classType,
  gradingProfile,
  lessonName,
  t,
}) {
  const warnings = [];
  const warn = (text) => warnings.push(text);

  const refs = await resolveDocRefs(docLinksText, classId);
  if (!refs.length) {
    alert(t("grading.noDocs"));
    return null;
  }

  const plans = [];
  let cells = 0;
  for (const ref of refs) {
    try {
      const found = await scanDoc(ref, {
        classType,
        gradingProfile,
        lessonName,
        warn,
        t,
      });
      if (!found || !found.requests.length) continue;
      plans.push({ docId: ref.docId, cells: found.requests.length });
      cells += found.requests.length;
    } catch (err) {
      // One bad doc must not sink the whole scan.
      console.error(err);
      warn(t("clearFeedback.failed", { docId: ref.docId, msg: err.message }));
    }
  }
  return { plans, cells, warnings };
}

/**
 * Write pass. Sequential rather than chunked like grading: deleting is cheap,
 * and one doc at a time keeps the load off the Docs API.
 *
 * @returns {Promise<{clearedDocs: number, clearedCells: number,
 *                    warnings: string[]}>}
 */
export async function executeFeedbackClear({
  plans,
  classType,
  gradingProfile,
  lessonName,
  t,
}) {
  const warnings = [];
  const warn = (text) => warnings.push(text);
  let clearedDocs = 0;
  let clearedCells = 0;

  for (const plan of plans) {
    try {
      // Deliberately re-read instead of reusing the planned requests: those
      // indexes came from an earlier snapshot, and any edit made to the doc in
      // between would have shifted every one of them.
      const found = await scanDoc(plan, {
        classType,
        gradingProfile,
        lessonName,
        warn,
        t,
      });
      if (!found || !found.requests.length) continue;
      await batchUpdateDoc(plan.docId, found.requests, found.token);
      clearedDocs += 1;
      clearedCells += found.requests.length;
    } catch (err) {
      console.error(err);
      warn(t("clearFeedback.failed", { docId: plan.docId, msg: err.message }));
    }
  }
  return { clearedDocs, clearedCells, warnings };
}
