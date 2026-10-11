// Pure billing math: grading prices, the teacher balance (in VND) and the admin
// revenue panel. Mirrors the backend (auto-check-exercise-be/backend/lib/billing.js)
// — keep both in sync. No React/DOM here so it can be unit-tested directly (see
// tests/billing.test.js).

/** Price of one doc graded by hand (the grading screen, IELTS paste). */
export const PRICE_MANUAL_VND = 800;
/** Price of one doc graded by a scheduled ("chấm tự động") run. */
export const PRICE_AUTO_VND = 700;

/**
 * A top-up is any whole number of đ in [1.000đ, 10.000.000đ] — what the
 * teacher actually paid (backend isValidTopUp). The ceiling only catches a
 * mistyped extra zero.
 */
export const TOPUP_MIN_VND = 1000;
export const TOPUP_MAX_VND = 10000000;
/** The − / + buttons move by round 50.000đ steps. */
export const TOPUP_STEP_VND = 50000;
/** Quick picks: round amounts. */
export const TOPUP_PRESETS = [50000, 100000, 200000, 500000, 1000000, 2000000];

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

/**
 * What grading `docCount` docs at `unitPriceVnd` each can cost: every doc a
 * run writes feedback into is charged once, so docs × price is the most it
 * takes. A run starts only when the balance covers every doc it is about to
 * write (backend canAfford), hence `affordableDocs`.
 *
 * `balanceVnd` null/undefined (an admin grading a class with no payer) leaves
 * the balance fields null.
 *
 * @returns {{docs: number, unitPriceVnd: number, totalVnd: number,
 *   balanceVnd: number|null, enough: boolean|null,
 *   affordableDocs: number|null, afterVnd: number|null}}
 */
export function gradingCostEstimate({ docCount, unitPriceVnd, balanceVnd }) {
  const docs = Math.max(0, Math.floor(Number(docCount) || 0));
  const price = Math.max(0, Math.round(Number(unitPriceVnd) || 0));
  const totalVnd = docs * price;
  if (!Number.isFinite(balanceVnd)) {
    return {
      docs,
      unitPriceVnd: price,
      totalVnd,
      balanceVnd: null,
      enough: null,
      affordableDocs: null,
      afterVnd: null,
    };
  }
  const affordable = price ? Math.floor(Math.max(0, balanceVnd) / price) : docs;
  return {
    docs,
    unitPriceVnd: price,
    totalVnd,
    balanceVnd,
    enough: balanceVnd >= totalVnd,
    affordableDocs: Math.min(docs, affordable),
    afterVnd: balanceVnd - totalVnd,
  };
}

/** A top-up the backend accepts: a whole number of đ within [min, max]. */
export function isValidTopUp(amountVnd) {
  return (
    Number.isInteger(amountVnd) &&
    amountVnd >= TOPUP_MIN_VND &&
    amountVnd <= TOPUP_MAX_VND
  );
}

/**
 * The − / + buttons: to the next round step down or up, so a typed 123.000đ
 * becomes 100.000đ or 150.000đ rather than 73.000đ / 173.000đ. Kept within
 * [step, max]; `direction` is -1 or 1.
 */
export function stepTopUp(amountVnd, direction) {
  const amount = Math.max(0, Math.round(Number(amountVnd) || 0));
  const next =
    direction > 0
      ? (Math.floor(amount / TOPUP_STEP_VND) + 1) * TOPUP_STEP_VND
      : (Math.ceil(amount / TOPUP_STEP_VND) - 1) * TOPUP_STEP_VND;
  return Math.min(TOPUP_MAX_VND, Math.max(TOPUP_STEP_VND, next));
}

/**
 * What the admin typed in the amount box, as đ: digits only, so "150.000",
 * "150000đ" and "150 000" all read 150000. Empty → null. Capped at 10 digits
 * so a held-down key cannot grow it past a safe integer.
 */
export function parseVndInput(text) {
  const digits = String(text ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);
  return digits ? Number(digits) : null;
}

/** 150000 → "150.000": the amount box's text while typing (no "đ"). */
export function formatVndDigits(amountVnd) {
  if (!Number.isFinite(amountVnd)) return "";
  return formatVnd(amountVnd).replace(/đ$/, "");
}

/** Mask used for a hidden money value (never exposes the real digits). */
export function maskMoney() {
  return "••••••";
}
