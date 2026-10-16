import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClassLessons,
  fetchClassTypes,
  fetchClasses,
  fetchCourses,
  fetchCurrentLesson,
  fetchGradingJob,
  fetchGradingPreview,
  fetchGradingSchedule,
  fetchLatestGradingJob,
  fetchMyBalance,
  fetchPayerBalance,
  fetchStudentDocRefs,
  recordFeedbackClearSummary,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorNotice from "../components/ErrorNotice.jsx";
import GradeCostNote from "../components/GradeCostNote.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  isEarlierLesson,
  lessonChangeQuestion,
  nextRunSummary,
} from "../lib/autoGrade.js";
import { formatVnd } from "../lib/billing.js";
import { templateName } from "../lib/courses.js";
import { parseDocLinks } from "../lib/docParser.js";
import {
  executeFeedbackClear,
  planFeedbackClear,
} from "../lib/feedbackClear.js";
import { describeJob, isJobFinished, startGradingJob } from "../lib/grading.js";
import { announceBalance } from "../lib/pointEvents.js";
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
  // class spends THAT teacher's balance, so the badge must show it.
  const [payer, setPayer] = useState(null);
  // How many docs a run on the whole class opens (students with a doc link,
  // one per doc) — the "docs" of the cost shown before grading. null = not
  // known yet, or the lookup failed (the cost box then stays hidden).
  const [classDocCount, setClassDocCount] = useState(null);
  // The backend's count of what a run started now would grade and charge
  // (api fetchGradingPreview): null | {state: "loading"|"done"|"error", …}.
  const [preview, setPreview] = useState(null);
  const [previewTick, setPreviewTick] = useState(0);
  // Admin only: each class's course and doc template, shown on hover.
  const [classInfo, setClassInfo] = useState({ courses: [], templates: [] });
  const currentLessonRef = useRef(null);
  const scheduleReqRef = useRef(0);
  // A load that failed and can be retried from the error box. Plain data, not
  // a callback, so the retry always runs this render's handlers.
  // null | { kind: "teacher" } | { kind: "lessons", classId, preferredLessonId }
  const [loadError, setLoadError] = useState(null);
  const [teacherLoading, setTeacherLoading] = useState(true);
  // Tickets for in-flight loads: only the latest call may write state.
  const initReqRef = useRef(0);
  const lessonsReqRef = useRef(0);

  const refreshPoint = async () => {
    try {
      // The header badge shows it (lib/pointEvents.js).
      announceBalance(await fetchMyBalance());
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Balance fetch failed:", error);
    }
  };

  const refreshPayer = async (classId) => {
    if (!classId) {
      setPayer(null);
      return;
    }
    try {
      setPayer(await fetchPayerBalance(classId));
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Payer balance fetch failed:", error);
      setPayer(null);
    }
  };

  const selectedClass = classes.find((cls) => cls.id === selectedClassId);

  // Pasted links narrow the run to those docs (lib/grading.js pastedDocIds).
  const pastedDocIds = docLinksText.trim()
    ? [...new Set(parseDocLinks(docLinksText.trim()).map((ref) => ref.docId))]
    : null;
  const pastedDocCount = pastedDocIds ? pastedDocIds.length : null;
  const pastedKey = pastedDocIds ? pastedDocIds.join(",") : "";

  // What a run started now would grade and charge — docs not done and docs
  // already graded left out. Asked when the class, lesson or pasted links
  // change (links once typing stops), after every run and on "Kiểm tra lại".
  // Not while a run writes: its own docs would still count as to grade.
  useEffect(() => {
    setPreview(null);
    if (!selectedClassId || !selectedLessonId || jobRunning) return undefined;
    if (pastedDocIds && !pastedDocIds.length) return undefined;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        setPreview({ state: "loading" });
        fetchGradingPreview({
          classId: selectedClassId,
          lessonId: selectedLessonId,
          docIds: pastedDocIds || undefined,
        })
          .then((data) => {
            if (!cancelled) setPreview({ state: "done", data });
          })
          .catch((error) => {
            if (cancelled || error.message === "RE-AUTH_NEEDED") return;
            console.error("Grading preview failed:", error);
            setPreview({ state: "error", error: error.message });
          });
      },
      pastedKey ? 700 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pastedKey stands for pastedDocIds (a new array every render)
  }, [selectedClassId, selectedLessonId, pastedKey, jobRunning, previewTick]);

  /** Admin hover text of a class: its course and doc template. */
  const classTitle = (cls) => {
    const course = classInfo.courses.find((c) => c.id === cls.courseId);
    return t("grade.classInfo", {
      course: course?.name || "—",
      template:
        templateName(classInfo.templates, cls.classType) ||
        t("classManage.noTemplate"),
    });
  };
  const classOptions = isAdmin
    ? classes.map((cls) => ({ ...cls, title: classTitle(cls) }))
    : classes;

  /** Plain message, no spinner — page loading and setup errors. */
  const say = (text) => setStatus({ phase: "idle", text, warnings: [] });

  /**
   * Teacher info + classes: on entry, and again from the error box's retry.
   * Each call takes a ticket from initReqRef; a response whose ticket is no
   * longer current (unmounted, or a newer call started) is dropped.
   */
  const loadInitialData = async () => {
    const req = ++initReqRef.current;
    const stale = () => req !== initReqRef.current;
    setLoadError(null);
    setTeacherLoading(true);
    try {
      say(t("grade.loadingTeacher"));
      const teacherInfo = await loadTeacherInfo();
      if (stale()) return;
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
      if (stale()) return;
      const activeClasses = classList.filter((c) => c.isActive !== false);
      setClasses(activeClasses);
      if (admin) {
        Promise.all([
          fetchCourses({ includeInactive: true }),
          fetchClassTypes(),
        ])
          .then(([courses, templates]) => {
            if (!stale()) setClassInfo({ courses, templates });
          })
          .catch((error) => {
            if (error.message !== "RE-AUTH_NEEDED")
              console.error("Class info fetch failed:", error);
          });
      }
      if (activeClasses.length === 0) {
        alert(t("grade.noClasses"));
      }
      say(t("grade.ready"));
    } catch (error) {
      if (stale() || error.message === "RE-AUTH_NEEDED") return;
      console.error("Post-login error:", error);
      say("");
      setLoadError({ kind: "teacher" });
    } finally {
      if (!stale()) setTeacherLoading(false);
    }
  };

  // Load teacher info + classes once on entry.
  useEffect(() => {
    loadInitialData();
    return () => {
      // Void the ticket of any load still in flight.
      initReqRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; `t` is only used for status/error messages, adding it would re-fetch on language change
  }, [loadTeacherInfo, navigate]);

  /** `keep`: leave the shown schedule up until the new one is in. */
  const refreshSchedule = async (classId, { keep = false } = {}) => {
    // Only the latest request lands (class A → B fast, or a lesson change).
    const req = ++scheduleReqRef.current;
    if (!keep) setSchedule(null);
    if (!classId) return;
    try {
      const next = await fetchGradingSchedule(classId);
      if (req === scheduleReqRef.current) setSchedule(next);
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
    // Switching class A → B fast must not let A's late lessons land on B.
    const req = ++lessonsReqRef.current;
    const stale = () => req !== lessonsReqRef.current;
    setSelectedClassId(classId);
    setSelectedLessonId("");
    setLessons([]);
    // The previous class's last run is not this class's.
    say(t("grade.ready"));
    setLoadError((prev) => (prev?.kind === "lessons" ? null : prev));
    currentLessonRef.current = null;
    refreshPayer(classId);
    refreshSchedule(classId);
    setClassDocCount(null);
    if (!classId) {
      setLessonsLoading(false);
      return;
    }
    fetchStudentDocRefs(classId)
      .then((refs) => {
        if (!stale()) setClassDocCount(new Set(refs.map((r) => r.docId)).size);
      })
      .catch((error) => {
        if (error.message !== "RE-AUTH_NEEDED")
          console.error("Student docs fetch failed:", error);
      });

    setLessonsLoading(true);
    try {
      const lessonList = await fetchClassLessons(classId);
      if (stale()) return;
      setLessons(lessonList);

      const currentLesson = await fetchCurrentLesson(classId);
      if (stale()) return;
      currentLessonRef.current = currentLesson;
      const shown = [preferredLessonId, currentLesson].find(
        (id) => id && lessonList.some((lesson) => lesson.id === id),
      );
      if (shown) setSelectedLessonId(shown);
    } catch (error) {
      if (stale() || error.message === "RE-AUTH_NEEDED") return;
      console.error("Error fetching lessons:", error);
      setLoadError({ kind: "lessons", classId, preferredLessonId });
    } finally {
      if (!stale()) setLessonsLoading(false);
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
    // Cleared until the effect below finds this lesson's own last run.
    say(t("grade.ready"));
    if (!selectedClassId || !lessonId) return;

    const nameOf = (id) => lessons.find((item) => item.id === id)?.name;
    const current = currentLessonRef.current;
    const confirmed = window.confirm(
      lessonChangeQuestion(
        {
          name: nameOf(lessonId),
          currentName: nameOf(current),
          earlier: isEarlierLesson(lessonId, current, lessons),
          autoOn: Boolean(schedule?.enabled && schedule.next),
        },
        t,
      ),
    );
    if (!confirmed) {
      // Revert to the class's saved current lesson.
      setSelectedLessonId(current || "");
      return;
    }

    const ok = await updateCurrentLessonForClass(selectedClassId, lessonId);
    if (ok) {
      currentLessonRef.current = lessonId;
      // The next scheduled run now grades this lesson: say so.
      if (schedule?.enabled) refreshSchedule(selectedClassId, { keep: true });
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
        const finished = isJobFinished(job);
        const looked = !followed.live && !sawRunning;
        // An earlier run's warnings are old news: only a run started or
        // watched from this screen shows them.
        const view = describeJob(job, t, {
          showWarnings: isAdmin && !(looked && finished),
        });
        setStatus(
          looked && finished
            ? {
                ...view,
                // Dated: a run from days ago must not read as today's.
                text: `${t("grading.lastRun", { at: formatVn(job.finishedAt || job.createdAt) })} ${view.text}`,
              }
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
              : error.message === "hs_not_configured"
                ? t("grading.hsNotConfigured")
                : error.message === "unknown_grading_profile"
                  ? t("grading.unknownGradingProfile")
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
      // No course (or a failed lookup): Basic, as always. A course whose
      // profile this version does not know (null) is refused — clearing it
      // as Basic would wipe a column that is not Basic's.
      const gradingProfile = course ? course.gradingProfile : "basic";
      if (!["basic", "ielts", "hs"].includes(gradingProfile)) {
        setStatus({
          phase: "error",
          text: t("clearFeedback.unknownProfile"),
          warnings: [],
        });
        return;
      }
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
      // HS removes only the AI's own, unedited text (its named ranges).
      const confirmed = window.confirm(
        t(
          gradingProfile === "hs"
            ? "clearFeedback.confirmHs"
            : "clearFeedback.confirm",
          {
            cells: plan.cells,
            docs: plan.plans.length,
            lesson: lessonName,
            class: selectedClass?.name,
          },
        ),
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
  // Why the grade button is off, while the fix is still up to the teacher.
  // Mid-run the button's own label ("Processing...") already says why, and a
  // failed load has its own error box — one message at a time.
  const busy = starting || jobRunning || clearing;
  const processHint =
    busy || lessonsLoading || teacherLoading || loadError
      ? ""
      : !selectedClassId
        ? t("grade.hintSelectClass")
        : lessons.length === 0
          ? t("grade.hintNoLessons")
          : !selectedLessonId
            ? t("grade.hintSelectLesson")
            : "";

  const retryLoad = () =>
    loadError?.kind === "lessons"
      ? handleClassChange(loadError.classId, loadError.preferredLessonId)
      : loadInitialData();

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
                balance: formatVnd(payer.balanceVnd),
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
        options={classOptions}
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
      {/* Mid-run the status line below has the numbers. */}
      {selectedClassId && selectedLessonId && !busy && (
        <GradeCostNote
          preview={preview}
          docCount={pastedDocCount ?? classDocCount}
          pasted={pastedDocCount !== null}
          balanceVnd={payer ? payer.balanceVnd : null}
          payerName={isAdmin ? payer?.teacherName : ""}
          autoRunAt={
            // A scheduled run grades the class's current lesson, whole.
            schedule?.enabled &&
            schedule.next &&
            pastedDocCount === null &&
            selectedLessonId === currentLessonRef.current
              ? schedule.next.runAt
              : null
          }
          onRetry={() => setPreviewTick((n) => n + 1)}
        />
      )}
      <div className="button-row mb-1">
        <button
          className="primary-btn"
          onClick={handleProcessAllDocs}
          disabled={!canProcess}
          aria-describedby={processHint ? "grade-process-hint" : undefined}
        >
          {starting || jobRunning ? t("grade.processing") : t("grade.process")}
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
      {processHint && (
        <p id="grade-process-hint" className="field-hint">
          <i className="ti ti-info-circle" aria-hidden="true" />
          {processHint}
        </p>
      )}
      {selectedClassId && (
        <p className="auto-grade-summary">{nextRunSummary(schedule, t)}</p>
      )}
      {loadError && (
        <ErrorNotice
          message={t(
            loadError.kind === "lessons"
              ? "grade.loadLessonsFailed"
              : "grade.loadTeacherFailed",
          )}
          onRetry={retryLoad}
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
