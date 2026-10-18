import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { requestPasswordReset } from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState({
    text: "",
    color: "var(--color-text-primary)",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleForgotPassword = async () => {
    if (submitting) return;
    const trimmed = identifier.trim();
    if (!trimmed) {
      setStatus({
        text: t("forgot.needIdentifier"),
        color: "var(--color-error)",
      });
      return;
    }

    setStatus({
      text: t("forgot.sending"),
      color: "var(--color-text-primary)",
    });
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
          text: t("forgot.sent"),
          color: "var(--color-success)",
        });
        await sleep(1000);
        navigate("/reset-password");
      } else {
        setStatus({
          text: data.message || t("forgot.processed"),
          color: "var(--color-success)",
        });
        await sleep(2000);
        navigate("/login");
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      setStatus({
        text: error.message || t("forgot.serverError"),
        color: "var(--color-error)",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <h4>{t("forgot.title")}</h4>
        <p>{t("forgot.intro")}</p>
        <div className="form-field">
          <label htmlFor="resetIdentifier">{t("forgot.identifier")}</label>
          <input
            id="resetIdentifier"
            type="text"
            placeholder={t("forgot.identifierPlaceholder")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleForgotPassword();
            }}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/login")}>
            {t("common.cancel")}
          </button>
          <button
            className="primary-btn"
            onClick={handleForgotPassword}
            disabled={submitting}
          >
            {t("forgot.send")}
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
