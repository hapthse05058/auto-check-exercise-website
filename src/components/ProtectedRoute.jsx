import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";

/** Redirects to /login when there is no active session. */
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
