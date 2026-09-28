import { describe, expect, it } from "vitest";

import {
  courseErrorText,
  groupLessonsByProfile,
  templateCodeFromName,
  templateErrorText,
  templateName,
  templatesForCourse,
} from "../src/lib/courses.js";

describe("template admin helpers", () => {
  it("suggests a code from a Vietnamese name", () => {
    expect(templateCodeFromName("Mẫu tháng 10/2026")).toBe("mau_thang_10_2026");
    expect(templateCodeFromName("  Đề HS — lớp 5 ")).toBe("de_hs_lop_5");
    expect(templateCodeFromName("")).toBe("");
  });

  it("explains a template API error", () => {
    const t = (key, params) =>
      ({
        "templates.error.template_in_use": `in use: ${params?.classes}`,
        "templates.error.template_failed": "failed",
      })[key] ?? key;
    const inUse = Object.assign(new Error("template_in_use"), {
      params: { classes: ["A", "B"] },
    });
    expect(templateErrorText(inUse, t)).toBe("in use: A, B");
    expect(templateErrorText(new Error("weird"), t)).toBe("failed");
  });
});

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

describe("groupLessonsByProfile — the course editor's lesson picker", () => {
  const templates = [
    { code: "basic_before_31032026", gradingProfile: "basic" },
    { code: "basic_since_01042026" }, // no profile: Basic
    { code: "hs_24buoi", gradingProfile: "hs" },
  ];
  const lessons = [
    {
      id: "lesson01",
      name: "BUỔI 01",
      classType: ["basic_before_31032026", "basic_since_01042026"],
    },
    { id: "lesson02", name: "BUỔI 02", classType: ["basic_since_01042026"] },
    { id: "hsLesson01", name: "Buổi 01", classType: ["hs_24buoi"] },
    { id: "odd", name: "Old", classType: "gone_template" },
  ];
  const shape = (groups) =>
    groups.map((g) => [g.key, g.lessons.map((l) => l.id)]);

  it("keeps Basic and HS lessons with the same name apart", () => {
    expect(shape(groupLessonsByProfile(lessons, templates, "basic"))).toEqual([
      ["basic", ["lesson01", "lesson02"]],
      ["hs", ["hsLesson01"]],
      ["", ["odd"]],
    ]);
  });

  it("lists the course's own profile first", () => {
    expect(groupLessonsByProfile(lessons, templates, "hs")[0].key).toBe("hs");
  });

  it("without templates, everything is one group", () => {
    expect(shape(groupLessonsByProfile(lessons, [], "hs"))).toEqual([
      ["", ["lesson01", "lesson02", "hsLesson01", "odd"]],
    ]);
  });
});
