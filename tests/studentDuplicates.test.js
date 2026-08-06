import { describe, expect, it } from "vitest";
import {
  findDocIdDuplicates,
  groupDuplicatesByDoc,
} from "../src/lib/studentDuplicates.js";

const DOC = "https://docs.google.com/document/d/abc";
const DOC2 = "https://docs.google.com/document/d/def";

describe("findDocIdDuplicates", () => {
  it("accepts candidates with distinct doc ids", () => {
    const res = findDocIdDuplicates([
      { name: "A", doc: DOC },
      { name: "B", doc: DOC2 },
    ]);
    expect(res.ok).toBe(true);
    expect(res.duplicates).toEqual([]);
    expect(res.unique.map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("ignores the tab id and any URL suffix when comparing", () => {
    const existing = [{ name: "Hải", ggDocLink: DOC }];
    const res = findDocIdDuplicates(
      [{ name: "An", doc: `${DOC}/edit?tab=t.a1b2&usp=sharing` }],
      existing,
    );
    expect(res.ok).toBe(false);
    expect(res.duplicates[0].clashingNames).toEqual(["Hải"]);
    expect(res.duplicates[0].name).toBe("An");
  });

  it("flags a clash inside the same batch and reports its row index", () => {
    const res = findDocIdDuplicates([
      { name: "A", doc: DOC },
      { name: "B", doc: DOC2 },
      { name: "C", doc: DOC },
    ]);
    expect(res.ok).toBe(false);
    expect(res.unique.map((s) => s.name)).toEqual(["A", "B"]);
    expect(res.duplicates).toHaveLength(1);
    expect(res.duplicates[0].index).toBe(2);
    expect(res.duplicates[0].clashingNames).toEqual(["A"]);
  });

  it("flags a duplicate even when both rows carry the same name", () => {
    const res = findDocIdDuplicates([
      { name: "Trần Thị Hải", doc: DOC },
      { name: "Trần Thị Hải", doc: DOC },
    ]);
    expect(res.ok).toBe(false);
    expect(res.unique).toHaveLength(1);
  });

  it("sets aside links that carry no Google Doc id instead of clashing them", () => {
    const res = findDocIdDuplicates([
      { name: "A", doc: "not-a-doc-url" },
      { name: "B", doc: "" },
      { name: "C", doc: DOC },
    ]);
    expect(res.ok).toBe(true);
    expect(res.noDocId.map((s) => s.name)).toEqual(["A", "B"]);
    expect(res.unique.map((s) => s.name)).toEqual(["C"]);
  });

  it("reads existing students from either `doc` or `ggDocLink`", () => {
    const res = findDocIdDuplicates(
      [{ name: "New", doc: DOC }],
      [{ name: "Saved", ggDocLink: DOC }],
    );
    expect(res.ok).toBe(false);
    expect(res.duplicates[0].clashingNames).toEqual(["Saved"]);
  });
});

describe("groupDuplicatesByDoc", () => {
  it("merges every name attached to one doc into a single distinct list", () => {
    const { duplicates } = findDocIdDuplicates([
      { name: "A", doc: DOC },
      { name: "B", doc: DOC },
      { name: "C", doc: DOC },
    ]);
    const grouped = groupDuplicatesByDoc(duplicates);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].names).toEqual(["A", "B", "C"]);
  });

  it("keeps one entry per doc", () => {
    const { duplicates } = findDocIdDuplicates(
      [
        { name: "A2", doc: DOC },
        { name: "B2", doc: DOC2 },
      ],
      [
        { name: "A", doc: DOC },
        { name: "B", doc: DOC2 },
      ],
    );
    const grouped = groupDuplicatesByDoc(duplicates);
    expect(grouped.map((g) => g.names)).toEqual([
      ["A", "A2"],
      ["B", "B2"],
    ]);
  });
});
