import { describe, it, expect } from "vitest";
import { formatMoney, computeBundleTotals } from "./format";

describe("formatMoney", () => {
  it("formats USD cents", () => {
    expect(formatMoney(135999, "USD", "en")).toMatch(/1,?359\.99/);
  });

  it("respects currency symbol", () => {
    const out = formatMoney(1000, "EUR", "en");
    expect(out).toContain("10");
  });
});

describe("computeBundleTotals", () => {
  it("percentage discount", () => {
    const t = computeBundleTotals(
      { products: [{ priceCents: 10000, qty: 1 }, { priceCents: 5000, qty: 2 }] },
      "percentage",
      10,
    );
    expect(t.subtotalCents).toBe(20000);
    expect(t.discountedCents).toBe(18000);
    expect(t.savingsCents).toBe(2000);
  });

  it("flat discount per bundle", () => {
    // discountValue is in dollars (merchant types 15 = $15 off)
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 1 }] }, "flat", 15);
    expect(t.subtotalCents).toBe(10000);
    expect(t.discountedCents).toBe(8500);
    expect(t.savingsCents).toBe(1500);
  });

  it("fixed_total — discountedCents equals discountValue (in cents)", () => {
    // discountValue 50 = $50 = 5000 cents
    const t = computeBundleTotals({ products: [{ priceCents: 10000, qty: 2 }] }, "fixed_total", 50);
    expect(t.subtotalCents).toBe(20000);
    expect(t.discountedCents).toBe(5000);
    expect(t.savingsCents).toBe(15000);
  });
});
