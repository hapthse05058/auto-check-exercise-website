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

// ---------------------------------------------------------------------------
// Firebase Cloud Messaging (admin push notifications)
//
// These are the standard Firebase WEB config values — public by design, shipped
// to every browser by any Firebase web app. VITE_* vars are inlined at build
// time, so adding them on Vercel requires a redeploy.
//
// The SAME values are hard-coded in public/firebase-messaging-sw.js: a classic
// service worker is not processed by Vite and cannot read import.meta.env.
// Keep the two in sync.
//
// messagingSenderId is the GCP project number, already known above.
// ---------------------------------------------------------------------------
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || PROJECT_NUMBER,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Web Push certificate key pair (Firebase console -> Cloud Messaging). */
export const FIREBASE_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Whether push CAN be offered at all. Until the Firebase console values are
 * filled in, the notification bell still works (it polls the backend) — only
 * the "enable push" affordance is hidden, instead of failing at click time.
 */
export const IS_PUSH_CONFIGURED = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.appId && FIREBASE_VAPID_KEY,
);
