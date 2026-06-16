import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchClasses,
  fetchCurrentLesson,
  fetchLessons,
  fetchMyPoint,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { processDocs } from "../lib/grading.js";

export default function GradePage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [docLinksText, setDocLinksText] = useState("");
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveCache, setSaveCache] = useState(true);
  const [point, setPoint] = useState(null);
  const currentLessonRef = useRef(null);

  const refreshPoint = async () => {
    try {
      setPoint(await fetchMyPoint());
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") console.error("Point fetch failed:", error);
    }
  };

  const selectedClass = classes.find((cls) => cls.id === selectedClassId);

  const onStatus = {
    set: (text) => setStatus(text),
    append: (text) => setStatus((prev) => prev + text),
  };

  // Load teacher info + classes once on entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus(t("grade.loadingTeacher"));
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        setIsAdmin(isAdminEmail(teacherInfo.gmail));
        refreshPoint();
        const classList = await fetchClasses(teacherInfo.id);
        if (cancelled) return;
        setClasses(classList);
        if (classList.length === 0) {
          alert(t("grade.noClasses"));
        }
        setStatus(t("grade.ready"));
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Post-login error:", error);
        setStatus(t("grade.loadTeacherFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  const handleClassChange = async (event) => {
    const classId = event.target.value;
    setSelectedClassId(classId);
    setSelectedLessonId("");
    setLessons([]);
    currentLessonRef.current = null;
    if (!classId) return;

    const cls = classes.find((c) => c.id === classId);
    setLessonsLoading(true);
    try {
      const lessonList = await fetchLessons(cls?.classType);
      setLessons(lessonList);

      const currentLesson = await fetchCurrentLesson(classId);
      currentLessonRef.current = currentLesson;
      if (
        currentLesson &&
        lessonList.some((lesson) => lesson.id === currentLesson)
      ) {
        setSelectedLessonId(currentLesson);
      }
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Error fetching lessons:", error);
      setStatus(t("grade.loadLessonsFailed"));
    } finally {
      setLessonsLoading(false);
    }
  };

  const handleLessonChange = async (event) => {
    const lessonId = event.target.value;
    setSelectedLessonId(lessonId);
    if (!selectedClassId || !lessonId) return;

    const lessonName = lessons.find((item) => item.id === lessonId)?.name;
    const confirmed = window.confirm(t("grade.confirmLesson", { name: lessonName }));
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

  const handleProcessAllDocs = async () => {
    if (processing) return;
    const lessonName = lessons.find(
      (item) => item.id === selectedLessonId,
    )?.name;
    setProcessing(true);
    try {
      await processDocs({
        docLinksText,
        classId: selectedClassId,
        classType: selectedClass?.classType,
        lessonName,
        onStatus,
        // Non-admins always use the cache; admins control it via the toggle.
        useCache: isAdmin ? saveCache : true,
        isAdmin,
        t,
      });
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        console.error("Processing error:", error);
        onStatus.append(`\n${t("grade.processFailed", { msg: error.message })}`);
      }
    } finally {
      setProcessing(false);
      refreshPoint(); // balance changed if any docs were graded
    }
  };

  const canProcess = selectedClassId && selectedLessonId && !processing;

  return (
    <div className="page-wide">
      <h2 className="page-title">
        {t("grade.title")}{" "}
        {point !== null &&
          (isAdmin ? (
            <span className="count-badge">{t("grade.adminUnlimited")}</span>
          ) : (
            <span className="count-badge">
              {t("grade.pointLeft", { point })}
            </span>
          ))}
      </h2>
      <select
        className="mb-1"
        value={selectedClassId}
        onChange={handleClassChange}
        disabled={processing}
      >
        <option value="">{t("grade.selectClass")}</option>
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name}
          </option>
        ))}
      </select>
      <select
        className="mb-1"
        value={selectedLessonId}
        onChange={handleLessonChange}
        disabled={lessonsLoading || lessons.length === 0 || processing}
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
        disabled={processing}
      />
      {isAdmin && (
        <label className="cache-toggle mb-1" title={t("grade.saveCacheTitle")}>
          <input
            type="checkbox"
            checked={saveCache}
            onChange={(e) => setSaveCache(e.target.checked)}
            disabled={processing}
          />
          <span>{saveCache ? t("grade.saveCacheOn") : t("grade.saveCacheOff")}</span>
        </label>
      )}
      <button
        className="mb-1 primary-btn"
        onClick={handleProcessAllDocs}
        disabled={!canProcess}
      >
        {processing ? t("grade.processing") : t("grade.process")}
      </button>
      <div className="status-output">{status}</div>
    </div>
  );
}
