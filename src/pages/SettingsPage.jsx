import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClassLessons,
  fetchClasses,
  fetchCourses,
  fetchCurrentLesson,
  fetchGradingSchedule,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AutoGradeScheduleModal from "../components/AutoGradeScheduleModal.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { updateLessonTemplate } from "../lib/grading.js";
import { formatVn } from "../lib/scheduleTime.js";
import { playSuccessSound } from "../lib/sound.js";

/**
 * The ☰ menu's "Settings" group — a class's occasional set-up, kept off the
 * grading screen:
 *  - section "autoGrade": the weekly auto-grading schedule;
 *  - section "template":  IELTS only, brings lessons X to Y of every
 *    student's doc to the current feedback template (backend
 *    gradingJobs.updateTemplates).
 */
export default function SettingsPage({ section }) {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState(null);
  const [classId, setClassId] = useState("");
  const [lessons, setLessons] = useState([]);
  // The template update's range, "from" and "to" lesson (the same for one).
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [running, setRunning] = useState(false);
  // { phase: "idle" | "running" | "done" | "error", text }
  const [status, setStatus] = useState({ phase: "idle", text: "" });
  const lessonsReq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacher = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacher) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const list = isAdminEmail(teacher.gmail)
          ? await fetchAllClasses()
          : await fetchClasses(teacher.id);
        if (!cancelled) setClasses(list.filter((c) => c.isActive !== false));
        const allCourses = await fetchCourses({ includeInactive: true });
        if (!cancelled) setCourses(allCourses);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Settings load failed:", error);
        setStatus({ phase: "error", text: t("settings.loadFailed") });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on entry
  }, [loadTeacherInfo, navigate]);

  // A different menu item opens with a clean status line.
  useEffect(() => {
    setStatus({ phase: "idle", text: "" });
  }, [section]);

  const selectedClass = classes.find((c) => c.id === classId);
  const course = selectedClass?.courseId
    ? courses?.find((c) => c.id === selectedClass.courseId)
    : null;
  // Unknown until the course list is in (null); no course means Basic.
  const profile = !selectedClass
    ? null
    : !selectedClass.courseId
      ? "basic"
      : courses
        ? course?.gradingProfile || "basic"
        : null;

  const refreshSchedule = async (id) => {
    setSchedule(null);
    if (!id) return;
    try {
      setSchedule(await fetchGradingSchedule(id));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Grading schedule fetch failed:", error);
    }
  };

  const handleClassChange = async (id) => {
    const req = ++lessonsReq.current;
    const stale = () => req !== lessonsReq.current;
    setClassId(id);
    setLessons([]);
    setFromId("");
    setToId("");
    setStatus({ phase: "idle", text: "" });
    refreshSchedule(id);
    if (!id) return;
    setLessonsLoading(true);
    try {
      const list = await fetchClassLessons(id);
      if (stale()) return;
      setLessons(list);
      const current = await fetchCurrentLesson(id);
      if (!stale() && list.some((l) => l.id === current)) {
        setFromId(current);
        setToId(current);
      }
    } catch (error) {
      if (stale() || error.message === "RE-AUTH_NEEDED") return;
      console.error("Lessons fetch failed:", error);
      setStatus({ phase: "error", text: t("grade.loadLessonsFailed") });
    } finally {
      if (!stale()) setLessonsLoading(false);
    }
  };

  // The lessons from "from" to "to", in the class's order.
  const fromIndex = lessons.findIndex((l) => l.id === fromId);
  const toIndex = lessons.findIndex((l) => l.id === toId);
  const range =
    fromIndex >= 0 && toIndex >= fromIndex
      ? lessons.slice(fromIndex, toIndex + 1)
      : [];

  const handleFromChange = (id) => {
    setFromId(id);
    // "To" never comes before "from".
    const from = lessons.findIndex((l) => l.id === id);
    if (!toId || lessons.findIndex((l) => l.id === toId) < from) setToId(id);
  };

  const handleUpdateTemplate = async () => {
    if (running || !classId || !range.length) return;
    const lessonLabel =
      range.length === 1
        ? range[0].name
        : t("settings.templateRange", {
            from: range[0].name,
            to: range.at(-1).name,
            n: range.length,
          });
    if (
      !window.confirm(
        t("grade.confirmUpdateTemplate", {
          lesson: lessonLabel,
          class: selectedClass?.name,
        }),
      )
    )
      return;
    setRunning(true);
    setStatus({ phase: "running", text: t("grade.updatingTemplate") });
    try {
      const r = await updateLessonTemplate({
        classId,
        lessonIds: range.map((l) => l.id),
      });
      const lines = [t("grade.templateUpdated", r)];
      if (r.unchanged) {
        lines.push(t("grade.templateUnchanged", { n: r.unchanged }));
      }
      if (r.failed + r.skipped) {
        lines.push(t("grade.templateNotUpdated", { n: r.failed + r.skipped }));
      }
      if (r.noTable) lines.push(t("grade.templateNoTable", { n: r.noTable }));
      setStatus({ phase: r.failed ? "error" : "done", text: lines.join("\n") });
      if (r.updated) playSuccessSound();
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Template update error:", error);
      const text =
        error.message === "GOOGLE_REAUTH_REQUIRED"
          ? t("grading.reauthToStart")
          : error.message === "no_docs"
            ? t("grading.noDocs")
            : error.message === "job_in_progress"
              ? t("grade.templateJobRunning")
              : error.message === "not_ielts_class"
                ? t("settings.templateIeltsOnly")
                : error.message === "too_many_lessons"
                  ? t("settings.templateTooManyLessons")
                  : t("grade.templateUpdateFailed", { msg: error.message });
      setStatus({ phase: "error", text });
    } finally {
      setRunning(false);
    }
  };

  const isTemplate = section === "template";

  return (
    <div className="page-wide">
      <h2 className="page-title">
        {t(isTemplate ? "settings.templateTitle" : "settings.autoGradeTitle")}
      </h2>
      <p className="field-hint">
        <i className="ti ti-info-circle" aria-hidden="true" />
        {t(isTemplate ? "settings.templateIntro" : "settings.autoGradeIntro")}
      </p>
      <SearchableSelect
        className="mb-1"
        value={classId}
        onChange={handleClassChange}
        options={classes}
        disabled={running}
        placeholder={t("grade.selectClass")}
        searchPlaceholder={t("common.searchClassPlaceholder")}
        noResultsText={t("common.noClassesFound")}
      />

      {!isTemplate && classId && (
        <>
          <p className="auto-grade-summary">
            {schedule?.enabled && schedule.next
              ? t("autoGrade.summaryOn", {
                  runAt: formatVn(schedule.next.runAt),
                })
              : t("autoGrade.summaryOff")}
          </p>
          <div className="button-row mb-1">
            <button
              className="primary-btn with-icon"
              onClick={() => setScheduleOpen(true)}
            >
              <i className="ti ti-clock" aria-hidden="true" />
              {t("autoGrade.button")}
            </button>
          </div>
        </>
      )}

      {isTemplate && classId && profile && profile !== "ielts" && (
        <p className="field-hint">
          <i className="ti ti-info-circle" aria-hidden="true" />
          {t("settings.templateIeltsOnly")}
        </p>
      )}
      {isTemplate && profile === "ielts" && (
        <>
          <div className="template-range mb-1">
            {[
              ["templateFrom", fromId, handleFromChange, lessons],
              [
                "templateTo",
                toId,
                setToId,
                fromIndex >= 0 ? lessons.slice(fromIndex) : lessons,
              ],
            ].map(([label, value, onChange, options]) => (
              <div className="field-group" key={label}>
                <label htmlFor={`template-${label}`}>
                  {t(`settings.${label}`)}
                </label>
                <select
                  id={`template-${label}`}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={lessonsLoading || lessons.length === 0 || running}
                >
                  <option value="">
                    {lessonsLoading
                      ? t("grade.loadingLessons")
                      : t("grade.selectLesson")}
                  </option>
                  {options.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {range.length > 1 && (
            <p className="field-hint">
              {t("settings.templateRangeCount", { n: range.length })}
            </p>
          )}
          <div className="button-row mb-1">
            <button
              className="primary-btn with-icon"
              onClick={handleUpdateTemplate}
              disabled={!range.length || running}
            >
              <i className="ti ti-layout-rows" aria-hidden="true" />
              {running
                ? t("grade.updatingTemplate")
                : t("grade.updateTemplate")}
            </button>
          </div>
        </>
      )}

      {status.text && (
        <div className="status-output">
          {status.phase === "running" ? (
            <span className="status-loading">
              <span className="spinner" aria-hidden="true" />
              <span>{status.text}</span>
            </span>
          ) : (
            status.text
          )}
        </div>
      )}

      {scheduleOpen && selectedClass && (
        <AutoGradeScheduleModal
          cls={selectedClass}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => refreshSchedule(classId)}
        />
      )}
    </div>
  );
}
