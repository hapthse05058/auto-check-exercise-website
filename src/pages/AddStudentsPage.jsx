import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchClasses, saveStudents } from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortUrl(url) {
  try {
    return new URL(url).hostname.replace("www.", "") + "/…";
  } catch {
    return url;
  }
}

const EMPTY_FORM = { name: "", gmail: "", doc: "" };

export default function AddStudentsPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [status, setStatus] = useState("Add students into an existing class.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        // Unregistered teacher (403 → null): send them to sign up, matching
        // the extension's gating and GradePage.
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        const classList = await fetchClasses(teacherInfo.id);
        if (!cancelled) setClasses(classList);
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error fetching classes:", error);
        setStatus("Failed to load classes.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  const openModal = (index = -1) => {
    setEditIndex(index);
    setForm(index >= 0 ? { ...students[index] } : EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const confirmStudent = () => {
    const name = form.name.trim();
    const gmail = form.gmail.trim();
    const doc = form.doc.trim();

    const errors = {};
    if (!name) errors.name = true;
    if (!gmail.includes("@")) errors.gmail = true;
    if (!doc.startsWith("http")) errors.doc = true;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const student = { name, gmail, doc };
    setStudents((prev) => {
      if (editIndex >= 0) {
        const next = [...prev];
        next[editIndex] = student;
        return next;
      }
      return [...prev, student];
    });
    setModalOpen(false);
  };

  const removeStudent = (index) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveStudents = async () => {
    if (!classId) {
      setStatus("Please select a class.");
      return;
    }

    const studentsToSave = students
      .map((s) => ({ gmail: s.gmail, name: s.name, ggDocLink: s.doc }))
      .filter((student) => student.gmail && student.name);

    if (!studentsToSave.length) {
      setStatus("Please add at least one student with gmail and name.");
      return;
    }

    setStatus("Saving students...");
    setSaving(true);
    try {
      const response = await saveStudents(classId, studentsToSave);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setStatus(errorData?.error || "Failed to save students.");
        return;
      }

      const confirmed = window.confirm(
        "Students added successfully. Do you want to return to Homepage?",
      );
      if (confirmed) {
        navigate("/grade");
      } else {
        setStudents([]);
        setStatus("Students saved. You can add another batch.");
      }
    } catch (error) {
      console.error("Error saving students:", error);
      setStatus("Unable to save students. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              Student list{" "}
              <span className="count-badge">
                {students.length}{" "}
                {students.length === 1 ? "student" : "students"}
              </span>
            </h2>
            <p>Manage students and their linked documents.</p>
          </div>
          <button className="btn-add" onClick={() => openModal()}>
            <i className="ti ti-plus" aria-hidden="true"></i> Add student
          </button>
        </div>

        <div className="field-group">
          <label>Class name</label>
          <select
            className="mb-1"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Select a class</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div id="listArea">
          {students.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users" aria-hidden="true"></i>
              <p>
                No students yet. Click <strong>Add student</strong> to get
                started.
              </p>
            </div>
          ) : (
            <div>
              {students.map((s, i) => (
                <div className="student-card" key={`${s.gmail}-${i}`}>
                  <div className="avatar">{initials(s.name)}</div>
                  <div className="student-info">
                    <p className="student-name">{s.name}</p>
                    <div className="student-meta">
                      <div className="meta-item">
                        <i className="ti ti-mail" aria-hidden="true"></i>
                        <span>{s.gmail}</span>
                      </div>
                      <div className="meta-item">
                        <i className="ti ti-file-text" aria-hidden="true"></i>
                        <a href={s.doc} target="_blank" rel="noreferrer">
                          {shortUrl(s.doc)}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      className="btn-icon"
                      aria-label="Edit student"
                      onClick={() => openModal(i)}
                    >
                      <i className="ti ti-edit" aria-hidden="true"></i>
                    </button>
                    <button
                      className="btn-icon danger"
                      aria-label="Remove student"
                      onClick={() => removeStudent(i)}
                    >
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{editIndex >= 0 ? "Edit student" : "Add new student"}</h3>
              </div>
              <div className="field-group">
                <label>Full name</label>
                <input
                  type="text"
                  placeholder="e.g. Trần Thị Hải"
                  value={form.name}
                  autoFocus
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {formErrors.name && (
                  <div className="err" style={{ display: "block" }}>
                    Please enter the student's full name.
                  </div>
                )}
              </div>
              <div className="field-group">
                <label>Gmail address</label>
                <input
                  type="email"
                  placeholder="student@gmail.com"
                  value={form.gmail}
                  onChange={(e) => setForm({ ...form, gmail: e.target.value })}
                />
                {formErrors.gmail && (
                  <div className="err" style={{ display: "block" }}>
                    Please enter a valid Gmail address.
                  </div>
                )}
              </div>
              <div className="field-group">
                <label>Google Doc link</label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/…"
                  value={form.doc}
                  onChange={(e) => setForm({ ...form, doc: e.target.value })}
                />
                {formErrors.doc && (
                  <div className="err" style={{ display: "block" }}>
                    Please enter a valid URL.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn-confirm" onClick={confirmStudent}>
                  {editIndex >= 0 ? "Save changes" : "Save Student"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="action-row">
          <button className="logout-btn" onClick={() => navigate("/grade")}>
            Back To Homepage
          </button>
          <button className="btn-add" onClick={handleSaveStudents} disabled={saving}>
            Save Student List
          </button>
        </div>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}
