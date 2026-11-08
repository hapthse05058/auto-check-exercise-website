import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createLmsGradingJob,
  fetchLatestLmsGradingJob,
  fetchLmsAccount,
  fetchLmsClasses,
  fetchLmsGradingJob,
  fetchLmsPreview,
  fetchLmsSessions,
  fetchMyBalance,
  writeLmsDrafts,
} from "../api/backend.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { formatVnd } from "../lib/billing.js";
import { loadLmsConfig, useLmsConfig } from "../lib/lmsConfig.js";
import {
  LMS_WRITABLE,
  lmsErrorText,
  lmsStatusText,
  lmsStatusTone,
} from "../lib/lmsText.js";
import { announceBalance } from "../lib/pointEvents.js";
import { playSuccessSound } from "../lib/sound.js";
import "../styles/lms.css";

const POLL_MS = 4000;
/** List order: what the teacher can act on, then outcomes, then the rest. */
const STATUS_ORDER = {
  graded: 0,
  write_failed: 1,
  insufficient_points: 1,
  write_queued: 2,
  changed: 3,
  teacher_modified: 3,
  draft_saved: 4,
  teacher_graded: 5,
  skipped: 6,
};
const BUSY = new Set(["queued", "preparing", "writing"]);

/** "I **am** fine.\n(lý do)" → lines with the bold spans bold. */
function Review({ text }) {
  // Keys from position + content: the text never reorders.
  return String(text || "")
    .split("\n")
    .map((line, lineNo) => (
      // eslint-disable-next-line react/no-array-index-key -- static text, never reordered
      <span className="lms-review-line" key={`${lineNo}:${line}`}>
        {line.split(/(\*\*.+?\*\*)/g).map((part, partNo) => {
          const key = `${partNo}:${part}`;
          return /^\*\*.+\*\*$/.test(part) ? (
            <strong key={key}>{part.slice(2, -2)}</strong>
          ) : (
            <Fragment key={key}>{part}</Fragment>
          );
        })}
      </span>
    ));
}

function StudentDetail({ student, t }) {
  // One block per assignment (VIẾT CÂU, SẮP XẾP TỪ, CHÍNH TẢ), in LMS order.
  const blocks = [];
  for (const q of student.questions || []) {
    const name = q.assignmentName || "";
    if (!blocks.length || blocks.at(-1).name !== name) {
      blocks.push({ name, questions: [] });
    }
    blocks.at(-1).questions.push(q);
  }
  return (
    <div className="lms-detail">
      {student.overall && (
        <p className="lms-overall">
          <strong>{t("lms.overall")}:</strong> {student.overall}
        </p>
      )}
      {blocks.map((block) => (
        <QuestionTable key={block.name} block={block} t={t} />
      ))}
    </div>
  );
}

