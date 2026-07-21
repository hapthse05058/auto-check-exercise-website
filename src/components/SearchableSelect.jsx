import { useEffect, useMemo, useRef, useState } from "react";

// Bỏ dấu tiếng Việt để lọc không phân biệt dấu: gõ "lop 10" vẫn khớp "Lớp 10".
const removeAccents = (str = "") =>
  str
    .normalize("NFD") // tách dấu thành ký tự tổ hợp
    .replace(/[̀-ͯ]/g, "") // bỏ các dấu tổ hợp (dùng escape hex, không viết ký tự thô)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D") // NFD không tách được "đ" → xử lý riêng
    .toLowerCase()
    .trim();

/**
 * Combobox chọn 1 mục có ô tìm kiếm để lọc.
 * onChange nhận id trực tiếp (không phải event). Chuỗi rỗng "" nghĩa là bỏ chọn.
 */
export default function SearchableSelect({
  value = "",
  onChange,
  options = [],
  placeholder = "",
  disabled = false,
  className = "",
  searchPlaceholder = "",
  noResultsText = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selectedOption = options.find((opt) => opt.id === value);

  const filteredOptions = useMemo(() => {
    const cleanSearch = removeAccents(search);
    if (!cleanSearch) return options;
    return options.filter((opt) =>
      removeAccents(opt.name).includes(cleanSearch),
    );
  }, [search, options]);

  // Đóng khi click ra ngoài.
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

  // Reset ô tìm + highlight mỗi khi đóng dropdown.
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Về đầu danh sách mỗi khi từ khóa đổi.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  // Cuộn để mục đang highlight không bị khuất.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-index="${highlightedIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const commit = (id) => {
    onChange?.(id);
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (filteredOptions.length === 0) return; // không di chuyển/chọn khi danh sách rỗng
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedIndex >= 0) commit(filteredOptions[highlightedIndex].id);
    }
  };

  return (
    <div ref={containerRef} className={`searchable-select ${className}`.trim()}>
      <button
        type="button"
        className="searchable-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={selectedOption ? "" : "searchable-select-placeholder"}>
          {selectedOption ? selectedOption.name : placeholder}
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
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            autoFocus
          />
          <ul className="searchable-select-list" role="listbox" ref={listRef}>
            <li
              role="option"
              aria-selected={!value}
              className="searchable-select-option searchable-select-option-empty"
              onClick={() => commit("")}
            >
              {placeholder}
            </li>
            {filteredOptions.length === 0 ? (
              <li className="searchable-select-no-results">{noResultsText}</li>
            ) : (
              filteredOptions.map((opt, index) => (
                <li
                  key={opt.id}
                  data-index={index}
                  role="option"
                  aria-selected={opt.id === value}
                  className={`searchable-select-option${
                    index === highlightedIndex ? " highlighted" : ""
                  }${opt.id === value ? " selected" : ""}`}
                  onClick={() => commit(opt.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {opt.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
