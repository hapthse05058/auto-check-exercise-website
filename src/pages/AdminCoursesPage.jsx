import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createCourse,
  fetchAllLessons,
  fetchClassTypes,
  fetchCourses,
  updateCourse,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import DataTable from "../components/DataTable.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { courseErrorText, groupLessonsByProfile } from "../lib/courses.js";

const EMPTY_FORM = { name: "", lessonIds: [], gradingProfile: "basic" };

/** How a course's classes are graded — backend lib/courses.js GRADING_PROFILES. */
const GRADING_PROFILES = ["basic", "ielts", "hs"];

/**
 * Admin: the courses a class can follow (Basic, IELTS, …), each with its
 * lessons. Hiding a course keeps it working for the classes already on it;
 * new classes can no longer pick it.
 */
export default function AdminCoursesPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("courses.loading"));

  // Modal: "create" | "edit" | null
  const [modal, setModal] = useState(null);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const lessonName = useMemo(
    () => new Map(lessons.map((lesson) => [lesson.id, lesson.name])),
    [lessons],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo || !isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        const [, lessonList, templateList] = await Promise.all([
          reload(),
          fetchAllLessons(),
          // Only groups the lesson picker; without it the picker is one list.
          fetchClassTypes().catch(() => []),
        ]);
        if (cancelled) return;
        setLessons(Array.isArray(lessonList) ? lessonList : []);
        setTemplates(templateList);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading courses:", error);
        setStatus(t("courses.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  async function reload() {
    setLoading(true);
    try {
      const list = await fetchCourses({ includeInactive: true });
      setCourses(list);
      setStatus(t("courses.count", { n: list.length }));
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Courses reload error:", error);
      setStatus(t("courses.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const shown = courses.filter((course) => showHidden || course.isActive);

  const lessonGroups = useMemo(
    () => groupLessonsByProfile(lessons, templates, form.gradingProfile),
    [lessons, templates, form.gradingProfile],
  );

  const openCreate = () => {
    setActive(null);
    // Preselect the lessons of the default profile's templates only.
    const groups = groupLessonsByProfile(
      lessons,
      templates,
      EMPTY_FORM.gradingProfile,
    );
    const own = groups.find((g) => g.key === EMPTY_FORM.gradingProfile);
    setForm({
      ...EMPTY_FORM,
      lessonIds: (own ? own.lessons : lessons).map((lesson) => lesson.id),
    });
    setFormError("");
    setModal("create");
  };

  const openEdit = (course) => {
    setActive(course);
    setForm({
      name: course.name,
      lessonIds: course.lessonIds,
      gradingProfile: course.gradingProfile || "basic",
    });
    setFormError("");
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setActive(null);
    setFormError("");
  };

  /** Selects (or clears) every lesson of one picker group. */
  const setGroup = (group, on) =>
    setForm((prev) => {
      const ids = new Set(group.lessons.map((lesson) => lesson.id));
      const rest = prev.lessonIds.filter((id) => !ids.has(id));
      return { ...prev, lessonIds: on ? [...rest, ...ids] : rest };
    });

  const groupTitle = (group) =>
    group.profiles.length
      ? group.profiles.map((p) => t(`courses.profile.${p}`)).join(" / ")
      : t("courses.otherLessons");

  const toggleLesson = (id) =>
    setForm((prev) => ({
      ...prev,
      lessonIds: prev.lessonIds.includes(id)
        ? prev.lessonIds.filter((x) => x !== id)
        : [...prev.lessonIds, id],
    }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError(t("courses.error.name_required"));
      return;
    }
    if (form.lessonIds.length === 0) {
      setFormError(t("courses.error.lessons_required"));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        lessonIds: form.lessonIds,
        gradingProfile: form.gradingProfile,
      };
      if (modal === "create") {
        await createCourse(body);
        setStatus(t("courses.created", { name: body.name }));
      } else {
        await updateCourse(active.id, body);
        setStatus(t("courses.saved", { name: body.name }));
      }
      closeModal();
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setFormError(courseErrorText(error, t));
    } finally {
      setSaving(false);
    }
  };

  const toggleHidden = async (course) => {
    try {
      await updateCourse(course.id, { isActive: !course.isActive });
      setStatus(
        t(course.isActive ? "courses.hiddenDone" : "courses.shownDone", {
          name: course.name,
        }),
      );
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setStatus(courseErrorText(error, t));
    }
  };

  const columns = [
    { id: "name", header: t("courses.colName"), accessorFn: (c) => c.name },
    {
      id: "grading",
      header: t("courses.colGrading"),
      accessorFn: (c) => t(`courses.profile.${c.gradingProfile || "basic"}`),
    },
    {
      id: "lessons",
      header: t("courses.colLessons"),
      accessorFn: (c) => c.lessonIds.length,
      meta: { cellProps: (c) => ({ title: c.lessonIds.join(", ") }) },
      cell: ({ getValue }) => t("courses.lessonCount", { n: getValue() }),
    },
    {
      id: "status",
      header: t("courses.colStatus"),
      accessorFn: (c) =>
        c.isActive ? t("courses.visible") : t("courses.hidden"),
    },
    {
      id: "action",
      header: t("courses.colAction"),
      meta: { className: "cell-actions" },
      cell: ({ row }) => {
        const course = row.original;
        return (
          <div className="row-actions">
            <button
              className="btn-icon"
              title={t("courses.edit")}
              aria-label={t("courses.edit")}
              onClick={() => openEdit(course)}
            >
              <i className="ti ti-edit" aria-hidden="true" />
            </button>
            <button className="btn-cancel" onClick={() => toggleHidden(course)}>
              {course.isActive ? t("courses.hide") : t("courses.show")}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("courses.title")}{" "}
              <span className="count-badge">{courses.length}</span>
            </h2>
            <p>{t("courses.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openCreate}>
            <i className="ti ti-plus" aria-hidden="true" /> {t("courses.add")}
          </button>
        </div>

        <div className="cache-search">
          <label className="cache-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            <span>{t("courses.showHidden")}</span>
          </label>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("courses.loading")}</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-books" aria-hidden="true" />
            <p>{t("courses.empty")}</p>
          </div>
        ) : (
          <DataTable data={shown} columns={columns} getRowId={(c) => c.id} />
        )}

        <div className="status-line">{status}</div>

        {modal && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>
                  {modal === "create"
                    ? t("courses.createTitle")
                    : t("courses.editTitle")}
                </h3>
              </div>
              <div className="field-group">
                <label>
                  {t("courses.nameLabel")}{" "}
                  <span className="required-mark">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="field-group">
                <label>{t("courses.gradingLabel")}</label>
                <select
                  value={form.gradingProfile}
                  onChange={(e) =>
                    setForm({ ...form, gradingProfile: e.target.value })
                  }
                >
                  {GRADING_PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                      {t(`courses.profile.${profile}`)}
                    </option>
                  ))}
                </select>
                <small className="field-note">{t("courses.gradingHint")}</small>
              </div>
              <div className="field-group">
                <label>
                  {t("courses.lessonsLabel", { n: form.lessonIds.length })}
                </label>
                {lessonGroups.map((group) => (
                  <div key={group.key} className="course-lesson-group">
                    <div className="course-lesson-actions">
                      {lessonGroups.length > 1 && (
                        <strong className="course-lesson-group-title">
                          {t("courses.lessonGroup", {
                            name: groupTitle(group),
                            n: group.lessons.filter((l) =>
                              form.lessonIds.includes(l.id),
                            ).length,
                            total: group.lessons.length,
                          })}
                        </strong>
                      )}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setGroup(group, true)}
                      >
                        {t("courses.selectAll")}
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setGroup(group, false)}
                      >
                        {t("courses.selectNone")}
                      </button>
                    </div>
                    <div className="course-lesson-grid">
                      {group.lessons.map((lesson) => (
                        <label key={lesson.id} className="cache-toggle">
                          <input
                            type="checkbox"
                            checked={form.lessonIds.includes(lesson.id)}
                            onChange={() => toggleLesson(lesson.id)}
                          />
                          <span>{lessonName.get(lesson.id) || lesson.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
