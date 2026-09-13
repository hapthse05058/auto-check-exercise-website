import { storageSet } from "../auth/storage.js";
import { ensureValidToken } from "../auth/tokens.js";
import { DOMAIN_BE, EXTENSION_SECRET_KEY } from "../config.js";
import { extractDocId } from "../lib/googleDoc.js";

/** Authenticated fetch against the backend (Bearer JWT + API key). */
async function authFetch(path, { method = "GET", body } = {}) {
  const token = await ensureValidToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-api-key": EXTENSION_SECRET_KEY,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${DOMAIN_BE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Unauthenticated fetch (login / password-reset endpoints). */
async function publicFetch(path, { method = "POST", body } = {}) {
  return fetch(`${DOMAIN_BE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": EXTENSION_SECRET_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginWithUsernamePassword(username, password) {
  const response = await publicFetch("/auth/username-password", {
    body: { username, password },
  });

  if (response.status === 401) {
    return { ok: false, error: "Invalid username or password." };
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    return {
      ok: false,
      error: data?.error || "Login failed. Please try again.",
    };
  }

  const data = await response.json();
  const now = Date.now();
  storageSet({
    access_token: data.access_token,
    expiry_date: now + (data.expires_in || 3600) * 1000,
    access_token_issued_at: now,
    refresh_token: data.refresh_token || null,
    refresh_token_expires_date: data.refresh_token_expires_date || null,
    // Real Google token (service account) for the Google Docs API.
    // `access_token` above is a JWT valid for THIS backend only.
    google_access_token: data.google_access_token || null,
    google_token_expiry: data.google_access_token
      ? now + (data.expires_in || 3600) * 1000
      : null,
    google_token_issued_at: data.google_access_token ? now : null,
  });
  return { ok: true };
}

/** Exchanges a Google OAuth authorization code for backend tokens. */
export async function loginWithGoogleCode(code, redirectUri) {
  const response = await fetch(`${DOMAIN_BE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Google login failed.");
  }
  const tokens = await response.json();
  storageSet({
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
    access_token_issued_at: Date.now(),
    refresh_token: tokens.refresh_token,
    refresh_token_expires_date: tokens.refresh_token_expires_date,
  });
  // Remember the Google profile so the signup screen can pre-fill Gmail/name
  // before a teacher record exists. Tolerant to backend field naming; absent
  // values simply leave the signup fields empty. Cleared in clearAuthStorage().
  const gmail = tokens.email || tokens.gmail || "";
  const name =
    tokens.name ||
    tokens.fullName ||
    tokens.full_name ||
    tokens.displayName ||
    "";
  if (gmail || name) {
    sessionStorage.setItem(
      "googleLoginProfile",
      JSON.stringify({ gmail, name }),
    );
  }
  return tokens;
}

export async function requestPasswordReset(identifier) {
  const response = await publicFetch("/auth/forgot-password", {
    body: { identifier },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Failed to send reset link.");
  }
  return data;
}

export async function resetPassword(resetToken, newPassword) {
  const response = await publicFetch("/auth/reset-password", {
    body: { reset_token: resetToken, new_password: newPassword },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to reset password.");
  }
  return response.json().catch(() => ({}));
}

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

/**
 * Fetches the logged-in teacher's record.
 * Returns null when the account is not registered yet (HTTP 403) so callers
 * can route the user to the signup flow.
 */
export async function fetchTeacherInfo() {
  const response = await authFetch("/teacher-info");
  if (response.status === 403) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to fetch teacher info");
  }
  return response.json();
}

export async function signupTeacher(payload) {
  return authFetch("/teacher-signup", { method: "POST", body: payload });
}

// ---------------------------------------------------------------------------
// Classes & lessons
// ---------------------------------------------------------------------------

export async function fetchClasses(teacherId) {
  const response = await authFetch(
    `/classes?teacherId=${encodeURIComponent(teacherId)}`,
  );
  if (!response.ok) throw new Error("Failed to fetch classes");
  return response.json();
}

export async function checkClassNameExists(name) {
  const response = await authFetch(
    `/classes/check-name?name=${encodeURIComponent(name)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to verify class name");
  }
  const data = await response.json();
  return data.exists === true;
}

export async function fetchClassTypes() {
  const response = await authFetch("/class-types");
  if (!response.ok) {
    throw new Error("Failed to fetch class types");
  }
  const responseBody = await response.json();
  const data = Array.isArray(responseBody)
    ? responseBody
    : responseBody.classTypes || responseBody.data || responseBody.items || [];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid class type payload");
  }
  return data;
}

export async function fetchLessons(classType) {
  const response = await authFetch(
    `/lessons?classType=${encodeURIComponent(classType)}`,
  );
  if (!response.ok) throw new Error("Failed to fetch lessons");
  return response.json();
}

export async function fetchCurrentLesson(classId) {
  const response = await authFetch(`/current-lesson?classId=${classId}`);
  if (!response.ok) {
    console.warn(
      "No current lesson available or failed to fetch current lesson",
    );
    return null;
  }
  const data = await response.json();
  return data.currentLesson || null;
}

export async function updateCurrentLessonForClass(classId, lessonId) {
  const response = await authFetch("/classes/current-lesson", {
    method: "PATCH",
    body: { classId, currentLesson: lessonId },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      "Failed to update current lesson:",
      response.status,
      errorBody,
    );
    return false;
  }
  return true;
}

export async function createClass({
  name,
  classType,
  currentLesson,
  teacherId,
}) {
  return authFetch("/classes", {
    method: "POST",
    body: { name, classType, currentLesson, teacherId },
  });
}

/** Admin: list ALL classes (every teacher) with teacher names joined. */
export async function fetchAllClasses() {
  const response = await authFetch("/classes/all");
  if (!response.ok) throw new Error("Failed to fetch all classes");
  return response.json();
}

/** Updates a class: rename (`name`) and/or deactivate (`isActive: false`). */
export async function updateClass(classId, payload) {
  return authFetch(`/classes/${encodeURIComponent(classId)}`, {
    method: "PATCH",
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// Students & grading
// ---------------------------------------------------------------------------

/** Returns the saved students of a class as `{docId, tabId}` doc references. */
export async function fetchStudentDocRefs(classId) {
  const response = await authFetch(`/students?classId=${classId}`);
  if (!response.ok) throw new Error("Failed to fetch students");
  const students = await response.json();
  const links = [];
  students.forEach((student) => {
    const docId = extractDocId(student.ggDocLink);
    if (docId) {
      links.push({ docId, tabId: "t.0" });
    }
  });
  return links;
}

export async function saveStudents(classId, students) {
  return authFetch("/students", {
    method: "POST",
    body: { classId, students },
  });
}

/**
 * Removes one student from their class. A student belongs to a class through
 * their own `classId`, so this deletes the student record.
 */
export async function deleteStudent(id) {
  return authFetch(`/students/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Removes many students from their class at once. */
export async function bulkDeleteStudents(ids) {
  return authFetch("/students/bulk-delete", {
    method: "POST",
    body: { ids },
  });
}

/** Returns the full student records of a class (id, name, gmail, ggDocLink). */
export async function fetchStudents(classId) {
  const response = await authFetch(
    `/students?classId=${encodeURIComponent(classId)}`,
  );
  if (!response.ok) throw new Error("Failed to fetch students");
  return response.json();
}

/**
 * Sends a DEDUPED array of unique {question, answer} pairs (for the whole
 * class) to the cached grader and returns `[{question, answer, feedback}]`.
 * The backend reuses gradingCache feedback and only sends genuine misses to
 * the AI. `feedback` can be null when the AI returned nothing for a pair.
 */
export async function gradeAnswers(
  items,
  { useCache = true, classId, lessonId, pendingCount } = {},
) {
  const response = await authFetch("/grade-cached", {
    method: "POST",
    // classId/lessonId/pendingCount are not used for grading — they let the
    // backend write a readable audit detail instead of dumping the answers.
    body: { items, useCache, classId, lessonId, pendingCount },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Grading failed");
  }
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

// ---------------------------------------------------------------------------
// gradingCache management (admin only)
// ---------------------------------------------------------------------------

/**
 * Lists/searches gradingCache records (substring match on `field`) with paging.
 * Returns `{ results, total, page, pageSize, totalPages }`.
 */
export async function fetchGradingCache(
  field = "question",
  q = "",
  page = 1,
  pageSize = 100,
) {
  const params = new URLSearchParams({
    field,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (q) params.set("q", q);
  const response = await authFetch(`/grading-cache?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to fetch grading cache");
  const data = await response.json();
  return {
    results: Array.isArray(data.results) ? data.results : [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? pageSize,
    totalPages: data.totalPages ?? 1,
  };
}

/** Adds a record. Returns the raw response so callers can read .ok/.json(). */
export async function createGradingCache(payload) {
  return authFetch("/grading-cache", { method: "POST", body: payload });
}

/** Edits a record (backend re-keys the doc id if key fields change). */
export async function updateGradingCache(id, payload) {
  return authFetch(`/grading-cache/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

/** Deletes a record by id. */
export async function deleteGradingCache(id) {
  return authFetch(`/grading-cache/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Deletes many records by id at once. */
export async function bulkDeleteGradingCache(ids) {
  return authFetch("/grading-cache/bulk-delete", {
    method: "POST",
    body: { ids },
  });
}

// ---------------------------------------------------------------------------
// Teacher points
// ---------------------------------------------------------------------------

/** Current point balance of the logged-in teacher (0 when no record). */
export async function fetchMyPoint() {
  const response = await authFetch("/teacher-points/me");
  if (!response.ok) throw new Error("Failed to fetch point balance");
  const data = await response.json();
  return data.point ?? 0;
}

/**
 * Spends 1 point per student doc just written. Send the docs, not an amount —
 * the backend prices them and its ledger makes a repeat call a no-op.
 * Throws INSUFFICIENT_POINTS on 402 so the caller can stop the run.
 */
export async function consumeDocPoints({ classId, docIds, lessonId }) {
  const response = await authFetch("/teacher-points/consume", {
    method: "POST",
    body: { classId, docIds, lessonId },
  });
  if (response.status === 402) throw new Error("INSUFFICIENT_POINTS");
  if (!response.ok) throw new Error("Failed to consume points");
  return response.json(); // { point, charged, payerTeacherId, payerName }
}

/**
 * Balance of whoever pays for this class — the class's teacher when an admin is
 * grading, the caller otherwise. Resolved server-side from the class record.
 */
export async function fetchPayerPoint(classId) {
  const response = await authFetch(
    `/teacher-points/payer?classId=${encodeURIComponent(classId || "")}`,
  );
  if (!response.ok) throw new Error("Failed to fetch payer point balance");
  const data = await response.json();
  return {
    point: data.point ?? 0,
    teacherId: data.teacherId || "",
    teacherName: data.teacherName || "",
  };
}

/**
 * One audit line closing out a grading run. Never throws: the points are
 * already settled in the ledger, and losing a log line must not fail the run.
 */
export async function recordGradingSummary({ classId, lessonId, totalPoints }) {
  try {
    await authFetch("/grading-summary", {
      method: "POST",
      body: { classId, lessonId, totalPoints },
    });
  } catch {
    // Offline, expired token, backend down — losing one log line is acceptable.
  }
}

/**
 * One audit line closing out a "clear feedback" run. The docs are edited
 * browser-side, so nothing else would record it. Never throws, for the same
 * reason as above: the deletion already happened.
 */
export async function recordFeedbackClearSummary({
  classId,
  lessonId,
  clearedDocs,
  clearedCells,
}) {
  try {
    await authFetch("/feedback-clear-summary", {
      method: "POST",
      body: { classId, lessonId, clearedDocs, clearedCells },
    });
  } catch {
    // Offline, expired token, backend down — losing one log line is acceptable.
  }
}

// --- admin only ---

/** Teachers list for the create dropdown (`[{ id, gmail, name }]`). */
export async function fetchTeachersForPoints() {
  const response = await authFetch("/teachers");
  if (!response.ok) throw new Error("Failed to fetch teachers");
  const data = await response.json();
  return Array.isArray(data.teachers) ? data.teachers : [];
}

// ---------------------------------------------------------------------------
// Teacher management (admin)
// ---------------------------------------------------------------------------

/**
 * Searches/filters teachers for the management screen. `params` may include
 * `q`, `classId`, `isAccountActive` ("true"/"false"); empties are omitted.
 * Returns full records (no password) with `classIds`/`classNames`.
 */
export async function fetchTeachersManage(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await authFetch(`/teachers/manage${suffix}`);
  if (!response.ok) throw new Error("Failed to fetch teachers");
  const data = await response.json();
  return Array.isArray(data.teachers) ? data.teachers : [];
}

/** Admin: create a teacher. Returns the raw response so callers can read .ok/.json(). */
export async function createTeacher(payload) {
  return authFetch("/teachers", { method: "POST", body: payload });
}

/** Admin: update a teacher (never username/password). Raw response. */
export async function updateTeacher(id, payload) {
  return authFetch(`/teachers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

/**
 * Admin: permanently delete a teacher account. Raw response.
 * Optionally cascades: `deleteClasses` removes classes the teacher solely owns,
 * `deleteStudents` removes the students of those deleted classes.
 */
export async function deleteTeacher(
  id,
  { deleteClasses = false, deleteStudents = false } = {},
) {
  return authFetch(`/teachers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: { deleteClasses, deleteStudents },
  });
}

/** All TeacherPoint records. */
export async function fetchTeacherPoints() {
  const response = await authFetch("/teacher-points");
  if (!response.ok) throw new Error("Failed to fetch teacher points");
  const data = await response.json();
  return Array.isArray(data.records) ? data.records : [];
}

export async function createTeacherPoint(payload) {
  return authFetch("/teacher-points", { method: "POST", body: payload });
}

export async function updateTeacherPoint(id, payload) {
  return authFetch(`/teacher-points/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteTeacherPoint(id) {
  return authFetch(`/teacher-points/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Tops up a teacher's points from a VND amount. */
export async function topUpTeacherPoint(id, amountVnd) {
  return authFetch(`/teacher-points/${encodeURIComponent(id)}/topup`, {
    method: "POST",
    body: { amountVnd },
  });
}

/** Admin billing summary `{ totalTopUpVnd, totalCommissionVnd }`. */
export async function fetchBilling() {
  const response = await authFetch("/teacher-points/billing");
  if (!response.ok) throw new Error("Failed to fetch billing");
  return response.json();
}

// ---------------------------------------------------------------------------
// Audit log (admin)
// ---------------------------------------------------------------------------

/**
 * Paged audit trail for the /admin/audit-logs screen. `params` may include
 * `field`, `q`, `from`, `to`, `page`, `pageSize`; empties are omitted.
 * Entries are written server-side by the audit middleware — never from here.
 */
export async function fetchAuditLogs(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await authFetch(`/audit-logs${suffix}`);
  if (!response.ok) throw new Error("Failed to fetch audit logs");
  const data = await response.json();
  return {
    results: Array.isArray(data.results) ? data.results : [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 50,
    totalPages: data.totalPages ?? 1,
  };
}

/**
 * Values for the multiselect filters (`{ fields, options }`), derived on the
 * backend from its action table so the screen never hard-codes action names.
 */
export async function fetchAuditFilterOptions() {
  const response = await authFetch("/audit-logs/filter-options");
  if (!response.ok) throw new Error("Failed to fetch audit filter options");
  return response.json();
}

/**
 * Records an action that produces no request of its own (logout), so the audit
 * middleware cannot see it. Only whitelisted action names are accepted and the
 * actor comes from the token, not from us.
 *
 * NEVER throws: audit logging is secondary and must not block the real action.
 */
export async function logClientEvent(action) {
  try {
    await authFetch("/audit-logs/client-event", {
      method: "POST",
      body: { action },
    });
  } catch {
    // Offline, expired token, backend down — losing one log line is acceptable.
  }
}

// ---------------------------------------------------------------------------
// Notifications (admin) — the bell and the FCM device registry.
// ---------------------------------------------------------------------------

/**
 * Notifications addressed to the signed-in admin, newest first.
 * Returns `{ results, unreadCount, total }`.
 */
export async function fetchNotifications({ status = "all", limit = 50 } = {}) {
  const params = new URLSearchParams({ status, limit: String(limit) });
  const response = await authFetch(`/notifications?${params}`);
  if (!response.ok) throw new Error("Failed to fetch notifications");
  return response.json();
}

export async function markNotificationRead(id) {
  const response = await authFetch(
    `/notifications/${encodeURIComponent(id)}/read`,
    {
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Failed to mark notification read");
  return response.json();
}

export async function markAllNotificationsRead() {
  const response = await authFetch("/notifications/read-all", {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to mark notifications read");
  return response.json();
}

/**
 * Registers this browser's FCM token so the backend can push to it.
 *
 * The field MUST be named `token`: the backend's audit logger redacts that key
 * by name, which is what keeps the registration token — a capability to push to
 * this device — out of the audit trail. Returns the SHA-256 `tokenHash`, which
 * is what we store locally and what the unregister URL carries.
 *
 * NEVER throws: push is an enhancement, and a failure here must not break the
 * page that called it.
 */
export async function registerPushDevice({ token, platform = "web" }) {
  try {
    const response = await authFetch("/notifications/devices", {
      method: "POST",
      body: { token, platform },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.tokenHash || null;
  } catch {
    return null;
  }
}

/** Unregisters one device by its hash. Never throws (used during logout). */
export async function unregisterPushDevice(tokenHash) {
  try {
    await authFetch(`/notifications/devices/${encodeURIComponent(tokenHash)}`, {
      method: "DELETE",
    });
  } catch {
    // Logging out offline is fine — the token is pruned on its next failed send.
  }
}

/**
 * Admin-only manual DeepSeek balance check. `force` bypasses both the hourly
 * throttle and the re-alert window; used from the admin UI to verify the alert
 * path without waiting for the next grading run.
 */
export async function triggerBalanceCheck({ force = false } = {}) {
  const response = await authFetch(
    `/admin/deepseek-balance/check${force ? "?force=1" : ""}`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Balance check failed");
  return response.json();
}
