import { useCallback, useEffect, useState } from "react";

import LmsQuestionTable from "./LmsQuestionTable.jsx";
import LmsReview from "./LmsReview.jsx";
import { fetchLmsOverview, fetchLmsStudentWork } from "../api/backend.js";
import { lmsCellState as cellState, lmsErrorText } from "../lib/lmsText.js";

const STATE_ICON = {
  none: "ti-minus",
  pending: "ti-clock",
  draft: "ti-pencil",
  mcqOnly: "ti-list-check",
  graded: "ti-circle-check",
};

function cellTitle(cell, t) {
  return (cell?.assignments || [])
    .map(
      (a) =>
        `${a.name}: ${t(a.mcq && a.status !== "notSubmitted" ? "lms.work.mcq" : `lms.work.${a.status}`)}` +
        ((a.status === "graded" || a.mcq) &&
        a.status !== "notSubmitted" &&
        a.score !== null
          ? ` (${a.score})`
          : ""),
    )
    .join("\n");
}

/** Read-only class view: students × held sessions; a cell opens the work. */
export default function LmsClassOverview({ classId, t }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // {session, student, cell}

  const load = useCallback(async () => {
    setData(null);
    setError("");
    try {
      setData(await fetchLmsOverview(classId));
    } catch (err) {
      setError(lmsErrorText(err, t));
    }
  }, [classId, t]);

  useEffect(() => {
    if (classId) load();
  }, [classId, load]);

  if (error) {
    return (
      <div className="status-output error">
        {error}{" "}
        <button type="button" className="link-btn" onClick={load}>
          {t("lms.overview.retry")}
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="status-loading">
        <span className="spinner" aria-hidden="true" />
        <span>{t("lms.overview.loading")}</span>
      </p>
    );
  }
  if (!data.sessions.length) {
    return <p className="field-hint">{t("lms.overview.noSessions")}</p>;
  }

  const handedInCount = (sessionId) =>
    data.students.filter(
      (st) =>
        cellState(data.cells[String(sessionId)]?.[st.studentId]).state !==
        "none",
    ).length;

  return (
    <section className="lms-overview">
      <div className="lms-overview-head">
        <ul className="lms-legend" aria-label={t("lms.overview.legend")}>
          {["none", "mcqOnly", "pending", "draft", "graded"].map((s) => (
            <li key={s} className={`lms-cell ${s}`}>
              <i className={`ti ${STATE_ICON[s]}`} aria-hidden="true" />
              {t(`lms.overview.state.${s}`)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="secondary-btn with-icon"
          onClick={load}
        >
          <i className="ti ti-refresh" aria-hidden="true" />
          {t("lms.overview.refresh")}
        </button>
      </div>
      <div className="lms-overview-scroll">
        <table className="data-table lms-overview-table">
          <thead>
            <tr>
              <th scope="col" className="lms-ov-name">
                {t("lms.overview.student")}
              </th>
              {data.sessions.map((s) => (
                <th scope="col" key={s.id}>
                  {s.name.replace(/^Buổi học\s*/i, "B")}
                </th>
              ))}
              <th scope="col">{t("lms.overview.handedIn")}</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((st) => {
              let handed = 0;
              return (
                <tr key={st.studentId}>
                  <th scope="row" className="lms-ov-name">
                    {st.fullName}
                  </th>
                  {data.sessions.map((s) => {
                    const cell = data.cells[String(s.id)]?.[st.studentId];
                    const c = cellState(cell);
                    if (c.state !== "none") handed += 1;
                    return (
                      <td key={s.id}>
                        <button
                          type="button"
                          className={`lms-cell ${c.state}`}
                          title={cellTitle(cell, t)}
                          disabled={c.state === "none"}
                          onClick={() =>
                            setOpen({ session: s, student: st, cell })
                          }
                        >
                          <i
                            className={`ti ${STATE_ICON[c.state]}`}
                            aria-hidden="true"
                          />
                          {c.state === "none" ? (
                            <span className="sr-only">
                              {t("lms.overview.state.none")}
                            </span>
                          ) : (
                            <span>
                              {c.score !== null
                                ? c.score
                                : `${c.handedIn}/${c.total}`}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="lms-ov-total">
                    {handed}/{data.sessions.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="lms-ov-name">
                {t("lms.overview.perSession")}
              </th>
              {data.sessions.map((s) => (
                <td key={s.id} className="lms-ov-total">
                  {handedInCount(s.id)}/{data.students.length}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {open && (
        <StudentWorkModal
          classId={classId}
          {...open}
          t={t}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function StudentWorkModal({ classId, session, student, cell, t, onClose }) {
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchLmsStudentWork(classId, session.id, student.studentId)
      .then((w) => !cancelled && setWork(w))
      .catch((err) => !cancelled && setError(lmsErrorText(err, t)));
    return () => {
      cancelled = true;
    };
  }, [classId, session.id, student.studentId, t]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            {work.assignments.map((a) => (
              <WorkAssignment key={a.assignmentId} a={a} t={t} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function WorkAssignment({ a, t }) {
  const answered = a.questions.filter((q) => q.answer).length;
  return (
    <div className="lms-table-wrap lms-work-assignment">
      <p className="lms-assignment-name">
        {a.name}
        <span className={`lms-badge ${a.status === "graded" ? "ok" : ""}`}>
          {t(`lms.work.${a.status}`)}
          {a.status === "graded" && a.score !== null ? ` · ${a.score}/5` : ""}
        </span>
        <span className="lms-work-count">
          {t("lms.overview.answered", {
            answered,
            total: a.questions.length,
          })}
        </span>
      </p>
      {a.review && (
        <p className="lms-overall">
          <strong>{t("lms.overall")}:</strong> <LmsReview text={a.review} />
        </p>
      )}
      {a.questions.length === 0 && (
        <p className="field-note">{t("lms.overview.noQuestions")}</p>
      )}
      {a.questions.length > 0 && (
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
                <span
                  className={`lms-verdict ${q.isCorrect ? "ok" : "bad"}`}
                  aria-label={q.isCorrect ? "Đúng" : "Sai"}
                >
                  <i
                    className={`ti ${q.isCorrect ? "ti-check" : "ti-x"}`}
                    aria-hidden="true"
                  />
                </span>
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
