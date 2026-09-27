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
import DataTable from "../components/DataTable.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const SEARCH_FIELD_KEYS = [
  { value: "question", key: "fieldQuestion" },
  { value: "answer", key: "fieldAnswer" },
  { value: "feedback", key: "fieldFeedback" },
  { value: "model", key: "fieldModel" },
  { value: "promptVersion", key: "fieldPromptVersion" },
  { value: "taskType", key: "fieldTaskType" },
];

const EMPTY_FORM = {
  question: "",
  answer: "",
  feedback: "",
  model: "",
  promptVersion: "",
  taskType: "",
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

  const [field, setField] = useState("answer");
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
        data.total ? t("cache.found", { n: data.total }) : t("cache.none"),
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
      taskType: row.taskType ?? "",
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

  // Server-paginated: sorting would only reorder the page on screen.
  const clip = (field) => ({
    className: "cell-clip",
    cellProps: (r) => ({ title: r[field] }),
  });
  const columns = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Select all on screen"
        />
      ),
      meta: { className: "cell-check", headerClassName: "cell-check" },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selected.has(row.original.id)}
          onChange={() => toggleOne(row.original.id)}
          aria-label="Select record"
        />
      ),
    },
    {
      id: "question",
      header: t("cache.colQuestion"),
      meta: clip("question"),
      cell: ({ row }) => row.original.question,
    },
    {
      id: "answer",
      header: t("cache.colAnswer"),
      meta: clip("answer"),
      cell: ({ row }) => row.original.answer,
    },
    {
      id: "feedback",
      header: t("cache.colFeedback"),
      meta: clip("feedback"),
      cell: ({ row }) => row.original.feedback,
    },
    {
      id: "model",
      header: t("cache.colModel"),
      cell: ({ row }) => row.original.model,
    },
    {
      id: "pv",
      header: t("cache.colPv"),
      cell: ({ row }) => row.original.promptVersion,
    },
    {
      id: "taskType",
      header: t("cache.colTaskType"),
      cell: ({ row }) => row.original.taskType || "vi_en",
    },
    {
      id: "hits",
      header: t("cache.colHits"),
      cell: ({ row }) => row.original.hitCount,
    },
    {
      id: "created",
      header: t("cache.colCreated"),
      meta: { className: "cell-date" },
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "action",
      header: "",
      meta: { className: "cell-actions" },
      cell: ({ row }) => (
        <div className="row-actions">
          <button
            className="btn-icon"
            aria-label="Edit record"
            onClick={() => openEdit(row.original)}
          >
            <i className="ti ti-edit" aria-hidden="true" />
          </button>
          <button
            className="btn-icon danger"
            aria-label="Delete record"
            onClick={() => handleDelete(row.original)}
          >
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("cache.title")} <span className="count-badge">{total}</span>
            </h2>
            <p>{t("cache.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openAdd}>
            <i className="ti ti-plus" aria-hidden="true" />{" "}
            {t("cache.addRecord")}
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
            <span className="cache-bulk-count">
              {t("cache.selected", { n: selected.size })}
            </span>
            <button
              className="logout-btn"
              disabled={selected.size === 0 || bulkDeleting}
              onClick={() => handleBulkDelete([...selected])}
            >
              <i className="ti ti-trash" aria-hidden="true" />{" "}
              {t("cache.deleteSelected")}
            </button>
          </div>
        )}

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("cache.searching")}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-database" aria-hidden="true" />
            <p>{t("cache.empty")}</p>
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            enableSorting={false}
            rowClassName={(r) =>
              selected.has(r.id) ? "row-selected" : undefined
            }
          />
        )}

        {!loading && totalPages > 1 && (
          <div className="cache-pager">
            <button
              className="btn-cancel"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              <i className="ti ti-chevron-left" aria-hidden="true" />{" "}
              {t("cache.prev")}
            </button>
            <span className="cache-pager-info">
              {t("cache.pageInfo", { page, total: totalPages })}
            </span>
            <button
              className="btn-cancel"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              {t("cache.next")}{" "}
              <i className="ti ti-chevron-right" aria-hidden="true" />
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
                  onChange={(e) =>
                    setForm({ ...form, question: e.target.value })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, feedback: e.target.value })
                  }
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
                <label>{t("cache.taskTypeOptional")}</label>
                <select
                  value={form.taskType}
                  onChange={(e) =>
                    setForm({ ...form, taskType: e.target.value })
                  }
                >
                  <option value="">vi_en</option>
                  <option value="active_passive">active_passive</option>
                  <option value="paragraph">paragraph</option>
                </select>
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
              {editId && <p className="field-note">{t("cache.reKeyNote")}</p>}
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
