// Pure billing math for the admin revenue panel. Mirrors the backend
// (auto-check-exercise-be/backend/lib/billing.js) — keep both in sync. No React/DOM
// here so it can be unit-tested directly (see tests/billing.test.js).

/** VND per grading point (1 point = 600đ). */
export const VND_PER_POINT = 600;
/** Saler commission per point, in VND. */
export const COMMISSION_VND_PER_POINT = 100;

/**
 * Saler commission earned on a topped-up amount: round(total / 600 * 100) = total/6.
 * Display-only — the saler takes this upfront; it does not reduce the admin's revenue.
 */
export function salerCostVnd(totalTopUpVnd) {
  const total = Number(totalTopUpVnd) || 0;
  return Math.round((total / VND_PER_POINT) * COMMISSION_VND_PER_POINT);
}

/** Mask used for a hidden money value (never exposes the real digits). */
export function maskMoney() {
  return "••••••";
}
