import {
  GOOGLE_CLIENT_ID,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_REDIRECT_PATH,
} from "../config.js";

/** OAuth `state` marking a login that already went through consent. */
export const CONSENT_STATE = "consent";

export function getGoogleRedirectUri() {
  return window.location.origin + GOOGLE_REDIRECT_PATH;
}

/**
 * Web replacement for chrome.identity.launchWebAuthFlow: redirects the
 * browser to Google's sign-in. Google then redirects back to /auth/callback
 * with `?code=...`, which AuthCallbackPage exchanges via the backend.
 *
 * Only the account chooser by default: the consent screen is where Google
 * shows "Google hasn't verified this app", so a returning user skips it and
 * the backend reuses the refresh token stored at their first login. When it
 * has none it answers `needs_consent`, and the callback comes back here with
 * `forceConsent` — consent is what makes Google issue a refresh token — and
 * `loginHint`, the account already picked, so it is not asked for again.
 */
export function startGoogleLogin({
  forceConsent = false,
  loginHint = "",
} = {}) {
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(getGoogleRedirectUri())}&` +
    `scope=${encodeURIComponent(GOOGLE_OAUTH_SCOPES.join(" "))}&` +
    `prompt=${forceConsent ? "consent" : "select_account"}&` +
    (forceConsent ? `state=${CONSENT_STATE}&` : "") +
    // The account just picked: Google goes straight to it, no second chooser.
    (loginHint ? `login_hint=${encodeURIComponent(loginHint)}&` : "") +
    `access_type=offline&` + // required to receive a refresh token
    `include_granted_scopes=true`;

  window.location.assign(authUrl);
}
