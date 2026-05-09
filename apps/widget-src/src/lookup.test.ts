import { describe, it, expect } from "vitest";
import { lookupBundle, lookupQb, lookupMixMatch } from "./lookup";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#000",
  textColor: "#000",
  backgroundColor: "#fff",
  borderRadius: 8,
  fontFamily: "inherit",
  bundleHeadline: "x",
  qbHeadline: "y",
  showCompareAtPrice: true,
  currency: "USD",
  locale: "en",
};

const CONFIG: WidgetConfig = {
  shop: "s.myshopify.com",
  settings: SETTINGS,
  bundles: [
    {
      id: "b1",
      name: "Classic bundle",
      mode: "classic",
      products: [],
      collectionId: null,
      targetQty: null,
      collectionProducts: null,
      discountType: "percentage",
      discountValue: 10,
      combinable: false,
      triggerProductIds: [],
      headline: null,
      ctaLabel: null,
      styleOverrides: null,
      textOverrides: null,
    },
    {
      id: "b2",
      name: "Mix match bundle",
      mode: "mix_match",
      products: [],
      collectionId: "c1",
      targetQty: 3,
      collectionProducts: null,
      discountType: "percentage",
      discountValue: 20,
      combinable: false,
      triggerProductIds: [],
      headline: null,
      ctaLabel: null,
      styleOverrides: null,
      textOverrides: null,
    },
  ],
  quantityBreaks: [
    {
      id: "q1",
      name: "QB",
      productId: "gid://shopify/Product/1",
      productTitle: "P1",
      productImage: null,
      productVariants: [],
      tiers: [],
      combinable: false,
      styleOverrides: null,
      textOverrides: null,
      headline: null,
      ctaLabel: null,
    },
  ],
};

describe("lookupBundle", () => {
  it("returns matching classic bundle by id", () => {
    expect(lookupBundle(CONFIG, "b1")?.id).toBe("b1");
  });
  it("returns null when id not found", () => {
    expect(lookupBundle(CONFIG, "nonexistent")).toBeNull();
  });
  it("returns null when found id is mix-match mode (cross-mode safety)", () => {
    expect(lookupBundle(CONFIG, "b2")).toBeNull();
  });
});

describe("lookupQb", () => {
  it("returns matching QB by id", () => {
    expect(lookupQb(CONFIG, "q1")?.id).toBe("q1");
  });
  it("returns null when id not found", () => {
    expect(lookupQb(CONFIG, "nonexistent")).toBeNull();
  });
});

describe("lookupMixMatch", () => {
  it("returns matching mix-match bundle by id", () => {
    expect(lookupMixMatch(CONFIG, "b2")?.id).toBe("b2");
  });
  it("returns null when id not found", () => {
    expect(lookupMixMatch(CONFIG, "nonexistent")).toBeNull();
  });
  it("returns null when found id is classic mode (cross-mode safety)", () => {
    expect(lookupMixMatch(CONFIG, "b1")).toBeNull();
  });
});
