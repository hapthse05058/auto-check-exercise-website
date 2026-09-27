import { removeAccents } from "./text.js";
import { LESSON_OPTIONS } from "../shared/constant.js";

/**
 * Gộp mọi trường có thể tìm kiếm của một lớp thành 1 chuỗi đã bỏ dấu/viết thường:
 * tên lớp, mã lớp, buổi học hiện tại (id + nhãn "BUỔI xx"), tên & email giáo viên.
 *
 * Mọi trường đều fallback về "" trước khi nối, tránh chuỗi "undefined"/"null" lọt
 * vào haystack (khi đó tìm "under" sẽ khớp nhầm mọi lớp).
 *
 * @param {object} cls lớp học
 * @param {Map<string, Array<{name?: string, gmail?: string}>>} [teachersByClassId]
 *   map classId (dạng chuỗi) -> danh sách giáo viên; một lớp có thể có nhiều GV.
 */
export function classHaystack(cls, teachersByClassId = new Map()) {
  const teachers = teachersByClassId?.get(String(cls?.id ?? "")) || [];
  return removeAccents(
    [
      cls?.name || "",
      cls?.id ? String(cls.id) : "",
      cls?.currentLesson || "",
      LESSON_OPTIONS.find((o) => o.value === cls?.currentLesson)?.label || "",
      Array.isArray(cls?.teacherNames) ? cls.teacherNames.join(" ") : "",
      teachers.map((t) => `${t?.name || ""} ${t?.gmail || ""}`).join(" "),
    ].join(" "),
  );
}

/**
 * Lọc danh sách lớp theo từ khóa tự do (khớp tên lớp, mã lớp, buổi học, GV).
 * Từ khóa được tách theo khoảng trắng và PHẢI khớp tất cả (AND).
 *
 * @param {string} [keepId] lớp đang được chọn — luôn giữ lại để ô chọn không bị
 *   trống khi từ khóa không khớp lớp đó.
 */
export function filterClasses(classes, query, teachersByClassId, keepId = "") {
  const tokens = removeAccents(query || "")
    .split(/\s+/)
    .filter(Boolean);
  // Giữ nguyên tham chiếu mảng cũ khi không tìm gì -> không re-render thừa.
  if (tokens.length === 0) return classes;
  // Không dùng `if (keepId)`: id dạng số 0 là falsy nhưng vẫn hợp lệ.
  const hasKeep = keepId !== null && keepId !== undefined && keepId !== "";
  return classes.filter((cls) => {
    if (hasKeep && String(cls?.id) === String(keepId)) return true;
    const hay = classHaystack(cls, teachersByClassId);
    return tokens.every((token) => hay.includes(token));
  });
}

/**
 * Các trường có thể chọn trong dropdown tìm kiếm của màn Quản lý lớp học.
 * "all" = tìm trên mọi trường còn lại.
 */
export const CLASS_SEARCH_FIELDS = [
  "all",
  "name",
  "course",
  "teacher",
  "lesson",
];

/**
 * "5", "05", "buoi 5", "buổi 05" -> 5; còn lại -> null. Gõ số thì so đúng số
 * buổi, để "4" không khớp nhầm BUỔI 14, 24.
 */
function lessonNumberQuery(q) {
  const m = q.match(/^(?:buoi\s*)?(\d+)$/);
  return m ? Number(m[1]) : null;
}

function lessonMatches(label, q) {
  const text = removeAccents(label || "");
  const n = lessonNumberQuery(q);
  if (n === null) return text.includes(q);
  const own = text.match(/\d+/);
  return !!own && Number(own[0]) === n;
}

/**
 * Lớp có khớp từ khóa trên trường `field` không (không phân biệt dấu/hoa thường).
 *
 * @param {{name?: string, course?: string, teachers?: string[], lesson?: string}} values
 *   giá trị hiển thị của lớp: tên lớp, tên khóa, tên + email các GV, nhãn buổi
 *   hiện tại ("BUỔI 05").
 * @param {string} field một trong CLASS_SEARCH_FIELDS; ngoài danh sách = "all".
 */
export function classFieldMatches(values, field, query) {
  const q = removeAccents(query || "");
  if (!q) return true;
  const has = (text) => removeAccents(text || "").includes(q);
  const matchers = {
    name: () => has(values?.name),
    course: () => has(values?.course),
    teacher: () => (values?.teachers || []).some(has),
    lesson: () => lessonMatches(values?.lesson, q),
  };
  if (matchers[field]) return matchers[field]();
  return Object.values(matchers).some((match) => match());
}
