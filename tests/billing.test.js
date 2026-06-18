import { describe, expect, it } from "vitest";
import {
  maskMoney,
  netRevenueVnd,
  outstandingCommissionVnd,
  salerCostVnd,
  sumPaidCommissionVnd,
} from "../src/lib/billing.js";

describe("salerCostVnd", () => {
  it("one top-up step (70000) → 10000", () => {
    expect(salerCostVnd(70000)).toBe(10000);
  });
  it("zero / falsy → 0", () => {
    expect(salerCostVnd(0)).toBe(0);
    expect(salerCostVnd(undefined)).toBe(0);
    expect(salerCostVnd(null)).toBe(0);
  });
  it("rounds to nearest VND", () => {
    expect(salerCostVnd(1000)).toBe(143); // 142.857… → 143
    expect(salerCostVnd(4900)).toBe(700); // exact
  });
});

describe("outstandingCommissionVnd", () => {
  it("missing/zero settled → full cost", () => {
    expect(outstandingCommissionVnd(70000, 0)).toBe(10000);
    expect(outstandingCommissionVnd(70000, undefined)).toBe(10000);
  });
  it("settled === total → 0", () => {
    expect(outstandingCommissionVnd(70000, 70000)).toBe(0);
  });
  it("settled > total clamps to 0", () => {
    expect(outstandingCommissionVnd(70000, 140000)).toBe(0);
  });
  it("partial accrual since settlement", () => {
    expect(outstandingCommissionVnd(140000, 70000)).toBe(10000);
  });
});

describe("sumPaidCommissionVnd", () => {
  it("empty / non-array → 0", () => {
    expect(sumPaidCommissionVnd([])).toBe(0);
    expect(sumPaidCommissionVnd(undefined)).toBe(0);
  });
  it("sums entries, ignoring bad values", () => {
    expect(
      sumPaidCommissionVnd([
        { commissionVnd: 10000 },
        { commissionVnd: 5000 },
        { commissionVnd: undefined },
        {},
      ]),
    ).toBe(15000);
  });
});

describe("netRevenueVnd", () => {
  it("total minus paid commission", () => {
    expect(netRevenueVnd(140000, 10000)).toBe(130000);
    expect(netRevenueVnd(0, 0)).toBe(0);
  });
});

describe("maskMoney", () => {
  it("returns a mask with no digits", () => {
    expect(maskMoney()).toBe("••••••");
    expect(/\d/.test(maskMoney())).toBe(false);
  });
});
