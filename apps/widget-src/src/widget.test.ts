// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initWidget } from "./widget";
import type { WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};

const CONFIG: WidgetConfig = {
  shop: "test.myshopify.com",
  settings: SETTINGS,
  bundles: [
    {
      id: "b1", name: "B1", mode: "classic",
      products: [
        { productId: "gid://shopify/Product/1", variantId: "v1", qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
        { productId: "gid://shopify/Product/2", variantId: "v2", qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
      ],
      collectionId: null, targetQty: null, collectionProducts: null,
      discountType: "percentage", discountValue: 10, combinable: false,
      triggerProductIds: ["gid://shopify/Product/1"],
      headline: null, ctaLabel: null, styleOverrides: null,
    },
    {
      id: "b2", name: "B2 Mix Match", mode: "mix_match",
      products: [],
      collectionId: "c1", targetQty: 3, collectionProducts: null,
      discountType: "percentage", discountValue: 20, combinable: false,
      triggerProductIds: [],
      headline: null, ctaLabel: null, styleOverrides: null,
    },
  ],
  quantityBreaks: [
    {
      id: "q1", name: "QB1",
      productId: "gid://shopify/Product/10",
      productTitle: "Product 10",
      productImage: null,
      productVariants: [
        { variantId: "gid://shopify/ProductVariant/100", title: "Default", available: true, priceCents: 2000 },
      ],
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 0,  label: "1x",      isMostPopular: false, available: true },
        { qty: 2, discountType: "percentage", discountValue: 10, label: "10% OFF",  isMostPopular: true,  available: true },
      ],
      combinable: false,
      styleOverrides: null,
    },
  ],
};

describe("widget init", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (window as any)._pumperPreview = true;
    (window as any)._pumperPreviewConfig = CONFIG;
  });
  afterEach(() => {
    delete (window as any)._pumperPreview;
    delete (window as any)._pumperPreviewConfig;
  });

  it("renders bundle when mount has matching productId", async () => {
    const mount = document.createElement("div");
    mount.className = "pumper-mount";
    mount.dataset.pumperType = "bundle";
    mount.dataset.productId = "1";
    mount.dataset.shop = "test.myshopify.com";
    document.body.appendChild(mount);

    await initWidget();

    expect(mount.querySelector(".pumper-bundle")).not.toBeNull();
    expect(mount.dataset.pumperRendered).toBe("1");
  });

  it("clears mount when no offer matches the productId", async () => {
    const mount = document.createElement("div");
    mount.className = "pumper-mount";
    mount.dataset.pumperType = "bundle";
    mount.dataset.productId = "999";
    mount.dataset.shop = "test.myshopify.com";
    document.body.appendChild(mount);

    await initWidget();

    expect(mount.innerHTML).toBe("");
  });

  it("renders a classic bundle from data-pumper-bundle shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="b1"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders a QB from data-pumper-qb shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-qb="q1"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders a mix-match from data-pumper-mix-match shortcode", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-mix-match="b2"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
  });

  it("empties shortcode element when id is unknown but still marks pumper-rendered", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="nonexistent"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML).toBe("");
  });

  it("cross-mode: data-pumper-bundle for a mix-match-mode entity renders empty", async () => {
    document.body.innerHTML = `<div id="sc" data-pumper-bundle="b2"></div>`;
    await initWidget();
    const el = document.getElementById("sc")!;
    expect(el.dataset.pumperRendered).toBe("1");
    expect(el.innerHTML).toBe("");
  });
});
