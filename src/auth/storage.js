/**
 * localStorage-backed token store. Web replacement for chrome.storage.local.
 *
 * Values are JSON-encoded so numbers (expiry timestamps) survive the
 * round-trip exactly like they did with chrome.storage.local.
 */
const PREFIX = "ace_"; // auto-check-exercise

export const AUTH_KEYS = [
  "access_token",
  "expiry_date",
  "access_token_issued_at",
  "refresh_token",
  "refresh_token_expires_date",
  "google_access_token",
  "google_token_expiry",
  "google_token_issued_at",
];

export function storageGet(keys) {
  const result = {};
  for (const key of keys) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) continue;
    try {
      result[key] = JSON.parse(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

export function storageSet(items) {
  for (const [key, value] of Object.entries(items)) {
    if (value === undefined) continue;
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }
}

export function storageRemove(keys) {
  for (const key of keys) {
    localStorage.removeItem(PREFIX + key);
  }
}

export function clearAuthStorage() {
  storageRemove(AUTH_KEYS);
  sessionStorage.removeItem("teacherInfo");
}
