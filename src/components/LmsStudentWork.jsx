import { useEffect, useMemo, useState } from "react";

import LmsQuestionTable from "./LmsQuestionTable.jsx";
import LmsReview from "./LmsReview.jsx";
import { fetchLmsStudentWork, saveLmsReview } from "../api/backend.js";
import { formatVnd } from "../lib/billing.js";
import { lmsErrorText, lmsSuggestedScore } from "../lib/lmsText.js";

const SCORES = [1, 2, 3, 4, 5];

/**
 * One student's work in one session, opened from the class overview or the
 * grading list. While the session is not marked on the LMS the teacher can
 * correct every review and Đúng/Sai, set the score and the overall comment,
 * then save a draft or press "Chấm xong" (the LMS's "Lưu & Chấm bài").
 *
 * `cell` (overview only) adds the multiple-choice scores the grading page
 * does not carry. `onSaved` lets the caller refresh its own view.
 */
export default function LmsStudentWork({
  classId,
  session,
  student,
  cell,
  config,
  t,
  onClose,
  onSaved,
}) {
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setWork(null);
    setError("");
    fetchLmsStudentWork(classId, session.id, student.studentId)
      .then((w) => !cancelled && setWork(w))
      .catch((err) => !cancelled && setError(lmsErrorText(err, t)));
    return () => {
      cancelled = true;
    };
  }, [classId, session.id, student.studentId, t, reload]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canEdit = Boolean(work?.editable && config?.writeEnabled);

  // Multiple-choice work is not on the grading page: its score is in the
  // session report only.
  const shownIds = new Set(
    (work?.assignments || []).map((a) => a.assignmentId),
  );
  const reportOnly = (cell?.assignments || []).filter(
    (a) => !shownIds.has(a.assignmentId),
  );

  return (
    <div
      className="modal-bg open"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal lms-work-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lms-work-title"
      >
        <div className="modal-header">
          <h3 id="lms-work-title">
            {student.fullName} · {session.name}
          </h3>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        {error && <div className="status-output error">{error}</div>}
        {!work && !error && (
          <p className="status-loading">
            <span className="spinner" aria-hidden="true" />
            <span>{t("lms.loading")}</span>
          </p>
        )}
        {work && (
          <>
            <p className="field-note lms-work-meta">
              {work.toolDraft && (
                <span className="lms-badge info">
                  {t("lms.overview.toolDraft")}
                </span>
              )}
              <a href={work.lmsUrl} target="_blank" rel="noopener noreferrer">
                <i className="ti ti-external-link" aria-hidden="true" />{" "}
                {t("lms.openLms")}
              </a>
            </p>
            {reportOnly.length > 0 && (
              <ul className="lms-work-report">
                {reportOnly.map((a) => (
                  <li key={a.assignmentId}>
                    <strong>{a.name}</strong>:{" "}
                    {a.mcq && a.status !== "notSubmitted"
                      ? t("lms.work.mcq")
                      : t(`lms.work.${a.status}`)}
                    {a.status !== "notSubmitted" && a.score !== null
                      ? ` · ${t("lms.overview.score")} ${a.score}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <WorkEditor
                key={`${work.answerHash}:${work.reviewHash}`}
                work={work}
                classId={classId}
                session={session}
                config={config}
                t={t}
                onSaved={(result) => {
                  onSaved?.(result);
                  setReload((n) => n + 1);
                }}
              />
            ) : (
              work.assignments.map((a) => (
                <WorkAssignment key={a.assignmentId} a={a} t={t} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Verdict({ ok }) {
  return (
    <span
      className={`lms-verdict ${ok ? "ok" : "bad"}`}
      aria-label={ok ? "Đúng" : "Sai"}
    >
      <i className={`ti ${ok ? "ti-check" : "ti-x"}`} aria-hidden="true" />
    </span>
  );
}

function AssignmentHead({ a, t }) {
  const answered = a.questions.filter((q) => q.answer).length;
  return (
    <p className="lms-assignment-name">
      {a.name}
      <span className={`lms-badge ${a.status === "graded" ? "ok" : ""}`}>
        {t(`lms.work.${a.status}`)}
        {a.status === "graded" && a.score !== null ? ` · ${a.score}/5` : ""}
      </span>
      <span className="lms-work-count">
        {t("lms.overview.answered", { answered, total: a.questions.length })}
      </span>
    </p>
  );
}

/** Read-only: marked work, or a teacher who cannot save. */
function WorkAssignment({ a, t }) {
  return (
    <div className="lms-table-wrap lms-work-assignment">
      <AssignmentHead a={a} t={t} />
      {a.review && (
        <p className="lms-overall">
          <strong>{t("lms.overall")}:</strong> <LmsReview text={a.review} />
        </p>
      )}
      {a.questions.length === 0 ? (
        <p className="field-note">{t("lms.overview.noQuestions")}</p>
      ) : (
        <LmsQuestionTable
          questions={a.questions}
          rowKey={(q) => q.id}
          t={t}
          prompt={(q) =>
            q.question || (q.hasMedia ? t("lms.overview.media") : "")
          }
          review={(q) => (
            <>
              {q.isCorrect !== null && (q.review || q.graded) && (
                <Verdict ok={q.isCorrect} />
              )}
              {q.review ? (
                <LmsReview text={q.review} />
              ) : (
                <span className="lms-q-skip">{t("lms.overview.noReview")}</span>
              )}
            </>
          )}
        />
      )}
    </div>
  );
}

/** A question nobody has marked yet shows neither Đúng nor Sai. */
const markOf = (q) => (q.review || q.graded ? q.isCorrect === true : null);

/** Starting values: the LMS's own, or the AI's not-yet-saved proposal. */
function initialState(work) {
  const proposal = work.proposal;
  const reviews = {};
  for (const a of work.assignments) {
    for (const q of a.questions) {
      if (!q.editable) continue;
      const p = proposal?.questions?.[q.key];
      reviews[q.key] = p
        ? { review: p.review, isCorrect: Boolean(p.isCorrect) }
        : { review: q.review || "", isCorrect: markOf(q) };
    }
  }
  const marked = work.assignments.find((a) => a.kind && a.score > 0);
  const firstReview = work.assignments.find((a) => a.review)?.review || "";
  return {
    reviews,
    score: proposal?.score || marked?.score || 0,
    overall: proposal ? proposal.overall : firstReview,
  };
}

function WorkEditor({ work, classId, session, config, t, onSaved }) {
  const start = useMemo(() => initialState(work), [work]);
  const [reviews, setReviews] = useState(start.reviews);
  const [score, setScore] = useState(start.score);
  const [overall, setOverall] = useState(start.overall);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState({ tone: "", text: "" });

  const original = useMemo(() => {
    const out = {};
    for (const a of work.assignments) {
      for (const q of a.questions) {
        if (q.editable) {
          out[q.key] = { review: q.review || "", isCorrect: markOf(q) };
        }
      }
    }
    return out;
  }, [work]);

  const suggestion = lmsSuggestedScore(
    work.assignments.flatMap((a) =>
      a.questions
        .filter((q) => q.counted)
        .map((q) => ({ isCorrect: reviews[q.key]?.isCorrect })),
    ),
  );

  const setReview = (key, patch) =>
    setReviews((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const submitAllowed = Boolean(config?.submitEnabled);
  const price = config?.unitPriceVnd ?? 800;

  const save = async (action) => {
    if (saving) return;
    if (action === "submit") {
      if (!(score >= 1)) {
        setMessage({ tone: "error", text: t("lms.edit.needScore") });
        return;
      }
      if (!window.confirm(t("lms.edit.confirmSubmit", { score }))) return;
    }
    const edits = Object.entries(reviews)
      .filter(
        ([key, v]) =>
          v.review !== original[key]?.review ||
          v.isCorrect !== original[key]?.isCorrect,
      )
      .map(([key, v]) => ({
        key,
        review: v.review,
        isCorrect: v.isCorrect === true,
      }));
    setSaving(action);
    setMessage({ tone: "", text: "" });
    try {
      const result = await saveLmsReview(classId, session.id, work.studentId, {
        action,
        answerHash: work.answerHash,
        reviewHash: work.reviewHash,
        edits,
        score: score || null,
        overall,
      });
      onSaved(result);
    } catch (err) {
      setMessage({ tone: "error", text: lmsErrorText(err, t) });
      setSaving("");
    }
  };

  return (
    <div className="lms-editor">
      {work.proposal && (
        <p className="lms-banner info">
          <i className="ti ti-sparkles" aria-hidden="true" />{" "}
          {t("lms.edit.proposal", { price: formatVnd(price) })}
        </p>
      )}
      {work.assignments.map((a) => (
        <div
          key={a.assignmentId}
          className="lms-table-wrap lms-work-assignment"
        >
          <AssignmentHead a={a} t={t} />
          {a.questions.length === 0 ? (
            <p className="field-note">{t("lms.overview.noQuestions")}</p>
          ) : (
            <LmsQuestionTable
              questions={a.questions}
              rowKey={(q) => q.id}
              t={t}
              prompt={(q) =>
                q.question || (q.hasMedia ? t("lms.overview.media") : "")
              }
              review={(q) => {
                const v = reviews[q.key];
                if (!v) return null;
                return (
                  <div className="lms-edit-cell">
                    <div
                      className="lms-toggle"
                      role="group"
                      aria-label={t("lms.edit.mark")}
                    >
                      {[true, false].map((ok) => (
                        <button
                          key={String(ok)}
                          type="button"
                          className={`lms-toggle-btn ${ok ? "ok" : "bad"}${
                            v.isCorrect === ok ? " active" : ""
                          }`}
                          aria-pressed={v.isCorrect === ok}
                          onClick={() => setReview(q.key, { isCorrect: ok })}
                          disabled={Boolean(saving)}
                        >
                          <i
                            className={`ti ${ok ? "ti-check" : "ti-x"}`}
                            aria-hidden="true"
                          />
                          {t(ok ? "lms.edit.right" : "lms.edit.wrong")}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="lms-edit-review"
                      rows={Math.min(
                        5,
                        Math.max(2, v.review.split("\n").length),
                      )}
                      value={v.review}
                      aria-label={t("lms.table.review")}
                      placeholder={t("lms.edit.reviewPlaceholder")}
                      onChange={(e) =>
                        setReview(q.key, { review: e.target.value })
                      }
                      disabled={Boolean(saving)}
                    />
                  </div>
                );
              }}
            />
          )}
        </div>
      ))}

      <div className="lms-edit-summary">
        <div className="field-group">
          <label htmlFor="lms-edit-score">{t("lms.edit.score")}</label>
          <select
            id="lms-edit-score"
            value={score || 0}
            onChange={(e) => setScore(Number(e.target.value))}
            disabled={Boolean(saving)}
          >
            <option value={0}>{t("lms.edit.pickScore")}</option>
            {SCORES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {suggestion && (
            <p className="field-note">
              {t("lms.edit.suggested", suggestion)}{" "}
              {suggestion.score !== score && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setScore(suggestion.score)}
                  disabled={Boolean(saving)}
                >
                  {t("lms.edit.useSuggested")}
                </button>
              )}
            </p>
          )}
        </div>
        <div className="field-group">
          <label htmlFor="lms-edit-overall">{t("lms.overall")}</label>
          <textarea
            id="lms-edit-overall"
            className="lms-edit-review"
            rows={3}
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
            disabled={Boolean(saving)}
          />
        </div>
      </div>

      <p className="field-note">
        <i className="ti ti-info-circle" aria-hidden="true" />{" "}
        {t("lms.edit.boldHint")}
      </p>
      {message.text && (
        <div
          className={`status-output${message.tone === "error" ? " error" : ""}`}
        >
          {message.text}
        </div>
      )}
      <div className="lms-edit-actions">
        <button
          type="button"
          className="secondary-btn with-icon"
          onClick={() => save("draft")}
          disabled={Boolean(saving)}
        >
          <i className="ti ti-device-floppy" aria-hidden="true" />
          {saving === "draft" ? t("lms.edit.saving") : t("lms.edit.saveDraft")}
        </button>
        {submitAllowed && (
          <button
            type="button"
            className="primary-btn with-icon"
            onClick={() => save("submit")}
            disabled={Boolean(saving)}
          >
            <i className="ti ti-circle-check" aria-hidden="true" />
            {saving === "submit" ? t("lms.edit.saving") : t("lms.edit.submit")}
          </button>
        )}
      </div>
      {!submitAllowed && (
        <p className="field-note">{t("lms.edit.submitOff")}</p>
      )}
    </div>
  );
}
