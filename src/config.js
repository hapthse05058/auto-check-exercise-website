export const DOMAIN_BE_DEV = "http://localhost:3000";
export const DOMAIN_BE_PROD = import.meta.env.VITE_DOMAIN_BE_PROD;
export const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT ?? "DEV";
export const DOMAIN_BE =
  ENVIRONMENT === "PROD" ? DOMAIN_BE_PROD : DOMAIN_BE_DEV;
export const EXTENSION_SECRET_KEY = import.meta.env.VITE_EXTENSION_SECRET_KEY;
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
