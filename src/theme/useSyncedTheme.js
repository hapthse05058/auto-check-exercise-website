import { useCallback, useEffect, useRef } from "react";

import { useTheme } from "./ThemeContext.jsx";
import { saveTeacherPreferences } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";

/**
 * The theme, kept in step with the signed-in teacher's account
 * (teachers/{id}.preferences.theme) so it follows them to any device:
 *
 * - the account's saved theme wins whenever the teacher record loads;
 * - an account with none yet adopts this browser's explicit choice, once;
 * - toggling saves to the account (and to this browser, for first paint).
 *
 * Signed out, it is the plain local theme. Use it in ONE place (the header
 * toggle), since the sync effect should not run twice.
 */
export function useSyncedTheme() {
  const { theme, setTheme, isExplicit } = useTheme();
  const { isAuthenticated, teacherInfo, updateTeacherInfo } = useAuth();
  const accountTheme = teacherInfo?.preferences?.theme;
  const adoptedFor = useRef(null);

  const saveToAccount = useCallback(
    (next) => {
      updateTeacherInfo({
        preferences: { ...teacherInfo?.preferences, theme: next },
      });
      saveTeacherPreferences({ theme: next }).catch((error) =>
        console.warn("Could not save the theme to the account:", error),
      );
    },
    [teacherInfo, updateTeacherInfo],
  );

  useEffect(() => {
    if (!isAuthenticated || !teacherInfo?.id) return;
    if (accountTheme) {
      if (accountTheme !== theme) setTheme(accountTheme);
      return;
    }
    if (isExplicit && adoptedFor.current !== teacherInfo.id) {
      adoptedFor.current = teacherInfo.id;
      saveToAccount(theme);
    }
    // Only an account change should drive this; `theme` changes locally on
    // every toggle and is saved by toggleTheme itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, teacherInfo?.id, accountTheme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (isAuthenticated && teacherInfo?.id) saveToAccount(next);
  }, [theme, setTheme, isAuthenticated, teacherInfo?.id, saveToAccount]);

  return { theme, toggleTheme };
}
