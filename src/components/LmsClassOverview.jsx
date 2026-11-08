import { useCallback, useEffect, useState } from "react";

import LmsStudentWork from "./LmsStudentWork.jsx";
import { fetchLmsOverview } from "../api/backend.js";
import { useLmsConfig } from "../lib/lmsConfig.js";
import { lmsCellState as cellState, lmsErrorText } from "../lib/lmsText.js";

// Kept while the app is open: switching tabs does not reload ~24 LMS reports.
// "Tải lại" (or a save) fetches again.
const overviewCache = new Map(); // classId -> overview data

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
  const config = useLmsConfig();
  const [data, setData] = useState(() => overviewCache.get(classId) || null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(null); // {session, student, cell}

  // Keeps what is shown while fetching again; clears it only on a new class.
  const load = useCallback(
    async ({ force = false } = {}) => {
      const cached = overviewCache.get(classId);
      if (cached && !force) {
        setData(cached);
        return;
      }
      if (!cached) setData(null);
      setError("");
      setRefreshing(true);
      try {
        const fresh = await fetchLmsOverview(classId);
        overviewCache.set(classId, fresh);
        setData(fresh);
      } catch (err) {
        setError(lmsErrorText(err, t));
      } finally {
        setRefreshing(false);
      }
    },
    [classId, t],
  );

  useEffect(() => {
    if (classId) load();
  }, [classId, load]);

  const refresh = () => load({ force: true });

  if (error) {
    return (
      <div className="status-output error">
        {error}{" "}
        <button type="button" className="link-btn" onClick={refresh}>
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
          onClick={refresh}
          disabled={refreshing}
        >
          <i
            className={`ti ti-refresh${refreshing ? " lms-spin" : ""}`}
            aria-hidden="true"
          />
          {refreshing ? t("lms.loading") : t("lms.overview.refresh")}
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
        <LmsStudentWork
          classId={classId}
          {...open}
          config={config}
          t={t}
          onClose={() => setOpen(null)}
          onSaved={refresh}
        />
      )}
    </section>
  );
}
