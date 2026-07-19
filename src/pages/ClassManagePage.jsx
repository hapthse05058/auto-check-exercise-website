import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAllClasses,
  fetchClasses,
  fetchLessons,
  updateClass,
  updateCurrentLessonForClass,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
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
  const [form, setForm] = useState({ name: "", lessonId: "" });
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
    setForm({ name: cls.name || "", lessonId: cls.currentLesson || "" });
    setFormError("");
    setLessons([]);
    setEditOpen(true);
    setLessonsLoading(true);
    try {
      const lessonList = await fetchLessons(cls.classType);
      setLessons(lessonList);
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED") {
        console.error("Error fetching lessons:", error);
      }
    } finally {
      setLessonsLoading(false);
    }
  };

  const closeEdit = () => {
    setEditOpen(false);
    setActive(null);
    setForm({ name: "", lessonId: "" });
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
      const lessonChanged =
        form.lessonId && form.lessonId !== (active.currentLesson || "");

      if (nameChanged) {
        const res = await updateClass(active.id, { name: newName });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          setFormError(
            res.status === 409
              ? t("classManage.nameDuplicate")
              : d?.error || t("classManage.saveFailed"),
          );
          return;
        }
      }
      if (lessonChanged) {
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
            <span className="spinner" aria-hidden="true"></span>
            <span>{t("classManage.loading")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-school" aria-hidden="true"></i>
            <p>{t("classManage.empty")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th>{t("classManage.colName")}</th>
                  <th>{t("classManage.colCode")}</th>
                  {isAdmin && <th>{t("classManage.colTeacher")}</th>}
                  <th>{t("classManage.colCurrentLesson")}</th>
                  <th>{t("classManage.colStatus")}</th>
                  <th>{t("classManage.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="cell-date">{c.id}</td>
                    {isAdmin && (
                      <td>
                        {Array.isArray(c.teacherNames)
                          ? c.teacherNames.join(", ")
                          : "—"}
                      </td>
                    )}
                    <td>{lessonLabel(c.currentLesson)}</td>
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
                            <i className="ti ti-edit" aria-hidden="true"></i>
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
