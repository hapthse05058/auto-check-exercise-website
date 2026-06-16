import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  bulkDeleteGradingCache,
  createGradingCache,
  deleteGradingCache,
  fetchGradingCache,
  updateGradingCache,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const SEARCH_FIELD_KEYS = [
  { value: "question", key: "fieldQuestion" },
  { value: "answer", key: "fieldAnswer" },
  { value: "feedback", key: "fieldFeedback" },
  { value: "model", key: "fieldModel" },
  { value: "promptVersion", key: "fieldPromptVersion" },
];

const EMPTY_FORM = {
  question: "",
  answer: "",
  feedback: "",
  model: "",
  promptVersion: "",
  hitCount: 0,
};

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function GradingCachePage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const SEARCH_FIELDS = SEARCH_FIELD_KEYS.map((f) => ({
    value: f.value,
    label: t(`cache.${f.key}`),
  }));

  const [field, setField] = useState("question");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [status, setStatus] = useState(t("cache.loadingInit"));
  const [loading, setLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Server-side paging (max 100 records per page).
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null); // null = add mode
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Load + admin gate.
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
        await runSearch("question", "");
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading grading cache:", error);
        setStatus(t("cache.loadFailedInit"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  async function runSearch(searchField = field, q = query, targetPage = 1) {
    setLoading(true);
    setStatus(t("cache.searching"));
    try {
      const data = await fetchGradingCache(
        searchField,
        q,
        targetPage,
        PAGE_SIZE,
      );
      setRows(data.results);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setSelected(new Set()); // selection is stale after a new page/search
      setStatus(
        data.total
          ? t("cache.found", { n: data.total })
          : t("cache.none"),
      );
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Search error:", error);
      setStatus(t("cache.searchFailed"));
    } finally {
      setLoading(false);
    }
  }

  const goToPage = (p) => {
    if (p < 1 || p > totalPages || loading) return;
    runSearch(field, query, p);
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  // Bulk-delete the selected records, then refetch the current page.
  const handleBulkDelete = async (ids) => {
    if (!ids.length) return;
    const ok = window.confirm(t("cache.bulkConfirm", { n: ids.length }));
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const response = await bulkDeleteGradingCache(ids);
      if (!response.ok) {
        setStatus(t("cache.bulkFailed"));
        return;
      }
      setStatus(t("cache.bulkDeleted", { n: ids.length }));
      // Refetch the current page (the BE clamps if this page no longer exists).
      await runSearch(field, query, page);
    } catch (error) {
      console.error("Bulk delete error:", error);
      setStatus(t("cache.bulkFailed"));
    } finally {
      setBulkDeleting(false);
    }
  };

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setForm({
      question: row.question ?? "",
      answer: row.answer ?? "",
      feedback: row.feedback ?? "",
      model: row.model ?? "",
      promptVersion: row.promptVersion ?? "",
      hitCount: row.hitCount ?? 0,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async () => {
    const errors = {};
    if (!form.question.trim()) errors.question = true;
    if (!form.answer.trim()) errors.answer = true;
    if (!form.feedback.trim()) errors.feedback = true;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const response = editId
        ? await updateGradingCache(editId, form)
        : await createGradingCache(form);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const msg =
          data?.error === "already_exists"
            ? t("cache.alreadyExists")
            : data?.error === "key_conflict"
              ? t("cache.keyConflict")
              : data?.error || t("cache.saveFailed");
        setStatus(msg);
        return;
      }

      setModalOpen(false);
      setStatus(editId ? t("cache.updated") : t("cache.added"));
      // Edited record stays on the current page; a new record sorts to page 1.
      await runSearch(field, query, editId ? page : 1);
    } catch (error) {
      console.error("Save error:", error);
      setStatus(t("cache.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const ok = window.confirm(
      t("cache.deleteConfirm", { q: row.question, a: row.answer }),
    );
    if (!ok) return;
    try {
      const response = await deleteGradingCache(row.id);
      if (!response.ok) {
        setStatus(t("cache.deleteFailed"));
        return;
      }
      setStatus(t("cache.deleted"));
      await runSearch(field, query, page);
    } catch (error) {
      console.error("Delete error:", error);
      setStatus(t("cache.deleteFailed"));
    }
  };

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("cache.title")}{" "}
              <span className="count-badge">{total}</span>
            </h2>
            <p>{t("cache.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openAdd}>
            <i className="ti ti-plus" aria-hidden="true"></i> {t("cache.addRecord")}
          </button>
        </div>

        <form
          className="cache-search"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {SEARCH_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("cache.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-confirm" type="submit" disabled={loading}>
            {t("common.search")}
          </button>
        </form>

        {rows.length > 0 && (
          <div className="cache-bulkbar">
            <span className="cache-bulk-count">{t("cache.selected", { n: selected.size })}</span>
            <button
              className="logout-btn"
              disabled={selected.size === 0 || bulkDeleting}
              onClick={() => handleBulkDelete([...selected])}
            >
              <i className="ti ti-trash" aria-hidden="true"></i> {t("cache.deleteSelected")}
            </button>
          </div>
        )}

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true"></span>
            <span>{t("cache.searching")}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-database" aria-hidden="true"></i>
            <p>{t("cache.empty")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th className="cell-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all on screen"
                    />
                  </th>
                  <th>{t("cache.colQuestion")}</th>
                  <th>{t("cache.colAnswer")}</th>
                  <th>{t("cache.colFeedback")}</th>
                  <th>{t("cache.colModel")}</th>
                  <th>{t("cache.colPv")}</th>
                  <th>{t("cache.colHits")}</th>
                  <th>{t("cache.colCreated")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={selected.has(row.id) ? "row-selected" : undefined}>
                    <td className="cell-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label="Select record"
                      />
                    </td>
                    <td className="cell-clip" title={row.question}>{row.question}</td>
                    <td className="cell-clip" title={row.answer}>{row.answer}</td>
                    <td className="cell-clip" title={row.feedback}>{row.feedback}</td>
                    <td>{row.model}</td>
                    <td>{row.promptVersion}</td>
                    <td>{row.hitCount}</td>
                    <td className="cell-date">{formatDate(row.createdAt)}</td>
                    <td className="cell-actions">
                      <button
                        className="btn-icon"
                        aria-label="Edit record"
                        onClick={() => openEdit(row)}
                      >
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button
                        className="btn-icon danger"
                        aria-label="Delete record"
                        onClick={() => handleDelete(row)}
                      >
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="cache-pager">
            <button
              className="btn-cancel"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              <i className="ti ti-chevron-left" aria-hidden="true"></i> {t("cache.prev")}
            </button>
            <span className="cache-pager-info">
              {t("cache.pageInfo", { page, total: totalPages })}
            </span>
            <button
              className="btn-cancel"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              {t("cache.next")} <i className="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        )}

        {modalOpen && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{editId ? t("cache.editTitle") : t("cache.addTitle")}</h3>
              </div>
              <div className="field-group">
                <label>{t("cache.question")}</label>
                <textarea
                  rows={2}
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                />
                {formErrors.question && (
                  <div className="err" style={{ display: "block" }}>
                    {t("cache.qafRequired")}
                  </div>
                )}
              </div>
              <div className="field-group">
                <label>{t("cache.answer")}</label>
                <textarea
                  rows={2}
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                />
                {formErrors.answer && (
                  <div className="err" style={{ display: "block" }}>
                    {t("cache.aRequired")}
                  </div>
                )}
              </div>
              <div className="field-group">
                <label>{t("cache.feedback")}</label>
                <textarea
                  rows={3}
                  value={form.feedback}
                  onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                />
                {formErrors.feedback && (
                  <div className="err" style={{ display: "block" }}>
                    {t("cache.fRequired")}
                  </div>
                )}
              </div>
              <div className="field-group">
                <label>{t("cache.modelOptional")}</label>
                <input
                  type="text"
                  placeholder="deepseek-chat"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label>{t("cache.pvOptional")}</label>
                <input
                  type="text"
                  placeholder="v1"
                  value={form.promptVersion}
                  onChange={(e) =>
                    setForm({ ...form, promptVersion: e.target.value })
                  }
                />
              </div>
              <div className="field-group">
                <label>{t("cache.hitCount")}</label>
                <input
                  type="number"
                  min={0}
                  value={form.hitCount}
                  onChange={(e) =>
                    setForm({ ...form, hitCount: Number(e.target.value) || 0 })
                  }
                />
              </div>
              {editId && (
                <p className="field-note">{t("cache.reKeyNote")}</p>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {editId ? t("cache.saveChanges") : t("cache.addRecord")}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
