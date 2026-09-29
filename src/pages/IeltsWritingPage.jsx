import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchAllClasses,
  fetchMyPoint,
  gradeIeltsWriting,
} from "../api/backend.js";
import { useAuth } from "../auth/AuthContext.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { isAdminEmail } from "../config.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  MAX_IMAGES,
  MIN_WORDS,
  TASKS,
  boldRuns,
  chartDataToPlain,
  compressImage,
  countWords,
  feedbackToHtml,
  feedbackToPlain,
  ieltsErrorText,
} from "../lib/ieltsWriting.js";
import { announcePoints } from "../lib/pointEvents.js";

/** One feedback text block: keeps line breaks, turns **x** into bold. */
function FeedbackText({ text }) {
  return (
    <div className="ielts-text">
      {String(text || "")
        .split("\n")
        .map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key -- lines of a text, never reordered
          <p key={i} className={line.trim() ? undefined : "ielts-gap"}>
            {boldRuns(line).map((run, j) =>
              // eslint-disable-next-line react/no-array-index-key -- runs of one line, never reordered
              run.bold ? <b key={j}>{run.text}</b> : run.text,
            )}
          </p>
        ))}
    </div>
  );
}

const formatBand = (band) =>
  Number.isInteger(band) ? band.toFixed(1) : String(band);

/**
 * "Chấm IELTS Writing": paste one submission (Task 1 with its chart, Task 2,
 * or a paragraph), grade it with the IELTS prompt, read the three-part
 * feedback and copy it into the student's doc. Separate from the Basic grading
 * screen — nothing here reads or writes a Google Doc.
 */
