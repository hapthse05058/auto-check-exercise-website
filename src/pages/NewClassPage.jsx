import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  checkClassNameExists,
  createClass,
  fetchAllClasses,
  fetchClasses,
  fetchCourseLessons,
  fetchCourses,
  saveGradingSchedule,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AutoGradeScheduleFields from "../components/AutoGradeScheduleFields.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { scheduleErrorText, validateDeadlines } from "../lib/autoGrade.js";
import { fromVnInput } from "../lib/scheduleTime.js";

export default function NewClassPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courseId, setCourseId] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lesson, setLesson] = useState("");
  const [existingClasses, setExistingClasses] = useState([]);
  const [status, setStatus] = useState(t("newClass.intro"));
  const [saving, setSaving] = useState(false);
  // Optional weekly auto-grading, saved right after the class is created.
  const [autoGrade, setAutoGrade] = useState(false);
  const [deadlines, setDeadlines] = useState({ student: "", grader: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // An unregistered teacher (403 → null) can never use this screen in
        // the extension; route them to sign up, like GradePage does.
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const courseList = await fetchCourses();
        if (cancelled) return;
        setCourses(Array.isArray(courseList) ? courseList : []);
        // A single course: nothing to choose.
        if (courseList?.length === 1) setCourseId(courseList[0].id);
        // Admin's duplicate-name check spans all classes, not just their own.
        const classList = isAdminEmail(teacherInfo.gmail)
          ? await fetchAllClasses()
          : await fetchClasses(teacherInfo.id);
        if (!cancelled) setExistingClasses(classList);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading new-class data:", error);
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  // The lessons of the chosen course.
  useEffect(() => {
    let cancelled = false;
    setLesson("");
    setLessons([]);
    if (!courseId) return undefined;
    setLessonsLoading(true);
    fetchCourseLessons(courseId)
      .then((list) => {
        if (!cancelled) setLessons(Array.isArray(list) ? list : []);
      })
      .catch((error) => {
        if (error.message !== "RE-AUTH_NEEDED")
          console.error("Error loading lessons for new class:", error);
      })
      .finally(() => {
        if (!cancelled) setLessonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  /** Local + backend duplicate check; returns true when the name is usable. */
  const verifyClassName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("");
      return false;
    }

    const localDuplicate = existingClasses.some(
      (cls) => cls.name?.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (localDuplicate) {
      setNameError(t("newClass.duplicateName"));
      return false;
    }

    try {
      const exists = await checkClassNameExists(trimmed);
      if (exists) {
        setNameError(t("newClass.duplicateName"));
        return false;
      }
      setNameError("");
      return true;
    } catch (error) {
      console.error("Error checking class name:", error);
      setNameError(t("newClass.verifyError"));
      return false;
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("newClass.nameRequired"));
      return;
    }

    const validClassName = await verifyClassName();
    if (!validClassName) {
      setStatus(t("newClass.fixName"));
      return;
    }
    const deadlineError = autoGrade ? validateDeadlines(deadlines) : null;
    if (deadlineError) {
      setStatus(t(deadlineError, { minHours: 2 }));
      return;
    }

    setStatus(t("newClass.saving"));
    setSaving(true);
    try {
      const teacherInfo = await loadTeacherInfo();
      const response = await createClass({
        name: trimmed,
        courseId,
        currentLesson: lesson.trim(),
        teacherId: teacherInfo?.id,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setStatus(errorData?.error || t("newClass.createFailed"));
        return;
      }

      const created = await response.json().catch(() => null);
      if (autoGrade && created?.id) {
        try {
          await saveGradingSchedule(created.id, {
            studentDeadlineAt: fromVnInput(deadlines.student),
            graderDeadlineAt: fromVnInput(deadlines.grader),
          });
        } catch (error) {
          // The class exists; say what is missing and stay, so the teacher
          // can set the schedule later from the grading screen.
          setStatus(
            t("autoGrade.saveAfterCreateFailed", {
              msg: scheduleErrorText(error, t),
            }),
          );
          return;
        }
      }

      setStatus(t("newClass.created"));
      navigate(
        created?.id
          ? `/grade?classId=${encodeURIComponent(created.id)}`
          : "/grade",
      );
    } catch (error) {
      console.error("Error creating class:", error);
      setStatus(t("newClass.createError"));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!(name.trim() && courseId && lesson) && !saving;

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>{t("newClass.title")}</h4>
        <div className="form-field">
          <label htmlFor="newClassName">
            {t("newClass.name")} <span className="required-star">*</span>
          </label>
          <input
            id="newClassName"
            type="text"
            placeholder={t("newClass.namePlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError("");
            }}
            onBlur={verifyClassName}
          />
          {nameError && (
            <div className="field-note error-text">{nameError}</div>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="newClassCourse">{t("newClass.course")}</label>
          <select
            id="newClassCourse"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={coursesLoading}
          >
            <option value="">
              {coursesLoading
                ? t("newClass.loadingCourses")
                : courses.length === 0
                  ? t("newClass.noCourses")
                  : t("newClass.selectCourse")}
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="newClassLesson">{t("newClass.currentLesson")}</label>
          <select
            id="newClassLesson"
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            disabled={lessonsLoading}
          >
            <option value="">
              {lessonsLoading
                ? t("newClass.loadingLessons")
                : lessons.length === 0 && courseId
                  ? t("newClass.noLessons")
                  : t("newClass.selectLesson")}
            </option>
            {lessons.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="cache-toggle">
            <input
              type="checkbox"
              checked={autoGrade}
              onChange={(e) => setAutoGrade(e.target.checked)}
            />
            <span>{t("autoGrade.newClassToggle")}</span>
          </label>
        </div>
        {autoGrade && (
          <div className="form-field">
            <p className="field-note auto-grade-intro">
              {t("autoGrade.intro")}
            </p>
            <AutoGradeScheduleFields
              value={deadlines}
              onChange={setDeadlines}
              disabled={saving}
            />
          </div>
        )}
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/grade")}>
            {t("common.backHome")}
          </button>
          <button
            className="primary-btn"
            onClick={handleSave}
            disabled={!canSave}
          >
            {t("newClass.saveClass")}
          </button>
        </div>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
