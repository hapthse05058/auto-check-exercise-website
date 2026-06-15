import { DOMAIN_BE, EXTENSION_SECRET_KEY } from "../config.js";
import { ensureValidToken } from "../auth/tokens.js";
import { storageSet } from "../auth/storage.js";

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
    return { ok: false, error: data?.error || "Login failed. Please try again." };
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
    console.warn("No current lesson available or failed to fetch current lesson");
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
    console.error("Failed to update current lesson:", response.status, errorBody);
    return false;
  }
  return true;
}

export async function createClass({ name, classType, currentLesson, teacherId }) {
  return authFetch("/classes", {
    method: "POST",
    body: { name, classType, currentLesson, teacherId },
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
    const match = student.ggDocLink.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      links.push({ docId: match[1], tabId: "t.0" });
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
export async function gradeAnswers(items, useCache = true) {
  const response = await authFetch("/grade-cached", {
    method: "POST",
    body: { items, useCache },
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
