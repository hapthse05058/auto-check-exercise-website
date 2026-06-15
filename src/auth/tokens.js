import { DOMAIN_BE, EXTENSION_SECRET_KEY } from "../config.js";
import { clearAuthStorage, storageGet, storageSet } from "./storage.js";

/** Fired on window whenever the session can no longer be refreshed. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

function emitAuthExpired(message) {
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }),
  );
}

/**
 * Returns a backend access token, silently refreshing it when it has less
 * than 5 minutes left. Throws "RE-AUTH_NEEDED" when the session is gone.
 */
export async function ensureValidToken() {
  const result = storageGet(["access_token", "expiry_date"]);

  const now = Date.now();
  // Keep using the token while it has more than 5 minutes left.
  if (
    result.access_token &&
    result.expiry_date &&
    result.expiry_date - now > 300000
  ) {
    return result.access_token;
  }

  // Token expired (or about to): try a silent refresh.
  try {
    return await refreshSilentToken();
  } catch (err) {
    console.warn("Silent refresh failed:", err);
    clearAuthStorage();
    emitAuthExpired("Session expired. Please login to continue.");
    throw new Error("RE-AUTH_NEEDED");
  }
}

async function refreshSilentToken() {
  const result = storageGet(["refresh_token", "refresh_token_expires_date"]);

  if (
    !result.refresh_token ||
    result.refresh_token_expires_date - Date.now() <= 0
  ) {
    throw new Error("No refresh token available. Please login again.");
  }

  const response = await fetch(`${DOMAIN_BE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: result.refresh_token }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = await response.json();
  const now = Date.now();

  storageSet({
    access_token: data.access_token,
    expiry_date: data.expiry_date,
    access_token_issued_at: now,
    refresh_token: data.refresh_token,
    refresh_token_expires_date: data.refresh_token_expires_date,
    // Refresh the Google Docs token too (present for username/password login).
    ...(data.google_access_token
      ? {
          google_access_token: data.google_access_token,
          google_token_expiry: now + 3600 * 1000,
          google_token_issued_at: now,
        }
      : {}),
  });

  return data.access_token;
}

async function refreshGoogleToken() {
  const backendToken = await ensureValidToken();
  const response = await fetch(`${DOMAIN_BE}/auth/google-token`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${backendToken}`,
      "x-api-key": EXTENSION_SECRET_KEY,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google access token for Docs API");
  }

  const data = await response.json();
  const now = Date.now();
  storageSet({
    google_access_token: data.google_access_token,
    google_token_expiry: now + (data.expires_in || 3600) * 1000,
    google_token_issued_at: now,
  });
  return data.google_access_token;
}

/**
 * Returns a token valid for the Google Docs API (docs.googleapis.com).
 *
 * - Google OAuth login: no separate Google token is stored, so the backend
 *   `access_token` IS a real Google token — fall back to ensureValidToken().
 * - Username/password login: a `google_access_token` (service account) is
 *   stored separately. Use it while valid; re-mint via /auth/google-token when
 *   it expires. The JWT `access_token` must NOT be sent to Google (it 401s).
 */
export async function ensureValidGoogleToken() {
  const result = storageGet(["google_access_token", "google_token_expiry"]);

  // No separate Google token => Google-login user; access_token works for Docs.
  if (!result.google_access_token) {
    return await ensureValidToken();
  }

  const now = Date.now();
  // Reuse while it has more than 2 minutes left.
  if (result.google_token_expiry && result.google_token_expiry - now > 120000) {
    return result.google_access_token;
  }

  // Expired/near expiry: mint a fresh one from the backend using our JWT.
  return await refreshGoogleToken();
}

/**
 * Proactively refreshes tokens that have consumed >= 75% of their lifetime.
 * Intended to be called on a background interval so tokens never expire
 * mid-session (e.g. during a long grading run).
 */
export async function proactiveTokenRefresh() {
  const result = storageGet([
    "access_token",
    "expiry_date",
    "access_token_issued_at",
    "google_access_token",
    "google_token_expiry",
    "google_token_issued_at",
  ]);

  const now = Date.now();
  const needs75Refresh = (issuedAt, expiryDate) => {
    if (!issuedAt || !expiryDate) return false;
    const total = expiryDate - issuedAt;
    return total > 0 && (now - issuedAt) / total >= 0.75;
  };

  if (
    result.access_token &&
    needs75Refresh(result.access_token_issued_at, result.expiry_date)
  ) {
    try {
      await refreshSilentToken();
    } catch (err) {
      console.warn("Proactive backend token refresh failed:", err);
    }
  }

  if (
    result.google_access_token &&
    needs75Refresh(result.google_token_issued_at, result.google_token_expiry)
  ) {
    try {
      await refreshGoogleToken();
    } catch (err) {
      console.warn("Proactive Google token refresh failed:", err);
    }
  }
}

/**
 * True when the current session uses the service-account Google token
 * (username/password login). In that case the Docs API must NOT receive the
 * `x-goog-user-project` header — the service account lacks serviceusage on
 * that project, which causes a 403 on writes. Gmail-login tokens keep it.
 */
export function isServiceAccountGoogleToken() {
  const result = storageGet(["google_access_token"]);
  return !!result.google_access_token;
}

export function hasStoredSession() {
  const result = storageGet(["access_token"]);
  return !!result.access_token;
}
