/**
 * Pure parser for the "Import student list" Excel feature.
 *
 * Takes the sheet as a 2D array of cells (what XLSX.utils.sheet_to_json(sheet,
 * { header: 1 }) returns) and extracts students. Column detection is by header
 * name first (flexible substring match, order-independent), then falls back to
 * positional columns (A = name, B = doc link) when no header is recognised.
 *
 * Kept free of DOM/XLSX so it can be unit-tested directly.
 */
import {
  findDocIdDuplicates,
  groupDuplicatesByDoc,
} from "./studentDuplicates.js";

// Substring keywords used to recognise each column from its header text.
const NAME_KEYS = ["tên", "ten", "họ", "ho", "name", "student", "học sinh"];
const DOC_KEYS = [
  "doc",
  "link",
  "liên kết",
  "lien ket",
  "tài liệu",
  "tai lieu",
  "url",
];

const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const matchIdx = (header, keys) =>
  header.findIndex((h) => keys.some((k) => h.includes(k)));

export function parseStudentsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    return { students: [], skipped: 0 };

  const header = (rows[0] || []).map(norm);
  // A row that already contains an http URL is real data, not a header — guard
  // against this first, otherwise a Google Doc link ("docs.google.com/...") would
  // get matched by the DOC keywords and the first student would be dropped.
  const firstRowIsData = header.some((c) => c.startsWith("http"));

  let nameIdx;
  let docIdx;
  let dataRows;
  if (firstRowIsData) {
    // No header → positional fallback (col A = name, col B = link), keep all rows.
    nameIdx = 0;
    docIdx = 1;
    dataRows = rows;
  } else {
    // Row 0 is a header line. Detect columns by name; whatever isn't recognised
    // falls back to position. Either way the header row itself is dropped.
    nameIdx = matchIdx(header, NAME_KEYS);
    docIdx = matchIdx(header, DOC_KEYS);
    if (nameIdx === -1) nameIdx = 0;
    if (docIdx === -1) docIdx = 1;
    dataRows = rows.slice(1);
  }

  let skipped = 0;
  const students = [];
  for (const r of dataRows) {
    if (!Array.isArray(r) || r.length === 0) continue;
    const name = String(r[nameIdx] ?? "").trim();
    const doc = String(r[docIdx] ?? "").trim();
    if (!name) {
      if (doc) skipped += 1; // a row with a link but no name is a real skip
      continue;
    }
    // Keep the raw doc value (even if not a valid URL) so the user can review and
    // fix it via the card edit button, instead of silently dropping it.
    students.push({ name, gmail: "", doc });
  }
  return { students, skipped };
}

/**
 * Reconcile freshly-parsed students against the students already staged on
 * screen AND the ones already saved in the selected class.
 *
 * - Repeated Google Doc id → conflict; the WHOLE file is blocked (toAdd is
 *   emptied) and every name attached to that doc is collected for the report.
 *   Identical rows (same doc AND same name) count as a conflict too: the
 *   teacher must fix the file rather than have rows silently disappear.
 * - No extractable Doc id  → invalid row, skipped (counted).
 *
 * @param {{name:string, gmail?:string, doc:string}[]} parsed
 * @param {{name:string, doc?:string, ggDocLink?:string}[]} existing students already added
 * @returns {{ok:boolean, toAdd:object[], conflicts:{docId:string,names:string[],doc:string}[], skippedNoId:number}}
 */
export function resolveStudentImport(parsed, existing = []) {
  const { unique, noDocId, duplicates } = findDocIdDuplicates(parsed, existing);
  const conflicts = groupDuplicatesByDoc(duplicates);
  const ok = conflicts.length === 0;
  const toAdd = unique.map((s) => ({
    name: s.name,
    gmail: s.gmail ?? "",
    doc: s.doc,
  }));

  return { ok, toAdd: ok ? toAdd : [], conflicts, skippedNoId: noDocId.length };
}
