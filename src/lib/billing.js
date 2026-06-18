// Pure billing math for the admin saler-commission panel. Mirrors the backend
// (auto-check-exercise-be/backend/lib/billing.js) — keep both in sync. No React/DOM
// here so it can be unit-tested directly (see tests/billing.test.js).

/** VND per grading point (1 point = 700đ). */
export const VND_PER_POINT = 700;
/** Saler commission per point, in VND. */
export const COMMISSION_VND_PER_POINT = 100;

/** Total saler commission earned on a topped-up amount: round(total / 700 * 100). */
export function salerCostVnd(totalTopUpVnd) {
  const total = Number(totalTopUpVnd) || 0;
  return Math.round((total / VND_PER_POINT) * COMMISSION_VND_PER_POINT);
}

/**
 * Commission not yet settled: the saler cost on the top-ups accrued since the
 * last settlement (`total - settled`, clamped at 0).
 */
export function outstandingCommissionVnd(totalTopUpVnd, settledTopUpVnd) {
  const total = Number(totalTopUpVnd) || 0;
  const settled = Number(settledTopUpVnd) || 0;
  return salerCostVnd(Math.max(0, total - settled));
}

/** Sum of commission paid across all settlement-history entries. */
export function sumPaidCommissionVnd(history) {
  if (!Array.isArray(history)) return 0;
  return history.reduce((sum, h) => sum + (Number(h?.commissionVnd) || 0), 0);
}

/** Net revenue kept after paying the saler: total topped up minus commission already paid. */
export function netRevenueVnd(totalTopUpVnd, paidCommissionVnd) {
  const total = Number(totalTopUpVnd) || 0;
  const paid = Number(paidCommissionVnd) || 0;
  return total - paid;
}

/** Mask used for a hidden money value (never exposes the real digits). */
export function maskMoney() {
  return "••••••";
}
