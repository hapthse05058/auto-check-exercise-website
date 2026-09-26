import { useEffect, useState } from "react";

import AutoGradeScheduleFields from "./AutoGradeScheduleFields.jsx";
import {
  deleteGradingSchedule,
  fetchGradingSchedule,
  saveGradingSchedule,
} from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  lastRunText,
  scheduleErrorText,
  scheduleToValue,
  validateDeadlines,
} from "../lib/autoGrade.js";
import { formatVn, fromVnInput } from "../lib/scheduleTime.js";

/**
 * Set up, change or switch off a class's weekly auto-grading.
 * `onSaved(schedule | null)` is called after a save (null after switching off).
 */
export default function AutoGradeScheduleModal({ cls, onClose, onSaved }) {
  const { t } = useLanguage();
  const [schedule, setSchedule] = useState(null);
  const [value, setValue] = useState({ student: "", grader: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGradingSchedule(cls.id)
      .then((result) => {
        if (cancelled) return;
        setSchedule(result);
        setValue(scheduleToValue(result?.enabled ? result : null));
      })
      .catch((err) => {
        if (!cancelled && err.message !== "RE-AUTH_NEEDED") {
          setError(scheduleErrorText(err, t));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per class
  }, [cls.id]);

  const handleSave = async () => {
    const invalid = validateDeadlines(value);
    if (invalid) {
      setError(t(invalid, { minHours: 2 }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveGradingSchedule(cls.id, {
        studentDeadlineAt: fromVnInput(value.student),
        graderDeadlineAt: fromVnInput(value.grader),
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err.message !== "RE-AUTH_NEEDED") setError(scheduleErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!window.confirm(t("autoGrade.disableConfirm", { class: cls.name }))) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteGradingSchedule(cls.id);
      onSaved?.(null);
      onClose();
    } catch (err) {
      if (err.message !== "RE-AUTH_NEEDED") setError(scheduleErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const enabled = Boolean(schedule?.enabled);

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="modal-header">
          <h3>{t("autoGrade.modalTitle", { class: cls.name })}</h3>
        </div>
        <p className="field-note auto-grade-intro">{t("autoGrade.intro")}</p>

        {loading ? (
          <div className="cache-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("autoGrade.loading")}</span>
          </div>
        ) : (
          <>
            {enabled && schedule.next && (
              <p className="auto-grade-status">
                {t("autoGrade.nextRun", {
                  runAt: formatVn(schedule.next.runAt),
                  remindAt: formatVn(schedule.next.remindAt),
                })}
              </p>
            )}
            {schedule?.lastRun && (
              <p className="field-note">
                {t("autoGrade.lastRun")} {lastRunText(schedule.lastRun, t)}
              </p>
            )}
            <AutoGradeScheduleFields
              classId={cls.id}
              value={value}
              onChange={setValue}
              disabled={busy}
            />
          </>
        )}

        {error && (
          <div className="err" style={{ display: "block" }}>
            {error}
          </div>
        )}
        <div className="modal-footer">
          {enabled && (
            <button
              className="btn-cancel btn-text-danger"
              onClick={handleDisable}
              disabled={busy}
            >
              {t("autoGrade.disable")}
            </button>
          )}
          <button className="btn-cancel" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-confirm"
            onClick={handleSave}
            disabled={busy || loading}
          >
            {enabled ? t("autoGrade.update") : t("autoGrade.enable")}
          </button>
        </div>
      </div>
    </div>
  );
}
