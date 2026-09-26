import { describe, expect, it } from "vitest";

import { courseErrorText } from "../src/lib/courses.js";

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
