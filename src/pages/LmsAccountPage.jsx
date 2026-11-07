import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchLmsAccount,
  linkLmsAccount,
  unlinkLmsAccount,
} from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { lmsErrorText } from "../lib/lmsText.js";
import "../styles/lms.css";

/**
 * ☰ → Cài đặt → Kết nối LMS: the teacher's SEC LMS login, checked against the
 * LMS once and then stored encrypted by the backend (lib/lms/lmsAccounts.js).
 * The password never comes back to the browser.
 */
export default function LmsAccountPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // { phase: "idle" | "done" | "error", text }
  const [status, setStatus] = useState({ phase: "idle", text: "" });

  useEffect(() => {
    let cancelled = false;
    fetchLmsAccount()
      .then((a) => {
        if (cancelled) return;
        setAccount(a);
        if (a.phone) setPhone(a.phone);
      })
      .catch((err) => {
        if (cancelled) return;
        setAccount({ linked: false });
        setStatus({ phase: "error", text: lmsErrorText(err, t) });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleLink = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus({ phase: "running", text: t("lms.linking") });
    try {
      const a = await linkLmsAccount(phone.trim(), password);
      setAccount({ linked: true, ...a });
      setPassword("");
      setStatus({ phase: "done", text: t("lms.linkedOk") });
    } catch (err) {
      setStatus({ phase: "error", text: lmsErrorText(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (busy || !window.confirm(t("lms.unlinkConfirm"))) return;
    setBusy(true);
    try {
      await unlinkLmsAccount();
      setAccount({ linked: false });
      setPassword("");
      setStatus({ phase: "idle", text: "" });
    } catch (err) {
      setStatus({ phase: "error", text: lmsErrorText(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const needsRelogin = account?.linked && account.status === "needs_relogin";
  const showForm = account && (!account.linked || needsRelogin);

  return (
    <div className="page-wide lms-page">
      <h2 className="page-title">{t("lms.accountTitle")}</h2>
      <p className="field-hint">
        <i className="ti ti-info-circle" aria-hidden="true" />
        {t("lms.accountIntro")}
      </p>

      {!account && (
        <p className="status-loading">
          <span className="spinner" aria-hidden="true" />
          <span>{t("lms.loading")}</span>
        </p>
      )}

      {account?.linked && (
        <div className={`lms-account-card${needsRelogin ? " warn" : ""}`}>
          <i
            className={`ti ${needsRelogin ? "ti-alert-triangle" : "ti-plug-connected"}`}
            aria-hidden="true"
          />
          <div>
            <p className="lms-account-name">
              {t("lms.linked", {
                name: account.lmsName || "?",
                phone: account.phone,
              })}
            </p>
            {needsRelogin && <p>{t("lms.needsRelogin")}</p>}
          </div>
          <div className="button-row">
            {!needsRelogin && (
              <button
                className="primary-btn with-icon"
                onClick={() => navigate("/lms")}
              >
                <i className="ti ti-cloud-upload" aria-hidden="true" />
                {t("nav.lmsGrade")}
              </button>
            )}
            <button
              className="danger-btn"
              onClick={handleUnlink}
              disabled={busy}
            >
              {t("lms.unlink")}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form className="lms-account-form" onSubmit={handleLink}>
          <div className="field-group">
            <label htmlFor="lms-phone">{t("lms.phone")}</label>
            <input
              id="lms-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              disabled={busy}
              required
            />
          </div>
          <div className="field-group">
            <label htmlFor="lms-password">{t("lms.password")}</label>
            <input
              id="lms-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="button-row">
            <button
              type="submit"
              className="primary-btn with-icon"
              disabled={busy || !phone || !password}
            >
              <i className="ti ti-plug-connected" aria-hidden="true" />
              {busy ? t("lms.linking") : t("lms.link")}
            </button>
          </div>
        </form>
      )}

      {status.text && (
        <div
          className={`status-output${status.phase === "error" ? " error" : ""}`}
        >
          {status.phase === "running" ? (
            <span className="status-loading">
              <span className="spinner" aria-hidden="true" />
              <span>{status.text}</span>
            </span>
          ) : (
            status.text
          )}
        </div>
      )}
    </div>
  );
}
