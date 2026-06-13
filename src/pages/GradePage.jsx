import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchClasses,
  fetchCurrentLesson,
  fetchLessons,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { processDocs } from "../lib/grading.js";

const READY_TO_PROCESS_MESSAGE = "Ready to process...";

export default function GradePage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [docLinksText, setDocLinksText] = useState("");
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(false);
  const currentLessonRef = useRef(null);

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
        setStatus("Loading teacher info...");
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const classList = await fetchClasses(teacherInfo.id);
        if (cancelled) return;
        setClasses(classList);
        if (classList.length === 0) {
          alert(
            "No classes found for your account. Please create a class in the system first.",
          );
        }
        setStatus(READY_TO_PROCESS_MESSAGE);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Post-login error:", error);
        setStatus("Failed to load teacher data. Please login again.");
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
      setStatus("Failed to load lessons.");
    } finally {
      setLessonsLoading(false);
    }
  };

  const handleLessonChange = async (event) => {
    const lessonId = event.target.value;
    setSelectedLessonId(lessonId);
    if (!selectedClassId || !lessonId) return;

    const lessonName = lessons.find((item) => item.id === lessonId)?.name;
    const confirmed = window.confirm(`Update current lesson as ${lessonName}?`);
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
      });
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        console.error("Processing error:", error);
        onStatus.append(`\n Processing failed: ${error.message}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const canProcess = selectedClassId && selectedLessonId && !processing;

  return (
    <div className="page-wide">
      <h2 className="page-title">Grade exercises</h2>
      <select
        className="mb-1"
        value={selectedClassId}
        onChange={handleClassChange}
        disabled={processing}
      >
        <option value="">Select Class</option>
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
          {lessonsLoading ? "Loading lessons..." : "Select Lesson"}
        </option>
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </select>
      <textarea
        className="mb-1"
        placeholder="Paste Google Doc links here (one per line)... Leave empty to process every student saved in the class."
        rows={10}
        value={docLinksText}
        onChange={(e) => setDocLinksText(e.target.value)}
        disabled={processing}
      />
      <button
        className="mb-1 primary-btn"
        onClick={handleProcessAllDocs}
        disabled={!canProcess}
      >
        {processing ? "Processing..." : "Process All Documents"}
      </button>
      <div className="status-output">{status}</div>
    </div>
  );
}
