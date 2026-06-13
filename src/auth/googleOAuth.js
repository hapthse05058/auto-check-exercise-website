import {
  GOOGLE_CLIENT_ID,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_REDIRECT_PATH,
} from "../config.js";

export function getGoogleRedirectUri() {
  return window.location.origin + GOOGLE_REDIRECT_PATH;
}

/**
 * Web replacement for chrome.identity.launchWebAuthFlow: redirects the
 * browser to Google's consent screen. Google then redirects back to
 * /auth/callback with `?code=...`, which AuthCallbackPage exchanges via the
 * backend.
 */
export function startGoogleLogin() {
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(getGoogleRedirectUri())}&` +
    `scope=${encodeURIComponent(GOOGLE_OAUTH_SCOPES.join(" "))}&` +
    `prompt=consent&` +
    `access_type=offline&` + // required to receive a refresh token
    `include_granted_scopes=true`;

  window.location.assign(authUrl);
}
