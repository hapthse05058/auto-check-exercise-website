export const DOMAIN_BE_DEV = "http://localhost:3000";
export const DOMAIN_BE_PROD =
  "https://backend-checker-159733287448.asia-southeast1.run.app";
export const ENVIRONMENT = "dev";
export const DOMAIN_BE =
  ENVIRONMENT === "PROD" ? DOMAIN_BE_PROD : DOMAIN_BE_DEV;
export const EXTENSION_SECRET_KEY = "SuperSecretKey_hongHa_321";
export const PROJECT_NUMBER = "159733287448";

/**
 * Google OAuth (web flow).
 *
 * IMPORTANT: the extension used a "Chrome extension" OAuth client. For the web
 * app you must create a "Web application" OAuth client in Google Cloud Console
 * (APIs & Services > Credentials) and add this app's origin + redirect URI
 * (e.g. http://localhost:5173/auth/callback) to its authorized lists, then put
 * that client id here. The backend /auth/google endpoint must exchange the
 * code using the same redirect_uri (it is sent in the request body).
 */
export const GOOGLE_CLIENT_ID =
  "159733287448-jtf963s4659vl9oh6480bh125dhc2d5p.apps.googleusercontent.com";
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "openid",
  "email",
  "profile",
];
export const GOOGLE_REDIRECT_PATH = "/auth/callback";

export const SUPPORT_EMAIL = "phamhongha.innerpiece@gmail.com";
