import { describe, it, expect } from "vitest";
import { validateQb } from "../app/lib/quantity-breaks/validate";

const VALID: Parameters<typeof validateQb>[0] = {
  name: "Test QB",
  status: "draft",
  productId: "gid://shopify/Product/1",
  tiers: [
    { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false },
    { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: false },
    { qty: 3, discountType: "percentage", discountValue: 15, label: "15% off", isMostPopular: true },
  ],
  combinable: false,
};

describe("validateQb", () => {
  it("accepts a valid QB", () => {
    expect(validateQb(VALID)).toEqual({ valid: true });
  });

  it("rejects empty name", () => {
    const r = validateQb({ ...VALID, name: "" });
    expect(r.valid).toBe(false);
  });

  it("rejects missing productId", () => {
    const r = validateQb({ ...VALID, productId: "" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.productId).toBeDefined();
  });

  it("rejects empty tiers", () => {
    const r = validateQb({ ...VALID, tiers: [] });
    expect(r.valid).toBe(false);
  });

  it("rejects more than 10 tiers", () => {
    const tiers = Array.from({ length: 11 }, (_, i) => ({
      qty: i + 1,
      discountType: "percentage" as const,
      discountValue: i,
      label: `Tier ${i}`,
      isMostPopular: false,
    }));
    const r = validateQb({ ...VALID, tiers });
    expect(r.valid).toBe(false);
  });

  it("rejects non-ascending tier qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { qty: 3, discountType: "percentage", discountValue: 10, label: "A", isMostPopular: false },
        { qty: 2, discountType: "percentage", discountValue: 5, label: "B", isMostPopular: false },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects multiple popular tiers", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 5, label: "A", isMostPopular: true },
        { qty: 2, discountType: "percentage", discountValue: 10, label: "B", isMostPopular: true },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid status", () => {
    const r = validateQb({ ...VALID, status: "weird" as never });
    expect(r.valid).toBe(false);
  });
});
