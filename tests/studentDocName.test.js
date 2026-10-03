import { describe, expect, it } from "vitest";

import { parseNameFromDocTitle } from "../src/lib/studentDocName.js";

const NBSP = String.fromCodePoint(0xa0);
const BOM = String.fromCodePoint(0xfeff);

describe("parseNameFromDocTitle", () => {
  it("takes the name from fullname_phone_class", () => {
    expect(parseNameFromDocTitle("Nguyễn Khắc Huy_0989664415_NHS87.docx")).toBe(
      "Nguyễn Khắc Huy",
    );
    expect(parseNameFromDocTitle("Lê A _ 098-966-4415 _ HS1")).toBe("Lê A");
  });

  it("takes a title that is only a name", () => {
    expect(parseNameFromDocTitle("Thu Hà")).toBe("Thu Hà");
    // A non-breaking space, and a BOM.
    expect(parseNameFromDocTitle(`  Trần${NBSP}Thị Hải.docx `)).toBe(
      "Trần Thị Hải",
    );
    expect(parseNameFromDocTitle(`${BOM}Mai`)).toBe("Mai");
  });

  it("leaves anything else empty", () => {
    expect(parseNameFromDocTitle("")).toBe("");
    expect(parseNameFromDocTitle(undefined)).toBe("");
    expect(parseNameFromDocTitle("Bài tập buổi 5")).toBe("");
    expect(parseNameFromDocTitle("Untitled document (1)")).toBe("");
    expect(parseNameFromDocTitle("Untitled document")).toBe("");
    expect(parseNameFromDocTitle("Tài liệu không có tiêu đề")).toBe("");
    expect(parseNameFromDocTitle("Copy of Thu Hà")).toBe("");
    expect(parseNameFromDocTitle("Nguyen_Van_A_0989664415_NHS87")).toBe("");
    expect(parseNameFromDocTitle("Huy_abc_NHS87")).toBe("");
    expect(parseNameFromDocTitle("Bài tập về nhà tiếng Anh của lớp sáu")).toBe(
      "",
    );
  });
});
