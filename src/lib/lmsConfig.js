import { useEffect, useState } from "react";

import { fetchLmsConfig } from "../api/backend.js";

/**
 * Whether the SEC LMS screens are on for the signed-in teacher (backend
 * /lms/config: an allow-list while it is piloted). Fetched once per page
 * load and shared by the menu and the LMS pages.
 */
let configPromise = null;

export function loadLmsConfig({ refresh = false } = {}) {
  if (!configPromise || refresh) {
    configPromise = fetchLmsConfig().catch(() => ({
      enabled: false,
      writeEnabled: false,
    }));
  }
  return configPromise;
}

/** {enabled, writeEnabled, unitPriceVnd} or null while loading. */
export function useLmsConfig(active = true) {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    loadLmsConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return config;
}
