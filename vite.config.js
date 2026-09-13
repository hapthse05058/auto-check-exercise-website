import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["check-exercise.png"],
      // Uncomment to exercise the SW/install flow under `npm run dev`
      // (leave OFF normally — a dev SW can cache-interfere with live-reload):
      devOptions: { enabled: true },
      // The FCM background-message worker (public/firebase-messaging-sw.js) has
      // its OWN registration at /fcm-push-scope/ — see src/lib/push.js. Workbox
      // must not precache it, or the Workbox SW would serve a stale cached copy
      // of a file the browser is meant to re-fetch on every update check.
      workbox: {
        globIgnores: ["**/firebase-messaging-sw.js"],
      },
      manifest: {
        name: "AI Exercise Checker",
        short_name: "Checker",
        description: "Chấm bài tập tự động",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#00977b",
        // Declare 192 + 512 (even pointing at the same 700x700 file) so Chrome
        // considers the app installable and fires `beforeinstallprompt`.
        icons: [
          {
            src: "/check-exercise.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/check-exercise.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/check-exercise.png",
            sizes: "700x700",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  server: {
    port: 4200,
  },
  build: {
    // Sinh source maps cho production build để có thể debug
    // (map code đã minify về source gốc) ngay trên website đã deploy.
    sourcemap: true,
  },
  test: {
    // Unit tests only (*.test.js). Playwright E2E lives in tests/e2e/*.spec.mjs
    // and is run by the Playwright runner, not vitest.
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
