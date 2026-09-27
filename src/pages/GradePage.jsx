import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClassLessons,
  fetchClasses,
  fetchCourses,
  fetchCurrentLesson,
  fetchGradingJob,
  fetchGradingSchedule,
  fetchLatestGradingJob,
  fetchMyPoint,
  fetchPayerPoint,
  recordFeedbackClearSummary,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AutoGradeScheduleModal from "../components/AutoGradeScheduleModal.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  executeFeedbackClear,
  planFeedbackClear,
} from "../lib/feedbackClear.js";
import { describeJob, isJobFinished, startGradingJob } from "../lib/grading.js";
import { announcePoints } from "../lib/pointEvents.js";
import { formatVn } from "../lib/scheduleTime.js";
import { playSuccessSound } from "../lib/sound.js";

/** How often an open grading screen asks the backend for job progress. */
const JOB_POLL_MS = 4000;

export default function GradePage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // A notification links here as /grade?classId=…&lessonId=… — open that class.
  const [searchParams] = useSearchParams();
  const linkedRef = useRef(false);

  const [classes, setClasses] = useState([]);
  // The selected class's weekly auto-grading schedule (null = none / not loaded).
  const [schedule, setSchedule] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [docLinksText, setDocLinksText] = useState("");
  // { phase: "idle" | "running" | "done" | "error", text, warnings: string[] }
  // A run shows a spinner while it works and one summary line when it stops;
  // per-doc chatter would only bury the part the teacher is looking for.
  const [status, setStatus] = useState({
    phase: "idle",
    text: "",
    warnings: [],
  });
  // The start request is in flight (a few hundred ms).
  const [starting, setStarting] = useState(false);
  // The grading job shown on screen: `live` when it was started from this
  // screen (so its end is celebrated), false when merely looked up.
  const [followed, setFollowed] = useState(null); // { id, live } | null
  const [jobRunning, setJobRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveCache, setSaveCache] = useState(true);
  // Who actually pays for the selected class. An admin grading someone else's
  // class spends THAT teacher's points, so the badge must show their balance.
  const [payer, setPayer] = useState(null);
  const currentLessonRef = useRef(null);

  const refreshPoint = async () => {
    try {
      // The header badge shows it (lib/pointEvents.js).
      announcePoints(await fetchMyPoint());
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Point fetch failed:", error);
    }
  };

  const refreshPayer = async (classId) => {
    if (!classId) {
      setPayer(null);
      return;
    }
    try {
      setPayer(await fetchPayerPoint(classId));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Payer point fetch failed:", error);
      setPayer(null);
    }
  };

  const selectedClass = classes.find((cls) => cls.id === selectedClassId);

  /** Plain message, no spinner — page loading and setup errors. */
  const say = (text) => setStatus({ phase: "idle", text, warnings: [] });

  // Load teacher info + classes once on entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        say(t("grade.loadingTeacher"));
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const admin = isAdminEmail(teacherInfo.gmail);
        setIsAdmin(admin);
        refreshPoint();
        // Admin can grade any class, so load every class; teachers see their own.
        const classList = admin
          ? await fetchAllClasses()
          : await fetchClasses(teacherInfo.id);
        if (cancelled) return;
        const activeClasses = classList.filter((c) => c.isActive !== false);
        setClasses(activeClasses);
        if (activeClasses.length === 0) {
          alert(t("grade.noClasses"));
        }
        say(t("grade.ready"));
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Post-login error:", error);
        say(t("grade.loadTeacherFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; `t` is only used for status/error messages, adding it would re-fetch on language change
  }, [loadTeacherInfo, navigate]);

  const refreshSchedule = async (classId) => {
    setSchedule(null);
    if (!classId) return;
    try {
      setSchedule(await fetchGradingSchedule(classId));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Grading schedule fetch failed:", error);
    }
  };

  /**
   * `preferredLessonId` (from a notification link) is shown instead of the
   * class's current lesson — auto-grading may already have moved the class on
   * to the next one. It is only displayed, not saved as the current lesson.
   */
  const handleClassChange = async (classId, preferredLessonId = null) => {
    setSelectedClassId(classId);
    setSelectedLessonId("");
    setLessons([]);
    currentLessonRef.current = null;
    refreshPayer(classId);
    refreshSchedule(classId);
    if (!classId) return;

    setLessonsLoading(true);
    try {
      const lessonList = await fetchClassLessons(classId);
      setLessons(lessonList);

      const currentLesson = await fetchCurrentLesson(classId);
      currentLessonRef.current = currentLesson;
      const shown = [preferredLessonId, currentLesson].find(
        (id) => id && lessonList.some((lesson) => lesson.id === id),
      );
      if (shown) setSelectedLessonId(shown);
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Error fetching lessons:", error);
      say(t("grade.loadLessonsFailed"));
    } finally {
      setLessonsLoading(false);
    }
  };

  // Once the class list is in, follow a notification link (once per visit).
  useEffect(() => {
    if (linkedRef.current || !classes.length) return;
    const linkedClass = searchParams.get("classId");
    if (!linkedClass) return;
    linkedRef.current = true;
    if (classes.some((c) => c.id === linkedClass)) {
      handleClassChange(linkedClass, searchParams.get("lessonId"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the class list arrives
  }, [classes, searchParams]);

  const handleLessonChange = async (event) => {
    const lessonId = event.target.value;
    setSelectedLessonId(lessonId);
    if (!selectedClassId || !lessonId) return;

    const lessonName = lessons.find((item) => item.id === lessonId)?.name;
    const confirmed = window.confirm(
      t("grade.confirmLesson", { name: lessonName }),
    );
    if (!confirmed) {
      // Revert to the class's saved current lesson.
      setSelectedLessonId(currentLessonRef.current || "");
      return;
    }

    const ok = await updateCurrentLessonForClass(selectedClassId, lessonId);
    if (ok) {
      currentLessonRef.current = lessonId;
    }
  };

  // Show the last grading run of the selected class + lesson — still running
  // if the teacher closed the tab mid-run and came back.
  useEffect(() => {
    setFollowed(null);
    setJobRunning(false);
    if (!selectedClassId || !selectedLessonId) return undefined;
    let cancelled = false;
    fetchLatestGradingJob(selectedClassId, selectedLessonId)
      .then((job) => {
        if (!cancelled && job) setFollowed({ id: job.id, live: false });
      })
      .catch((error) => {
        if (error.message !== "RE-AUTH_NEEDED")
          console.error("Latest grading job fetch failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClassId, selectedLessonId]);

  // Follow the job on screen until it ends. Closing the tab only stops this
  // polling — the backend carries on and notifies the teacher at the end.
  useEffect(() => {
    if (!followed) return undefined;
    let cancelled = false;
    let timer = null;
    let sawRunning = false;
    const classId = selectedClassId;

    const poll = async () => {
      try {
        const job = await fetchGradingJob(followed.id);
        if (cancelled) return;
        const view = describeJob(job, t, { showWarnings: isAdmin });
        const finished = isJobFinished(job);
        const looked = !followed.live && !sawRunning;
        setStatus(
          looked && finished
            ? { ...view, text: `${t("grading.lastRun")} ${view.text}` }
            : view,
        );
        setJobRunning(!finished);
        if (!finished) {
          sawRunning = true;
          timer = setTimeout(poll, JOB_POLL_MS);
          return;
        }
        if (!looked) {
          if (job.status === "done" && job.written > 0) playSuccessSound();
          // Balances changed if any docs were graded.
          refreshPoint();
          refreshPayer(classId);
        }
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Grading job poll failed:", error);
        timer = setTimeout(poll, JOB_POLL_MS);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per followed job only; `t` and the refreshers are stable enough for a status line
  }, [followed, isAdmin]);

  const handleProcessAllDocs = async () => {
    if (starting || jobRunning || clearing) return;
    setStarting(true);
    setStatus({
      phase: "running",
      text: t("grading.jobStarting"),
      warnings: [],
    });
    try {
      const { jobId } = await startGradingJob({
        docLinksText,
        classId: selectedClassId,
        lessonId: selectedLessonId,
        // Non-admins always use the cache; admins control it via the toggle.
        useCache: isAdmin ? saveCache : true,
      });
      setJobRunning(true);
      setFollowed({ id: jobId, live: true });
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Processing error:", error);
      const text =
        error.message === "GOOGLE_REAUTH_REQUIRED"
          ? t("grading.reauthToStart")
          : error.message === "no_docs"
            ? t("grading.noDocs")
            : error.message === "ielts_not_configured"
              ? t("grading.ieltsNotConfigured")
              : t("grade.processFailed", { msg: error.message });
      setStatus({ phase: "error", text, warnings: [] });
    } finally {
      setStarting(false);
    }
  };

  /**
   * Admin-only: strip the feedback grading wrote into the selected lesson.
   * Two passes — the first only reads, so the confirm dialog can quote real
   * numbers before anything irreversible happens.
   */
  const handleClearFeedback = async () => {
    if (starting || jobRunning || clearing) return;
    const lessonName = lessons.find(
      (item) => item.id === selectedLessonId,
    )?.name;
    setClearing(true);
    setStatus({
      phase: "running",
      text: t("clearFeedback.inProgress"),
      warnings: [],
    });
    try {
      // An IELTS class's feedback sits in its IELTS WRITING tables, not in
      // the class-type tables — the class's course says which (backend
      // lib/courses.js; no course or no profile = Basic). A failed lookup
      // falls back to Basic, so it can never block a Basic class's clear.
      const course = selectedClass?.courseId
        ? (
            await fetchCourses({ includeInactive: true }).catch((err) => {
              console.error("Course lookup failed:", err);
              return [];
            })
          ).find((item) => item.id === selectedClass.courseId)
        : null;
      const gradingProfile = course?.gradingProfile || "basic";
      const plan = await planFeedbackClear({
        docLinksText,
        classId: selectedClassId,
        classType: selectedClass?.classType,
        gradingProfile,
        lessonName,
        t,
      });
      if (!plan) {
        // No document at all — planFeedbackClear already alerted.
        say("");
        return;
      }
      if (!plan.cells) {
        setStatus({
          phase: "done",
          text: t("clearFeedback.nothingAtAll"),
          warnings: plan.warnings,
        });
        return;
      }
      // The "Chữa bài" column holds hand-typed teacher notes too, and they
      // cannot be told apart from AI feedback — so show the count and ask.
      const confirmed = window.confirm(
        t("clearFeedback.confirm", {
          cells: plan.cells,
          docs: plan.plans.length,
          lesson: lessonName,
          class: selectedClass?.name,
        }),
      );
      if (!confirmed) {
        say("");
        return;
      }

      const { clearedDocs, clearedCells, warnings } =
        await executeFeedbackClear({
          plans: plan.plans,
          classType: selectedClass?.classType,
          gradingProfile,
          lessonName,
          t,
        });
      setStatus({
        phase: "done",
        text: clearedDocs
          ? // Re-grading hits the shared grading cache and hands back the SAME
            // feedback, so point at the toggle that forces a fresh AI pass.
            `${t("clearFeedback.complete", {
              cells: clearedCells,
              docs: clearedDocs,
            })}\n${t("clearFeedback.cacheHint")}`
          : t("clearFeedback.nothingAtAll"),
        warnings: [...plan.warnings, ...warnings],
      });
      if (clearedDocs > 0) {
        playSuccessSound();
        await recordFeedbackClearSummary({
          classId: selectedClassId,
          lessonId: selectedLessonId,
          clearedDocs,
          clearedCells,
        });
      }
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        console.error("Clear feedback error:", error);
        setStatus({
          phase: "error",
          text: t("grade.processFailed", { msg: error.message }),
          warnings: [],
        });
      }
    } finally {
      setClearing(false);
    }
  };

  const canProcess =
    selectedClassId &&
    selectedLessonId &&
    !starting &&
    !jobRunning &&
    !clearing;

  return (
    <div className="page-wide">
      <h2 className="page-title">
        {t("grade.title")}{" "}
        {/* A teacher's own balance is in the header. An admin grades on
            behalf of the class's teacher, whose balance the header does not
            show — so that one stays here. */}
        {isAdmin &&
          (payer ? (
            <span className="count-badge">
              {t("grade.payerPoint", {
                teacher: payer.teacherName,
                point: payer.point,
              })}
            </span>
          ) : (
            <span className="count-badge">{t("grade.adminUnlimited")}</span>
          ))}
      </h2>
      <SearchableSelect
        className="mb-1"
        value={selectedClassId}
        onChange={handleClassChange}
        options={classes}
        disabled={starting || clearing}
        placeholder={t("grade.selectClass")}
        searchPlaceholder={t("common.searchClassPlaceholder")}
        noResultsText={t("common.noClassesFound")}
      />
      <select
        className="mb-1"
        value={selectedLessonId}
        onChange={handleLessonChange}
        disabled={
          lessonsLoading || lessons.length === 0 || starting || clearing
        }
      >
        <option value="">
          {lessonsLoading ? t("grade.loadingLessons") : t("grade.selectLesson")}
        </option>
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </select>
      <textarea
        className="mb-1"
        placeholder={t("grade.docsPlaceholder")}
        rows={10}
        value={docLinksText}
        onChange={(e) => setDocLinksText(e.target.value)}
        disabled={starting || clearing}
      />
      {isAdmin && (
        <label className="cache-toggle mb-1" title={t("grade.saveCacheTitle")}>
          <input
            type="checkbox"
            checked={saveCache}
            onChange={(e) => setSaveCache(e.target.checked)}
            disabled={starting || clearing}
          />
          <span>
            {saveCache ? t("grade.saveCacheOn") : t("grade.saveCacheOff")}
          </span>
        </label>
      )}
      <div className="button-row mb-1">
        <button
          className="primary-btn"
          onClick={handleProcessAllDocs}
          disabled={!canProcess}
        >
          {starting || jobRunning ? t("grade.processing") : t("grade.process")}
        </button>
        <button
          className="secondary-btn"
          onClick={() => setScheduleOpen(true)}
          disabled={!selectedClassId || starting || clearing}
        >
          <i className="ti ti-clock" aria-hidden="true" />
          {t("autoGrade.button")}
        </button>
        {isAdmin && (
          <button
            className="danger-btn"
            onClick={handleClearFeedback}
            disabled={!canProcess}
          >
            {clearing ? t("grade.clearing") : t("grade.clearFeedback")}
          </button>
        )}
      </div>
      {selectedClassId && (
        <p className="auto-grade-summary">
          {schedule?.enabled && schedule.next
            ? t("autoGrade.summaryOn", { runAt: formatVn(schedule.next.runAt) })
            : t("autoGrade.summaryOff")}
        </p>
      )}
      {scheduleOpen && selectedClass && (
        <AutoGradeScheduleModal
          cls={selectedClass}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => refreshSchedule(selectedClassId)}
        />
      )}
      <div className="status-output">
        {status.phase === "running" ? (
          <span className="status-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{status.text}</span>
          </span>
        ) : (
          status.text
        )}
        {status.warnings.length > 0 && (
          <ul className="status-warnings">
            {status.warnings.map((warning, i) => (
              // eslint-disable-next-line react/no-array-index-key -- the list is replaced wholesale at the end of a run, never reordered or spliced
              <li key={i}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
