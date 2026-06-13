import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchTeacherInfo } from "../api/backend.js";
import { clearAuthStorage } from "./storage.js";
import { AUTH_EXPIRED_EVENT, hasStoredSession } from "./tokens.js";

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

  const logout = useCallback((message = "") => {
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
