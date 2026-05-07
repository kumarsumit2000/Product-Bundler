import { describe, it, expect } from "vitest";
import { matchBundle, matchQb, matchMixMatch } from "./match";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A",
  textColor: "#1A1A1A",
  backgroundColor: "#FFFFFF",
  borderRadius: 8,
  fontFamily: "inherit",
  bundleHeadline: "Frequently bought together",
  qbHeadline: "Choose your savings",
  showCompareAtPrice: true,
  currency: "USD",
  locale: "en",
};

const CONFIG_BASE: WidgetConfig = {
  shop: "test.myshopify.com",
  settings: SETTINGS,
  bundles: [],
  quantityBreaks: [],
};

describe("matchBundle (classic)", () => {
  it("matches a classic bundle when productId is in triggerProductIds", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "b1", name: "B1", mode: "classic",
        products: [{ productId: "gid://shopify/Product/1", variantId: null, qty: 1, title: "P1", image: null, available: true, priceCents: 1000 }],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/1")?.id).toBe("b1");
  });

  it("falls back to bundle.products when triggerProductIds is empty", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "b1", name: "B1", mode: "classic",
        products: [
          { productId: "gid://shopify/Product/1", variantId: null, qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
          { productId: "gid://shopify/Product/2", variantId: null, qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
        ],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: [],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/2")?.id).toBe("b1");
  });

  it("returns null when no bundle matches", () => {
    expect(matchBundle(CONFIG_BASE, "gid://shopify/Product/999")).toBeNull();
  });

  it("ignores mix_match bundles", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [{ productId: "gid://shopify/Product/1", variantId: null, title: "", image: null, available: true, priceCents: 100 }],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchBundle(config, "gid://shopify/Product/1")).toBeNull();
  });
});

describe("matchQb", () => {
  it("matches QB by productId", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      quantityBreaks: [{
        id: "q1", name: "Q1", productId: "gid://shopify/Product/1",
        productTitle: "P1", productImage: null,
        productVariants: [{ variantId: "gid://shopify/ProductVariant/1", title: "Default", available: true, priceCents: 1000 }],
        tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true, available: true }],
        combinable: false, styleOverrides: null,
      }],
    };
    expect(matchQb(config, "gid://shopify/Product/1")?.id).toBe("q1");
  });

  it("returns null when no QB matches", () => {
    expect(matchQb(CONFIG_BASE, "gid://shopify/Product/x")).toBeNull();
  });
});

describe("matchMixMatch", () => {
  it("matches via triggerProductIds", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/7"],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchMixMatch(config, "gid://shopify/Product/7")?.id).toBe("mm1");
  });

  it("falls back to collectionProducts membership when triggerProductIds is empty", () => {
    const config: WidgetConfig = {
      ...CONFIG_BASE,
      bundles: [{
        id: "mm1", name: "MM", mode: "mix_match",
        products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [{ productId: "gid://shopify/Product/8", variantId: null, title: "", image: null, available: true, priceCents: 100 }],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: [],
        headline: null, ctaLabel: null, styleOverrides: null,
      }],
    };
    expect(matchMixMatch(config, "gid://shopify/Product/8")?.id).toBe("mm1");
  });

  it("returns null otherwise", () => {
    expect(matchMixMatch(CONFIG_BASE, "gid://shopify/Product/x")).toBeNull();
  });
});
