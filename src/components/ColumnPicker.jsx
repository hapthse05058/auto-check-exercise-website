import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../i18n/LanguageContext.jsx";

/**
 * "Columns" button + checklist for a DataTable's column visibility. Lists the
 * given column defs, except ones with `enableHiding: false` (e.g. actions).
 */
export default function ColumnPicker({
  columns,
  visibility,
  onChange,
  onReset,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hideable = columns.filter((col) => col.enableHiding !== false);
  const shown = hideable.filter((col) => visibility[col.id] !== false).length;

  return (
    <div className="menu-wrapper column-picker" ref={ref}>
      <button
        type="button"
        className="menu-btn column-picker-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <i className="ti ti-columns" aria-hidden="true" /> {t("common.columns")}{" "}
        <span className="column-picker-count">
          {shown}/{hideable.length}
        </span>
      </button>
      {open && (
        <div className="menu-options column-picker-menu">
          {hideable.map((col) => (
            <label className="cache-toggle" key={col.id}>
              <input
                type="checkbox"
                checked={visibility[col.id] !== false}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, [col.id]: e.target.checked }))
                }
              />
              <span>
                {col.meta?.label ||
                  (typeof col.header === "string" ? col.header : col.id)}
              </span>
            </label>
          ))}
          {onReset && (
            <button
              type="button"
              className="column-picker-reset"
              onClick={onReset}
            >
              <i className="ti ti-restore" aria-hidden="true" />{" "}
              {t("common.resetColumns")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
