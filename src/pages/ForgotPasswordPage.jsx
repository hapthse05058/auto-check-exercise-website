import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestPasswordReset } from "../api/backend.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState({ text: "", color: "black" });
  const [submitting, setSubmitting] = useState(false);

  const handleForgotPassword = async () => {
    if (submitting) return;
    const trimmed = identifier.trim();
    if (!trimmed) {
      setStatus({ text: "Please enter your username or email.", color: "red" });
      return;
    }

    setStatus({ text: "Sending reset link...", color: "black" });
    setSubmitting(true);

    try {
      const data = await requestPasswordReset(trimmed);

      // Keep the reset token for the next step.
      if (data.reset_token) {
        sessionStorage.setItem("reset_token", data.reset_token);
        sessionStorage.setItem(
          "reset_token_expires_in",
          data.reset_token_expires_in,
        );

        setStatus({
          text: "Reset link sent! Proceed to set your new password.",
          color: "green",
        });
        await sleep(1000);
        navigate("/reset-password");
      } else {
        setStatus({
          text: data.message || "Reset request processed.",
          color: "green",
        });
        await sleep(2000);
        navigate("/login");
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      setStatus({
        text: error.message || "Error connecting to server. Please try again.",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>Reset Password</h4>
        <p>Enter your username or email to receive a password reset link</p>
        <div className="form-field">
          <label htmlFor="resetIdentifier">Username or Email</label>
          <input
            id="resetIdentifier"
            type="text"
            placeholder="Enter username or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleForgotPassword();
            }}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/login")}>
            Cancel
          </button>
          <button
            className="primary-btn"
            onClick={handleForgotPassword}
            disabled={submitting}
          >
            Send Reset Email
          </button>
        </div>
        {status.text && (
          <div className="status-line" style={{ color: status.color }}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}
