import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AddStudentsPage from "./pages/AddStudentsPage.jsx";
import AdminTeacherPointsPage from "./pages/AdminTeacherPointsPage.jsx";
import AdminTeachersPage from "./pages/AdminTeachersPage.jsx";
import ClassManagePage from "./pages/ClassManagePage.jsx";
import ClassStudentsPage from "./pages/ClassStudentsPage.jsx";
import AuthCallbackPage from "./pages/AuthCallbackPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import GradePage from "./pages/GradePage.jsx";
import GradingCachePage from "./pages/GradingCachePage.jsx";
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
          <Route path="/students/manage" element={<ClassStudentsPage />} />
          <Route path="/classes/manage" element={<ClassManagePage />} />
          <Route path="/admin/grading-cache" element={<GradingCachePage />} />
          <Route path="/admin/teacher-points" element={<AdminTeacherPointsPage />} />
          <Route path="/admin/teachers" element={<AdminTeachersPage />} />
          <Route path="/missing-teacher" element={<MissingTeacherPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/grade" replace />} />
      </Route>
    </Routes>
  );
}
