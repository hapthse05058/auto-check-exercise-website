import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClassLessons,
  fetchClasses,
  fetchCourseLessons,
  fetchCourses,
  fetchGradingSchedules,
  updateClass,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AutoGradeScheduleModal from "../components/AutoGradeScheduleModal.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { scheduleSummary } from "../lib/autoGrade.js";
import { formatVn } from "../lib/scheduleTime.js";
import { LESSON_OPTIONS } from "../shared/constant.js";

/** "lesson05" -> "BUỔI 05" (falls back to the raw value / a dash). */
function lessonLabel(currentLesson) {
  if (!currentLesson) return "—";
  return (
    LESSON_OPTIONS.find((o) => o.value === currentLesson)?.label ||
    currentLesson
  );
}

export default function ClassManagePage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [isAdmin, setIsAdmin] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active | inactive | all
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("classManage.loading"));

  // Edit modal state.
  const [active, setActive] = useState(null); // the class being edited
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", lessonId: "", courseId: "" });
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Every course, hidden ones included: classes on a hidden course still
  // show its name.
  const [courses, setCourses] = useState([]);
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  // Auto-grading schedules by classId, and the class whose modal is open.
  const [schedules, setSchedules] = useState({});
  const [scheduleFor, setScheduleFor] = useState(null);

  async function reloadSchedules() {
    try {
      const list = await fetchGradingSchedules();
      setSchedules(Object.fromEntries(list.map((s) => [s.classId, s])));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Schedules fetch failed:", error);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const admin = isAdminEmail(teacherInfo.gmail);
        setIsAdmin(admin);
        setTeacherId(teacherInfo.id);
        await reload(admin, teacherInfo.id);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading classes:", error);
        setStatus(t("classManage.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  async function reload(admin = isAdmin, tid = teacherId) {
    setLoading(true);
    setStatus(t("classManage.loading"));
    try {
      const list = admin ? await fetchAllClasses() : await fetchClasses(tid);
      const normalized = list.map((c) => ({
        ...c,
        isActive: c.isActive !== false,
      }));
      setClasses(normalized);
      setStatus(t("classManage.countClasses", { n: normalized.length }));
      reloadSchedules();
      fetchCourses({ includeInactive: true })
        .then((list) => setCourses(Array.isArray(list) ? list : []))
        .catch((error) => {
          if (error.message !== "RE-AUTH_NEEDED")
            console.error("Courses fetch failed:", error);
        });
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Reload error:", error);
      setStatus(t("classManage.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter((c) => {
      if (statusFilter === "active" && !c.isActive) return false;
      if (statusFilter === "inactive" && c.isActive) return false;
      if (!q) return true;
      const haystack = [
        c.name || "",
        c.id || "",
        ...(Array.isArray(c.teacherNames) ? c.teacherNames : []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [classes, search, statusFilter]);

  const openEdit = async (cls) => {
    setActive(cls);
    setForm({
      name: cls.name || "",
      lessonId: cls.currentLesson || "",
      courseId: cls.courseId || "",
    });
    setFormError("");
    setLessons([]);
    setEditOpen(true);
    setLessonsLoading(true);
    try {
      const lessonList = await fetchClassLessons(cls.id);
      setLessons(lessonList);
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        console.error("Error fetching lessons:", error);
      }
    } finally {
      setLessonsLoading(false);
    }
  };

  /** Another course: its lessons, keeping the current one when it is there. */
  const changeCourse = async (courseId) => {
    setForm((prev) => ({ ...prev, courseId }));
    setLessons([]);
    if (!courseId) return;
    setLessonsLoading(true);
    try {
      const lessonList = await fetchCourseLessons(courseId);
      setLessons(lessonList);
      setForm((prev) => ({
        ...prev,
        lessonId: lessonList.some((l) => l.id === prev.lessonId)
          ? prev.lessonId
          : "",
      }));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Error fetching lessons:", error);
    } finally {
      setLessonsLoading(false);
    }
  };

  // The courses a class may move to: the visible ones, plus its own.
  const courseOptions = courses.filter(
    (course) => course.isActive || course.id === active?.courseId,
  );

  const closeEdit = () => {
    setEditOpen(false);
    setActive(null);
    setForm({ name: "", lessonId: "", courseId: "" });
    setLessons([]);
    setFormError("");
  };

  const handleSave = async () => {
    const newName = form.name.trim();
    if (!newName) {
      setFormError(t("classManage.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const nameChanged = newName !== (active.name || "");
      const courseChanged =
        form.courseId && form.courseId !== (active.courseId || "");
      const lessonChanged =
        form.lessonId && form.lessonId !== (active.currentLesson || "");
      if (courseChanged && !form.lessonId) {
        setFormError(t("classManage.lessonRequired"));
        return;
      }

      if (nameChanged || courseChanged) {
        const res = await updateClass(active.id, {
          ...(nameChanged ? { name: newName } : {}),
          // A new course carries its lesson in the same request: the class
          // is never on a course that lacks its current lesson.
          ...(courseChanged
            ? { courseId: form.courseId, currentLesson: form.lessonId }
            : {}),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          setFormError(
            res.status === 409
              ? t("classManage.nameDuplicate")
              : courseErrorFor(d?.error),
          );
          return;
        }
      }
      if (lessonChanged && !courseChanged) {
        const ok = await updateCurrentLessonForClass(active.id, form.lessonId);
        if (!ok) {
          setFormError(t("classManage.saveFailed"));
          return;
        }
      }
      closeEdit();
      setStatus(t("classManage.saved"));
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        setFormError(t("classManage.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const courseErrorFor = (code) => {
    const key = `courses.error.${code}`;
    const text = code ? t(key, { classes: "", lessons: "" }) : key;
    return text === key ? t("classManage.saveFailed") : text;
  };

  const courseLabel = (cls) => courseById.get(cls.courseId)?.name || "—";

  const handleDeactivate = async (cls) => {
    if (!window.confirm(t("classManage.deactivateConfirm"))) return;
    try {
      const res = await updateClass(cls.id, { isActive: false });
      if (!res.ok) {
        setStatus(t("classManage.deactivateFailed"));
        return;
      }
      setStatus(t("classManage.deactivated"));
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        setStatus(t("classManage.deactivateFailed"));
      }
    }
  };

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("classManage.title")}{" "}
              <span className="count-badge">{classes.length}</span>
            </h2>
            <p>{t("classManage.subtitle")}</p>
          </div>
        </div>

        <div className="cache-search">
          <input
            type="text"
            placeholder={t("classManage.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">{t("classManage.statusActive")}</option>
            <option value="inactive">{t("classManage.statusInactive")}</option>
            <option value="all">{t("classManage.statusAll")}</option>
          </select>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("classManage.loading")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-school" aria-hidden="true" />
            <p>{t("classManage.empty")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th>{t("classManage.colName")}</th>
                  <th>{t("classManage.colCode")}</th>
                  <th>{t("classManage.colCourse")}</th>
                  {isAdmin && <th>{t("classManage.colTeacher")}</th>}
                  <th>{t("classManage.colCurrentLesson")}</th>
                  <th>{t("autoGrade.colHeader")}</th>
                  <th>{t("classManage.colStatus")}</th>
                  <th>{t("classManage.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="cell-date">{c.id}</td>
                    <td>{courseLabel(c)}</td>
                    {isAdmin && (
                      <td>
                        {Array.isArray(c.teacherNames)
                          ? c.teacherNames.join(", ")
                          : "—"}
                      </td>
                    )}
                    <td>{lessonLabel(c.currentLesson)}</td>
                    <td className="auto-grade-cell">
                      {schedules[c.id]?.enabled && schedules[c.id].next ? (
                        <>
                          {scheduleSummary(schedules[c.id], t)}
                          <br />
                          {t("autoGrade.summaryOn", {
                            runAt: formatVn(schedules[c.id].next.runAt),
                          })}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {c.isActive
                        ? t("classManage.statusActive")
                        : t("classManage.statusInactive")}
                    </td>
                    <td className="cell-actions">
                      {c.isActive ? (
                        <>
                          <button
                            className="btn-icon"
                            title={t("classManage.edit")}
                            aria-label={t("classManage.edit")}
                            onClick={() => openEdit(c)}
                          >
                            <i className="ti ti-edit" aria-hidden="true" />
                          </button>
                          <button
                            className="btn-icon"
                            title={t("autoGrade.button")}
                            aria-label={t("autoGrade.button")}
                            onClick={() => setScheduleFor(c)}
                          >
                            <i className="ti ti-clock" aria-hidden="true" />
                          </button>
                          <button
                            className="btn-cancel"
                            onClick={() => handleDeactivate(c)}
                          >
                            {t("classManage.deactivate")}
                          </button>
                        </>
                      ) : (
                        <span className="cell-date">
                          {t("classManage.statusInactive")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="status-line">{status}</div>

        {scheduleFor && (
          <AutoGradeScheduleModal
            cls={scheduleFor}
            onClose={() => setScheduleFor(null)}
            onSaved={reloadSchedules}
          />
        )}

        {/* Edit modal */}
        {editOpen && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("classManage.editTitle")}</h3>
              </div>
              <div className="field-group">
                <label>{t("classManage.nameLabel")}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="field-group">
                <label>{t("classManage.courseLabel")}</label>
                <select
                  value={form.courseId}
                  onChange={(e) => changeCourse(e.target.value)}
                  disabled={saving}
                >
                  {!active.courseId && (
                    <option value="">{t("classManage.noCourse")}</option>
                  )}
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                      {course.isActive ? "" : ` (${t("courses.hidden")})`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>{t("classManage.currentLessonLabel")}</label>
                <select
                  value={form.lessonId}
                  onChange={(e) =>
                    setForm({ ...form, lessonId: e.target.value })
                  }
                  disabled={lessonsLoading || lessons.length === 0}
                >
                  <option value="">
                    {lessonsLoading
                      ? t("classManage.loading")
                      : t("classManage.noLesson")}
                  </option>
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.name}
                    </option>
                  ))}
                </select>
              </div>
              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeEdit}
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
