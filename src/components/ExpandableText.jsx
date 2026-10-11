import { useLayoutEffect, useRef, useState } from "react";

import { useLanguage } from "../i18n/LanguageContext.jsx";

/** JSON text comes back indented, so a long object reads line by line. */
function prettify(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? JSON.stringify(parsed, null, 2)
      : text;
  } catch {
    return text;
  }
}

/**
 * One line of text clipped with "…", plus a button that shows all of it —
 * a hover `title` never appears on a phone. The button only shows when the
 * text really is clipped, and is re-checked whenever the cell changes width.
 */
export default function ExpandableText({ text }) {
  const { t } = useLanguage();
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return undefined;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={`expandable-text${expanded ? " is-expanded" : ""}`}>
      <span ref={textRef} className="expandable-text-body">
        {expanded ? prettify(text) : text}
      </span>
      {(clipped || expanded) && (
        <button
          type="button"
          className="expandable-text-toggle"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? t("common.showLess") : t("common.showMore")}
          title={expanded ? t("common.showLess") : t("common.showMore")}
        >
          <i
            className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
