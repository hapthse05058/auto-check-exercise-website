import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupTeacher } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";

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
      setStatus(
        "Please fill in all mandatory fields: Username, Password, Gmail, Full name, phone number, and DOB.",
      );
      return;
    }

    const emailRegex = /^[^\s@]+@gmail\.com$/;
    if (!emailRegex.test(gmail)) {
      setStatus("Please enter a valid Gmail address.");
      return;
    }

    if (username.length < 3) {
      setStatus("Username must be at least 3 characters long.");
      return;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters long.");
      return;
    }

    setStatus("Saving your teacher information...");
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
        setStatus(
          "An account already exists for this email. Returning to the app.",
        );
        setTimeout(() => navigate("/grade"), 1200);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus(data?.error || "Failed to save teacher info. Please try again.");
        return;
      }

      setStatus("Teacher info saved successfully. Redirecting...");
      await refreshTeacherInfo().catch(() => null);
      setTimeout(() => navigate("/grade"), 900);
    } catch (error) {
      console.error("Signup error:", error);
      setStatus("Unable to connect to the backend. Please try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="form-panel">
        <div className="mb-2">
          <h3 className="m-0">Teacher Sign Up</h3>
        </div>
        <div className="form-field">
          <label htmlFor="username">
            Username <span className="required-star">*</span>
          </label>
          <input
            id="username"
            type="text"
            placeholder="Enter your username"
            value={form.username}
            onChange={update("username")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">
            Password <span className="required-star">*</span>
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={update("password")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="gmail">
            Gmail <span className="required-star">*</span>
          </label>
          <input
            id="gmail"
            type="email"
            placeholder="Enter your Gmail address"
            value={form.gmail}
            onChange={update("gmail")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="name">
            Full name <span className="required-star">*</span>
          </label>
          <input
            id="name"
            type="text"
            placeholder="Enter your full name"
            value={form.name}
            onChange={update("name")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="phone">
            Phone number <span className="required-star">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="Enter your phone number"
            value={form.phone}
            onChange={update("phone")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="dob">
            Date of birth <span className="required-star">*</span>
          </label>
          <input id="dob" type="date" value={form.dob} onChange={update("dob")} />
        </div>
        <div className="form-field">
          <label htmlFor="address">Address</label>
          <input
            id="address"
            type="text"
            placeholder="Optional address"
            value={form.address}
            onChange={update("address")}
          />
        </div>
        <div className="form-field">
          <label htmlFor="notes">Additional info</label>
          <textarea
            id="notes"
            rows={3}
            placeholder="Optional notes"
            value={form.notes}
            onChange={update("notes")}
          />
        </div>
        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate(-1)}>
            Go Back
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            Save
          </button>
        </div>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
