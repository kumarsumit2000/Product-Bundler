// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderBundle } from "./render-bundle";
import type { BundleConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const BUNDLE: BundleConfig = {
  id: "b1", name: "Bundle 1", mode: "classic",
  products: [
    { productId: "p1", variantId: "v1", qty: 1, title: "Snowboard", image: null, available: true, priceCents: 72995 },
    { productId: "p2", variantId: "v2", qty: 1, title: "Bindings", image: null, available: true, priceCents: 62995 },
  ],
  collectionId: null, targetQty: null, collectionProducts: null,
  discountType: "percentage", discountValue: 10, combinable: false,
  triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null, textOverrides: null,
};

describe("renderBundle", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders heading + each product row + CTA", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    expect(mount.querySelector(".pumper-bundle-heading")?.textContent).toContain("Frequently bought together");
    expect(mount.querySelectorAll(".pumper-bundle-row").length).toBe(2);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta).not.toBeNull();
    expect(cta?.textContent ?? "").toMatch(/Add bundle to cart/);
  });

  it("shows OOS badge when one product is unavailable + disables CTA", () => {
    const b: BundleConfig = { ...BUNDLE, products: [
      { ...BUNDLE.products[0]!, available: false },
      BUNDLE.products[1]!,
    ]};
    renderBundle(mount, b, CONFIG);
    expect(mount.querySelector(".pumper-oos-badge")).not.toBeNull();
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("clears mount and returns when all products are OOS (hide widget)", () => {
    const b: BundleConfig = { ...BUNDLE, products: BUNDLE.products.map((p) => ({ ...p, available: false })) };
    renderBundle(mount, b, CONFIG);
    expect(mount.innerHTML).toBe("");
    expect(mount.style.minHeight).toBe("");
  });

  it("renders savings inside the CTA label", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    // savings = 10% of (72995 + 62995) = 13599 cents
    expect((cta?.textContent ?? "").toLowerCase()).toMatch(/save/);
  });
});
