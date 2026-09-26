import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AddStudentsPage from "./pages/AddStudentsPage.jsx";
import AdminCoursesPage from "./pages/AdminCoursesPage.jsx";
import AdminTeacherPointsPage from "./pages/AdminTeacherPointsPage.jsx";
import AdminTeachersPage from "./pages/AdminTeachersPage.jsx";
import AuditLogPage from "./pages/AuditLogPage.jsx";
import AuthCallbackPage from "./pages/AuthCallbackPage.jsx";
import ClassManagePage from "./pages/ClassManagePage.jsx";
import ClassStudentsPage from "./pages/ClassStudentsPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import GradePage from "./pages/GradePage.jsx";
import GradingCachePage from "./pages/GradingCachePage.jsx";
import LandingPagePersonal from "./pages/LandingPagePersonal.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MissingTeacherPage from "./pages/MissingTeacherPage.jsx";
import NewClassPage from "./pages/NewClassPage.jsx";
import PosterMarketingPage from "./pages/PosterMarketingPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import SpeakingPage from "./pages/SpeakingPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/contact-us" element={<PosterMarketingPage />} />
      <Route path="/personal" element={<LandingPagePersonal />} />
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
          <Route path="/students/manage" element={<ClassStudentsPage />} />
          <Route path="/classes/manage" element={<ClassManagePage />} />
          <Route path="/admin/grading-cache" element={<GradingCachePage />} />
          <Route
            path="/admin/teacher-points"
            element={<AdminTeacherPointsPage />}
          />
          <Route path="/admin/teachers" element={<AdminTeachersPage />} />
          <Route path="/admin/courses" element={<AdminCoursesPage />} />
          <Route path="/admin/audit-logs" element={<AuditLogPage />} />
          <Route path="/speaking" element={<SpeakingPage />} />
          <Route path="/missing-teacher" element={<MissingTeacherPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/grade" replace />} />
      </Route>
    </Routes>
  );
}
