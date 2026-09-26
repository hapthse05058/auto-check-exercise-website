/**
 * Courses (backend lib/courses.js): Basic, IELTS, … A class follows one
 * course, which decides its lessons; admins manage the courses.
 */

/** Text for an Error thrown by the course API helpers. */
export function courseErrorText(error, t) {
  const code = error?.message || "course_failed";
  const params = error?.params || {};
  const key = `courses.error.${code}`;
  const text = t(key, {
    classes: (params.classes || []).join(", "),
    lessons: (params.lessons || []).join(", "),
  });
  return text === key ? t("courses.error.course_failed") : text;
}
