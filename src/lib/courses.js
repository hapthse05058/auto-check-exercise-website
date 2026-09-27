/**
 * Courses (backend lib/courses.js): Basic, IELTS, … A class follows one
 * course, which decides its lessons; admins manage the courses.
 */

/**
 * The doc templates a class on `course` may use: those of the course's
 * grading profile (a course without one is Basic, as in the backend).
 */
export function templatesForCourse(templates, course) {
  if (!course) return [];
  const profile = course.gradingProfile || "basic";
  return (templates || []).filter(
    (template) => (template.gradingProfile || "basic") === profile,
  );
}

/** The template's name for a class's `classType` code, or the code itself. */
export function templateName(templates, code) {
  if (!code) return "";
  return (templates || []).find((t) => t.code === code)?.name || code;
}

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
