import { useEffect, useState } from "react";

import {
  fetchGradingSettings,
  saveClassRunTimes,
  saveGradingSettings,
} from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { PARTS, PART_ICONS, scheduleErrorText } from "../lib/autoGrade.js";

/** "12:00" → "11:59": the last minute a part's time may be. */
function lastMinute(to) {
  const [h, m] = String(to || "24:00")
    .split(":")
    .map(Number);
  const minutes = h * 60 + m - 1;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Admin only: when each part of the day is actually graded — the default for
 * every class, and this class's own times (empty = the default). Teachers
 * only pick days and parts; this is where the hours are kept out of peak
 * time. `schedule` is the class's saved schedule (or null);
 * `onSaved(schedule)` gets it back after this class's times change.
 */
export default function AutoGradeTimesAdmin({ classId, schedule, onSaved }) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [own, setOwn] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchGradingSettings()
      .then((result) => {
        if (cancelled) return;
        setSettings(result);
        setDefaults(result.runTimes || {});
      })
      .catch((err) => {
        if (!cancelled && err.message !== "RE-AUTH_NEEDED") {
          setError(scheduleErrorText(err, t));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  useEffect(() => {
    setOwn(schedule?.customRunTimes || {});
  }, [schedule]);

  // A class's own times need a saved schedule of days and parts.
  const classReady = Boolean(schedule?.enabled && schedule.runTimes);
  const usedParts = new Set((schedule?.slots || []).map((slot) => slot.part));

  const run = async (kind, action) => {
    setBusy(kind);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (err) {
      if (err.message !== "RE-AUTH_NEEDED") setError(scheduleErrorText(err, t));
    } finally {
      setBusy("");
    }
  };

  const saveDefaults = () =>
    run("defaults", async () => {
      const result = await saveGradingSettings(defaults);
      setDefaults(result.runTimes);
      setSettings((s) => ({ ...s, runTimes: result.runTimes }));
      setMessage(t("autoGrade.admin.savedDefaults", { n: result.classes }));
      // This class may have moved with the defaults.
      onSaved?.(null);
    });

  const saveOwn = () =>
    run("class", async () => {
      const body = Object.fromEntries(
        PARTS.filter((part) => own[part]).map((part) => [part, own[part]]),
      );
      const saved = await saveClassRunTimes(classId, body);
      setMessage(t("autoGrade.admin.savedClass"));
      onSaved?.(saved);
    });

  const range = (part) => settings?.parts?.[part];

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

      <div className="auto-grade-admin-grid" role="table">
        <div className="auto-grade-admin-row is-head" role="row">
          <span role="columnheader">{t("autoGrade.partLabel")}</span>
          <span role="columnheader">{t("autoGrade.admin.defaultCol")}</span>
          <span role="columnheader">{t("autoGrade.admin.classCol")}</span>
        </div>
        {PARTS.map((part) => {
          const r = range(part);
          const min = r?.from;
          const max = r ? lastMinute(r.to) : undefined;
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
                  {t(`autoGrade.part.${part}`)}
                  {r && (
                    <small>
                      {r.from}–{r.to}
                    </small>
                  )}
                </span>
              </span>
              <span role="cell">
                <input
                  type="time"
                  aria-label={`${t("autoGrade.admin.defaultCol")} · ${t(`autoGrade.part.${part}`)}`}
                  value={defaults[part] || ""}
                  min={min}
                  max={max}
                  onChange={(e) =>
                    setDefaults((d) => ({ ...d, [part]: e.target.value }))
                  }
                  disabled={!settings || Boolean(busy)}
                />
              </span>
              <span role="cell">
                <input
                  type="time"
                  aria-label={`${t("autoGrade.admin.classCol")} · ${t(`autoGrade.part.${part}`)}`}
                  value={own[part] || ""}
                  min={min}
                  max={max}
                  onChange={(e) =>
                    setOwn((o) => ({ ...o, [part]: e.target.value }))
                  }
                  disabled={!classReady || Boolean(busy)}
                />
              </span>
            </div>
          );
        })}
      </div>

      <div className="auto-grade-admin-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={saveDefaults}
          disabled={!settings || Boolean(busy)}
        >
          {busy === "defaults" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <i className="ti ti-world" aria-hidden="true" />
          )}{" "}
          {t("autoGrade.admin.saveDefaults")}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={saveOwn}
          disabled={!classReady || Boolean(busy)}
        >
          {busy === "class" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <i className="ti ti-school" aria-hidden="true" />
          )}{" "}
          {t("autoGrade.admin.saveClass")}
        </button>
      </div>

      <p className="field-note">
        {classReady
          ? t("autoGrade.admin.hint")
          : t("autoGrade.admin.classNotReady")}
      </p>
      {message && <p className="field-note auto-grade-admin-ok">{message}</p>}
      {error && <p className="field-note error-text">{error}</p>}
    </section>
  );
}
