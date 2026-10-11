/**
 * How a notification is shown — shared by the header bell (its dropdown and
 * toasts) and the notifications page.
 */
import { formatVnd } from "./billing.js";

/** Fired on window when read state changed elsewhere (the notifications
 *  page), so the bell re-reads its badge instead of waiting for its poll. */
export const NOTIFICATIONS_CHANGED = "ace:notifications-changed";

/** A read notification stays in the bell's dropdown for this long; older
 *  ones only live on the notifications page (until the backend's TTL). */
export const BELL_RECENT_MS = 24 * 3600 * 1000;

/** What the bell's dropdown lists: every unread item, plus recent read ones. */
export function isShownInBell(item, now = Date.now()) {
  if (!item.read) return true;
  const created = Date.parse(item.createdAt);
  return Number.isFinite(created) && now - created < BELL_RECENT_MS;
}

/** "deepseek.lowBalance" -> "deepseekLowBalance" (the i18n key segment). */
function typeKey(type) {
  return String(type || "")
    .split(".")
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");
}

export function relativeTime(iso, t) {
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
export function renderNotification(item, t) {
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
  // Money fields (`…Vnd`) read as "1.600đ".
  const money = Object.fromEntries(
    Object.entries(item.data || {})
      .filter(([k, v]) => k.endsWith("Vnd") && Number.isFinite(v))
      .map(([k, v]) => [k, formatVnd(v)]),
  );
  const vars = {
    ...(item.data || {}),
    ...money,
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

/** Only in-app paths are followed ("/grade?classId=…"), never a full URL. */
export function pathOf(item) {
  const path = item.data?.path;
  return typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//")
    ? path
    : null;
}
