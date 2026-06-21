import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkClassNameExists,
  createClass,
  fetchAllClasses,
  fetchClasses,
  fetchClassTypes,
  fetchLessons,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export default function NewClassPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [classTypes, setClassTypes] = useState([]);
  const [classType, setClassType] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lesson, setLesson] = useState("");
  const [existingClasses, setExistingClasses] = useState([]);
  const [status, setStatus] = useState(t("newClass.intro"));
  const [saving, setSaving] = useState(false);

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
        const types = await fetchClassTypes();
        if (!cancelled) setClassTypes(types);
        // Admin's duplicate-name check spans all classes, not just their own.
        const classList = isAdminEmail(teacherInfo.gmail)
          ? await fetchAllClasses()
          : await fetchClasses(teacherInfo.id);
        if (!cancelled) setExistingClasses(classList);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading new-class data:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  const handleTypeChange = async (event) => {
    const type = event.target.value;
    setClassType(type);
    setLesson("");
    setLessons([]);
    if (!type) return;
    setLessonsLoading(true);
    try {
      const lessonOptions = await fetchLessons(type);
      setLessons(Array.isArray(lessonOptions) ? lessonOptions : []);
    } catch (error) {
      console.error("Error loading lessons for new class:", error);
    } finally {
      setLessonsLoading(false);
    }
  };

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

    setStatus(t("newClass.saving"));
    setSaving(true);
    try {
      const teacherInfo = await loadTeacherInfo();
      const response = await createClass({
        name: trimmed,
        classType,
        currentLesson: lesson.trim(),
        teacherId: teacherInfo?.id,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setStatus(errorData?.error || t("newClass.createFailed"));
        return;
      }

      setStatus(t("newClass.created"));
      navigate("/grade");
    } catch (error) {
      console.error("Error creating class:", error);
      setStatus(t("newClass.createError"));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!(name.trim() && classType && lesson) && !saving;

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
          <label htmlFor="newClassType">{t("newClass.type")}</label>
          <select id="newClassType" value={classType} onChange={handleTypeChange}>
            <option value="">{t("newClass.selectType")}</option>
            {classTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.name || type.code || type.id}
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
                : lessons.length === 0 && classType
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
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/grade")}>
            {t("common.backHome")}
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={!canSave}>
            {t("newClass.saveClass")}
          </button>
        </div>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
