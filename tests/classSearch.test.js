import { describe, expect, it } from "vitest";
import { classHaystack, filterClasses } from "../src/lib/classSearch.js";

const classes = [
  {
    id: "c1",
    name: "Lớp 10A",
    currentLesson: "lesson05",
    teacherNames: ["Hồng Hà"],
  },
  {
    id: "c2",
    name: "Lớp 11B",
    currentLesson: "lesson03",
    teacherNames: ["Nguyễn Văn A"],
  },
];

// c1 -> Hong Ha, c2 -> Nguyen Van A
const teachers = new Map([
  ["c1", [{ name: "Hồng Hà", gmail: "ha@example.com" }]],
  ["c2", [{ name: "Nguyễn Văn A", gmail: "vana@example.com" }]],
]);

const ids = (list) => list.map((c) => c.id);

describe("filterClasses", () => {
  it("returns the same array when the query is empty or blank", () => {
    expect(filterClasses(classes, "", teachers)).toBe(classes);
    expect(filterClasses(classes, "   ", teachers)).toBe(classes);
    expect(filterClasses(classes, null, teachers)).toBe(classes);
  });

  it("matches class name without accents or case", () => {
    expect(ids(filterClasses(classes, "lop 10", teachers))).toEqual(["c1"]);
    expect(ids(filterClasses(classes, "LỚP 11", teachers))).toEqual(["c2"]);
  });

  it("matches the class code", () => {
    expect(ids(filterClasses(classes, "c2", teachers))).toEqual(["c2"]);
  });

  it("matches the current lesson by id and by BUỔI label", () => {
    expect(ids(filterClasses(classes, "lesson05", teachers))).toEqual(["c1"]);
    expect(ids(filterClasses(classes, "BUỔI 03", teachers))).toEqual(["c2"]);
    // accented and unaccented queries agree
    expect(ids(filterClasses(classes, "buoi 03", teachers))).toEqual(["c2"]);
  });

  it("matches teacher name and gmail", () => {
    expect(ids(filterClasses(classes, "hong ha", teachers))).toEqual(["c1"]);
    expect(ids(filterClasses(classes, "vana@example.com", teachers))).toEqual([
      "c2",
    ]);
  });

  it("requires every token to match (AND)", () => {
    expect(ids(filterClasses(classes, "ha lop 10", teachers))).toEqual(["c1"]);
    expect(filterClasses(classes, "ha lop 11", teachers)).toEqual([]);
  });

  it("matches a teacher gmail when class ids are numbers on one side", () => {
    const numeric = [{ id: "123", name: "Lớp 12C" }];
    const map = new Map([[String(123), [{ name: "B", gmail: "b@x.com" }]]]);
    expect(ids(filterClasses(numeric, "b@x.com", map))).toEqual(["123"]);
  });

  it("keeps every co-teacher of a class, not just the last one", () => {
    const map = new Map([
      [
        "c1",
        [
          { name: "Hồng Hà", gmail: "ha@example.com" },
          { name: "Minh", gmail: "minh@example.com" },
        ],
      ],
    ]);
    expect(ids(filterClasses(classes, "ha@example.com", map))).toEqual(["c1"]);
    expect(ids(filterClasses(classes, "minh@example.com", map))).toEqual([
      "c1",
    ]);
  });

  it("does not match on stringified nullish fields", () => {
    const messy = [{ id: "c9", name: null, currentLesson: undefined }];
    expect(filterClasses(messy, "null", teachers)).toEqual([]);
    expect(filterClasses(messy, "undefined", teachers)).toEqual([]);
    expect(filterClasses(messy, "under", teachers)).toEqual([]);
  });

  it("keeps the selected class even when it does not match", () => {
    expect(ids(filterClasses(classes, "lop 11", teachers, "c1"))).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("does not duplicate the selected class when it also matches", () => {
    expect(ids(filterClasses(classes, "lop 10", teachers, "c1"))).toEqual([
      "c1",
    ]);
  });

  it("compares keepId as a string and treats id 0 as a real id", () => {
    const numeric = [
      { id: "123", name: "X" },
      { id: 0, name: "Zero" },
    ];
    expect(ids(filterClasses(numeric, "nomatch", teachers, 123))).toEqual([
      "123",
    ]);
    expect(ids(filterClasses(numeric, "nomatch", teachers, 0))).toEqual([0]);
    expect(filterClasses(numeric, "nomatch", teachers, "")).toEqual([]);
    expect(filterClasses(numeric, "nomatch", teachers, null)).toEqual([]);
  });

  it("works without a teachers map", () => {
    expect(() => classHaystack(classes[0])).not.toThrow();
    expect(ids(filterClasses(classes, "lop 10", undefined))).toEqual(["c1"]);
  });
});
