/**
 * FCM web push for the admin notification bell.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SERVICE WORKER IS REGISTERED AT A NARROW SCOPE
 *
 * vite-plugin-pwa runs in `generateSW` mode and its Workbox service worker owns
 * scope "/" — that is what makes the app installable and work offline.
 * Registering /firebase-messaging-sw.js the usual way would ALSO claim "/" and
 * REPLACE the Workbox registration, silently breaking install + offline for
 * every teacher just to add a bell for one admin.
 *
 * So we register it at "/fcm-push-scope/" instead. The script lives at the root,
 * so its maximum allowed scope is "/", and any narrower scope is always
 * permitted — no `Service-Worker-Allowed` response header needed (which matters,
 * because vercel.json has no headers block). Push events are delivered to the
 * registration that owns the scope, so background messages still arrive.
 *
 * The registration is then passed explicitly to getToken(), otherwise the SDK
 * would self-register at "/" and reintroduce the collision.
 * ---------------------------------------------------------------------------
 *
 * Everything here degrades quietly: with no Firebase console values configured
 * (IS_PUSH_CONFIGURED === false) the bell still works — it polls the backend —
 * and only the "enable push" affordance is hidden.
 */
import { registerPushDevice, unregisterPushDevice } from "../api/backend.js";
import { storageGet, storageRemove, storageSet } from "../auth/storage.js";
import {
  FIREBASE_CONFIG,
  FIREBASE_VAPID_KEY,
  IS_PUSH_CONFIGURED,
} from "../config.js";

const SW_URL = "/firebase-messaging-sw.js";
const SW_SCOPE = "/fcm-push-scope/";

/** Window event the bell listens for when a push lands with the tab focused. */
export const PUSH_EVENT = "ace:notification";

/** localStorage keys (the `ace_` prefix is added by storage.js). */
const TOKEN_HASH_KEY = "fcm_token_hash";
const LAST_REGISTERED_KEY = "fcm_last_registered";

/** Re-assert the token at most once a day; it is an idempotent merge. */
const REASSERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

let firebaseApp = null;
let messagingInstance = null;
let foregroundListenerStarted = false;

/** True when this browser can do web push at all. */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** "granted" | "denied" | "default" | "unsupported" */
export function getPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** True once this browser has registered a token with the backend. */
export function hasRegisteredDevice() {
  return Boolean(storageGet([TOKEN_HASH_KEY])[TOKEN_HASH_KEY]);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * The Firebase SDK is imported dynamically so the ~150 KB of it is only ever
 * downloaded for the admin who turns push on — never for a regular teacher.
 */
async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, isSupported } = await import("firebase/messaging");

  if (!(await isSupported())) return null;

  firebaseApp =
    getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}

/**
 * Waits for a registration to reach "activated".
 *
 * `navigator.serviceWorker.ready` is NOT usable here: it resolves for the
 * registration that CONTROLS the page, which is the Workbox one at "/", not
 * ours at "/fcm-push-scope/". getToken on a non-activated worker fails.
 */
function waitForActivation(registration) {
  if (registration.active) return Promise.resolve(registration);
  const worker = registration.installing || registration.waiting;
  if (!worker) return Promise.resolve(registration);

  return new Promise((resolve) => {
    const onChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onChange);
        resolve(registration);
      }
    };
    worker.addEventListener("statechange", onChange);
    // Never hang the opt-in click on a worker that stalls.
    setTimeout(() => resolve(registration), 10000);
  });
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register(SW_URL, {
    scope: SW_SCOPE,
  });
  return waitForActivation(registration);
}

/**
 * Full opt-in. MUST be called from a user gesture: Chrome permanently blocks the
 * origin if the permission prompt is dismissed, so it is never auto-triggered.
 *
 * Returns { ok, reason } rather than throwing, so the caller can show the right
 * message for each outcome.
 */
export async function enablePush() {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!IS_PUSH_CONFIGURED) return { ok: false, reason: "not_configured" };
  // iOS only delivers web push to a PWA added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone())
    return { ok: false, reason: "ios_needs_install" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: permission === "denied" ? "denied" : "dismissed",
    };
  }

  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: "unsupported" };

    const registration = await registerServiceWorker();
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: "no_token" };

    const tokenHash = await registerPushDevice({ token, platform: "web" });
    if (!tokenHash) return { ok: false, reason: "register_failed" };

    storageSet({
      [TOKEN_HASH_KEY]: tokenHash,
      [LAST_REGISTERED_KEY]: Date.now(),
    });
    startForegroundPushListener();
    return { ok: true, reason: "granted" };
  } catch (err) {
    return { ok: false, reason: "error", message: err?.message || String(err) };
  }
}

/**
 * Opt out.
 *
 * deleteToken() runs BEFORE the backend DELETE, and that order matters: removing
 * only the server row would leave the browser's push subscription alive, so
 * getToken() would hand back the very same token next time and this device would
 * still be a valid push target as far as FCM is concerned.
 *
 * Used both by the "turn off" button and by logout, so neither path can skip it.
 */
export async function disablePush() {
  const { [TOKEN_HASH_KEY]: tokenHash } = storageGet([TOKEN_HASH_KEY]);

  try {
    const messaging = await getMessagingInstance();
    if (messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging);
    }
  } catch {
    // The token may already be gone (cleared site data, rotated). Either way we
    // still have to clean up the server side below.
  }

  if (tokenHash) await unregisterPushDevice(tokenHash);
  storageRemove([TOKEN_HASH_KEY, LAST_REGISTERED_KEY]);
}

/**
 * Silently re-asserts the token on app start. FCM tokens rotate, and saveDevice
 * is an idempotent merge, so this is cheap — but still rate-limited to once a
 * day. No-op unless this browser has already opted in.
 */
export async function refreshPushToken() {
  if (!isPushSupported() || !IS_PUSH_CONFIGURED) return;
  if (Notification.permission !== "granted") return;
  if (!hasRegisteredDevice()) return;

  const { [LAST_REGISTERED_KEY]: last } = storageGet([LAST_REGISTERED_KEY]);
  if (last && Date.now() - last < REASSERT_INTERVAL_MS) return;

  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return;
    const registration = await registerServiceWorker();
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;
    const tokenHash = await registerPushDevice({ token, platform: "web" });
    if (tokenHash) {
      storageSet({
        [TOKEN_HASH_KEY]: tokenHash,
        [LAST_REGISTERED_KEY]: Date.now(),
      });
    }
  } catch {
    // A failed refresh is harmless: the existing token keeps working until it
    // is actually revoked, at which point the backend prunes it.
  }
}

/**
 * A push that arrives while the tab is focused is NOT shown by the service
 * worker — FCM hands it to the page instead. Turn it into a window event so the
 * bell can refresh immediately rather than waiting for its next poll.
 */
export async function startForegroundPushListener() {
  if (foregroundListenerStarted) return;
  if (!isPushSupported() || !IS_PUSH_CONFIGURED) return;
  if (Notification.permission !== "granted") return;

  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return;
    const { onMessage } = await import("firebase/messaging");
    onMessage(messaging, (payload) => {
      window.dispatchEvent(new CustomEvent(PUSH_EVENT, { detail: payload }));
    });
    foregroundListenerStarted = true;
  } catch {
    // Foreground delivery is a nicety; the 60s poll still picks the alert up.
  }
}
