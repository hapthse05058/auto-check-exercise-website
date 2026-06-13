import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AddStudentsPage from "./pages/AddStudentsPage.jsx";
import AuthCallbackPage from "./pages/AuthCallbackPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import GradePage from "./pages/GradePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MissingTeacherPage from "./pages/MissingTeacherPage.jsx";
import NewClassPage from "./pages/NewClassPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/grade" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/grade" element={<GradePage />} />
          <Route path="/classes/new" element={<NewClassPage />} />
          <Route path="/students/add" element={<AddStudentsPage />} />
          <Route path="/missing-teacher" element={<MissingTeacherPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/grade" replace />} />
      </Route>
    </Routes>
  );
}
