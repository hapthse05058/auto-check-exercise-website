import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  PRICE_AUTO_VND,
  PRICE_MANUAL_VND,
  formatVnd,
  gradingCostEstimate,
} from "../lib/billing.js";
import { formatVn } from "../lib/scheduleTime.js";

/**
 * What grading the selected lesson costs, before the teacher presses the
 * button: docs to grade × price = total, against the payer's balance. Points
 * used to be one per doc; in VND the teacher needs the sum spelled out.
 *
 * `preview` is the backend's reading of every doc (api fetchGradingPreview):
 * {state: "loading"} | {state: "done", data} | {state: "error", error}. Only
 * `data.pending` docs are graded and charged — not done and already graded
 * ones are left out, as the run leaves them out. `docCount` (the class's docs,
 * or the pasted ones) is all that is known while it loads or when it failed,
 * so those states show it as a ceiling; `pasted` says which it is.
 *
 * `payerName` is set for an admin grading someone else's class; `balanceVnd`
 * null hides the balance line. `autoRunAt` (the class's next scheduled run,
 * when it grades this lesson) adds that run's cost at the auto price.
 */
export default function GradeCostNote({
  preview,
  docCount,
  pasted,
  balanceVnd,
  payerName,
  autoRunAt,
  onRetry,
}) {
  const { t } = useLanguage();
  if (!preview && !Number.isFinite(docCount)) return null;

  const formula = (docs, unitPriceVnd) => {
    const cost = gradingCostEstimate({ docCount: docs, unitPriceVnd });
    return t("gradeCost.formula", {
      n: cost.docs,
      price: formatVnd(cost.unitPriceVnd),
      total: formatVnd(cost.totalVnd),
    });
  };
  const retry = onRetry && (
    <button type="button" className="grade-cost-retry" onClick={onRetry}>
      {t("gradeCost.recheck")}
    </button>
  );
  const box = (body, state = "ok") => (
    <div className="grade-cost" data-state={state} aria-live="polite">
      <i className="ti ti-receipt" aria-hidden="true" />
      <div>
        <p className="grade-cost-title">{t("gradeCost.title")}</p>
        {body}
      </div>
    </div>
  );

  if (docCount === 0 || (preview?.state === "done" && !preview.data.total)) {
    return box(<p>{t("gradeCost.noDocs")}</p>);
  }

  if (!preview || preview.state === "loading") {
    return box(
      <p className="status-loading">
        <span className="spinner" aria-hidden="true" />
        <span>
          {Number.isFinite(docCount)
            ? t("gradeCost.checking", { n: docCount })
            : t("gradeCost.checkingNoCount")}
        </span>
      </p>,
    );
  }

  if (preview.state === "error") {
    return box(
      <>
        <p>
          {t(
            preview.error === "google_reauth_required"
              ? "gradeCost.errorReauth"
              : "gradeCost.error",
          )}{" "}
          {retry}
        </p>
        {Number.isFinite(docCount) && (
          <p>
            {t("gradeCost.ceiling", {
              formula: formula(docCount, PRICE_MANUAL_VND),
            })}
          </p>
        )}
      </>,
    );
  }

  const { total, pending, notDone, alreadyGraded, other, unitPriceVnd } =
    preview.data;
  const breakdown = [
    t("gradeCost.partPending", { n: pending }),
    notDone && t("gradeCost.partNotDone", { n: notDone }),
    alreadyGraded && t("gradeCost.partGraded", { n: alreadyGraded }),
    other && t("gradeCost.partOther", { n: other }),
  ]
    .filter(Boolean)
    .join(" · ");
  const source = t(
    pasted ? "gradeCost.sourcePasted" : "gradeCost.sourceClass",
    { n: total },
  );

  if (!pending) {
    return box(
      <>
        <p>
          <strong className="grade-cost-formula">
            {t("gradeCost.nothingToGrade")}
          </strong>
        </p>
        <p>
          {source} {breakdown}. {retry}
        </p>
      </>,
    );
  }

  const cost = gradingCostEstimate({
    docCount: pending,
    unitPriceVnd: unitPriceVnd || PRICE_MANUAL_VND,
    balanceVnd,
  });
  const who = payerName
    ? t("gradeCost.balanceOf", { teacher: payerName })
    : t("gradeCost.balanceYours");

  return box(
    <>
      <p>
        <strong className="grade-cost-formula">
          {formula(pending, cost.unitPriceVnd)}
        </strong>{" "}
        {t("gradeCost.manualTag")}
      </p>
      <p>
        {source} {breakdown}.
      </p>
      {(notDone > 0 || alreadyGraded > 0) && <p>{t("gradeCost.notCharged")}</p>}
      {cost.enough === true && (
        <p>
          {t("gradeCost.balanceOk", {
            who,
            balance: formatVnd(cost.balanceVnd),
            after: formatVnd(cost.afterVnd),
          })}
        </p>
      )}
      {cost.enough === false && (
        <p className="grade-cost-short">
          {t("gradeCost.balanceShort", {
            who,
            balance: formatVnd(cost.balanceVnd),
            total: formatVnd(cost.totalVnd),
          })}
        </p>
      )}
      {autoRunAt && (
        <p className="grade-cost-auto">
          {t("gradeCost.autoLine", {
            runAt: formatVn(autoRunAt),
            formula: formula(pending, PRICE_AUTO_VND),
          })}
        </p>
      )}
      <p className="grade-cost-auto">
        {t("gradeCost.checkedNote")} {retry}
      </p>
    </>,
    cost.enough === false ? "short" : "ok",
  );
}
