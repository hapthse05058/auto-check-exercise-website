import { Fragment } from "react";

/** Consecutive questions of one heading ("CÂU GHÉP DÙNG FANBOYS"), in order. */
function groupBySection(questions) {
  const groups = [];
  for (const q of questions) {
    const section = q.section || "";
    if (!groups.length || groups.at(-1).section !== section) {
      groups.push({ section, questions: [] });
    }
    groups.at(-1).questions.push(q);
  }
  return groups;
}

/**
 * The questions of one assignment: a heading row per group, then alternating
 * rows. `rowKey`, `rowClass`, `prompt` and `review` are per-question, since
 * the grading preview and the read-only work view show different things.
 */
export default function LmsQuestionTable({
  questions,
  rowKey,
  rowClass,
  prompt = (q) => q.question,
  review,
  t,
}) {
  return (
    <table className="data-table lms-table">
      <thead>
        <tr>
          <th scope="col" className="lms-q-no">
            {t("lms.table.no")}
          </th>
          <th scope="col">{t("lms.table.question")}</th>
          <th scope="col">{t("lms.table.answer")}</th>
          <th scope="col">{t("lms.table.review")}</th>
        </tr>
      </thead>
      <tbody>
        {groupBySection(questions).map((group) => (
          <Fragment key={rowKey(group.questions[0])}>
            {group.section && (
              <tr className="lms-q-group">
                <th scope="colgroup" colSpan={4}>
                  {group.section}
                </th>
              </tr>
            )}
            {group.questions.map((q, i) => (
              <tr
                key={rowKey(q)}
                className={["lms-q", rowClass?.(q), i % 2 === 1 ? "alt" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td className="lms-q-no">{q.serialNumber}</td>
                <td className="lms-q-text">{prompt(q)}</td>
                <td className="lms-q-answer">{q.answer || "—"}</td>
                <td className="lms-q-review">{review(q)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
