import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";

// Static files in public/huong-dan/ (the same guide as a web page and as a PDF).
const GUIDE_URL = "/huong-dan/index.html";
const GUIDE_PDF = "/huong-dan/Huong-dan-cham-bai.pdf";

/** The teachers' how-to guide, read in place or downloaded as a PDF. */
export default function GuidePage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const [iframeLoading, setIframeLoading] = useState(true);

  // Like every page: fills the header (name, point badge).
  useEffect(() => {
    loadTeacherInfo().catch((error) => {
      if (error.message !== "RE-AUTH_NEEDED")
        console.error("Teacher info load failed:", error);
    });
  }, [loadTeacherInfo]);

  return (
    <div className="speaking-page">
      <div className="speaking-bar">
        <h2>{t("guide.title")}</h2>
        <div className="button-row">
          <a href={GUIDE_PDF} download className="btn-add">
            <i className="ti ti-download" aria-hidden="true" />{" "}
            {t("guide.downloadPdf")}
          </a>
          <a
            href={GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-import"
          >
            <i className="ti ti-external-link" aria-hidden="true" />{" "}
            {t("guide.openNewTab")}
          </a>
        </div>
      </div>
      <div className="speaking-frame-wrap">
        {iframeLoading && (
          <div className="iframe-spinner">
            <span className="spinner" aria-hidden="true" />
            <span>{t("common.loading")}</span>
          </div>
        )}
        <iframe
          className="speaking-frame"
          src={GUIDE_URL}
          title={t("guide.title")}
          onLoad={() => setIframeLoading(false)}
        />
      </div>
    </div>
  );
}
