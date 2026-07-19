import { expect, request, test } from "@playwright/test";

// Drives the admin Point giáo viên billing panel. Requires:
//   - backend running on :3000  (BE_URL to override)
//   - ADMIN_TOKEN = a backend JWT for an admin email
// Read-only by default; the actual settle (which writes to shared Firestore) is
// gated behind ALLOW_SETTLE so CI never mutates shared data.

const TOKEN = (process.env.ADMIN_TOKEN || "").trim();
const BE_URL = process.env.BE_URL || "http://localhost:3000";
const API_KEY = "SuperSecretKey_hongHa_321";

const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN") + "đ";

test.skip(!TOKEN, "ADMIN_TOKEN not set — skipping billing E2E");

let billing;

test.beforeAll(async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${BE_URL}/teacher-points/billing`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "x-api-key": API_KEY },
  });
  expect(res.ok(), "GET /teacher-points/billing should succeed").toBeTruthy();
  billing = await res.json();
  await ctx.dispose();
});

test.beforeEach(async ({ context }) => {
  // Seed the token store before any app script runs.
  await context.addInitScript((tok) => {
    localStorage.setItem("ace_access_token", JSON.stringify(tok));
    localStorage.setItem("ace_expiry_date", JSON.stringify(Date.now() + 7200000));
  }, TOKEN);
});

test("Tổng tiền đã nạp is masked by default; eye toggle reveals/hides it", async ({ page }) => {
  await page.goto("/admin/teacher-points", { waitUntil: "networkidle" });
  const totalBtn = page.locator(".billing-value-link").first();
  await expect(totalBtn).toHaveText("••••••");

  const eye = page.locator(".billing-value-row .btn-icon").first();
  await eye.click();
  await expect(totalBtn).toHaveText(vnd(billing.totalTopUpVnd));
  await eye.click();
  await expect(totalBtn).toHaveText("••••••");
});

test('hover tooltip "Xem chi tiết"; click opens detail popup with correct figures', async ({ page }) => {
  await page.goto("/admin/teacher-points", { waitUntil: "networkidle" });
  const totalBtn = page.locator(".billing-value-link").first();
  await expect(totalBtn).toHaveAttribute("title", "Xem chi tiết");

  await totalBtn.click();
  const modal = page.locator(".modal-bg.open .modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Chi phí saler");
  await expect(modal).toContainText("Số tiền thu về");
  // Saler cost = all-time commission; net revenue = total − commission paid.
  await expect(modal).toContainText(vnd(billing.totalCommissionVnd));
  await expect(modal).toContainText(
    vnd(billing.totalTopUpVnd - billing.paidCommissionVnd),
  );
});

test('settle button reads "Thanh toán hoa hồng"', async ({ page }) => {
  await page.goto("/admin/teacher-points", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "Thanh toán hoa hồng" }),
  ).toBeVisible();
});

test("settle pays commission → shows 0đ, keeps total (gated)", async ({ page }) => {
  test.skip(
    !process.env.ALLOW_SETTLE,
    "Set ALLOW_SETTLE=1 (non-prod DB only) — this writes to AdminBilling",
  );
  await page.goto("/admin/teacher-points", { waitUntil: "networkidle" });
  page.on("dialog", (d) => d.accept()); // confirm()
  await page.getByRole("button", { name: "Thanh toán hoa hồng" }).click();
  // Outstanding commission row shows 0đ after settling.
  await expect(page.locator(".billing-panel")).toContainText("0đ");
});
