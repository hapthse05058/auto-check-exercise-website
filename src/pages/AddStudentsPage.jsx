import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import {
  fetchAllClasses,
  fetchClasses,
  fetchStudents,
  saveStudents,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { extractDocId } from "../lib/googleDoc.js";
import {
  parseStudentsFromRows,
  resolveStudentImport,
} from "../lib/importStudents.js";
import {
  findDocIdDuplicates,
  groupDuplicatesByDoc,
} from "../lib/studentDuplicates.js";

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
  // Students already saved in the selected class. Every new Google Doc id is
  // checked against these (and against the staged list) so the same student
  // can't be added to the class twice.
  const [classStudents, setClassStudents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [rowErrors, setRowErrors] = useState([]);
  const [status, setStatus] = useState(t("addStudents.intro"));
  // "info" (default) or "warning" — drives the highlighted style on validation messages.
  const [statusType, setStatusType] = useState("info");
  // Result popup: null, or { kind: "success" | "error", text, title? }.
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  // Refs to the "Full name" input of each row so we can move focus there when a
  // new row is added (native autoFocus only fires on mount, not on re-render).
  const nameRefs = useRef([]);
  const prevRowsLength = useRef(rows.length);
  // Hidden <input type="file"> used by the "Import student list" button.
  const fileInputRef = useRef(null);
  // Mirrors `students` so the class-change effect can re-check the staged list
  // without re-fetching the class every time a student is added.
  const studentsRef = useRef(students);
  studentsRef.current = students;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; `t` is only used for status/error messages, adding it would re-fetch on language change
  }, [loadTeacherInfo, navigate]);

  /**
   * Turns clashes into one line per Google Doc, e.g.
   *   • Trần Thị Hải ↔ Nguyễn Văn An — already in this class
   * `groups` is `[{docId, names}]`, either built locally or returned by the
   * backend's 409; `savedInClass` are the class's saved students, used only to
   * tell the teacher which side the clash comes from.
   */
  const duplicateNoticeText = (groups, savedInClass = []) => {
    const classDocIds = new Set(
      savedInClass.map((s) => extractDocId(s.ggDocLink)).filter(Boolean),
    );
    return (
      t("addStudents.duplicateBlocked") +
      groups
        .map((group) => {
          const names = group.names.join(" ↔ ");
          return (
            "\n • " +
            (classDocIds.has(group.docId)
              ? t("addStudents.duplicateInClass", { names })
              : t("addStudents.duplicateInList", { names }))
          );
        })
        .join("")
    );
  };

  const showDuplicateNotice = (groups, savedInClass) => {
    setNotice({
      kind: "error",
      title: t("addStudents.duplicateTitle"),
      text: duplicateNoticeText(groups, savedInClass),
    });
  };

  // Load the students already saved in the class so the duplicate check has
  // something to compare against, and warn straight away if a student staged
  // before the class was picked is already in it.
  useEffect(() => {
    if (!classId) {
      setClassStudents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const saved = await fetchStudents(classId);
        if (cancelled) return;
        setClassStudents(saved);
        const { duplicates } = findDocIdDuplicates(studentsRef.current, saved);
        if (duplicates.length) {
          showDuplicateNotice(groupDuplicatesByDoc(duplicates), saved);
          setStatusType("warning");
          setStatus(t("addStudents.duplicateStatus"));
        }
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        // Not fatal: the backend rejects duplicates on save as well.
        console.error("Error loading students of the class:", error);
        setClassStudents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the class changes; `t` is used for messages only
  }, [classId]);

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
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index),
    );
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
    const validRowIndex = []; // valid[k] came from rows[validRowIndex[k]]
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
        validRowIndex.push(i);
      }
    });

    if (hasError) {
      setRowErrors(errors);
      return;
    }

    // Compare Google Doc ids (not raw links — the same doc has many URLs) against
    // the students already staged and the ones already saved in the class. When
    // editing, the row being edited must not clash with itself.
    const { duplicates } = findDocIdDuplicates(valid, [
      ...students.filter((_, i) => i !== editIndex),
      ...classStudents,
    ]);

    if (duplicates.length) {
      // Keep the modal open with the offending links flagged: nothing is added
      // until the teacher resolves every clash.
      const duplicateErrors = [];
      duplicates.forEach((d) => {
        duplicateErrors[validRowIndex[d.index]] = { doc: true };
      });
      setRowErrors(duplicateErrors);
      showDuplicateNotice(groupDuplicatesByDoc(duplicates), classStudents);
      return;
    }

    setStudents((prev) => {
      if (editIndex >= 0) {
        const next = [...prev];
        next[editIndex] = valid[0];
        return next;
      }
      return [...prev, ...valid];
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
      const sheetRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
      });
      const { students: parsed, skipped: skippedNoName } =
        parseStudentsFromRows(sheetRows);
      const res = resolveStudentImport(parsed, [...students, ...classStudents]);

      if (!res.ok) {
        // One Google Doc used by more than one student → block the whole file.
        showDuplicateNotice(res.conflicts, classStudents);
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
          (skipped
            ? "\n" + t("addStudents.importSkipped", { m: skipped })
            : ""),
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
      // Re-read the class right before writing: the list may have been staged a
      // while ago, Save may be clicked twice, or a co-teacher may have added the
      // same student meanwhile. A failure here isn't fatal — the backend rejects
      // duplicates too (409 below).
      try {
        const saved = await fetchStudents(classId);
        setClassStudents(saved);
        const { duplicates } = findDocIdDuplicates(students, saved);
        if (duplicates.length) {
          showDuplicateNotice(groupDuplicatesByDoc(duplicates), saved);
          setStatusType("warning");
          setStatus(t("addStudents.duplicateStatus"));
          return;
        }
      } catch (error) {
        if (error.message === "RE-AUTH_NEEDED") throw error;
        console.error("Duplicate pre-check failed:", error);
      }

      const response = await saveStudents(classId, studentsToSave);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (response.status === 409 && Array.isArray(errorData?.duplicates)) {
          showDuplicateNotice(errorData.duplicates, classStudents);
          setStatusType("warning");
          setStatus(t("addStudents.duplicateStatus"));
          return;
        }
        setStatus(errorData?.error || t("addStudents.saveFailed"));
        return;
      }

      // The saved students are now part of the class, so the next batch must be
      // checked against them too.
      setClassStudents((prev) => [...prev, ...studentsToSave]);

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
            <button
              className="btn-import"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="ti ti-file-import" aria-hidden="true" />{" "}
              {t("addStudents.importBtn")}
            </button>
            <button className="btn-add" onClick={() => openModal()}>
              <i className="ti ti-plus" aria-hidden="true" />{" "}
              {t("addStudents.add")}
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
          <SearchableSelect
            className="mb-1"
            value={classId}
            onChange={setClassId}
            options={classes}
            placeholder={t("addStudents.selectClass")}
            searchPlaceholder={t("common.searchClassPlaceholder")}
            noResultsText={t("common.noClassesFound")}
          />
        </div>

        <div id="listArea">
          {students.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users" aria-hidden="true" />
              <p>
                {t("addStudents.emptyStart")}{" "}
                <strong>{t("addStudents.emptyStartStrong")}</strong>{" "}
                {t("addStudents.emptyStartEnd")}
              </p>
            </div>
          ) : (
            <div>
              {students.map((s, i) => (
                // eslint-disable-next-line react/no-array-index-key -- no stable id; list is display/edit-only and never reordered
                <div className="student-card" key={`${s.gmail}-${i}`}>
                  <div className="student-index">{i + 1}</div>
                  <div className="avatar">{initials(s.name)}</div>
                  <div className="student-info">
                    <p className="student-name">{s.name}</p>
                    <div className="student-meta">
                      {s.gmail && (
                        <div className="meta-item">
                          <i className="ti ti-mail" aria-hidden="true" />
                          <span>{s.gmail}</span>
                        </div>
                      )}
                      <div className="meta-item">
                        <i className="ti ti-file-text" aria-hidden="true" />
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
                      <i className="ti ti-edit" aria-hidden="true" />
                    </button>
                    <button
                      className="btn-icon danger"
                      aria-label="Remove student"
                      onClick={() => removeStudent(i)}
                    >
                      <i className="ti ti-trash" aria-hidden="true" />
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
                <h3>
                  {editIndex >= 0
                    ? t("addStudents.editTitle")
                    : t("addStudents.addTitle")}
                </h3>
              </div>
              {/* Gmail field temporarily hidden — students can be added without an email. */}
              <div className="modal-body">
                {rows.map((row, i) => (
                  // eslint-disable-next-line react/no-array-index-key -- no stable id; list is display/edit-only and never reordered
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
                        <i className="ti ti-trash" aria-hidden="true" />
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
                        <i className="ti ti-plus" aria-hidden="true" />
                      </button>
                      <span className="tooltip-text">
                        {t("addStudents.addRowTooltip")}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={() => setModalOpen(false)}
                >
                  {t("common.cancel")}
                </button>
                <button className="btn-confirm" onClick={confirmStudents}>
                  {editIndex >= 0
                    ? t("addStudents.saveChanges")
                    : t("addStudents.saveStudent")}
                </button>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className="modal-bg open" onClick={() => setNotice(null)}>
            <div
              className="modal modal-notice"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>
                  {notice.title ||
                    (notice.kind === "error"
                      ? t("addStudents.importErrorTitle")
                      : t("addStudents.importResultTitle"))}
                </h3>
              </div>
              <div className="modal-body">
                <p
                  className={`notice-text${notice.kind === "error" ? " notice-error" : ""}`}
                >
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
          <button
            className="btn-add"
            onClick={handleSaveStudents}
            disabled={saving}
          >
            {t("addStudents.saveList")}
          </button>
        </div>
        <div
          className={`status-line${statusType === "warning" ? " status-warning" : ""}`}
        >
          {status}
        </div>
      </div>
    </div>
  );
}
