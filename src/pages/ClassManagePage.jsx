import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClassLessons,
  fetchClassTypes,
  fetchClasses,
  fetchCourseLessons,
  fetchCourses,
  fetchGradingSchedules,
  updateClass,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AutoGradeScheduleModal from "../components/AutoGradeScheduleModal.jsx";
import ColumnPicker from "../components/ColumnPicker.jsx";
import DataTable from "../components/DataTable.jsx";
import { isAdminEmail } from "../config.js";
import { useColumnVisibility } from "../hooks/useColumnVisibility.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { scheduleSummary } from "../lib/autoGrade.js";
import { CLASS_SEARCH_FIELDS, classFieldMatches } from "../lib/classSearch.js";
import { templateName, templatesForCourse } from "../lib/courses.js";
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

/** Columns shown until the user picks their own; the rest start hidden. */
const DEFAULT_COLUMNS = {
  name: true,
  code: false,
  course: true,
  template: false,
  teacher: false,
  currentLesson: true,
  autoGrade: false,
  status: false,
  createdAt: false,
};

/**
 * A class's createdAt as ISO, or undefined for classes created before it was
 * stored. Also takes the {_seconds} a Firestore Timestamp serializes to.
 */
function createdAtIso(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  const seconds = value._seconds ?? value.seconds;
  return Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

/** ISO -> "27/09/2026" in Vietnam time. */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ClassManagePage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [isAdmin, setIsAdmin] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all"); // CLASS_SEARCH_FIELDS
  const [statusFilter, setStatusFilter] = useState("active"); // active | inactive | all
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("classManage.loading"));

  // Edit modal state.
  const [active, setActive] = useState(null); // the class being edited
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    lessonId: "",
    courseId: "",
    template: "",
  });
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Every course, hidden ones included: classes on a hidden course still
  // show its name.
  const [courses, setCourses] = useState([]);
  // The student-doc templates; a class uses one of its course's.
  const [templates, setTemplates] = useState([]);
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const [columnVisibility, setColumnVisibility, resetColumns] =
    useColumnVisibility("classManageCols", DEFAULT_COLUMNS);

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
      fetchClassTypes()
        .then(setTemplates)
        .catch((error) => {
          if (error.message !== "RE-AUTH_NEEDED")
            console.error("Templates fetch failed:", error);
        });
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Reload error:", error);
      setStatus(t("classManage.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const courseLabel = (cls) => courseById.get(cls.courseId)?.name || "—";
  const templateLabel = (cls) =>
    templateName(templates, cls.classType) || t("classManage.noTemplate");
  const teachersOf = (cls) => [
    ...(Array.isArray(cls.teacherNames) ? cls.teacherNames : []),
    ...(Array.isArray(cls.teacherEmails) ? cls.teacherEmails : []),
  ];

  const filtered = useMemo(
    () =>
      classes.filter((c) => {
        if (statusFilter === "active" && !c.isActive) return false;
        if (statusFilter === "inactive" && c.isActive) return false;
        return classFieldMatches(
          {
            name: c.name,
            course: courseById.get(c.courseId)?.name,
            teachers: teachersOf(c),
            lesson: c.currentLesson ? lessonLabel(c.currentLesson) : "",
          },
          searchField,
          search,
        );
      }),
    [classes, courseById, search, searchField, statusFilter],
  );

  // Only admins see other teachers' classes, so only they search by teacher.
  const searchFields = CLASS_SEARCH_FIELDS.filter(
    (field) => field !== "teacher" || isAdmin,
  );
  const fieldLabelKey = {
    all: "classManage.fieldAll",
    name: "classManage.fieldName",
    course: "classManage.fieldCourse",
    teacher: "classManage.fieldTeacher",
    lesson: "classManage.fieldLesson",
  };
  const placeholderKey = {
    all: "classManage.searchPlaceholder",
    name: "classManage.placeholderName",
    course: "classManage.placeholderCourse",
    teacher: "classManage.placeholderTeacher",
    lesson: "classManage.placeholderLesson",
  };

  const openEdit = async (cls) => {
    setActive(cls);
    setForm({
      name: cls.name || "",
      lessonId: cls.currentLesson || "",
      courseId: cls.courseId || "",
      template: cls.classType || "",
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
    // Its templates: the class's own when the new course has it, else the
    // only one, else none picked yet.
    const list = templatesForCourse(templates, courseById.get(courseId));
    setForm((prev) => ({
      ...prev,
      courseId,
      template: list.some((item) => item.code === prev.template)
        ? prev.template
        : list.length === 1
          ? list[0].code
          : "",
    }));
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
    setForm({ name: "", lessonId: "", courseId: "", template: "" });
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
      const formTemplates = templatesForCourse(
        templates,
        courseById.get(form.courseId),
      );
      if (form.courseId && formTemplates.length > 0 && !form.template) {
        setFormError(t("classManage.templateRequired"));
        return;
      }
      // A course without templates drops the old one ("").
      const templateChanged =
        !!form.courseId &&
        (formTemplates.length > 0 ? form.template : "") !==
          (active.classType || "");

      if (nameChanged || courseChanged || templateChanged) {
        const res = await updateClass(active.id, {
          ...(nameChanged ? { name: newName } : {}),
          // A new course carries its lesson in the same request: the class
          // is never on a course that lacks its current lesson.
          ...(courseChanged
            ? { courseId: form.courseId, currentLesson: form.lessonId }
            : {}),
          ...(templateChanged
            ? { classType: formTemplates.length > 0 ? form.template : "" }
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

  const editTemplates = templatesForCourse(
    templates,
    courseById.get(form.courseId),
  );

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

  // Each accessor gives the value the column sorts by; `undefined` = no value
  // (sorted last). Teacher only exists for admins.
  const columns = [
    {
      id: "name",
      header: t("classManage.colName"),
      accessorFn: (c) => c.name || undefined,
    },
    {
      id: "code",
      header: t("classManage.colCode"),
      accessorFn: (c) => c.id,
      meta: { className: "cell-date" },
    },
    {
      id: "course",
      header: t("classManage.colCourse"),
      accessorFn: (c) => courseById.get(c.courseId)?.name,
      cell: ({ row }) => courseLabel(row.original),
    },
    {
      id: "template",
      header: t("classManage.colTemplate"),
      accessorFn: (c) => templateName(templates, c.classType) || undefined,
      cell: ({ row }) => templateLabel(row.original),
    },
    ...(isAdmin
      ? [
          {
            id: "teacher",
            header: t("classManage.colTeacher"),
            accessorFn: (c) =>
              Array.isArray(c.teacherNames) && c.teacherNames.length
                ? c.teacherNames.join(", ")
                : undefined,
            cell: ({ getValue }) => getValue() || "—",
          },
        ]
      : []),
    {
      id: "currentLesson",
      header: t("classManage.colCurrentLesson"),
      accessorFn: (c) =>
        c.currentLesson ? lessonLabel(c.currentLesson) : undefined,
      cell: ({ getValue }) => getValue() || "—",
    },
    {
      id: "autoGrade",
      header: t("autoGrade.colHeader"),
      // Sorted by the next run time.
      accessorFn: (c) =>
        schedules[c.id]?.enabled ? schedules[c.id].next?.runAt : undefined,
      meta: { className: "auto-grade-cell" },
      cell: ({ row }) => {
        const schedule = schedules[row.original.id];
        return schedule?.enabled && schedule.next ? (
          <>
            {scheduleSummary(schedule, t)}
            <br />
            {t("autoGrade.summaryOn", {
              runAt: formatVn(schedule.next.runAt),
            })}
          </>
        ) : (
          "—"
        );
      },
    },
    {
      id: "status",
      header: t("classManage.colStatus"),
      accessorFn: (c) =>
        c.isActive
          ? t("classManage.statusActive")
          : t("classManage.statusInactive"),
    },
    {
      id: "createdAt",
      header: t("classManage.colCreatedAt"),
      accessorFn: (c) => createdAtIso(c.createdAt),
      meta: { className: "cell-date" },
      cell: ({ getValue }) => (getValue() ? formatDate(getValue()) : "—"),
    },
    {
      id: "action",
      header: t("classManage.colAction"),
      enableHiding: false,
      meta: { className: "cell-actions" },
      cell: ({ row }) => {
        const c = row.original;
        if (!c.isActive) {
          return (
            <span className="cell-date">{t("classManage.statusInactive")}</span>
          );
        }
        return (
          <div className="row-actions">
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
            <button className="btn-cancel" onClick={() => handleDeactivate(c)}>
              {t("classManage.deactivate")}
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
              {t("classManage.title")}{" "}
              <span className="count-badge">{classes.length}</span>
            </h2>
            <p>{t("classManage.subtitle")}</p>
          </div>
        </div>

        <div className="cache-search">
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
            aria-label={t("classManage.searchIn")}
            title={t("classManage.searchIn")}
          >
            {searchFields.map((field) => (
              <option key={field} value={field}>
                {t(fieldLabelKey[field])}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder={t(placeholderKey[searchField])}
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
          <ColumnPicker
            columns={columns}
            visibility={columnVisibility}
            onChange={setColumnVisibility}
            onReset={resetColumns}
          />
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
          <DataTable
            data={filtered}
            columns={columns}
            getRowId={(c) => c.id}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
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
              {editTemplates.length > 0 && (
                <div className="field-group">
                  <label>{t("classManage.templateLabel")}</label>
                  <select
                    value={form.template}
                    onChange={(e) =>
                      setForm({ ...form, template: e.target.value })
                    }
                    disabled={saving}
                  >
                    <option value="">{t("newClass.selectTemplate")}</option>
                    {editTemplates.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
