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
  afterAddToCart: "drawer",
  showAddToCart: true,
  showBuyNow: false,
  headline: null,
  ctaLabel: null,
  styleOverrides: null,
  textOverrides: null,
  visibility: "all",
  visibilityProductIds: [],
  visibilityCollectionIds: [],
};

describe("validateQb", () => {
  it("accepts a valid QB", () => {
    expect(validateQb(VALID)).toEqual({ valid: true, afterAddToCart: "drawer", showAddToCart: true, showBuyNow: false });
  });

  it("rejects empty name", () => {
    const r = validateQb({ ...VALID, name: "" });
    expect(r.valid).toBe(false);
  });

  it("rejects missing productId unless bindToCurrentProduct is true", () => {
    const r = validateQb({ ...VALID, productId: "" });
    expect(r.valid).toBe(false);
  });

  it("accepts missing productId when bindToCurrentProduct is true", () => {
    const r = validateQb({ ...VALID, productId: "", bindToCurrentProduct: true });
    expect(r.valid).toBe(true);
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

  it("accepts a tier with a free gift variant", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, freeGiftVariantId: "gid://shopify/ProductVariant/1" },
      ],
    });
    expect(r).toEqual({ valid: true, afterAddToCart: "drawer", showAddToCart: true, showBuyNow: false });
  });

  it("accepts a tier with bogo add_same + targetVariantId + bonusQty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/1", bonusQty: 1 } },
      ],
    });
    expect(r).toEqual({ valid: true, afterAddToCart: "drawer", showAddToCart: true, showBuyNow: false });
  });

  it("accepts a tier with bogo nth_free where bonusQty < qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, qty: 3, bogo: { mode: "nth_free", bonusQty: 1 } },
      ],
    });
    expect(r).toEqual({ valid: true, afterAddToCart: "drawer", showAddToCart: true, showBuyNow: false });
  });

  it("rejects bogo add_same without a targetVariantId", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", bonusQty: 1 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects bogo nth_free with bonusQty >= qty", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, qty: 2, bogo: { mode: "nth_free", bonusQty: 2 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("rejects bogo with bonusQty < 1", () => {
    const r = validateQb({
      ...VALID,
      tiers: [
        { ...VALID.tiers[0]!, bogo: { mode: "add_same", targetVariantId: "gid://shopify/ProductVariant/1", bonusQty: 0 } },
      ],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.tiers).toBeDefined();
  });

  it("keeps a valid afterAddToCart value", () => {
    const r = validateQb({ ...VALID, afterAddToCart: "checkout" });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.afterAddToCart).toBe("checkout");
  });

  it("normalizes a bogus afterAddToCart value to drawer", () => {
    const r = validateQb({ ...VALID, afterAddToCart: "bogus" });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.afterAddToCart).toBe("drawer");
  });

  it("normalizes a missing afterAddToCart value to drawer", () => {
    const r = validateQb({ ...VALID, afterAddToCart: undefined as unknown as string });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.afterAddToCart).toBe("drawer");
  });

  it("round-trips showAddToCart / showBuyNow", () => {
    const r = validateQb({ ...VALID, showAddToCart: false, showBuyNow: true });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.showAddToCart).toBe(false);
      expect(r.showBuyNow).toBe(true);
    }
  });
});

describe("validateQb textOverrides + styleOverrides + headline/cta", () => {
  const baseInput = {
    name: "x",
    status: "draft",
    productId: "gid://shopify/Product/1",
    tiers: [{ qty: 1, discountType: "percentage" as const, discountValue: 10, label: "Buy 1", isMostPopular: false }],
    combinable: false,
    afterAddToCart: "drawer",
    showAddToCart: true,
    showBuyNow: false,
    headline: null,
    ctaLabel: null,
    visibility: "all" as const,
    visibilityProductIds: [],
    visibilityCollectionIds: [],
  };

  it("accepts null overrides", () => {
    expect(validateQb({ ...baseInput, textOverrides: null, styleOverrides: null }).valid).toBe(true);
  });

  it("accepts curated text override keys", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: { "qb.tierLabel": "Get {qty}", "qb.mostPopular": "Top pick" },
      styleOverrides: null,
    });
    expect(r.valid).toBe(true);
  });

  it("rejects unknown text override key (e.g. qb.heading is a column)", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: { "qb.heading": "x" } as Record<string, string>,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
  });

  it("rejects non-hex color", () => {
    const r = validateQb({
      ...baseInput,
      textOverrides: null,
      styleOverrides: { textColor: "black" },
    });
    expect(r.valid).toBe(false);
  });

  it("rejects headline > 100 chars", () => {
    const r = validateQb({
      ...baseInput,
      headline: "x".repeat(101),
      textOverrides: null,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
  });

  it("rejects ctaLabel > 50 chars", () => {
    const r = validateQb({
      ...baseInput,
      ctaLabel: "x".repeat(51),
      textOverrides: null,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
  });

  it("accepts borderRadius at boundaries 0 and 24", () => {
    expect(validateQb({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 0 } }).valid).toBe(true);
    expect(validateQb({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 24 } }).valid).toBe(true);
  });

  it("rejects non-integer borderRadius", () => {
    const r = validateQb({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 12.5 } });
    expect(r.valid).toBe(false);
  });
});
