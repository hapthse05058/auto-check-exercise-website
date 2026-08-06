export const DOMAIN_BE_DEV = "http://localhost:3000";
export const DOMAIN_BE_PROD = import.meta.env.VITE_DOMAIN_BE_PROD;
export const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT ?? "DEV";
// export const ENVIRONMENT = "DEV";
export const DOMAIN_BE =
  ENVIRONMENT === "PROD" ? DOMAIN_BE_PROD : DOMAIN_BE_DEV;
export const EXTENSION_SECRET_KEY = "SuperSecretKey_321__hongHa";
export const PROJECT_NUMBER = "159733287448";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "openid",
  "email",
  "profile",
];
export const GOOGLE_REDIRECT_PATH = "/auth/callback";

export const SUPPORT_EMAIL = "phamhongha.innerpiece@gmail.com";

// Admin allow-list for the gradingCache management screen. Comma-separated env
// override, defaults to the support email. The backend enforces this too.
export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || SUPPORT_EMAIL)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const isAdminEmail = (email) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());