function QuestionTable({ block, t }) {
  const reused = block.questions.some((q) => q.reused);
  return (
    <div className="lms-table-wrap">
      {block.name && (
        <p className="lms-assignment-name">
          {block.name}
          {reused && <span className="lms-reused"> · {t("lms.reused")}</span>}
        </p>
      )}
      <table className="data-table lms-table">
        <tbody>
          {block.questions.map((q) => (
            <tr key={q.key} className={`lms-q ${q.cls}`}>
              <td className="lms-q-no">{q.serialNumber}</td>
              <td className="lms-q-text">
                {q.section && (
                  <span className="lms-q-section">{q.section}</span>
                )}
                {q.question}
              </td>
              <td className="lms-q-answer">{q.answer || "—"}</td>
              <td className="lms-q-review">
                {q.review !== undefined && !q.blank ? (
                  <>
                    <span
                      className={`lms-verdict ${q.isCorrect ? "ok" : "bad"}`}
                      aria-label={q.isCorrect ? "Đúng" : "Sai"}
                    >
                      <i
                        className={`ti ${q.isCorrect ? "ti-check" : "ti-x"}`}
                        aria-hidden="true"
                      />
                    </span>
                    <Review text={q.review} />
                  </>
                ) : (
                  <span className="lms-q-skip">{t(`lms.cls.${q.cls}`)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Grading a KTN session on the SEC LMS (backend lib/lmsGradingJobs.js):
 * preview the AI grading of "BÀI TẬP VIẾT CÂU", pick students, save drafts.
 * Nothing reaches students until the teacher presses Nộp on the LMS.
 */
export default function LmsGradePage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const config = useLmsConfig();
  const [account, setAccount] = useState(null);
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(null);
  const [showNotSubmitted, setShowNotSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [balanceVnd, setBalanceVnd] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const sessionReq = useRef(0);
  const pollRef = useRef(null);
  const lastStatusRef = useRef(null);

  // The teacher's balance, here and in the header badge.
  const refreshBalance = useCallback(async () => {
    try {
      const vnd = await fetchMyBalance();
      setBalanceVnd(vnd);
      announceBalance(vnd);
    } catch {
      // The page works without it; the header keeps its own copy.
    }
  }, []);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const showError = useCallback(
    (err) => setMessage({ tone: "error", text: lmsErrorText(err, t) }),
    [t],
  );

  const applyJob = useCallback((data) => {
    setJob(data?.job || null);
    setStudents(data?.students || []);
  }, []);

  // Account, then the teacher's KTN classes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await fetchLmsAccount();
        if (cancelled) return;
        setAccount(a);
        if (!a.linked || a.status !== "ok") return;
        const list = await fetchLmsClasses();
        if (cancelled) return;
        setClasses(list);
        if (list.length === 1) setClassId(String(list[0].id));
      } catch (err) {
        if (!cancelled) {
          setAccount((a) => a || { linked: false });
          showError(err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showError]);

  // Sessions of the chosen class; the latest one already held is preselected.
  useEffect(() => {
    if (!classId) return undefined;
    let cancelled = false;
    setSessions([]);
    setSessionId("");
    setSessionsLoading(true);
    fetchLmsSessions(classId)
      .then((list) => {
        if (cancelled) return;
        setSessions(list);
        const held = list.filter((s) => s.started);
        if (held.length) setSessionId(String(held.at(-1).id));
      })
      .catch((err) => !cancelled && showError(err))
      .finally(() => !cancelled && setSessionsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [classId, showError]);

  // Counts + the last job of the chosen session.
  const loadSession = useCallback(async () => {
    const req = ++sessionReq.current;
    setPreview(null);
    applyJob(null);
    setSelected(new Set());
    setExpanded(null);
    setMessage({ tone: "", text: "" });
    if (!classId || !sessionId) return;
    try {
      const [p, latest] = await Promise.all([
        fetchLmsPreview(classId, sessionId),
        fetchLatestLmsGradingJob(classId, sessionId),
      ]);
      if (req !== sessionReq.current) return;
      setPreview(p);
      applyJob(latest);
    } catch (err) {
      if (req === sessionReq.current) showError(err);
    }
  }, [classId, sessionId, applyJob, showError]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // A run that just finished (grading or saving drafts) chimes, and saving
  // drafts changes the balance. A job already done when the page opened is
  // not a finish.
  useEffect(() => {
    const prev = lastStatusRef.current;
    lastStatusRef.current = job ? `${job.id}:${job.status}` : null;
    if (!job || !prev || !prev.startsWith(`${job.id}:`)) return;
    const wasBusy = BUSY.has(prev.slice(job.id.length + 1));
    if (wasBusy && !BUSY.has(job.status)) {
      if (job.status !== "failed") playSuccessSound();
      refreshBalance();
    }
  }, [job, refreshBalance]);

  // Poll while the job is busy.
  useEffect(() => {
    clearTimeout(pollRef.current);
    if (!job || !BUSY.has(job.status)) return undefined;
    pollRef.current = setTimeout(async () => {
      try {
        applyJob(await fetchLmsGradingJob(job.id));
      } catch (err) {
        showError(err);
      }
    }, POLL_MS);
    return () => clearTimeout(pollRef.current);
  }, [job, applyJob, showError]);

  // A finished write round leaves nothing selected that was just saved.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(
        [...prev].filter((id) =>
          LMS_WRITABLE.has(students.find((s) => s.studentId === id)?.status),
        ),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [students]);

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    setMessage({ tone: "", text: "" });
    try {
      const { jobId } = await createLmsGradingJob(classId, sessionId);
      applyJob(await fetchLmsGradingJob(jobId));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const writable = students.filter((s) => LMS_WRITABLE.has(s.status));
  const writeEnabled = Boolean(job?.writeEnabled ?? config?.writeEnabled);
  const price = job?.unitPriceVnd ?? config?.unitPriceVnd ?? 800;

  const handleSave = async () => {
    const ids = [...selected];
    if (busy || !ids.length || !job) return;
    const ok = window.confirm(
      t("lms.confirmSave", {
        n: ids.length,
        price: formatVnd(price),
        total: formatVnd(ids.length * price),
      }),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await writeLmsDrafts(job.id, ids);
      setMessage({ tone: "info", text: t("lms.writeQueued", { n: r.queued }) });
      applyJob(await fetchLmsGradingJob(job.id));
      loadLmsConfig({ refresh: true });
    } catch (err) {
      showError(err);
      if (err.message === "job_superseded") loadSession();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected =
    writable.length > 0 && writable.every((s) => selected.has(s.studentId));

  if (account && (!account.linked || account.status !== "ok")) {
    return (
      <div className="page-wide lms-page">
        <h2 className="page-title">{t("lms.gradeTitle")}</h2>
        <div className="empty-state">
          <p>{t(account.linked ? "lms.needsRelogin" : "lms.notLinked")}</p>
          <button
            className="primary-btn with-icon"
            onClick={() => navigate("/settings/lms")}
          >
            <i className="ti ti-plug-connected" aria-hidden="true" />
            {t("lms.goLink")}
          </button>
        </div>
        {message.text && (
          <div className="status-output error">{message.text}</div>
        )}
      </div>
    );
  }

  const graded = students.filter((s) => s.status === "graded").length;
  const saved = students.filter((s) => s.status === "draft_saved").length;
  const jobBusy = job && BUSY.has(job.status);
  // Work to act on first; students who have not submitted folded away.
  const notSubmitted = students.filter((s) => s.reason === "notSubmitted");
  const shown = students
    .filter((s) => showNotSubmitted || s.reason !== "notSubmitted")
    .map((s, i) => [STATUS_ORDER[s.status] ?? 9, i, s])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, , s]) => s);

  return (
    <div className="page-wide lms-page">
      <h2 className="page-title">{t("lms.gradeTitle")}</h2>
      <p className="field-hint">
        <i className="ti ti-info-circle" aria-hidden="true" />
        {t("lms.gradeIntro")}
      </p>

      <div className="lms-pickers">
        <div className="field-group">
          <label htmlFor="lms-class">{t("lms.selectClass")}</label>
          <select
            id="lms-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={!classes || busy}
          >
            <option value="">
              {classes ? t("lms.selectClass") : t("lms.loading")}
            </option>
            {(classes || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.courseName}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="lms-session">{t("lms.selectSession")}</label>
          <select
            id="lms-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={!sessions.length || busy}
          >
            <option value="">{t("lms.selectSession")}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.started}>
                {s.name} {s.started ? "" : t("lms.sessionNotStarted")}
              </option>
            ))}
          </select>
        </div>
      </div>
      {classes && classes.length === 0 && (
        <p className="field-hint">{t("lms.noClasses")}</p>
      )}
      {(!account ||
        !classes ||
        sessionsLoading ||
        (classId && sessionId && !preview && !message.text)) && (
        <p className="status-loading">
          <span className="spinner" aria-hidden="true" />
          <span>{t("lms.loading")}</span>
        </p>
      )}

      {preview && (
        <div className="lms-preview">
          <p>{t("lms.preview", preview.counts)}</p>
          <p className="field-note">
            {t("lms.estimate", {
              n: preview.counts.candidate,
              price: formatVnd(preview.unitPriceVnd),
              total: formatVnd(preview.estimatedVnd),
            })}
          </p>
          {balanceVnd !== null && (
            <p className="field-note lms-balance">
              <i className="ti ti-wallet" aria-hidden="true" />{" "}
              {t("lms.balance", { balance: formatVnd(balanceVnd) })}
            </p>
          )}
          <div className="button-row">
            <button
              className="primary-btn with-icon"
              onClick={handleStart}
              disabled={busy || jobBusy || !preview.counts.candidate}
            >
              <i className="ti ti-player-play" aria-hidden="true" />
              {busy && !job
                ? t("lms.starting")
                : job
                  ? t("lms.regrade")
                  : t("lms.start")}
            </button>
          </div>
        </div>
      )}

      {jobBusy && (
        <p className="status-loading">
          <span className="spinner" aria-hidden="true" />
          <span>
            {job.status === "writing" ? t("lms.writing") : t("lms.grading")}
          </span>
        </p>
      )}
      {job?.status === "failed" && (
        <div className="status-output error">
          {lmsErrorText(new Error(job.error), t)}
        </div>
      )}

      {students.length > 0 && (
        <section className="lms-results">
          <p className="lms-summary">
            {t("lms.summary", {
              graded,
              saved,
              other: students.length - graded - saved,
            })}
          </p>
          <p className="field-note">
            <i className="ti ti-shield-check" aria-hidden="true" />{" "}
            {t("lms.draftNote")}
          </p>
          {!writeEnabled && (
            <p className="lms-banner warn">
              <i className="ti ti-lock" aria-hidden="true" />{" "}
              {t("lms.writeDisabled")}
            </p>
          )}
          {writeEnabled && writable.length > 0 && (
            <div className="lms-actions">
              <label className="lms-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set(writable.map((s) => s.studentId)),
                    )
                  }
                  disabled={busy || jobBusy}
                />
                {t("lms.selectAll")}
              </label>
              <button
                className="primary-btn with-icon"
                onClick={handleSave}
                disabled={busy || jobBusy || selected.size === 0}
              >
                <i className="ti ti-cloud-upload" aria-hidden="true" />
                {t("lms.saveDrafts", { n: selected.size })}
              </button>
            </div>
          )}

          <ul className="lms-students">
            {shown.map((s) => {
              const canSelect =
                writeEnabled && LMS_WRITABLE.has(s.status) && !jobBusy;
              const open = expanded === s.studentId;
              return (
                <li key={s.studentId} className="lms-student">
                  <div className="lms-student-head">
                    <input
                      type="checkbox"
                      aria-label={s.fullName}
                      checked={selected.has(s.studentId)}
                      onChange={() => toggle(s.studentId)}
                      disabled={!canSelect || busy}
                    />
                    <div className="lms-student-main">
                      <p className="lms-student-name">{s.fullName}</p>
                      {s.counted ? (
                        <p className="lms-student-score">
                          {t("lms.scoreLine", {
                            correct: s.correct,
                            counted: s.counted,
                            score: s.score,
                          })}
                        </p>
                      ) : null}
                      {s.counts && (
                        <p className="field-note">
                          {t("lms.counts", s.counts)}
                        </p>
                      )}
                    </div>
                    <span className={`lms-badge ${lmsStatusTone(s.status)}`}>
                      {lmsStatusText(s, t)}
                    </span>
                    <div className="lms-student-links">
                      {s.questions && (
                        <button
                          className="secondary-btn"
                          onClick={() => setExpanded(open ? null : s.studentId)}
                          aria-expanded={open}
                        >
                          {open ? t("lms.hideDetail") : t("lms.showDetail")}
                        </button>
                      )}
                      <a
                        className="secondary-btn"
                        href={s.lmsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("lms.openLms")}
                      </a>
                    </div>
                  </div>
                  {open && <StudentDetail student={s} t={t} />}
                </li>
              );
            })}
          </ul>
          {notSubmitted.length > 0 && (
            <button
              className="secondary-btn lms-fold"
              onClick={() => setShowNotSubmitted((v) => !v)}
              aria-expanded={showNotSubmitted}
            >
              {t(
                showNotSubmitted
                  ? "lms.hideNotSubmitted"
                  : "lms.showNotSubmitted",
                {
                  n: notSubmitted.length,
                },
              )}
            </button>
          )}
        </section>
      )}

      {message.text && (
        <div
          className={`status-output${message.tone === "error" ? " error" : ""}`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
