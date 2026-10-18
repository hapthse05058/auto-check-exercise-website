import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  markAllNotificationsRead,
  markNotificationRead,
  searchNotifications,
} from "../api/backend.js";
import ErrorNotice from "../components/ErrorNotice.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  NOTIFICATIONS_CHANGED,
  pathOf,
  relativeTime,
  renderNotification,
} from "../lib/notificationView.js";
import { formatDateTimeVn } from "../lib/scheduleTime.js";

const PAGE_SIZE = 20;

/** Each filter: its URL param, allowed values (first = default), i18n key. */
const FILTERS = [
  { param: "status", values: ["all", "unread", "read"], key: "status" },
  { param: "category", values: ["all", "grading", "system"], key: "category" },
  {
    param: "severity",
    values: ["all", "INFO", "WARN", "CRITICAL"],
    key: "severity",
  },
  { param: "range", values: ["30d", "7d", "today"], key: "range" },
];

/** The ISO start of a time range, in the viewer's own timezone for "today". */
function sinceOf(range) {
  const now = new Date();
  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
}

/**
 * Every notification addressed to the viewer, with filters. The bell only
 * keeps unread and recent ones; this is where the rest live until the
 * backend's TTL removes them. Filters sit in the URL, so a view can be
 * bookmarked and Back restores it.
 */
export default function NotificationsPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const reqRef = useRef(0);

  const filters = Object.fromEntries(
    FILTERS.map(({ param, values }) => {
      const value = searchParams.get(param);
      return [param, values.includes(value) ? value : values[0]];
    }),
  );
  const { status, category, severity, range } = filters;

  const setFilter = (param, value) => {
    const next = new URLSearchParams(searchParams);
    const { values } = FILTERS.find((f) => f.param === param);
    if (value === values[0]) next.delete(param);
    else next.set(param, value);
    setSearchParams(next, { replace: true });
  };

  // Load on every filter change; only the latest request may write state.
  useEffect(() => {
    const req = ++reqRef.current;
    setLoading(true);
    setFailed(false);
    searchNotifications({ status, category, severity, since: sinceOf(range) })
      .then((data) => {
        if (req !== reqRef.current) return;
        setItems(data.results || []);
        setTruncated(Boolean(data.truncated));
        setPage(1);
      })
      .catch((error) => {
        if (req !== reqRef.current || error.message === "RE-AUTH_NEEDED")
          return;
        console.error("Notifications search failed:", error);
        setFailed(true);
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false);
      });
    return () => {
      reqRef.current += 1;
    };
  }, [status, category, severity, range, reloadKey]);

  const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

  /** Opening an entry reads it; a linked one also takes you there. */
  const openItem = (item) => {
    if (!item.read) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
      markNotificationRead(item.id)
        .then(announce)
        .catch(() => setReloadKey((k) => k + 1));
    }
    const path = pathOf(item);
    if (path) navigate(path);
  };

  const unreadShown = items.some((n) => !n.read);
  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
      announce();
    } catch (error) {
      console.error("Mark all read failed:", error);
    } finally {
      // The server marks its newest page read, which may differ from this
      // filtered list — re-read to show the true state.
      setReloadKey((k) => k + 1);
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const absolute = (iso) =>
    iso ? formatDateTimeVn(iso, { seconds: true }) : "";

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("notifPage.title")}{" "}
              {!loading && !failed && (
                <span className="count-badge">{items.length}</span>
              )}
            </h2>
            <p>{t("notifPage.subtitle")}</p>
          </div>
          {unreadShown && (
            <button
              type="button"
              className="secondary-btn"
              onClick={markAllRead}
            >
              <i className="ti ti-checks" aria-hidden="true" />
              {t("notifPage.markAllRead")}
            </button>
          )}
        </div>

        <div className="cache-search notif-filters">
          {FILTERS.map(({ param, values, key }) => (
            <select
              key={param}
              value={filters[param]}
              onChange={(e) => setFilter(param, e.target.value)}
              aria-label={t(`notifPage.${key}.label`)}
            >
              {values.map((value) => (
                <option key={value} value={value}>
                  {t(`notifPage.${key}.${value}`)}
                </option>
              ))}
            </select>
          ))}
        </div>

        {failed ? (
          <ErrorNotice
            message={t("notifPage.loadFailed")}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        ) : loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("notifPage.loading")}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-bell-off" aria-hidden="true" />
            <p>{t("notifPage.empty")}</p>
          </div>
        ) : (
          <ul className="notif-page-list">
            {visible.map((item) => {
              const { title, body } = renderNotification(item, t);
              const linked = Boolean(pathOf(item));
              const clickable = linked || !item.read;
              return (
                <li
                  key={item.id}
                  className={`notif-item notif-page-item ${item.read ? "" : "unread"} sev-${item.severity}${clickable ? " clickable" : ""}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => openItem(item) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === "Enter") openItem(item);
                        }
                      : undefined
                  }
                >
                  <div className="notif-page-head">
                    <span className="notif-item-title">{title}</span>
                    <span
                      className={`notif-sev-badge sev-${item.severity}`}
                      title={t("notifPage.severity.label")}
                    >
                      {t(`notifPage.severity.${item.severity}`)}
                    </span>
                  </div>
                  <span className="notif-item-body">{body}</span>
                  <span className="notif-time" title={absolute(item.createdAt)}>
                    {t(`notifPage.category.${item.category || "system"}`)} ·{" "}
                    {relativeTime(item.createdAt, t)}
                    {linked && (
                      <i
                        className="ti ti-external-link notif-link-icon"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !failed && totalPages > 1 && (
          <div className="cache-pager">
            <button
              className="btn-cancel"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <i className="ti ti-chevron-left" aria-hidden="true" />{" "}
              {t("notifPage.prev")}
            </button>
            <span className="cache-pager-info">
              {t("notifPage.pageInfo", { page, total: totalPages })}
            </span>
            <button
              className="btn-cancel"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              {t("notifPage.next")}{" "}
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </div>
        )}

        {!loading && truncated && (
          <p className="status-line">{t("notifPage.truncated")}</p>
        )}
      </div>
    </div>
  );
}
