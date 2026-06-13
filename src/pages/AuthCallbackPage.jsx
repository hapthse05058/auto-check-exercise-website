import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginWithGoogleCode } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { getGoogleRedirectUri } from "../auth/googleOAuth.js";

/**
 * Google redirects here with ?code=... after the consent screen.
 * Web replacement for the chrome.identity.launchWebAuthFlow callback.
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { onLoggedIn } = useAuth();
  const [error, setError] = useState("");
  const exchanged = useRef(false); // an OAuth code is single-use — never send twice

  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setError(`Google login was cancelled or failed (${oauthError}).`);
      return;
    }
    if (!code) {
      setError("Missing authorization code in the callback URL.");
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
        setError(err.message || "Google login failed.");
      });
  }, [searchParams, navigate, onLoggedIn]);

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>Signing you in with Google…</h4>
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <Link to="/login" className="primary-btn login-link">
              Back to login
            </Link>
          </>
        ) : (
          <p>Please wait while we complete your login.</p>
        )}
      </div>
    </div>
  );
}
