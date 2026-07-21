import { useEffect, useState } from "react";

/** True when the app is already running as an installed (standalone) PWA. */
function getIsStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** iOS Safari can't install programmatically — detect it for a manual hint. */
function getIsIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Opt-in PWA install. Reads the `beforeinstallprompt` event captured early in
 * main.jsx (`window.__deferredInstallPrompt`) so a late-mounting component never
 * misses it. Never triggers the prompt automatically — `promptInstall` must be
 * called from a user gesture (e.g. the "Install app" menu option).
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState(
    () => window.__deferredInstallPrompt || null,
  );
  const [isStandalone, setIsStandalone] = useState(getIsStandalone);

  useEffect(() => {
    const onInstallable = () =>
      setDeferred(window.__deferredInstallPrompt || null);
    const onBeforeInstall = (event) => {
      event.preventDefault();
      window.__deferredInstallPrompt = event;
      setDeferred(event);
    };
    const onInstalled = () => {
      window.__deferredInstallPrompt = null;
      setDeferred(null);
      setIsStandalone(true);
    };

    window.addEventListener("pwa-installable", onInstallable);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("pwa-installable", onInstallable);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // user dismissed or the browser rejected — nothing else to do
    }
    window.__deferredInstallPrompt = null;
    setDeferred(null);
  };

  return {
    canInstall: Boolean(deferred) && !isStandalone,
    isIOS: getIsIOS() && !isStandalone,
    promptInstall,
  };
}
