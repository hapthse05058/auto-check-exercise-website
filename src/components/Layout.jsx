import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { SUPPORT_EMAIL, isAdminEmail } from "../config.js";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** ☰ menu with navigation shortcuts (replaces the extension popup menu). */
function NavMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const { teacherInfo } = useAuth();

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
            Chấm bài
          </button>
          <button className="menu-option" onClick={() => go("/classes/new")}>
            Add new class
          </button>
          <button className="menu-option" onClick={() => go("/students/add")}>
            Add students into a class
          </button>
          <button className="menu-option" onClick={() => go("/students/manage")}>
            Quản lý học sinh
          </button>
          {isAdminEmail(teacherInfo?.gmail) && (
            <button
              className="menu-option"
              onClick={() => go("/admin/grading-cache")}
            >
              Manage grading cache
            </button>
          )}
          <a className="menu-option" href={`mailto:${SUPPORT_EMAIL}`}>
            Contact for support: {SUPPORT_EMAIL}
          </a>
        </div>
      )}
    </div>
  );
}

/** Avatar button → popover with hi + name, username and email. */
function ProfileMenu({ teacherInfo }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

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
          <p className="profile-greeting">Hi {teacherInfo.name || "there"}!</p>
          {teacherInfo.username && (
            <p className="profile-detail">
              <i className="ti ti-user" aria-hidden="true"></i>
              {teacherInfo.username}
            </p>
          )}
          {teacherInfo.gmail && (
            <p className="profile-detail">
              <i className="ti ti-mail" aria-hidden="true"></i>
              {teacherInfo.gmail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { isAuthenticated, teacherInfo, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout("Please login to use the app...");
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/grade" className="brand">
          <img src="/check-exercise.png" alt="" className="brand-icon" />
          <h3 className="m-0">AI Exercise Checker tool - For Basic classes</h3>
        </Link>
        <div className="header-right">
          {isAuthenticated && <NavMenu />}
          {isAuthenticated && <ProfileMenu teacherInfo={teacherInfo} />}
          {/* {isAuthenticated ? (
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <Link to="/login" className="primary-btn login-link">
              Login
            </Link>
          )} */}

          {isAuthenticated && <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
