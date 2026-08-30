/**
 * Clearing AI feedback back out of student docs (the admin-only "Xóa feedback"
 * button). The inverse of the write half of the grading pipeline.
 *
 * Scope is the tab whose title matches the selected lesson, in the tables the
 * selected class type maps to — so other lessons living in the same document
 * are never touched. Nothing here spends points or reads the grading cache.
 *
 * Split into a read pass and a write pass on purpose: the "Chữa bài" column is
 * shared by the AI and anything a teacher typed by hand, and the two cannot be
 * told apart, so the admin gets to see the real numbers before committing.
 */
import { getTableIndexOfExercise } from "./docTables.js";
import { buildClearFeedbackRequests } from "./docWriter.js";
import { resolveDocRefs } from "./grading.js";
import { batchUpdateDoc, getTabContent } from "../api/googleDocs.js";
import { ensureValidGoogleToken } from "../auth/tokens.js";

/**
 * Reads one doc's lesson tab and works out what clearing it would remove.
 * Returns null when the doc has no tab for this lesson (getTabContent already
 * reported it) or the lesson has no table mapping for this class type.
 *
 * The token is returned alongside the requests because the caller must write
 * with the same one it read with — a long run can outlive a token otherwise.
 */
async function scanDoc(ref, { classType, lessonName, onStatus, t }) {
  // Re-checked per doc: the Docs API needs a REAL Google token, not the JWT.
  const token = await ensureValidGoogleToken();
  const tab = await getTabContent(ref.docId, token, lessonName, onStatus);
  if (!tab) return null;

  const tableIndex = getTableIndexOfExercise(
    tab.tabProperties.title,
    classType,
  );
  if (!tableIndex) {
    onStatus.append(t("clearFeedback.noTable", { docId: ref.docId }));
    return null;
  }
  return {
    token,
    requests: buildClearFeedbackRequests(
      tab,
      tab.tabProperties.tabId,
      tableIndex,
    ),
  };
}

/**
 * Read-only first pass: how much would actually be deleted, per doc.
 * Returns null when there is nothing to work on at all.
 */
export async function planFeedbackClear({
  docLinksText,
  classId,
  classType,
  lessonName,
  onStatus,
  t,
}) {
  const refs = await resolveDocRefs(docLinksText, classId);
  if (!refs.length) {
    alert(t("grading.noDocs"));
    return null;
  }

  const plans = [];
  let cells = 0;
  for (const ref of refs) {
    onStatus.set(t("clearFeedback.scanning", { docId: ref.docId }));
    try {
      const found = await scanDoc(ref, { classType, lessonName, onStatus, t });
      if (!found) continue;
      if (!found.requests.length) {
        onStatus.append(t("clearFeedback.nothing", { docId: ref.docId }));
        continue;
      }
      plans.push({ docId: ref.docId, cells: found.requests.length });
      cells += found.requests.length;
    } catch (err) {
      // One bad doc must not sink the whole scan.
      console.error(err);
      onStatus.append(
        t("clearFeedback.failed", { docId: ref.docId, msg: err.message }),
      );
    }
  }
  return { plans, cells };
}

/**
 * Write pass. Sequential rather than chunked like grading: deleting is cheap,
 * and one doc at a time keeps the status log readable.
 */
export async function executeFeedbackClear({
  plans,
  classType,
  lessonName,
  onStatus,
  t,
}) {
  let clearedDocs = 0;
  let clearedCells = 0;

  for (const plan of plans) {
    onStatus.set(t("clearFeedback.clearingDoc", { docId: plan.docId }));
    try {
      // Deliberately re-read instead of reusing the planned requests: those
      // indexes came from an earlier snapshot, and any edit made to the doc in
      // between would have shifted every one of them.
      const found = await scanDoc(plan, { classType, lessonName, onStatus, t });
      if (!found || !found.requests.length) {
        onStatus.append(t("clearFeedback.nothing", { docId: plan.docId }));
        continue;
      }
      await batchUpdateDoc(plan.docId, found.requests, found.token);
      clearedDocs += 1;
      clearedCells += found.requests.length;
      onStatus.append(
        t("clearFeedback.cleared", {
          n: found.requests.length,
          docId: plan.docId,
        }),
      );
    } catch (err) {
      console.error(err);
      onStatus.append(
        t("clearFeedback.failed", { docId: plan.docId, msg: err.message }),
      );
    }
  }
  return { clearedDocs, clearedCells };
}
