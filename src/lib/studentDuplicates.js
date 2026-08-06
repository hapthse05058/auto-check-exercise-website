/**
 * Google Doc duplicate detection for the "add students to a class" flow.
 *
 * A student is identified by the id of their exercise Google Doc — NOT by the
 * raw link (the same doc yields different URLs once `?tab=`, `/edit` or
 * `&usp=sharing` are appended) and NOT by their name (two students can share a
 * name). Comparing doc ids is therefore the only reliable way to notice that a
 * teacher is about to add the same student twice.
 *
 * Kept free of React/DOM so it can be unit-tested directly.
 */
import { extractDocId } from "./googleDoc.js";

/** Reads the doc link off either shape: staged rows use `doc`, saved students `ggDocLink`. */
const linkOf = (s) => s?.doc ?? s?.ggDocLink ?? "";

/**
 * Splits `candidates` into the ones that can be added and the ones that clash.
 *
 * A candidate clashes when its doc id is already used by an `existing` student
 * OR by an earlier candidate in the same batch — regardless of the names, since
 * one Google Doc belongs to exactly one student.
 *
 * @param {{name:string, doc?:string, ggDocLink?:string}[]} candidates students about to be added
 * @param {{name:string, doc?:string, ggDocLink?:string}[]} existing students already staged or already saved in the class
 * @returns {{
 *   ok: boolean,
 *   unique: object[],
 *   noDocId: object[],
 *   duplicates: {docId:string, doc:string, name:string, index:number, clashingNames:string[]}[],
 * }} `unique` = has a doc id and no clash; `noDocId` = link isn't a Google Doc
 *    (can't be checked, left for the caller to accept or skip); `duplicates`
 *    carries the candidate's position in the input so callers can flag the row.
 */
export function findDocIdDuplicates(candidates = [], existing = []) {
  // docId -> names already holding that doc (existing first, then accepted candidates).
  const holders = new Map();
  for (const student of existing) {
    const docId = extractDocId(linkOf(student));
    if (!docId) continue;
    if (!holders.has(docId)) holders.set(docId, []);
    holders.get(docId).push(student.name || "");
  }

  const unique = [];
  const noDocId = [];
  const duplicates = [];

  candidates.forEach((candidate, index) => {
    const doc = linkOf(candidate);
    const docId = extractDocId(doc);
    if (!docId) {
      noDocId.push(candidate);
      return;
    }
    const clashingNames = holders.get(docId);
    if (clashingNames?.length) {
      duplicates.push({
        docId,
        doc,
        name: candidate.name,
        index,
        clashingNames: [...clashingNames],
      });
      return;
    }
    holders.set(docId, [candidate.name || ""]);
    unique.push(candidate);
  });

  return { ok: duplicates.length === 0, unique, noDocId, duplicates };
}

/**
 * Groups the `duplicates` of {@link findDocIdDuplicates} by doc id so a message
 * can list every name attached to one doc in a single line.
 *
 * @returns {{docId:string, doc:string, names:string[]}[]}
 */
export function groupDuplicatesByDoc(duplicates = []) {
  const grouped = [];
  for (const duplicate of duplicates) {
    let entry = grouped.find((g) => g.docId === duplicate.docId);
    if (!entry) {
      entry = { docId: duplicate.docId, doc: duplicate.doc, names: [] };
      grouped.push(entry);
    }
    // Names come from two sides (the holders, then the rejected candidate) and a
    // name can repeat across rows — keep the list distinct and in first-seen order.
    for (const name of [...duplicate.clashingNames, duplicate.name]) {
      if (name && !entry.names.includes(name)) entry.names.push(name);
    }
  }
  return grouped;
}
