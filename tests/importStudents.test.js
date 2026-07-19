import { describe, expect, it } from "vitest";
import {
  parseStudentsFromRows,
  resolveStudentImport,
} from "../src/lib/importStudents.js";

const DOC = "https://docs.google.com/document/d/abc";
const DOC2 = "https://docs.google.com/document/d/def";
const DOC3 = "https://docs.google.com/document/d/ghi";

describe("parseStudentsFromRows", () => {
  it("parses a file with the expected headers", () => {
    const rows = [
      ["Họ và tên", "Link Google Doc"],
      ["Trần Thị Hải", DOC],
      ["Nguyễn Văn An", DOC2],
    ];
    const { students, skipped } = parseStudentsFromRows(rows);
    expect(skipped).toBe(0);
    expect(students).toEqual([
      { name: "Trần Thị Hải", gmail: "", doc: DOC },
      { name: "Nguyễn Văn An", gmail: "", doc: DOC2 },
    ]);
  });

  it("detects columns by header regardless of order/position (Case A)", () => {
    // Note column, Doc link, then Name — name is column C.
    const rows = [
      ["Ghi chú", "Link Google Doc", "Full name"],
      ["lớp A", DOC, "Trần Thị Hải"],
    ];
    const { students } = parseStudentsFromRows(rows);
    expect(students).toEqual([{ name: "Trần Thị Hải", gmail: "", doc: DOC }]);
  });

  it("keeps the first row as data when there is no header but col B is a link (Case B)", () => {
    const rows = [
      ["Nguyễn Văn A", DOC],
      ["Nguyễn Văn B", DOC2],
    ];
    const { students, skipped } = parseStudentsFromRows(rows);
    expect(skipped).toBe(0);
    expect(students).toEqual([
      { name: "Nguyễn Văn A", gmail: "", doc: DOC },
      { name: "Nguyễn Văn B", gmail: "", doc: DOC2 },
    ]);
  });

  it("drops an unrecognised header row in positional fallback (col B not a URL)", () => {
    const rows = [
      ["Sinh viên", "Tài nguyên"], // not matched by keywords, col B not http → header
      ["Nguyễn Văn A", DOC],
    ];
    // "tài nguyên" contains no DOC_KEYS substring and "sinh viên" no NAME_KEYS,
    // so this is treated as a positional-fallback header and dropped.
    const { students } = parseStudentsFromRows(rows);
    expect(students).toEqual([{ name: "Nguyễn Văn A", gmail: "", doc: DOC }]);
  });

  it("skips rows missing a name and counts them when they carry a link", () => {
    const rows = [
      ["Họ và tên", "Link Google Doc"],
      ["Trần Thị Hải", DOC],
      ["", DOC2], // has a link but no name → counted as skipped
      ["   ", ""], // fully blank-ish → ignored, not counted
      ["Nguyễn Văn An", DOC2],
    ];
    const { students, skipped } = parseStudentsFromRows(rows);
    expect(skipped).toBe(1);
    expect(students.map((s) => s.name)).toEqual([
      "Trần Thị Hải",
      "Nguyễn Văn An",
    ]);
  });

  it("keeps a row whose link is missing/invalid (raw value preserved)", () => {
    const rows = [
      ["Họ và tên", "Link Google Doc"],
      ["Trần Thị Hải", "not-a-url"],
      ["Nguyễn Văn An", ""],
    ];
    const { students } = parseStudentsFromRows(rows);
    expect(students).toEqual([
      { name: "Trần Thị Hải", gmail: "", doc: "not-a-url" },
      { name: "Nguyễn Văn An", gmail: "", doc: "" },
    ]);
  });

  it("returns empty for an empty or non-array input (Case D)", () => {
    expect(parseStudentsFromRows([])).toEqual({ students: [], skipped: 0 });
    expect(parseStudentsFromRows(null)).toEqual({ students: [], skipped: 0 });
    expect(parseStudentsFromRows(undefined)).toEqual({
      students: [],
      skipped: 0,
    });
  });
});

