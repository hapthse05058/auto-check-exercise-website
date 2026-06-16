import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithUsernamePassword } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { startGoogleLogin } from "../auth/googleOAuth.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export default function LoginPage() {
  const { t } = useLanguage();
  const { isAuthenticated, onLoggedIn, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = useState("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ text: "", color: "black" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/grade", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleUsernamePasswordLogin = async () => {
    if (submitting) return;
    if (!username.trim() || !password.trim()) {
      setStatus({
        text: t("login.needBoth"),
        color: "red",
      });
      return;
    }

    setStatus({ text: t("login.loggingIn"), color: "black" });
    setSubmitting(true);
    try {
      const result = await loginWithUsernamePassword(
        username.trim(),
        password.trim(),
      );
      if (!result.ok) {
        setStatus({ text: result.error, color: "red" });
        return;
      }
      setStatus({ text: t("login.success"), color: "green" });
      onLoggedIn();
      navigate("/grade", { replace: true });
    } catch (error) {
      console.error("Login error:", error);
      setStatus({
        text: t("login.serverError"),
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="login-panel">
        <h4>{t("login.title")}</h4>
        {sessionMessage && <p className="session-message">{sessionMessage}</p>}
        <div className="login-methods">
          <div
            className={`method-tab ${method === "username" ? "active" : ""}`}
            onClick={() => setMethod("username")}
          >
            {t("login.tabUsername")}
          </div>
          <div
            className={`method-tab ${method === "google" ? "active" : ""}`}
            onClick={() => setMethod("google")}
          >
            {t("login.tabGoogle")}
          </div>
        </div>

        {method === "google" ? (
          <div className="login-form">
            <p>{t("login.googleHint")}</p>
            <button className="primary-btn" onClick={startGoogleLogin}>
              {t("login.googleBtn")}
            </button>
          </div>
        ) : (
          <div className="login-form">
            <div className="form-field">
              <label htmlFor="loginUsername">{t("login.username")}</label>
              <input
                id="loginUsername"
                type="text"
                placeholder={t("login.usernamePlaceholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="loginPassword">{t("login.password")}</label>
              <input
                id="loginPassword"
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUsernamePasswordLogin();
                }}
              />
            </div>
            <button
              className="primary-btn"
              onClick={handleUsernamePasswordLogin}
              disabled={submitting}
            >
              {t("login.submit")}
            </button>
            {/* hide function from UI, but keep it in case we want to add it back later */}
            {/* <div className="forgot-password-link">
              <Link to="/forgot-password">Forgot password?</Link>
            </div> */}
          </div>
        )}
        {status.text && (
          <div className="status-line" style={{ color: status.color }}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}
