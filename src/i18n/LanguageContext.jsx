import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { translations } from "./translations.js";

const LanguageContext = createContext(null);
const STORAGE_KEY = "app_lang";
const DEFAULT_LANG = "vi";
const SUPPORTED = ["vi", "en"];

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Resolves a dotted key path against a nested object. */
function resolve(obj, key) {
  return key
    .split(".")
    .reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStored);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      let str = resolve(translations[lang], key);
      if (str === null || str === undefined)
        str = resolve(translations.en, key); // fallback to English
      if (str === null || str === undefined) return key; // last resort: show the key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.split(`{${k}}`).join(String(v));
        }
      }
      return str;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook colocated with its provider by design
export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
