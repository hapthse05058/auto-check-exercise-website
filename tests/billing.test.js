import { describe, expect, it } from "vitest";
import {
  formatVnd,
  formatVndDigits,
  gradingCostEstimate,
  isValidTopUp,
  maskMoney,
  parseVndInput,
  stepTopUp,
  PRICE_AUTO_VND,
  PRICE_MANUAL_VND,
  revenueOfTopUp,
  salerCostVnd,
  TOPUP_MAX_VND,
  TOPUP_MIN_VND,
  TOPUP_PRESETS,
  TOPUP_STEP_VND,
} from "../src/lib/billing.js";

describe("prices", () => {
  it("800đ by hand, 700đ auto", () => {
    expect(PRICE_MANUAL_VND).toBe(800);
    expect(PRICE_AUTO_VND).toBe(700);
  });
});

describe("gradingCostEstimate", () => {
  it("is docs × price, against the balance", () => {
    expect(
      gradingCostEstimate({
        docCount: 25,
        unitPriceVnd: 800,
        balanceVnd: 50000,
      }),
    ).toEqual({
      docs: 25,
      unitPriceVnd: 800,
      totalVnd: 20000,
      balanceVnd: 50000,
      enough: true,
      affordableDocs: 25,
      afterVnd: 30000,
    });
  });

  it("a balance short of it says how many docs it covers", () => {
    const cost = gradingCostEstimate({
      docCount: 25,
      unitPriceVnd: 800,
      balanceVnd: 5000,
    });
    expect(cost.enough).toBe(false);
    expect(cost.affordableDocs).toBe(6);
    // Exactly enough is enough.
    expect(
      gradingCostEstimate({ docCount: 2, unitPriceVnd: 700, balanceVnd: 1400 })
        .enough,
    ).toBe(true);
    // A negative balance covers nothing.
    expect(
      gradingCostEstimate({ docCount: 2, unitPriceVnd: 700, balanceVnd: -100 })
        .affordableDocs,
    ).toBe(0);
  });

  it("no balance (admin, no payer) leaves the balance fields null", () => {
    const cost = gradingCostEstimate({ docCount: 3, unitPriceVnd: 700 });
    expect(cost.totalVnd).toBe(2100);
    expect(cost.enough).toBeNull();
    expect(cost.affordableDocs).toBeNull();
    expect(cost.afterVnd).toBeNull();
  });

  it("bad counts read as 0 docs", () => {
    expect(
      gradingCostEstimate({ docCount: undefined, unitPriceVnd: 800 }).totalVnd,
    ).toBe(0);
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

describe("top-up amounts", () => {
  it("any whole đ from 1.000đ to 10.000.000đ, like the backend", () => {
    expect(TOPUP_MIN_VND).toBe(1000);
    expect(TOPUP_MAX_VND).toBe(10000000);
    for (const ok of [1000, 70000, 100000, 123456, 10000000]) {
      expect(isValidTopUp(ok), String(ok)).toBe(true);
    }
    for (const bad of [null, 0, 999, -50000, 10000001, 70000.5, NaN]) {
      expect(isValidTopUp(bad), String(bad)).toBe(false);
    }
  });

  it("presets are round amounts, every one valid", () => {
    expect(TOPUP_PRESETS).toEqual([
      50000, 100000, 200000, 500000, 1000000, 2000000,
    ]);
    expect(TOPUP_PRESETS.every(isValidTopUp)).toBe(true);
  });

  it("− / + go to the next round 50.000đ, within [50k, 10M]", () => {
    expect(TOPUP_STEP_VND).toBe(50000);
    expect(stepTopUp(100000, 1)).toBe(150000);
    expect(stepTopUp(100000, -1)).toBe(50000);
    expect(stepTopUp(123000, 1)).toBe(150000);
    expect(stepTopUp(123000, -1)).toBe(100000);
    expect(stepTopUp(null, 1)).toBe(50000);
    expect(stepTopUp(50000, -1)).toBe(50000);
    expect(stepTopUp(10000000, 1)).toBe(10000000);
  });

  it("reads what was typed as digits only", () => {
    expect(parseVndInput("150.000")).toBe(150000);
    expect(parseVndInput("150000đ")).toBe(150000);
    expect(parseVndInput("1 234 567")).toBe(1234567);
    expect(parseVndInput("")).toBeNull();
    expect(parseVndInput("abc")).toBeNull();
    expect(parseVndInput("9".repeat(20))).toBe(9999999999);
  });

  it("shows the typed amount grouped, without đ", () => {
    expect(formatVndDigits(150000)).toBe("150.000");
    expect(formatVndDigits(null)).toBe("");
  });
});

describe("maskMoney", () => {
  it("returns a mask with no digits", () => {
    expect(maskMoney()).toBe("••••••");
    expect(/\d/.test(maskMoney())).toBe(false);
  });
});