export default function IeltsWritingPage() {
  const { loadTeacherInfo } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [task, setTask] = useState("task2");
  const [prompt, setPrompt] = useState("");
  const [essay, setEssay] = useState("");
  const [images, setImages] = useState([]); // data URLs
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [copied, setCopied] = useState(false);

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
        // Admin only — the route is reachable by URL even though the menu
        // item is hidden. Teachers grade IELTS classes from /grade.
        if (!isAdminEmail(teacherInfo.gmail)) {
          navigate("/grade", { replace: true });
          return;
        }
        setIsAdmin(true);
        // The admin may pick a class: it bills that class's teacher.
        const list = await fetchAllClasses();
        if (!cancelled) setClasses(Array.isArray(list) ? list : []);
      } catch (err) {
        if (err.message !== "RE-AUTH_NEEDED")
          console.error("IELTS page load failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherInfo, navigate]);

  const words = countWords(essay);
  const minWords = MIN_WORDS[task];
  // Task 1 needs its chart; a paragraph may come with one (Intro/Overview or
  // sentences about a chart), so its numbers can be checked.
  const needsChart = task === "task1";
  const takesChart = task !== "task2";

  async function addImageFiles(files) {
    const list = [...files].filter((file) => /^image\//.test(file.type));
    if (!list.length) return;
    setError("");
    const room = MAX_IMAGES - images.length;
    if (list.length > room) {
      setError(t("ielts.error.too_many_images", { max: MAX_IMAGES }));
    }
    const added = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      try {
        added.push(await compressImage(file));
      } catch (err) {
        setError(ieltsErrorText(err, t));
      }
    }
    if (added.length) setImages((prev) => [...prev, ...added]);
  }

  // Ctrl+V a chart screenshot anywhere on the page.
  useEffect(() => {
    if (!takesChart) return undefined;
    const onPaste = (event) => {
      const files = [...(event.clipboardData?.files || [])];
      if (files.some((file) => /^image\//.test(file.type))) {
        event.preventDefault();
        addImageFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takesChart, images.length]);

  async function handleGrade() {
    setError("");
    setCopied(false);
    if (!prompt.trim()) return setError(t("ielts.error.prompt_required"));
    if (!essay.trim()) return setError(t("ielts.error.essay_required"));
    if (needsChart && !images.length) {
      return setError(t("ielts.error.chart_required"));
    }
    setGrading(true);
    setOutcome(null);
    try {
      const data = await gradeIeltsWriting({
        task,
        prompt,
        essay,
        images: takesChart ? images : [],
        classId: isAdmin ? classId : undefined,
      });
      setOutcome(data);
      try {
        announcePoints(await fetchMyPoint());
      } catch {
        // the badge refreshes on its own later
      }
    } catch (err) {
      if (err.message !== "RE-AUTH_NEEDED") setError(ieltsErrorText(err, t));
    } finally {
      setGrading(false);
    }
  }

  async function handleCopy() {
    if (!outcome) return;
    const html = feedbackToHtml(outcome.feedback);
    const plain = feedbackToPlain(outcome.feedback);
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
    } catch (err) {
      console.error("Copy failed:", err);
      setError(t("ielts.copyFailed"));
    }
  }

  const result = outcome?.result;

  if (!isAdmin) return null; // admin not confirmed yet → render nothing

  return (
    <div className="page-wide">
      <div className="wrap ielts-page">
        <div className="topbar">
          <div className="topbar-left">
            <h2>{t("ielts.title")}</h2>
            <p>{t("ielts.subtitle")}</p>
          </div>
        </div>

        <div className="form-panel ielts-form">
          <div className="ielts-tasks" role="radiogroup">
            {TASKS.map((key) => (
              <label
                key={key}
                className={`ielts-task${task === key ? " active" : ""}`}
              >
                <input
                  type="radio"
                  name="ielts-task"
                  value={key}
                  checked={task === key}
                  onChange={() => setTask(key)}
                />
                <span>{t(`ielts.task.${key}`)}</span>
              </label>
            ))}
          </div>

          {isAdmin && (
            <div className="form-field">
              <label>{t("ielts.classLabel")}</label>
              <SearchableSelect
                options={classes}
                value={classId}
                onChange={setClassId}
                disabled={grading}
                placeholder={t("ielts.classNone")}
                searchPlaceholder={t("common.searchClassPlaceholder")}
                noResultsText={t("common.noClassesFound")}
              />
              <small className="field-note">{t("ielts.classHint")}</small>
            </div>
          )}

          <div className="form-field">
            <label>
              {t("ielts.promptLabel")}
              <span className="required-star">*</span>
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t(`ielts.promptPlaceholder.${task}`)}
            />
          </div>

          {takesChart && (
            <div className="form-field">
              <label>
                {t("ielts.chartLabel", { max: MAX_IMAGES })}
                {needsChart && <span className="required-star">*</span>}
              </label>
              <div className="ielts-images">
                {images.map((src, i) => (
                  // eslint-disable-next-line react/no-array-index-key -- the same chart may be added twice; order is the upload order
                  <div key={i} className="ielts-image">
                    <img src={src} alt={t("ielts.chartAlt", { n: i + 1 })} />
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={t("common.delete")}
                      onClick={() =>
                        setImages((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <label className="ielts-image-add">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      onChange={(e) => {
                        addImageFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <i className="ti ti-photo-plus" aria-hidden="true" />
                    <span>{t("ielts.chartAdd")}</span>
                  </label>
                )}
              </div>
              <small className="field-note">
                {t(needsChart ? "ielts.chartHint" : "ielts.chartHintOptional")}
              </small>
            </div>
          )}

          <div className="form-field">
            <label>
              {t("ielts.essayLabel")}
              <span className="required-star">*</span>
            </label>
            <textarea
              rows={12}
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              placeholder={t("ielts.essayPlaceholder")}
            />
            <small
              className={`field-note${
                minWords && words && words < minWords ? " ielts-short" : ""
              }`}
            >
              {minWords
                ? t("ielts.wordCountMin", { n: words, min: minWords })
                : t("ielts.wordCount", { n: words })}
            </small>
          </div>

          {error && (
            <div className="err" style={{ display: "block" }}>
              {error}
            </div>
          )}

          <div className="action-row">
            <button
              className="btn-confirm"
              onClick={handleGrade}
              disabled={grading}
            >
              {grading ? t("ielts.grading") : t("ielts.grade")}
            </button>
          </div>
          {grading && (
            <div className="cache-loading">
              <span className="spinner" aria-hidden="true" />
              <span>{t("ielts.gradingHint")}</span>
            </div>
          )}
        </div>

        {result && (
          <div className="form-panel ielts-result">
            <div className="ielts-result-head">
              <div className="ielts-bands">
                {result.overall !== null && (
                  <span className="ielts-overall">
                    {t("ielts.overall")} {formatBand(result.overall)}
                  </span>
                )}
                {result.criteria.map((c) => (
                  <span key={c.key} className="ielts-band" title={c.name}>
                    {c.key} {c.band}
                  </span>
                ))}
              </div>
              <button className="btn-confirm" onClick={handleCopy}>
                <i className="ti ti-copy" aria-hidden="true" />{" "}
                {copied ? t("ielts.copied") : t("ielts.copy")}
              </button>
            </div>
            <p className="field-note">
              {t("ielts.meta", {
                words: result.wordCount,
                charged: outcome.charged,
                payer: outcome.payerName,
              })}
              {outcome.cached ? ` · ${t("ielts.fromCache")}` : ""}
            </p>
            {outcome.chartData && (
              <details className="ielts-chart">
                <summary>{t("ielts.chartData")}</summary>
                <p className="field-note">{t("ielts.chartDataHint")}</p>
                <pre>{chartDataToPlain(outcome.chartData)}</pre>
              </details>
            )}

            <h3>{t("ielts.section.corrected")}</h3>
            <FeedbackText text={result.corrected} />

            <h3>{t("ielts.section.improved")}</h3>
            <FeedbackText text={result.improved} />

            <h3>{t("ielts.section.comments")}</h3>
            <ul className="ielts-criteria">
              {result.criteria.map((c) => (
                <li key={c.key}>
                  <b>
                    {c.name} ({c.band}):
                  </b>{" "}
                  {c.comment}
                </li>
              ))}
            </ul>
            <p>
              <b>{t("ielts.general")}</b> {result.general}
            </p>
            <p>
              <b>{t("ielts.advice")}</b> {result.advice}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
