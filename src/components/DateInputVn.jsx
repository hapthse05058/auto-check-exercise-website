import { useRef } from "react";

/** "2026-10-02" → "02/10/2026"; "" for anything else. */
function isoDateToVn(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/**
 * A date field that always reads dd/mm/yyyy. A native <input type="date">
 * shows the browser's own format (mm/dd/yyyy in an English Chrome), and that
 * cannot be changed — so the native input stays underneath, invisible, and
 * only its calendar is used: clicking the field (or Enter/Space/↓) opens it.
 *
 * Drop-in for <input type="date">: `value` is "YYYY-MM-DD" (or ""), and
 * `onChange` gets the native input's event, so `event.target.value` too.
 */
export default function DateInputVn({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = "",
  placeholder = "dd/mm/yyyy",
  ...rest
}) {
  const nativeRef = useRef(null);

  const open = () => {
    const input = nativeRef.current;
    if (!input || disabled) return;
    try {
      input.showPicker();
    } catch {
      // No showPicker (old browser): focusing the native input still lets
      // the date be typed in the browser's own format.
      input.focus();
    }
  };

  return (
    <span className={`date-vn ${className}`.trim()}>
      <input
        id={id}
        type="text"
        readOnly
        value={isoDateToVn(value)}
        placeholder={placeholder}
        disabled={disabled}
        onClick={open}
        onKeyDown={(event) => {
          if (["Enter", " ", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            open();
          }
        }}
        {...rest}
      />
      <i className="ti ti-calendar date-vn-icon" aria-hidden="true" />
      <input
        ref={nativeRef}
        className="date-vn-native"
        type="date"
        value={value || ""}
        min={min}
        max={max}
        onChange={onChange}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
}
