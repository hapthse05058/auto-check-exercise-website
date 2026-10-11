import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteTeacherPoint,
  fetchBilling,
  fetchTeacherPoints,
  topUpTeacherPoint,
  updateTeacherPoint,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import DataTable from "../components/DataTable.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  PRICE_AUTO_VND,
  PRICE_MANUAL_VND,
  TOPUP_MAX_VND,
  TOPUP_STEP_VND,
  clampTopUp,
  formatVnd as vnd,
  maskMoney,
  revenueOfTopUp,
} from "../lib/billing.js";
import { formatDateTimeVn } from "../lib/scheduleTime.js";

/** One-click amounts for the top-up dialog, in steps of 70.000đ. */
const TOPUP_PRESETS = [1, 2, 5, 10, 20].map((n) => n * TOPUP_STEP_VND);
const formatDate = (iso) => formatDateTimeVn(iso);

export default function AdminTeacherPointsPage() {
  const { loadTeacherInfo } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [records, setRecords] = useState([]);
  const [billing, setBilling] = useState({
    totalTopUpVnd: 0,
    totalCommissionVnd: 0,
  });
  const [showTotal, setShowTotal] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("hasActive"); // hasActive | noActive | all
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
      const [recs, bill] = await Promise.all([
        fetchTeacherPoints(),
        fetchBilling(),
      ]);
      setRecords(recs);
      setBilling(bill);
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
    return records.filter((r) => {
      if (activeFilter === "hasActive" && !r.hasActiveClass) return false;
      if (activeFilter === "noActive" && r.hasActiveClass) return false;
      if (!q) return true;
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.gmail || "").toLowerCase().includes(q)
      );
    });
  }, [records, search, activeFilter]);

  const closeModal = () => {
    setModal(null);
    setActive(null);
    setForm({});
    setFormError("");
  };

  const openEdit = (rec) => {
    setActive(rec);
    setForm({ balanceVnd: rec.balanceVnd });
    setFormError("");
    setModal("edit");
  };
  const openTopUp = (rec) => {
    setActive(rec);
    setForm({ amountVnd: TOPUP_STEP_VND });
    setFormError("");
    setModal("topup");
  };
  const openHistory = (rec) => {
    setActive(rec);
    setModal("history");
  };

  const handleEdit = async () => {
    const balanceVnd = Number(form.balanceVnd);
    if (
      form.balanceVnd === "" ||
      !Number.isInteger(balanceVnd) ||
      balanceVnd < 0
    ) {
      setFormError(t("points.pointNumberErr"));
      return;
    }
    setSaving(true);
    try {
      const res = await updateTeacherPoint(active.id, { balanceVnd });
      if (!res.ok) {
        setFormError(t("points.updateFailed"));
        return;
      }
      closeModal();
      setStatus(t("points.updated"));
      await reload();
    } catch {
      setFormError(t("points.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async () => {
    // The stepper only ever holds a valid amount; this guards the request.
    const amount = Number(form.amountVnd);
    if (clampTopUp(amount) !== amount) {
      setFormError(
        t("points.amountErr", {
          step: vnd(TOPUP_STEP_VND),
          min: vnd(TOPUP_STEP_VND),
          max: vnd(TOPUP_MAX_VND),
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
          who: active.name || active.gmail,
          amount: vnd(amount),
        }),
      );
      await reload();
    } catch {
      setFormError(t("points.topUpFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec) => {
    if (
      !window.confirm(t("points.deleteConfirm", { who: rec.name || rec.gmail }))
    )
      return;
    try {
      const res = await deleteTeacherPoint(rec.id);
      if (!res.ok) {
        setStatus(t("points.deleteFailed"));
        return;
      }
      setStatus(t("points.deleted"));
      await reload();
    } catch {
      setStatus(t("points.deleteFailed"));
    }
  };

  const topupAmount = Number(form.amountVnd) || 0;
  /** Moves the top-up by whole steps of 70.000đ, within [70k, 7M]. */
  const stepTopUp = (steps) =>
    setForm((f) => ({
      ...f,
      amountVnd: clampTopUp(
        (Number(f.amountVnd) || 0) + steps * TOPUP_STEP_VND,
      ),
    }));

  const columns = [
    {
      id: "teacher",
      header: t("points.colTeacher"),
      accessorFn: (r) => r.name || r.gmail,
      cell: ({ row }) => (
        <>
          <div className="student-name">{row.original.name || "—"}</div>
          <div className="cell-date">{row.original.gmail}</div>
        </>
      ),
    },
    {
      id: "balance",
      header: t("points.colPoint"),
      accessorFn: (r) => Number(r.balanceVnd) || 0,
      cell: ({ getValue }) => vnd(getValue()),
    },
    {
      id: "topUpCount",
      header: t("points.colTopUpCount"),
      accessorFn: (r) => Number(r.topUpCount) || 0,
    },
    {
      id: "lastTopUp",
      header: t("points.colLastTopUp"),
      accessorFn: (r) => r.lastTopUpAt || undefined,
      meta: { className: "cell-date" },
      cell: ({ row }) => formatDate(row.original.lastTopUpAt),
    },
    {
      id: "action",
      header: "",
      meta: { className: "cell-actions" },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="row-actions">
            <button
              className="btn-icon"
              title={t("points.topUp")}
              aria-label={t("points.topUp")}
              onClick={() => openTopUp(r)}
            >
              <i className="ti ti-coin" aria-hidden="true" />
            </button>
            <button
              className="btn-icon"
              title={t("points.editPoint")}
              aria-label={t("points.editPoint")}
              onClick={() => openEdit(r)}
            >
              <i className="ti ti-edit" aria-hidden="true" />
            </button>
            <button
              className="btn-icon"
              title={t("points.history")}
              aria-label={t("points.history")}
              onClick={() => openHistory(r)}
            >
              <i className="ti ti-history" aria-hidden="true" />
            </button>
            <button
              className="btn-icon danger"
              title={t("common.delete")}
              aria-label={t("common.delete")}
              onClick={() => handleDelete(r)}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </div>
        );
      },
    },
  ];

  // Top-up history (modal), newest first.
  const historyColumns = [
    {
      id: "time",
      header: t("points.hTime"),
      accessorFn: (h) => h.topUpAt || undefined,
      meta: { className: "cell-date" },
      cell: ({ row }) => formatDate(row.original.topUpAt),
    },
    {
      id: "credit",
      header: t("points.hAmount"),
      accessorFn: (h) => Number(h.creditVnd) || 0,
      cell: ({ row, getValue }) =>
        // Before VND a top-up bought points: say how many, too.
        row.original.points
          ? `${vnd(getValue())} (${t("points.hLegacyPoints", { n: row.original.points })})`
          : vnd(getValue()),
    },
    {
      id: "revenue",
      header: t("points.hRevenue"),
      accessorFn: (h) => Number(h.revenueVnd) || 0,
      cell: ({ getValue }) => vnd(getValue()),
    },
  ];

  return (
    <div className="page-wide">
      <div className="wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h2>
              {t("points.title")}{" "}
              <span className="count-badge">{records.length}</span>
            </h2>
            <p>
              {t("points.subtitle", {
                manual: vnd(PRICE_MANUAL_VND),
                auto: vnd(PRICE_AUTO_VND),
              })}
            </p>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="billing-panel">
          <div className="billing-item">
            <span className="billing-label">{t("points.totalTopUp")}</span>
            <span className="billing-value-row">
              <button
                type="button"
                className="billing-value billing-value-link"
                title={t("points.viewDetail")}
                onClick={() => setModal("billingDetail")}
              >
                {showTotal ? vnd(billing.totalTopUpVnd) : maskMoney()}
              </button>
              <button
                className="btn-icon"
                title={
                  showTotal ? t("points.hideTotal") : t("points.showTotal")
                }
                aria-label={
                  showTotal ? t("points.hideTotal") : t("points.showTotal")
                }
                onClick={() => setShowTotal((v) => !v)}
              >
                <i
                  className={showTotal ? "ti ti-eye-off" : "ti ti-eye"}
                  aria-hidden="true"
                />
              </button>
            </span>
          </div>
        </div>

        <div className="cache-search">
          <input
            type="text"
            placeholder={t("points.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
          >
            <option value="hasActive">{t("points.filterHasActive")}</option>
            <option value="noActive">{t("points.filterNoActive")}</option>
            <option value="all">{t("points.filterAll")}</option>
          </select>
        </div>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("points.loading")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-coins" aria-hidden="true" />
            <p>{t("points.empty")}</p>
          </div>
        ) : (
          <DataTable data={filtered} columns={columns} getRowId={(r) => r.id} />
        )}

        <div className="status-line">{status}</div>

        {/* Edit modal */}
        {modal === "edit" && active && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>
                  {t("points.editTitle", { who: active.name || active.gmail })}
                </h3>
              </div>
              <div className="field-group">
                <label htmlFor="balanceVnd">{t("points.pointLabel")}</label>
                <input
                  id="balanceVnd"
                  type="number"
                  min={0}
                  step={100}
                  value={form.balanceVnd}
                  onChange={(e) =>
                    setForm({ ...form, balanceVnd: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <p className="field-note">
                {t("points.balancePreview", {
                  balance: vnd(form.balanceVnd),
                })}
              </p>
              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleEdit}
                  disabled={saving}
                >
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
                <h3>
                  {t("points.topUpTitle", { who: active.name || active.gmail })}
                </h3>
              </div>
              {/* No free typing: the amount only moves in steps of 70.000đ
                  (− / + or a preset), so it cannot be mistyped. */}
              <div className="field-group">
                <span className="field-label" id="topup-amount-label">
                  {t("points.amountLabel", { step: vnd(TOPUP_STEP_VND) })}
                </span>
                <div
                  className="topup-stepper"
                  role="group"
                  aria-labelledby="topup-amount-label"
                >
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => stepTopUp(-1)}
                    disabled={saving || topupAmount <= TOPUP_STEP_VND}
                    aria-label={t("points.stepDown", {
                      step: vnd(TOPUP_STEP_VND),
                    })}
                    title={t("points.stepDown", { step: vnd(TOPUP_STEP_VND) })}
                  >
                    <i className="ti ti-minus" aria-hidden="true" />
                  </button>
                  <output className="topup-amount" aria-live="polite">
                    {vnd(topupAmount)}
                  </output>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => stepTopUp(1)}
                    disabled={saving || topupAmount >= TOPUP_MAX_VND}
                    aria-label={t("points.stepUp", {
                      step: vnd(TOPUP_STEP_VND),
                    })}
                    title={t("points.stepUp", { step: vnd(TOPUP_STEP_VND) })}
                    autoFocus
                  >
                    <i className="ti ti-plus" aria-hidden="true" />
                  </button>
                </div>
                <div className="topup-presets">
                  {TOPUP_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={amount === topupAmount ? "active" : ""}
                      aria-pressed={amount === topupAmount}
                      onClick={() => setForm({ ...form, amountVnd: amount })}
                      disabled={saving}
                    >
                      {vnd(amount)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="field-note">
                {t("points.amountHint", {
                  after: vnd((Number(active.balanceVnd) || 0) + topupAmount),
                  revenue: vnd(revenueOfTopUp(topupAmount)),
                  commission: vnd(topupAmount - revenueOfTopUp(topupAmount)),
                })}
              </p>
              {formError && (
                <div className="err" style={{ display: "block" }}>
                  {formError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleTopUp}
                  disabled={saving}
                >
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
                <h3>
                  {t("points.historyTitle", {
                    who: active.name || active.gmail,
                  })}
                </h3>
              </div>
              {active.topUpHistory.length === 0 ? (
                <p className="field-note">{t("points.noHistory")}</p>
              ) : (
                <DataTable
                  data={[...active.topUpHistory].reverse()}
                  columns={historyColumns}
                />
              )}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal}>
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revenue detail modal */}
        {modal === "billingDetail" && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-header">
                <h3>{t("points.detailTitle")}</h3>
              </div>
              <div className="billing-item">
                <span className="billing-label">{t("points.salerCost")}</span>
                <span className="billing-value">
                  {vnd(billing.totalCommissionVnd)}
                </span>
              </div>
              <div className="billing-item">
                <span className="billing-label">{t("points.netRevenue")}</span>
                <span className="billing-value">
                  {vnd(billing.totalTopUpVnd)}
                </span>
              </div>
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
