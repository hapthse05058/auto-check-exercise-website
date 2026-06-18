import { defineConfig } from "@playwright/test";

// E2E for the admin billing panel. The Vite dev server is started/reused by
// Playwright on a fixed port; the BACKEND must already be running on :3000 and
// an admin JWT supplied via ADMIN_TOKEN (see tests/e2e/billing.spec.mjs).
const PORT = 4319;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
