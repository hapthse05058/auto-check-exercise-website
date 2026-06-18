import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
