import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPassword } from "../api/backend.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState({ text: "", color: "black" });
  const [submitting, setSubmitting] = useState(false);

  // This screen is only meaningful after a successful forgot-password step
  // (which stores reset_token). Reached directly, send the user back to start.
  useEffect(() => {
    if (!sessionStorage.getItem("reset_token")) {
      navigate("/forgot-password", { replace: true });
    }
  }, [navigate]);

  const clearTokenAndGoToLogin = () => {
    sessionStorage.removeItem("reset_token");
    sessionStorage.removeItem("reset_token_expires_in");
    navigate("/login");
  };

  const handleResetPassword = async () => {
    if (submitting) return;
    const password = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (!password || !confirm) {
      setStatus({
        text: "Please enter and confirm your new password.",
        color: "red",
      });
      return;
    }

    if (password.length < 6) {
      setStatus({
        text: "Password must be at least 6 characters long.",
        color: "red",
      });
      return;
    }

    if (password !== confirm) {
      setStatus({
        text: "Passwords do not match. Please try again.",
        color: "red",
      });
      return;
    }

    setStatus({ text: "Resetting password...", color: "black" });
    setSubmitting(true);

    try {
      const resetToken = sessionStorage.getItem("reset_token");
      if (!resetToken) {
        setStatus({
          text: "Reset token not found. Please start over.",
          color: "red",
        });
        return;
      }

      await resetPassword(resetToken, password);

      setStatus({
        text: "Password reset successfully! Redirecting to login...",
        color: "green",
      });

      sessionStorage.removeItem("reset_token");
      sessionStorage.removeItem("reset_token_expires_in");

      await sleep(2000);
      navigate("/login");
    } catch (error) {
      console.error("Reset password error:", error);
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
        <h4>Create New Password</h4>
        <p>Enter your new password below</p>
        <div className="form-field">
          <label htmlFor="newPasswordInput">New Password</label>
          <input
            id="newPasswordInput"
            type="password"
            placeholder="Enter new password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleResetPassword();
            }}
          />
        </div>
        <div className="form-field">
          <label htmlFor="confirmPasswordInput">Confirm Password</label>
          <input
            id="confirmPasswordInput"
            type="password"
            placeholder="Confirm your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleResetPassword();
            }}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={clearTokenAndGoToLogin}>
            Cancel
          </button>
          <button
            className="primary-btn"
            onClick={handleResetPassword}
            disabled={submitting}
          >
            Reset Password
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
