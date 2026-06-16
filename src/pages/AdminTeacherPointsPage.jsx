import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createTeacherPoint,
  deleteTeacherPoint,
  fetchBilling,
  fetchTeacherPoints,
  fetchTeachersForPoints,
  resetBilling,
  topUpTeacherPoint,
  updateTeacherPoint,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const TOPUP_STEP = 70000;
const TOPUP_MIN = 70000;
const TOPUP_MAX = 7000000;
const VND_PER_POINT = 700;

const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN") + "đ";
const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function AdminTeacherPointsPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [records, setRecords] = useState([]);
  const [billing, setBilling] = useState({ totalTopUpVnd: 0, commissionVnd: 0 });
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(t("points.loading"));

  // Modal state. mode: "add" | "edit" | "topup" | "history" | null
  const [modal, setModal] = useState(null);
  const [active, setActive] = useState(null); // the record being acted on
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teacherInfo = await loadTeacherInfo();
        if (cancelled) return;
        if (!teacherInfo) {
          navigate("/missing-teacher", { replace: true });
          return;
        }
        if (!isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        await reload();
      } catch (error) {
        if (cancelled || error.message === "RE-AUTH_NEEDED") return;
        console.error("Error loading teacher points:", error);
        setStatus(t("points.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTeacherInfo, navigate]);

  async function reload() {
    setLoading(true);
    setStatus(t("points.loading"));
    try {
      const [recs, bill, teacherList] = await Promise.all([
        fetchTeacherPoints(),
        fetchBilling(),
        fetchTeachersForPoints(),
      ]);
      setRecords(recs);
      setBilling(bill);
      setTeachers(teacherList);
      setStatus(t("points.countRecords", { n: recs.length }));
    } catch (error) {
      if (error.message === "RE-AUTH_NEEDED") return;
      console.error("Reload error:", error);
      setStatus(t("points.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.gmail || "").toLowerCase().includes(q),
    );
  }, [records, search]);

  // Teachers that don't yet have a TeacherPoint record (for the Add dropdown).
  const teachersWithoutRecord = useMemo(() => {
    const have = new Set(records.map((r) => r.teacherId));
    return teachers.filter((t) => !have.has(t.id));
  }, [teachers, records]);

  const closeModal = () => {
    setModal(null);
    setActive(null);
    setForm({});
    setFormError("");
  };

  const openAdd = () => {
    setActive(null);
    setForm({ teacherId: "", point: 0 });
    setFormError("");
    setModal("add");
  };
  const openEdit = (rec) => {
    setActive(rec);
    setForm({ point: rec.point });
    setFormError("");
    setModal("edit");
  };
  const openTopUp = (rec) => {
    setActive(rec);
    setForm({ amountVnd: TOPUP_MIN });
    setFormError("");
    setModal("topup");
  };
  const openHistory = (rec) => {
    setActive(rec);
    setModal("history");
  };

  const handleAdd = async () => {
    if (!form.teacherId) {
      setFormError(t("points.selectTeacherErr"));
      return;
    }
    setSaving(true);
    try {
      const res = await createTeacherPoint({
        teacherId: form.teacherId,
        point: Number(form.point) || 0,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setFormError(
          d?.error === "already_exists"
            ? t("points.teacherExists")
            : d?.error || t("points.createFailed"),
        );
        return;
      }
      closeModal();
      setStatus(t("points.created"));
      await reload();
    } catch (error) {
      setFormError(t("points.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!Number.isFinite(Number(form.point))) {
      setFormError(t("points.pointNumberErr"));
      return;
    }
    setSaving(true);
    try {
      const res = await updateTeacherPoint(active.id, { point: Number(form.point) });
      if (!res.ok) {
        setFormError(t("points.updateFailed"));
        return;
      }
      closeModal();
      setStatus(t("points.updated"));
      await reload();
    } catch (error) {
      setFormError(t("points.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async () => {
    const amount = Number(form.amountVnd);
    if (
      !Number.isInteger(amount) ||
      amount < TOPUP_MIN ||
      amount > TOPUP_MAX ||
      amount % TOPUP_STEP !== 0
    ) {
      setFormError(
        t("points.amountErr", {
          step: vnd(TOPUP_STEP),
          min: vnd(TOPUP_MIN),
          max: vnd(TOPUP_MAX),
        }),
      );
      return;
    }
    setSaving(true);
    try {
      const res = await topUpTeacherPoint(active.id, amount);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setFormError(d?.error || t("points.topUpFailed"));
        return;
      }
      closeModal();
      setStatus(
        t("points.toppedUp", {
          amount: vnd(amount),
          points: amount / VND_PER_POINT,
        }),
      );
      await reload();
    } catch (error) {
      setFormError(t("points.topUpFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec) => {
    if (!window.confirm(t("points.deleteConfirm", { who: rec.name || rec.gmail }))) return;
    try {
      const res = await deleteTeacherPoint(rec.id);
      if (!res.ok) {
        setStatus(t("points.deleteFailed"));
        return;
      }
      setStatus(t("points.deleted"));
      await reload();
    } catch (error) {
      setStatus(t("points.deleteFailed"));
    }
  };

  const handleResetBilling = async () => {
    if (!window.confirm(t("points.resetConfirm"))) return;
    try {
      const res = await resetBilling();
      if (!res.ok) {
        setStatus(t("points.resetFailed"));
        return;
      }
      setBilling({ totalTopUpVnd: 0, commissionVnd: 0 });
      setStatus(t("points.reset"));
    } catch (error) {
      setStatus(t("points.resetFailed"));
    }
  };

  const topupAmount = Number(form.amountVnd) || 0;

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("points.title")}{" "}
              <span className="count-badge">{records.length}</span>
            </h2>
            <p>{t("points.subtitle")}</p>
          </div>
          <button className="btn-add" onClick={openAdd}>
            <i className="ti ti-plus" aria-hidden="true"></i> {t("points.addTeacher")}
          </button>
        </div>

        {/* Billing summary */}
        <div className="billing-panel">
          <div className="billing-item">
            <span className="billing-label">{t("points.totalTopUp")}</span>
            <span className="billing-value">{vnd(billing.totalTopUpVnd)}</span>
          </div>
          <div className="billing-item">
            <span className="billing-label">{t("points.commission")}</span>
            <span className="billing-value">{vnd(billing.commissionVnd)}</span>
          </div>
          <button className="btn-cancel" onClick={handleResetBilling}>
            {t("points.resetTotal")}
          </button>
        </div>

        <div className="cache-search">
          <input
            type="text"
            placeholder={t("points.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true"></span>
            <span>{t("points.loading")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-coins" aria-hidden="true"></i>
            <p>{t("points.empty")}</p>
          </div>
        ) : (
          <div className="cache-table-wrap">
            <table className="cache-table">
              <thead>
                <tr>
                  <th>{t("points.colTeacher")}</th>
                  <th>{t("points.colPoint")}</th>
                  <th>{t("points.colTopUpCount")}</th>
                  <th>{t("points.colLastTopUp")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="student-name">{r.name || "—"}</div>
                      <div className="cell-date">{r.gmail}</div>
                    </td>
                    <td>{r.point}</td>
                    <td>{r.topUpCount}</td>
                    <td className="cell-date">{formatDate(r.lastTopUpAt)}</td>
                    <td className="cell-actions">
                      <button
                        className="btn-icon"
                        title={t("points.topUp")}
                        aria-label={t("points.topUp")}
                        onClick={() => openTopUp(r)}
                      >
                        <i className="ti ti-coin" aria-hidden="true"></i>
                      </button>
                      <button
                        className="btn-icon"
                        title={t("points.editPoint")}
                        aria-label={t("points.editPoint")}
                        onClick={() => openEdit(r)}
                      >
                        <i className="ti ti-edit" aria-hidden="true"></i>
                      </button>
                      <button
                        className="btn-icon"
                        title={t("points.history")}
                        aria-label={t("points.history")}
                        onClick={() => openHistory(r)}
                      >
                        <i className="ti ti-history" aria-hidden="true"></i>
                      </button>
                      <button
                        className="btn-icon danger"
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                        onClick={() => handleDelete(r)}
                      >
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="status-line">{status}</div>

        {/* Add modal */}
        {modal === "add" && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("points.addTitle")}</h3>
              </div>
              <div className="field-group">
                <label>{t("points.teacher")}</label>
                <select
                  value={form.teacherId}
                  onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                >
                  <option value="">{t("points.selectTeacher")}</option>
                  {teachersWithoutRecord.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.gmail} ({t.gmail})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>{t("points.initialPoint")}</label>
                <input
                  type="number"
                  value={form.point}
                  onChange={(e) => setForm({ ...form, point: e.target.value })}
                />
              </div>
              {formError && <div className="err" style={{ display: "block" }}>{formError}</div>}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal} disabled={saving}>
                  {t("common.cancel")}
                </button>
                <button className="btn-confirm" onClick={handleAdd} disabled={saving}>
                  {t("points.create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {modal === "edit" && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("points.editTitle", { who: active.name || active.gmail })}</h3>
              </div>
              <div className="field-group">
                <label>{t("points.pointLabel")}</label>
                <input
                  type="number"
                  value={form.point}
                  onChange={(e) => setForm({ ...form, point: e.target.value })}
                  autoFocus
                />
              </div>
              {formError && <div className="err" style={{ display: "block" }}>{formError}</div>}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal} disabled={saving}>
                  {t("common.cancel")}
                </button>
                <button className="btn-confirm" onClick={handleEdit} disabled={saving}>
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top-up modal */}
        {modal === "topup" && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("points.topUpTitle", { who: active.name || active.gmail })}</h3>
              </div>
              <div className="field-group">
                <label>{t("points.amountLabel", { step: vnd(TOPUP_STEP) })}</label>
                <input
                  type="number"
                  min={TOPUP_MIN}
                  max={TOPUP_MAX}
                  step={TOPUP_STEP}
                  value={form.amountVnd}
                  onChange={(e) => setForm({ ...form, amountVnd: e.target.value })}
                  autoFocus
                />
              </div>
              <p className="field-note">
                {t("points.amountHint", {
                  points: topupAmount / VND_PER_POINT || 0,
                  commission: vnd((topupAmount / VND_PER_POINT) * 100),
                })}
              </p>
              {formError && <div className="err" style={{ display: "block" }}>{formError}</div>}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal} disabled={saving}>
                  {t("common.cancel")}
                </button>
                <button className="btn-confirm" onClick={handleTopUp} disabled={saving}>
                  {t("points.doTopUp")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History modal */}
        {modal === "history" && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("points.historyTitle", { who: active.name || active.gmail })}</h3>
              </div>
              {active.topUpHistory.length === 0 ? (
                <p className="field-note">{t("points.noHistory")}</p>
              ) : (
                <div className="cache-table-wrap">
                  <table className="cache-table">
                    <thead>
                      <tr>
                        <th>{t("points.hTime")}</th>
                        <th>{t("points.hAmount")}</th>
                        <th>{t("points.hPoints")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...active.topUpHistory].reverse().map((h, i) => (
                        <tr key={i}>
                          <td className="cell-date">{formatDate(h.topUpAt)}</td>
                          <td>{vnd(h.amountVnd)}</td>
                          <td>{h.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal}>
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
