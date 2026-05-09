import { describe, it, expect } from "vitest";
import { buildPreviewBundleConfig, buildPreviewQbConfig, defaultMockProduct, defaultPreviewSettings } from "../app/lib/preview-config";

describe("buildPreviewBundleConfig", () => {
  it("wraps a single classic bundle in a WidgetConfig", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s.myshopify.com",
      mockProduct: defaultMockProduct(),
      settings: defaultPreviewSettings(),
      bundle: {
        id: "preview",
        name: "preview",
        mode: "classic",
        products: [
          { productId: "gid://shopify/Product/1", variantId: "v1", qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
          { productId: "gid://shopify/Product/2", variantId: "v2", qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
        ],
        collectionId: null, targetQty: null, collectionProducts: null,
        discountType: "percentage", discountValue: 10, combinable: false,
        triggerProductIds: ["gid://shopify/Product/1"],
        headline: null, ctaLabel: null, styleOverrides: null, textOverrides: null,
      },
    });
    expect(cfg.bundles[0]?.id).toBe("preview");
    expect(cfg.bundles[0]?.mode).toBe("classic");
    expect(cfg.quantityBreaks).toEqual([]);
  });

  it("wraps a mix_match bundle with collectionProducts", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s.myshopify.com",
      mockProduct: { productId: "gid://shopify/Product/9", title: "Demo", priceCents: 100 },
      settings: defaultPreviewSettings(),
      bundle: {
        id: "preview", name: "preview", mode: "mix_match",
        products: [],
        collectionId: "gid://shopify/Collection/1", targetQty: 3,
        collectionProducts: [
          { productId: "gid://shopify/Product/9", variantId: "v9", title: "Demo", image: null, available: true, priceCents: 100 },
        ],
        discountType: "percentage", discountValue: 20, combinable: false,
        triggerProductIds: ["gid://shopify/Product/9"],
        headline: null, ctaLabel: null, styleOverrides: null, textOverrides: null,
      },
    });
    expect(cfg.bundles[0]?.collectionProducts?.length).toBe(1);
  });
});

describe("buildPreviewBundleConfig with overrides", () => {
  it("passes textOverrides through unchanged", () => {
    const cfg = buildPreviewBundleConfig({
      shop: "s",
      mockProduct: { productId: "p", title: "T", priceCents: 100 },
      settings: defaultPreviewSettings(),
      bundle: {
        id: "b1",
        name: "n",
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
        styleOverrides: { primaryColor: "#ABCDEF" },
        textOverrides: { "bundle.totalLabel": "X" },
      },
    });
    expect(cfg.bundles[0]!.textOverrides).toEqual({ "bundle.totalLabel": "X" });
    expect(cfg.bundles[0]!.styleOverrides).toEqual({ primaryColor: "#ABCDEF" });
  });
});

describe("buildPreviewQbConfig", () => {
  it("wraps a QB in a WidgetConfig", () => {
    const cfg = buildPreviewQbConfig({
      shop: "s.myshopify.com",
      mockProduct: { productId: "gid://shopify/Product/1", title: "Prod", priceCents: 1000 },
      settings: defaultPreviewSettings(),
      qb: {
        id: "preview", name: "preview", productId: "gid://shopify/Product/1",
        productTitle: "Prod", productImage: null,
        productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 1000 }],
        tiers: [
          { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, available: true },
          { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true, available: true },
        ],
        combinable: false, styleOverrides: null, textOverrides: null, headline: null, ctaLabel: null,
      },
    });
    expect(cfg.quantityBreaks[0]?.id).toBe("preview");
    expect(cfg.bundles).toEqual([]);
  });
});
