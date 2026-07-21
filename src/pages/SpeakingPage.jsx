import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const SPEAKING_URL = "https://grader.io.vn/";

export default function SpeakingPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true); // hide iframe until the admin gate resolves
  const [iframeLoading, setIframeLoading] = useState(true); // spinner overlay until the iframe loads

  // Admin gate — the route is reachable by URL even though the menu item is hidden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        if (!isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        setChecking(false);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Speaking page gate error:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  if (checking) return null; // admin not confirmed yet → don't render the iframe

  return (
    <div className="speaking-page">
      <div className="speaking-bar">
        <h2>{t("speaking.title")}</h2>
        <a
          href={SPEAKING_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-import"
        >
          <i className="ti ti-external-link" aria-hidden="true" />{" "}
          {t("speaking.openNewTab")}
        </a>
      </div>
      <div className="speaking-frame-wrap">
        {iframeLoading && (
          <div className="iframe-spinner">
            <span className="spinner" aria-hidden="true" />
            <span>{t("speaking.loading")}</span>
          </div>
        )}
        <iframe
          className="speaking-frame"
          src={SPEAKING_URL}
          title={t("speaking.title")}
          allow="microphone; camera; clipboard-write"
          loading="lazy"
          scrolling="yes"
          // Guard so a re-fired onLoad (internal redirects / deep links) doesn't re-render.
          onLoad={() => {
            if (iframeLoading) setIframeLoading(false);
          }}
          // No sandbox on purpose: a cross-origin iframe is already isolated from the
          // parent by the same-origin policy (it can't read our DOM/cookies). Enabling
          // sandbox tends to break grader.io.vn's own login/scripts.
        />
      </div>
    </div>
  );
}
