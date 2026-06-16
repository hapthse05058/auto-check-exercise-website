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
});
