// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderMixMatch } from "./render-mix-match";
import type { BundleConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const MM: BundleConfig = {
  id: "mm1", name: "Mix3", mode: "mix_match",
  products: [], collectionId: "gid://shopify/Collection/1", targetQty: 3,
  collectionProducts: [
    { productId: "p1", variantId: "v1", title: "Tee Black", image: null, available: true, priceCents: 2400 },
    { productId: "p2", variantId: "v2", title: "Tee White", image: null, available: true, priceCents: 2400 },
    { productId: "p3", variantId: "v3", title: "Tee Olive", image: null, available: true, priceCents: 2400 },
    { productId: "p4", variantId: "v4", title: "Tee Navy",  image: null, available: true, priceCents: 2400 },
  ],
  discountType: "percentage", discountValue: 20, combinable: false,
  triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null,
};

describe("renderMixMatch", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders the collection grid and a disabled CTA initially", () => {
    renderMixMatch(mount, MM, CONFIG);
    expect(mount.querySelectorAll(".pumper-mm-item").length).toBe(4);
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("clicking up to targetQty enables CTA; further clicks rejected", () => {
    renderMixMatch(mount, MM, CONFIG);
    const items = mount.querySelectorAll<HTMLElement>("[data-action=toggle-mm-item]");
    items[0]!.click(); items[1]!.click(); items[2]!.click();
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    items[3]!.click(); // 4th selection should not be allowed (targetQty exact)
    const checked = mount.querySelectorAll(".pumper-mm-item--selected");
    expect(checked.length).toBe(3);
  });

  it("clicking a selected item deselects it", () => {
    renderMixMatch(mount, MM, CONFIG);
    const item0 = mount.querySelector<HTMLElement>("[data-action=toggle-mm-item][data-product-index='0']")!;
    item0.click(); item0.click();
    expect(mount.querySelectorAll(".pumper-mm-item--selected").length).toBe(0);
  });

  it("hides widget when fewer than targetQty items are available", () => {
    const mm: BundleConfig = { ...MM, collectionProducts: MM.collectionProducts!.slice(0, 2) };
    renderMixMatch(mount, mm, CONFIG);
    // Has fewer products than targetQty (3) — widget shows insufficient stock state
    expect(mount.textContent).toMatch(/Not enough/i);
  });
});
