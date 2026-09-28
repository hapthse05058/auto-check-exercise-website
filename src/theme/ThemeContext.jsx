import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const ThemeContext = createContext(null);
// Also read by the inline script in index.html, which applies the theme before
// the first paint so a dark-mode user never sees a white flash.
const STORAGE_KEY = "app_theme";
const SUPPORTED = ["light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Light / dark theme. With no saved choice the OS setting is followed (live);
 * once the user toggles, that choice is saved and wins. This provider only
 * knows this browser: syncing the choice with the account (so it follows the
 * teacher to another device) is useSyncedTheme's job.
 */
export function ThemeProvider({ children }) {
  const [stored, setStored] = useState(readStored);
  const [system, setSystem] = useState(systemTheme);
  const theme = stored ?? system;

  useEffect(() => {
    const mql = window.matchMedia?.(DARK_QUERY);
    if (!mql) return undefined;
    const onChange = () => setSystem(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /** Saves an explicit choice in this browser (it then beats the OS). */
  const setTheme = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, isExplicit: stored !== null }),
    [theme, setTheme, stored],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook colocated with its provider by design
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
