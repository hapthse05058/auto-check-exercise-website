import { useEffect, useState } from "react";

import {
  fetchScheduleEstimate,
  previewGradingSchedule,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  MAX_SLOTS,
  PARTS,
  PART_ICONS,
  nextSlotAfter,
  partDay,
  scheduleErrorText,
  slotsToBody,
  validateSlot,
  validateSlots,
  weekdayOf,
} from "../lib/autoGrade.js";
import { formatVn } from "../lib/scheduleTime.js";

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The weekly slots of a grading schedule — the days the class is graded on,
 * each in the morning, afternoon or evening (the admin sets each part's
 * time) — with what they mean: each slot's weekly repeat, when the first
 * grading would run (asked from the backend when the class already exists)
 * and whether the points look sufficient.
 *
 * `value` is [{id, date: "YYYY-MM-DD", part}]; `runTimes` ({part: "HH:mm"},
 * optional) the class's times, shown next to each part.
 */
export default function AutoGradeScheduleFields({
  classId = null,
  value,
  onChange,
  disabled = false,
  runTimes = null,
}) {
  const { t } = useLanguage();
  const { teacherInfo } = useAuth();
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [estimate, setEstimate] = useState(null);

  const invalid = validateSlots(value);
  // Stable dependency for the preview: the days and parts, and the times (an
  // admin may change them with the form open).
  const slotsKey = invalid
    ? ""
    : `${value.map((s) => `${s.date}.${s.part}`).join(",")}@${JSON.stringify(runTimes || {})}`;

  // Ask the backend what these slots would schedule (side-effect free).
  useEffect(() => {
    setPreview(null);
    setPreviewError("");
    if (!classId || !slotsKey) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewGradingSchedule(classId, slotsToBody(value))
        .then((result) => !cancelled && setPreview(result))
        .catch((error) => {
          if (cancelled || error.message === "RE-AUTH_NEEDED") return;
          setPreviewError(scheduleErrorText(error, t));
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `slotsKey` stands for `value`; `t` only renders the error text
  }, [classId, slotsKey]);

  useEffect(() => {
    let cancelled = false;
    fetchScheduleEstimate(classId)
      .then((result) => !cancelled && setEstimate(result))
      .catch(() => !cancelled && setEstimate(null));
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Short: the balance cannot cover every scheduled class at full
  // attendance — or there is nothing at all, which cancels even the first run.
  const short =
    estimate && (estimate.point <= 0 || estimate.point < estimate.needMax);
  // An admin sets schedules for other teachers: name whose balance it is.
  const payerName =
    isAdminEmail(teacherInfo?.gmail) && estimate?.teacherName
      ? estimate.teacherName
      : null;

  const setField = (index, field) => (event) =>
    onChange(
      value.map((slot, i) =>
        i === index ? { ...slot, [field]: event.target.value } : slot,
      ),
    );
  const addSlot = () => onChange([...value, nextSlotAfter(value.at(-1))]);
  const removeSlot = (index) => onChange(value.filter((_, i) => i !== index));

  // Only show the form's own errors once the teacher has picked a date.
  const touched = value.some((slot) => slot.date);
  const sameDay = invalid?.key === "autoGrade.error.slots_same_day";
  const setPart = (index, part) =>
    onChange(value.map((slot, i) => (i === index ? { ...slot, part } : slot)));

  return (
    <>
      {short && (
        <div className="auto-grade-alert" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <div>
            <strong>{t("autoGrade.pointsShortTitle")}</strong>
            <p>
              {t(
                estimate.needMax > 0
                  ? "autoGrade.pointsShortBody"
                  : "autoGrade.pointsEmptyBody",
                {
                  need: estimate.needMax,
                  point: estimate.point,
                  missing: Math.max(0, estimate.needMax - estimate.point),
                  classes: estimate.classes?.length ?? 0,
                  who: payerName || t("autoGrade.pointsYou"),
                },
              )}
            </p>
          </div>
        </div>
      )}

      {value.map((slot, index) => {
        const slotError = validateSlot(slot);
        return (
          <fieldset className="auto-grade-slot" key={slot.id}>
            <legend className="auto-grade-slot-head">
              <span>
                {value.length > 1
                  ? t("autoGrade.slotTitle", { n: index + 1 })
                  : t("autoGrade.slotSingle")}
              </span>
              {value.length > 1 && (
                <button
                  type="button"
                  className="btn-icon"
                  title={t("autoGrade.removeSlot")}
                  aria-label={t("autoGrade.removeSlot")}
                  onClick={() => removeSlot(index)}
                  disabled={disabled}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              )}
            </legend>
            <div className="auto-grade-slot-fields">
              <div className="field-group">
                <label htmlFor={`autoGradeDate-${index}`}>
                  {t("autoGrade.dateLabel")}
                  <span className="required-mark">*</span>
                </label>
                <input
                  id={`autoGradeDate-${index}`}
                  type="date"
                  value={slot.date}
                  onChange={setField(index, "date")}
                  disabled={disabled}
                />
              </div>
              <div className="field-group">
                <span className="field-label" id={`autoGradePart-${index}`}>
                  {t("autoGrade.partLabel")}
                  <span className="required-mark">*</span>
                </span>
                <div
                  className="part-toggle"
                  role="radiogroup"
                  aria-labelledby={`autoGradePart-${index}`}
                >
                  {PARTS.map((part) => (
                    <button
                      key={part}
                      type="button"
                      role="radio"
                      data-part={part}
                      aria-checked={slot.part === part}
                      className={slot.part === part ? "active" : ""}
                      onClick={() => setPart(index, part)}
                      disabled={disabled}
                    >
                      <i
                        className={`ti ${PART_ICONS[part]}`}
                        aria-hidden="true"
                      />
                      <span className="part-toggle-name">
                        {t(`autoGrade.part.${part}`)}
                      </span>
                      {runTimes?.[part] && (
                        <span className="part-toggle-time">
                          {runTimes[part]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {slotError ? (
              slot.date && (
                <p className="field-note error-text">{t(slotError)}</p>
              )
            ) : (
              <p className="field-note">
                {t("autoGrade.repeats", {
                  when: partDay(slot.part, weekdayOf(slot.date), t),
                })}
              </p>
            )}
          </fieldset>
        );
      })}

      <button
        type="button"
        className="secondary-btn auto-grade-add"
        onClick={addSlot}
        disabled={disabled || value.length >= MAX_SLOTS}
      >
        <i className="ti ti-plus" aria-hidden="true" /> {t("autoGrade.addSlot")}
      </button>

      <div className="auto-grade-notes">
        {sameDay && touched && (
          <p className="field-note error-text">
            {t(invalid.key, invalid.params)}
          </p>
        )}
        {!invalid && preview?.next && (
          <p className="field-note">
            {t("autoGrade.firstRun", {
              runAt: formatVn(preview.next.runAt),
              remindAt: formatVn(preview.next.remindAt),
            })}
          </p>
        )}
        <p className="field-note">{t("autoGrade.timeNote")}</p>
        {previewError && (
          <p className="field-note error-text">{previewError}</p>
        )}
        {estimate && !short && (
          <p className="field-note">
            {t("autoGrade.estimate", {
              need: estimate.needMax,
              point: estimate.point,
              classes: estimate.classes?.length ?? 0,
            })}
          </p>
        )}
      </div>
    </>
  );
}
