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
 * button: docs × price = total, against the payer's balance. Points used to
 * be one per doc; in VND the teacher needs the sum spelled out.
 *
 * `docCount` is the pasted links when there are any (`pasted`), otherwise the
 * class's students with a doc link — exactly the docs a run would open. Only
 * the docs a student actually did get written and charged, so the total is a
 * ceiling. `payerName` is set for an admin grading someone else's class;
 * `balanceVnd` null hides the balance line. `autoRunAt` (the class's next
 * scheduled run) adds that run's cost at the auto price.
 */
export default function GradeCostNote({
  docCount,
  pasted,
  balanceVnd,
  payerName,
  autoRunAt,
}) {
  const { t } = useLanguage();
  if (!Number.isFinite(docCount)) return null;

  if (docCount === 0) {
    return (
      <div className="grade-cost">
        <i className="ti ti-receipt" aria-hidden="true" />
        <div>
          <p className="grade-cost-title">{t("gradeCost.title")}</p>
          <p>{t("gradeCost.noDocs")}</p>
        </div>
      </div>
    );
  }

  const manual = gradingCostEstimate({
    docCount,
    unitPriceVnd: PRICE_MANUAL_VND,
    balanceVnd,
  });
  const formula = (cost) =>
    t("gradeCost.formula", {
      n: cost.docs,
      price: formatVnd(cost.unitPriceVnd),
      total: formatVnd(cost.totalVnd),
    });
  const who = payerName
    ? t("gradeCost.balanceOf", { teacher: payerName })
    : t("gradeCost.balanceYours");

  return (
    <div
      className="grade-cost"
      data-state={manual.enough === false ? "short" : "ok"}
    >
      <i className="ti ti-receipt" aria-hidden="true" />
      <div>
        <p className="grade-cost-title">{t("gradeCost.title")}</p>
        <p>
          <strong className="grade-cost-formula">{formula(manual)}</strong>{" "}
          {t("gradeCost.manualTag")}
        </p>
        <p>
          {t(pasted ? "gradeCost.sourcePasted" : "gradeCost.sourceClass", {
            n: docCount,
          })}{" "}
          {t("gradeCost.onlyDone")}
        </p>
        {manual.enough === true && (
          <p>
            {t("gradeCost.balanceOk", {
              who,
              balance: formatVnd(manual.balanceVnd),
              after: formatVnd(manual.afterVnd),
            })}
          </p>
        )}
        {manual.enough === false && (
          <p className="grade-cost-short">
            {t("gradeCost.balanceShort", {
              who,
              balance: formatVnd(manual.balanceVnd),
              k: manual.affordableDocs,
            })}
          </p>
        )}
        {autoRunAt && (
          <p className="grade-cost-auto">
            {t("gradeCost.autoLine", {
              runAt: formatVn(autoRunAt),
              formula: formula(
                gradingCostEstimate({ docCount, unitPriceVnd: PRICE_AUTO_VND }),
              ),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
