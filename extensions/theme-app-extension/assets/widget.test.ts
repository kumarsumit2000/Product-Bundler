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
  bundles: [{
    id: "b1", name: "B1", mode: "classic",
    products: [
      { productId: "gid://shopify/Product/1", variantId: "v1", qty: 1, title: "P1", image: null, available: true, priceCents: 1000 },
      { productId: "gid://shopify/Product/2", variantId: "v2", qty: 1, title: "P2", image: null, available: true, priceCents: 1000 },
    ],
    collectionId: null, targetQty: null, collectionProducts: null,
    discountType: "percentage", discountValue: 10, combinable: false,
    triggerProductIds: ["gid://shopify/Product/1"],
    headline: null, ctaLabel: null, styleOverrides: null,
  }],
  quantityBreaks: [],
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
});
