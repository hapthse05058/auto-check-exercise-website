import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupTeacher } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const INITIAL_FORM = {
  username: "",
  password: "",
  gmail: "",
  name: "",
  phone: "",
  dob: "",
  address: "",
  notes: "",
};

export default function SignupPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { refreshTeacherInfo } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) =>
    setForm({ ...form, [field]: event.target.value });

  const handleSave = async () => {
    const username = form.username.trim();
    const password = form.password.trim();
    const gmail = form.gmail.trim();
    const name = form.name.trim();
    const phone = form.phone.trim();
    const dob = form.dob;
    const address = form.address.trim();
    const notes = form.notes.trim();

    if (!username || !password || !gmail || !name || !phone || !dob) {
      setStatus(t("signup.requiredFields"));
      return;
    }

    const emailRegex = /^[^\s@]+@gmail\.com$/;
    if (!emailRegex.test(gmail)) {
      setStatus(t("signup.invalidGmail"));
      return;
    }

    if (username.length < 3) {
      setStatus(t("signup.usernameMin"));
      return;
    }

    if (password.length < 6) {
      setStatus(t("signup.passwordMin"));
      return;
    }

    setStatus(t("signup.saving"));
    setSaving(true);

    try {
      const response = await signupTeacher({
        username,
        password,
        gmail,
        name,
        phone,
        dob,
        address,
        notes,
      });

      if (response.status === 409) {
        setStatus(t("signup.exists"));
        setTimeout(() => navigate("/grade"), 1200);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus(data?.error || t("signup.failed"));
        return;
      }

      setStatus(t("signup.saved"));
      await refreshTeacherInfo().catch(() => null);
      setTimeout(() => navigate("/grade"), 900);
    } catch (error) {
      console.error("Signup error:", error);
      setStatus(t("signup.connectError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <div className="mb-2">
          <h3 className="m-0">{t("signup.title")}</h3>
        </div>
        <div className="form-field">
          <label htmlFor="username">
            {t("signup.username")} <span className="required-star">*</span>
          </label>
          <input
            id="username"
            type="text"
            placeholder={t("signup.usernamePlaceholder")}
            value={form.username}
            onChange={update("username")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">
            {t("signup.password")} <span className="required-star">*</span>
          </label>
          <input
            id="password"
            type="password"
            placeholder={t("signup.passwordPlaceholder")}
            value={form.password}
            onChange={update("password")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="gmail">
            {t("signup.gmail")} <span className="required-star">*</span>
          </label>
          <input
            id="gmail"
            type="email"
            placeholder={t("signup.gmailPlaceholder")}
            value={form.gmail}
            onChange={update("gmail")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="name">
            {t("signup.name")} <span className="required-star">*</span>
          </label>
          <input
            id="name"
            type="text"
            placeholder={t("signup.namePlaceholder")}
            value={form.name}
            onChange={update("name")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="phone">
            {t("signup.phone")} <span className="required-star">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            placeholder={t("signup.phonePlaceholder")}
            value={form.phone}
            onChange={update("phone")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="dob">
            {t("signup.dob")} <span className="required-star">*</span>
          </label>
          <input
            id="dob"
            type="date"
            value={form.dob}
            onChange={update("dob")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="address">{t("signup.address")}</label>
          <input
            id="address"
            type="text"
            placeholder={t("signup.addressPlaceholder")}
            value={form.address}
            onChange={update("address")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="notes">{t("signup.notes")}</label>
          <textarea
            id="notes"
            rows={3}
            placeholder={t("signup.notesPlaceholder")}
            value={form.notes}
            onChange={update("notes")}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate(-1)}>
            {t("common.goBack")}
          </button>
          <button
            className="primary-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {t("common.save")}
          </button>
        </div>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
