import { useLanguage } from "../i18n/LanguageContext.jsx";
import { PRICE_AUTO_VND, PRICE_MANUAL_VND, formatVnd } from "../lib/billing.js";

/**
 * What grading costs, next to the auto-grading switch: a doc graded by a
 * scheduled run costs PRICE_AUTO_VND, one graded by hand PRICE_MANUAL_VND.
 * `enabled` picks the wording — the class is (or is about to be) graded
 * automatically, or only by hand.
 */
export default function AutoGradePriceNote({ enabled }) {
  const { t } = useLanguage();
  return (
    <p className="auto-grade-price" data-enabled={enabled ? "on" : "off"}>
      <i className="ti ti-coins" aria-hidden="true" />
      <span>
        {t(enabled ? "autoGrade.priceOn" : "autoGrade.priceOff", {
          auto: formatVnd(PRICE_AUTO_VND),
          manual: formatVnd(PRICE_MANUAL_VND),
        })}
      </span>
    </p>
  );
}
