import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/** Shown right after login when the account has no teacher record yet. */
export default function MissingTeacherPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleCancel = () => {
    logout("Please login to use the app...");
    navigate("/login");
  };

  return (
    <div className="page-narrow">
      <div className="missing-teacher-box">
        <p className="warning-text">
          You haven't had info in the system, please create once.
        </p>
        <div className="action-row">
          <button className="logout-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button className="primary-btn" onClick={() => navigate("/signup")}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
