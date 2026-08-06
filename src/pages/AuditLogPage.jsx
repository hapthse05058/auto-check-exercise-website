import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchAuditFilterOptions, fetchAuditLogs } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import MultiSelect from "../components/MultiSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const PAGE_SIZE = 50;
// Same debounce as the teacher management screen, so typing does not spam the API.
const SEARCH_DEBOUNCE_MS = 1000;

/**
 * Filterable fields, mirroring AUDIT_FILTER_FIELDS on the backend.
 * `enum` fields get a multiselect (values come from the server), the rest get a
 * free-text box.
 */
const FILTER_FIELDS = [
  { value: "action", type: "enum" },
  { value: "resourceType", type: "enum" },
  { value: "severity", type: "enum" },
  { value: "method", type: "enum" },
  { value: "success", type: "enum" },
  { value: "actorEmail", type: "text" },
  { value: "actorName", type: "text" },
  { value: "entityId", type: "text" },
  { value: "path", type: "text" },
  { value: "detail", type: "text" },
  { value: "ip", type: "text" },
  { value: "requestId", type: "text" },
];

const DEFAULT_WINDOW_DAYS = 7;

/** YYYY-MM-DD in local time, for the native date inputs. */
function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Read-only audit trail (admin only). Entries are written server-side by the
 * audit middleware — this screen never creates or edits anything.
 */
export default function AuditLogPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // The route is reachable by URL even though the menu item is hidden, so hold
  // rendering until the admin gate has resolved.
  const [checking, setChecking] = useState(true);

  const [field, setField] = useState("action");
  const [selectedValues, setSelectedValues] = useState([]); // enum fields
  const [textValue, setTextValue] = useState(""); // text fields
  const [debouncedText, setDebouncedText] = useState("");
  const [from, setFrom] = useState(() =>
    toDateInput(
      new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    ),
  );
  const [to, setTo] = useState(() => toDateInput(new Date()));

  const [options, setOptions] = useState({});
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fieldType =
    FILTER_FIELDS.find((f) => f.value === field)?.type ?? "text";

  /**
   * Translated action name, falling back to the raw code. Dots become
   * underscores because t() resolves dotted keys as a nested path, and an
   * unlisted backend route logs a generic action like "POST /exam".
   */
  const actionLabel = (action) => {
    const key = `audit.action.${String(action).replace(/\./g, "_")}`;
    const label = t(key);
    return label === key ? action : label;
  };

  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedText(textValue),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [textValue]);

  // Admin gate + one-off load of the multiselect option lists.
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
        setChecking(false);
        const data = await fetchAuditFilterOptions();
        if (!cancelled) setOptions(data.options || {});
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading audit filter options:", error);
        setStatus(t("audit.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  const runSearch = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      setStatus(t("audit.searching"));
      try {
        const q =
          fieldType === "enum" ? selectedValues.join(",") : debouncedText;
        const data = await fetchAuditLogs({
          field,
          q,
          from,
          to,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        setRows(data.results);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setStatus(
          data.total ? t("audit.found", { n: data.total }) : t("audit.none"),
        );
      } catch (error) {
        if (error.message === "RE-AUTH_NEEDED") return;
        console.error("Audit search error:", error);
        setStatus(t("audit.searchFailed"));
      } finally {
        setLoading(false);
      }
    },
    [field, fieldType, selectedValues, debouncedText, from, to, t],
  );

  // Any filter change re-runs the search from page 1.
  useEffect(() => {
    if (checking) return;
    runSearch(1);
  }, [checking, runSearch]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages || loading) return;
    runSearch(p);
  };

  /** Switching field must drop the previous field's value, not carry it over. */
  const handleFieldChange = (nextField) => {
    setField(nextField);
    setSelectedValues([]);
    setTextValue("");
    setDebouncedText("");
    setPage(1);
  };

  if (checking) return null;

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("audit.title")} <span className="count-badge">{total}</span>
            </h2>
            <p>{t("audit.subtitle")}</p>
          </div>
        </div>

        <div className="cache-search">
          <select
            value={field}
            onChange={(e) => handleFieldChange(e.target.value)}
            aria-label={t("audit.filterField")}
          >
            {FILTER_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(`audit.field.${f.value}`)}
              </option>
            ))}
          </select>

          {fieldType === "enum" ? (
            <MultiSelect
              value={selectedValues}
              onChange={setSelectedValues}
              options={options[field] || []}
              placeholder={t("audit.allValues")}
              summaryText={(n) => t("audit.selectedCount", { n })}
              renderLabel={field === "action" ? actionLabel : undefined}
            />
          ) : (
            <input
              type="text"
              placeholder={t("audit.searchPlaceholder")}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
            />
          )}

          <label className="audit-date">
            {t("audit.from")}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="audit-date">
            {t("audit.to")}
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("audit.searching")}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-history" aria-hidden="true" />
            <p>{t("audit.empty")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th>{t("audit.colTime")}</th>
                  <th>{t("audit.colActor")}</th>
                  <th>{t("audit.colAction")}</th>
                  <th>{t("audit.colResource")}</th>
                  <th>{t("audit.colSeverity")}</th>
                  <th>{t("audit.colEntity")}</th>
                  <th>{t("audit.colResult")}</th>
                  <th>{t("audit.colDuration")}</th>
                  <th>{t("audit.colDetail")}</th>
                  <th>{t("audit.colIp")}</th>
                  <th>{t("audit.colRequestId")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-date">{formatDate(row.createdAt)}</td>
                    <td className="cell-clip" title={row.actorEmail}>
                      {row.actorName || row.actorEmail || "—"}
                      {row.actorName && row.actorEmail ? (
                        <div className="audit-actor-email">
                          {row.actorEmail}
                        </div>
                      ) : null}
                    </td>
                    <td title={row.action}>{actionLabel(row.action)}</td>
                    <td>{row.resourceType}</td>
                    <td>
                      <span
                        className={`audit-severity audit-severity-${row.severity.toLowerCase()}`}
                      >
                        {row.severity}
                      </span>
                    </td>
                    <td className="cell-clip" title={row.entityId}>
                      {row.entityId || "—"}
                    </td>
                    <td title={`HTTP ${row.statusCode ?? "?"}`}>
                      {row.success ? "✓" : "✗"} {row.statusCode ?? ""}
                    </td>
                    <td>
                      {row.durationMs === null || row.durationMs === undefined
                        ? "—"
                        : `${row.durationMs}ms`}
                    </td>
                    <td className="cell-clip" title={row.detail}>
                      {row.detail || "—"}
                    </td>
                    <td>{row.ip || "—"}</td>
                    <td
                      className="cell-clip"
                      title={t("audit.copyRequestId", { id: row.requestId })}
                      onClick={() =>
                        navigator.clipboard?.writeText(row.requestId || "")
                      }
                    >
                      {row.requestId ? row.requestId.slice(0, 8) : "—"}
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
              <i className="ti ti-chevron-left" aria-hidden="true" />{" "}
              {t("audit.prev")}
            </button>
            <span className="cache-pager-info">
              {t("audit.pageInfo", { page, total: totalPages })}
            </span>
            <button
              className="btn-cancel"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              {t("audit.next")}{" "}
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </div>
        )}

        <p className="status-line">{status}</p>
      </div>
    </div>
  );
}
