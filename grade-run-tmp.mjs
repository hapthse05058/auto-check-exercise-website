/**
 * Chạy ĐÚNG luồng chấm của app (`processDocs`) ngoài trình duyệt.
 *
 * Không mô phỏng lại gì cả: gọi thẳng hàm mà nút "Process All Documents" gọi.
 * Chỉ thay hai thứ trình duyệt mới có — `localStorage` và `alert` — rồi nạp
 * sẵn token đúng như sau khi đăng nhập bằng username/password:
 *   - access_token: JWT ký tại chỗ (backend verify bằng JWT_SECRET)
 *   - google_access_token: token service account, dùng cho docs.googleapis.com
 */


// --- shim trình duyệt -------------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.alert = (m) => console.log("[alert]", m);

// Backend chỉ nghe IPv4; Node phân giải "localhost" thành ::1 rồi ECONNREFUSED
// (trình duyệt thì không sao). Viết lại URL thay vì sửa src/config.js.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url;
  if (typeof url === "string" && url.startsWith("http://localhost:3000")) {
    return realFetch(
      url.replace("http://localhost:3000", "http://127.0.0.1:3000"),
      init,
    );
  }
  return realFetch(input, init);
};

// --- token (lấy sẵn ở bước trước, truyền qua env) --------------------------
const token = process.env.ACE_JWT;
const googleToken = process.env.ACE_GOOGLE_TOKEN;
if (!token || !googleToken) throw new Error("thiếu ACE_JWT / ACE_GOOGLE_TOKEN");

const now = Date.now();
const set = (k, v) => store.set("ace_" + k, JSON.stringify(v));
set("access_token", token);
set("expiry_date", now + 2 * 3600e3);
set("access_token_issued_at", now);
set("google_access_token", googleToken);
set("google_token_expiry", now + 3500e3);
set("google_token_issued_at", now);

// --- chạy -------------------------------------------------------------------
const { processDocs } = await import("./src/lib/grading.js");
const { translations } = await import("./src/i18n/translations.js");
const t = (key, vars = {}) => {
  const raw = key
    .split(".")
    .reduce((o, k) => (o ? o[k] : undefined), translations.vi);
  if (!raw) return key;
  return String(raw).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? `{${n}}`);
};

const DOC =
  "https://docs.google.com/document/d/11jspLatFMaAxWcTZkswnw4Hc8YLhX1WBXcup1XCGSrA/edit?tab=t.v0lqw2a77y6m";

console.log("Bắt đầu chấm BUỔI 05…\n");
const result = await processDocs({
  docLinksText: DOC,
  classId: "1wzZrcDlXPOj4d1EBuWp",
  classType: "basic_since_01042026",
  lessonName: "BUỔI 05",
  lessonId: "lesson05",
  useCache: true,
  t,
});

console.log("\n========== KẾT QUẢ ==========");
console.log("số tài liệu đã chấm:", result.graded);
console.log("lỗi   :", result.error ?? "(không)");
console.log("thông báo:", result.notice ?? "(không)");
console.log("cảnh báo:", result.warnings.length);
result.warnings.forEach((w) => console.log("   -", w));
