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

/**
 * The course editor's lesson picker, grouped by the grading profile of each
 * lesson's doc templates (`lesson.classType` codes) — Basic's "BUỔI 01" and
 * HS's "Buổi 01" look alike, so they must not share one list. Each group:
 * `{key, profiles, lessons}` (lessons keep their order); `key` is the joined
 * profiles, "" when no template of the lesson is known. `profile` — the
 * course's own — comes first; the rest keep their first-seen order.
 */
export function groupLessonsByProfile(lessons, templates, profile) {
  const profileOf = new Map(
    (templates || []).map((t) => [t.code, t.gradingProfile || "basic"]),
  );
  const groups = new Map();
  for (const lesson of lessons || []) {
    const codes = Array.isArray(lesson.classType)
      ? lesson.classType
      : [lesson.classType].filter(Boolean);
    const profiles = [
      ...new Set(codes.map((c) => profileOf.get(c)).filter(Boolean)),
    ].sort();
    const key = profiles.join("+");
    if (!groups.has(key)) groups.set(key, { key, profiles, lessons: [] });
    groups.get(key).lessons.push(lesson);
  }
  return [...groups.values()].sort(
    (a, b) => (b.key === profile) - (a.key === profile),
  );
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
