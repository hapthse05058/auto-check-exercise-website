import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { resetPassword } from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState({
    text: "",
    color: "var(--color-text-primary)",
  });
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
        text: t("reset.needBoth"),
        color: "var(--color-error)",
      });
      return;
    }

    if (password.length < 6) {
      setStatus({
        text: t("reset.min"),
        color: "var(--color-error)",
      });
      return;
    }

    if (password !== confirm) {
      setStatus({
        text: t("reset.mismatch"),
        color: "var(--color-error)",
      });
      return;
    }

    setStatus({
      text: t("reset.resetting"),
      color: "var(--color-text-primary)",
    });
    setSubmitting(true);

    try {
      const resetToken = sessionStorage.getItem("reset_token");
      if (!resetToken) {
        setStatus({
          text: t("reset.noToken"),
          color: "var(--color-error)",
        });
        return;
      }

      await resetPassword(resetToken, password);

      setStatus({
        text: t("reset.success"),
        color: "var(--color-success)",
      });

      sessionStorage.removeItem("reset_token");
      sessionStorage.removeItem("reset_token_expires_in");

      await sleep(2000);
      navigate("/login");
    } catch (error) {
      console.error("Reset password error:", error);
      setStatus({
        text: error.message || t("reset.serverError"),
        color: "var(--color-error)",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>{t("reset.title")}</h4>
        <p>{t("reset.intro")}</p>
        <div className="form-field">
          <label htmlFor="newPasswordInput">{t("reset.newPassword")}</label>
          <input
            id="newPasswordInput"
            type="password"
            placeholder={t("reset.newPasswordPlaceholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleResetPassword();
            }}
          />
        </div>
        <div className="form-field">
          <label htmlFor="confirmPasswordInput">{t("reset.confirm")}</label>
          <input
            id="confirmPasswordInput"
            type="password"
            placeholder={t("reset.confirmPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleResetPassword();
            }}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={clearTokenAndGoToLogin}>
            {t("common.cancel")}
          </button>
          <button
            className="primary-btn"
            onClick={handleResetPassword}
            disabled={submitting}
          >
            {t("reset.submit")}
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
