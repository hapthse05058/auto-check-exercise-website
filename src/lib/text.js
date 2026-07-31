/**
 * Bỏ dấu tiếng Việt để so khớp không phân biệt dấu/hoa thường:
 * gõ "lop 10" vẫn khớp "Lớp 10".
 */
export function removeAccents(str = "") {
  return str
    .normalize("NFD") // tách dấu thành ký tự tổ hợp
    .replace(/[\u0300-\u036f]/g, "") // bỏ các dấu tổ hợp (dùng escape hex, không viết ký tự thô)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D") // NFD không tách được "đ" → xử lý riêng
    .toLowerCase()
    .trim();
}
