import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { clearAuthStorage } from "./storage.js";
import {
  AUTH_EXPIRED_EVENT,
  hasStoredSession,
  proactiveTokenRefresh,
} from "./tokens.js";
import { fetchTeacherInfo, logClientEvent } from "../api/backend.js";
import { disablePush } from "../lib/push.js";

const AuthContext = createContext(null);

function getTeacherInfoFromSessionStorage() {
  const raw = sessionStorage.getItem("teacherInfo");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Invalid teacherInfo in sessionStorage", error);
    sessionStorage.removeItem("teacherInfo");
    return null;
  }
}

function setTeacherInfoToSessionStorage(teacherInfo) {
  if (!teacherInfo) return;
  sessionStorage.setItem("teacherInfo", JSON.stringify(teacherInfo));
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(hasStoredSession());
  const [teacherInfo, setTeacherInfo] = useState(
    getTeacherInfoFromSessionStorage(),
  );
  const [sessionMessage, setSessionMessage] = useState("");

  const logout = useCallback(async (message = "") => {
    // Logout produces no request of its own, so the backend audit middleware
    // cannot see it — report it explicitly. This MUST happen before
    // clearAuthStorage(): the call is authenticated with the stored token, and
    // once storage is cleared the backend would answer 401 and the entry would
    // be lost. logClientEvent never throws, so a failure cannot block logout.
    await logClientEvent("auth.logout");
    // Unregister this browser from push BEFORE clearing storage, for the same
    // reason: the DELETE is authenticated with the stored token. Otherwise a
    // shared machine keeps receiving admin alerts after logout. disablePush
    // deletes the FCM token client-side first, so the subscription is really
    // gone and not just the server row. It never throws.
    await disablePush();
    clearAuthStorage();
    setIsAuthenticated(false);
    setTeacherInfo(null);
    setSessionMessage(message);
  }, []);

  // Forced logout when a silent token refresh fails anywhere in the app.
  useEffect(() => {
    const onExpired = (event) => {
      setIsAuthenticated(false);
      setTeacherInfo(null);
      setSessionMessage(event.detail?.message || "Session expired.");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Proactively refresh tokens in the background every 60 s so they never
  // expire mid-session (e.g. during a long grading run). Triggers a real
  // refresh only when >= 75% of the token's lifetime has elapsed.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      proactiveTokenRefresh().catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  /** Marks the session as logged in (tokens are already in storage). */
  const onLoggedIn = useCallback(() => {
    setSessionMessage("");
    setIsAuthenticated(true);
  }, []);

  /**
   * Loads the teacher record (sessionStorage cache first, then backend).
   * Returns null when the account has no teacher record yet.
   */
  const loadTeacherInfo = useCallback(async () => {
    const stored = getTeacherInfoFromSessionStorage();
    if (stored && stored.id) {
      setTeacherInfo(stored);
      return stored;
    }
    const info = await fetchTeacherInfo();
    if (info) {
      setTeacherInfoToSessionStorage(info);
      setTeacherInfo(info);
    }
    return info;
  }, []);

  const refreshTeacherInfo = useCallback(async () => {
    sessionStorage.removeItem("teacherInfo");
    setTeacherInfo(null);
    return loadTeacherInfo();
  }, [loadTeacherInfo]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      teacherInfo,
      sessionMessage,
      onLoggedIn,
      loadTeacherInfo,
      refreshTeacherInfo,
      logout,
    }),
    [
      isAuthenticated,
      teacherInfo,
      sessionMessage,
      onLoggedIn,
      loadTeacherInfo,
      refreshTeacherInfo,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook colocated with its provider by design
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
