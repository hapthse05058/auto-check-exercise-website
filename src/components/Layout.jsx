import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { fetchMyPoint } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { SUPPORT_EMAIL, isAdminEmail } from "../config.js";
import NotificationBell from "./NotificationBell.jsx";
import { usePushNotifications } from "../hooks/usePushNotifications.js";
import { usePwaInstall } from "../hooks/usePwaInstall.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { POINTS_CHANGED } from "../lib/pointEvents.js";
import { refreshPushToken, startForegroundPushListener } from "../lib/push.js";

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

const POINT_REFRESH_MS = 60 * 1000;

/**
 * The signed-in teacher's point balance, always in the header. Re-read on
 * every page change, when the tab regains focus and once a minute (scheduled
 * grading spends points in the background); screens that read a fresh
 * balance themselves announce it (lib/pointEvents.js).
 */
function PointBadge() {
  const { t } = useLanguage();
  const location = useLocation();
  const [point, setPoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMyPoint()
        .then((value) => !cancelled && setPoint(value))
        .catch(() => {});
    load();
    const timer = setInterval(load, POINT_REFRESH_MS);
    const onFocus = () => load();
    const onAnnounce = (event) => {
      if (Number.isFinite(event.detail?.point)) setPoint(event.detail.point);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(POINTS_CHANGED, onAnnounce);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(POINTS_CHANGED, onAnnounce);
    };
  }, [location.pathname]);

  if (point === null) return null;
  return (
    <span
      className={`point-badge ${point <= 0 ? "empty" : ""}`}
      title={t("nav.pointsTitle")}
    >
      <i className="ti ti-coins" aria-hidden="true" />
      {t("nav.points", { n: point.toLocaleString("vi-VN") })}
    </span>
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
            <button
              className="menu-option"
              onClick={() => go("/admin/courses")}
            >
              {t("nav.manageCourses")}
            </button>
          )}
          {isAdmin && (
            <button className="menu-option" onClick={() => go("/speaking")}>
              {t("nav.gradeSpeaking")}
            </button>
          )}
          {isAdmin && (
            <button
              className="menu-option"
              onClick={() => go("/admin/audit-logs")}
            >
              {t("nav.auditLog")}
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
  const push = usePushNotifications();

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
          {/* Push opt-in sits next to "Install app": same class of browser
              capability, same gesture requirement, same iOS caveat. Offered to
              every signed-in user — teachers get notified when an admin grades
              their class. NEVER auto-prompted: a dismissed prompt blocks the
              origin for good in Chrome. */}
          {push.canEnable && (
            <button
              className="menu-option install-option"
              disabled={push.busy}
              onClick={() => {
                setOpen(false);
                push.enable();
              }}
            >
              <i className="ti ti-bell-plus" aria-hidden="true" />
              {t("notif.enablePush")}
            </button>
          )}
          {push.supported && push.enabled && (
            <button
              className="menu-option install-option"
              disabled={push.busy}
              onClick={() => {
                setOpen(false);
                push.disable();
              }}
            >
              <i className="ti ti-bell-off" aria-hidden="true" />
              {t("notif.disablePush")}
            </button>
          )}
          {push.permission === "denied" && (
            <p className="profile-detail install-ios-hint">
              {t("notif.pushBlocked")}
            </p>
          )}
          {push.supported && push.isIOS && !push.isStandalone && (
            <p className="profile-detail install-ios-hint">
              {t("notif.pushIosHint")}
            </p>
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
  // On app start, re-assert this browser's FCM token (tokens rotate; saveDevice
  // is an idempotent merge and push.js rate-limits it to once a day) and start
  // the foreground listener so a push arriving on a focused tab updates the bell
  // instead of being dropped. No-ops unless push is already enabled here.
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshPushToken();
    startForegroundPushListener();
  }, [isAuthenticated]);

  // logout() is async (it records the audit entry while the token is still
  // valid), so wait for it before navigating.
  const handleLogout = async () => {
    await logout(t("session.pleaseLogin"));
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
          {/* Admins grade on the class teacher's points (the grading screen
              shows that balance), so their own would only mislead. */}
          {isAuthenticated &&
            teacherInfo &&
            !isAdminEmail(teacherInfo.gmail) && <PointBadge />}
          {isAuthenticated && <NavMenu />}
          {isAuthenticated && <NotificationBell />}
          {isAuthenticated && <ProfileMenu teacherInfo={teacherInfo} />}
          {isAuthenticated && (
            <button
              className="logout-btn header-logout"
              onClick={handleLogout}
              title={t("nav.logout")}
              aria-label={t("nav.logout")}
            >
              <i className="ti ti-logout" aria-hidden="true" />
              <span className="header-logout-label">{t("nav.logout")}</span>
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
