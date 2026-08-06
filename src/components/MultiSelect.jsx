import { useEffect, useRef, useState } from "react";

/**
 * Dropdown chọn NHIỀU mục bằng checkbox (SearchableSelect chỉ chọn 1).
 * onChange nhận mảng giá trị đã chọn (không phải event); mảng rỗng = không lọc.
 *
 * Dùng lại toàn bộ class CSS của SearchableSelect nên không thêm style mới.
 */
export default function MultiSelect({
  value = [],
  onChange,
  options = [],
  placeholder = "",
  summaryText,
  renderLabel,
  disabled = false,
  className = "",
}) {
  const labelOf = (option) => renderLabel?.(option) ?? option;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Đóng khi click ra ngoài (cùng cách với SearchableSelect).
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (option) => {
    const next = value.includes(option)
      ? value.filter((v) => v !== option)
      : [...value, option];
    onChange?.(next);
  };

  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? labelOf(value[0])
        : (summaryText?.(value.length) ?? `${value.length}`);

  return (
    <div ref={containerRef} className={`searchable-select ${className}`.trim()}>
      <button
        type="button"
        className="searchable-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={value.length ? "" : "searchable-select-placeholder"}>
          {label}
        </span>
        <i className="ti ti-chevron-down" aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div className="searchable-select-dropdown">
          <ul
            className="searchable-select-list"
            role="listbox"
            aria-multiselectable="true"
          >
            {options.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={value.includes(option)}
                className={`searchable-select-option${
                  value.includes(option) ? " selected" : ""
                }`}
                onClick={() => toggle(option)}
              >
                {/* Ô tick chỉ để hiển thị: nếu nó cũng xử lý sự kiện thì một
                    cú click sẽ toggle hai lần (một ở đây, một ở <li>) và
                    triệt tiêu nhau. Toàn bộ tương tác do <li> đảm nhiệm. */}
                <span className="multiselect-row">
                  <input
                    type="checkbox"
                    checked={value.includes(option)}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span className="multiselect-row-label">
                    {labelOf(option)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
