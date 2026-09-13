/* eslint-disable no-undef */
/**
 * FCM background-message service worker.
 *
 * ---------------------------------------------------------------------------
 * SCOPE: this worker is registered at "/fcm-push-scope/" by src/lib/push.js,
 * NOT at "/". The vite-plugin-pwa (Workbox) service worker owns "/" and is what
 * makes the app installable and offline-capable; registering this one at "/"
 * would replace it. Do not change that scope without reading the comment in
 * src/lib/push.js.
 *
 * CONFIG DUPLICATION: this file is served straight from public/ and is NOT
 * processed by Vite, so `import.meta.env` is unavailable and the Firebase web
 * config has to be literal. These are the same values as VITE_FIREBASE_* in
 * .env and FIREBASE_CONFIG in src/config.js — KEEP THE TWO IN SYNC.
 *
 * They are safe to commit: the Firebase web config is public by design and is
 * shipped to every browser by any Firebase web app. The VAPID key is not needed
 * here (only the page calls getToken).
 * ---------------------------------------------------------------------------
 */
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js",
);

// TODO(Phase 0): fill these in from Firebase console -> Project settings ->
// General -> Your apps -> Web. messagingSenderId is the GCP project number.
firebase.initializeApp({
  apiKey: "AIzaSyDVZtduUf2bugeAl9GHnXzklHLIkwG3v34",
  authDomain: "ai-exercise-checker.firebaseapp.com",
  projectId: "ai-exercise-checker",
  storageBucket: "ai-exercise-checker.firebasestorage.app",
  messagingSenderId: "159733287448",
  appId: "1:159733287448:web:3dc5ac99765b4077af916d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Thông báo";
  self.registration.showNotification(title, {
    body: payload.notification?.body || "",
    icon: "/check-exercise.png",
    badge: "/check-exercise.png",
    tag: payload.data?.type || "ace-notification",
    data: {
      // fcmOptions.link is set backend-side (PUBLIC_WEB_URL); fall back to root.
      link: payload.fcmOptions?.link || payload.data?.link || "/",
      notificationId: payload.data?.notificationId || "",
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an already-open tab rather than piling up new ones.
        for (const client of windowClients) {
          if ("focus" in client) return client.focus();
        }
        return clients.openWindow(link);
      }),
  );
});
