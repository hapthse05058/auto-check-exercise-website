import { Fragment } from "react";

/** "I **am** fine.\n(lý do)" → lines with the bold spans bold. */
export default function LmsReview({ text }) {
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
