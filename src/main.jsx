import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import "./styles/global.css";
import "./styles/students.css";

// Capture the PWA install event as early as possible — it can fire before React
// mounts. We suppress the browser's auto-prompt and stash the event so the
// opt-in "Install app" button (see usePwaInstall) can trigger it on demand.
window.__deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__deferredInstallPrompt = event;
  window.dispatchEvent(new Event("pwa-installable"));
});
window.addEventListener("appinstalled", () => {
  window.__deferredInstallPrompt = null;
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
