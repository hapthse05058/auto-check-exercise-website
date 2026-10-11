import { useEffect, useMemo, useRef, useState } from "react";

import { removeAccents } from "../lib/text.js";

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
  searchPlaceholder = "",
  noResultsText = "",
}) {
  const labelOf = (option) => renderLabel?.(option) ?? option;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Như SearchableSelect: không phân biệt dấu/hoa thường, khớp cả nhãn đã
  // dịch lẫn mã gốc (gõ "so du" hay "balance" đều ra "Số dư AI…").
  const filtered = useMemo(() => {
    const needle = removeAccents(search);
    if (!needle) return options;
    return options.filter(
      (option) =>
        removeAccents(String(labelOf(option))).includes(needle) ||
        removeAccents(String(option)).includes(needle),
    );
    // labelOf đổi theo renderLabel (ngôn ngữ) — options + search là đủ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, options, renderLabel]);

  // Mở lại thì bắt đầu từ danh sách đầy đủ.
  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);
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
    <div
      ref={containerRef}
      className={`searchable-select multi-select ${className}`.trim()}
    >
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
          <input
            type="text"
            className="searchable-select-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsOpen(false);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoFocus
          />
          <ul
            className="searchable-select-list"
            role="listbox"
            aria-multiselectable="true"
          >
            {filtered.length === 0 && (
              <li className="searchable-select-no-results">{noResultsText}</li>
            )}
            {filtered.map((option) => (
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
