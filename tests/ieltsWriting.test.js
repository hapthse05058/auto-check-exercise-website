import { describe, expect, it } from "vitest";

import {
  boldRuns,
  chartDataToPlain,
  countWords,
  dataUrlBytes,
  feedbackToHtml,
  feedbackToPlain,
  ieltsErrorText,
} from "../src/lib/ieltsWriting.js";

describe("chartDataToPlain", () => {
  it("drops markdown emphasis, headings and table rule rows, keeps the data", () => {
    const md = [
      "**Loại biểu đồ:** Line graph",
      "",
      "---",
      "### Bảng số liệu (million tonnes)",
      "*(Số liệu ước lượng theo vạch chia)*",
      "| Quốc gia | 1970 | 2010 |",
      "| :--- | :---: | ---: |",
      "| **Spain** | ~5.6 | ~5.1 |",
      "",
      "",
      "",
      "- Spain cao nhất",
    ].join("\n");
    expect(chartDataToPlain(md)).toBe(
      [
        "Loại biểu đồ: Line graph",
        "",
        "Bảng số liệu (million tonnes)",
        "(Số liệu ước lượng theo vạch chia)",
        "| Quốc gia | 1970 | 2010 |",
        "| Spain | ~5.6 | ~5.1 |",
        "",
        "- Spain cao nhất",
      ].join("\n"),
    );
  });

  it("keeps negative numbers and dashes inside text", () => {
    expect(chartDataToPlain("- 1970-2010: -3%")).toBe("- 1970-2010: -3%");
    expect(chartDataToPlain(null)).toBe("");
  });
});

describe("boldRuns", () => {
  it("splits a line into plain and bold runs", () => {
    expect(boldRuns("invest **on** → in (giới từ)")).toEqual([
      { text: "invest ", bold: false },
      { text: "on", bold: true },
      { text: " → in (giới từ)", bold: false },
    ]);
  });
  it("leaves an unpaired ** as text", () => {
    expect(boldRuns("a **b")).toEqual([{ text: "a **b", bold: false }]);
  });
  it("handles a line that is all bold, and an empty line", () => {
    expect(boldRuns("**1. BẢN CHỮA**")).toEqual([
      { text: "1. BẢN CHỮA", bold: true },
    ]);
    expect(boldRuns("")).toEqual([]);
  });
});

describe("clipboard formats", () => {
  const text = "**Overall: 6.5**\nI <3 **cats** & dogs";
  it("HTML keeps bold, escapes markup, one <br> per line", () => {
    expect(feedbackToHtml(text)).toBe(
      "<b>Overall: 6.5</b><br>I &lt;3 <b>cats</b> &amp; dogs",
    );
  });
  it("plain text drops the markers", () => {
    expect(feedbackToPlain(text)).toBe("Overall: 6.5\nI <3 cats & dogs");
  });
});

describe("countWords", () => {
  it("matches the backend rule", () => {
    expect(countWords("Hello , world - 2010 ! ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("dataUrlBytes", () => {
  it("decodes the base64 length", () => {
    const url = `data:image/png;base64,${btoa("hello")}`;
    expect(dataUrlBytes(url)).toBe(5);
  });
});

describe("ieltsErrorText", () => {
  const dict = {
    "ielts.error.insufficient_points": "hết số dư ({balance})",
    "ielts.error.ielts_grade_failed": "lỗi chung",
  };
  const t = (key, params = {}) =>
    key in dict
      ? dict[key].replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "")
      : key;

  it("uses the backend code and its params", () => {
    const error = new Error("insufficient_points");
    error.params = { balanceVnd: 500 };
    expect(ieltsErrorText(error, t)).toBe("hết số dư (500đ)");
  });
  it("falls back to the generic text for an unknown code", () => {
    expect(ieltsErrorText(new Error("weird"), t)).toBe("lỗi chung");
  });
});
