import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createTemplate,
  deleteTemplate,
  fetchTemplateUsage,
  updateTemplate,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { templateCodeFromName, templateErrorText } from "../lib/courses.js";
import "../styles/templates.css";

/** backend lib/courses.js GRADING_PROFILES, each with its card icon. */
const PROFILES = [
  { key: "basic", icon: "ti-language" },
  { key: "ielts", icon: "ti-writing" },
  { key: "hs", icon: "ti-school" },
];
const PROFILE_ICON = Object.fromEntries(PROFILES.map((p) => [p.key, p.icon]));

const EMPTY_FORM = { code: "", name: "", gradingProfile: "basic" };

/**
 * Admin: the student-doc templates (`classType`) a class picks on creation.
 * Each belongs to one grading profile — a class may only use a template of
 * its course's profile. The code is what classes store (and what the doc
 * table detection keys on), so it cannot change; a template an active class
 * uses cannot be deleted or moved to another profile.
 */
export default function AdminTemplatesPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState(""); // "" = all

  // Modal: "create" | "edit" | "delete" | null
  const [modal, setModal] = useState(null);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [codeTouched, setCodeTouched] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo || !isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        await reload();
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading templates:", error);
        setStatus(t("templates.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  // The spinner shows on the first load only (`loading` starts true), so a
  // reload after a save keeps the cards — and the status line — in place.
  async function reload() {
    try {
      const list = await fetchTemplateUsage();
      setTemplates(Array.isArray(list) ? list : []);
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Templates reload error:", error);
      setStatus(t("templates.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const countByProfile = useMemo(() => {
    const counts = { "": templates.length };
    for (const item of templates) {
      counts[item.gradingProfile] = (counts[item.gradingProfile] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Shown templates, grouped by profile in PROFILES order.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shown = templates.filter(
      (item) =>
        (!profileFilter || item.gradingProfile === profileFilter) &&
        (!needle ||
          item.name.toLowerCase().includes(needle) ||
          item.code.toLowerCase().includes(needle)),
    );
    return PROFILES.map((profile) => ({
      ...profile,
      items: shown.filter((item) => item.gradingProfile === profile.key),
    })).filter((group) => group.items.length > 0);
  }, [templates, query, profileFilter]);

  const openCreate = () => {
    setActive(null);
    setForm({
      ...EMPTY_FORM,
      gradingProfile: profileFilter || EMPTY_FORM.gradingProfile,
    });
    setCodeTouched(false);
    setFormError("");
    setModal("create");
  };

  const openEdit = (template) => {
    setActive(template);
    setForm({
      code: template.code,
      name: template.name,
      gradingProfile: template.gradingProfile,
    });
    setFormError("");
    setModal("edit");
  };

  const openDelete = (template) => {
    setActive(template);
    setFormError("");
    setModal("delete");
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setActive(null);
    setFormError("");
  };

  const setName = (name) =>
    setForm((prev) => ({
      ...prev,
      name,
      // Until the admin types a code, it follows the name.
      code:
        modal === "create" && !codeTouched
          ? templateCodeFromName(name)
          : prev.code,
    }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError(t("templates.error.name_required"));
      return;
    }
    if (modal === "create" && !form.code.trim()) {
      setFormError(t("templates.error.code_required"));
      return;
    }
    setSaving(true);
    try {
      if (modal === "create") {
        const created = await createTemplate({
          code: form.code.trim(),
          name: form.name.trim(),
          gradingProfile: form.gradingProfile,
        });
        setStatus(t("templates.created", { name: created.name }));
      } else {
        const body = {};
        if (form.name.trim() !== active.name) body.name = form.name.trim();
        if (form.gradingProfile !== active.gradingProfile) {
          body.gradingProfile = form.gradingProfile;
        }
        if (Object.keys(body).length === 0) {
          setSaving(false);
          closeModal();
          return;
        }
        const saved = await updateTemplate(active.id, body);
        setStatus(t("templates.saved", { name: saved.name }));
      }
      setSaving(false);
      closeModal();
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setFormError(templateErrorText(error, t));
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await deleteTemplate(active.id);
      setStatus(t("templates.deleted", { name: active.name }));
      setSaving(false);
      closeModal();
      await reload();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setFormError(templateErrorText(error, t));
      setSaving(false);
    }
  };

  const inUse = active?.activeClassCount > 0;
  // An active class pins the template's profile (its course is of that one).
  const profileLocked = modal === "edit" && inUse;

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("templates.title")}{" "}
              <span className="count-badge">{templates.length}</span>
            </h2>
            <p>{t("templates.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openCreate}>
            <i className="ti ti-plus" aria-hidden="true" /> {t("templates.add")}
          </button>
        </div>

        <div className="tpl-toolbar">
          <div className="tpl-search">
            <i className="ti ti-search" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("templates.searchPlaceholder")}
            />
          </div>
          <div className="tpl-filters" role="group">
            {[{ key: "" }, ...PROFILES].map((profile) => (
              <button
                key={profile.key || "all"}
                type="button"
                className={`tpl-filter tpl-profile-${profile.key || "all"}${
                  profileFilter === profile.key ? " is-active" : ""
                }`}
                onClick={() => setProfileFilter(profile.key)}
              >
                {profile.key
                  ? t(`courses.profile.${profile.key}`)
                  : t("templates.filterAll")}
                <span className="tpl-filter-count">
                  {countByProfile[profile.key] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("templates.loading")}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-file-text" aria-hidden="true" />
            <p>
              {templates.length === 0
                ? t("templates.empty")
                : t("templates.noMatch")}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="tpl-group">
              <h3 className={`tpl-group-title tpl-profile-${group.key}`}>
                <i className={`ti ${group.icon}`} aria-hidden="true" />
                {t(`courses.profile.${group.key}`)}
                <span>{group.items.length}</span>
              </h3>
              <div className="tpl-grid">
                {group.items.map((item) => (
                  <article
                    key={item.id}
                    className={`tpl-card tpl-profile-${item.gradingProfile}`}
                  >
                    <div className="tpl-card-head">
                      <span className="tpl-card-icon">
                        <i
                          className={`ti ${PROFILE_ICON[item.gradingProfile]}`}
                          aria-hidden="true"
                        />
                      </span>
                      <div className="tpl-card-title">
                        <strong title={item.name}>{item.name}</strong>
                        <code title={t("templates.codeLabel")}>
                          {item.code}
                        </code>
                      </div>
                      <div className="tpl-card-actions">
                        <button
                          className="btn-icon"
                          title={t("templates.edit")}
                          aria-label={t("templates.edit")}
                          onClick={() => openEdit(item)}
                        >
                          <i className="ti ti-edit" aria-hidden="true" />
                        </button>
                        <button
                          className="btn-icon danger"
                          title={t("templates.delete")}
                          aria-label={t("templates.delete")}
                          onClick={() => openDelete(item)}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="tpl-card-stats">
                      <span
                        className={
                          item.activeClassCount > 0
                            ? "tpl-stat is-live"
                            : "tpl-stat"
                        }
                        title={t("templates.classesHint", {
                          active: item.activeClassCount,
                          total: item.classCount,
                        })}
                      >
                        <i className="ti ti-users" aria-hidden="true" />
                        {t("templates.activeClasses", {
                          n: item.activeClassCount,
                        })}
                        {item.classCount > item.activeClassCount && (
                          <em>
                            {t("templates.closedClasses", {
                              n: item.classCount - item.activeClassCount,
                            })}
                          </em>
                        )}
                      </span>
                      <span className="tpl-stat">
                        <i className="ti ti-list-numbers" aria-hidden="true" />
                        {t("templates.lessons", { n: item.lessonCount })}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {status && <div className="status-line">{status}</div>}

        {(modal === "create" || modal === "edit") && (
          <div className="modal-bg open" onClick={closeModal}>
            <div
              className="modal tpl-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>
                  {modal === "create"
                    ? t("templates.createTitle")
                    : t("templates.editTitle")}
                </h3>
                <button
                  className="btn-icon"
                  aria-label={t("common.cancel")}
                  onClick={closeModal}
                >
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>

              <div className="field-group">
                <label htmlFor="tplName">
                  {t("templates.nameLabel")}{" "}
                  <span className="required-mark">*</span>
                </label>
                <input
                  id="tplName"
                  type="text"
                  value={form.name}
                  maxLength={120}
                  placeholder={t("templates.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field-group">
                <label htmlFor="tplCode">
                  {t("templates.codeLabel")}{" "}
                  {modal === "create" && (
                    <span className="required-mark">*</span>
                  )}
                </label>
                <div className="tpl-code-input">
                  <input
                    id="tplCode"
                    type="text"
                    value={form.code}
                    maxLength={64}
                    disabled={modal === "edit"}
                    placeholder="basic_since_01102026"
                    onChange={(e) => {
                      setCodeTouched(true);
                      setForm({
                        ...form,
                        code: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, ""),
                      });
                    }}
                  />
                  {modal === "edit" && (
                    <i className="ti ti-lock" aria-hidden="true" />
                  )}
                </div>
                <small className="field-note">
                  {modal === "create"
                    ? t("templates.codeHint")
                    : t("templates.codeLocked")}
                </small>
              </div>

              <div className="field-group">
                <label>{t("templates.profileLabel")}</label>
                <div className="tpl-profile-options">
                  {PROFILES.map((profile) => (
                    <label
                      key={profile.key}
                      className={`tpl-profile-option tpl-profile-${profile.key}${
                        form.gradingProfile === profile.key
                          ? " is-selected"
                          : ""
                      }${profileLocked ? " is-disabled" : ""}`}
                    >
                      <input
                        type="radio"
                        name="tplProfile"
                        value={profile.key}
                        checked={form.gradingProfile === profile.key}
                        disabled={profileLocked}
                        onChange={() =>
                          setForm({ ...form, gradingProfile: profile.key })
                        }
                      />
                      <i className={`ti ${profile.icon}`} aria-hidden="true" />
                      <span>{t(`courses.profile.${profile.key}`)}</span>
                    </label>
                  ))}
                </div>
                <small className="field-note">
                  {profileLocked
                    ? t("templates.profileLocked", {
                        n: active.activeClassCount,
                      })
                    : t("templates.profileHint")}
                </small>
              </div>

              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? t("templates.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {modal === "delete" && active && (
          <div className="modal-bg open" onClick={closeModal}>
            <div
              className="modal tpl-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="tpl-delete-head">
                <span
                  className={
                    inUse ? "tpl-delete-icon is-blocked" : "tpl-delete-icon"
                  }
                >
                  <i
                    className={`ti ${inUse ? "ti-lock" : "ti-trash"}`}
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <h3>{t("templates.deleteTitle")}</h3>
                  <p>
                    <strong>{active.name}</strong> · <code>{active.code}</code>
                  </p>
                </div>
              </div>
              <p className="tpl-delete-text">
                {inUse
                  ? t("templates.deleteBlocked", { n: active.activeClassCount })
                  : t("templates.deleteConfirm")}
              </p>
              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {inUse ? t("templates.close") : t("common.cancel")}
                </button>
                {!inUse && (
                  <button
                    className="btn-confirm tpl-btn-danger"
                    onClick={confirmDelete}
                    disabled={saving}
                  >
                    {saving ? t("templates.deleting") : t("templates.delete")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
