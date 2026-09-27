import { describe, expect, it } from "vitest";

import {
  courseErrorText,
  templateName,
  templatesForCourse,
} from "../src/lib/courses.js";

describe("templates", () => {
  const templates = [
    { code: "basic_before_31032026", name: "Mẫu cũ", gradingProfile: "basic" },
    {
      code: "basic_since_20072026",
      name: "Mẫu 20/07",
      gradingProfile: "basic",
    },
    { code: "ielts_writing", name: "IELTS", gradingProfile: "ielts" },
  ];
  const codes = (list) => list.map((t) => t.code);

  it("offers a course only its own profile's templates", () => {
    expect(codes(templatesForCourse(templates, { id: "basic" }))).toEqual([
      "basic_before_31032026",
      "basic_since_20072026",
    ]);
    expect(
      codes(templatesForCourse(templates, { gradingProfile: "ielts" })),
    ).toEqual(["ielts_writing"]);
    expect(templatesForCourse(templates, null)).toEqual([]);
  });

  it("names a class's template, falling back to its code", () => {
    expect(templateName(templates, "basic_since_20072026")).toBe("Mẫu 20/07");
    expect(templateName(templates, "gone")).toBe("gone");
    expect(templateName(templates, "")).toBe("");
  });
});

describe("courseErrorText", () => {
  const dict = {
    "courses.error.lesson_in_use": "đang dùng: {classes}",
    "courses.error.course_failed": "lỗi chung",
  };
  const t = (key, params = {}) =>
    key in dict
      ? dict[key].replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "")
      : key;

  it("fills in the classes the backend named", () => {
    const error = Object.assign(new Error("lesson_in_use"), {
      params: { classes: ["Lớp A", "Lớp B"] },
    });
    expect(courseErrorText(error, t)).toBe("đang dùng: Lớp A, Lớp B");
  });

  it("falls back for an unknown code", () => {
    expect(courseErrorText(new Error("weird"), t)).toBe("lỗi chung");
  });
});
