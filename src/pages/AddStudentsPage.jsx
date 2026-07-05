import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { fetchAllClasses, fetchClasses, saveStudents } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { parseStudentsFromRows, resolveStudentImport } from "../lib/importStudents.js";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortUrl(url) {
  try {
    return new URL(url).hostname.replace("www.", "") + "/…";
  } catch {
    return url;
  }
}

const EMPTY_ROW = { name: "", gmail: "", doc: "" };

export default function AddStudentsPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [rowErrors, setRowErrors] = useState([]);
  const [status, setStatus] = useState(t("addStudents.intro"));
  // "info" (default) or "warning" — drives the highlighted style on validation messages.
  const [statusType, setStatusType] = useState("info");
  // Import-result popup: null, or { kind: "success" | "error", text }.
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  // Refs to the "Full name" input of each row so we can move focus there when a
  // new row is added (native autoFocus only fires on mount, not on re-render).
  const nameRefs = useRef([]);
  const prevRowsLength = useRef(rows.length);
  // Hidden <input type="file"> used by the "Import student list" button.
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Only auto-focus when rows GREW (user clicked +), not when a row was removed.
    if (rows.length > prevRowsLength.current) {
      nameRefs.current[rows.length - 1]?.focus();
    }
    prevRowsLength.current = rows.length;
  }, [rows.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        // Unregistered teacher (403 → null): send them to sign up, matching
        // the extension's gating and GradePage.
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        // Admin can add students to any class, so load every class.
        const classList = isAdminEmail(teacherInfo.gmail)
          ? await fetchAllClasses()
          : await fetchClasses(teacherInfo.id);
        if (!cancelled)
          setClasses(classList.filter((c) => c.isActive !== false));
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error fetching classes:", error);
        setStatus(t("addStudents.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  const openModal = (index = -1) => {
    setEditIndex(index);
    setRows(index >= 0 ? [{ ...students[index] }] : [{ ...EMPTY_ROW }]);
    setRowErrors([]);
    setModalOpen(true);
    // Defer until React has mounted the modal's inputs, then focus the first row.
    setTimeout(() => nameRefs.current[0]?.focus(), 0);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  };

  const removeRow = (index) => {
    // Always keep at least one row in the form.
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    setRowErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    // Clear this field's error as soon as the user edits it again.
    if (rowErrors[index]?.[field]) {
      setRowErrors((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], [field]: false };
        return next;
      });
    }
  };

  const isBlankRow = (r) => !r.name.trim() && !r.doc.trim();

  const confirmStudents = () => {
    // Opened the form but typed nothing → treat as cancel, close silently.
    if (rows.length === 1 && isBlankRow(rows[0])) {
      setModalOpen(false);
      return;
    }

    // Validate every non-blank row; track errors by the row's original index.
    const errors = [];
    const valid = [];
    let hasError = false;
    rows.forEach((r, i) => {
      if (isBlankRow(r)) return; // drop fully-empty rows, even in the middle
      const name = r.name.trim();
      const gmail = r.gmail.trim();
      const doc = r.doc.trim();
      const e = {};
      if (!name) e.name = true;
      // Gmail is temporarily optional; only validate when provided.
      if (gmail && !gmail.includes("@")) e.gmail = true;
      if (!doc.startsWith("http")) e.doc = true;
      if (Object.keys(e).length > 0) {
        errors[i] = e;
        hasError = true;
      } else {
        valid.push({ name, gmail, doc });
      }
    });

    if (hasError) {
      setRowErrors(errors);
      return;
    }

    setStudents((prev) => {
      if (editIndex >= 0) {
        const next = [...prev];
        next[editIndex] = valid[0];
        return next;
      }

      // 1. Create a fresh copy of the previous state array to avoid direct mutation
      const nextStudents = [...prev];
      /** @type {typeof valid} */
      const duplicateElements = [];

      valid.forEach((v) => {
        // Check against our growing list of students
        const isDuplicate = nextStudents.some((element) => element.doc === v.doc);

        if (!isDuplicate) {
          nextStudents.push(v);
        } else {
          duplicateElements.push(v); // Push the actual object, not an array [v]
        }
      });

      // 2. Trigger the notification if duplicates exist
      if (duplicateElements.length > 0) {
        setNotice({
          kind: "error",
          text: t("addStudents.duplicateDoc", {
            doc: duplicateElements[0].doc,
            dublicatedNames: duplicateElements.map(e => e.name).join(", ")
          })
        });
      }

      // 3. Return the brand new state array
      return nextStudents;
    });
    setModalOpen(false);
  };

  const removeStudent = (index) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file fires onChange again
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      const { students: parsed, skipped: skippedNoName } = parseStudentsFromRows(sheetRows);
      const res = resolveStudentImport(parsed, students);

      if (!res.ok) {
        // Same Google Doc with different names → block the whole file.
        setNotice({
          kind: "error",
          text:
            t("addStudents.importConflict") +
            res.conflicts.map((c) => `\n • ${c.names.join(" ↔ ")}`).join(""),
        });
        return;
      }
      if (!res.toAdd.length) {
        setNotice({ kind: "error", text: t("addStudents.importNone") });
        return;
      }

      setStudents((prev) => [...prev, ...res.toAdd]);
      const skipped = skippedNoName + res.skippedNoId;
      setNotice({
        kind: "success",
        text:
          t("addStudents.importSuccess", { n: res.toAdd.length }) +
          (skipped ? "\n" + t("addStudents.importSkipped", { m: skipped }) : "") +
          (res.duplicates ? "\n" + t("addStudents.importDuplicates", { d: res.duplicates }) : ""),
      });
    } catch (error) {
      console.error("Import students failed:", error);
      setNotice({ kind: "error", text: t("addStudents.importError") });
    }
  };

  const handleSaveStudents = async () => {
    setStatusType("info"); // reset; only validation branches below raise a warning
    if (!classId) {
      setStatusType("warning");
      setStatus(t("addStudents.selectClassFirst"));
      return;
    }

    const studentsToSave = students
      .map((s) => ({ gmail: s.gmail, name: s.name, ggDocLink: s.doc }))
      .filter((student) => student.name);

    if (!studentsToSave.length) {
      setStatusType("warning");
      setStatus(t("addStudents.atLeastOne"));
      return;
    }

    setStatus(t("addStudents.saving"));
    setSaving(true);
    try {
      const response = await saveStudents(classId, studentsToSave);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setStatus(errorData?.error || t("addStudents.saveFailed"));
        return;
      }

      const confirmed = window.confirm(t("addStudents.savedConfirm"));
      if (confirmed) {
        navigate("/grade");
      } else {
        setStudents([]);
        setStatus(t("addStudents.savedMore"));
      }
    } catch (error) {
      console.error("Error saving students:", error);
      setStatus(t("addStudents.saveError"));
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
              {t("addStudents.listTitle")}{" "}
              <span className="count-badge">
                {students.length === 1
                  ? t("addStudents.countOne", { n: students.length })
                  : t("addStudents.countMany", { n: students.length })}
              </span>
            </h2>
            <p>{t("addStudents.subtitle")}</p>
          </div>
          <div className="topbar-actions">
            <button className="btn-import" onClick={() => fileInputRef.current?.click()}>
              <i className="ti ti-file-import" aria-hidden="true"></i> {t("addStudents.importBtn")}
            </button>
            <button className="btn-add" onClick={() => openModal()}>
              <i className="ti ti-plus" aria-hidden="true"></i> {t("addStudents.add")}
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />

        <div className="field-group">
          <label>{t("addStudents.className")}</label>
          <select
            className="mb-1"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">{t("addStudents.selectClass")}</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div id="listArea">
          {students.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users" aria-hidden="true"></i>
              <p>
                {t("addStudents.emptyStart")}{" "}
                <strong>{t("addStudents.emptyStartStrong")}</strong>{" "}
                {t("addStudents.emptyStartEnd")}
              </p>
            </div>
          ) : (
            <div>
              {students.map((s, i) => (
                <div className="student-card" key={`${s.gmail}-${i}`}>
                  <div className="student-index">{i + 1}</div>
                  <div className="avatar">{initials(s.name)}</div>
                  <div className="student-info">
                    <p className="student-name">{s.name}</p>
                    <div className="student-meta">
                      {s.gmail && (
                        <div className="meta-item">
                          <i className="ti ti-mail" aria-hidden="true"></i>
                          <span>{s.gmail}</span>
                        </div>
                      )}
                      <div className="meta-item">
                        <i className="ti ti-file-text" aria-hidden="true"></i>
                        <a href={s.doc} target="_blank" rel="noreferrer">
                          {shortUrl(s.doc)}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      className="btn-icon"
                      aria-label="Edit student"
                      onClick={() => openModal(i)}
                    >
                      <i className="ti ti-edit" aria-hidden="true"></i>
                    </button>
                    <button
                      className="btn-icon danger"
                      aria-label="Remove student"
                      onClick={() => removeStudent(i)}
                    >
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{editIndex >= 0 ? t("addStudents.editTitle") : t("addStudents.addTitle")}</h3>
              </div>
              {/* Gmail field temporarily hidden — students can be added without an email. */}
              <div className="modal-body">
                {rows.map((row, i) => (
                  <div className="student-row" key={i}>
                    <div className="student-row-fields">
                      <div className="field-group">
                        <label>{t("addStudents.fullName")}</label>
                        <input
                          type="text"
                          placeholder={t("addStudents.fullNamePlaceholder")}
                          value={row.name}
                          ref={(el) => (nameRefs.current[i] = el)}
                          onChange={(e) => updateRow(i, "name", e.target.value)}
                        />
                        {rowErrors[i]?.name && (
                          <div className="err" style={{ display: "block" }}>
                            {t("addStudents.errName")}
                          </div>
                        )}
                      </div>
                      <div className="field-group">
                        <label>{t("addStudents.docLink")}</label>
                        <input
                          type="url"
                          placeholder={t("addStudents.docLinkPlaceholder")}
                          value={row.doc}
                          onChange={(e) => updateRow(i, "doc", e.target.value)}
                        />
                        {rowErrors[i]?.doc && (
                          <div className="err" style={{ display: "block" }}>
                            {t("addStudents.errDoc")}
                          </div>
                        )}
                      </div>
                    </div>
                    {editIndex < 0 && (
                      <button
                        type="button"
                        className="btn-icon danger row-remove"
                        aria-label={t("addStudents.removeRow")}
                        onClick={() => removeRow(i)}
                      >
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                ))}
                {editIndex < 0 && (
                  <div className="add-row-bar">
                    <span className="tooltip-wrap">
                      <button
                        type="button"
                        className="btn-add-row"
                        onClick={addRow}
                        aria-label={t("addStudents.addRowTooltip")}
                      >
                        <i className="ti ti-plus" aria-hidden="true"></i>
                      </button>
                      <span className="tooltip-text">{t("addStudents.addRowTooltip")}</span>
                    </span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setModalOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button className="btn-confirm" onClick={confirmStudents}>
                  {editIndex >= 0 ? t("addStudents.saveChanges") : t("addStudents.saveStudent")}
                </button>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className="modal-bg open" onClick={() => setNotice(null)}>
            <div className="modal modal-notice" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  {notice.kind === "error"
                    ? t("addStudents.importErrorTitle")
                    : t("addStudents.importResultTitle")}
                </h3>
              </div>
              <div className="modal-body">
                <p className={`notice-text${notice.kind === "error" ? " notice-error" : ""}`}>
                  {notice.text}
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn-confirm" onClick={() => setNotice(null)}>
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/grade")}>
            {t("common.backHome")}
          </button>
          <button className="btn-add" onClick={handleSaveStudents} disabled={saving}>
            {t("addStudents.saveList")}
          </button>
        </div>
        <div className={`status-line${statusType === "warning" ? " status-warning" : ""}`}>
          {status}
        </div>
      </div>
    </div>
  );
}
