import { useEffect, useState } from "react";

import {
  fetchScheduleEstimate,
  previewGradingSchedule,
} from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { scheduleErrorText, validateDeadlines } from "../lib/autoGrade.js";
import {
  formatVn,
  fromVnInput,
  vnWeekTime,
  weekdayTime,
} from "../lib/scheduleTime.js";

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The two deadline pickers of a weekly grading schedule, with what they mean:
 * the weekly repeat, when the first grading would run (asked from the backend
 * when the class already exists) and whether the points look sufficient.
 *
 * `value` is {student, grader} as datetime-local strings in Vietnam time.
 */
export default function AutoGradeScheduleFields({
  classId = null,
  value,
  onChange,
  disabled = false,
}) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [estimate, setEstimate] = useState(null);

  const invalidKey = validateDeadlines(value);
  const s = fromVnInput(value.student);
  const g = fromVnInput(value.grader);

  // Ask the backend what these deadlines would schedule (side-effect free).
  useEffect(() => {
    setPreview(null);
    setPreviewError("");
    if (!classId || invalidKey) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewGradingSchedule(classId, {
        studentDeadlineAt: s,
        graderDeadlineAt: g,
      })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` only renders the error text
  }, [classId, s, g, invalidKey]);

  useEffect(() => {
    let cancelled = false;
    fetchScheduleEstimate(classId)
      .then((result) => !cancelled && setEstimate(result))
      .catch(() => !cancelled && setEstimate(null));
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const set = (field) => (event) =>
    onChange({ ...value, [field]: event.target.value });

  return (
    <>
      <div className="field-group">
        <label htmlFor="autoGradeStudent">
          {t("autoGrade.studentDeadline")}
          <span className="required-mark">*</span>
        </label>
        <input
          id="autoGradeStudent"
          type="datetime-local"
          value={value.student}
          onChange={set("student")}
          disabled={disabled}
        />
      </div>
      <div className="field-group">
        <label htmlFor="autoGradeGrader">
          {t("autoGrade.graderDeadline")}
          <span className="required-mark">*</span>
        </label>
        <input
          id="autoGradeGrader"
          type="datetime-local"
          value={value.grader}
          onChange={set("grader")}
          disabled={disabled}
        />
      </div>

      <div className="auto-grade-notes">
        {invalidKey ? (
          (value.student || value.grader) && (
            <p className="field-note error-text">
              {t(invalidKey, { minHours: 2 })}
            </p>
          )
        ) : (
          <p className="field-note">
            {t("autoGrade.repeats", {
              student: weekdayTime(vnWeekTime(s), t),
              grader: weekdayTime(vnWeekTime(g), t),
            })}
          </p>
        )}
        {preview?.next && (
          <p className="field-note">
            {t(
              preview.next.offPeak
                ? "autoGrade.firstRunOffPeak"
                : "autoGrade.firstRunPeak",
              {
                runAt: formatVn(preview.next.runAt),
                remindAt: formatVn(preview.next.remindAt),
              },
            )}
          </p>
        )}
        {!invalidKey && !classId && (
          <p className="field-note">{t("autoGrade.offPeakNote")}</p>
        )}
        {previewError && (
          <p className="field-note error-text">{previewError}</p>
        )}
        {estimate && (
          <p
            className={`field-note ${
              estimate.point < estimate.needMax ? "error-text" : ""
            }`}
          >
            {t(
              estimate.point < estimate.needMax
                ? "autoGrade.estimateShort"
                : "autoGrade.estimate",
              {
                need: estimate.needMax,
                point: estimate.point,
                classes: estimate.classes?.length ?? 0,
              },
            )}
          </p>
        )}
      </div>
    </>
  );
}
