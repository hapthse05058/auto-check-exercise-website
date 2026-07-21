import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createTeacher,
  deleteTeacher,
  fetchAllClasses,
  fetchTeachersManage,
  updateTeacher,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { storageGet, storageSet } from "../auth/storage.js";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { validateTeacherForm } from "../lib/teacherForm.js";

// Toggleable table columns (Action is always shown). Header labels via i18n.
const COLUMN_DEFS = [
  { key: "name", labelKey: "teachers.colName" },
  { key: "username", labelKey: "teachers.colUsername" },
  { key: "gmail", labelKey: "teachers.colGmail" },
  { key: "phone", labelKey: "teachers.colPhone" },
  { key: "classes", labelKey: "teachers.colClasses" },
  { key: "status", labelKey: "teachers.colStatus" },
];
const DEFAULT_COLS = {
  name: true,
  username: true,
  gmail: true,
  phone: false,
  classes: false,
  status: false,
};

const SEARCH_DEBOUNCE_MS = 1000;
const EMPTY_FORM = {
  name: "",
  gmail: "",
  phone: "",
  dob: "",
  address: "",
  notes: "",
  username: "",
  password: "",
  classIds: [],
};

export default function AdminTeachersPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [ready, setReady] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState("true"); // "true" | "false" | ""
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("teachers.loading"));

  // Modal: "create" | "edit" | null
  const [modal, setModal] = useState(null);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({}); // field -> error key, set on Save
  const [saving, setSaving] = useState(false);
  // Delete-confirm cascade options (modal === "delete").
  const [delClasses, setDelClasses] = useState(false);
  const [delStudents, setDelStudents] = useState(false);

  // Column-visibility chooser (persisted in localStorage).
  const [visibleCols, setVisibleCols] = useState(() => ({
    ...DEFAULT_COLS,
    ...(storageGet(["teacherCols"]).teacherCols || {}),
  }));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef(null);

  const toggleCol = (key) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      storageSet({ teacherCols: next });
      return next;
    });
  };

  // Close the column menu when clicking outside it.
  useEffect(() => {
    if (!colMenuOpen) return undefined;
    const onDown = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colMenuOpen]);

  // Admin guard + load the class list (for the filter dropdown + multi-select).
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
        if (!isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        const classList = await fetchAllClasses().catch(() => []);
        if (cancelled) return;
        setClasses(classList);
        setReady(true);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error initializing teachers page:", error);
        setStatus(t("teachers.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  // Debounce the search box: only update debouncedQ 1000ms after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(t("teachers.loading"));
    try {
      const list = await fetchTeachersManage({
        q: debouncedQ,
        classId,
        isAccountActive: statusFilter,
      });
      setTeachers(list);
      setStatus(t("teachers.count", { n: list.length }));
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Load teachers error:", error);
      setStatus(t("teachers.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, classId, statusFilter, t]);

  // Re-query whenever the (debounced) search or a filter changes.
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const classNameById = useMemo(() => {
    const m = new Map();
    classes.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [classes]);

  const closeModal = () => {
    setModal(null);
    setActive(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFieldErrors({});
    setDelClasses(false);
    setDelStudents(false);
  };

  const openCreate = () => {
    setActive(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFieldErrors({});
    setModal("create");
  };

  const openEdit = (rec) => {
    setActive(rec);
    setForm({
      name: rec.name || "",
      gmail: rec.gmail || "",
      phone: rec.phone || "",
      dob: rec.dob || "",
      address: rec.address || "",
      notes: rec.notes || "",
      username: "",
      password: "",
      classIds: Array.isArray(rec.classIds) ? rec.classIds : [],
    });
    setFormError("");
    setFieldErrors({});
    setModal("edit");
  };

  // Sets a form field and clears any pending error highlight on it.
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const { [key]: _omit, ...rest } = fe;
      return rest;
    });
  };

  const inputClass = (key) => (fieldErrors[key] ? "input-error" : undefined);

  const onClassMultiSelect = (e) => {
    const ids = Array.from(e.target.selectedOptions, (o) => o.value);
    setForm((f) => ({ ...f, classIds: ids }));
  };

  const firstErrorMessage = (errors) => {
    if (Object.values(errors).includes("invalidGmail"))
      return t("teachers.errGmail");
    return t("teachers.errRequired");
  };

  const handleSave = async () => {
    const isCreate = modal === "create";
    const { ok, errors } = validateTeacherForm(form, { isCreate });
    if (!ok) {
      setFieldErrors(errors);
      setFormError(firstErrorMessage(errors));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const base = {
        name: form.name.trim(),
        gmail: form.gmail.trim(),
        phone: form.phone.trim(),
        dob: form.dob.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
        classIds: form.classIds,
      };
      const res = isCreate
        ? await createTeacher({
            ...base,
            username: form.username.trim(),
            password: form.password,
          })
        : await updateTeacher(active.id, base);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        const map = {
          gmail_exists: t("teachers.errGmailExists"),
          username_exists: t("teachers.errUsernameExists"),
        };
        setFormError(map[d?.error] || t("teachers.saveFailed"));
        return;
      }
      closeModal();
      setStatus(isCreate ? t("teachers.created") : t("teachers.updated"));
      await load();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setFormError(t("teachers.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rec) => {
    const closing = rec.isAccountActive;
    const msg = closing
      ? t("teachers.closeConfirm", { who: rec.name || rec.gmail })
      : t("teachers.reopenConfirm", { who: rec.name || rec.gmail });
    if (!window.confirm(msg)) return;
    try {
      const res = await updateTeacher(rec.id, { isAccountActive: !closing });
      if (!res.ok) {
        setStatus(t("teachers.saveFailed"));
        return;
      }
      setStatus(closing ? t("teachers.closed") : t("teachers.reopened"));
      await load();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setStatus(t("teachers.saveFailed"));
    }
  };

  const openDelete = (rec) => {
    setActive(rec);
    setDelClasses(false);
    setDelStudents(false);
    setModal("delete");
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      const res = await deleteTeacher(active.id, {
        deleteClasses: delClasses,
        deleteStudents: delStudents,
      });
      if (!res.ok) {
        setStatus(t("teachers.deleteFailed"));
        return;
      }
      closeModal();
      setStatus(t("teachers.deleted"));
      await load();
    } catch (error) {
      if (error.message !== "RE-AUTH_NEEDED")
        setStatus(t("teachers.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("teachers.title")}{" "}
              <span className="count-badge">{teachers.length}</span>
            </h2>
            <p>{t("teachers.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openCreate}>
            <i className="ti ti-plus" aria-hidden="true" /> {t("teachers.add")}
          </button>
        </div>

        <div className="cache-search">
          <input
            type="text"
            placeholder={t("teachers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchableSelect
            value={classId}
            onChange={setClassId}
            options={classes}
            placeholder={t("teachers.allClasses")}
            searchPlaceholder={t("common.searchClassPlaceholder")}
            noResultsText={t("common.noClassesFound")}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="true">{t("teachers.statusActive")}</option>
            <option value="false">{t("teachers.statusInactive")}</option>
            <option value="">{t("teachers.statusAll")}</option>
          </select>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("teachers.loading")}</span>
          </div>
        ) : teachers.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-user-off" aria-hidden="true" />
            <p>{t("teachers.empty")}</p>
          </div>
        ) : (
          <>
            <div
              className="menu-wrapper"
              ref={colMenuRef}
              style={{ marginBottom: "0.5rem" }}
            >
              <button
                className="menu-btn"
                onClick={() => setColMenuOpen((o) => !o)}
              >
                <i className="ti ti-columns" aria-hidden="true" />{" "}
                {t("teachers.columns")}
              </button>
              {colMenuOpen && (
                <div
                  className="menu-options"
                  style={{ left: 0, right: "auto" }}
                >
                  {COLUMN_DEFS.map((c) => (
                    <label className="cache-toggle" key={c.key}>
                      <input
                        type="checkbox"
                        checked={!!visibleCols[c.key]}
                        onChange={() => toggleCol(c.key)}
                      />
                      <span>{t(c.labelKey)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="cache-table-wrap">
              <table className="cache-table">
                <thead>
                  <tr>
                    {visibleCols.name && <th>{t("teachers.colName")}</th>}
                    {visibleCols.username && (
                      <th>{t("teachers.colUsername")}</th>
                    )}
                    {visibleCols.gmail && <th>{t("teachers.colGmail")}</th>}
                    {visibleCols.phone && <th>{t("teachers.colPhone")}</th>}
                    {visibleCols.classes && <th>{t("teachers.colClasses")}</th>}
                    {visibleCols.status && <th>{t("teachers.colStatus")}</th>}
                    <th>{t("teachers.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((tch) => (
                    <tr key={tch.id}>
                      {visibleCols.name && <td>{tch.name || "—"}</td>}
                      {visibleCols.username && <td>{tch.username || "—"}</td>}
                      {visibleCols.gmail && (
                        <td className="cell-date">{tch.gmail}</td>
                      )}
                      {visibleCols.phone && <td>{tch.phone || "—"}</td>}
                      {visibleCols.classes && (
                        <td>
                          {(tch.classNames && tch.classNames.length
                            ? tch.classNames
                            : (tch.classIds || []).map(
                                (id) => classNameById.get(id) || id,
                              )
                          ).join(", ") || "—"}
                        </td>
                      )}
                      {visibleCols.status && (
                        <td>
                          {tch.isAccountActive
                            ? t("teachers.statusActive")
                            : t("teachers.statusInactive")}
                        </td>
                      )}
                      <td className="cell-actions">
                        <button
                          className="btn-icon"
                          title={t("teachers.edit")}
                          aria-label={t("teachers.edit")}
                          onClick={() => openEdit(tch)}
                        >
                          <i className="ti ti-edit" aria-hidden="true" />
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => handleToggleActive(tch)}
                        >
                          {tch.isAccountActive
                            ? t("teachers.closeAccount")
                            : t("teachers.reopenAccount")}
                        </button>
                        <button
                          className="btn-cancel btn-text-danger"
                          onClick={() => openDelete(tch)}
                        >
                          {t("teachers.deleteAccount")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="status-line">{status}</div>

        {(modal === "create" || modal === "edit") && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>
                  {modal === "create"
                    ? t("teachers.addTitle")
                    : t("teachers.editTitle")}
                </h3>
              </div>

              <div className="field-group">
                <label>
                  {t("teachers.fName")}{" "}
                  <span
                    className="required-mark"
                    title={t("teachers.requiredField")}
                  >
                    *
                  </span>
                </label>
                <input
                  type="text"
                  className={inputClass("name")}
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  autoFocus
                />
              </div>
              <div className="field-group">
                <label>
                  {t("teachers.fGmail")}{" "}
                  <span
                    className="required-mark"
                    title={t("teachers.requiredField")}
                  >
                    *
                  </span>
                </label>
                <input
                  type="email"
                  className={inputClass("gmail")}
                  value={form.gmail}
                  onChange={(e) => setField("gmail", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>
                  {t("teachers.fPhone")}{" "}
                  <span
                    className="required-mark"
                    title={t("teachers.requiredField")}
                  >
                    *
                  </span>
                </label>
                <input
                  type="text"
                  className={inputClass("phone")}
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>
                  {t("teachers.fDob")}{" "}
                  <span
                    className="required-mark"
                    title={t("teachers.requiredField")}
                  >
                    *
                  </span>
                </label>
                <input
                  type="text"
                  className={inputClass("dob")}
                  placeholder="YYYY-MM-DD"
                  value={form.dob}
                  onChange={(e) => setField("dob", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>{t("teachers.fAddress")}</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>{t("teachers.fNotes")}</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>

              {modal === "create" && (
                <>
                  <div className="field-group">
                    <label>
                      {t("teachers.fUsername")}{" "}
                      <span
                        className="required-mark"
                        title={t("teachers.requiredField")}
                      >
                        *
                      </span>
                    </label>
                    <input
                      type="text"
                      className={inputClass("username")}
                      value={form.username}
                      onChange={(e) => setField("username", e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>
                      {t("teachers.fPassword")}{" "}
                      <span
                        className="required-mark"
                        title={t("teachers.requiredField")}
                      >
                        *
                      </span>
                    </label>
                    <input
                      type="password"
                      className={inputClass("password")}
                      value={form.password}
                      onChange={(e) => setField("password", e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="field-group">
                <label>{t("teachers.fClasses")}</label>
                <select
                  multiple
                  value={form.classIds}
                  onChange={onClassMultiSelect}
                  size={Math.min(6, Math.max(3, classes.length))}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {modal === "delete" && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("teachers.deleteAccount")}</h3>
              </div>
              <p>
                {t("teachers.deleteConfirm", {
                  who: active.name || active.gmail,
                })}
              </p>
              <div className="field-group">
                <label className="cache-toggle">
                  <input
                    type="checkbox"
                    checked={delClasses}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setDelClasses(v);
                      if (!v) setDelStudents(false);
                    }}
                  />
                  <span>{t("teachers.deleteOptClasses")}</span>
                </label>
                <label className="cache-toggle">
                  <input
                    type="checkbox"
                    checked={delStudents}
                    disabled={!delClasses}
                    onChange={(e) => setDelStudents(e.target.checked)}
                  />
                  <span>{t("teachers.deleteOptStudents")}</span>
                </label>
              </div>
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm btn-text-danger"
                  onClick={confirmDelete}
                  disabled={saving}
                >
                  {t("teachers.deleteAccount")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
