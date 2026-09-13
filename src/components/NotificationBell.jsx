import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchNotifications,
  markAllNotificationsRead,
} from "../api/backend.js";
import { usePushNotifications } from "../hooks/usePushNotifications.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { PUSH_EVENT } from "../lib/push.js";

/** Poll cadence, matched to AuthContext's proactiveTokenRefresh interval. */
const POLL_MS = 60_000;

/** "deepseek.lowBalance" -> "deepseekLowBalance" (the i18n key segment). */
function typeKey(type) {
  return String(type || "")
    .split(".")
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");
}

function relativeTime(iso, t) {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("notif.justNow");
  if (minutes < 60) return t("notif.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notif.hoursAgo", { n: hours });
  return t("notif.daysAgo", { n: Math.floor(hours / 24) });
}

/**
 * Renders a notification through i18n when we have strings for its type, so it
 * follows the viewer's language. Falls back to the server-rendered title/body
 * otherwise — that way a notification type added on the backend still displays
 * correctly without a frontend release.
 */
function renderNotification(item, t) {
  const key = `notif.type.${typeKey(item.type)}`;
  const title = t(key);
  if (title === key) return { title: item.title, body: item.body };

  const bodyKey = `${key}Body`;
  // Two decimals, matching the server-rendered body, so the same alert reads
  // identically whether it comes through i18n here or straight from Firestore.
  const amount = (v) =>
    v === null || v === undefined || v === "" ? "" : Number(v).toFixed(2);
  // Every field of `data` is available as a placeholder, so a new notification
  // type only needs its i18n strings — no change here. The balance-specific
  // aliases below are extra names on top, not a replacement for the raw fields.
  const vars = {
    ...(item.data || {}),
    balance: amount(item.data?.totalBalance),
    currency: item.data?.currency ?? "",
    threshold: amount(item.data?.threshold),
  };
  const body = t(bodyKey, vars);
  // A body still carrying {placeholders} means the i18n string expects a field
  // this notification does not have — fall back to what the server rendered
  // rather than showing the user raw braces.
  if (body === bodyKey || /\{[a-zA-Z]\w*\}/.test(body)) {
    return { title, body: item.body };
  }
  return { title, body };
}

/**
 * Admin notification bell. Rendered only for admins (see Layout).
 *
 * Reuses the header dropdown pattern from NavMenu/ProfileMenu: `menu-wrapper` +
 * `menu-btn` + `menu-options`, closed by an outside click.
 *
 * Every failure is swallowed. A bell that cannot reach the backend must show
 * nothing, never an alarming error — the same treatment AuditLogPage gives a
 * failed load.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const wrapperRef = useRef(null);
  // Ids that were unread when the dropdown was opened — kept highlighted until
  // it closes, even though they are already marked read on the server.
  const justReadRef = useRef(new Set());
  const { t } = useLanguage();
  const push = usePushNotifications();

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications({ limit: 30 });
      setItems(data.results || []);
      setUnread(data.unreadCount || 0);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Poll, but never while the tab is hidden — a background tab costs nothing.
  useEffect(() => {
    let timer = null;
    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // A push delivered while this tab is focused is handed to the page, not shown
  // by the service worker — refresh immediately instead of waiting for the poll.
  useEffect(() => {
    const onPush = () => load();
    window.addEventListener(PUSH_EVENT, onPush);
    return () => window.removeEventListener(PUSH_EVENT, onPush);
  }, [load]);

  useEffect(() => {
    const onClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        justReadRef.current = new Set();
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  /**
   * Opening the bell IS the "I have seen these" gesture — there is no separate
   * button to press.
   *
   * The ids that were unread at that moment are kept in a ref so they keep the
   * `unread` styling for as long as the dropdown stays open: the badge clears
   * immediately, but the user can still tell at a glance which entries are the
   * new ones. Closing the dropdown drops the ref, so the next open shows them
   * as ordinary read entries.
   *
   * The server write is fire-and-forget: the panel must open instantly, not
   * after a round trip. If the write fails we re-load to show the true state.
   */
  const toggleOpen = () => {
    setOpen((wasOpen) => {
      if (wasOpen) {
        justReadRef.current = new Set();
        return false;
      }
      const stillUnread = items.filter((n) => !n.read).map((n) => n.id);
      justReadRef.current = new Set(stillUnread);
      if (stillUnread.length > 0) {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnread(0);
        markAllNotificationsRead().catch(() => load());
      }
      return true;
    });
  };

  return (
    <div className="menu-wrapper" ref={wrapperRef}>
      <button
        className="menu-btn notif-btn"
        title={t("notif.title")}
        aria-label={t("notif.title")}
        onClick={toggleOpen}
      >
        <i className="ti ti-bell" aria-hidden="true" />
        {unread > 0 && (
          <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="menu-options notif-popover">
          <div className="notif-header">
            <strong>{t("notif.title")}</strong>
            {unread > 0 && (
              <span className="notif-count">
                {t("notif.unread", { n: unread })}
              </span>
            )}
          </div>

          {push.canEnable && (
            <button
              className="menu-option install-option"
              disabled={push.busy}
              onClick={push.enable}
            >
              <i className="ti ti-bell-plus" aria-hidden="true" />
              {t("notif.enablePush")}
            </button>
          )}

          {failed && <p className="notif-empty">{t("notif.loadFailed")}</p>}
          {!failed && items.length === 0 && (
            <p className="notif-empty">{t("notif.empty")}</p>
          )}

          {items.map((item) => {
            const { title, body } = renderNotification(item, t);
            const isNew = !item.read || justReadRef.current.has(item.id);
            return (
              <div
                key={item.id}
                className={`notif-item ${isNew ? "unread" : ""} sev-${item.severity}`}
              >
                <span className="notif-item-title">{title}</span>
                <span className="notif-item-body">{body}</span>
                <span className="notif-time">
                  {relativeTime(item.createdAt, t)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
