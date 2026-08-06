import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";

/** Shown right after login when the account has no teacher record yet. */
export default function MissingTeacherPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // logout() is async (it records the audit entry while the token is still
  // valid), so wait for it before navigating.
  const handleCancel = async () => {
    await logout(t("session.pleaseLogin"));
    navigate("/login");
  };

  return (
    <div className="page-narrow">
      <div className="missing-teacher-box">
        <p className="warning-text">{t("missingTeacher.message")}</p>
        <div className="action-row">
          <button className="logout-btn" onClick={handleCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary-btn" onClick={() => navigate("/signup")}>
            {t("common.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
