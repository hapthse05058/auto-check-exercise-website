import TimeSelect from "./TimeSelect.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { PARTS, PART_ICONS, isPeakTime } from "../lib/autoGrade.js";

/**
 * Admin only: when each part of the day is actually graded — the default for
 * every class, and this class's own times (empty = the default). Teachers
 * only pick days and parts; this is where the hours are kept out of peak
 * time. The modal owns the values and saves them: `defaults` and `own` are
 * {part: "HH:mm"}, `onChange({defaults?, own?})` reports an edit, and
 * `onSaveDefaults` saves the defaults alone (they move every class).
 * `settings` is the backend's {runTimes, parts} (null while loading).
 */
export default function AutoGradeTimesAdmin({
  settings,
  defaults,
  own,
  usedParts,
  onChange,
  onSaveDefaults,
  busy,
  message,
  error,
}) {
  const { t } = useLanguage();
  const range = (part) => settings?.parts?.[part];
  const anyPeak = PARTS.some(
    (part) => isPeakTime(defaults[part]) || isPeakTime(own[part]),
  );

  return (
    <section
      className="auto-grade-admin"
      aria-label={t("autoGrade.admin.title")}
    >
      <header className="auto-grade-admin-head">
        <i className="ti ti-clock-cog" aria-hidden="true" />
        <span>{t("autoGrade.admin.title")}</span>
        <span className="auto-grade-admin-badge">Admin</span>
      </header>

      <p className="auto-grade-admin-peak-note">
        <i className="ti ti-info-circle" aria-hidden="true" />
        <span>{t("autoGrade.admin.peakNote")}</span>
      </p>

      <div className="auto-grade-admin-grid" role="table">
        <div className="auto-grade-admin-row is-head" role="row">
          <span role="columnheader">{t("autoGrade.partLabel")}</span>
          <span role="columnheader">{t("autoGrade.admin.defaultCol")}</span>
          <span role="columnheader">{t("autoGrade.admin.classCol")}</span>
        </div>
        {PARTS.map((part) => {
          const r = range(part);
          const partName = t(`autoGrade.part.${part}`);
          return (
            <div
              className={`auto-grade-admin-row${usedParts.has(part) ? " is-used" : ""}`}
              role="row"
              key={part}
            >
              <span className="auto-grade-admin-part" role="cell">
                <i
                  className={`ti ${PART_ICONS[part]}`}
                  data-part={part}
                  aria-hidden="true"
                />
                <span>
                  {partName}
                  {r && (
                    <small>
                      {r.from}–{r.to}
                    </small>
                  )}
                </span>
              </span>
              <span role="cell">
                <TimeSelect
                  ariaLabel={`${t("autoGrade.admin.defaultCol")} · ${partName}`}
                  minuteAriaLabel={`${t("autoGrade.admin.defaultCol")} · ${partName} · ${t("autoGrade.admin.minute")}`}
                  value={defaults[part] || ""}
                  from={r?.from}
                  to={r?.to}
                  markPeak
                  onChange={(v) =>
                    onChange({ defaults: { ...defaults, [part]: v } })
                  }
                  disabled={!settings || busy}
                />
              </span>
              <span role="cell">
                <TimeSelect
                  ariaLabel={`${t("autoGrade.admin.classCol")} · ${partName}`}
                  minuteAriaLabel={`${t("autoGrade.admin.classCol")} · ${partName} · ${t("autoGrade.admin.minute")}`}
                  value={own[part] || ""}
                  from={r?.from}
                  to={r?.to}
                  allowEmpty
                  markPeak
                  onChange={(v) => onChange({ own: { ...own, [part]: v } })}
                  disabled={!settings || busy}
                />
              </span>
            </div>
          );
        })}
      </div>

      {anyPeak && (
        <p className="field-note auto-grade-admin-peak-warn">
          <i className="ti ti-alert-triangle" aria-hidden="true" />{" "}
          {t("autoGrade.admin.peakWarn")}
        </p>
      )}

      <div className="auto-grade-admin-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={onSaveDefaults}
          disabled={!settings || busy}
        >
          <i className="ti ti-world" aria-hidden="true" />{" "}
          {t("autoGrade.admin.saveDefaults")}
        </button>
      </div>

      <p className="field-note">{t("autoGrade.admin.hint")}</p>
      {message && <p className="field-note auto-grade-admin-ok">{message}</p>}
      {error && <p className="field-note error-text">{error}</p>}
    </section>
  );
}
