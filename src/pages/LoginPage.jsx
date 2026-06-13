import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithUsernamePassword } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { startGoogleLogin } from "../auth/googleOAuth.js";

export default function LoginPage() {
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
        text: "Please enter both username and password.",
        color: "red",
      });
      return;
    }

    setStatus({ text: "Logging in...", color: "black" });
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
      setStatus({ text: "Login successful. Loading...", color: "green" });
      onLoggedIn();
      navigate("/grade", { replace: true });
    } catch (error) {
      console.error("Login error:", error);
      setStatus({
        text: "Error connecting to server. Please try again.",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="login-panel">
        <h4>Login</h4>
        {sessionMessage && <p className="session-message">{sessionMessage}</p>}
        <div className="login-methods">
          <div
            className={`method-tab ${method === "username" ? "active" : ""}`}
            onClick={() => setMethod("username")}
          >
            Username/Password
          </div>
          <div
            className={`method-tab ${method === "google" ? "active" : ""}`}
            onClick={() => setMethod("google")}
          >
            Google Login
          </div>
        </div>

        {method === "google" ? (
          <div className="login-form">
            <p>Continue with your Google account to grade exercises.</p>
            <button className="primary-btn" onClick={startGoogleLogin}>
              Login by Gmail
            </button>
          </div>
        ) : (
          <div className="login-form">
            <div className="form-field">
              <label htmlFor="loginUsername">Username</label>
              <input
                id="loginUsername"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="loginPassword">Password</label>
              <input
                id="loginPassword"
                type="password"
                placeholder="Enter your password"
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
              Login
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
