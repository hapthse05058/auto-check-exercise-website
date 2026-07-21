import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { loginWithGoogleCode } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { getGoogleRedirectUri } from "../auth/googleOAuth.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

/**
 * Google redirects here with ?code=... after the consent screen.
 * Web replacement for the chrome.identity.launchWebAuthFlow callback.
 */
export default function AuthCallbackPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { onLoggedIn } = useAuth();
  const [error, setError] = useState("");
  const exchanged = useRef(false); // an OAuth code is single-use — never send twice

  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setError(t("authCallback.cancelled", { err: oauthError }));
      return;
    }
    if (!code) {
      setError(t("authCallback.missingCode"));
      return;
    }
    if (exchanged.current) return;
    exchanged.current = true;

    loginWithGoogleCode(code, getGoogleRedirectUri())
      .then(() => {
        onLoggedIn();
        navigate("/grade", { replace: true });
      })
      .catch((err) => {
        console.error("Google login error:", err);
        setError(err.message || t("authCallback.failed"));
      });
  }, [searchParams, navigate, onLoggedIn, t]);

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>{t("authCallback.title")}</h4>
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <Link to="/login" className="primary-btn login-link">
              {t("authCallback.backToLogin")}
            </Link>
          </>
        ) : (
          <p>{t("authCallback.wait")}</p>
        )}
      </div>
    </div>
  );
}
