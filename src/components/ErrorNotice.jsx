import { useLanguage } from "../i18n/LanguageContext.jsx";

/**
 * A load failure the user can act on: the message, plus a retry button when
 * `onRetry` is given. Same danger language as .auto-grade-alert.
 */
export default function ErrorNotice({ message, onRetry }) {
  const { t } = useLanguage();
  return (
    <div className="error-notice" role="alert">
      <i className="ti ti-alert-circle" aria-hidden="true" />
      <span className="error-notice-text">{message}</span>
      {onRetry && (
        <button type="button" className="secondary-btn" onClick={onRetry}>
          <i className="ti ti-refresh" aria-hidden="true" />
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