describe("resolveStudentImport", () => {
  it("keeps distinct students and drops exact (doc + name) duplicates", () => {
    const parsed = [
      { name: "Trần Thị Hải", gmail: "", doc: DOC },
      { name: "Trần Thị Hải", gmail: "", doc: DOC }, // exact dup
      { name: "Nguyễn Văn An", gmail: "", doc: DOC2 },
    ];
    const res = resolveStudentImport(parsed, []);
    expect(res.ok).toBe(true);
    expect(res.duplicates).toBe(1);
    expect(res.toAdd.map((s) => s.name)).toEqual([
      "Trần Thị Hải",
      "Nguyễn Văn An",
    ]);
  });

  it("treats name differing only by case/space as a duplicate, not a conflict", () => {
    const parsed = [
      { name: "Trần Thị Hải", gmail: "", doc: DOC },
      { name: "  trần thị   hải ", gmail: "", doc: DOC },
    ];
    const res = resolveStudentImport(parsed, []);
    expect(res.ok).toBe(true);
    expect(res.duplicates).toBe(1);
    expect(res.toAdd).toHaveLength(1);
  });

  it("blocks the whole file when one doc id maps to different names", () => {
    const parsed = [
      { name: "Nguyễn Văn A", gmail: "", doc: DOC },
      { name: "Trần Thị B", gmail: "", doc: DOC },
      { name: "Nguyễn Văn An", gmail: "", doc: DOC2 },
    ];
    const res = resolveStudentImport(parsed, []);
    expect(res.ok).toBe(false);
    expect(res.toAdd).toEqual([]);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].names).toEqual(["Nguyễn Văn A", "Trần Thị B"]);
  });

  it("collects every clashing name for the same doc id (3 names, no loss)", () => {
    const parsed = [
      { name: "A", gmail: "", doc: DOC },
      { name: "B", gmail: "", doc: DOC },
      { name: "C", gmail: "", doc: DOC },
    ];
    const res = resolveStudentImport(parsed, []);
    expect(res.ok).toBe(false);
    expect(res.conflicts[0].names).toEqual(["A", "B", "C"]);
  });

  it("dedups against students already on screen (existing)", () => {
    const existing = [{ name: "Trần Thị Hải", doc: DOC }];
    const parsed = [
      { name: "Trần Thị Hải", gmail: "", doc: DOC }, // already present
      { name: "Nguyễn Văn An", gmail: "", doc: DOC2 },
    ];
    const res = resolveStudentImport(parsed, existing);
    expect(res.ok).toBe(true);
    expect(res.duplicates).toBe(1);
    expect(res.toAdd.map((s) => s.name)).toEqual(["Nguyễn Văn An"]);
  });

  it("conflicts against existing (same doc via ggDocLink, different name) → blocked", () => {
    const existing = [{ name: "Nguyễn Văn A", ggDocLink: DOC }];
    const parsed = [{ name: "Trần Thị B", gmail: "", doc: DOC }];
    const res = resolveStudentImport(parsed, existing);
    expect(res.ok).toBe(false);
    expect(res.conflicts[0].names).toEqual(["Nguyễn Văn A", "Trần Thị B"]);
  });

  it("skips rows whose link yields no Google Doc id", () => {
    const parsed = [
      { name: "Trần Thị Hải", gmail: "", doc: DOC },
      { name: "Lê Văn C", gmail: "", doc: "not-a-doc-url" },
      { name: "Phạm D", gmail: "", doc: "" },
      { name: "Nguyễn E", gmail: "", doc: DOC3 },
    ];
    const res = resolveStudentImport(parsed, []);
    expect(res.ok).toBe(true);
    expect(res.skippedNoId).toBe(2);
    expect(res.toAdd.map((s) => s.name)).toEqual(["Trần Thị Hải", "Nguyễn E"]);
  });
});
