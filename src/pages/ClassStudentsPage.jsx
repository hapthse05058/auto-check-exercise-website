import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchAllClasses,
  fetchClasses,
  fetchCurrentLesson,
  fetchLessons,
  fetchStudents,
} from "../api/backend.js";
import { getTabContent } from "../api/googleDocs.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ensureValidGoogleToken } from "../auth/tokens.js";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { extractDocId } from "../lib/googleDoc.js";
import { LESSON_OPTIONS } from "../shared/constant.js";

/** "lesson05" -> "BUỔI 05" (falls back to the raw value / a dash). */
function gradedLabel(currentLesson) {
  if (!currentLesson) return "—";
  return (
    LESSON_OPTIONS.find((o) => o.value === currentLesson)?.label ||
    currentLesson
  );
}

export default function ClassStudentsPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [lessons, setLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);

  const [students, setStudents] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("classStudents.initial"));

  const selectedLessonName = lessons.find(
    (l) => l.id === selectedLessonId,
  )?.name;

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
        // Admin can view students of any class, so load every class.
        const classList = isAdminEmail(teacherInfo.gmail)
          ? await fetchAllClasses()
          : await fetchClasses(teacherInfo.id);
        if (!cancelled)
          setClasses(classList.filter((c) => c.isActive !== false));
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading classes:", error);
        setStatus(t("classStudents.loadClassesFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; `t` is only used for status/error messages, adding it would re-fetch on language change
  }, [loadTeacherInfo, navigate]);

  const handleClassChange = async (classId) => {
    setSelectedClassId(classId);
    setSelectedLessonId("");
    setLessons([]);
    setStudents([]);
    setSearched(false);
    if (!classId) return;

    const cls = classes.find((c) => c.id === classId);
    setLessonsLoading(true);
    try {
      const lessonList = await fetchLessons(cls?.classType);
      setLessons(lessonList);
      // Pre-select the class's current lesson when available (drives the tab to
      // open on the doc links).
      const current = await fetchCurrentLesson(classId);
      if (current && lessonList.some((l) => l.id === current)) {
        setSelectedLessonId(current);
      }
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Error fetching lessons:", error);
      setStatus(t("classStudents.loadLessonsFailed"));
    } finally {
      setLessonsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedClassId || loading) return;
    setLoading(true);
    setStatus(t("classStudents.searching"));
    try {
      const [studentList, current] = await Promise.all([
        fetchStudents(selectedClassId),
        fetchCurrentLesson(selectedClassId),
      ]);
      setStudents(studentList);
      setCurrentLesson(current);
      setSearched(true);
      setStatus(
        studentList.length
          ? studentList.length === 1
            ? t("classStudents.foundOne", { n: studentList.length })
            : t("classStudents.foundMany", { n: studentList.length })
          : t("classStudents.noStudents"),
      );
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Search error:", error);
      setStatus(t("classStudents.searchFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Opens the student's doc. When a lesson is selected, resolve the matching
  // tab id so the doc opens on that tab; otherwise open the plain link.
  const openDoc = async (event, ggDocLink) => {
    const docId = extractDocId(ggDocLink);
    if (!docId || !selectedLessonName) {
      return; // let the anchor's default href/target handle it
    }
    event.preventDefault();
    // Open a blank tab synchronously to keep the user-gesture (avoids popup
    // blockers), then point it at the resolved tab URL.
    const win = window.open("", "_blank");
    try {
      const token = await ensureValidGoogleToken();
      const tab = await getTabContent(docId, token, selectedLessonName);
      const tabId = tab?.tabProperties?.tabId;
      const url = tabId
        ? `https://docs.google.com/document/d/${docId}/edit?tab=${tabId}`
        : ggDocLink;
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (err) {
      console.error("Open doc error:", err);
      if (win) win.location.href = ggDocLink;
      else window.open(ggDocLink, "_blank", "noopener");
    }
  };

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("classStudents.title")}{" "}
              {searched && (
                <span className="count-badge">{students.length}</span>
              )}
            </h2>
            <p>{t("classStudents.subtitle")}</p>
          </div>
        </div>

        <div className="cache-search">
          <SearchableSelect
            value={selectedClassId}
            onChange={handleClassChange}
            options={classes}
            placeholder={t("classStudents.selectClass")}
            searchPlaceholder={t("common.searchClassPlaceholder")}
            noResultsText={t("common.noClassesFound")}
          />
          <select
            value={selectedLessonId}
            onChange={(e) => setSelectedLessonId(e.target.value)}
            disabled={
              !selectedClassId || lessonsLoading || lessons.length === 0
            }
          >
            <option value="">
              {lessonsLoading
                ? t("classStudents.loadingLessons")
                : t("classStudents.selectLessonOptional")}
            </option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </select>
          <button
            className="btn-confirm"
            onClick={handleSearch}
            disabled={!selectedClassId || loading}
          >
            {t("common.search")}
          </button>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("classStudents.searching")}</span>
          </div>
        ) : !searched ? (
          <div className="empty-state">
            <i className="ti ti-users" aria-hidden="true" />
            <p>{t("classStudents.selectAndSearch")}</p>
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-users" aria-hidden="true" />
            <p>{t("classStudents.noStudents")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th>{t("classStudents.colName")}</th>
                  <th>{t("classStudents.colDoc")}</th>
                  <th>{t("classStudents.colGraded")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {s.ggDocLink ? (
                        <a
                          href={s.ggDocLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => openDoc(e, s.ggDocLink)}
                        >
                          {t("classStudents.openDoc")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{gradedLabel(currentLesson)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
