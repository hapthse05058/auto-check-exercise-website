import { describe, expect, it } from "vitest";
import {
  clampTopUp,
  formatVnd,
  maskMoney,
  PRICE_AUTO_VND,
  PRICE_MANUAL_VND,
  revenueOfTopUp,
  salerCostVnd,
  TOPUP_STEP_VND,
} from "../src/lib/billing.js";

describe("prices", () => {
  it("800đ by hand, 700đ auto", () => {
    expect(PRICE_MANUAL_VND).toBe(800);
    expect(PRICE_AUTO_VND).toBe(700);
  });
});

describe("revenueOfTopUp", () => {
  it("is 6/7 of the amount (70.000đ → 60.000đ)", () => {
    expect(revenueOfTopUp(70000)).toBe(60000);
    expect(revenueOfTopUp(700000)).toBe(600000);
    expect(revenueOfTopUp(undefined)).toBe(0);
  });
});

describe("salerCostVnd", () => {
  it("is revenue/6 (= top-up/7)", () => {
    expect(salerCostVnd(60000)).toBe(10000);
    expect(salerCostVnd(revenueOfTopUp(140000))).toBe(20000);
  });
  it("zero / falsy → 0", () => {
    expect(salerCostVnd(0)).toBe(0);
    expect(salerCostVnd(undefined)).toBe(0);
    expect(salerCostVnd(null)).toBe(0);
  });
});

describe("formatVnd", () => {
  it("groups thousands with dots", () => {
    expect(formatVnd(800)).toBe("800đ");
    expect(formatVnd(70000)).toBe("70.000đ");
    expect(formatVnd(1234567)).toBe("1.234.567đ");
    expect(formatVnd(-1600)).toBe("-1.600đ");
    expect(formatVnd(null)).toBe("0đ");
  });
});

describe("clampTopUp", () => {
  it("snaps to a multiple of 70.000đ within [70k, 7M]", () => {
    expect(TOPUP_STEP_VND).toBe(70000);
    expect(clampTopUp(140000)).toBe(140000);
    expect(clampTopUp(100000)).toBe(70000); // nearest step
    expect(clampTopUp(110000)).toBe(140000);
    expect(clampTopUp(0)).toBe(70000);
    expect(clampTopUp(-70000)).toBe(70000);
    expect(clampTopUp(99999999)).toBe(7000000);
  });
});

describe("maskMoney", () => {
  it("returns a mask with no digits", () => {
    expect(maskMoney()).toBe("••••••");
    expect(/\d/.test(maskMoney())).toBe(false);
  });
});
