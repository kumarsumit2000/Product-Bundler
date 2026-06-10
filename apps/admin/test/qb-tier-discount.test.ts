import { describe, it, expect } from "vitest";
import { tierDiscountTab, applyDiscountTab } from "../app/lib/qb-tier-discount";

const t = (over: Record<string, unknown> = {}) => ({ qty: 2, discountType: "percentage" as const, discountValue: 20, label: "", isMostPopular: false, bogoMode: "" as const, bogoBonusQty: 1, ...over });

describe("tierDiscountTab", () => {
  it("bogoMode set → bogo", () => { expect(tierDiscountTab(t({ bogoMode: "add_same" }))).toBe("bogo"); });
  it("fixed_per_unit → fixed_per_unit", () => { expect(tierDiscountTab(t({ discountType: "fixed_per_unit" }))).toBe("fixed_per_unit"); });
  it("value 0 → none", () => { expect(tierDiscountTab(t({ discountValue: 0 }))).toBe("none"); });
  it("flat>0 → flat", () => { expect(tierDiscountTab(t({ discountType: "flat", discountValue: 5 }))).toBe("flat"); });
  it("percentage>0 → percentage", () => { expect(tierDiscountTab(t())).toBe("percentage"); });
});

describe("applyDiscountTab", () => {
  it("none zeroes value + clears bogo", () => {
    const out = applyDiscountTab(t({ bogoMode: "add_same", discountValue: 30 }), "none");
    expect(out.discountValue).toBe(0); expect(out.bogoMode).toBe(""); expect(out.discountType).toBe("percentage");
  });
  it("bogo sets a default mode when none set", () => {
    const out = applyDiscountTab(t(), "bogo");
    expect(out.bogoMode).toBe("add_same"); expect(out.bogoBonusQty).toBe(1);
  });
  it("switching to flat clears bogo and sets type", () => {
    const out = applyDiscountTab(t({ bogoMode: "nth_free" }), "flat");
    expect(out.discountType).toBe("flat"); expect(out.bogoMode).toBe("");
  });
  it("fixed_per_unit sets type and clears bogo", () => {
    const out = applyDiscountTab(t({ bogoMode: "add_same" }), "fixed_per_unit");
    expect(out.discountType).toBe("fixed_per_unit"); expect(out.bogoMode).toBe("");
  });
});
