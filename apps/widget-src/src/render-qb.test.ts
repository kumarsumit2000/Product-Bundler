// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderQb } from "./render-qb";
import type { QbConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const QB: QbConfig = {
  id: "q1", name: "Q1", productId: "p1",
  productTitle: "Snowboard", productImage: null,
  productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 72995 }],
  tiers: [
    { qty: 1, discountType: "percentage", discountValue: 0,  label: "Buy 1", isMostPopular: false, available: true },
    { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true,  available: true },
    { qty: 3, discountType: "percentage", discountValue: 15, label: "15% off", isMostPopular: false, available: true },
  ],
  combinable: false, styleOverrides: null, textOverrides: null, headline: null, ctaLabel: null,
};

describe("renderQb", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders all tiers, marks MOST POPULAR, and selects most-popular tier by default", () => {
    renderQb(mount, QB, CONFIG);
    const rows = mount.querySelectorAll(".pumper-qb-tier");
    expect(rows.length).toBe(3);
    expect(mount.querySelector(".pumper-qb-popular-badge")?.textContent ?? "").toContain("MOST POPULAR");
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("1");
  });

  it("clicking another tier re-renders with that tier selected", () => {
    renderQb(mount, QB, CONFIG);
    const tier3 = mount.querySelector("[data-tier-index='2']") as HTMLElement;
    tier3.click();
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("2");
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta?.textContent ?? "").toMatch(/3/);
  });

  it("disables unavailable tier rows", () => {
    const q: QbConfig = { ...QB, tiers: [QB.tiers[0]!, QB.tiers[1]!, { ...QB.tiers[2]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.querySelector("[data-tier-index='2']")?.classList.contains("pumper-qb-tier--unavailable")).toBe(true);
  });

  it("hides widget if all variants unavailable", () => {
    const q: QbConfig = { ...QB, productVariants: [{ ...QB.productVariants[0]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.innerHTML).toBe("");
  });

  it("renders gift badge when freeGiftVariantId is set + available", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Free Hat/);
  });

  it("renders bogo nth_free badge with paidQty hint", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, qty: 3, bogo: { mode: "nth_free", bonusQty: 1 } as const },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Buy 3, pay for 2/);
  });

  it("stacks gift + bogo badges when both set on a tier", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      {
        ...QB.tiers[1]!,
        freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true,
        bogo: { mode: "add_same", targetVariantId: "v8", bonusQty: 1, targetAvailable: true } as const,
      },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const badges = mount.querySelectorAll(".pumper-qb-gift-badge");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows muted unavailable badge when gift is OOS", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: false },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.querySelector(".pumper-qb-gift-badge--unavailable")).not.toBeNull();
  });

  it("renders override for qb.mostPopular when set", () => {
    const el = document.createElement("div");
    const q: QbConfig = {
      ...QB,
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: { "qb.mostPopular": "Best value" },
    };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("Best value");
    expect(el.innerHTML).not.toContain("MOST POPULAR");
  });

  it("falls back to default qb.mostPopular when override absent", () => {
    const el = document.createElement("div");
    const q: QbConfig = {
      ...QB,
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: null,
    };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("MOST POPULAR");
  });

  it("uses qb.headline column when set", () => {
    const el = document.createElement("div");
    const q: QbConfig = { ...QB, headline: "Volume savings", textOverrides: null };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("Volume savings");
  });
});
