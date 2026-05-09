import { describe, it, expect } from "vitest";
import { validateBundle } from "../app/lib/bundles/validate";

const VALID: Parameters<typeof validateBundle>[0] = {
  name: "Test bundle",
  status: "draft",
  products: [
    { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
    { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
  ],
  discountType: "percentage",
  discountValue: 20,
  combinable: false,
  triggerProductIds: [],
  headline: null,
  ctaLabel: null,
  mode: "classic",
  collectionId: null,
  targetQty: null,
  styleOverrides: null,
  textOverrides: null,
      subscription: null,
  freeGiftVariantId: null,
};

describe("validateBundle", () => {
  it("accepts a valid bundle", () => {
    expect(validateBundle(VALID)).toEqual({ valid: true });
  });

  it("rejects empty name", () => {
    const r = validateBundle({ ...VALID, name: "" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.name).toBeDefined();
  });

  it("rejects name longer than 100 chars", () => {
    const r = validateBundle({ ...VALID, name: "a".repeat(101) });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.name).toBeDefined();
  });

  it("rejects fewer than 2 products", () => {
    const r = validateBundle({ ...VALID, products: [VALID.products[0]!] });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.products).toBeDefined();
  });

  it("rejects qty below 1", () => {
    const r = validateBundle({
      ...VALID,
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 0 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects qty above 100", () => {
    const r = validateBundle({
      ...VALID,
      products: [
        { productId: "gid://shopify/Product/1", variantId: null, qty: 101 },
        { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
      ],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid discount type", () => {
    const r = validateBundle({ ...VALID, discountType: "bogus" as never });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.discountType).toBeDefined();
  });

  it("rejects discount value of zero or below", () => {
    const r = validateBundle({ ...VALID, discountValue: 0 });
    expect(r.valid).toBe(false);
  });

  it("rejects percentage above 100", () => {
    const r = validateBundle({ ...VALID, discountType: "percentage", discountValue: 150 });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid status", () => {
    const r = validateBundle({ ...VALID, status: "weird" as never });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.status).toBeDefined();
  });

  it("accepts a valid mix_match bundle", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 3,
    });
    expect(r).toEqual({ valid: true });
  });

  it("rejects mix_match without collectionId", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: null,
      targetQty: 3,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.collectionId).toBeDefined();
  });

  it("rejects mix_match with targetQty below 2", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 1,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.targetQty).toBeDefined();
  });

  it("rejects mix_match with non-empty products", () => {
    const r = validateBundle({
      ...VALID,
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: 3,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.products).toBeDefined();
  });

  it("rejects classic with empty products", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "classic",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects mix_match with NaN targetQty", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: Number.NaN,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.targetQty).toBeDefined();
  });

  it("rejects mix_match with null targetQty", () => {
    const r = validateBundle({
      ...VALID,
      products: [],
      mode: "mix_match",
      collectionId: "gid://shopify/Collection/1",
      targetQty: null,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.targetQty).toBeDefined();
  });
});

describe("validateBundle textOverrides + styleOverrides", () => {
  const baseInput = {
    name: "x",
    status: "draft",
    products: [
      { productId: "gid://shopify/Product/1", variantId: null, qty: 1 },
      { productId: "gid://shopify/Product/2", variantId: null, qty: 1 },
    ],
    discountType: "percentage",
    discountValue: 10,
    combinable: false,
    triggerProductIds: [],
    headline: null,
    ctaLabel: null,
    mode: "classic" as const,
    collectionId: null,
    targetQty: null,
    freeGiftVariantId: null,
    subscription: null,
  };

  it("accepts null textOverrides + styleOverrides", () => {
    const r = validateBundle({ ...baseInput, textOverrides: null, styleOverrides: null });
    expect(r.valid).toBe(true);
  });

  it("accepts a partial textOverrides object", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.totalLabel": "Your total" },
      styleOverrides: { primaryColor: "#FF0000" },
    });
    expect(r.valid).toBe(true);
  });

  it("rejects textOverride values longer than 120 chars", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.totalLabel": "x".repeat(121) },
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.textOverrides).toMatch(/120/);
  });

  it("rejects unknown text override keys", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.heading": "x" } as Record<string, string>,
      styleOverrides: null,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.textOverrides).toBeDefined();
  });

  it("rejects non-hex primaryColor", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: null,
      subscription: null,
      styleOverrides: { primaryColor: "red" },
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.styleOverrides).toMatch(/color/i);
  });

  it("rejects borderRadius outside 0–24", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: null,
      subscription: null,
      styleOverrides: { borderRadius: 99 },
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.styleOverrides).toMatch(/radius/i);
  });

  it("accepts borderRadius at boundaries 0 and 24", () => {
    expect(validateBundle({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 0 } }).valid).toBe(true);
    expect(validateBundle({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 24 } }).valid).toBe(true);
  });

  it("rejects non-integer borderRadius", () => {
    const r = validateBundle({ ...baseInput, textOverrides: null, styleOverrides: { borderRadius: 12.5 } });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.styleOverrides).toMatch(/integer/i);
  });

  it("accepts textOverride at exactly 120 chars", () => {
    const r = validateBundle({
      ...baseInput,
      textOverrides: { "bundle.totalLabel": "x".repeat(120) },
      styleOverrides: null,
    });
    expect(r.valid).toBe(true);
  });
});
