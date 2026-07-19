/**
 * Browser smoke test (node tests/e2e-smoke.mjs).
 * Requires the dev server on :5173 and the backend on :3000.
 * Uses the system Chrome via Playwright (no browser download).
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";
let failures = 0;

function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

// --- 1. Unauthenticated: every protected route redirects to /login --------
for (const route of [
  "/",
  "/grade",
  "/classes/new",
  "/students/add",
  "/missing-teacher",
  "/signup",
]) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  check(
    `${route} redirects to /login when logged out`,
    page.url().endsWith("/login"),
  );
}

// --- 2. Public routes render their headings -------------------------------
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
check(
  "/login shows Login panel",
  await page.locator("h4:has-text('Login')").isVisible(),
);
check(
  "/login shows username tab active",
  await page
    .locator(".method-tab.active:has-text('Username/Password')")
    .isVisible(),
);

await page.click(".method-tab:has-text('Google Login')");
check(
  "Google tab switch shows Gmail button",
  await page.locator("button:has-text('Login by Gmail')").isVisible(),
);
await page.click(".method-tab:has-text('Username/Password')");

// --- 3. Login validation + real backend 401 -------------------------------
await page.click("button:has-text('Login')");
check(
  "empty login shows validation message",
  await page
    .locator("text=Please enter both username and password.")
    .isVisible(),
);

await page.fill("#loginUsername", "definitely-not-a-user-xyz");
await page.fill("#loginPassword", "wrongpassword");
await page.click("button:has-text('Login')");
await page.waitForTimeout(1500);
const loginStatus = await page.locator(".status-line").textContent();
check(
  "bad credentials hit real backend and show error",
  /Invalid username or password|Login failed|Error connecting/.test(
    loginStatus || "",
  ),
  (loginStatus || "").trim(),
);

// --- 4. Forgot password flow ----------------------------------------------
await page.click("text=Forgot password?");
await page.waitForURL("**/forgot-password");
check("forgot-password route reachable from login", true);
await page.click("button:has-text('Send Reset Email')");
check(
  "empty reset shows validation",
  await page.locator("text=Please enter your username or email.").isVisible(),
);
await page.fill("#resetIdentifier", "no-such-user-xyz@example.com");
await page.click("button:has-text('Send Reset Email')");
await page.waitForTimeout(1500);
const resetStatus = await page.locator(".status-line").textContent();
check(
  "bogus reset identifier surfaces backend response",
  !!resetStatus?.trim(),
  (resetStatus || "").trim(),
);

// --- 5. Reset-password guard (no token in sessionStorage) ------------------
await page.goto(BASE + "/reset-password", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
check(
  "reset-password without token redirects to /forgot-password",
  page.url().endsWith("/forgot-password"),
);

// With a token present, the form renders and validates mismatched passwords.
await page.goto(BASE + "/login");
await page.evaluate(() => sessionStorage.setItem("reset_token", "smoke-token"));
await page.goto(BASE + "/reset-password", { waitUntil: "networkidle" });
check(
  "reset-password with token renders the form",
  await page.locator("h4:has-text('Create New Password')").isVisible(),
);
await page.fill("#newPasswordInput", "abcdef1");
await page.fill("#confirmPasswordInput", "different1");
await page.click("button:has-text('Reset Password')");
check(
  "reset-password validates mismatched passwords",
  await page.locator("text=Passwords do not match").isVisible(),
);
await page.evaluate(() => sessionStorage.removeItem("reset_token"));

// --- 6. Fake session: protected pages render + error paths -----------------
await page.goto(BASE + "/login");
await page.evaluate(() => {
  localStorage.setItem(
    "ace_access_token",
    JSON.stringify("fake-token-for-smoke-test"),
  );
  localStorage.setItem(
    "ace_expiry_date",
    JSON.stringify(Date.now() + 3600 * 1000),
  );
});
await page.goto(BASE + "/grade", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
check(
  "fake session keeps /grade route (no redirect)",
  page.url().includes("/grade"),
);
const gradeStatus = await page.locator(".status-output").textContent();
check(
  "/grade surfaces teacher-info failure for invalid JWT",
  /Failed to load teacher data|Loading teacher info/.test(gradeStatus || ""),
  (gradeStatus || "").trim(),
);
check(
  "process button disabled without class+lesson",
  await page.locator("button:has-text('Process All Documents')").isDisabled(),
);

await page.goto(BASE + "/students/add", { waitUntil: "networkidle" });
check(
  "/students/add renders student manager",
  await page.locator("h2:has-text('Student list')").isVisible(),
);
await page.click("button:has-text('Add student')");
check(
  "add-student modal opens",
  await page.locator(".modal-bg.open").isVisible(),
);
await page.click("button:has-text('Save Student')");
check(
  "student modal validates empty fields",
  await page.locator("text=Please enter the student's full name.").isVisible(),
);
await page.fill(".modal input[type='text']", "Nguyễn Văn A");
await page.fill(".modal input[type='email']", "a@gmail.com");
await page.fill(
  ".modal input[type='url']",
  "https://docs.google.com/document/d/abc/edit",
);
await page.click("button:has-text('Save Student')");
check(
  "student card appears after save",
  await page.locator(".student-card:has-text('Nguyễn Văn A')").isVisible(),
);
check(
  "count badge updates",
  (await page.locator(".count-badge").textContent())?.includes("1 student"),
);

await page.goto(BASE + "/classes/new", { waitUntil: "networkidle" });
check(
  "/classes/new renders form",
  await page.locator("h4:has-text('Create New Class')").isVisible(),
);
check(
  "save class disabled when empty",
  await page.locator("button:has-text('Save Class')").isDisabled(),
);

// --- 7. Auth callback error handling ---------------------------------------
await page.goto(BASE + "/auth/callback?error=access_denied", {
  waitUntil: "networkidle",
});
check(
  "auth callback shows cancellation error",
  await page.locator("text=cancelled or failed").isVisible(),
);

// --- 8. Logout clears the session ------------------------------------------
await page.goto(BASE + "/grade", { waitUntil: "networkidle" });
await page.click("button:has-text('Logout')");
await page.waitForURL("**/login");
const remaining = await page.evaluate(() =>
  localStorage.getItem("ace_access_token"),
);
check("logout clears tokens and returns to /login", remaining === null);

// --- Console errors ----------------------------------------------------------
const realErrors = consoleErrors.filter(
  (e) =>
    !e.includes("401") && // expected auth failures against the real backend
    !e.includes("403") &&
    !e.includes("Failed to load resource") &&
    !e.includes("teacher info") &&
    // console.error logs from failure paths this test intentionally triggers
    // (the extension logs the same way):
    !e.includes("Forgot password error") &&
    !e.includes("Error loading class types") &&
    !e.includes("Error fetching classes"),
);
check(
  "no unexpected console/page errors",
  realErrors.length === 0,
  realErrors.slice(0, 5).join(" | "),
);

await browser.close();
console.log(
  failures === 0
    ? "\nALL SMOKE TESTS PASSED"
    : `\n${failures} SMOKE TEST(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
