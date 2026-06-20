import { describe, expect, it } from "vitest";
import { maskMoney, salerCostVnd, VND_PER_POINT } from "../src/lib/billing.js";

describe("VND_PER_POINT", () => {
  it("is 600 (60.000đ → 100 points)", () => {
    expect(VND_PER_POINT).toBe(600);
    expect(60000 / VND_PER_POINT).toBe(100);
  });
});

describe("salerCostVnd", () => {
  it("one top-up step (60000) → 10000", () => {
    expect(salerCostVnd(60000)).toBe(10000);
  });
  it("zero / falsy → 0", () => {
    expect(salerCostVnd(0)).toBe(0);
    expect(salerCostVnd(undefined)).toBe(0);
    expect(salerCostVnd(null)).toBe(0);
  });
  it("is total/6, rounded to nearest VND", () => {
    expect(salerCostVnd(1000)).toBe(167); // 166.67 → 167
    expect(salerCostVnd(600000)).toBe(100000); // exact
  });
});

describe("maskMoney", () => {
  it("returns a mask with no digits", () => {
    expect(maskMoney()).toBe("••••••");
    expect(/\d/.test(maskMoney())).toBe(false);
  });
});
