import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { SUPPORT_EMAIL, isAdminEmail } from "../config.js";
import { usePwaInstall } from "../hooks/usePwaInstall.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** VI / EN language toggle. */
function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      <button
        className={`lang-option ${lang === "vi" ? "active" : ""}`}
        onClick={() => setLang("vi")}
      >
        {t("lang.vi")}
      </button>
      <button
        className={`lang-option ${lang === "en" ? "active" : ""}`}
        onClick={() => setLang("en")}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}

/** ☰ menu with navigation shortcuts (replaces the extension popup menu). */
function NavMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const { teacherInfo } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    const onClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const isAdmin = isAdminEmail(teacherInfo?.gmail);

  return (
    <div className="menu-wrapper" ref={wrapperRef}>
      <button
        className="menu-btn"
        title="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      {open && (
        <div className="menu-options">
          <button className="menu-option" onClick={() => go("/grade")}>
            {t("nav.grade")}
          </button>
          <button className="menu-option" onClick={() => go("/classes/new")}>
            {t("nav.addClass")}
          </button>
          <button className="menu-option" onClick={() => go("/students/add")}>
            {t("nav.addStudents")}
          </button>
          <button
            className="menu-option"
            onClick={() => go("/students/manage")}
          >
            {t("nav.manageStudents")}
          </button>
          <button className="menu-option" onClick={() => go("/classes/manage")}>
            {t("nav.manageClasses")}
          </button>
          {isAdmin && (
            <button
              className="menu-option"
              onClick={() => go("/admin/grading-cache")}
            >
              {t("nav.manageCache")}
            </button>
          )}
          {isAdmin && (
            <button
              className="menu-option"
              onClick={() => go("/admin/teacher-points")}
            >
              {t("nav.managePoints")}
            </button>
          )}
          {isAdmin && (
            <button
              className="menu-option"
              onClick={() => go("/admin/teachers")}
            >
              {t("nav.manageTeachers")}
            </button>
          )}
          {isAdmin && (
            <button className="menu-option" onClick={() => go("/speaking")}>
              {t("nav.gradeSpeaking")}
            </button>
          )}
          <a className="menu-option" href={`mailto:${SUPPORT_EMAIL}`}>
            {t("nav.support", { email: SUPPORT_EMAIL })}
          </a>
        </div>
      )}
    </div>
  );
}

/** Avatar button → popover with hi + name, username and email. */
function ProfileMenu({ teacherInfo }) {
  const [open, setOpen] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const wrapperRef = useRef(null);
  const { t } = useLanguage();
  const { canInstall, isIOS, promptInstall } = usePwaInstall();

  useEffect(() => {
    const onClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!teacherInfo) return null;

  return (
    <div className="menu-wrapper" ref={wrapperRef}>
      <button
        className="profile-btn"
        title="Profile"
        aria-label="Profile"
        onClick={() => setOpen((v) => !v)}
      >
        {initials(teacherInfo.name)}
      </button>
      {open && (
        <div className="menu-options profile-popover">
          <p className="profile-greeting">
            {t("nav.hi", { name: teacherInfo.name || t("nav.there") })}
          </p>
          {teacherInfo.username && (
            <p className="profile-detail">
              <i className="ti ti-user" aria-hidden="true" />
              {teacherInfo.username}
            </p>
          )}
          {teacherInfo.gmail && (
            <p className="profile-detail">
              <i className="ti ti-mail" aria-hidden="true" />
              {teacherInfo.gmail}
            </p>
          )}
          {canInstall && (
            <button
              className="menu-option install-option"
              onClick={() => {
                setOpen(false);
                promptInstall();
              }}
            >
              <i className="ti ti-download" aria-hidden="true" />
              {t("nav.installApp")}
            </button>
          )}
          {!canInstall && isIOS && (
            <>
              <button
                className="menu-option install-option"
                onClick={() => setShowIosHint((v) => !v)}
              >
                <i className="ti ti-download" aria-hidden="true" />
                {t("nav.installApp")}
              </button>
              {showIosHint && (
                <p className="profile-detail install-ios-hint">
                  {t("nav.installIosHint")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { isAuthenticated, teacherInfo, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout(t("session.pleaseLogin"));
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/grade" className="brand">
          <img src="/check-exercise.png" alt="" className="brand-icon" />
          <h3 className="m-0">{t("common.appTitle")}</h3>
        </Link>
        <div className="header-right">
          <LanguageSwitcher />
          {isAuthenticated && <NavMenu />}
          {isAuthenticated && <ProfileMenu teacherInfo={teacherInfo} />}
          {isAuthenticated && (
            <button className="logout-btn" onClick={handleLogout}>
              {t("nav.logout")}
            </button>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
