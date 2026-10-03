// Pure billing math: grading prices, the teacher balance (in VND) and the admin
// revenue panel. Mirrors the backend (auto-check-exercise-be/backend/lib/billing.js)
// — keep both in sync. No React/DOM here so it can be unit-tested directly (see
// tests/billing.test.js).

/** Price of one doc graded by hand (the grading screen, IELTS paste). */
export const PRICE_MANUAL_VND = 800;
/** Price of one doc graded by a scheduled ("chấm tự động") run. */
export const PRICE_AUTO_VND = 700;

/** Top-ups are whole multiples of 70.000đ, up to 100 steps. */
export const TOPUP_STEP_VND = 70000;
export const TOPUP_MAX_VND = 7000000;

/** Admin revenue from a top-up: amount × 6/7 (≈ 0.85714; 70.000đ → 60.000đ). */
export function revenueOfTopUp(amountVnd) {
  const amount = Number(amountVnd) || 0;
  return Math.round((amount * 6) / 7);
}

/**
 * Saler commission matching a revenue total: revenue / 6 (= top-up / 7).
 * Display-only — the saler takes this upfront; it does not reduce the admin's revenue.
 */
export function salerCostVnd(totalRevenueVnd) {
  const total = Number(totalRevenueVnd) || 0;
  return Math.round(total / 6);
}

/** 12345 → "12.345đ" (Vietnamese grouping, whatever the UI language). */
export function formatVnd(amountVnd) {
  const n = Math.round(Number(amountVnd) || 0);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${digits}đ`;
}

/** Clamps a top-up to a valid multiple of the step, within [step, max]. */
export function clampTopUp(amountVnd) {
  const steps = Math.round((Number(amountVnd) || 0) / TOPUP_STEP_VND);
  const max = TOPUP_MAX_VND / TOPUP_STEP_VND;
  return Math.min(max, Math.max(1, steps)) * TOPUP_STEP_VND;
}

/** Mask used for a hidden money value (never exposes the real digits). */
export function maskMoney() {
  return "••••••";
}
